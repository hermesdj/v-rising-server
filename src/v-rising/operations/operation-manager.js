import {EventEmitter} from "events";
import path from "path";
import url from "url";
import {logger} from "../../logger.js";
import fs from "fs";
import {DbManager} from "../../db-manager.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class VRisingOperationManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.operations = new Map();
        this.currentOperation = null;
        this.store = DbManager.createDb('operations-db', 'operations');
    }

    async startOperation(name, user, params) {
        if (!this.operations.has(name)) {
            logger.warn('Tried to start the operation %s but it is not defined !', name);
            return false;
        }

        if (this.currentOperation) {
            logger.warn('Tried to start operation %s but operation %s is already in progress !', this.currentOperation);
            return false;
        }

        const operation = this.operations.get(name);

        logger.info('Operation %s started by %s with params %j', name, user.username, params);

        return operation.start(user, params)
            .then((operationInfo) => {
                if (operationInfo.background === true) {
                    logger.debug('Operation is set to run in the background');
                } else {
                    this.currentOperation = name;
                    operation.once('operation_finished', () => {
                        this.currentOperation = null;
                    });
                }
                this.emit('operation_started', operationInfo);
                return operationInfo;
            });
    }

    async stopCurrentOperation(user) {
        if (!this.currentOperation) return false;
        return this.stopOperation(this.currentOperation, user);
    }

    async stopOperation(name, user) {
        if (!this.operations.has(name)) {
            logger.warn('Tried to stop the operation %s but it is not defined !', name);
            return false;
        }

        const operation = this.operations.get(name);

        return operation.stop(user);
    }

    getState(name) {
        if (!this.operations.has(name)) {
            throw new Error(`No operation with name ${name}`)
        }

        return this.operations.get(name).getState();
    }

    getCurrentState() {
        if (!this.currentOperation) {
            return null;
        }
        return this.getState(this.currentOperation);
    }

    async loadOperations() {
        const operationsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(operationsPath).filter(file => file.endsWith('.js') && !file.includes('abstract-operation'));

        for (const file of commandFiles) {
            const filePath = path.join(operationsPath, file);
            const name = path.basename(file, path.extname(file));
            logger.debug('importing operation %s', name);
            const OperationClass = await import(`file://${filePath}`);

            const operation = new OperationClass.default(name, this.server, this);

            if ('start' in operation && 'stop' in operation) {
                operation.name = name;
                this.operations.set(name, operation);
                operation.on('operation_info_updated', operationInfo => this.emit('operation_info_updated', operationInfo));
                operation.on('operation_scheduled_with_period', operationInfo => this.emit('operation_scheduled_with_period', operationInfo));
                operation.on('operation_scheduled', operationInfo => {
                    if (this.currentOperation !== operationInfo.name) {
                        logger.warn('Stopping operation %s because %s is already running', operationInfo.name, this.currentOperation);
                        this.operations.get(operationInfo.name).stop();
                    } else {
                        this.emit('operation_scheduled', operationInfo)
                    }
                });
                operation.on('operation_success', operationInfo => this.emit('operation_success', operationInfo));
                operation.on('operation_error', info => this.emit('operation_error', info));
                operation.on('operation_finished', operationInfo => this.emit('operation_finished', operationInfo));
                operation.on('operation_progress', operationInfo => this.emit('operation_progress', operationInfo));
            } else {
                logger.warn(`[WARNING] The operation ${name} is missing the required function "start" or "stop".`)
            }
        }

        logger.info('Initialized %d operations', this.operations.size);
    }
}
