import path from "path";
import url from "url";
import yaml from "js-yaml";
import fs from "fs";
import {logger} from "./logger.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const configPath = path.resolve(__dirname, '..', 'config', 'config.yaml');

let config = null;

export const loadServerConfig = () => {
    logger.info('Loading server config from path %s', configPath);
    const loadedYaml = yaml.load(fs.readFileSync(configPath, 'utf8'));

    config = {
        server: {
            saveName: process.env.V_RISING_SAVE_NAME
        },
        k8s: {
            namespace: process.env.V_RISING_NAMESPACE,
            containerName: process.env.V_RISING_CONTAINER
        },
        discord: {
            token: process.env.DISCORD_BOT_TOKEN,
            appId: process.env.DISCORD_APP_ID,
            publicKey: process.env.DISCORD_PUBLIC_KEY,
            channelId: process.env.DISCORD_VRISING_CHANNEL_ID
        },
        ...loadedYaml,
    };

    return config;
};
