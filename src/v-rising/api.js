import lodash from 'lodash';
import axios from "axios";
import {logger} from "../logger.js";
import parsePrometheusTextFormat from "parse-prometheus-text-format";
import {EventEmitter} from "events";
import dayjs from "dayjs";

export class VRisingServerApiClient extends EventEmitter {
    constructor(config, apiConfig) {
        super();
        const options = config && config.server ? config.server.api : {metrics: {retain: 6}};

        this.updateOptions(options);
        this.updateApiConfig(apiConfig);
        this.interval = null;
        this.metricsMap = new Map();
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
        const backup = {...this.apiConfig};
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

        if (this.isPolling() && backup.PrometheusDelay !== this.apiConfig.PrometheusDelay) {
            this.stopPollingMetrics();
            this.startPollingMetrics();
        }
    }

    startPollingMetrics() {
        if (!this.apiConfig.Enabled) {
            logger.warn('VRising Server HTTP API is not enabled !');
            return;
        }
        logger.info('Start polling VRising server API with interval %d seconds', this.apiConfig.PrometheusDelay);
        this.interval = setInterval(() => this.pollMetrics(), this.apiConfig.PrometheusDelay * 1000);
    }

    stopPollingMetrics() {
        if (this.isPolling()) clearInterval(this.interval);
    }

    isPolling() {
        return this.interval !== null;
    }

    pollMetrics() {
        return this.client.get('metrics/', {headers: {Accept: 'text/plain'}})
            .then(({data}) => {
                this.cleanMetrics();
                if (!lodash.isEmpty(data)) {
                    const parsedMetrics = parsePrometheusTextFormat(data);
                    const time = dayjs().toDate().getTime();
                    for (const {name, help, type, metrics} of parsedMetrics) {
                        if (!this.metricsMap.has(name)) {
                            this.metricsMap.set(name, {name, help, type, metrics: []});
                        }

                        this.metricsMap.get(name).metrics.push({time, values: metrics});
                    }

                    logger.debug('parsed %d server metrics', parsedMetrics.length);
                } else {
                    logger.debug('prometheus metrics are empty');
                }
            }).catch(err => {
                logger.error('Metrics polling error: %s', err.message)
            });
    }

    cleanMetrics() {
        const time = dayjs().subtract(this.options.metrics.retain, 'hour').toDate().getTime();
        this.metricsMap.forEach((value, key, map) => {
            map.set(key, {...value, metrics: value.metrics.filter(metric => metric.time > time)});
        });
        logger.debug('cleaned metrics array of metrics older than %d hours', this.options.metrics.retain);
    }
}
