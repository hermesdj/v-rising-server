import passport from "passport";
import {Strategy as SteamStrategy} from "passport-steam";
import {UserStore} from "./user-store.js";
import {loadServerConfig} from "../../config.js";

const config = loadServerConfig();

export const userStore = new UserStore(config);

passport.use('steam',
    new SteamStrategy({
        returnURL: config.api.auth.returnURL,
        realm: config.api.auth.realm,
        apiKey: config.api.auth.steamApiKey
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
