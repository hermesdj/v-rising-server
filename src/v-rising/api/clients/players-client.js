export class VRisingPlayersApiClient {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    getAllPlayers() {
        return this.apiClient.execGet('v-rising-server-api/players');
    }

    getConnectedPlayers() {
        return this.apiClient.execGet('v-rising-server-api/players/connected');
    }

    getPlayerDetails(id) {
        return this.apiClient.execGet(`v-rising-server-api/players/${id}`);
    }
}
