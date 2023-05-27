import {SlashCommandBuilder} from '@discordjs/builders';
import {vRisingServer} from "../../v-rising/server.js";
import dayjs from "dayjs";

const serverInfoCommand = new SlashCommandBuilder().setName('v-server-info').setDescription('Afficher les informations sur le serveur');

export const data = serverInfoCommand.toJSON();
export const execute = async (interaction, api) => {
    const serverInfo = vRisingServer.getServerInfo();
    let content;
    if (vRisingServer.isRunning()) {
        if (serverInfo.scheduledOperation) {
            content = `Une opération ${serverInfo.scheduledOperation.type === 'restart' ? 'de redémarrage' : "d'arrêt"} a été planifiée pour dans ${serverInfo.scheduledOperation.remainingTime / 60000} minute(s)`;
        } else {
            content = `Date: ${dayjs(serverInfo.time).format('DD/MM/YYYY HH:mm:ss')}, Version : ${serverInfo.version}, Connecté à Steam : ${serverInfo.connectedToSteam ? 'Oui' : 'Non'}, Setup terminé: ${serverInfo.serverSetupComplete ? 'Oui' : 'Non'}, ID Steam : ${serverInfo.steamID}`;
        }
    } else {
        content = `Le serveur V Rising n'est pas activé !`;
    }
    await api.interactions.reply(interaction.id, interaction.token, {
        content
    });
}
