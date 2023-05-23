import {Router} from 'express';
import server from './server.js';

const router = Router();

router.use('/server', server);

export default router;
