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

        return operation.start(user, params)
            .then((operationInfo) => {
                if (operationInfo.background === true) {
                    logger.debug('Operation is set to run in the background');
                } else {
                    this.currentOperation = name;
                    operation.once('operation_finished', () => this.currentOperation = null);
                }
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

    async loadOperations() {
        const operationsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(operationsPath).filter(file => file.endsWith('.js') && !file.includes('abstract-operation'));

        for (const file of commandFiles) {
            const filePath = path.join(operationsPath, file);
            const name = path.basename(file, path.extname(file));
            logger.debug('importing operation %s', name);
            const OperationClass = await import(`file://${filePath}`);

            const operation = new OperationClass.default();

            if ('start' in operation && 'stop' in operation) {
                this.operations.set(name, operation);
            } else {
                logger.warn(`[WARNING] The operation ${name} is missing the required function "start" or "stop".`)
            }
        }

        logger.info('Initialized %d operations', this.operations.size);
    }
}
