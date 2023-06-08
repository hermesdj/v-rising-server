import {EventEmitter} from "events";
import lodash from 'lodash';
import {DbManager} from "../../db-manager.js";
import {logger} from "../../logger.js";
import {sleep} from "../utils.js";

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

        this.logParser.on('player_updated', player => this._updatePlayer('player_updated', player));
        this.logParser.on('detected_player', player => this._updatePlayer('player_updated', player));
        this.logParser.on('player_connected', player => this._updatePlayer('player_connected', player));
        this.logParser.on('player_info', player => this._updatePlayer('player_updated', player));
        this.logParser.on('player_reconnected', player => this._updatePlayer('player_connected', player));
        this.logParser.on('player_disconnected', player => this._updatePlayer('player_disconnected', player));
    }

    async _updatePlayer(event, player) {
        if (event && player && player.userIndex !== null) {
            let storedPlayer = this.store.getPlayer(player.userIndex);

            if (!storedPlayer) {
                const syncedPlayer = await this.updatePlayerFromApi(player.userIndex, player);
                await this.store.savePlayer(player.userIndex, syncedPlayer);
            } else if (!lodash.isEqual(player, storedPlayer)) {
                await this.store.savePlayer(storedPlayer.userIndex, {
                    ...storedPlayer,
                    ...player
                });
            }
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

    getPlayer(userIndex){
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

class PlayerLogParser extends EventEmitter {
    constructor() {
        super();

        this.playerMap = new Map();

        this.regexArray = [
            {
                regex: /NetEndPoint '{Steam (\d*)}' .* approvedUserIndex: (\d*) HasLocalCharacter: (True|False) .* PlatformId: (\d*) UserIndex: (\d*) ShouldCreateCharacter: (True|False) IsAdmin: (True|False)/g,
                parse: async (matches) => {
                    await this.parseDetectedPlayer(matches);
                }
            },
            {
                regex: /User '{Steam (\d*)}' '(\d*)', approvedUserIndex: (\d*), Character: '(.*)' connected as ID '(\d*),(\d*)', Entity '(\d*),(\d*)'\./g,
                parse: async (matches) => {
                    await this.parsePlayerInfo(matches);
                }
            },
            {
                regex: /User '{Steam (\d*)}' disconnected. approvedUserIndex: (\d*) Reason: (.*)/g,
                parse: async (matches) => {
                    await this.parseDisconnectedPlayer(matches);
                }
            },
            {
                regex: /NetEndPoint '{Steam (\d*)}' reconnect was approved\. approvedUserIndex: (\d*) HasLocalCharacter: (True|False) Hail Message Size: \d* Version: \d* PlatformId: (\d*) UserIndex: (\d) ShouldCreateCharacter: (True|False) IsAdmin: (True|False) Length: \d*\n/g,
                parse: async (matches) => {
                    await this.parseReconnectedPlayer(matches);
                }
            },
            {
                regex: /User\s(\d*)\s\(Character: (.*)\) has begun its spawn fadeout!$/g,
                parse: async (matches) => {
                    await this.parseCharacterNameAndSteamId(matches);
                }
            },
            {
                regex: /User\s(\d*)\s\(Character: ([a-zA-Z]*)\) has been hidden due to waiting for content!$/g,
                parse: async (matches) => {
                    await this.parseCharacterNameAndSteamId(matches);
                }
            },
            {
                regex: /Spawned character at chunk '\d*,\d*' for user (\d*) \(Character: (.*)\) entity '\d*,\d*' hasCastleSpawn: (False|True) netherSpawnPositionEntity: (\d*) spawnLocation: .* firstTimeSpawn: (False|True)/g,
                parse: async (matches) => {
                    await this.parseCharacterNameAndSteamId(matches);
                }
            }
        ];
    }

    _initPlayer(obj) {
        return lodash.defaults(obj, {
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
            connectedAt: null,
            isConnected: false,
            disconnectedAt: null,
            disconnectReason: null
        })
    }

    async parseCharacterNameAndSteamId([, steamID, characterName]) {
        const player = this.store.findPlayerBySteamID(steamID);
        characterName = lodash.isEmpty(characterName) ? null : characterName;

        if (player) {
            if ((!player.characterName && characterName) || !player.hasLocalCharacter) {
                logger.info('Update player with SteamID : %s, characterName: %s', steamID, characterName);
                player.characterName = characterName;
                player.hasLocalCharacter = true;
                player.shouldCreateCharacter = false;

                if (player.approvedUserIndex && this.playerMap.has(player.approvedUserIndex)) {
                    this.playerMap.set(player.approvedUserIndex, {
                        ...this.playerMap.get(player.approvedUserIndex),
                        characterName
                    })
                }

                this.emit('player_updated', player);
            } else {
                logger.debug('Player with steamID %s is already named %s', steamID, characterName);
            }
        } else {
            logger.warn('Unknown player with steamID %s', steamID);
        }
    }

    parseDetectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
        userIndex = parseInt(userIndex);
        approvedUserIndex = parseInt(approvedUserIndex);
        shouldCreateCharacter = shouldCreateCharacter === 'True';
        hasLocalCharacter = hasLocalCharacter === 'True';
        isAdmin = isAdmin === 'True';

        let player = this.store.getPlayer(userIndex);

        if (!player) {
            player = this._initPlayer({
                userIndex,
                steamIdx,
                approvedUserIndex,
                hasLocalCharacter,
                steamID,
                shouldCreateCharacter,
                isAdmin,
                connectedAt: new Date(),
                isConnected: true
            });
        } else {
            player = {
                ...player,
                steamID,
                isAdmin,
                userIndex,
                steamIdx,
                hasLocalCharacter,
                shouldCreateCharacter,
                isConnected: true,
                disconnectReason: null,
                disconnectedAt: null
            }
        }

        this.playerMap.set(approvedUserIndex, player);

        logger.info('Player %d detected with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        this.emit('detected_player', player);

        return player;
    }

    parsePlayerInfo([, steamIdx, steamID, approvedUserIndex, characterName, userIndex, , entityId]) {
        userIndex = parseInt(userIndex);
        approvedUserIndex = parseInt(approvedUserIndex);
        characterName = lodash.isEmpty(characterName) ? null : characterName;

        let player = this.store.getPlayer(userIndex);

        if (!characterName && player && player.characterName) {
            characterName = player.characterName;
        }

        if (!player) {
            player = this._initPlayer({
                userIndex,
                steamIdx,
                approvedUserIndex,
                steamID,
                characterName,
                entityId,
                isConnected: true,
                connectedAt: new Date()
            });
        } else {
            player = {
                ...player,
                steamID,
                steamIdx,
                characterName,
                userIndex,
                entityId,
                disconnectedAt: null,
                disconnectReason: null
            }

            if (!player.isConnected || !player.connectedAt) {
                player.isConnected = true;
                player.connectedAt = new Date();
            }
        }

        this.playerMap.set(approvedUserIndex, player);

        logger.info('Player %d updated with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        if (player.isConnected) {
            this.emit('player_connected', player);
        } else {
            this.emit('player_info', player);
        }

        return player;
    }

    parseReconnectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
        approvedUserIndex = parseInt(approvedUserIndex);
        userIndex = parseInt(userIndex);
        hasLocalCharacter = hasLocalCharacter === 'True';
        shouldCreateCharacter = shouldCreateCharacter === 'True';
        isAdmin = isAdmin === 'True';

        let player = this.store.getPlayer(userIndex);

        if (!player) {
            player = this._initPlayer({
                steamID,
                steamIdx,
                approvedUserIndex,
                hasLocalCharacter,
                userIndex,
                shouldCreateCharacter,
                isAdmin,
                isConnected: true,
                connectedAt: new Date(),
                disconnectedAt: null,
                disconnectReason: null
            })
        } else {
            player = {
                ...player,
                steamID,
                steamIdx,
                approvedUserIndex,
                hasLocalCharacter,
                userIndex,
                shouldCreateCharacter,
                isAdmin,
                isConnected: true,
                connectedAt: new Date(),
                disconnectedAt: null,
                disconnectReason: null
            }
        }

        this.playerMap.set(approvedUserIndex, player);

        logger.info('Player %d reconnect with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        this.emit('player_reconnected', player);

        return player;
    }

    parseDisconnectedPlayer([, , approvedUserIndex, reason]) {
        approvedUserIndex = parseInt(approvedUserIndex);

        if (this.playerMap.has(approvedUserIndex)) {
            const player = this.playerMap.get(approvedUserIndex);
            const savedPlayer = this.store.getPlayer(player.userIndex);

            if (player.userIndex !== savedPlayer.userIndex) {
                logger.warn('There is a discrepancy between approved user %d and user index %d', approvedUserIndex, player.userIndex);
            } else {
                player.isConnected = false;
                player.disconnectedAt = new Date();
                player.disconnectReason = reason;
                player.approvedUserIndex = null;

                this.playerMap.delete(approvedUserIndex);
                logger.info('Player approvedUserIndex=%d, userIndex=%d, characterName=%s is disconnected with reason %s !', approvedUserIndex, player.userIndex, player.characterName, reason);
                this.emit('player_disconnected', player);
            }
        } else {
            logger.info('Could not find player with approved user index %d', approvedUserIndex);
        }
    }

    async parseLogLine(line) {
        for (const {regex, parse} of this.regexArray) {
            const matches = regex.exec(line);
            if (matches && matches.length > 0) {
                await parse(matches, line);
                regex.lastIndex = 0;
                break;
            }
            regex.lastIndex = 0;
        }
    }
}
