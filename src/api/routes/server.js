import {Router} from "express";
import {vRisingServer} from "../../v-rising/server.js";
import {startVRisingServerExecution, stopVRisingServerExecution} from "../../v-rising/bin.js";

const router = Router();

router.post('/start', async (req, res) => {
    if (vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await startVRisingServerExecution(req.config));
});

router.get('/info', async (req, res) => {
    await res.json(vRisingServer.serverInfo);
})

router.post('/force-stop', async (req, res) => {
    if (!vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await stopVRisingServerExecution());
});

router.post('/scheduled-stop', async (req, res) => {

});

router.post('/scheduled-restart', async (req, res) => {

});

export default router;
