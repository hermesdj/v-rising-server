import session from "express-session";
import {loadServerConfig} from "../../config.js";
import {v4} from "uuid";
import {SessionStore} from "./session-store.js";
import {logger} from "../../logger.js";

const config = loadServerConfig();

logger.debug('init session middleware with config %j', config.api.session.params);

export const sessionMiddleware = session({
    secret: config.api.session.secret,
    ...config.api.session.params,
    genid: () => {
        return v4();
    },
    store: new SessionStore( {
        ttl: 86400
    })
});
