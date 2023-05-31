import {Rcon} from 'rcon-client';
import {logger} from "../logger.js";
import lodash from "lodash";

export class VRisingRConClient {
    constructor(config) {
        this.config = lodash.defaults(config, {
            enabled: false,
            host: 'localhost',
            port: 25575,
            password: null
        })
        this.client = null;
        this.isConnected = false;
    }

    async connect(config) {
        if (this.client) return this.client;

        try {
            this.config = config;
            logger.debug('Connecting rcon with host %s, port %d, password %s', config.host, config.port, config.password);
            this.client = await Rcon.connect(config);
            this.isConnected = true;
            logger.info('RCon is connected on %s:%s', config.host, config.port);
        } catch (err) {
            logger.warn('Could not connect RCon: %s', err.message);
        }
        return this.isConnected;
    }

    async disconnect() {
        if (!this.client) return;
        try {
            await this.client.end();
            this.isConnected = false;
        } catch (err) {
            logger.warn('Could not disconnect rcon client: %s', err.message);
        }

        return this.isConnected;
    }

    async reconnect(config) {
        if (!this.client) return;
        this.config = config;
        if (this.isConnected) await this.disconnect();
        await this.connect(config);

        return this.isConnected;
    }

    async _sendMessage(message) {
        if (!this.client) {
            logger.warn('RCon is not active ! could not send message %s', message);
            return false;
        }

        try {
            logger.info('Sending message using RCON : %s', message);
            await this.client.send(message);
            return true;
        } catch (err) {
            logger.error('Error sending message to VRising server !');
            throw err;
        }
    }

    async sendAnnounceToVRisingServer(message) {
        return this._sendMessage(`announce ${message}`);
    }

    async sendRestartAnnounceToVRisingServer(time) {
        return this._sendMessage(`announcerestart ${time}`)
    }

    isEnabled() {
        return this.client && this.config.enabled;
    }
}
