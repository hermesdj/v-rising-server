import Router from "express-promise-router";
import {ensureAdmin, ensureAuthenticated} from "./utils.js";
import {logger} from "../../logger.js";
import fs from "fs";
import path from "path";

const router = new Router();

router.get('/backups', ensureAuthenticated, async (req, res) => {
    const fileNames = await req.vRisingServer.autoSaveManager.listBackedUpSaveNames(req.config);
    res.json({backupFileNames: fileNames});
});

router.get('/backups/:fileName', ensureAuthenticated, (req, res) => {
    const {fileName} = req.params;
    const backupDir = req.vRisingServer.autoSaveManager._backupDir(req.config);
    const filePath = path.join(backupDir, fileName);

    if (!fs.existsSync(filePath)) {
        res.status(404).json({message: 'Backup not found'});
        return;
    }

    res.attachment(fileName);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
});

router.post('/schedule-restore-backup', ensureAdmin, async (req, res) => {
    const {backupFileName, delay} = req.body;
    logger.info('Received scheduled backup restore with delay %d minutes and file name %s', delay, backupFileName);

    const backupDir = await req.vRisingServer.autoSaveManager._backupDir(req.config);

    if (!fs.existsSync(path.join(backupDir, backupFileName))) {
        res.status(400).json({message: 'The backup file does not exists !'});
    } else {
        const serverInfo = await req.vRisingServer.scheduleRestoreBackup(delay, backupFileName, req.user);
        res.json(serverInfo);
    }
})

export default router;
