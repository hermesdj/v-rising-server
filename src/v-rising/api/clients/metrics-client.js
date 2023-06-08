import lodash from 'lodash';
import {logger} from "../../../logger.js";
import parsePrometheusTextFormat from "parse-prometheus-text-format";
import {EventEmitter} from "events";
import dayjs from "dayjs";
import {sleep} from "../../utils.js";

export class VRisingServerMetricsClient extends EventEmitter {
    constructor(apiClient) {
        super();
        this.apiClient = apiClient;
        this.metricsMap = new Map();
        this.isPaused = true;

        this.options = {
            metrics: {
                pollingEnabled: false,
                retain: 6
            }
        };

        apiClient.server.on('http_service_ready', () => this.startPollingMetrics());
        apiClient.server.on('config_updated', config => this.updateOptions(config.server.api));
        apiClient.server.processManager.on('process_stopped', () => this.stopPollingMetrics());
        apiClient.server.on('server_stopped', () => this.stopPollingMetrics());
    }

    updateOptions(options) {
        logger.debug('Updated v-rising-api-client options %j', options);
        this.options = lodash.defaultsDeep(options, {
            metrics: {retain: 6}
        });
    }

    startPollingMetrics() {
        if (!this.apiClient.IsEnabled) {
            logger.warn('VRising Server HTTP API is not enabled !');
            return;
        }

        if (!this.options.metrics.pollingEnabled) {
            logger.info('Polling metrics is not enabled');
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

    stopPollingMetrics() {
        this.isPaused = true;
    }

    isPolling() {
        return !this.isPaused;
    }

    async pollMetrics() {
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
                const {data} = await this.apiClient.execGet('metrics/', {headers: {Accept: 'text/plain'}});
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

                    logger.debug('parsed %d server metrics', result.length);

                    yield result;
                } else {
                    logger.debug('prometheus metrics are empty');
                }
            } catch (err) {
                logger.error('Error retrieving metrics : %s', err.message);
            }

            logger.debug('Waiting %d seconds before polling metrics again', this.apiClient.apiConfig.PrometheusDelay);
            await sleep(this.apiClient.apiConfig.PrometheusDelay * 1000);
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
            logger.debug('cleaned %d metrics array of metrics older than %d hours', total, this.options.metrics.retain);
        }
    }
}
