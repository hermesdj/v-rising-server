import 'dotenv/config';
import {startExpressApi} from "./src/api/http.js";
import {logger} from "./src/logger.js";
import {initBotCommands} from "./src/discord/index.js";
import {loadServerConfig} from "./src/config.js";
import {initVRisingServerSettings} from "./src/v-rising/settings.js";
import {vRisingServer} from "./src/v-rising/server.js";
import {DbManager} from "./src/db-manager.js";

(async () => {
    const config = loadServerConfig();
    logger.info('Starting VRising Server API');
    const httpServer = await startExpressApi(config);
    await DbManager.initAllDatabases();
    logger.info('Init Discord Bot');
    await initBotCommands();
    logger.info('Init VRising server');
    await initVRisingServerSettings(config);

    await vRisingServer.initServer(config);

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
