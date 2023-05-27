import session from "express-session";
import {loadServerConfig} from "../config.js";
import {v4} from "uuid";
import {Low} from 'lowdb';
import {JSONFile} from "lowdb/node";
import path from "path";
import url from "url";
import {LowdbSessionStore} from "./lowdb-session-store.js";
import {logger} from "../logger.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const sessionFile = path.resolve(path.join(__dirname, '..', '..', 'data', 'session-db.json'));

const adapter = new JSONFile(sessionFile);
export const db = new Low(adapter, {sessions: []});

const config = loadServerConfig();

logger.debug('init session middleware with config %j', config.api.session.params);

export const sessionMiddleware = session({
    secret: config.api.session.secret,
    ...config.api.session.params,
    genid: () => {
        return v4();
    },
    store: new LowdbSessionStore(db, {
        ttl: 86400
    })
});
