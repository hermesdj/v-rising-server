import {I18n} from 'i18n';
import path from "path";
import url from "url";
import {loadServerConfig} from "./config.js";
import {logger} from "./logger.js";
import yaml from "yaml";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const config = loadServerConfig();

export const i18n = new I18n({
    locales: ['en', 'fr'],
    directory: path.join(__dirname, 'locales'),
    fallbacks: {fr: 'en'},
    extension: '.yaml',
    updateFiles: true,
    syncFiles: true,
    parser: yaml,
    defaultLocale: config.i18n.defaultLocale,
    autoReload: process.env.NODE_ENV === 'development',
    objectNotation: true,
    mustacheConfig: {
        tags: ['{', '}']
    },
    logDebugFn(msg) {
        logger.debug(msg);
    },
    logWarnFn(msg) {
        logger.warn(msg);
    },
    logErrorFn(msg) {
        logger.error(msg);
    },
    api: {
        __: '$t',
        __n: '$tn',
        __l: '$tl',
        __h: '$th',
        __mf: '$tmf',
    },
});
