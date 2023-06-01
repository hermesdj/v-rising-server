import {DbManager} from "../../db-manager.js";

export class PlayerMetricsStore {
    constructor() {
        this.db = DbManager.createDb('player-metrics-db', 'metrics');
    }

    async storePlayerCount(playerCount) {
        const time = Date.now();
        const playerMetrics = this.getPlayerMetrics() || {metrics: [], name: 'player_metrics'};
        playerMetrics.metrics.push({value: playerCount, time});

        await this.db.set('player_metrics', playerMetrics);
    }

    getPlayerMetrics() {
        return this.db.get('player_metrics');
    }
}
