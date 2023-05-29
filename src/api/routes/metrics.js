import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";

const router = new Router();

router.get('/all', (req, res) => {
    res.json(Array.from(vRisingServer.apiClient.metricsMap).map(([k, v]) => ({[k]: v})));
});

router.get('/byName/:name', (req, res) => {
    const metric = vRisingServer.apiClient.metricsMap.get(req.params.name);
    res.json(metric);
});

export default router;
