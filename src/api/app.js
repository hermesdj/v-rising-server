import express from "express";
import passport from "passport";
import {sessionMiddleware} from "./session.js";
import actuator from "express-actuator";
import {vRisingServer} from "../v-rising/server.js";
import {loadServerConfig} from "../config.js";
import router from "./routes/index.js";
import cors from 'cors';
import path from "path";
import {fileURLToPath} from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? 'http://localhost:8081' : 'https://v-rising.jaysgaming.fr',
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true
}))

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

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

app.use(express.static(path.join(dirname, '..', '..', 'public')));

app.use('/api', router);

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.send(err);
});
