import {ThunderstoreApiClient} from "../src/v-rising/mods/thunderstore-api-client.js";

const apiClient = new ThunderstoreApiClient({
    url: 'https://v-rising.thunderstore.io/api/v1'
});

(async () => {
    const mods = await apiClient.fetchAllMods();
    console.log(mods);
})()
