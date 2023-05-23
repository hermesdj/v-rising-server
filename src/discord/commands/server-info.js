import {SlashCommandBuilder} from '@discordjs/builders';
import {vRisingServer} from "../../v-rising/server.js";
import dayjs from "dayjs";

const serverInfoCommand = new SlashCommandBuilder().setName('v-server-info').setDescription('Afficher les informations sur le serveur');

export const data = serverInfoCommand.toJSON();
export const execute = async (interaction, api) => {
    const serverInfo = vRisingServer.getServerInfo();
    await api.interactions.reply(interaction.id, interaction.token, {
        content: `Date: ${dayjs(serverInfo.time).format('DD/MM/YYYY HH:mm:ss')}, Version : ${serverInfo.version}, Connecté à Steam : ${serverInfo.connectedToSteam ? 'Oui' : 'Non'}, Setup terminé: ${serverInfo.serverSetupComplete ? 'Oui' : 'Non'}, ID Steam : ${serverInfo.steamID}`
    });
}
