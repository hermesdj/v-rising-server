import AbstractServerOperation from "./abstract-operation.js";

export default class DeployNewSave extends AbstractServerOperation {
    constructor(name, server, manager) {
        super(name, server, manager);
    }
}
