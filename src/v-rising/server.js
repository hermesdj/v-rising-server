import dayjs from 'dayjs';
import {EventEmitter} from 'events';
import {logger} from "../logger.js";
import {playerManager} from "./players.js";

export class VRisingServer extends EventEmitter {
    constructor() {
        super();
        this.serverInfo = {
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
        }

        this.playerManager = playerManager;
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
            time: dayjs(timeStr, 'YYYY-MM-DD HH:mm:ss').toDate()
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

    stopServer() {
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
}

export const vRisingServer = new VRisingServer();
