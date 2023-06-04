import lodash from 'lodash';
import axios from "axios";
import {logger} from "../../logger.js";
import parsePrometheusTextFormat from "parse-prometheus-text-format";
import {EventEmitter} from "events";
import dayjs from "dayjs";

export class VRisingServerApiClient extends EventEmitter {
    constructor(server) {
        super();
        this.options = {metrics: {retain: 6}};
        this.metricsMap = new Map();
        this.isPaused = true;

        server.on('http_service_ready', () => this.startPollingMetrics());
        server.on('config_updated', config => this.updateOptions(config.server.api));
        server.settingsManager.on('applied_host_settings', settings => this.updateApiConfig(settings.API));
        server.processManager.on('process_stopped', () => this.stopPollingMetrics());
        server.on('server_stopped', () => this.stopPollingMetrics());
    }

    _initApiClient() {
        const baseURL = `http://127.0.0.1:${this.apiConfig.BindPort}${this.apiConfig.BasePath}`;
        this.client = axios.create({
            baseURL
        });
        logger.debug('Init v-rising-api-client with baseURL %s', baseURL);
    }

    updateOptions(options) {
        logger.debug('Updated v-rising-api-client options %j', options);
        this.options = lodash.defaultsDeep(options, {
            metrics: {retain: 6}
        });
    }

    updateApiConfig(apiConfig) {
        this.apiConfig = lodash.defaultsDeep(apiConfig, {
            Enabled: false,
            BindAddress: "*",
            BindPort: 9090,
            BasePath: "/",
            AccessList: "",
            PrometheusDelay: 30
        });
        logger.debug('Updated v-rising-api-client api config %j', this.apiConfig);
        this._initApiClient(apiConfig);
    }

    startPollingMetrics() {
        if (!this.apiConfig.Enabled) {
            logger.warn('VRising Server HTTP API is not enabled !');
            return;
        }

        if (this.isPaused) {
            logger.info('Start polling VRising server API with interval %d seconds', this.apiConfig.PrometheusDelay);
            this.isPaused = false;
            this.execPolling();
        }
    }

    execPolling() {
        this.pollMetrics()
            .then(() => logger.info('Polling metrics has ended...'))
            .catch(err => logger.error('Error polling metrics: %s', err.message));
    }

    resumePollingMetrics() {
        this.isPaused = false;
        this.execPolling();
    }

    stopPollingMetrics() {
        this.isPaused = true;
    }

    isPolling() {
        return !this.isPaused;
    }

    async pollMetrics() {
        logger.info('Starting polling metrics...');
        for await (const measures of this.metrics()) {
            for (const {name, help, type, value} of measures) {
                if (!this.metricsMap.has(name)) {
                    this.metricsMap.set(name, {name, help, type, metrics: []});
                }

                this.metricsMap.get(name).metrics.push(value);
            }
        }
    }

    async* metrics() {
        while (this.isPolling()) {
            try {
                this.cleanMetrics();
                const {data} = await this.client.get('metrics/', {headers: {Accept: 'text/plain'}});
                if (!lodash.isEmpty(data)) {
                    const parsedMetrics = parsePrometheusTextFormat(data);
                    logger.debug('Retrieved %d metrics from endpoint', parsedMetrics.length);
                    const time = dayjs().toDate().getTime();

                    const result = parsedMetrics.map(metric => ({
                        ...metric,
                        value: {
                            time,
                            values: metric.metrics
                        }
                    }));

                    logger.info('parsed %d server metrics', result.length);

                    yield result;
                } else {
                    logger.debug('prometheus metrics are empty');
                }
            } catch (err) {
                logger.error('Error retrieving metrics : %s', err.message);
                console.error(err);
            }

            logger.debug('Waiting %d seconds before polling metrics again', this.apiConfig.PrometheusDelay);
            await new Promise((resolve) => setTimeout(resolve, this.apiConfig.PrometheusDelay * 1000));
        }
    }

    cleanMetrics() {
        const time = dayjs().subtract(this.options.metrics.retain, 'hour').toDate().getTime();

        let total = 0;
        this.metricsMap.forEach((value, key, map) => {
            const filtered = value.metrics.filter(metric => metric.time > time);
            total += value.metrics.length - filtered.length;
            map.set(key, {...value, metrics: filtered});
        });

        if (total > 0) {
            logger.info('cleaned %d metrics array of metrics older than %d hours', total, this.options.metrics.retain);
        }
    }
}
