import AbstractServerOperation from "./abstract-operation.js";

export default class ScheduledWipe extends AbstractServerOperation {
    constructor(name, server, manager) {
        super(name, server, manager);
    }
}
