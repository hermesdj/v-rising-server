import {EventEmitter} from "events";

export class VRisingOperationManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
    }
}
