import {SlashCommandBuilder} from '@discordjs/builders';
import dayjs from "dayjs";

const serverInfoCommand = new SlashCommandBuilder().setName('v-server-info').setDescription('Afficher les informations sur le serveur');

export const data = serverInfoCommand.toJSON();
export const execute = async (interaction, config, server) => {
    const serverInfo = server.getServerInfo();
    let content;
    if (server.isRunning()) {
        if (serverInfo.scheduledOperation) {
            // TODO Revoir avec la nouvelle API d'operations
            content = `[${serverInfo.serverName}] Une opération ${serverInfo.scheduledOperation.type === 'restart' ? 'de redémarrage' : "d'arrêt"} a été planifiée pour dans ${serverInfo.scheduledOperation.remainingTime / 60000} minute(s)`;
        } else {
            content = `[${serverInfo.serverName}] Date: ${dayjs(serverInfo.time).format('DD/MM/YYYY HH:mm:ss')}, Version : ${serverInfo.version}, Connecté à Steam : ${serverInfo.connectedToSteam ? 'Oui' : 'Non'}, Setup terminé: ${serverInfo.serverSetupComplete ? 'Oui' : 'Non'}, ID Steam : ${serverInfo.steamID}`;
        }
    } else {
        content = `[${serverInfo.serverName}] Le serveur V Rising n'est pas activé !`;
    }

    await interaction.reply({
        content
    });
}
