import path from "path";
import url from "url";
import yaml from "js-yaml";
import fs from "fs";
import env from "env-var";
import lodash from "lodash";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const configPath = path.resolve(__dirname, '..', 'config', 'config.yaml');

let config = null;

export const loadServerConfig = () => {
    if (config) return config;

    const loadedYaml = yaml.load(fs.readFileSync(configPath, 'utf8'));

    config = lodash.defaultsDeep(loadedYaml, {
        api: {
            port: env.get('API_PORT').asPortNumber(),
            auth: {
                returnURL: env.get('API_AUTH_RETURN_URL').asUrlString(),
                realm: env.get('API_AUTH_REALM').asUrlString()
            },
            session: {
                secret: env.get('API_SESSION_SECRET').asString(),
                params: {
                    resave: env.get('API_SESSION_PARAMS_RESAVE').default('false').asBoolStrict(),
                    saveUninitialized: env.get('API_SESSION_PARAMS_SAVE_UNINITIALIZED').default('false').asBoolStrict(),
                    name: env.get('API_SESSION_COOKIE_NAME').default('v-rising-session.sid').asString()
                }
            }
        },
        server: {
            name: env.get('V_RISING_SERVER_NAME').asString(),
            saveName: env.get('V_RISING_SAVE_NAME').asString(),
            password: env.get('V_RISING_PASSWORD').asString(),
            runOnStartup: env.get('V_RISING_RUN_ON_STARTUP').default('true').asBoolStrict(),
            tz: env.get('V_RISING_TIMEZONE').default('Europe/Paris').asString(),
            exeFileName: env.get('V_RISING_EXE_FILE_NAME').default('VRisingServer.exe').asString(),
            serverPath: env.get('V_RISING_SERVER_PATH').asString(),
            dataPath: env.get('V_RISING_DATA_PATH').asString(),
            backupPath: env.get('V_RISING_BACKUP_PATH').asString(),
            compressBackupSaves: env.get('V_RISING_COMPRESS_BACKUPS').default('true').asBoolStrict(),
            backupCount: env.get('V_RISING_BACKUP_COUNT').default(5).asIntPositive(),
            logFile: env.get('V_RISING_LOG_FILE').asString(),
            gamePort: env.get('V_RISING_GAME_PORT').default(9876).asPortNumber(),
            queryPort: env.get('V_RISING_QUERY_PORT').default(9877).asPortNumber(),
            defaultAdminList: env.get('V_RISING_DEFAULT_ADMIN_LIST').default('').asArray(),
            api: {
                metrics: {
                    retain: env.get('V_RISING_METRICS_RETAIN_HOURS').default(6).asIntPositive()
                }
            }
        },
        log: {
            level: env.get('LOG_LEVEL').default('info').asString()
        },
        k8s: {
            namespace: env.get('V_RISING_NAMESPACE').asString(),
            containerName: env.get('V_RISING_CONTAINER').asString()
        },
        discord: {
            token: env.get('DISCORD_BOT_TOKEN').asString(),
            appId: env.get('DISCORD_APP_ID').asString(),
            publicKey: env.get('DISCORD_PUBLIC_KEY').asString(),
            channelId: env.get('DISCORD_VRISING_CHANNEL_ID').asString(),
            roleId: env.get('DISCORD_ROLE_ID').asString()
        },
        rcon: {
            enabled: env.get('RCON_ENABLED').default('true').asBoolStrict(),
            host: env.get('RCON_HOST').default('127.0.0.1').asString(),
            port: env.get('RCON_PORT').default(25575).asPortNumber(),
            password: env.get('RCON_PASSWORD').asString()
        }
    });

    return config;
};
