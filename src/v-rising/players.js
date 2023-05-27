import {EventEmitter} from "events";
import {logger} from "../logger.js";

export class VRisingPlayerManager extends EventEmitter {
    constructor() {
        super();
        this.players = [];
    }

    parseDetectedPlayer([, steamIdx, approvedUserIndex, hasLocalCharacter, steamID, userIndex, shouldCreateCharacter, isAdmin]) {
        userIndex = parseInt(userIndex);
        approvedUserIndex = parseInt(approvedUserIndex);
        shouldCreateCharacter = shouldCreateCharacter === 'True';
        hasLocalCharacter = hasLocalCharacter === 'True';
        isAdmin = isAdmin === 'True';
        let player = this.players.find(p => p.approvedUserIndex === approvedUserIndex);

        if (!player) {
            player = {
                userIndex,
                steamIdx,
                approvedUserIndex,
                hasLocalCharacter,
                steamID,
                shouldCreateCharacter,
                isAdmin,
                characterName: null,
                connectionId: null,
                entityId: null
            }

            this.players.push(player);
        } else {
            player.shouldCreateCharacter = shouldCreateCharacter;
            player.steamID = steamID;
            player.isAdmin = isAdmin;
            player.userIndex = userIndex;
            player.steamIdx = steamIdx;
            player.hasLocalCharacter = hasLocalCharacter;
        }

        logger.debug('Player %d updated : %j', approvedUserIndex, player);

        return player;
    }

    parsePlayerInfo([, steamIdx, steamID, approvedUserIndex, characterName, connectionId, entityId]) {
        approvedUserIndex = parseInt(approvedUserIndex);
        let player = this.players.find(p => p.approvedUserIndex === approvedUserIndex);

        if (!player) {
            player = {
                userIndex: null,
                steamIdx,
                approvedUserIndex,
                hasLocalCharacter: true,
                steamID,
                shouldCreateCharacter: false,
                isAdmin: null,
                characterName,
                connectionId,
                entityId
            }

            this.players.push(player);
        } else {
            player.steamID = steamID;
            player.steamIdx = steamIdx;
            player.characterName = characterName;
            player.connectionId = connectionId;
            player.entityId = entityId;
        }

        logger.debug('Player %d updated : %j', approvedUserIndex, player);

        this.emit('player_connected', player);

        return player;
    }

    parseDisconnectedPlayer([, , approvedUserIndex, reason]) {
        approvedUserIndex = parseInt(approvedUserIndex);
        const index = this.players.findIndex(p => p.approvedUserIndex === approvedUserIndex);

        if (index > -1) {
            this.players.splice(index, 1);
            logger.debug('Removed player with approved user index %d with reason %s', approvedUserIndex, reason);
        } else {
            logger.debug('Could not find player with approved user index %d', approvedUserIndex);
        }

        this.emit('player_disconnected', approvedUserIndex);
    }

    getValidPlayerList() {
        return this.players.filter(p => !!p.characterName);
    }
}

export const playerManager = new VRisingPlayerManager();
