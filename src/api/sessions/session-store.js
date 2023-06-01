import session from "express-session";
import {DbManager} from "../../db-manager.js";

const {Store} = session;

export class SessionStore extends Store {
    constructor(db, options = {}) {
        super(options);
        this.ttl = options.ttl || 86400;
        this.db = DbManager.createDb('session-db', 'sessions');

        if (!options.disablePurge) {
            setInterval(async () => {
                const now = Date.now();
                await this.db.delete((obj) => now > obj.expires);
            }, 60000);
        }
    }

    _wrap(cb, promise) {
        return promise.then((res) => cb(null, res)).catch(err => cb(err));
    }

    all(cb) {
        cb(null, this.db.all().then(sessions => sessions.map(({session}) => session)));
    }

    clear(cb) {
        this._wrap(cb, this.db.clear());
    }

    destroy(sid, cb) {
        this._wrap(cb, this.db.delete(sid));
    }

    get(sid, cb) {
        const obj = this.db.get(sid);
        cb(null, obj ? obj.session : null);
    }

    length(cb) {
        cb(null, this.db.length());
    }

    async updateSession(sid, session) {
        const expires = Date.now() + this.ttl * 1000;
        const obj = {id: sid, session, expires};
        return this.db.set(sid, obj);
    }

    set(sid, session, cb) {
        this._wrap(cb, this.updateSession(sid, session));
    }

    touch(sid, session, cb) {
        this.set(sid, session, cb);
    }
}
