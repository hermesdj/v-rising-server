import {logger} from "../../logger.js";
import lodash from "lodash";
import {DbManager} from "../../db-manager.js";

export class UserStore {
    constructor(server) {
        this.db = DbManager.createDb('users-db', 'users');
        this.server = server;
    }

    /**
     * Authenticate an user using the Steam parameters
     * @param profile
     * @returns user if auth OK, false otherwise
     */
    async authenticateSteamUser(profile) {
        const {_json} = profile;
        const {steamid: id, personaname: username} = _json;
        logger.trace('Authenticating Steam User with ID %s and username %s', id, username);
        let user = this.db.get(id);

        if (!user) {
            // Check if user is admin
            const isAdmin = this.server.userManager.isAdmin(id);
            const isPlayer = this.server.playerManager.isPlayer(id);
            const isBanned = this.server.userManager.isBanned(id);

            user = {id, username, isAdmin, isPlayer};

            if (!isAdmin && !isPlayer) {
                logger.warn('User with Steam ID %s tried to authenticate and is not a player or an admin !', id);
                return false;
            }

            if (isBanned) {
                logger.warn('User with Steam ID %s tried to authenticate but he is banned !', id);
                return false;
            }

            await this.db.set(id, user);
        }

        return user;
    }

    serializeUser(user) {
        return user.id;
    }

    async deserializeUser(id) {
        return this.db.get(id);
    }
}
