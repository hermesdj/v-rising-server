import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();

router.get('/', async (req, res) => {
    const isAllowed = req.isAuthenticated() && req.user.isAdmin;
    const {adminList, banList} = vRisingServer;

    if (isAllowed) {
        if (!adminList.current) {
            adminList.current = vRisingServer.userManager.getAdminList();
        }

        if (!banList.current) {
            banList.current = vRisingServer.userManager.getBanList();
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
});

router.get('/admins', (req, res) => {
    logger.debug('Req to /admins with method %s, from %s, with query %j', req.method, req.ip, req.query);
    const adminResponse = vRisingServer.userManager.getAdminList();
    logger.debug('Responding to /admins with %s', adminResponse.join(', '));
    res.send(adminResponse.join('\n'));
});

router.get('/banned', (req, res) => {
    logger.debug('Req to /banned with method %s, from %s, with query %j', req.method, req.ip, req.query);
    const bannedResponse = vRisingServer.userManager.getBanList();
    logger.debug('Responding to /banned with %s', bannedResponse.join(', '));
    res.send(bannedResponse.join('\n'));
});

export default router;
