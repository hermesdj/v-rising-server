export class VRisingClanApiClient {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    getAllClans() {
        return this.apiClient.execGet('v-rising-server-api/clans');
    }

    getClanById(clanId) {
        return this.apiClient.execGet(`v-rising-server-api/clans/${clanId}`);
    }

    updateClanName(clanId, newClanName){
        return this.apiClient.execPost(`v-rising-server-api/clans/${clanId}/updateName`, {
            name: newClanName
        });
    }

    updateClanDescription(clanId, newClanDescription){
        return this.apiClient.execPost(`v-rising-server-api/clans/${clanId}/updateMotto`, {
            motto: newClanDescription
        });
    }
}
