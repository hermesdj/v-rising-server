import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {getAdminList, getBanList} from "../../v-rising/users.js";
import {ensureAdmin} from "./utils.js";

const router = Router();

router.get('/', async (req, res) => {
    const isAllowed = req.isAuthenticated() && req.user.isAdmin;
    const {adminList, banList} = vRisingServer;

    if (isAllowed) {
        if (!adminList.current) {
            adminList.current = await getAdminList(req.config);
        }

        if (!banList.current) {
            banList.current = await getBanList(req.config);
        }
    } else {
        adminList.current = [];
        adminList.lastApplied = [];
        banList.current = [];
        banList.lastApplied = [];
    }

    res.json({
        adminList,
        banList
    })
});

router.post('/', ensureAdmin, async (req, res) => {
    const {adminList, banList} = req.body;

    if (!Array.isArray(adminList)) {
        throw new Error('Admin List must be an array');
    }

    if (!Array.isArray(banList)) {
        throw new Error('Ban List must be an array');
    }

    const updatedAdminList = await vRisingServer.changeAdminList(adminList);
    const updatedBanList = await vRisingServer.changeBanList(banList);

    res.json({
        updatedAdminList,
        updatedBanList
    });
})

export default router;
