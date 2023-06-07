import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();

router.get('/status/:name', ensureAdmin, async (req, res) => {
    const operationInfo = req.vRisingServer.operationManager.getState(req.params.name);
    res.json(operationInfo);
});

router.get('/current/status', ensureAdmin, async (req, res) => {
    const operationInfo = req.vRisingServer.operationManager.getCurrentState();
    res.json(operationInfo);
})

router.post('/start/:name', ensureAdmin, async (req, res) => {
    logger.info('Received start operation with name %s', req.params.name);

    const operationInfo = await req.vRisingServer.operationManager.startOperation(req.params.name, req.user, req.body);

    res.json(operationInfo);
});

router.post('/current/stop', ensureAdmin, async (req, res) => {
    logger.info('Stopping current operation');
    const operationInfo = await req.vRisingServer.operationManager.stopCurrentOperation(req.user);
    res.json(operationInfo);
});

router.post('/stop/:name', ensureAdmin, async (req, res) => {
    logger.info('Stopping operation with name', req.params.name);
    const operationInfo = await req.vRisingServer.operationManager.stopOperation(req.params.name, req.user);
    res.json(operationInfo);
});

export default router;
