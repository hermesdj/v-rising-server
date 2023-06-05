import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";

const router = Router();

router.get('/available', ensureAdmin, async (req, res) => {
    const mods = await req.vRisingServer.modManager.listAllMods();
    res.json(mods);
});

router.get('/installed', ensureAdmin, async (req, res) => {
    res.json([]);
})

router.get('/mod-info/:uuid', ensureAdmin, async (req, res) => {
    const modInfo = await req.vRisingServer.modManager.getModInfo(req.params.id);
    res.json(modInfo);
});

export default router;
