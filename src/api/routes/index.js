import {Router} from 'express';
import server from './server.js';
import auth from "./auth.js";
import players from "./players.js";
import settings from "./settings.js";
import users from "./users.js";
import autosave from "./autosave.js";

const router = Router();

router.use('/server', server);
router.use('/auth', auth);
router.use('/players', players);
router.use('/settings', settings);
router.use('/users', users);
router.use('/autosave', autosave);

export default router;
