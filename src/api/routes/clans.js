import Router from "express-promise-router";
import {ensureAdmin, ensureAuthenticated} from "./utils.js";

const router = Router();

router.get('/', ensureAuthenticated, async (req, res) => {
    res.json(req.vRisingServer.clanManager.listAllClans());
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
    const clan = await req.vRisingServer.clanManager.getClan(req.params.id);
    res.json(clan);
});

router.post('/:id/updateName', ensureAdmin, async (req, res) => {
    const clan = await req.vRisingServer.clanManager.updateClanName(req.params.id, req.body.name);
    res.json(clan);
});

router.post('/:id/updateDescription', ensureAdmin, async (req, res) => {
    const clan = await req.vRisingServer.clanManager.updateClanDescription(req.params.id, req.body.description);
    res.json(clan);
});

export default router;
