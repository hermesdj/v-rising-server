import {SlashCommandBuilder} from "@discordjs/builders";

const playersCommand = new SlashCommandBuilder().setName('v-players').setDescription('Afficher la liste des joueurs actuellement connectés');
export const data = playersCommand.toJSON();

export const execute = async (interaction, config, server) => {
    const players = server.playerManager.getConnectedPlayers();

    let content = `Il y a actuellement ${players.length} joueurs connectés`;

    if (players.length > 0) {
        content += `\n${players.map(p => p.characterName).join('\n')}`;
    } else {
        content += '.';
    }

    await interaction.reply({
        content,
        ephemeral: true
    });
}
