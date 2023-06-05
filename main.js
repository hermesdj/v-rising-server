import 'dotenv/config';
import startHttpServer from "./src/api/http.js";
import {logger} from "./src/logger.js";
import {VRisingDiscordBot} from "./src/discord/index.js";
import {loadServerConfig} from "./src/config.js";
import {VRisingServer} from "./src/v-rising/server.js";
import {DbManager} from "./src/db-manager.js";

(async () => {
    const config = loadServerConfig();
    logger.info('Init Discord Bot');
    const bot = new VRisingDiscordBot(config);
    logger.info('Init VRising Server');
    const vRisingServer = new VRisingServer(config, bot);
    logger.info('setup Discord Bot');
    await bot.setup(vRisingServer);
    logger.info('Starting VRising Server API');
    const httpServer = await startHttpServer(config, vRisingServer);
    logger.info('Init LowDB Manager');
    await DbManager.initAllDatabases();

    logger.info('Init VRising server');
    await vRisingServer.initServer(config);

    if (config.server.runOnStartup) {
        vRisingServer.startServer()
            .then(() => logger.info('VRising Server autostart successfull !'))
            .catch(() => logger.error('Error starting V Rising Server !'));
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
