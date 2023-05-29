import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";
import fs from 'fs';
import readline from 'readline';

const router = new Router();

router.get('/:logName', ensureAdmin, (req, res, next) => {
    const {logName} = req.params;
    const {from = 0} = req.query;

    let filePath = `logs/${logName}.log`;

    if (logName === 'v-server-logs') {
        filePath = req.config.server.logFile;
    }

    if (!fs.existsSync(filePath)) {
        res.send('');
    } else {
        try {
            let lineIndex = 0;

            const rl = readline.createInterface({
                input: fs.createReadStream(filePath)
            });

            rl.on('line', (line) => {
                lineIndex++;

                if (lineIndex > from) {
                    res.write(line + '\n');
                }
            });

            rl.once('close', () => res.end());
        } catch (err) {
            next(err);
        }
    }
});

export default router;
