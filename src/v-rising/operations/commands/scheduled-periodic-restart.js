import ScheduledRestart from "./scheduled-restart.js";

export default class ScheduledPeriodicRestart extends ScheduledRestart {
    constructor(name, server, manager) {
        super(name, server, manager);
        this.initOperationInfo({
            delay: 10
        });
    }

    async start(user, {delay, cronStr, timeZone = 'Europe/Paris'}) {
        this.updateOperationInfo({delay});
        return this.schedulePeriodicOperation(cronStr, timeZone);
    }

    async executePeriodicOperation() {
        await this.operationManager.startOperation('scheduled-restart', this.operationInfo.user, {
            delay: this.operationInfo.delay || 10
        });
    }
}
