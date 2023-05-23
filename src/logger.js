import pino from 'pino';
import {loadServerConfig} from "./config.js";

const config = loadServerConfig();
export const logger = pino({
    level: config.log.level,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: process.env.NODE_ENV === 'development'
        }
    }
});
