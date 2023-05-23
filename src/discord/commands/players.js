import {SlashCommandBuilder} from "@discordjs/builders";
import {vRisingServer} from "../../v-rising/server.js";

const playersCommand = new SlashCommandBuilder().setName('v-players').setDescription('Afficher la liste des joueurs actuellement connectés');

export const data = playersCommand.toJSON();

export const execute = async (interaction, api) => {
    const players = vRisingServer.playerManager.getValidPlayerList();

    let content = `Il y a actuellement ${players.length} joueurs connectés`;

    if (players.length > 0) {
        content += `\n${players.map(p => p.characterName).join('\n')}`;
    } else {
        content += '.';
    }

    await api.interactions.reply(interaction.id, interaction.token, {
        content
    });
}
