import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {EventEmitter} from 'events';
import {logger} from "../logger.js";
import {playerManager} from "./players.js";
import os from "os";
import lodash from "lodash";
import {exec} from "child_process";
import {sendDiscordMessage} from "../discord/index.js";
import {sendAnnounceToVRisingServer, sendRestartAnnounceToVRisingServer} from "./rcon.js";
import {startVRisingServerExecution, stopVRisingServerExecution} from "./bin.js";
import {sleep} from "./utils.js";
import {getGameSettings, getHostSettings, writeGameSettings, writeHostSettings} from "./settings.js";
import {getAdminList, getBanList, writeAdminList, writeBanList} from "./users.js";
import path from "path";
import {AutoSaveManager} from "./autosave.js";

dayjs.extend(utc);

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
            currentSaveNumber: null
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

        this.config = {};
        this.hostSettings = null;
        this.gameSettings = null;

        this.lastAppliedHostSettings = null;
        this.lastAppliedGameSettings = null;

        this.adminList = null;
        this.banList = null;

        this.lastAppliedAdminList = null;
        this.lastAppliedBanList = null;

        this.playerManager = playerManager;
        this.autoSaveManager = new AutoSaveManager(this);
    }

    setConfig(config) {
        this.config = config;
        this._updateServerInfo({
            serverName: config.server.name,
            saveName: config.server.saveName
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

    parseServerInfo([, timeStr, version]) {
        return this._updateServerInfo({
            version,
            time: dayjs.utc(timeStr, 'YYYY-MM-DD HH:mm:ss').toDate()
        });
    }

    parseAssignedIdentity([, steamId]) {
        return this._updateServerInfo({
            steamID: steamId
        });
    }

    parseAppId([, appId]) {
        return this._updateServerInfo({
            appID: appId
        })
    }

    setConnectedToSteam() {
        return this._updateServerInfo({
            connectedToSteam: true
        });
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

    parseGameVersion([, loadedSaveGameVersion, currentGameVersion]) {
        return this._updateServerInfo({
            loadedSaveGameVersion,
            currentGameVersion,
            isSaveLoaded: true,
            isSaveVersionIdentical: loadedSaveGameVersion === currentGameVersion
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
        if (os.platform() === 'win32') return this.serverProcess ? this.serverProcess.pid : null
        else if (os.platform() === 'linux') {
            return new Promise((resolve, reject) => {
                exec("ps -A | grep 'VRising' | awk '{print $1}'", (error, stdout, stderr) => {
                    if (error) {
                        logger.error('Could not retrieve VRisin process pid : %s', error.message);
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        logger.error('Could not retrieve VRisin process pid : %s', stderr);
                        reject(stderr);
                        return;
                    }
                    resolve(parseInt(stdout));
                })
            })
        } else {
            return null;
        }
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
     * @returns {Promise<void>}
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
                await sendAnnounceToVRisingServer(executionMessage);
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
                    const restoreSuccess = await this.autoSaveManager.restoreBackup(this.config, fileName, this.hostSettings.CompressSaveFiles, this.serverInfo.currentSaveNumber);

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
                    await sendRestartAnnounceToVRisingServer(delay);
                } else if (type === 'stop') {
                    await sendAnnounceToVRisingServer(progressMessage);
                }
                this.emit('operation_progress', this.serverInfo);
            }
        }, 60000);

        // Notify start
        const startMessage = this.messageMap.get(type).notifyStart(this);

        await sendDiscordMessage(startMessage);
        if (type === 'restart') {
            await sendRestartAnnounceToVRisingServer(delay);
        } else if (type === 'stop') {
            await sendAnnounceToVRisingServer(startMessage);
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

    startServer(config = null, sendMessage = false) {
        if (config) {
            this.config = config;
        }
        return startVRisingServerExecution(this.config, this)
            .then(async () => {
                this.lastAppliedHostSettings = await getHostSettings(this.config);
                this.lastAppliedGameSettings = await getGameSettings(this.config);

                this.hostSettings = {...this.lastAppliedHostSettings};
                this.gameSettings = {...this.lastAppliedGameSettings};

                this.lastAppliedAdminList = await getAdminList(this.config);
                this.lastAppliedBanList = await getBanList(this.config);

                this.adminList = [...this.lastAppliedAdminList];
                this.banList = [...this.lastAppliedBanList];

                this.emit('server_started', {
                    serverInfo: this.serverInfo,
                    hostSettings: {
                        current: this.hostSettings,
                        lastApplied: this.lastAppliedHostSettings
                    },
                    gameSettings: {
                        current: this.gameSettings,
                        lastApplied: this.lastAppliedGameSettings
                    },
                    adminList: {
                        current: this.adminList,
                        lastApplied: this.lastAppliedAdminList
                    },
                    banList: {
                        current: this.banList,
                        lastApplied: this.lastAppliedBanList
                    }
                });

                if (sendMessage) {
                    const message = this.messageMap.get('start').notifyDone(this);
                    await sendDiscordMessage(message);
                }
                return this.serverInfo;
            });
    }

    stopServer(sendMessage = false) {
        if (!this.isRunning()) return this.serverInfo;
        return stopVRisingServerExecution(this)
            .then(async () => {
                this.emit('server_stopped', {
                    serverInfo: this.serverInfo,
                    hostSettings: {
                        current: this.hostSettings,
                        lastApplied: this.lastAppliedHostSettings
                    },
                    gameSettings: {
                        current: this.gameSettings,
                        lastApplied: this.lastAppliedGameSettings
                    },
                    adminList: {
                        current: this.adminList,
                        lastApplied: this.lastAppliedAdminList
                    },
                    banList: {
                        current: this.banList,
                        lastApplied: this.lastAppliedBanList
                    }
                });
                if (sendMessage) {
                    const message = this.messageMap.get('force-stop').notifyDone(this);
                    await sendDiscordMessage(message);
                }
                return this.serverInfo;
            });
    }

    async changeHostSettings(settings) {
        this.hostSettings = settings;
        await writeHostSettings(this.config, settings);
        this.emit('changed_host_settings', {current: this.hostSettings, lastApplied: this.lastAppliedHostSettings});
        return {current: this.hostSettings, lastApplied: this.lastAppliedHostSettings};
    }

    async changeGameSettings(settings) {
        this.gameSettings = settings;
        await writeGameSettings(this.config, settings);
        this.emit('changed_game_settings', {current: this.gameSettings, lastApplied: this.lastAppliedGameSettings});
        return {current: this.gameSettings, lastApplied: this.lastAppliedGameSettings};
    }

    async changeAdminList(adminList) {
        if (lodash.isEqual(adminList, this.adminList))
            return {
                current: this.adminList,
                lastApplied: this.lastAppliedAdminList
            };

        this.adminList = adminList;
        await writeAdminList(this.config, adminList);
        const result = {current: this.adminList, lastApplied: this.lastAppliedAdminList};
        this.emit('changed_admin_list', result);
        return result;
    }

    async changeBanList(banList) {
        if (lodash.isEqual(banList, this.banList))
            return {
                current: this.banList,
                lastApplied: this.lastAppliedBanList
            };
        this.banList = banList;
        await writeBanList(this.config, banList);
        const result = {current: this.banList, lastApplied: this.lastAppliedBanList};
        this.emit('changed_ban_list', result);
        return result;
    }

    parseLastAutoSave([, autoSaveNumber]) {
        autoSaveNumber = parseInt(autoSaveNumber);
        logger.debug('AutoSave %d detected !', autoSaveNumber);
        if (this.serverInfo.currentSaveNumber !== autoSaveNumber) {
            this._updateServerInfo({
                currentSaveNumber: autoSaveNumber
            });

            if (this.config && this.config.server && this.config.server.dataPath && this.hostSettings) {
                this.emit('auto_save', {
                    config: this.config,
                    saveNumber: autoSaveNumber,
                    fileName: 'AutoSave_',
                    extension: this.hostSettings.CompressSaveFiles === true ? 'save.gz' : 'save'
                });
            }
        }
    }

    parseLoadedSave([, saveNumber, extension]) {
        saveNumber = parseInt(saveNumber);
        logger.debug('Save %d loaded with extension %s !', saveNumber, extension);
        if (this.serverInfo.currentSaveNumber !== saveNumber) {
            this._updateServerInfo({
                currentSaveNumber: saveNumber
            });

            if (this.config && this.config.server && this.config.server.dataPath) {
                this.emit('loaded_save', {
                    config: this.config,
                    saveNumber,
                    fileName: 'AutoSave_',
                    extension
                });
            }
        }
    }
}

export const vRisingServer = new VRisingServer();
