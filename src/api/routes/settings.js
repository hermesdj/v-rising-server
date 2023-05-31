import Router from "express-promise-router";
import {getGameSettings, getHostSettings} from "../../v-rising/settings.js";
import {ensureAdmin} from "./utils.js";
import {vRisingServer} from "../../v-rising/server.js";

const router = Router();

const mutateHostSettings = (settings) => {
    settings.Password = "XXXXXXXXX";
    if (settings.Rcon) {
        settings.Rcon.Password = "XXXXXXXX";
    }
    return settings;
}

const parseHostSettings = (req, {current, lastApplied}) => {
    if (!req.isAuthenticated() || !req.user.isAdmin) {
        if (current) {
            current = mutateHostSettings(current);
        }
        if (lastApplied) {
            lastApplied = mutateHostSettings(lastApplied);
        }

    }
    return {current, lastApplied};
}

router.get('/', async (req, res) => {
    const {gameSettings, hostSettings} = vRisingServer;

    if (!hostSettings.current) {
        hostSettings.current = await getHostSettings(req.config);
    }

    if (!gameSettings.current) {
        gameSettings.current = await getGameSettings(req.config);
    }

    res.json({
        hostSettings: parseHostSettings(req, hostSettings),
        gameSettings,
    });
});

router.post('/host', ensureAdmin, async (req, res) => {
    const hostSettings = req.body;
    const result = await vRisingServer.changeHostSettings(hostSettings);
    res.json(result);
});

router.post('/game', ensureAdmin, async (req, res) => {
    const gameSettings = req.body;
    const result = await vRisingServer.changeGameSettings(gameSettings);
    res.json(result);
})

export default router;
