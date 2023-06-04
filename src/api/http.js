import {createServer} from 'http';
import {logger} from "../logger.js";
import initExpress from "./app.js";
import './sessions/session.js';
import './users/passport.js';
import initSocketIo from "./io.js";
import {initializePassport} from "./users/passport.js";
import {initializeSessionMiddleware} from "./sessions/session.js";

export default (config, server) => {
    const sessionMiddleware = initializeSessionMiddleware(config);
    initializePassport(config, server);
    const {io, setup} = initSocketIo(server);
    const app = initExpress(config, server, io, sessionMiddleware);
    const httpServer = createServer(app);
    io.attach(httpServer);
    setup(sessionMiddleware);

    return new Promise((resolve) => {
        httpServer.listen(config.api.port, () => {
            logger.info(`V Rising server API is started: http://localhost:${config.api.port}`);
            resolve(httpServer);
        })
    })
}
