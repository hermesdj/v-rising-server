import {Server} from "socket.io";
import passport from "passport";
import {sessionMiddleware} from "./sessions/session.js";
import {logger} from "../logger.js";
import {vRisingServer} from "../v-rising/server.js";

export let io;

export function startSocketIoServer(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'development' ? 'http://localhost:8081' : 'https://v-rising.jaysgaming.fr',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.engine.use(sessionMiddleware);
    io.engine.use(passport.initialize());
    io.engine.use(passport.session());

    io.use((socket, next) => {
        if (socket.request.user) {
            next();
        } else {
            next(new Error('unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        logger.debug('New socket connection %s', socket.id);
        const session = socket.request.session;
        socket.on('whoami', (cb) => {
            cb(socket.request.user ? socket.request.user : {username: null});
        });

        socket.on('disconnect', (reason) => {
            logger.debug('Socket %s is disconnected because : %s', socket.id, reason);
        })

        logger.debug('saving sid %s in session %s', socket.id, session.id);
        session.socketId = socket.id;
        session.save();
        socket.join(session.id);
    });

    vRisingServer.on('server_info', (serverInfo) => io.emit('server info', serverInfo));
    vRisingServer.on('server_process_closed', (code) => io.emit('server process closed', code));
    vRisingServer.on('server_started', (info) => io.emit('server started', info));
    vRisingServer.on('server_stopped', (info) => io.emit('server stopped', info));
    vRisingServer.on('changed_host_settings', (info) => io.emit('server update host settings', info));
    vRisingServer.on('changed_game_settings', (info) => io.emit('server update game settings', info));
    vRisingServer.on('operation_start', (serverInfo) => io.emit('operation start', serverInfo));
    vRisingServer.on('operation_execute', (serverInfo) => io.emit('operation execute', serverInfo));
    vRisingServer.on('operation_done', (serverInfo) => io.emit('operation done', serverInfo));
    vRisingServer.on('operation_error', (err) => io.emit('operation error', err));
    vRisingServer.on('operation_progress', (serverInfo) => io.emit('operation progress', serverInfo));
    vRisingServer.on('loaded_save', (info) => io.emit('loaded save', info));
    vRisingServer.on('auto_save', (info) => io.emit('auto save', info));

    vRisingServer.userManager.on('changed_admin_list', (info) => io.emit('server update admin list', info));
    vRisingServer.userManager.on('changed_ban_list', (info) => io.emit('server update ban list', info));

    vRisingServer.playerManager.on('player_connected', (player) => io.emit('player connected', player));
    vRisingServer.playerManager.on('player_disconnected', (player) => io.emit('player disconnected', player));
    vRisingServer.playerManager.on('player_updated', (player) => io.emit('player updated', player));
}
