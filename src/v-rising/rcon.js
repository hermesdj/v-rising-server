import {Rcon} from 'rcon-client';
import {logger} from "../logger.js";

let rcon;

export const connectRCon = async (config) => {
    if (rcon) return rcon;
    try {
        rcon = await Rcon.connect(config.rcon);
        logger.info('RCon is connected on %s:%s', config.rcon.host, config.rcon.port);
    } catch (err) {
        logger.warn('Could not connect RCon : %s', err.message);
    }
}

function send(message) {
    if (!rcon) {
        logger.warn('RCon is not active ! could not send message %s', message);
        return;
    }
    return rcon.send(message);
}

export const sendAnnounceToVRisingServer = async (message) => {
    return send(`announce ${message}`);
}

export const sendRestartAnnounceToVRisingServer = async (time) => {
    return send(`announcerestart ${time}`)
}
