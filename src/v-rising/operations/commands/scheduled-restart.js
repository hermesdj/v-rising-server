import AbstractServerOperation from "./abstract-operation.js";

export default class ScheduledRestart extends AbstractServerOperation {
    constructor(server) {
        super(server);
        this.updateOperationInfo({
            type: 'restart',
            isRestart: true
        });
    }

    async start(user, {delay}) {
        return this.scheduleOperation(user, delay);
    }

    async executeOperation() {
        console.log('Executing operation restart !');
    }
}
