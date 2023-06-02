import {DbManager} from "../src/db-manager.js";

(async () => {
    const store = DbManager.createFlatDb('game-users-db');
    await DbManager.initAllDatabases();

    await store.set('key', 'value');

    console.log(store.get('key'));
})()
