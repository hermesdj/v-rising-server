import path from "path";
import url from "url";
import yaml from "yaml";
import fs from "fs";
import env from "env-var";
import lodash from "lodash";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const configPath = path.resolve(__dirname, '..', 'data', 'config.yaml');

let config = null;

export function updateConfig(config){
    fs.writeFileSync(configPath, yaml.stringify(config));
}

export const loadServerConfig = () => {
    if (config) return config;

    const configExists = fs.existsSync(configPath);

    const loadedYaml = configExists ? yaml.parse(fs.readFileSync(configPath, 'utf8')) : {};

    const envConfig = {
        i18n: {
            defaultLocale: env.get('I18N_DEFAULT_LOCALE').default('fr').asString(),
        },
        api: {
            port: env.get('API_PORT').default(8080).asPortNumber(),
            auth: {
                returnURL: env.get('API_AUTH_RETURN_URL').default('http://localhost:8080/api/auth/steam/return').asUrlString(),
                realm: env.get('API_AUTH_REALM').default('http://localhost:8080/').asUrlString(),
                steamApiKey: env.get('API_AUTH_STEAM_API_KEY').required(true).asString(),
            },
            session: {
                secret: env.get('API_SESSION_SECRET').required(true).asString(),
                params: {
                    resave: env.get('API_SESSION_PARAMS_RESAVE').default('false').asBoolStrict(),
                    saveUninitialized: env.get('API_SESSION_PARAMS_SAVE_UNINITIALIZED').default('false').asBoolStrict(),
                    name: env.get('API_SESSION_COOKIE_NAME').default('v-rising-session.sid').asString()
                }
            }
        },
        server: {
            name: env.get('V_RISING_SERVER_NAME').default('V Rising Server').asString(),
            saveName: env.get('V_RISING_SAVE_NAME').default('world1').asString(),
            password: env.get('V_RISING_PASSWORD').default('').asString(),
            runOnStartup: env.get('V_RISING_RUN_ON_STARTUP').default('false').asBoolStrict(),
            tz: env.get('V_RISING_TIMEZONE').default('Europe/Paris').asString(),
            exeFileName: env.get('V_RISING_EXE_FILE_NAME').default('VRisingServer.exe').asString(),
            serverPath: env.get('V_RISING_SERVER_PATH').default('/mnt/vrising/server').asString(),
            dataPath: env.get('V_RISING_DATA_PATH').default('/mnt/vrising/persistentdata').asString(),
            backupPath: env.get('V_RISING_BACKUP_PATH').default('/mnt/vrising/backups').asString(),
            compressBackupSaves: env.get('V_RISING_COMPRESS_BACKUPS').default('true').asBoolStrict(),
            backupCount: env.get('V_RISING_BACKUP_COUNT').default(5).asIntPositive(),
            logFile: env.get('V_RISING_LOG_FILE').default('/mnt/vrising/persistentdata/VRisingServer.log').asString(),
            gamePort: env.get('V_RISING_GAME_PORT').default(9876).asPortNumber(),
            queryPort: env.get('V_RISING_QUERY_PORT').default(9877).asPortNumber(),
            defaultAdminList: env.get('V_RISING_DEFAULT_ADMIN_LIST').default('').asArray(),
            defaultBanList: env.get('V_RISING_DEFAULT_BAN_LIST').default('').asArray(),
            api: {
                enabled: env.get('V_RISING_API_ENABLED').default('true').asBoolStrict(),
                bindAddress: env.get('V_RISING_API_BIND_ADDRESS').default('*').asString(),
                bindPort: env.get('V_RISING_API_BIND_PORT').default(9090).asPortNumber(),
                basePath: env.get('V_RISING_API_BASE_PATH').default('/').asString(),
                accessList: env.get('V_RISING_API_ACCESS_LIST').default('').asString(),
                prometheusDelay: env.get('V_RISING_API_PROMETHEUS_DELAY').default(30).asIntPositive(),
                metrics: {
                    pollingEnabled: env.get('V_RISING_API_METRICS_POLLING_ENABLED').default('false').asBoolStrict(),
                    retain: env.get('V_RISING_API_METRICS_RETAIN_HOURS').default(1).asIntPositive()
                }
            },
            mods: {
                enabled: env.get('V_RISING_MODS_ENABLED').default('true').asBoolStrict(),
                defaultMods: env.get('V_RISING_MODS_DEFAULT_MODS').default('[]').asJsonArray(),
                thunderstore: {
                    url: env.get('V_RISING_MODS_THUNDERSTORE_URL').default('https://v-rising.thunderstore.io/api/v1').asUrlString()
                },
                bepinex: {
                    url: env.get('V_RISING_MODS_BEPINEX_URL').default('https://github.com/decaprime/VRising-Modding/releases/download/1.668.5/BepInEx-BepInExPack_V_Rising-1.668.5.zip').asUrlString(),
                }
            }
        },
        log: {
            level: env.get('LOG_LEVEL').default('info').asString()
        },
        k8s: {
            namespace: env.get('V_RISING_NAMESPACE').default('v-rising').asString(),
            containerName: env.get('V_RISING_CONTAINER').default('v-rising-server-api').asString()
        },
        discord: {
            enabled: env.get('DISCORD_ENABLED').default('false').asBoolStrict(),
            token: env.get('DISCORD_BOT_TOKEN').default('').asString(),
            appId: env.get('DISCORD_APP_ID').default('').asString(),
            publicKey: env.get('DISCORD_PUBLIC_KEY').default('').asString(),
            channelId: env.get('DISCORD_VRISING_CHANNEL_ID').default('').asString(),
            channelIds: env.get('DISCORD_VRISING_CHANNEL_IDS').default('').default('').asArray(),
            roleId: env.get('DISCORD_ROLE_ID').default('').asString()
        },
        rcon: {
            enabled: env.get('RCON_ENABLED').default('true').asBoolStrict(),
            host: env.get('RCON_HOST').default('127.0.0.1').asString(),
            port: env.get('RCON_PORT').default(25575).asPortNumber(),
            password: env.get('RCON_PASSWORD').default('').asString()
        },
        steam: {
            cmd: {
                exePath: env.get('STEAM_CMD_EXE_PATH').default('/usr/bin/steamcmd').asString(),
                appId: env.get('STEAM_CMD_APP_ID').default('1829350').asIntPositive(),
                validate: env.get('STEAM_CMD_VALIDATE').default('true').asBoolStrict(),
                update: env.get('STEAM_CMD_UPDATE').default('true').asBoolStrict()
            },
            query: {
                enabled: env.get('STEAM_QUERY_ENABLED').default('true').asBoolStrict(),
                pollingDelay: env.get('STEAM_QUERY_POLLING_DELAY').default(30000).asIntPositive(),
                timeout: env.get('STEAM_QUERY_TIMEOUT').default(2000).asIntPositive(),
                attempts: env.get('STEAM_QUERY_ATTEMPTS').default(5).asIntPositive()
            }
        }
    };

    config = lodash.merge(envConfig, loadedYaml);

    updateConfig(config);

    return config;
};
