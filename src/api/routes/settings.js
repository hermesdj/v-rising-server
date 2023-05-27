import Router from "express-promise-router";
import {getGameSettings, getHostSettings} from "../../v-rising/settings.js";
import {ensureAuthenticated} from "./utils.js";
import {vRisingServer} from "../../v-rising/server.js";

const router = Router();

const loadHostSettings = (req, hostSettings) => {
    if (!hostSettings) return hostSettings;
    if (!req.isAuthenticated()) {
        hostSettings.Password = "XXXXXXXXX";
        if (hostSettings.Rcon) {
            hostSettings.Rcon.Password = "XXXXXXXX";
        }
    }
    return hostSettings;
}

router.get('/', async (req, res) => {
    let hostSettings = loadHostSettings(req, vRisingServer.hostSettings);
    let gameSettings = vRisingServer.gameSettings;
    const lastAppliedHostSettings = loadHostSettings(req, vRisingServer.lastAppliedHostSettings);
    const lastAppliedGameSettings = vRisingServer.lastAppliedGameSettings;

    if (!hostSettings) {
        hostSettings = loadHostSettings(req, await getHostSettings(req.config));
    }

    if (!gameSettings) {
        gameSettings = await getGameSettings(req.config);
    }

    res.json({
        hostSettings,
        gameSettings,
        lastAppliedHostSettings,
        lastAppliedGameSettings
    });
});

router.get('/host', async (req, res) => {
    const hostSettings = await loadHostSettings(req);
    res.json(hostSettings);
});

router.get('/game', async (req, res) => {
    const gameSettings = await getGameSettings(req.config);
    res.json(gameSettings);
});

router.post('/host', ensureAuthenticated, async (req, res) => {
    const hostSettings = req.body;
    const result = await vRisingServer.changeHostSettings(hostSettings);
    res.json(result);
});

router.post('/game', ensureAuthenticated, async (req, res) => {
    const gameSettings = req.body;
    const result = await vRisingServer.changeGameSettings(gameSettings);
    res.json(result);
})

export default router;
