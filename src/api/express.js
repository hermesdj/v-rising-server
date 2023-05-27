import {createServer} from 'http';
import {logger} from "../logger.js";
import {app} from "./app.js";
import './session.js';
import './passport.js';
import {startSocketIoServer} from "./io.js";

const httpServer = createServer(app);
startSocketIoServer(httpServer);

export const startExpressApi = async (config) => {
    return new Promise((resolve, reject) => {
        httpServer.listen(config.api.port, () => {
            logger.info(`V Rising server API is listening on port ${config.api.port}`);
            resolve(httpServer);
        })
    })
}
