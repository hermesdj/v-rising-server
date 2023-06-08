import Router from "express-promise-router";
import {ensureAdmin, ensureAuthenticated} from "./utils.js";

const router = Router();

router.get('/', (req, res) => {
    res.json(req.vRisingServer.playerManager.getAllPlayers());
});

router.get('/:userIndex', ensureAuthenticated, (req, res) => {
    const userIndex = parseInt(req.params.userIndex, 10);
    const player = req.vRisingServer.playerManager.getPlayer(userIndex);
    if (player.clanId) {
        player.clan = req.vRisingServer.clanManager.getClan(player.clanId);
    }
    res.json(player);
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
