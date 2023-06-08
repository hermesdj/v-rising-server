export class VRisingClanApiClient {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    getAllClans(){
        return this.apiClient.execGet('v-rising-server-api/clans');
    }
}
