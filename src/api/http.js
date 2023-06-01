import {createServer} from 'http';
import {logger} from "../logger.js";
import {app} from "./app.js";
import './sessions/session.js';
import './users/passport.js';
import {startSocketIoServer} from "./io.js";

const httpServer = createServer(app);
startSocketIoServer(httpServer);

export const startExpressApi = async (config) => {
    return new Promise((resolve) => {
        httpServer.listen(config.api.port, () => {
            logger.info(`V Rising server API is started: http://localhost:${config.api.port}`);
            resolve(httpServer);
        })
    })
}
