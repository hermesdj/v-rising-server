import * as fs from "fs";
import {Tail} from 'tail';
import {vRisingServer} from "./server.js";
import {logger} from "../logger.js";
import * as os from "os";

let tail = null;

export const watchLogFileChanges = async (logFilePath) => {
    if (tail) {
        tail.unwatch();
    }

    logger.debug('Opening log file %s', logFilePath);

    if (fs.existsSync(logFilePath)) {
        try {
            tail = new Tail(logFilePath, {
                fromBeginning: true,
                follow: true,
                useWatchFile: os.platform() === 'win32',
                logger
            });

            tail.on('line', async (line) => {
                await vRisingServer.parseLogLine(line);
            });

            tail.on('error', (err) => {
                logger.error('tailing file error: ', err);
            });

            tail.watch();
        } catch (ex) {
            logger.error('Error tailing log file', ex);
        }
    } else {
        logger.warn('No log file found on path %s', logFilePath);
    }
}

export const stopWatchingLog = () => {
    if (tail) tail.unwatch();
}
