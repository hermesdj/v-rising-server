import {SlashCommandBuilder} from "@discordjs/builders";

const playersCommand = new SlashCommandBuilder()
    .setName('v-players')
    .setNameLocalization('fr', 'v-joueurs')
    .setDescription('Afficher la liste des joueurs actuellement connectés');
export const data = playersCommand.toJSON();

export const execute = async (interaction, context) => {
    const players = context.server.playerManager.getConnectedPlayers();

    let content = context.$tn('discord.commands.players.connected', players.length, {count: players.length});

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
