import fs from "fs";
import {mkdirp} from "mkdirp";
import path from "path";
import {logger} from "../logger.js";

const hostSettingsPath = (config) => path.join(config.server.dataPath, 'Settings', 'ServerHostSettings.json');
const gameSettingsPath = (config) => path.join(config.server.dataPath, 'Settings', 'ServerGameSettings.json')

export const checkServerSettingsDirectory = async (config) => {
    if (!fs.existsSync(config.server.dataPath)) {
        logger.debug('Creating dataPath %s', config.server.dataPath);
        await mkdirp(config.server.dataPath);
    }

    const settingsPath = path.join(config.server.dataPath, 'Settings');

    if (!fs.existsSync(settingsPath)) {
        logger.debug('Creating settingsPath %s', settingsPath);
        await mkdirp(settingsPath);
    }
}

const checkHostSettings = async (config) => {
    if (!fs.existsSync(hostSettingsPath(config))) {
        const defaultHostSettings = await getDefaultHostSettings();

        defaultHostSettings.Port = config.server.gamePort;
        defaultHostSettings.QueryPort = config.server.queryPort;
        defaultHostSettings.Name = config.server.name;
        defaultHostSettings.SaveName = config.server.saveName;
        defaultHostSettings.Rcon.Password = config.rcon.password;
        defaultHostSettings.Rcon.Port = config.rcon.port;
        defaultHostSettings.Rcon.Enabled = config.rcon.active;

        await writeHostSettings(config, defaultHostSettings);
    } else {
        logger.debug('Server host settings already exists');
    }
}

const checkGameSettings = async (config) => {
    if (!fs.existsSync(gameSettingsPath(config))) {
        const defaultGameSettings = await getDefaultGameSettings();
        await writeGameSettings(config, defaultGameSettings);
    } else {
        logger.debug('Server game settings already exists');
    }
}

export const getDefaultGameSettings = async () => {
    const content = await fs.promises.readFile(path.join('./settings', 'ServerGameSettings.json'), 'utf8');
    return JSON.parse(content);
}

export const getDefaultHostSettings = async () => {
    const content = await fs.promises.readFile(path.join('./settings', 'ServerHostSettings.json'), 'utf8');
    return JSON.parse(content);
}

export const writeGameSettings = async (config, gameSettings) => {
    const filePath = gameSettingsPath(config);
    logger.debug('Writing game settings to %s', filePath);
    await fs.promises.writeFile(filePath, JSON.stringify(gameSettings, null, 4));
}

export const writeHostSettings = async (config, hostSettings) => {
    const filePath = hostSettingsPath(config);
    logger.debug('Writing host settings to %s', filePath);
    await fs.promises.writeFile(path.join(config.server.dataPath, 'Settings', 'ServerHostSettings.json'), JSON.stringify(hostSettings, null, 4));
}

export const getGameSettings = async (config) => {
    const content = await fs.promises.readFile(gameSettingsPath(config), 'utf8');
    return JSON.parse(content);
}

export const getHostSettings = async (config) => {
    const content = await fs.promises.readFile(hostSettingsPath(config), 'utf8');
    return JSON.parse(content);
}

export const initVRisingServerSettings = async (config) => {
    await checkServerSettingsDirectory(config);
    await checkHostSettings(config);
    await checkGameSettings(config);
};
