import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import lodash from "lodash";
import {EventEmitter} from 'events';
import {logger} from "../logger.js";
import {
    LogWatcher,
    VRisingPlayerManager,
    VRisingProcess,
    VRisingRConClient,
    VRisingSaveManager,
    VRisingSettingsManager,
    VRisingUserManager
} from "./managers/index.js";
import {VRisingSteamQuery} from "./steam/query.js";
import {VRisingOperationManager} from "./operations/operation-manager.js";
import {VRisingModManager} from "./mods/mod-manager.js";
import {VRisingApiClient} from "./api/api-client.js";
import {VRisingClanManager} from "./managers/clan-manager.js";
import {LogParser} from "./managers/log-parser.js";

dayjs.extend(utc);

export const serverStates = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    PROCESS_STARTED: 'process_started',
    UPDATING: 'updating',
    UPDATED: 'updated',
    ERROR: 'error',
    CHECKING_MODS: 'checking_mods',
    EXITING: 'exiting',
    SETUP_COMPLETE: 'setup_complete',
    FINISHING_LOADING: 'finishing_loading',
    STARTING: 'starting',
    STOPPING: 'stopping'
};

/**
 * VRising Server class
 * @typedef {Object} ServerInfo
 */
export class VRisingServer extends EventEmitter {
    constructor(config, discordBot) {
        super();
        this.discordBot = discordBot;
        this.serverInfo = {
            state: serverStates.OFFLINE,
            serverName: config.server.name,
            saveName: config.server.saveName,
            time: null,
            version: null,
            versionDate: null,
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

        this.config = config;

        this.settingsManager = new VRisingSettingsManager(config, this);
        this.processManager = new VRisingProcess(config, this);
        this.apiClient = new VRisingApiClient(this);
        this.playerManager = new VRisingPlayerManager(this, this.apiClient);
        this.clanManager = new VRisingClanManager(this, this.playerManager, this.apiClient);
        this.autoSaveManager = new VRisingSaveManager(config, this, this.settingsManager);
        this.rConClient = new VRisingRConClient(config, this);
        this.steamQuery = new VRisingSteamQuery(this);
        this.userManager = new VRisingUserManager(this);
        this.logWatcher = new LogWatcher(this);
        this.logParser = new VRisingServerLogParser(this);
        this.operationManager = new VRisingOperationManager(this);
        this.modManager = new VRisingModManager(this, config);

        this.autoSaveManager.on('parsed_start_date', (startDate) => this._updateServerInfo({
            currentSaveStartDate: startDate
        }))

        this.processManager.on('started', pid => this._updateServerInfo({
            pid,
            state: serverStates.PROCESS_STARTED,
            processExitCode: null,
            processError: null
        }));

        this.processManager.on('steam_state_updated', steamState => {
            if (steamState.processing) {
                this._updateServerInfo({
                    state: serverStates.UPDATING
                });
            }

            if (steamState.success) {
                this._updateServerInfo({
                    state: serverStates.UPDATED
                })
            }
        });

        this.processManager.on('mods_check', () => this._updateServerInfo({state: serverStates.CHECKING_MODS}))

        this.processManager.on('process_error', err => this._updateServerInfo({
            processError: err.message,
            state: serverStates.ERROR
        }));

        this.processManager.on('exiting', () => this._updateServerInfo({state: serverStates.EXITING}));

        this.processManager.on('process_stopped', code => this._updateServerInfo({
            state: serverStates.OFFLINE,
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
    }

    getConfig() {
        return this.config;
    }

    setConfig(config) {
        this.config = {...config};
        this.emit('config_updated', this.config);
        this._updateServerInfo({
            serverName: config.server.name,
            saveName: config.server.saveName,
            gamePort: config.server.gamePort,
            queryPort: config.server.queryPort
        });
    }

    _updateServerInfo(data) {
        const previousState = lodash.cloneDeep(this.serverInfo);

        this.serverInfo = {
            ...this.serverInfo,
            ...data
        };

        if (!lodash.isEqual(previousState, this.serverInfo)) {
            logger.debug('New Server Info %j', this.serverInfo);
            this.emit('server_info', this.serverInfo);

            if (this.serverInfo.state !== previousState.state) {
                logger.debug('emitting server event state %s', this.serverInfo.state);
                this.emit(this.serverInfo.state, this.serverInfo);
            } else if (data.state) {
                logger.debug('State is still the same...');
            }
        }

        return this.serverInfo;
    }

    setSetupComplete() {
        this._updateServerInfo({
            state: serverStates.SETUP_COMPLETE,
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
            publicIp: null,
            connectedToSteam: false,
            serverSetupComplete: false,
            loadedSaveGameVersion: null,
            currentGameVersion: null,
            isSaveLoaded: false,
            isSaveVersionIdentical: null,
            processExitCode: null
        });
    }

    isRunning() {
        return this.processManager.isStarted;
    }

    async initServer(config) {
        this.setConfig(config);
        await this.userManager.initUserManager(config.server.defaultAdminList, config.server.defaultBanList);
        await this.settingsManager.setupServerSettings();
        await this.operationManager.loadOperations();
        await this.modManager.init();
    }

    async startServer() {
        this.clearServerInfo();
        await this.processManager.startProcess();
        await this.logWatcher.startWatching();

        this.emit('server_started', {
            state: serverStates.STARTING,
            serverInfo: this.serverInfo
        });

        return this.serverInfo;
    }

    async stopServer() {
        await this.processManager.stopProcess();
        this.clearServerInfo();
        this.settingsManager.onServerStopped();
        this.userManager.onServerStopped();

        this.emit('server_stopped', {
            state: serverStats.STOPPING,
            serverInfo: this.getServerInfo(),
            ...this.settingsManager.getSettings(),
            ...this.userManager.getState()
        });

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

    getServerState() {
        return this.serverInfo.state || serverStates.OFFLINE;
    }
}

class VRisingServerLogParser extends LogParser {
    constructor(server) {
        super([
            {
                regex: /Bootstrap - Time: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}), Version: VRisingServer v([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s\((\d{4}-\d{2}-\d{2}\s[0-9]{2}:[0-9]{2}\s[a-zA-Z]+)\)/g,
                parse: ([, timeStr, version, versionDate]) => {
                    this.server._updateServerInfo({
                        version,
                        versionDate: dayjs(versionDate, 'YYYY-MM-DD HH:mm ZZZ').toDate(),
                        time: dayjs.utc(timeStr, 'YYYY-MM-DD HH:mm:ss').toDate()
                    });
                }
            },
            {
                regex: /Setting breakpad minidump AppID = (\d*)/g,
                parse: ([, appId]) => {
                    this.server._updateServerInfo({
                        appID: appId
                    })
                }
            },
            {
                regex: /SteamPlatformSystem - OnPolicyResponse - Game server SteamID: ([0-9]+)/g,
                parse: ([, steamId]) => {
                    this.server._updateServerInfo({
                        steamID: steamId
                    });
                }
            },
            {
                regex: /SteamPlatformSystem - OnPolicyResponse - Public IP: ([0-9]{1,3}.*)/g,
                parse: ([, publicIp]) => {
                    this.server._updateServerInfo({
                        publicIp
                    })
                }
            },
            {
                regex: /SteamPlatformSystem - Server connected to Steam successfully!/g,
                parse: () => {
                    this.server._updateServerInfo({
                        connectedToSteam: true
                    });
                }
            },
            {
                regex: /Server Setup Complete/g,
                parse: () => {
                    this.server.setSetupComplete();
                }
            },
            {
                regex: /PersistenceV2 - GameVersion of Loaded Save: (.*), Current GameVersion: (.*)/g,
                parse: ([, loadedSaveGameVersion, currentGameVersion]) => {
                    logger.debug('GameVersion of Loaded Save matched !');
                    this.server._updateServerInfo({
                        loadedSaveGameVersion,
                        currentGameVersion,
                        isSaveLoaded: true,
                        state: serverStates.FINISHING_LOADING,
                        isSaveVersionIdentical: loadedSaveGameVersion === currentGameVersion
                    });
                }
            },
            {
                regex: /PersistenceV2 - Finished Loading (\d*) Entities spread over (\d*) Archetypes\./g,
                parse: ([, entityCount, archetypeCount]) => {
                    logger.debug('Server has loaded %d entities over %d archetypes', entityCount, archetypeCount);
                    if (this.server.getServerState() !== serverStates.ONLINE && this.server.getServerState() !== serverStates.ERROR) {
                        this.server._updateServerInfo({
                            state: serverStates.ONLINE
                        })
                    } else {
                        logger.debug('Server state is %s', this.server.getServerState());
                    }
                }
            },
            {
                regex: /Shutting down Asynchronous Streaming/g,
                parse: () => {
                    logger.debug('Server finished asynchronous streaming');
                    if (this.server.getServerState() !== serverStates.ONLINE && this.server.getServerState() !== serverStates.ERROR) {
                        this.server._updateServerInfo({
                            state: serverStates.ONLINE
                        })
                    } else {
                        logger.debug('Server state is %s', this.server.getServerState());
                    }
                }
            },
            {
                regex: /PersistenceV2 - Finished Saving to '.*AutoSave_(\d*)\.(save|save\.gz)'/g,
                parse: ([, saveNumber, extension]) => {
                    saveNumber = parseInt(saveNumber);
                    logger.info('AutoSave %d detected !', saveNumber);
                    this.server.parseLoadedSave(saveNumber, extension, true);
                }
            },
            {
                regex: /Loaded Save:AutoSave_(\d*)\.(save|save\.gz)/g,
                parse: ([, saveNumber, extension]) => {
                    saveNumber = parseInt(saveNumber);
                    logger.debug('(Server) Save %d loaded with extension %s !', saveNumber, extension);
                    this.server.parseLoadedSave(saveNumber, extension, false);
                }
            },
            {
                regex: /HttpService - Receive Thread started./g,
                parse: () => {
                    logger.debug('Matched HttpService received thread started, start polling metrics using api');
                    this.server.emit('http_service_ready');
                }
            },
            {
                regex: /\[rcon] Started listening on (.*), Password is: "(.*)"/g,
                parse: ([, , password]) => {
                    this.server.emit('rcon_service_ready', password);
                }
            }
        ]);
        this.server = server;
    }
}
