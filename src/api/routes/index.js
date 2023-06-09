import Router from "express-promise-router";
import server from './server.js';
import auth from "./auth.js";
import players from "./players.js";
import settings from "./settings.js";
import users from "./users.js";
import autosave from "./autosave.js";
import metrics from "./metrics.js";
import logs from "./logs.js";
import mods from "./mods.js";
import operations from "./operations.js";
import clans from "./clans.js";

const router = Router();

router.use('/server', server);
router.use('/auth', auth);
router.use('/players', players);
router.use('/settings', settings);
router.use('/users', users);
router.use('/autosave', autosave);
router.use('/metrics', metrics);
router.use('/logs', logs);
router.use('/mods', mods);
router.use('/operations', operations);
router.use('/clans', clans);

export default router;
