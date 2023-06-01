import * as fs from "fs";
import {Tail} from 'tail';
import {logger} from "../logger.js";
import * as os from "os";
import {on} from 'events';

export class LogWatcher {
    constructor(server, logFilePath) {
        this.server = server;
        this.tail = null;
        this.logFilePath = logFilePath;
    }

    get isWatching() {
        return this.tail && this.tail.isWatching;
    }

    async watchLogFile() {
        for await (const line of this.logLines()) {
            await this.server.parseLogLine(line);
        }
    }

    stopWatching() {
        if (this.tail) {
            this.tail.unwatch();
        }
    }

    resumeWatching() {
        if (this.tail) {
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
                }
            } catch (err) {
                logger.error('Tail error: Error tailing log file: %s', err.message);
            }
        }
    }
}
