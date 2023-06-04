import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();

router.get('/', async (req, res) => {
    const isAllowed = req.isAuthenticated() && req.user.isAdmin;

    if (isAllowed) {
        const result = req.vRisingServer.userManager.getState();
        res.json(result);
    } else {
        res.json({
            adminList: {
                current: [],
                lastApplied: []
            },
            banList: {
                current: [],
                lastApplied: []
            }
        })
    }
});

router.post('/', ensureAdmin, async (req, res) => {
    const {adminList, banList} = req.body;

    if (!Array.isArray(adminList)) {
        throw new Error('Admin List must be an array');
    }

    if (!Array.isArray(banList)) {
        throw new Error('Ban List must be an array');
    }

    await req.vRisingServer.userManager.setAdminList(adminList);
    await req.vRisingServer.userManager.setBanList(banList);

    res.json(req.vRisingServer.userManager.getState());
});

router.get('/admins', (req, res) => {
    const adminResponse = req.vRisingServer.userManager.getAdminList();
    logger.debug('Responding to /admins with %s', adminResponse.join(', '));
    res.send(adminResponse.join('\n'));
});

router.get('/banned', (req, res) => {
    const bannedResponse = req.vRisingServer.userManager.getBanList();
    logger.debug('Responding to /banned with %s', bannedResponse.join(', '));
    res.send(bannedResponse.join('\n'));
});

export default router;
