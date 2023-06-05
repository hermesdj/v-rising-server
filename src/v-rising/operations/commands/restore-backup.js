import AbstractServerOperation from "./abstract-operation.js";

export default class RestoreBackup extends AbstractServerOperation {
    constructor(server){
        super(server);
    }
}
