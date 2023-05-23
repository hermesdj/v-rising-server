import express from 'express';
import {loadServerConfig} from "../config.js";
import {logger} from "../logger.js";
import router from './routes/index.js';
import actuator from 'express-actuator';
import {vRisingServer} from "../v-rising/server.js";

export const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(actuator({
    basePath: '/api/actuator',
    infoGitMode: 'simple',
    customEndpoints: [
        {
            id: 'v-rising',
            controller: async (req, res) => {
                const serverInfo = vRisingServer.getServerInfo();
                res.json({
                    status: serverInfo.serverSetupComplete ? 'UP' : 'DOWN'
                });
            }
        }
    ]
}));
app.use((req, res, next) => {
    req.config = loadServerConfig();
    next();
});

app.use('/api', router);

export const startExpressApi = async (config) => {
    return new Promise((resolve, reject) => {
        app.listen(config.api.port, () => {
            logger.info(`V Rising server API is listening on port ${config.api.port}`);
            resolve();
        })
    })
}
