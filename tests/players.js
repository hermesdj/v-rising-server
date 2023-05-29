import fs from 'fs';
import readline from 'node:readline/promises';
import {db, VRisingPlayerManager} from "../src/v-rising/players.js";
import pino from "pino";

const logger = pino({
    level: "info",
    transport: {
        target: 'pino-pretty'
    }
});

(async () => {
    await db.read();
    const playerManager = new VRisingPlayerManager({logger});

    const stream = fs.createReadStream('../logs/VRisingServer2.log');

    const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    let lineId = 0;

    for await (const line of rl) {
        logger.debug('[%d] %s', lineId, line);
        const newLine = line.replace(/\r?\n/g, '\n');
        await playerManager.parseLogLine(newLine);
        lineId++;
    }

    logger.info('Done');
    logger.info('Connected player list: %s', playerManager.getConnectedPlayers().map(p => p.characterName).join(', '));
    await playerManager.store.write();
    logger.info('Full player list is: %s', playerManager.getAllPlayers().map(p => p.characterName).join(', '));
})();
