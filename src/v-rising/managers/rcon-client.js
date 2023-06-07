import {Rcon} from 'rcon-client';
import {logger} from "../../logger.js";
import lodash from "lodash";

export class VRisingRConClient {
    constructor(config, server) {
        this.server = server;

        this.config = {
            enabled: false,
            host: 'localhost',
            port: 25575,
            password: null
        };

        this.setConfig(config.rcon);
        this.isConnected = false;
        this.disconnectTimeout = null;

        server.on('server_stopped', () => this.disconnect());
        server.on('rcon_service_ready', (password) => this.config.password = password);
        server.settingsManager.on('applied_host_settings', (hostSettings) => this.updateFromHostSettings(hostSettings));
    }

    setConfig(config) {
        this.config = lodash.defaults(config, this.config);
    }

    updateFromHostSettings(settings) {
        if (settings.Rcon) {
            this.config.enabled = settings.Rcon.Enabled;
            this.config.password = settings.Rcon.Password;
            this.config.port = settings.Rcon.Port;
        } else {
            this.config.enabled = false;
        }

        logger.debug('Updated rcon config. Rcon is enabled : %s', this.config.enabled);
    }

    async connect() {
        if (!this.client) {
            logger.debug('Connecting rcon with host %s, port %d', this.config.host, this.config.port);
            this.client = new Rcon({
                host: this.config.host,
                port: this.config.port,
                password: this.config.password
            });
            this.client.on('error', (err) => logger.error('Rcon client error : %s', err.message));
        }

        try {
            this.client = await this.client.connect();
            this.isConnected = true;
        } catch (err) {
            logger.warn('Could not connect RCon: %s', err.message);
        }
        return this.isConnected;
    }

    async disconnect() {
        if (!this.client) return;
        try {
            logger.debug('Disconnect rcon client');
            await this.client.end();
        } catch (err) {
            logger.warn('Could not disconnect rcon client: %s', err.message);
        } finally {
            this.isConnected = false;
        }

        return this.isConnected;
    }

    async reconnect() {
        if (!this.client) return;
        if (this.isConnected) await this.disconnect();
        await this.connect();

        return this.isConnected;
    }

    async _sendCommand(message) {
        if (!this.client || !this.isConnected) {
            logger.debug('RCon is not active ! connecting...');
            await this.connect();
        }

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        try {
            logger.info('Sending message using RCON : %s', message);
            return await this.client.send(message);
        } catch (err) {
            logger.error('Error sending message to VRising server : %s', err.message);
            throw err;
        } finally {
            this.disconnectTimeout = setTimeout(async () => await this.disconnect(), 5000);
        }
    }

    async sendAnnounceToVRisingServer(message) {
        return this._sendCommand(`announce ${message}`);
    }

    async sendRestartAnnounceToVRisingServer(time) {
        return this._sendCommand(`announcerestart ${time}`)
    }

    isEnabled() {
        return this.config.enabled;
    }
}
