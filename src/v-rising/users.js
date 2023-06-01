import {checkServerSettingsDirectory} from "./settings.js";
import fs from "fs";
import {logger} from "../logger.js";
import path from "path";
import lodash from "lodash";

const adminListPath = (config) => path.join(config.server.dataPath, 'Settings', 'adminlist.txt');
const banListPath = (config) => path.join(config.server.dataPath, 'Settings', 'banlist.txt')

const checkAdminList = async (config) => {
    if (!fs.existsSync(adminListPath(config))) {
        let defaultAdminList = config.server.defaultAdminList;
        if (!defaultAdminList || !Array.isArray(defaultAdminList)) {
            logger.debug('Init default admin list to empty array');
            defaultAdminList = [];
        }

        logger.info('Init default admin list from config: %j', defaultAdminList);
        await writeAdminList(config, defaultAdminList);
    } else {
        logger.debug('Admin list file already exists');
    }
}

const checkBanList = async (config) => {
    if (!fs.existsSync(banListPath(config))) {
        let defaultBanList = config.server.defaultBanList;

        if (!defaultBanList || !Array.isArray(defaultBanList)) {
            defaultBanList = [];
        }

        logger.info('Init default ban list from config');
        await writeBanList(config, defaultBanList);
    } else {
        logger.debug('Ban list file already exists');
    }
}

export const writeAdminList = async (config, adminList) => {
    const filePath = adminListPath(config);
    logger.debug('Writing adminlist file to %s', filePath);
    await fs.promises.writeFile(filePath, adminList.join('\n'));
}

export const writeBanList = async (config, banList) => {
    const filePath = banListPath(config);
    logger.debug('Writing ban list file to %s', filePath);
    await fs.promises.writeFile(filePath, banList.join('\n'));
}

export const getAdminList = async (config) => {
    const content = await fs.promises.readFile(adminListPath(config), 'utf8');
    return content.replace(/\r?\n/g, '\n')
        .split('\n')
        .filter(val => !lodash.isEmpty(val));
}

export const getBanList = async (config) => {
    const content = await fs.promises.readFile(banListPath(config), 'utf8');
    return content.replace(/\r?\n/g, '\n')
        .split('\n')
        .filter(val => !lodash.isEmpty(val));
}

export const initVRisingUsers = async (config) => {
    await checkServerSettingsDirectory(config);
    await checkAdminList(config);
    await checkBanList(config);
}
