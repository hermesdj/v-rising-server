import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();


router.post('/start', ensureAdmin, async (req, res) => {
    if (req.vRisingServer.serverInfo.serverSetupComplete) return res.json(req.vRisingServer.serverInfo);
    res.json(await req.vRisingServer.startServer());
});

router.get('/info', async (req, res) => {
    await res.json(req.vRisingServer.serverInfo);
});

router.post('/force-stop', ensureAdmin, async (req, res) => {
    if (!req.vRisingServer.serverInfo.serverSetupComplete) return res.json(req.vRisingServer.getServerInfo());
    res.json(await req.vRisingServer.stopServer(true));
});

router.get('/operations/status/:name', ensureAdmin, async (req, res) => {
    const operationInfo = req.vRisingServer.operationManager.getState(req.params.name);
    res.json(operationInfo);
});

router.post('/operations/start/:name', ensureAdmin, async (req, res) => {
    logger.info('Received start operation with name %s', req.params.name);

    const operationInfo = await req.vRisingServer.operationManager.startOperation(req.params.name, req.user, req.body);

    res.json(operationInfo);
});

router.post('/operations/current/stop', ensureAdmin, async (req, res) => {
    logger.info('Stopping current operation');
    const operationInfo = await req.vRisingServer.operationManager.stopCurrentOperation(req.user);
    res.json(operationInfo);
});

router.post('/operations/stop/:name', ensureAdmin, async (req, res) => {
    logger.info('Stopping operation with name', req.params.name);
    const operationInfo = await req.vRisingServer.operationManager.stopOperation(req.params.name, req.user);
    res.json(operationInfo);
});

router.post('/send-announce', ensureAdmin, async (req, res) => {
    if (!req.vRisingServer.rConClient.isEnabled()) {
        res.status(404).json({success: false, message: 'RCon is not enabled !'});
    } else {
        const {message} = req.body;
        if (!message || message.length === 0) {
            res.status(400).json({success: false, message: 'Message body is empty !'});
        } else {
            try {
                const success = await req.vRisingServer.rConClient.sendAnnounceToVRisingServer(message);
                res.json({success});
            } catch (err) {
                logger.error(err, 'Send Announce using Rcon error');
                res.status(400).json({success: false, message: err.message});
            }
        }
    }
});

export default router;
