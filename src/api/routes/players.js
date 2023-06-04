import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";

const router = Router();

router.get('/', (req, res) => {
    res.json(req.vRisingServer.playerManager.getAllPlayers());
});

router.post('/:steamID/set-admin', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;

    const result = await req.vRisingServer.userManager.setAdmin(steamID);
    res.json(result);
});

router.post('/:steamID/unset-admin', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;

    const result = await req.vRisingServer.userManager.unsetAdmin(steamID);
    res.json(result);
});

router.post('/:steamID/ban', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    const result = await req.vRisingServer.userManager.banUser(steamID);
    res.json(result);
});

router.post('/:steamID/unban', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    const result = await req.vRisingServer.userManager.unbanUser(steamID);
    res.json(result);
});

export default router;
