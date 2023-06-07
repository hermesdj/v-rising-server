import * as os from "os";
import {logger} from "../../logger.js";
import path from "path";
import {exec, spawn} from 'child_process';
import fs from "fs";
import pino from 'pino';
import pretty from 'pino-pretty';
import {EventEmitter, once} from "events";
import url from "url";
import {killAllSubProcesses} from "../utils.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const loggerDestination = './logs/process-logs.log';


export class VRisingProcess extends EventEmitter {
    constructor(config, server) {
        super();
        this.server = server;
        this.process = null;
        this.platform = os.platform();

        // Process Params
        this.serverPath = '/mnt/vrising/server';
        this.exeFileName = 'VRisingServer.exe';
        this.dataPath = '/mnt/vrising/persistentdata';
        this.logFile = `${this.dataPath}/VRisingServer.log`;
        this.steamUpdateState = {
            processing: false,
            installProgress: 0,
            installedBytes: 0,
            totalBytes: -1,
            success: false
        }
        this.steamCmdUpdater = new SteamCmdUpdater(config, this);

        this.updateConfig(config)

        server.on('config_updated', config => this.updateConfig(config));
    }

    resetSteamState() {
        this.updateSteamState({
            processing: false,
            installProgress: 0,
            installedBytes: 0,
            totalBytes: -1,
            success: false
        });
    }

    updateSteamState(data) {
        this.steamUpdateState = {
            ...this.steamUpdateState,
            ...data
        };

        logger.debug('New Steam Update Info %j', this.steamUpdateState);
        this.emit('steam_state_updated', this.steamUpdateState);
    }

    updateConfig(config) {
        this.serverPath = path.resolve(config.server.serverPath);
        this.exeFileName = config.server.exeFileName;
        this.dataPath = path.resolve(config.server.dataPath);
        this.logFile = path.resolve(config.server.logFile);
        this.steamCmdUpdater.updateConfig(config);
    }

    get isStarted() {
        return this.process && this.process.pid;
    }

    async startProcess() {
        if (this.process && this.process.pid) {
            throw new Error('A Process is already running');
        }

        if (fs.existsSync(this.logFile)) {
            logger.info('Deleting existing server log file before starting process : %s', this.logFile);
            await fs.promises.unlink(this.logFile);
        }

        this._initProcessLogger();

        await this._updateServer();
        await this._checkMods();
        await this._startProcess();

        logger.info('Spawned server process with pid %d', this.process.pid);
        this.emit('started', this.process.pid);

        this.process.stdout.on('data', (chunk) => {
            const str = chunk.toString('utf8');
            if (!str.startsWith('Streamed scene')) {
                this.processLogger.info('%s', str.replace(/\r?\n/g, ''));
            }
        });
        this.process.stderr.on('data', (chunk) => this.processLogger.error('%s', chunk));
        this.process.on('error', err => {
            logger.error('Process error: %s', err.message);
            this.emit('process_error', err);
        })
        this.process.on('exit', (code) => {
            if (!code) code = 0;
            if (code === 0) {
                logger.info('VRising process exited without error');
            } else {
                logger.error('VRising process exited with error code %d', code);
            }
            this.emit('process_stopped', code);
            this.process = null;
        });
    }

    async _updateServer() {
        this.resetSteamState();
        return this.steamCmdUpdater.runSteamUpdate();
    }

    async _checkMods() {
        this.emit('mods_check');
        await this.server.modManager.beforeStart();
    }

    async _startProcess() {
        switch (this.platform) {
            case 'win32':
                this._startWinProcess();
                break;
            case 'linux':
                this._startLinuxProcess();
                break;
            default:
                throw new Error('Cannot start VRising server on a platform that is not win32 or linux');
        }
    }

    _initProcessLogger() {
        if (fs.existsSync(loggerDestination)) {
            fs.unlinkSync(loggerDestination);
        }
        const streams = [
            {
                level: 'info',
                stream: pretty({
                    colorize: process.env.NODE_ENV === 'production',
                    destination: loggerDestination
                }),
            },
            {
                level: 'info',
                stream: pretty({
                    colorize: true
                })
            }
        ];

        this.processLogger = pino({level: 'info', name: 'process'}, pino.multistream(streams));
    }

    _resolveScript(name) {
        return path.join(this.cwd(), name);
    }

    _startLinuxProcess() {
        const args = [
            '-p', this.dataPath,
            '-s', this.serverPath,
            '-l', this.logFile
        ];
        logger.info('Starting VRising server on linux platform with args %j', args);
        this.process = spawn(this._resolveScript('start.sh'), args);
    }

    _startWinProcess() {
        if (!this.serverPath || !this.exeFileName) {
            throw new Error('Config is not initialized !');
        }

        const fullExeFilePath = path.join(this.serverPath, this.exeFileName);

        const winArgs = [
            '-persistentDataPath', this.dataPath,
            '-logFile', this.logFile
        ];
        logger.debug('Starting VRising server on win32 platform with file path %s and args %j', fullExeFilePath, winArgs);
        this.process = spawn(fullExeFilePath, winArgs, {
            cwd: this.projectCwd()
        });
    }

    cwd() {
        return path.resolve(__dirname, '..', '..', '..', 'bin');
    }

    projectCwd() {
        return path.resolve(__dirname, '..', '..', '..');
    }

    async stopProcess() {
        if (!this.isStarted) {
            return;
        }
        this.emit('exiting');

        try {
            killAllSubProcesses(this.process.pid, 'SIGTERM').then(() => logger.debug('Subprocesses killed'));
            await once(this.process, 'exit');
        } catch (err) {
            logger.error('Error killing process %s', err.message);
            this.process.kill('SIGTERM');
            await once(this.process, 'exit');
        }

        this.resetSteamState();
    }
}

class SteamCmdUpdater {
    constructor(config, processManager) {
        this.processManager = processManager;
        this.platform = os.platform();

        this.steamCmdExePath = '/usr/bin/steamcmd';
        this.steamAppId = 1829350;
        this.validateSteamApp = true;

        this.errorCodes = new Map(Object.entries({
            '0x2': 'Unknown error 2',
            '0x6': 'No connection to content servers.',
            '0x10E': 'Seems to affect HLDS based servers. Running again often fixes the issue',
            '0x202': 'Not enough disk space.',
            '0x206': 'Unknown Error 518',
            '0x212': 'Not enough disk space.',
            '0x402': 'Connection issue with steam, you will need to wait for the steam servers to recover.',
            '0x602': 'Unknown error 1538',
            '0x606': 'SteamCMD is unable to write to the disk. Normally caused by permissions issues. This issue was discovered when a directory that was linked using symlink did not have the correct permissions to allow SteamCMD to write to it.',
        }));

        this.regexpArray = [
            {
                regex: /Loading\sSteam\sAPI.{0,3}(\w*)/gm,
                parse: ([, ok]) => {
                    this.processManager.updateSteamState({
                        processing: ok === 'OK'
                    })
                }
            },
            {
                regex: /\sUpdate\sstate\s\(([0-9]x[0-9]*\w?)\)\s(.*),\sprogress:\s([0-9]{1,2}.[0-9]{1,2})\s\((\d*)\s\/\s(\d*)/gm,
                parse: ([, state, activity, progressPercent, byteLoaded, byteTotal]) => {
                    this.processManager.updateSteamState({
                        processing: true,
                        state,
                        activity,
                        installProgress: parseFloat(progressPercent),
                        installedBytes: parseInt(byteLoaded),
                        totalBytes: parseInt(byteTotal)
                    })
                }
            },
            {
                regex: /Success!\sApp\s'(\d*)'\sfully\sinstalled./gm,
                parse: ([, appId]) => {
                    this.processManager.updateSteamState({
                        processing: false,
                        installProgress: 1,
                        installedBytes: this.processManager.steamUpdateState.totalBytes,
                        success: true,
                        appId
                    });
                }
            },
            {
                regex: /Error!\sApp\s'(\d*)'\sstate\sis\s([0-9]x[0-9]*\w?)\safter\supdate\sjob./gm,
                parse: ([, appId, errorCode]) => {
                    this.processManager.updateSteamState({
                        success: false,
                        appId,
                        error: this.parseErrorCode(errorCode)
                    })
                }
            }
        ];

        this.updateConfig(config);
    }

    updateConfig(config) {
        this.steamCmdExePath = path.resolve(config.steam.cmd.exePath);
        this.steamAppId = config.steam.cmd.appId;
        this.validateSteamApp = config.steam.cmd.validate;
    }

    async runSteamUpdate() {
        const command = `${this.steamCmdExePath} +@sSteamCmdForcePlatformType windows +force_install_dir ${this.processManager.serverPath} +login anonymous +app_update ${this.steamAppId} ${this.validateSteamApp ? 'validate' : ''} +quit`;
        logger.debug('Executing command %s', command);
        return this._exec(command);
    }

    _exec(command) {
        return new Promise((resolve, reject) => {
            this.process = exec(command, (err, stdout, stderr) => {
                if (err) {
                    return reject(err);
                }
                resolve({stdout, stderr});
            });

            this.process.stdout.on('data', async data => {
                const str = data.toString('utf8').replaceAll(/\r?\n\r?\n\s*/gm, '\n');
                this.processManager.processLogger.info(str);
                await this.parseLogLine(str);
            });
            this.process.stderr.on('data', data => this.processManager.processLogger.warn(data));
        });
    }

    parseErrorCode(hexaErrorCode) {
        if (!this.errorCodes.has(hexaErrorCode)) {
            logger.warn('Unknown steam state code %s', hexaErrorCode);
            return 'Unknown';
        } else {
            return this.errorCodes.get(hexaErrorCode);
        }
    }

    async parseLogLine(line) {
        for (const {regex, parse} of this.regexpArray) {
            let matches = null;
            while (matches = regex.exec(line)) {
                if (matches && matches.length > 0) {
                    await parse(matches);
                }
            }

            regex.lastIndex = 0;
        }
    }
}
