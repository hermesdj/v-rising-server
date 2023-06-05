import {EventEmitter} from "events";
import {i18n} from "../../../i18n.js";
import cron from "node-cron";
import dayjs from "dayjs";
import lodash from "lodash";
import {logger} from "../../../logger.js";

export default class AbstractServerOperation extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.operationInfo = {
            type: 'default',
            background: false,
            isRestart: false,
            timeout: 60000,
            scheduled: false,
            periodicSchedule: false
        };
        this.interval = null;
        this.task = null;
    }

    updateOperationInfo(info) {
        this.operationInfo = {
            ...this.operationInfo,
            ...info
        }

        this.emit('operation_info_updated', this.operationInfo);

        return this.operationInfo;
    }

    async scheduleOperation(user, delay) {
        if (delay === undefined) {
            throw new Error('The delay parameter is missing !');
        }

        if (delay < 1) {
            throw new Error('delay must be at least 1');
        }

        if (!lodash.isInteger(delay)) {
            throw new Error('delay must be an integer');
        }

        if (this.operationInfo.background) throw new Error('This is a background operation, it cannot be scheduled non periodically');
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.executeOperationProgress, this.operationInfo.timeout);

        this.updateOperationInfo({
            user,
            delayInMinutes: delay,
            totalDelay: delay * 60000,
            remainingTime: delay * 60000,
            executionTime: dayjs().add(delay, 'minute').toDate()
        });

        this.emit('operation_scheduled', this.operationInfo);

        await this.notifyStart();

        return this.operationInfo;
    }

    schedulePeriodicOperation(cronString, timezone = 'Europe/Paris') {
        if (!this.operationInfo.background) throw new Error('This is not a background operation, it cannot be scheduled periodically');
        if (this.task) {
            this.task.stop();
            this.task = null;
        }

        if (!cron.validate(cronString)) {
            throw new Error(`The cron string provided ${cronString} is not valid !`);
        }

        this.task = cron.schedule(cronString, () => this.executePeriodicOperation(), {
            timezone
        });
    }

    async executeOperationProgress() {
        const remainingTime = Math.max(this.operationInfo.remainingTime - 60000, 0);

        this.updateOperationInfo({
            remainingTime
        });

        if (this.operationInfo.remainingTime <= 0) {
            try {
                await this.executeOperation();
                this.emit('operation_success', this.operationInfo);
                await this.notifySuccess();
            } catch (err) {
                this.emit('operation_error', {operationInfo: this.operationInfo, error: err});
                await this.notifySuccess(err);
                throw err;
            } finally {
                this.emit('operation_finished', this.operationInfo);
            }
        } else {
            await this.notifyProgress(Math.round(remainingTime / 60000));
            this.emit('operation_progress', this.operationInfo);
        }
    }

    async stop(user) {
        if (this.interval) clearInterval(this.interval);
        if (this.task) {
            this.task.stop();
            this.task = null;
        }

        this.clearOperationInfo();

        await this.notifyCancelled(user);
    }

    clearOperationInfo() {
        this.operationInfo = {
            ...lodash.pick(this.operationInfo, ['type', 'background', 'isRestart', 'timeout']),
            isScheduled: false,
            periodicSchedule: false,
        };
    }

    async executeOperation() {
        throw new Error('Not Implemented !');
    }

    async executePeriodicOperation() {
        throw new Error('Not Implemented !');
    }

    _resolveTranslatedMessage(messageType, params) {
        const message = i18n.$t(`operation.${this.operationInfo.type}.messages.${messageType}`, {
            ...this.operationInfo,
            ...params
        });
        logger.debug('Operation message %s is %s', messageType, message);
        return message;
    }

    async notifyStart() {
        const message = this._resolveTranslatedMessage('start');
    }

    async notifyCancelled(user) {
        const message = this._resolveTranslatedMessage('cancelled', user);
    }

    async notifySuccess() {
        const message = this._resolveTranslatedMessage('success');
    }

    async notifyError(error) {
        const message = this._resolveTranslatedMessage('error');
    }

    async notifyProgress(remainingMinutes) {
        const message = this._resolveTranslatedMessage('progress');

        if (this.operationInfo.isRestart) {
            await this.server.rConClient.sendRestartAnnounceToVRisingServer(remainingMinutes);
        } else {
            await this.server.rConClient.sendAnnounceToVRisingServer(message);
        }
    }

    getState() {
        return this.operationInfo;
    }
}
