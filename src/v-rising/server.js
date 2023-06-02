import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {EventEmitter} from 'events';
import {logger} from "../logger.js";
import {VRisingPlayerManager} from "./players.js";
import lodash from "lodash";
import {sendDiscordMessage} from "../discord/index.js";
import {VRisingRConClient} from "./rcon.js";
import {startVRisingServerExecution, stopVRisingServerExecution} from "./bin.js";
import {sleep} from "./utils.js";
import {getGameSettings, getHostSettings, writeGameSettings, writeHostSettings} from "./settings.js";
import {getAdminList, getBanList, writeAdminList, writeBanList} from "./users.js";
import {VRisingSaveManager} from "./autosave.js";
import {VRisingServerApiClient} from "./metrics/api.js";
import {LogWatcher} from "./logs.js";
import {VRisingSteamQuery} from "./steam/query.js";

dayjs.extend(utc);

/**
 * VRising Server class
 * @typedef {Object} ServerInfo
 */
export class VRisingServer extends EventEmitter {
    constructor() {
        super();
        this.serverInfo = {
            serverName: null,
            saveName: null,
            time: null,
            version: null,
            steamID: null,
            appID: null,
            connectedToSteam: false,
            serverSetupComplete: false,
            loadedSaveGameVersion: null,
            currentGameVersion: null,
            isSaveLoaded: false,
            isSaveVersionIdentical: null,
            pid: null,
            processExitCode: null,
            scheduledOperation: null,
            currentSaveNumber: null,
            publicIp: null,
            gamePort: null,
            queryPort: null
        }

        this.serverProcess = null;

        this.messageMap = new Map();
        this.messageMap.set('restart', {
            name: () => 'Redémarrage',
            notifyStart: ({serverInfo}) => `Un redémarrage du serveur V Rising planifié par ${serverInfo.scheduledOperation.user.username} sera réalisé dans ${serverInfo.scheduledOperation.delayInMinutes} minute(s)`,
            notifyProgress: ({serverInfo}) => `Le serveur V Rising va être redémarré dans ${serverInfo.scheduledOperation.remainingTime / 60000} minute(s) !`,
            notifyExecution: () => `Le redémarrage du serveur V Rising débute !`,
            notifyDone: ({serverInfo}) => `Le serveur V Rising a redémarré. Son nouveau SteamID est ${serverInfo.steamID}.`
        });

        this.messageMap.set('stop', {
            name: () => 'Arrêt',
            notifyStart: ({serverInfo}) => `Un arrêt du serveur V Rising planifié par ${serverInfo.scheduledOperation.user.username} sera réalisé dans ${serverInfo.scheduledOperation.delayInMinutes} minute(s)`,
            notifyProgress: ({serverInfo}) => `Le serveur V Rising va être arrêté dans ${serverInfo.scheduledOperation.remainingTime / 60000} minutes !`,
            notifyExecution: () => `Le serveur V Rising est en train d'être arrêté !`,
            notifyDone: () => `Le serveur V Rising a été arrêté !`
        });

        this.messageMap.set('start', {
            name: () => 'Démarrage',
            notifyDone: ({serverInfo}) => `Le serveur V Rising viens de démarrer. Son SteamID est ${serverInfo.steamID}.`
        });

        this.messageMap.set('force-stop', {
            name: () => 'Arrêt immédiat',
            notifyDone: () => `Le serveur V Rising viens d'être arrêté.`
        });

        this.messageMap.set('stop-operation', {
            notify: ({serverInfo}) => `L'opération ${this.messageMap.get(serverInfo.scheduledOperation.type).name()} a été annulée.`
        });

        this.messageMap.set('restore-backup', {
            name: () => 'Restauration de sauvegarde',
            notifyStart: ({serverInfo}) => `Une restauration de sauvegarde du serveur V Rising planifié par ${serverInfo.scheduledOperation.user.username} sera réalisé dans ${serverInfo.scheduledOperation.delayInMinutes} minute(s)`,
            notifyProgress: ({serverInfo}) => `Le serveur V Rising va être redémarré dans ${serverInfo.scheduledOperation.remainingTime / 60000} minute(s) !`,
            notifyExecution: () => `Le redémarrage du serveur V Rising débute !`,
            notifyDone: ({serverInfo}) => `Le serveur V Rising a redémarré. Son nouveau SteamID est ${serverInfo.steamID}.`
        });

        this.config = null;
        this.logWatcher = null;
        this.hostSettings = {
            current: null,
            lastApplied: null
        };
        this.gameSettings = {
            current: null,
            lastApplied: null
        };

        this.adminList = {
            current: null,
            lastApplied: null
        };
        this.banList = {
            current: null,
            lastApplied: null
        };

        this.playerManager = new VRisingPlayerManager({logger});
        this.autoSaveManager = new VRisingSaveManager(this);
        this.apiClient = new VRisingServerApiClient(this.config);
        this.rConClient = new VRisingRConClient();
        this.steamQuery = new VRisingSteamQuery(this);

        this.regexpArray = [
            {
                regex: /Bootstrap - Time: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}), Version: (.*)/g,
                parse: async ([, timeStr, version]) => {
                    this._updateServerInfo({
                        version,
                        time: dayjs.utc(timeStr, 'YYYY-MM-DD HH:mm:ss').toDate()
                    });
                }
            },
            {
                regex: /Setting breakpad minidump AppID = (\d*)/g,
                parse: async ([, appId]) => {
                    this._updateServerInfo({
                        appID: appId
                    })
                }
            },
            {
                regex: /SteamPlatformSystem - OnPolicyResponse - Game server SteamID: ([0-9]+)/g,
                parse: async ([, steamId]) => {
                    this._updateServerInfo({
                        steamID: steamId
                    });
                }
            },
            {
                regex: /SteamPlatformSystem - OnPolicyResponse - Public IP: ([0-9]{1,3}.*)/g,
                parse: ([, publicIp]) => {
                    this._updateServerInfo({
                        publicIp
                    })
                }
            },
            {
                regex: /SteamPlatformSystem - Server connected to Steam successfully!/g,
                parse: () => {
                    this._updateServerInfo({
                        connectedToSteam: true
                    });
                }
            },
            {
                regex: /Server Setup Complete/g,
                parse: () => {
                    this.setSetupComplete();
                }
            },
            {
                regex: /PersistenceV2 - GameVersion of Loaded Save: (.*), Current GameVersion: (.*)/g,
                parse: async ([, loadedSaveGameVersion, currentGameVersion]) => {
                    this._updateServerInfo({
                        loadedSaveGameVersion,
                        currentGameVersion,
                        isSaveLoaded: true,
                        isSaveVersionIdentical: loadedSaveGameVersion === currentGameVersion
                    });
                }
            },
            {
                regex: /PersistenceV2 - Finished Saving to '.*AutoSave_(\d*)\.(save|save\.gz)'/g,
                parse: async ([, autoSaveNumber, extension]) => {
                    autoSaveNumber = parseInt(autoSaveNumber);
                    logger.info('AutoSave %d detected !', autoSaveNumber);
                    this.parseLoadedSave(autoSaveNumber, extension, true);
                }
            },
            {
                regex: /Loaded Save:AutoSave_(\d*)\.(save|save\.gz)/g,
                parse: async ([, saveNumber, extension]) => {
                    saveNumber = parseInt(saveNumber);
                    logger.debug('(Server) Save %d loaded with extension %s !', saveNumber, extension);
                    this.parseLoadedSave(saveNumber, extension, false);
                }
            },
            {
                regex: /HttpService - Receive Thread started./g,
                parse: () => {
                    this.apiClient.startPollingMetrics();
                }
            },
            {
                regex: /\[rcon] Started listening on (.*), Password is: "(.*)"/g,
                parse: ([, , password]) => {
                    this.enableRConClient(password);
                }
            }
        ]
    }

    getConfig() {
        return this.config;
    }

    enableRConClient(password) {
        const {Rcon: serverConfig} = this.hostSettings.current ? this.hostSettings.current : {};
        const {rcon: apiConfig} = this.config;

        if (!password) {
            if (serverConfig && serverConfig.Password) {
                password = serverConfig.Password;
            } else {
                password = apiConfig.password;
            }
        }

        const config = {
            enabled: true,
            host: apiConfig.host || 'localhost',
            port: serverConfig ? serverConfig.Port : apiConfig.port,
            password
        };

        this.rConClient.setConfig(config);
    }

    setConfig(config) {
        this.config = config;
        this.apiClient.updateOptions(config.server.api);
        this._updateServerInfo({
            serverName: config.server.name,
            saveName: config.server.saveName,
            gamePort: config.server.gamePort,
            queryPort: config.server.queryPort
        });
    }

    _updateServerInfo(data) {
        this.serverInfo = {
            ...this.serverInfo,
            ...data
        };

        logger.debug('New Server Info %j', this.serverInfo);
        this.emit('server_info', this.serverInfo);
        return this.serverInfo;
    }

    setSetupComplete() {
        this._updateServerInfo({
            serverSetupComplete: true
        });
        logger.debug('VRising server setup is complete !');
        this.emit('ready', this.serverInfo);
    }

    getServerInfo() {
        return this.serverInfo;
    }

    clearServerInfo() {
        return this._updateServerInfo({
            time: null,
            version: null,
            steamID: null,
            appID: null,
            connectedToSteam: false,
            serverSetupComplete: false,
            loadedSaveGameVersion: null,
            currentGameVersion: null,
            isSaveLoaded: false,
            isSaveVersionIdentical: null
        });
    }

    async listenToServerProcess() {
        if (!this.serverProcess) return null;

        const pid = await this.retrieveProcessPid();

        this._updateServerInfo({
            pid,
            processExitCode: null
        });


        this.serverProcess.on('exit', (code) => {
            this.emit('server_process_closed', code);
            this._updateServerInfo({
                time: null,
                version: null,
                steamID: null,
                appID: null,
                connectedToSteam: false,
                serverSetupComplete: false,
                loadedSaveGameVersion: null,
                currentGameVersion: null,
                isSaveLoaded: false,
                isSaveVersionIdentical: null,
                pid: null,
                processExitCode: code
            });
        });
    }

    async retrieveProcessPid() {
        return this.serverProcess ? this.serverProcess.pid : null;
    }

    /**
     * Schedule a server stop
     * @param delay in minutes
     * @param user doing the operation
     * @returns {ServerInfo}
     */
    async scheduleStop(delay, user) {
        if (!this.isRunning()) return this.serverInfo;
        return this.scheduleOperation('stop', delay, user);
    }

    /**
     * Schedule a server restart
     * @param delay in minutes
     * @param user doing the operation
     * @returns {ServerInfo}
     */
    async scheduleRestart(delay, user) {
        return this.scheduleOperation('restart', delay, user);
    }

    async scheduleRestoreBackup(delay, fileName, user) {
        return this.scheduleOperation('restore-backup', delay, user, {fileName});
    }

    /**
     * Schedule an operation in a delay
     * @param type restart, stop
     * @param delay the delay in minutes
     * @param user doing the operation
     * @param options option for the operation
     * @returns {Promise<{ServerInfo}>}
     */
    async scheduleOperation(type, delay, user, options = {}) {
        if (type !== 'restart' && type !== 'stop' && type !== 'restore-backup') {
            throw new Error(`Unknown operation type ${type}. Expected values (restart, stop, restore-backup)`)
        }

        if (this.serverInfo.scheduledOperation) {
            return this.serverInfo;
        }

        this.serverInfo.scheduledOperation = {
            user,
            type,
            delayInMinutes: delay,
            totalDelay: delay * 60000,
            remainingTime: delay * 60000,
            executionTime: dayjs().add(delay, 'minute').toDate(),
            options
        };

        logger.info('Scheduling server %s in %d minutes', type, delay);
        this.interval = setInterval(async () => {
            this.serverInfo.scheduledOperation.remainingTime -= 60000;

            if (this.serverInfo.scheduledOperation.remainingTime <= 0) {
                this.serverInfo.scheduledOperation.remainingTime = 0;
                clearInterval(this.interval);
                // Execute scheduled operation
                const executionMessage = this.messageMap.get(type).notifyExecution(this);
                await this.rConClient.sendAnnounceToVRisingServer(executionMessage);
                this.emit('operation_execute', this.serverInfo);

                try {
                    logger.info('Scheduled stop of the server');
                    await this.stopServer();
                } catch (err) {
                    logger.error('Error stopping VRising server : %s', err.message);
                    await sendDiscordMessage(`Une erreur s'est produite lors de l'arrêt du serveur !`);
                    this.emit('operation_error', err);
                    return;
                }

                if (type === 'restore-backup') {
                    const {fileName} = options;
                    const restoreSuccess = await this.autoSaveManager.restoreBackup(this.config, fileName, this.hostSettings.current.CompressSaveFiles, this.serverInfo.currentSaveNumber);

                    if (!restoreSuccess) {
                        logger.info('The file restoration did not end well...');
                    }
                }

                if (type === 'restart' || type === 'restore-backup') {
                    try {
                        logger.debug('Waiting after server stop');
                        await sleep(5000);
                        logger.info('Scheduled restarting VRising server');
                        await this.startServer();
                    } catch (err) {
                        logger.error('Error starting VRising server: %s', err.message);
                        await sendDiscordMessage(`Une erreur s'est produite au démarrage du serveur VRising !`);
                        this.emit('operation_error', err);
                        return;
                    }
                }

                const doneMessage = this.messageMap.get(type).notifyDone(this);
                await sendDiscordMessage(doneMessage);
                this.serverInfo.scheduledOperation = null;
                this.emit('operation_done', this.serverInfo);
            } else {
                // Notify scheduled operation progress
                const progressMessage = this.messageMap.get(type).notifyProgress(this);
                if (type === 'restart') {
                    await this.rConClient.sendRestartAnnounceToVRisingServer(delay);
                } else if (type === 'stop') {
                    await this.rConClient.sendAnnounceToVRisingServer(progressMessage);
                }
                this.emit('operation_progress', this.serverInfo);
            }
        }, 60000);

        // Notify start
        const startMessage = this.messageMap.get(type).notifyStart(this);

        await sendDiscordMessage(startMessage);
        if (type === 'restart') {
            await this.rConClient.sendRestartAnnounceToVRisingServer(delay);
        } else if (type === 'stop') {
            await this.rConClient.sendAnnounceToVRisingServer(startMessage);
        }

        this.emit('operation_start', this.serverInfo);

        return this.serverInfo;
    }

    /**
     * Stop the scheduled operation
     * @param user doing the operation
     * @returns {ServerInfo}
     */
    async stopScheduledOperation(user) {
        if (!this.interval) return this.serverInfo;
        const message = this.messageMap.get('stop-operation').notify(this);

        await sendDiscordMessage(message);

        this.serverInfo.scheduledOperation = null;
        clearInterval(this.interval);

        return this.serverInfo;
    }

    isRunning() {
        return this.serverInfo.pid !== null;
    }

    async onServerHostSettings(isInitialLoad = false, settings = null) {
        if (!settings) {
            settings = await getHostSettings(this.config);
        }

        if (isInitialLoad) {
            this.hostSettings.lastApplied = {...settings};
        }

        this.hostSettings.current = {...settings};

        this.emit('loaded_host_settings', this.hostSettings);
        this.apiClient.updateApiConfig(settings.API);
    }

    async onServerGameSettings(isInitialLoad = false, settings = null) {
        if (!settings) {
            settings = await getGameSettings(this.config);
        }

        if (isInitialLoad) {
            this.gameSettings.lastApplied = {...settings};
        }

        this.gameSettings.current = {...settings};

        this.emit('loaded_game_settings', this.gameSettings);
    }

    async onAdminList(isInitialLoad = false, adminList = null) {
        if (!adminList) {
            adminList = await getAdminList(this.config);
        }

        if (isInitialLoad) {
            this.adminList.lastApplied = [...adminList];
        }

        this.adminList.current = [...adminList];

        this.emit('loaded_admin_list', this.adminList);

        await this.playerManager.parseAdminList(this.adminList.current);
    }

    async onBanList(isInitialLoad = false, banList = null) {
        if (!banList) {
            banList = await getBanList(this.config);
        }

        if (isInitialLoad) {
            this.banList.lastApplied = [...banList];
        }

        this.banList.current = [...banList];

        this.emit('loaded_ban_list', this.banList);
        await this.playerManager.parseBanList(this.banList.current);
    }

    async startServer(config = null, sendMessage = false) {
        if (config) {
            this.config = config;
            this.apiClient.updateOptions(config.server.api);
        }

        await this.onServerHostSettings(true);
        await this.onServerGameSettings(true);
        await this.onAdminList(true);
        await this.onBanList(true);

        await startVRisingServerExecution(this.config, this);

        this.emit('server_started', {
            serverInfo: this.serverInfo,
            hostSettings: this.hostSettings,
            gameSettings: this.gameSettings,
            adminList: this.adminList,
            banList: this.banList
        });

        if (sendMessage) {
            const message = this.messageMap.get('start').notifyDone(this);
            await sendDiscordMessage(message);
        }

        this.apiClient.startPollingMetrics();
        return this.serverInfo;
    }

    async stopServer(sendMessage = false) {
        if (!this.isRunning()) return this.serverInfo;
        this.apiClient.stopPollingMetrics();
        await this.rConClient.disconnect();
        await stopVRisingServerExecution(this);

        this.emit('server_stopped', {
            serverInfo: this.serverInfo,
            hostSettings: this.hostSettings,
            gameSettings: this.gameSettings,
            adminList: this.adminList,
            banList: this.banList
        });

        if (sendMessage) {
            const message = this.messageMap.get('force-stop').notifyDone(this);
            await sendDiscordMessage(message);
        }

        return this.serverInfo;
    }

    async changeHostSettings(settings) {
        if (!lodash.isEqual(settings, this.hostSettings.current)) {
            await writeHostSettings(this.config, settings);
            this.hostSettings.current = settings;
            this.emit('changed_host_settings', this.hostSettings);
        }
        return this.hostSettings;
    }

    async changeGameSettings(settings) {
        if (!lodash.isEqual(settings, this.gameSettings.current)) {
            await writeGameSettings(this.config, settings);
            this.gameSettings.current = settings;
            this.emit('changed_game_settings', this.gameSettings);
        }
        return this.gameSettings;
    }

    async changeAdminList(adminList) {
        if (!lodash.isEqual(adminList, this.adminList)) {
            await writeAdminList(this.config, adminList);
            this.adminList.current = adminList;
            this.emit('changed_admin_list', this.adminList);
            await this.playerManager.parseAdminList(adminList);
        }

        return this.adminList;
    }

    async changeBanList(banList) {
        if (!lodash.isEqual(banList, this.banList)) {
            await writeBanList(this.config, banList);
            this.banList.current = banList;
            this.emit('changed_ban_list', this.banList);
            await this.playerManager.parseBanList(banList);
        }

        return this.banList;
    }

    parseLoadedSave(saveNumber, extension, isAutoSave) {
        if (this.serverInfo.currentSaveNumber !== saveNumber) {
            this._updateServerInfo({
                currentSaveNumber: saveNumber
            });

            if (this.config && this.config.server && this.config.server.dataPath) {
                this.emit(isAutoSave ? 'auto_save' : 'loaded_save', {
                    config: this.config,
                    saveNumber,
                    extension
                });
            }
        }
    }

    async parseLogLine(line) {
        const newLine = line.replace(/\r?\n/g, '\n');
        for (const {regex, parse} of this.regexpArray) {
            const matches = regex.exec(newLine);
            if (matches && matches.length > 0) {
                await parse(matches, line);
            }
            regex.lastIndex = 0;
        }

        await this.playerManager.parseLogLine(newLine);
    }

    startWatchingLogFile() {
        if (this.logWatcher) {
            if (!this.logWatcher.isWatching) {
                this.logWatcher.resumeWatching();
            }
        } else {
            this.logWatcher = new LogWatcher(this, this.config.server.logFile);
            this.logWatcher.watchLogFile().catch(err => logger.error('Error watching log file: %s', err.message));
        }
    }

    stopWatchingLogFile() {
        if (this.logWatcher && this.logWatcher.isWatching) {
            this.logWatcher.stopWatching();
        }
    }
}

export const vRisingServer = new VRisingServer();
