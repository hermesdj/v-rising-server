import * as fs from "fs";
import {Tail} from 'tail';
import {vRisingServer} from "./server.js";
import {logger} from "../logger.js";
import * as os from "os";

const regexpArray = [
    {
        regex: /Bootstrap - Time: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}), Version: (.*)/g,
        parse: (matches) => {
            vRisingServer.parseServerInfo(matches);
        }
    },
    {
        regex: /SteamPlatformSystem -  Setting Product and Modir: V Rising\n/g,
        parse: (matches, buffer) => {
            console.log('Matched steam platform system, content is %d lines', buffer.length);
            const content = buffer.join('\n');
            const regex = /Loaded ServerHostSettings:((.*|\n)*\n  }\n}\n)/gm;

            if (regex.test(content)) {
                regex.lastIndex = 0;
                matches = regex.exec(content);
                console.log('Matched ServerHostSettings', matches);
            }
        }
    },
    {
        regex: /Setting breakpad minidump AppID = (\d*)/g,
        parse: (matches) => {
            vRisingServer.parseAppId(matches);
        }
    },
    {
        regex: /assigned identity steamid:([0-9]+)/g,
        parse: (matches) => {
            vRisingServer.parseAssignedIdentity(matches);
        }
    },
    {
        regex: /SteamPlatformSystem - Server connected to Steam successfully!/g,
        parse: () => {
            vRisingServer.setConnectedToSteam();
        }
    },
    {
        regex: /Final ServerGameSettings Values:((.*|\n)*\n  }\n}\n)/gm,
        parse: (matches) => {
            console.log('Matched Server Game Settings', matches);
        }
    },
    {
        regex: /Server Setup Complete/g,
        parse: () => {
            vRisingServer.setSetupComplete();
        }
    },
    {
        regex: /NetEndPoint '{Steam (\d*)}' .* approvedUserIndex: (\d*) HasLocalCharacter: (True|False) .* PlatformId: (\d*) UserIndex: (\d*) ShouldCreateCharacter: (True|False) IsAdmin: (True|False)/g,
        parse: (matches) => {
            vRisingServer.playerManager.parseDetectedPlayer(matches);
        }
    },
    {
        regex: /User '{Steam (\d*)}' '(\d*)', approvedUserIndex: (\d*), Character: '(.*)' connected as ID '(.*)', Entity '(.*)'./g,
        parse: (matches) => {
            vRisingServer.playerManager.parsePlayerInfo(matches);
        }
    },
    {
        regex: /User '{Steam (\d*)}' disconnected. approvedUserIndex: (\d*) Reason: (.*)/g,
        parse: (matches) => {
            vRisingServer.playerManager.parseDisconnectedPlayer(matches);
        }
    },
    {
        regex: /PersistenceV2 - GameVersion of Loaded Save: (.*), Current GameVersion: (.*)/g,
        parse: (matches) => {
            vRisingServer.parseGameVersion(matches);
        }
    }
];

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

            let buffer = [];

            tail.on('line', (line) => {
                const newLine = line.replace(/\r?\n/g, '\n');
                buffer.push(newLine);
                for (const {regex, parse} of regexpArray) {
                    if (regex.test(newLine)) {
                        regex.lastIndex = 0;
                        parse(regex.exec(newLine), buffer);
                    }
                    regex.lastIndex = 0;
                }
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
