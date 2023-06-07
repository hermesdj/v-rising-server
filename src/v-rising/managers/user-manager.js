import {EventEmitter} from "events";
import {DbManager} from "../../db-manager.js";

export class VRisingUserManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.store = DbManager.createFlatDb('game-users-db');

        this.lastAppliedAdminList = null;
        this.lastAppliedBanList = null;

        server.on('server_started', () => this.onServerStarted());
        server.on('server_stopped', () => this.onServerStopped());
    }

    onServerStarted() {
        this.lastAppliedAdminList = [...this.getAdminList()];
        this.lastAppliedBanList = [...this.getBanList()];
    }

    onServerStopped() {
        this.lastAppliedAdminList = null;
        this.lastAppliedBanList = null;
    }

    isInitialized() {
        return this.store.get('initialized') === true;
    }

    getState() {
        return {
            adminList: {
                current: this.getAdminList(),
                lastApplied: this.lastAppliedAdminList
            },
            banList: {
                current: this.getBanList(),
                lastApplied: this.lastAppliedBanList
            }
        }
    }

    async initUserManager(adminList = [], banList = []) {
        if (!this.isInitialized()) {
            await this.store.assign({
                initialized: true,
                adminList,
                banList
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
            return {changed: true, result: this.getState()};
        } else {
            return {changed: false}
        }
    }

    async unbanUser(id) {
        if (this.getBanList().includes(id)) {
            this.store.chain.get('banList').remove(id).value();
            await this.store.write();
            this.emit('unbanned_user', id);
            return {changed: true, result: this.getState()};
        } else {
            return {changed: false}
        }
    }

    async setAdmin(id) {
        if (!this.getAdminList().includes(id)) {
            this.store.chain.get('adminList').push(id).value();
            await this.store.write();
            this.emit('set_admin', id);
            return {changed: true, result: this.getState()};
        } else {
            return {changed: false}
        }
    }

    async unsetAdmin(id) {
        if (this.getAdminList().includes(id)) {
            this.store.chain.get('adminList').remove(id).value();
            await this.store.write();
            this.emit('unset_admin', id);
            return {changed: true, result: this.getState()};
        } else {
            return {changed: false}
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

    isAdmin(steamID) {
        return this.store.get('adminList').includes(steamID);
    }

    isBanned(steamID) {
        return this.store.get('banList').includes(steamID);
    }
}
