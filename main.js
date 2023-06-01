import 'dotenv/config';
import {startExpressApi} from "./src/api/http.js";
import {logger} from "./src/logger.js";
import {initBotCommands} from "./src/discord/index.js";
import {loadServerConfig} from "./src/config.js";
import {initVRisingServerSettings} from "./src/v-rising/settings.js";
import {vRisingServer} from "./src/v-rising/server.js";
import {db as sessionDb} from "./src/api/session.js";
import {db as userDb} from "./src/api/passport.js";
import {db as playerDb} from "./src/v-rising/players.js";
import {initVRisingUsers} from "./src/v-rising/users.js";

(async () => {
    const config = loadServerConfig();
    await sessionDb.read();
    await userDb.read();
    await playerDb.read();
    logger.info('Starting VRising Server API');
    const httpServer = await startExpressApi(config);
    logger.info('Init Discord Bot');
    await initBotCommands();
    logger.info('Init VRising server');
    await initVRisingUsers(config);
    await initVRisingServerSettings(config);

    vRisingServer.setConfig(config);

    if (config.server.runOnStartup) {
        await vRisingServer.startServer(config);
    }

    async function stopServer() {
        await vRisingServer.stopServer().catch(err => logger.error('Error stopping VRising server on shutdown: %s', err.message));
        httpServer.close(() => {
            logger.info('Http server closed');
            process.exit(0);
        })
    }

    process.on('SIGINT', stopServer);
    process.on('SIGTERM', stopServer);

    logger.info('Server API is Ready !');
})();
