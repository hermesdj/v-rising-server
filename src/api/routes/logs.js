import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";
import fs from 'fs';
import {logger} from "../../logger.js";

const router = new Router();

router.get('/:logName', ensureAdmin, async (req, res, next) => {
    const {logName} = req.params;
    const {from = '0'} = req.query;

    let filePath = `logs/${logName}.log`;

    if (!fs.existsSync(filePath)) {
        res.send('');
    } else {
        try {
            const stream = fs.createReadStream(filePath, {
                start: parseInt(from)
            });

            for await (const chunk of stream) {
                res.write(chunk);
            }

            res.end();
        } catch (err) {
            logger.error('Error while reading log file %s from position %d: %s', logName, from, err.message);
            next(err);
        }
    }
});

export default router;
