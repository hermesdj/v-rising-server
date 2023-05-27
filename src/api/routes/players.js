import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";

const router = Router();

router.get('/', (req, res) => {
    res.json(vRisingServer.playerManager.getValidPlayerList());
});

export default router;
