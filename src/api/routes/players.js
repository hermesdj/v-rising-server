import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {ensureAdmin} from "./utils.js";

const router = Router();

router.get('/', (req, res) => {
    res.json(vRisingServer.playerManager.getAllPlayers());
});

router.post('/:steamID/set-admin', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    let adminList = vRisingServer.adminList ? [...vRisingServer.adminList] : [];

    if (!adminList.includes(steamID)) {
        adminList.push(steamID);
        const result = await vRisingServer.changeAdminList(adminList);
        res.json({changed: true, result});
    } else {
        res.json({changed: false});
    }
});

router.post('/:steamID/unset-admin', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    let adminList = vRisingServer.adminList ? [...vRisingServer.adminList] : [];

    if (adminList.includes(steamID)) {
        adminList = adminList.filter(id => id !== steamID);
        const result = await vRisingServer.changeAdminList(adminList);
        res.json({changed: true, result});
    } else {
        res.json({changed: false});
    }
});

router.post('/:steamID/ban', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    let banList = vRisingServer.banList ? [...vRisingServer.banList] : [];

    if (!banList.includes(steamID)) {
        banList.push(steamID);

        const result = await vRisingServer.changeBanList(banList);
        res.json({changed: true, result});
    } else {
        res.json({changed: false});
    }
});

router.post('/:steamID/unban', ensureAdmin, async (req, res) => {
    const {steamID} = req.params;
    let banList = vRisingServer.banList ? [...vRisingServer.banList] : [];

    if (banList.includes(steamID)) {
        banList = banList.filter(id => id !== steamID);
        const result = await vRisingServer.changeBanList(banList);
        res.json({changed: true, result});
    } else {
        res.json({changed: false});
    }
});

export default router;
