import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {getAdminList, getBanList} from "../../v-rising/users.js";
import {ensureAuthenticated} from "./utils.js";

const router = Router();

router.get('/', async (req, res) => {
    let adminList = vRisingServer.adminList;
    let banList = vRisingServer.banList;

    if (!adminList) {
        adminList = await getAdminList(req.config);
    }

    if (!banList) {
        banList = await getBanList(req.config);
    }

    res.json({
        adminList: {
            current: adminList,
            lastApplied: vRisingServer.lastAppliedAdminList
        },
        banList: {
            current: banList,
            lastApplied: vRisingServer.lastAppliedBanList
        }
    })
});

router.post('/', ensureAuthenticated, async (req, res) => {
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
