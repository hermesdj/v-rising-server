import pino from 'pino';
import {loadServerConfig} from "./config.js";
import pretty from 'pino-pretty';
import fs from "fs";
import {createStream} from "rotating-file-stream";

const config = loadServerConfig();

const loggerDestination = './logs/api-logs.log';

if (fs.existsSync(loggerDestination)) {
    fs.unlinkSync(loggerDestination);
}

const streams = [
    {
        level: config.log.level,
        stream: pretty({
            colorize: true,
            destination: loggerDestination
        }),
    },
    {
        level: config.log.level,
        stream: pretty({
            colorize: process.env.NODE_ENV === 'development'
        })
    },
    {
        level: 'info',
        stream: createStream('api-logs.log', {
            interval: '1d',
            path: 'logs/rotated',
            compress: 'gzip',
            maxFiles: 10
        })
    }
];

export const logger = pino({
    level: config.log.level,
    name: 'api'
}, pino.multistream(streams));
