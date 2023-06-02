import fs from "fs";
import {logger} from "../logger.js";
import lodash from "lodash";
import {EventEmitter} from "events";
import {DbManager} from "../db-manager.js";

export class VRisingUserManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.store = DbManager.createFlatDb('game-users-db');
    }

    isInitialized() {
        return this.store.get('initialized');
    }

    async initUserManager(config) {
        if (!this.isInitialized()) {
            await this.store.assign({
                initialized: true,
                adminList: config.defaultAdminList || [],
                banList: config.defaultBanList || []
            });
        }
    }

    getBanList() {
        return this.store.get('banList') || [];
    }

    getAdminList() {
        return this.store.get('adminList') || [];
    }

    async banUser(id) {
        if (!this.getBanList().includes(id)) {
            this.store.chain.get('banList').push(id).value();
            await this.store.write();
            this.emit('banned_user', id);
        }
    }

    async unbanUser(id) {
        if (this.getBanList().includes(id)) {
            this.store.chain.get('banList').remove(id).value();
            await this.store.write();
            this.emit('unbanned_user', id);
        }
    }

    async unsetAdmin(id) {
        if (this.getAdminList().includes(id)) {
            this.store.chain.get('adminList').remove(id).value();
            await this.store.write();
            this.emit('unset_admin', id);
        }
    }

    async setAdminList(adminList) {
        this.store.chain.get('adminList').remove().union(adminList).value();
        await this.store.write();
        this.emit('changed_admin_list', this.adminList);
    }

    async setBanList(banList) {
        this.store.chain.get('banList').remove().union(banList).value();
        await this.store.write();
        this.emit('changed_ban_list', this.banList);
    }
}
