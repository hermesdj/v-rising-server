import pino from 'pino';
import {loadServerConfig} from "./config.js";
import pretty from 'pino-pretty';

const config = loadServerConfig();

const streams = [
    {
        level: config.log.level,
        stream: pretty({
            colorize: process.env.NODE_ENV,
            destination: './logs/api-logs.log'
        }),
    },
    {
        level: config.log.level,
        stream: pretty({
            colorize: process.env.NODE_ENV === 'development'
        })
    }
];

export const logger = pino({
    level: config.log.level
}, pino.multistream(streams));
