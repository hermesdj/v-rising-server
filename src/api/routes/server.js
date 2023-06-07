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

router.post('/rcon/command', ensureAdmin, async (req, res) => {
    const {command} = req.body;
    logger.info('Sending rcon command to server: %s', command);
    try {
        const response = await req.vRisingServer.rConClient._sendCommand(command);
        res.json({response});
    } catch (err) {
        res.json({error: err.message});
    }
});

export default router;
