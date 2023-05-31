import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();


router.post('/start', ensureAdmin, async (req, res) => {
    if (vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await vRisingServer.startServer(req.config, true));
});

router.get('/info', async (req, res) => {
    await res.json(vRisingServer.serverInfo);
});

router.post('/force-stop', ensureAdmin, async (req, res) => {
    if (!vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await vRisingServer.stopServer(true));
});

router.post('/scheduled-stop', ensureAdmin, async (req, res) => {
    const {delay} = req.body;
    logger.info('Received scheduled stop with delay %d minutes', delay);

    const serverInfo = await vRisingServer.scheduleStop(delay, req.user);

    res.json(serverInfo);
});

router.post('/scheduled-restart', ensureAdmin, async (req, res) => {
    const {delay} = req.body;
    logger.info('Received scheduled restart with delay %d minutes', delay);

    const serverInfo = await vRisingServer.scheduleRestart(delay, req.user);

    res.json(serverInfo);
});

router.post('/stop-scheduled-operation', ensureAdmin, async (req, res) => {
    logger.info('Stopping current scheduled operation');
    const serverInfo = await vRisingServer.stopScheduledOperation(req.user);
    res.json(serverInfo);
});

router.post('/send-announce', ensureAdmin, async (req, res) => {
    if (!vRisingServer.rConClient.isEnabled()) {
        res.status(404).json({success: false, message: 'RCon is not enabled !'});
    } else if (!vRisingServer.rConClient.isConnected) {
        res.status(404).json({success: false, message: 'RCon is not connected !'});
    } else {
        const {message} = req.body;
        if (!message || message.length === 0) {
            res.status(400).json({success: false, message: 'Message body is empty !'});
        } else {
            try {
                const success = await vRisingServer.rConClient.sendAnnounceToVRisingServer(message);
                res.json({success});
            } catch (err) {
                console.error(err);
                res.status(400).json({success: false, message: err.message});
            }
        }
    }
});

export default router;
