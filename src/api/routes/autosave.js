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

export default router;
