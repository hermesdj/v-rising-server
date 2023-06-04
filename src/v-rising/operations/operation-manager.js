import {EventEmitter} from "events";
import path from "path";
import url from "url";
import {logger} from "../../logger.js";
import fs from "fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class VRisingOperationManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.operations = new Map();
        this.currentOperation = null;
    }

    async startOperation(name, params) {
        if (!this.operations.has(name)) {
            logger.warn('Tried to start the operation %s but it is not defined !', name);
            return false;
        }

        if (this.currentOperation) {
            logger.warn('Tried to start operation %s but operation %s is already in progress !');
        }

        const operation = this.operations.get(name);

        return operation.start(this.server, params)
            .then(({success, background}) => {
                if (background === true) {
                    logger.debug('Operation is set to run in the background');
                } else {
                    this.currentOperation = name;
                    operation.once('finished', () => this.currentOperation = null);
                }
                return success;
            });
    }

    async stopCurrentOperation() {
        if (!this.currentOperation) return false;
        return this.stopOperation(this.currentOperation);
    }

    async stopOperation(name) {
        if (!this.operations.has(name)) {
            logger.warn('Tried to stop the operation %s but it is not defined !', name);
            return false;
        }

        const operation = this.operations.get(name);

        return operation.stop(this.server);
    }

    async loadOperations() {
        const operationsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(operationsPath).filter(file => file.endsWith('.js') && !file.includes('abstract-operation'));

        for (const file of commandFiles) {
            const filePath = path.join(operationsPath, file);
            const name = path.basename(file, path.extname(file));
            logger.debug('importing operation %s', name);
            const operation = await import(`file://${filePath}`);

            if ('start' in operation && 'stop' in operation) {
                this.operations.set(name, operation);
            } else {
                logger.warn(`[WARNING] The operation ${name} is missing the required function "start" or "stop".`)
            }
        }

        logger.info('Initialized %d operations', this.operations.size);
    }
}
