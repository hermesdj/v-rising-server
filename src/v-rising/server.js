import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
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
            state: 'offline',
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
            state: 'process_started',
            processExitCode: null,
            processError: null
        }));

        this.processManager.on('steam_state_updated', steamState => {
            if (steamState.processing) {
                this._updateServerInfo({
                    state: 'updating'
                });
            }

            if (steamState.success) {
                this._updateServerInfo({
                    state: 'updated'
                })
            }
        });

        this.processManager.on('mods_check', () => this._updateServerInfo({state: 'checking_mods'}))

        this.processManager.on('process_error', err => this._updateServerInfo({
            processError: err.message,
            state: 'error'
        }));

        this.processManager.on('exiting', () => this._updateServerInfo({state: 'exiting'}));

        this.processManager.on('process_stopped', code => this._updateServerInfo({
            state: 'offline',
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
            state: 'setup_complete',
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
            state: 'starting',
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
            state: 'stopping',
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
}

class VRisingServerLogParser {
    constructor(server) {
        this.server = server;

        this.regexpArray = [
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
                    logger.debug('GameVersion of Loaded Save matched, server is running !');
                    this.server._updateServerInfo({
                        loadedSaveGameVersion,
                        currentGameVersion,
                        isSaveLoaded: true,
                        state: 'online',
                        isSaveVersionIdentical: loadedSaveGameVersion === currentGameVersion
                    });
                    this.server.emit('online', this.server.getServerInfo());
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
        ]
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
}
