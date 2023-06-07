import Router from "express-promise-router";
import {ensureAdmin} from "./utils.js";

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
    const {gameSettings, hostSettings} = req.vRisingServer.settingsManager.getSettings();

    res.json({
        hostSettings: parseHostSettings(req, hostSettings),
        gameSettings,
    });
});

router.post('/host', ensureAdmin, async (req, res) => {
    const hostSettings = req.body;
    const result = await req.vRisingServer.settingsManager.updateHostSettings(hostSettings);
    res.json(result);
});

router.post('/game', ensureAdmin, async (req, res) => {
    const gameSettings = req.body;
    const result = await req.vRisingServer.settingsManager.updateGameSettings(gameSettings);
    res.json(result);
})

export default router;
