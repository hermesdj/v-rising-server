import {EventEmitter} from "events";
import lodash from 'lodash';
import path from "path";
import url from "url";
import {JSONFile} from "lowdb/node";
import {Low} from "lowdb";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const playersFile = path.resolve(path.join(__dirname, '..', '..', 'data', 'players-db.json'));
const adapter = new JSONFile(playersFile);

export const db = new Low(adapter, {players: []});

class PlayerStore {
    constructor(db) {
        this.db = new Players(db);
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

    getPlayer(userIndex) {
        return this.db.get(userIndex);
    }

    write() {
        return this.db.db.write();
    }
}

class Players {
    constructor(db) {
        this.db = db;
        this.chain = lodash.chain(db).get('data').get('players');
    }

    all() {
        return this.chain.value().map(({player}) => player);
    }

    get(userIndex) {
        const obj = this.chain.find({userIndex}).cloneDeep().value();
        return obj ? obj.player : null;
    }

    async set(userIndex, player) {
        const obj = {userIndex, player};
        const found = this.chain.find({userIndex});
        if (found.value()) {
            found.assign(obj).value();
            await this.db.write();
        } else {
            this.chain.push(obj).value();
            await this.db.write();
        }
    }

    async delete(userIndex) {
        this.chain.remove({userIndex}).value();
        await this.db.write();
    }

    async clear() {
        this.chain.remove().value();
        await this.db.write();
    }
}

export class VRisingPlayerManager extends EventEmitter {
    constructor({logger}) {
        super();
        this.logger = logger;
        this.playerMap = new Map();
        this.store = new PlayerStore(db);

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
        ]
    }

    async parseLogLine(line) {
        for (const {regex, parse} of this.regexArray) {
            const matches = regex.exec(line);
            if (matches && matches.length > 0) {
                await parse(matches);
            }
            regex.lastIndex = 0;
        }
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
                this.logger.info('Update player with SteamID : %s, characterName: %s', steamID, characterName);
                player.characterName = characterName;
                player.hasLocalCharacter = true;
                player.shouldCreateCharacter = false;

                await this.store.savePlayer(player.userIndex, player);
                if (player.approvedUserIndex && this.playerMap.has(player.approvedUserIndex)) {
                    this.playerMap.set(player.approvedUserIndex, {
                        ...this.playerMap.get(player.approvedUserIndex),
                        characterName
                    })
                }

                this.emit('player_updated', player);
            } else {
                this.logger.debug('Player with steamID %s is already named %s', steamID, characterName);
            }
        } else {
            this.logger.warn('Unknown player with steamID %s', steamID);
        }
    }

    async parseDetectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
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

        await this.store.savePlayer(userIndex, player);

        this.playerMap.set(approvedUserIndex, player);

        this.logger.info('Player %d detected with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        return player;
    }

    async parsePlayerInfo([, steamIdx, steamID, approvedUserIndex, characterName, userIndex, , entityId]) {
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

        await this.store.savePlayer(userIndex, player);

        this.playerMap.set(approvedUserIndex, player);

        this.logger.info('Player %d updated with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        this.emit('player_connected', player);

        return player;
    }

    async parseReconnectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
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

        await this.store.savePlayer(userIndex, player);

        this.playerMap.set(approvedUserIndex, player);

        this.logger.info('Player %d reconnect with userIndex %d and characterName %s', approvedUserIndex, player.userIndex, player.characterName);

        this.emit('player_connected', player);

        return player;
    }

    async parseDisconnectedPlayer([, steamIdx, approvedUserIndex, reason]) {
        approvedUserIndex = parseInt(approvedUserIndex);

        if (this.playerMap.has(approvedUserIndex)) {
            const player = this.playerMap.get(approvedUserIndex);
            const savedPlayer = this.store.getPlayer(player.userIndex);

            if (player.userIndex !== savedPlayer.userIndex) {
                this.logger.warn('There is a discrepancy between approved user %d and user index %d', approvedUserIndex, player.userIndex);
            } else {
                player.isConnected = false;
                player.disconnectedAt = new Date();
                player.disconnectReason = reason;

                if (player.userIndex) {
                    player.approvedUserIndex = null;
                    await this.store.savePlayer(player.userIndex, player);
                }
                this.playerMap.delete(approvedUserIndex);
                this.logger.info('Player approvedUserIndex=%d, userIndex=%d, characterName=%s is disconnected with reason %s !', approvedUserIndex, player.userIndex, player.characterName, reason);
                this.emit('player_disconnected', player);
            }
        } else {
            this.logger.info('Could not find player with approved user index %d', approvedUserIndex);
        }
    }

    getAllPlayers() {
        return this.store.all().filter(player => player.hasLocalCharacter);
    }

    getConnectedPlayers() {
        return this.store.all().filter(player => player.isConnected);
    }

    async parseAdminList(adminList) {
        const players = [...this.getAllPlayers()];

        for (const player of players) {
            const playerIsAdmin = adminList.includes(player.steamID);

            if (player.isAdmin !== playerIsAdmin) {
                player.isAdmin = playerIsAdmin;
                await this.store.savePlayer(player.userIndex, player);
                this.emit('player_updated', player);
            }
        }
    }

    async parseBanList(banList) {
        const players = this.getAllPlayers();

        for (const player of players) {
            const playerIsBanned = banList.includes(player.steamID);

            if (player.isBanned !== playerIsBanned) {
                player.isBanned = playerIsBanned;
                await this.store.savePlayer(player.userIndex, player);
                this.emit('player_updated', player);
            }
        }
    }
}
