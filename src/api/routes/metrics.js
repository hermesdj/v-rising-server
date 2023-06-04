import Router from "express-promise-router";
import dayjs from "dayjs";

const router = new Router();

function parseLatest({name, metrics, type, help}) {
    let metric = metrics.length > 0 ? metrics[metrics.length - 1] : [];
    let values = [];
    let time = 0;

    if (metric.values.length === 1) {
        values = metric.values[0];
        time = metric.time;
    }

    return {name, type, help, values, time};
}

router.get('/', (req, res) => {
    res.json({metrics: Array.from(req.vRisingServer.apiClient.metricsMap.keys())});
});

router.get('/byName/:name', (req, res) => {
    const metric = req.vRisingServer.apiClient.metricsMap.get(req.params.name);
    res.json(metric);
});

router.get('/byName/:name/latest', (req, res) => {
    const metric = req.vRisingServer.apiClient.metricsMap.get(req.params.name);
    res.json(parseLatest(metric));
});

router.get('/latest', (req, res) => {
    const result = [];

    for (const [, value] of req.vRisingServer.apiClient.metricsMap) {
        result.push(parseLatest(value))
    }

    res.json(result);
});

router.get('/byNames', (req, res) => {
    const {names, time} = req.query;

    const parsedTime = time ? parseInt(time) : 60 * 60;
    const filterTime = dayjs().subtract(parsedTime, 's').toDate().getTime();

    if (names && Array.isArray(names) && names.length > 0) {
        const metrics = [];

        for (const name of names) {
            const data = req.vRisingServer.apiClient.metricsMap.get(req.params.name)
            metrics.push({...data, metrics: data.metrics.filter(metric => metric.time > filterTime)});
        }

        res.json(metrics);
    } else {
        res.status(400).json({message: 'names query parameter must be an array with at least one element'});
    }
});

export default router;
