import 'dotenv/config';
import {startExpressApi} from "./src/api/express.js";
import {logger} from "./src/logger.js";
import {initBotCommands} from "./src/discord/index.js";
import {startVRisingServerExecution} from "./src/v-rising/bin.js";
import {loadServerConfig} from "./src/config.js";
import {connectRCon} from "./src/v-rising/rcon.js";

(async () => {
    const config = loadServerConfig();
    logger.info('Starting VRising Server API');
    await startExpressApi(config);
    logger.info('Init Discord Bot');
    await initBotCommands();
    logger.info('Init VRising server');
    await startVRisingServerExecution(config);

    if (config.rcon.active) {
        await connectRCon(config);
    }
})();
