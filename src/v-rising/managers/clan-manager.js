import {EventEmitter} from "events";
import {DbManager} from "../../db-manager.js";
import {logger} from "../../logger.js";
import {sleep} from "../utils.js";

class ClanStore {
    constructor() {
        this.db = DbManager.createDb('clans-db', 'clans');
    }

    async read() {
        return this.db.read();
    }

    async write() {
        return this.db.write();
    }

    all() {
        return this.db.all();
    }

    get(clanId) {
        return this.db.get(clanId);
    }

    set(clanId, clan) {
        return this.db.set(clanId, clan);
    }

    tmpSet(clanId, clan) {
        return this.db.tmpSet(clanId, clan);
    }

    exists(clanId) {
        return this.db.has(clanId);
    }
}

export class VRisingClanManager extends EventEmitter {
    constructor(server, playerManager, apiClient) {
        super();
        this.server = server;
        this.playerManager = playerManager;
        this.apiClient = apiClient;
        this.store = new ClanStore();

        this.hasHttpService = false;

        this.server.on('http_service_ready', () => this.hasHttpService = true);
        this.server.on('online', () => this.onServerOnline());
    }

    async onServerOnline() {
        if (!this.hasHttpService) return;
        logger.info('Server is online, waiting a second before initializing clans');
        await sleep(1000);

        try {
            const {clans} = await this.apiClient.clans.getAllClans();

            logger.info('Updating %d clans in local db', clans.length);
            for (const clan of clans) {
                if (!this.store.exists(clan.id)) {
                    this.store.tmpSet(clan.id, clan);
                } else {
                    this.store.tmpSet(clan.id, {
                        ...this.store.get(clan.id),
                        ...clan
                    });
                }
            }

            await this.store.write();
        } catch (err) {
            logger.warn('Could not update clan db from API: %s', err.message);
        }
    }

    getClan(clanId) {
        return this.store.get(clanId);
    }

    listAllClans() {
        return this.store.all();
    }
}
