import fs from "fs";
import {mkdirp} from "mkdirp";
import path from "path";
import {logger} from "../../logger.js";
import url from "url";
import {EventEmitter} from "events";
import lodash from "lodash";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class VRisingSettingsManager extends EventEmitter {
    constructor(config, server) {
        super();
        this.server = server;
        this.updateConfig(config);

        this.serverConfig = {};
        this.apiConfig = {};
        this.config = {};

        this.gameSettings = {
            current: null,
            lastApplied: null
        };
        this.hostSettings = {
            current: null,
            lastApplied: null
        };

        server.on('config_updated', config => this.updateConfig(config));
        server.on('server_started', () => this.onServerStarted());
        server.on('server_stopped', () => this.onServerStopped());
    }

    async onServerStarted() {
        logger.info('Server started, reading applied settings from files');
        // Read settings and populate last applied values
        if (!this.gameSettings.current) {
            this.gameSettings.current = await this._readSettingsFile(this.config.gameSettingsFileName);
        }
        if (!this.hostSettings.current) {
            this.hostSettings.current = await this._readSettingsFile(this.config.gameSettingsFileName);
        }

        this.gameSettings.lastApplied = lodash.cloneDeep(this.gameSettings.current);
        this.emit('applied_game_settings', this.gameSettings.lastApplied);

        this.hostSettings.lastApplied = lodash.cloneDeep(this.hostSettings.current);
        this.emit('applied_host_settings', this.hostSettings.lastApplied);
    }

    onServerStopped() {
        this.gameSettings.lastApplied = null;
        this.hostSettings.lastApplied = null;
    }

    updateConfig(config) {
        this.config = lodash.defaultsDeep(config.server.settings, {
            dataPath: config.server.dataPath || '/mnt/vrising/persistentdata',
            folderName: 'Settings',
            hostSettingsFileName: 'ServerHostSettings.json',
            gameSettingsFileName: 'ServerGameSettings.json'
        });

        this.serverConfig = config.server;
        this.apiConfig = config.api;
    }

    getSettings() {
        return {
            hostSettings: this.hostSettings,
            gameSettings: this.gameSettings
        }
    }

    async setupServerSettings() {
        logger.debug('Setup server settings')
        await this.checkServerSettingsDirectory();
        const {hostSettings, gameSettings} = await this.initializeServerSettings();

        this.hostSettings.current = lodash.cloneDeep(hostSettings);
        this.gameSettings.current = lodash.cloneDeep(gameSettings);

        return {
            hostSettings: this.hostSettings,
            gameSettings: this.gameSettings
        };
    }

    async initializeServerSettings() {
        const hostSettings = await this._initializeHostSettings();
        const gameSettings = await this._initializeGameSettings();

        return {hostSettings, gameSettings};
    }

    async _initializeHostSettings() {
        if (!this.checkSettingsIsInitialized(this.config.hostSettingsFileName)) {
            logger.debug('Initialize host settings from default file');
            return await this._initializeHostSettingsFromDefault();
        } else {
            logger.debug('Reading current host settings file');
            return await this._readSettingsFile(this.config.hostSettingsFileName);
        }
    }

    async _initializeGameSettings() {
        if (!this.checkSettingsIsInitialized(this.config.gameSettingsFileName)) {
            logger.debug('Initialize game settings from default file')
            return await this._initializeGameSettingsFromDefault();
        } else {
            logger.debug('Reading current game settings file');
            return await this._readSettingsFile(this.config.gameSettingsFileName);
        }
    }

    async checkServerSettingsDirectory() {
        if (!fs.existsSync(this.config.dataPath)) {
            logger.debug('Creating dataPath %s', this.config.dataPath);
            await mkdirp(this.config.dataPath);
        }

        const settingsPath = path.join(this.config.dataPath, 'Settings');

        if (!fs.existsSync(settingsPath)) {
            logger.debug('Creating settingsPath %s', settingsPath);
            await mkdirp(settingsPath);
        }
    }

    checkSettingsIsInitialized(fileName) {
        return fs.existsSync(this._settingsFilePath(fileName));
    }

    async _initializeHostSettingsFromDefault() {
        const defaultHostSettings = await this._readDefaultSettingsFile(this.config.hostSettingsFileName);

        defaultHostSettings.Name = this.serverConfig.name;
        defaultHostSettings.Port = this.serverConfig.gamePort;
        defaultHostSettings.QueryPort = this.serverConfig.queryPort;
        defaultHostSettings.SaveName = this.serverConfig.saveName;
        defaultHostSettings.Password = this.serverConfig.password;
        defaultHostSettings.RemoteBansURL = `http://localhost:${this.apiConfig.port}/api/users/banned`;
        defaultHostSettings.RemoteAdminsURL = `http://localhost:${this.apiConfig.port}/api/users/admins`;

        // API
        if (!defaultHostSettings.API) {
            defaultHostSettings.API = {};
        }
        defaultHostSettings.API.Enabled = this.serverConfig.api.enabled;
        defaultHostSettings.API.BindAddress = this.serverConfig.api.bindAddress;
        defaultHostSettings.API.BindPort = this.serverConfig.api.bindPort;
        defaultHostSettings.API.BasePath = this.serverConfig.api.basePath;
        defaultHostSettings.API.AccessList = this.serverConfig.api.accessList;
        defaultHostSettings.API.PrometheusDelay = this.serverConfig.api.prometheusDelay;

        // RCon
        if (!defaultHostSettings.Rcon) {
            defaultHostSettings.Rcon = {};
        }
        defaultHostSettings.Rcon.Password = this.serverConfig.rcon.password;
        defaultHostSettings.Rcon.Port = this.serverConfig.rcon.port;
        defaultHostSettings.Rcon.Enabled = this.serverConfig.rcon.enabled;

        await this._writeServerSettings(defaultHostSettings, this.config.hostSettingsFileName);

        return defaultHostSettings;
    }

    async _initializeGameSettingsFromDefault() {
        const defaultGameSettings = await this._readDefaultSettingsFile(this.config.gameSettingsFileName);
        await this._writeServerSettings(defaultGameSettings, this.config.gameSettingsFileName);
        return defaultGameSettings;
    }

    _settingsFilePath(fileName) {
        return path.join(this.config.dataPath, this.config.folderName, fileName);
    }

    async _readSettingsFile(fileName) {
        const content = await fs.promises.readFile(this._settingsFilePath(fileName), 'utf8');
        return JSON.parse(content);
    }

    async _readDefaultSettingsFile(fileName) {
        const content = await fs.promises.readFile(path.join(__dirname, '..', '..', 'settings', fileName), 'utf8');
        return JSON.parse(content);
    }

    async _writeServerSettings(settings, fileName) {
        const filePath = this._settingsFilePath(fileName);
        logger.debug('Writing settings to %s', filePath);
        await fs.promises.writeFile(filePath, JSON.stringify(settings, null, 4));
        return settings;
    }

    async updateGameSettings(settings) {
        if (!lodash.isEqual(settings, this.gameSettings.current)) {
            await this._writeServerSettings(settings, this.config.gameSettingsFileName);
            this.gameSettings.current = settings;
            this.emit('changed_game_settings', this.gameSettings);
        }
        return this.gameSettings;
    }

    async updateHostSettings(settings) {
        if (!lodash.isEqual(settings, this.hostSettings.current)) {
            await this._writeServerSettings(settings, this.config.hostSettingsFileName);
            this.hostSettings.current = settings;
            this.emit('changed_host_settings', this.hostSettings);
        }
        return this.hostSettings;
    }

    getCurrentHostSettingByKey(key){
        return lodash.get(this.hostSettings.current, key);
    }
}

const hostSettingsPath = (config) => path.join(config.server.dataPath, 'Settings', 'ServerHostSettings.json');
const gameSettingsPath = (config) => path.join(config.server.dataPath, 'Settings', 'ServerGameSettings.json');

export const getGameSettings = async (config) => {
    const content = await fs.promises.readFile(gameSettingsPath(config), 'utf8');
    return JSON.parse(content);
}

export const getHostSettings = async (config) => {
    const content = await fs.promises.readFile(hostSettingsPath(config), 'utf8');
    return JSON.parse(content);
}
