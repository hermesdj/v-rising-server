import passport from "passport";
import {Strategy as SteamStrategy} from "passport-steam";
import {UserStore} from "./user-store.js";
import path from "path";
import url from "url";
import {JSONFile} from "lowdb/node";
import {Low} from "lowdb";
import {loadServerConfig} from "../config.js";

const config = loadServerConfig();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const usersFile = path.resolve(path.join(__dirname, '..', '..', 'data', 'users-db.json'));

const adapter = new JSONFile(usersFile);
export const db = new Low(adapter, {users: []});

export const userStore = new UserStore(db, config);

passport.use('steam',
    new SteamStrategy({
        returnURL: config.api.auth.returnURL,
        realm: config.api.auth.realm,
        apiKey: process.env.STEAM_API_KEY
    }, (identifier, profile, done) => {
        userStore.authenticateSteamUser(profile)
            .then(user => done(null, user))
            .catch(err => done(err));
    })
);

passport.serializeUser((user, cb) => {
    const serialized = userStore.serializeUser(user);
    cb(null, serialized);
});

passport.deserializeUser(async (id, cb) => {
    await userStore.deserializeUser(id)
        .then(user => cb(null, user))
        .catch(err => cb(err));
});
