import {EventEmitter} from "events";
import axios from "axios";
import {logger} from "../../logger.js";
import lodash from "lodash";
import {VRisingClanApiClient} from "./clients/clans-client.js";
import {VRisingPlayersApiClient} from "./clients/players-client.js";
import {VRisingServerMetricsClient} from "./clients/metrics-client.js";

class ApiError extends Error {
    constructor(message, data) {
        super(message);
        this.data = data;
    }
}

export class VRisingApiClient extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.apiConfig = {
            Enabled: false,
            BindAddress: "*",
            BindPort: 9090,
            BasePath: "/",
            AccessList: "",
            PrometheusDelay: 30
        };
        server.settingsManager.on('applied_host_settings', settings => this.updateApiConfig(settings.API));
        this.clans = new VRisingClanApiClient(this);
        this.players = new VRisingPlayersApiClient(this);
        this.metrics = new VRisingServerMetricsClient(this);
    }

    get isEnabled() {
        return this.apiConfig.Enabled === true;
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

    _initApiClient() {
        const baseURL = `http://127.0.0.1:${this.apiConfig.BindPort}${this.apiConfig.BasePath}`;
        this.client = axios.create({
            baseURL
        });
        logger.debug('Init v-rising-api-client with baseURL %s', baseURL);
    }

    _checkApiClient() {
        if (!this.client) throw new Error('API Client is not initialized');
        if (!this.isEnabled) throw new Error('API Client is not Enabled');
    }

    _parseAxiosError(err) {
        if (err.response) {
            throw new ApiError(err.message, err.response.data);
        } else if (err.request) {
            throw new ApiError(err.message, err.request);
        } else {
            throw new ApiError(err.message);
        }
    }

    async execGet(url, params) {
        this._checkApiClient();
        return this.client.get(url, params)
            .then(res => res.data)
            .catch(err => this._parseAxiosError(err));
    }

    async execPost(url, body, params) {
        this._checkApiClient();
        return this.client.post(url, body, params)
            .then(res => res.data)
            .catch(err => this._parseAxiosError(err));
    }
}
