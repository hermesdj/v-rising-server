import Router from "express-promise-router";
import passport from "passport";
import {logger} from "../../logger.js";
import {io} from "../io.js";

const router = Router();

router.get('/steam',
    passport.authenticate('steam', {failureRedirect: '/'}),
    (req, res) => res.redirect(process.env.NODE_ENV === 'development' ? 'http://localhost:8081' : '/')
);

router.get(
    '/steam/return',
    (req, res, next) => {
        req.url = req.originalUrl;
        next();
    },
    passport.authenticate('steam', {failureRedirect: '/'}),
    (req, res) => {
        res.redirect(process.env.NODE_ENV === 'development' ? 'http://localhost:8081' : '/');
    }
);

router.post('/logout', (req, res) => {
    logger.info('Logout %s', req.session.id);
    const socketId = req.session.socketId;
    if (socketId && io.of('/').sockets.get(socketId)) {
        logger.debug('Forcefully closing socket %s', socketId);
        io.of('/').sockets.get(socketId).disconnect(true);
    }
    req.logout((err) => {
        if (err) {
            logger.error('Logout error: %s', err.message);
            res.json({success: false});
        } else {
            res.cookie('connect.sid', {expires: new Date()});
            io.in(req.session.id).disconnectSockets();
            res.json({success: true});
        }
    });
});

router.get('/', (req, res) => {
    const user = req.user;
    if (user) {
        res.json(user);
    } else {
        res.json({username: null});
    }
});

export default router;
