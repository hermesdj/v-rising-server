import {ThunderstoreApiClient} from "./thunderstore-api-client.js";
import {EventEmitter} from "events";

export class VRisingModManager extends EventEmitter {
    constructor(server, config) {
        super();
        this.server = server;
        this.api = new ThunderstoreApiClient(config.server.mods.thunderstore);
    }

    listAllMods() {
        return this.api.fetchAllMods();
    }

    getModInfo(id) {
        return this.api.getModByUuid(id);
    }
}
