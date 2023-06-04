import * as os from "os";
import {logger} from "../../logger.js";
import path from "path";
import {spawn, execFile} from 'child_process';
import fs from "fs";
import pino from 'pino';
import pretty from 'pino-pretty';
import {EventEmitter, once} from "events";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const loggerDestination = './logs/process-logs.log';

export class VRisingProcess extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.process = null;
        this.platform = os.platform();

        // Process Params
        this.serverPath = '/mnt/vrising/server';
        this.exeFileName = 'VRisingServer.exe';
        this.dataPath = '/mnt/vrising/persistentdata';
        this.logFile = `${this.dataPath}/VRisingServer.log`;

        server.on('config_updated', config => this.updateConfig(config.server));
    }

    updateConfig(serverConfig) {
        this.serverPath = serverConfig.serverPath;
        this.exeFileName = serverConfig.exeFileName;
        this.dataPath = serverConfig.dataPath;
        this.logFile = serverConfig.logFile;
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

        logger.info('Spawned server process with pid %d', this.process.pid);
        this.emit('started', this.process.pid);

        this.process.stdout.on('data', (chunk) => this.processLogger.info('%s', chunk));
        this.process.stderr.on('data', (chunk) => this.processLogger.error('%s', chunk));
        this.process.on('error', err => {
            logger.error('Process error: %s', err.message);
            this.emit('process_error', err);
        })
        this.process.on('exit', (code) => {
            logger[code === 0 ? 'info' : 'error']('VRising process exited with code %d', code);
            this.emit('process_stopped', code);
            this.process = null;
        });
    }

    _initProcessLogger() {
        if (fs.existsSync(loggerDestination)) {
            fs.unlinkSync(loggerDestination);
        }
        const streams = [
            {
                level: 'info',
                stream: pretty({
                    colorize: true,
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

    _resolveShScript(name) {
        return path.resolve(__dirname, '..', '..', 'bin', name);
    }

    _startLinuxProcess() {
        const linuxArgs = [
            '-p', this.dataPath,
            '-s', this.serverPath,
            '-l', this.logFile
        ];
        logger.info('Starting VRising server on linux platform with args %j', linuxArgs);
        this.process = spawn(this._resolveShScript('start.sh'), linuxArgs, {
            env: process.env
        });
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
            env: process.env
        });
    }

    _exeFile(filePath, args = []) {
        return new Promise((resolve, reject) => {
            execFile(filePath, args, (err, data, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({stdout, stderr});
                }
            })
        })
    }

    async stopProcess() {
        if (!this.isStarted) {
            return;
        }
        this.process.kill('SIGTERM');
        await once(this.process, 'exit');

        if (this.platform === "linux") {
            logger.debug('Using stop_server.sh');
            await this._exeFile(this._resolveShScript('stop_server.sh'));
        }
    }
}
