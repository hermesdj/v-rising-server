import axios from "axios";

export class ThunderstoreApiClient {
    constructor(config) {
        this.reloadConfig(config);
    }

    reloadConfig(config) {
        this.baseURL = config.url;
        this.client = axios.create({
            baseURL: this.baseURL
        })
    }

    async fetchAllMods() {
        const {data} = await this.client.get('/package/');
        return data;
    }

    async getModByUuid(id) {
        const {data} = await this.client.get(`/packages/${id}/`);
        return data;
    }
}
