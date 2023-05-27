import Router from "express-promise-router";
import {ensureAuthenticated} from "./utils.js";
import {vRisingServer} from "../../v-rising/server.js";
import {logger} from "../../logger.js";
import fs from "fs";
import path from "path";

const router = new Router();

router.get('/backups', ensureAuthenticated, async (req, res) => {
    const fileNames = await vRisingServer.autoSaveManager.listBackedUpSaveNames(req.config);
    res.json({backupFileNames: fileNames});
});

router.post('/schedule-restore-backup', ensureAuthenticated, async (req, res) => {
    const {backupFileName, delay} = req.body;
    logger.info('Received scheduled backup restore with delay %d minutes and file name %s', delay, backupFileName);

    const backupDir = await vRisingServer.autoSaveManager._backupDir(req.config);

    if (!fs.existsSync(path.join(backupDir, backupFileName))) {
        res.status(400).json({message: 'The backup file does not exists !'});
    } else {
        const serverInfo = await vRisingServer.scheduleRestoreBackup(delay, backupFileName, req.user);
        res.json(serverInfo);
    }
})

export default router;
