import {Low} from "lowdb";
import path from "path";
import url from "url";
import {JSONFile} from "lowdb/node";
import lodash from "lodash";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class DbManager {
    static databases = new Map();

    static initAdapter(dbName) {
        const dbFile = path.resolve(path.join(__dirname, '..', 'data', `${dbName}.json`));
        return new JSONFile(dbFile);
    }

    /**
     * Create a new LowDB using ${dbName}.json as file name and using {[collection]: []} as default value
     * @param dbName
     * @param collection
     * @returns {DbWrapper}
     */
    static createDb(dbName, collection) {
        if (this.databases.has(dbName)) return this.databases.get(dbName);

        const db = new Low(this.initAdapter(dbName), {[collection]: []});

        const wrapped = new DbWrapper(db, collection);

        this.databases.set(dbName, wrapped);

        return wrapped;
    }

    static createFlatDb(dbName) {
        if (this.databases.has(dbName)) return this.databases.get(dbName);
        const db = new Low(this.initAdapter(dbName), {});

        const wrapped = new FlatDbWrapper(db);

        this.databases.set(dbName, wrapped);

        return wrapped;
    }

    static async initAllDatabases() {
        for (const [, db] of this.databases.entries()) {
            await db.read();
        }
    }
}

class AbstractDbWrapper {
    constructor(db) {
        this.db = db;
    }

    async read() {
        return this.db.read().then(() => {
            this.initialized = true;
            return this;
        });
    }

    async write() {
        await this.db.write();
        return this;
    }
}

class DbWrapper extends AbstractDbWrapper {
    constructor(db, collection) {
        super(db);
        this.initialized = false;
        this.chain = lodash.chain(db).get('data').get(collection);
    }

    async read() {
        return this.db.read().then(() => {
            this.initialized = true;
            return this;
        });
    }

    async write() {
        await this.db.write();
        return this;
    }

    all() {
        return this.chain
            .cloneDeep()
            .map((obj) => obj.document)
            .value();
    }

    length() {
        return this.chain.size().value();
    }

    has(id) {
        return this.chain.find({id}).value() !== undefined;
    }

    get(id) {
        const obj = this.chain.find({id}).cloneDeep().value();
        return obj ? obj.document : null;
    }

    tmpSet(id, document) {
        const obj = {id, document};
        const found = this.chain.find({id});
        if (found.value()) {
            found.assign(obj).value();
        } else {
            this.chain.push(obj).value();
        }
    }

    async set(id, document) {
        this.tmpSet(id, document);
        await this.db.write();
    }

    async delete(id) {
        if (lodash.isFunction(id)) {
            this.chain.remove(({document}) => id(document)).value();
        } else {
            this.chain.remove({id}).value();
        }
        await this.db.write();
    }

    async clear() {
        this.chain.remove().value();
        await this.db.write();
    }
}

class FlatDbWrapper extends AbstractDbWrapper {
    constructor(db) {
        super(db);
        this.initialized = false;
        this.chain = lodash.chain(db).get('data');
    }

    async read() {
        return this.db.read().then(() => {
            this.initialized = true;
            return this;
        });
    }

    async write() {
        await this.db.write();
        return this;
    }

    async set(key, value) {
        const result = this.chain.set(key, value).value();
        await this.write();
        return result;
    }

    async assign(obj) {
        this.chain.assign(obj).value();
        await this.write();
    }

    get(key) {
        return this.chain.get(key).value();
    }
}
