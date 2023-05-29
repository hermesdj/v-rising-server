import session from "express-session";
import lodash from "lodash";
import {logger} from "../logger.js";

const {Store} = session;

export class LowdbSessionStore extends Store {
    constructor(db, options = {}) {
        super(options);
        this.db = new Sessions(db, options.ttl);

        if (!options.disablePurge) {
            setInterval(() => {
                this.db.purge();
            }, 60000);
        }
    }

    _wrap(cb, promise) {
        return promise.then((res) => cb(null, res)).catch(err => cb(err));
    }

    all(cb) {
        cb(null, this.db.all());
    }

    clear(cb) {
        this._wrap(cb, this.db.clear());
    }

    destroy(sid, cb) {
        this._wrap(cb, this.db.destroy(sid));
    }

    get(sid, cb) {
        cb(null, this.db.get(sid));
    }

    length(cb) {
        cb(null, this.db.length());
    }

    set(sid, session, cb) {
        this._wrap(cb, this.db.set(sid, session));
    }

    touch(sid, session, cb) {
        this.set(sid, session, cb);
    }
}

class Sessions {
    constructor(db, ttl) {
        this.db = db;
        this.chain = lodash.chain(db).get('data').get('sessions');
        this.ttl = ttl || 86400;
    }

    get(sid) {
        logger.trace('retrieve session with id %s', sid);
        const obj = this.chain.find({_id: sid}).cloneDeep().value();
        if (!obj) {
            logger.trace('session with id %s does not exists', sid);
        }
        return obj ? obj.session : null;
    }

    all() {
        return this.chain
            .cloneDeep()
            .map((obj) => obj.session)
            .value();
    }

    length() {
        return this.chain.get('sessions').size().value();
    }

    async set(sid, session) {
        const expires = Date.now() + this.ttl * 1000;
        const obj = {_id: sid, session, expires};
        const found = this.chain.find({_id: sid});
        if (found.value()) {
            found.assign(obj).value();
            await this.db.write();
            logger.trace('updated session with id %s and expires %d', sid, expires);
        } else {
            this.chain.push(obj).value();
            await this.db.write();
            logger.trace('written new session with id %s', sid);
        }
    }

    async destroy(sid) {
        this.chain.remove({_id: sid}).value();
        await this.db.write();
        logger.trace('destroyed session with id %s', sid);
    }

    async clear() {
        this.chain.remove().value();
        await this.db.write();
        logger.trace('cleared session store');
    }

    async purge() {
        const now = Date.now();
        this.chain.remove((obj) => now > obj.expires).value();
        await this.db.write();
        logger.trace('purged session store');
    }
}
