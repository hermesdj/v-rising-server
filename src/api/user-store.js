import {logger} from "../logger.js";
import lodash from "lodash";
import {vRisingServer} from "../v-rising/server.js";
import {getAdminList} from "../v-rising/users.js";

export class UserStore {
    constructor(db, config) {
        this.db = new Users(db);
        this.config = config;
    }

    /**
     * Authenticate an user using the Steam parameters
     * @param profile
     * @returns user if auth OK, false otherwise
     */
    async authenticateSteamUser(profile) {
        const {_json} = profile;
        const {steamid: id, personaname: username} = _json;
        logger.debug('Authenticating Steam User with ID %s and username %s', id, username);
        let user = this.db.get(id);

        if (!user) {
            // Check if user is admin
            const isAdmin = await this.isAdmin(id);

            if (!isAdmin) {
                logger.warn('User with Steam ID %s tried to authenticate and is not an admin !', id);
                return false;
            }

            user = {id, username};

            await this.db.set(id, user);
        }

        return user;
    }

    async isAdmin(steamId) {
        let adminList = vRisingServer.adminList;

        if (!adminList) {
            adminList = await getAdminList(this.config);
        }

        console.log(steamId, adminList);

        return adminList && Array.isArray(adminList) && adminList.some(id => lodash.isEqual(id, steamId));
    }

    serializeUser(user) {
        return user.id;
    }

    async deserializeUser(id) {
        return this.db.get(id);
    }
}

class Users {
    constructor(db) {
        this.db = db;
        this.chain = lodash.chain(db).get('data').get('users');
    }

    get(id) {
        logger.debug('retrieve user with id %s', id);
        const obj = this.chain.find({id}).cloneDeep().value();
        return obj ? obj.user : null;
    }

    async set(id, user) {
        const obj = {id, user};
        const found = this.chain.find({id});
        if (found.value()) {
            found.assign(obj).value();
            await this.db.write();
        } else {
            this.chain.push(obj).value();
            await this.db.write();
        }
    }

    async delete(id) {
        this.chain.remove({id}).value();
        await this.db.write();
    }

    async clear() {
        this.chain.remove().value();
        await this.db.write();
    }
}
