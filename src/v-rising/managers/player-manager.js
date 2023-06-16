import {EventEmitter} from "events";
import lodash from 'lodash';
import {DbManager} from "../../db-manager.js";
import {logger} from "../../logger.js";
import {sleep} from "../utils.js";
import {LogParser} from "./log-parser.js";

class PlayerStore {
    constructor() {
        this.db = DbManager.createDb('players-db', 'players');
    }

    async read() {
        return this.db.db.read();
    }

    all() {
        return this.db.all();
    }

    findPlayerBySteamID(steamID) {
        return this.db.all().find(player => player.steamID === steamID);
    }

    savePlayer(userIndex, player) {
        return this.db.set(userIndex, player);
    }

    tmpSavePlayer(userIndex, player) {
        return this.db.tmpSet(userIndex, player);
    }

    getPlayer(userIndex) {
        return this.db.get(userIndex);
    }

    write() {
        return this.db.write();
    }

    exists(userIndex) {
        return this.db.has(userIndex);
    }
}

export class VRisingPlayerManager extends EventEmitter {
    constructor(server, apiClient) {
        super();
        this.server = server;
        this.apiClient = apiClient;
        this.store = new PlayerStore();
        this.logParser = new PlayerLogParser(this.store);
        this.hasHttpService = false;

        this.server.on('server_started', () => this.onServerStarted());
        this.server.on('http_service_ready', () => this.hasHttpService = true);
        this.server.on('online', () => this.onServerOnline());
        this.server.on('server_stopped', () => this.onServerStopped());

        this.logParser.on('player_connected', player => this._updatePlayer('player_connected', player));
        this.logParser.on('player_disconnected', player => this._updatePlayer('player_disconnected', player));
    }

    async _updatePlayer(event, player) {
        if (event && player && player.userIndex !== null) {
            const syncedPlayer = await this.updatePlayerFromApi(player.userIndex, player);
            await this.store.savePlayer(player.userIndex, syncedPlayer);

            const storedPlayer = this.store.getPlayer(syncedPlayer.userIndex);
            this.emit(event, storedPlayer);
        }
    }

    async updatePlayerFromApi(userIndex, playerObj) {
        try {
            if (playerObj.isInitializedFromApi === undefined) {
                playerObj.isInitializedFromApi = false;
            }
            logger.debug('Querying the API for player %d details', userIndex);
            const {player} = await this.apiClient.players.getPlayerDetails(userIndex);
            if (player) {
                playerObj = {
                    ...playerObj,
                    ...player
                };

                playerObj.isInitializedFromApi = true;
            } else {
                logger.warn('No player %d details found in response', userIndex);
            }

            return playerObj;
        } catch (err) {
            logger.warn('Could not load player from API');
            return playerObj;
        }
    }

    async onServerStarted() {
        const players = this.store.all();

        for (const player of players) {
            await this.store.savePlayer(player.userIndex, {...player, isConnected: false});
        }
    }

    async onServerStopped() {
        const players = this.store.all();

        for (const player of players) {
            this.store.tmpSavePlayer(player.userIndex, {...player, isConnected: false});
        }

        await this.store.write();
    }

    async onServerOnline() {
        if (!this.hasHttpService) return;
        logger.info('Server is online, waiting a second before initializing players');
        await sleep(1000);

        try {
            const {players} = await this.apiClient.players.getAllPlayers();
            logger.info('Found %d players retrieved from the API', players.length);

            for (let player of players) {
                if (!this.store.exists(player.userIndex)) {
                    logger.debug('Player %d does not exists in the store, retrieving it from API', player.userIndex);
                    player = await this.updatePlayerFromApi(player.userIndex, player);
                } else {
                    let localPlayer = this.store.getPlayer(player.userIndex);
                    player = {
                        ...localPlayer,
                        ...player,
                    };
                }

                if (!player.isInitializedFromApi) {
                    logger.debug('Loading player %d info from API', player.userIndex);
                    player = await this.updatePlayerFromApi(player.userIndex, player);
                }

                this.store.tmpSavePlayer(player.userIndex, player);
            }

            await this.store.write();
        } catch (err) {
            logger.warn('Could not update players from API : %s', err.message);
        }
    }

    getPlayer(userIndex) {
        return this.store.getPlayer(userIndex);
    }

    getAllPlayers() {
        return this.store.all().filter(player => player.hasLocalCharacter);
    }

    getConnectedPlayers() {
        return this.store.all().filter(player => player.isConnected);
    }

    isPlayer(steamID) {
        return this.store.all().some(player => player.steamID === steamID);
    }
}

class PlayerLogParser extends LogParser {
    constructor() {
        super([
            {
                regex: /NetEndPoint '{Steam (\d*)}' .* approvedUserIndex: (\d*) HasLocalCharacter: (True|False) .* PlatformId: (\d*) UserIndex: (\d*) ShouldCreateCharacter: (True|False) IsAdmin: (True|False)/g,
                parse: async (matches) => {
                    this.parseConnectedPlayer(matches);
                }
            },
            {
                regex: /User '{Steam (\d*)}' '(\d*)', approvedUserIndex: (\d*), Character: '(.*)' connected as ID '(\d*),(\d*)', Entity '(\d*),(\d*)'\./g,
                parse: async (matches) => {
                    this.parseConnectedCharacter(matches);
                }
            },
            {
                regex: /User '{Steam (\d*)}' disconnected. approvedUserIndex: (\d*) Reason: (.*)/g,
                parse: async (matches) => {
                    this.parseDisconnectedPlayer(matches);
                }
            },
            {
                regex: /NetEndPoint '{Steam (\d*)}' reconnect was approved\. approvedUserIndex: (\d*) HasLocalCharacter: (True|False) Hail Message Size: \d* Version: \d* PlatformId: (\d*) UserIndex: (\d) ShouldCreateCharacter: (True|False) IsAdmin: (True|False) Length: \d*\n/g,
                parse: async (matches) => {
                    this.parseReconnectedPlayer(matches);
                }
            }
        ]);

        this.playerMap = new Map();
    }

    _initPlayer(approvedUserIndex, obj) {
        if (this.playerMap.has(approvedUserIndex)) {
            this.playerMap.set(approvedUserIndex, {
                ...this.playerMap.get(approvedUserIndex),
                ...obj
            });
        } else {
            this.playerMap.set(approvedUserIndex, lodash.defaults(obj, {
                userIndex: null,
                steamIdx: null,
                steamID: null,
                approvedUserIndex: null,
                hasLocalCharacter: false,
                shouldCreateCharacter: false,
                isAdmin: false,
                isBanned: false,
                characterName: null,
                entityId: null,
                disconnectReason: null
            }));
        }
        return this.playerMap.get(approvedUserIndex)
    }

    parseConnectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
        userIndex = parseInt(userIndex);
        approvedUserIndex = parseInt(approvedUserIndex);
        shouldCreateCharacter = shouldCreateCharacter === 'True';
        hasLocalCharacter = hasLocalCharacter === 'True';
        isAdmin = isAdmin === 'True';

        const player = this._initPlayer(approvedUserIndex, {
            userIndex,
            steamIdx,
            approvedUserIndex,
            hasLocalCharacter,
            steamID,
            shouldCreateCharacter,
            isAdmin
        });

        this.emit('player_connected', player);
    }

    parseConnectedCharacter([, steamIdx, steamID, approvedUserIndex, characterName, userIndex, , entityId]) {
        userIndex = parseInt(userIndex);
        approvedUserIndex = parseInt(approvedUserIndex);
        characterName = lodash.isEmpty(characterName) ? null : characterName;

        const player = this._initPlayer(approvedUserIndex, {
            userIndex,
            steamIdx,
            approvedUserIndex,
            steamID,
            characterName,
            entityId
        });

        this.emit('player_connected', player);
    }

    parseReconnectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
        approvedUserIndex = parseInt(approvedUserIndex);
        userIndex = parseInt(userIndex);
        hasLocalCharacter = hasLocalCharacter === 'True';
        shouldCreateCharacter = shouldCreateCharacter === 'True';
        isAdmin = isAdmin === 'True';

        const player = this._initPlayer(approvedUserIndex, {
            steamID,
            steamIdx,
            approvedUserIndex,
            hasLocalCharacter,
            userIndex,
            shouldCreateCharacter,
            isAdmin
        });

        this.emit('player_connected', player);
    }

    parseDisconnectedPlayer([, , approvedUserIndex, reason]) {
        approvedUserIndex = parseInt(approvedUserIndex);

        if (this.playerMap.has(approvedUserIndex)) {
            const player = this.playerMap.get(approvedUserIndex);
            this.playerMap.delete(approvedUserIndex);
            logger.info('Player approvedUserIndex=%d, userIndex=%d, is disconnected with reason %s !', approvedUserIndex, player.userIndex, player.characterName, reason);
            this.emit('player_disconnected', player.userIndex);
        } else {
            logger.warn('Could not find player with approved user index %d', approvedUserIndex);
        }
    }
}
