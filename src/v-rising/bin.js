import * as os from "os";
import {logger} from "../logger.js";
import path from "path";
import {spawn} from 'child_process';
import {stopWatchingLog, watchLogFileChanges} from "./logs.js";
import fs from "fs";
import {waitForFile} from "./utils.js";
import {vRisingServer} from "./server.js";

let serverProcess;

export const startVRisingServerExecution = async (config) => {
    const platform = os.platform();

    const fullExeFilePath = path.join(config.server.serverPath, config.server.exeFileName);
    const args = [
        '-persistentDataPath', config.server.dataPath,
        '-serverName', config.server.name,
        '-saveName', config.server.saveName,
        '-logFile', config.server.logFile,
        config.server.gamePort,
        config.server.queryPort
    ];

    if (fs.existsSync(config.server.logFile)) {
        fs.unlinkSync(config.server.logFile);
    }

    const options = {};

    switch (platform) {
        case 'win32':
            logger.debug('Starting VRising server on win32 platform with file path %s and args %j', fullExeFilePath, args);
            serverProcess = spawn(fullExeFilePath, args, options);

            serverProcess.on('message', message => logger.info('Server Message', message));
            serverProcess.on('exit', () => logger.info('Server process has been closed'));
            break;
        case 'linux':
            logger.info('Starting VRising server on linux platform');
            serverProcess = spawn('./start.sh', {
                env: {
                    ...process.env,
                    SERVERNAME: config.server.name,
                    TZ: config.server.tz,
                    WORLDNAME: config.server.saveName,
                    GAMEPORT: config.server.gamePort,
                    QUERYPORT: config.server.queryPort
                }
            })
            break;
        default:
            throw new Error('Cannot start VRising server on a platform that is not win32 or linux');
    }

    return new Promise(async (resolve, reject) => {
        await waitForFile(config.server.logFile);
        await watchLogFileChanges(config.server.logFile);

        vRisingServer.once('ready', (serverInfo) => {
            resolve(serverInfo);
        });
    });
};

export const stopVRisingServerExecution = async () => {
    if (!serverProcess) return;

    logger.info('Stopping VRising server process');

    return new Promise((resolve, reject) => {
        serverProcess.once('exit', () => {
            stopWatchingLog();
            vRisingServer.stopServer();
            resolve(vRisingServer.getServerInfo());
        });

        serverProcess.once('error', (err) => reject(err));

        serverProcess.kill();
    })
};

export const scheduledStop = async () => {

};
