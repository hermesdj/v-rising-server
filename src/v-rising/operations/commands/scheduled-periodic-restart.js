import AbstractServerOperation from "./abstract-operation.js";

export default class ScheduledPeriodicRestart extends AbstractServerOperation {
    constructor(server){
        super(server);
    }
}
