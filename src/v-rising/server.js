import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {EventEmitter, once} from 'events';
import {logger} from "../logger.js";
import {VRisingPlayerManager} from "./managers/player-manager.js";
import lodash from "lodash";
import {VRisingRConClient} from "./managers/rcon-client.js";
import {VRisingProcess} from "./managers/process-manager.js";
import {sleep} from "./utils.js";
import {VRisingSettingsManager} from "./managers/settings-manager.js";
import {VRisingUserManager} from "./managers/user-manager.js";
import {VRisingSaveManager} from "./managers/save-manager.js";
import {VRisingServerApiClient} from "./metrics/api.js";
import {LogWatcher} from "./managers/log-watcher.js";
import {VRisingSteamQuery} from "./steam/query.js";
import {VRisingOperationManager} from "./operations/operation-manager.js";

dayjs.extend(utc);

/**
 * VRising Server class
 * @typedef {Object} ServerInfo
 */
export class VRisingServer extends EventEmitter {
    constructor(config, discordBot) {
        super();
        this.discordBot = discordBot;
        this.serverInfo = {
            serverName: config.server.name,
            saveName: config.server.saveName,
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
            processError: null,
            scheduledOperation: null,
            currentSaveNumber: null,
            currentSaveStartDate: null,
            publicIp: null,
            gamePort: config.server.gamePort,
            queryPort: config.server.queryPort
        };

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

        this.config = config;

        this.settingsManager = new VRisingSettingsManager(config, this);
        this.processManager = new VRisingProcess(this);
        this.playerManager = new VRisingPlayerManager(this);
        this.autoSaveManager = new VRisingSaveManager(config, this, this.settingsManager);
        this.apiClient = new VRisingServerApiClient(this);
        this.rConClient = new VRisingRConClient(config, this);
        this.steamQuery = new VRisingSteamQuery(this);
        this.userManager = new VRisingUserManager(this);
        this.logWatcher = new LogWatcher(this);
        this.operationManager = new VRisingOperationManager(this);

        this.autoSaveManager.on('parsed_start_date', (startDate) => this._updateServerInfo({
            currentSaveStartDate: startDate
        }))

        this.processManager.on('started', pid => this._updateServerInfo({
            pid,
            processExitCode: null,
            processError: null
        }));

        this.processManager.on('process_error', err => this._updateServerInfo({
            processError: err.message
        }));

        this.processManager.on('process_stopped', code => this._updateServerInfo({
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
        }));

        this.settingsManager.on('applied_host_settings', hostSettings => this._updateServerInfo({
            serverName: hostSettings.Name,
            saveName: hostSettings.SaveName,
            gamePort: hostSettings.Port,
            queryPort: hostSettings.QueryPort
        }))

        this.regexpArray = [
            {
                regex: /Bootstrap - Time: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}), Version: (.*)/g,
                parse: ([, timeStr, version]) => {
                    this._updateServerInfo({
                        version,
                        time: dayjs.utc(timeStr, 'YYYY-MM-DD HH:mm:ss').toDate()
                    });
                }
            },
            {
                regex: /Setting breakpad minidump AppID = (\d*)/g,
                parse: ([, appId]) => {
                    this._updateServerInfo({
                        appID: appId
                    })
                }
            },
            {
                regex: /SteamPlatformSystem - OnPolicyResponse - Game server SteamID: ([0-9]+)/g,
                parse: ([, steamId]) => {
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
                parse: ([, loadedSaveGameVersion, currentGameVersion]) => {
                    logger.debug('GameVersion of Loaded Save matched, server is running !');
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
                parse: ([, saveNumber, extension]) => {
                    saveNumber = parseInt(saveNumber);
                    logger.info('AutoSave %d detected !', saveNumber);
                    this.parseLoadedSave(saveNumber, extension, true);
                }
            },
            {
                regex: /Loaded Save:AutoSave_(\d*)\.(save|save\.gz)/g,
                parse: ([, saveNumber, extension]) => {
                    saveNumber = parseInt(saveNumber);
                    logger.debug('(Server) Save %d loaded with extension %s !', saveNumber, extension);
                    this.parseLoadedSave(saveNumber, extension, false);
                }
            },
            {
                regex: /HttpService - Receive Thread started./g,
                parse: () => {
                    logger.debug('Matched HttpService received thread started, start polling metrics using api');
                    this.emit('http_service_ready');
                }
            },
            {
                regex: /\[rcon] Started listening on (.*), Password is: "(.*)"/g,
                parse: ([, , password]) => {
                    this.emit('rcon_service_ready', password);
                }
            }
        ]
    }

    getConfig() {
        return this.config;
    }

    setConfig(config) {
        this.config = {...config};
        this.emit('config_updated', this.config);
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
        this.emit('ready', {
            serverInfo: this.getServerInfo(),
            ...this.settingsManager.getSettings(),
            ...this.userManager.getState()
        });
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
                    await this.discordBot.sendDiscordMessage(`Une erreur s'est produite lors de l'arrêt du serveur !`);
                    this.emit('operation_error', err);
                    return;
                }

                if (type === 'restore-backup') {
                    const {fileName} = options;
                    const restoreSuccess = await this.autoSaveManager.restoreBackup(
                        fileName,
                        this.settingsManager.getCurrentHostSettingByKey('CompressSaveFiles'),
                        this.serverInfo.currentSaveNumber
                    );

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
                        await this.discordBot.sendDiscordMessage(`Une erreur s'est produite au démarrage du serveur VRising !`);
                        this.emit('operation_error', err);
                        return;
                    }
                }

                const doneMessage = this.messageMap.get(type).notifyDone(this);
                await this.discordBot.sendDiscordMessage(doneMessage);
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

        await this.discordBot.sendDiscordMessage(startMessage);
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

        await this.discordBot.sendDiscordMessage(message);

        this.serverInfo.scheduledOperation = null;
        clearInterval(this.interval);

        return this.serverInfo;
    }

    isRunning() {
        return this.processManager.isStarted;
    }

    async startServer(config = null, sendMessage = false) {
        if (config) {
            this.setConfig(config);
        }

        await this.processManager.startProcess();
        await this.logWatcher.startWatching();

        this.emit('server_started', {
            serverInfo: this.serverInfo
        });

        await once(this, 'ready');

        if (sendMessage) {
            const message = this.messageMap.get('start').notifyDone(this);
            await this.discordBot.sendDiscordMessage(message);
        }

        return this.serverInfo;
    }

    async stopServer(sendMessage = false) {
        await this.processManager.stopProcess();

        this.clearServerInfo();

        this.settingsManager.onServerStopped();
        this.userManager.onServerStopped();


        this.emit('server_stopped', {
            serverInfo: this.getServerInfo(),
            ...this.settingsManager.getSettings(),
            ...this.userManager.getState()
        });

        if (sendMessage) {
            const message = this.messageMap.get('force-stop').notifyDone(this);
            await this.discordBot.sendDiscordMessage(message);
        }

        return this.serverInfo;
    }

    parseLoadedSave(saveNumber, extension, isAutoSave) {
        if (this.serverInfo.currentSaveNumber !== saveNumber) {
            this._updateServerInfo({
                currentSaveNumber: saveNumber
            });

            this.emit(isAutoSave ? 'auto_save' : 'loaded_save', {
                saveNumber,
                extension
            });
        }
    }

    async parseLogLine(line) {
        for (const {regex, parse} of this.regexpArray) {
            const matches = regex.exec(line);
            if (matches && matches.length > 0) {
                await parse(matches, line);
                regex.lastIndex = 0;
                break;
            }
            regex.lastIndex = 0;
        }
    }

    async initServer(config) {
        this.setConfig(config);
        await this.userManager.initUserManager(config.server.defaultAdminList, config.server.defaultBanList);
        await this.settingsManager.setupServerSettings();
        await this.operationManager.loadOperations();
    }
}
