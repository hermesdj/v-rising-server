import * as fs from "fs";
import {Tail} from 'tail';
import {logger} from "../../logger.js";
import * as os from "os";
import {EventEmitter, on} from 'events';
import pretty from "pino-pretty";
import pino from "pino";
import {waitForFile} from "../utils.js";

const loggerDestination = './logs/v-server-logs.log'

export class LogWatcher extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.tail = null;
        this.logFilePath = null;
        this.waitForFileTimeout = 600000;

        server.on('config_updated', config => this.onConfig(config.server));
        server.on('server_stopped', () => this.stopWatching());
    }

    onConfig(serverConfig) {
        if (this.logFilePath !== serverConfig.logFile && this.isWatching) {
            this.stopWatching();
        }

        this.logFilePath = serverConfig.logFile;
        this.waitForFileTimeout = serverConfig.logWatcher && serverConfig.logWatcher.waitForFileTimeout
            ? serverConfig.logWatcher.waitForFileTimeout
            : this.waitForFileTimeout;

        if (!this.isWatching && this.server.processManager.isStarted) {
            this.startWatching().catch(err => logger.error('Error watching log file : %s', err.message));
        }
    }

    get isWatching() {
        return this.tail && this.tail.isWatching;
    }

    async startWatching() {
        if (this.tail && !this.isWatching) {
            this.resumeWatching();
            return;
        }

        if (!this.logFilePath) {
            throw new Error('Log file path is not initialized !');
        }

        logger.info('Start watching server logs...');
        if (fs.existsSync(loggerDestination)) {
            logger.debug('Deleting existing log %s', loggerDestination);
            fs.unlinkSync(loggerDestination);
        }

        const serverLogStream = pretty({
            colorize: true,
            destination: loggerDestination
        });

        this.serverLogger = pino({level: 'info', name: 'server'}, serverLogStream);

        const fileExists = await waitForFile(this.logFilePath, this.waitForFileTimeout);

        if (!fileExists) {
            logger.error('Log file %s does not exists after a timeout of %d ms', this.logFilePath, this.waitForFileTimeout);
            throw new Error('Log file does not exists after timeout !');
        }

        this._watchLogLines()
            .then(() => {
                this.emit('log_watch_ended');
            })
            .catch(err => {
                this.emit('log_watch_error', err);
            });
    }

    async _watchLogLines() {
        for await (const line of this.logLines()) {
            const newLine = line.replace(/\r?\n/g, '\n');
            await this.server.logParser.parseLogLine(newLine);
            await this.server.playerManager.logParser.parseLogLine(newLine);
        }
    }

    stopWatching() {
        if (this.tail) {
            logger.debug('Stop watching logs');
            this.tail.unwatch();
            this.tail = null;
        }
    }

    pauseWatching() {
        if (this.tail) {
            logger.debug('Paused watching logs !');
            this.tail.unwatch();
        }
    }

    resumeWatching() {
        if (this.tail) {
            logger.debug('Resumed watching logs !');
            this.tail.watch();
        }
    }

    async* logLines() {
        if (this.tail) {
            this.tail.unwatch();
        }

        if (fs.existsSync(this.logFilePath)) {
            this.tail = new Tail(this.logFilePath, {
                fromBeginning: true,
                follow: true,
                useWatchFile: os.platform() === 'win32',
                logger
            });

            try {
                for await (const [line] of on(this.tail, 'line')) {
                    yield line;
                    this.serverLogger.info(line);
                }
            } catch (err) {
                logger.error('Tail error: Error tailing log file: %s', err.message);
            }
        } else {
            logger.warn('Did not find log file %s', this.logFilePath);
        }
    }
}
