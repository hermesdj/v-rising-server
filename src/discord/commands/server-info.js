import {SlashCommandBuilder} from '@discordjs/builders';
import dayjs from "dayjs";

const serverInfoCommand = new SlashCommandBuilder().setName('v-server-info').setDescription('Afficher les informations sur le serveur');

export const data = serverInfoCommand.toJSON();
export const execute = async (interaction, context) => {
    const serverInfo = context.server.getServerInfo();
    let content;
    if (context.server.isRunning()) {
        if (serverInfo.scheduledOperation) {
            // TODO Revoir avec la nouvelle API d'operations
            content = context.$t('discord.commands.server-info.operationInProgress', serverInfo);
        } else {
            content = context.$t('discord.commands.server-info.online', serverInfo);
        }
    } else {
        content = context.$t('discord.commands.server-info.offline', serverInfo);
    }

    await interaction.reply({
        content,
        ephemeral: true
    });
}
