import {queryGameServerInfo, queryGameServerPlayer, queryGameServerRules} from 'steam-server-query-goldsrc-support';
import {logger} from "../../logger.js";
import {EventEmitter} from "events";
import {PlayerMetricsStore} from "./player-metrics-store.js";

/**
 * Class used to poll metrics from SteamQuery API using the QueryPort
 */
export class VRisingSteamQuery extends EventEmitter {
    constructor(server) {
        super();
        this.started = false;
        this.paused = false;
        this.server = server;
        this.store = new PlayerMetricsStore();

        server.on('ready', () => {
            this.updateConfig(this.server.getConfig());
            this.startPolling();
        });
    }

    updateConfig(config) {
        this.isEnabled = config.steam.query.enabled;
        this.gameServer = `127.0.0.1:${config.server.queryPort}`;
        this.delay = config.steam.query.pollingDelay;
        this.timeout = config.steam.query.timeout;
        this.attempts = config.steam.query.attempts;
    }

    async execQuery() {
        this.started = true;

        this.serverInfo = await this.queryInfo();
        this.emit('info', this.serverInfo);
        this.serverRules = await this.queryRules();
        this.emit('rules', this.serverRules);

        for await (const info of this.queryData()) {
            console.log('retrieved info !', info);
            const {playerCount} = info;

            if (playerCount !== undefined) {
                await this.store.storePlayerCount(playerCount);
            }
        }
    }

    async* queryData() {
        while (!this.paused && this.started) {
            try {
                const playerResponse = await this.queryPlayers();
                if (playerResponse) {
                    yield playerResponse;
                }
            } catch (err) {
                logger.error('Error on steam query players: %s', err.message);
            }
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }

        this.started = false;
    }

    async queryInfo() {
        return queryGameServerInfo(this.gameServer, this.attempts, this.timeout);
    }

    async queryPlayers() {
        return queryGameServerPlayer(this.gameServer, this.attempts, this.timeout);
    }

    async queryRules() {
        return queryGameServerRules(this.gameServer, this.attempts, this.timeout);
    }

    startPolling() {
        if (!this.isEnabled) return false;
        if (this.started) return true;

        this.execQuery().catch(err => logger.error('Error on exec query : %s', err.message));
        return true;
    }

    stopPolling() {
        if (!this.isEnabled) return false;
        if (!this.started) return true;

        this.paused = true;
    }
}
