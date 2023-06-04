import {SlashCommandBuilder} from "discord.js";
import {logger} from "../../logger.js";

const assignRole = new SlashCommandBuilder()
    .setName('v-role')
    .setDescription('Obtenir le rôle V Rising');
export const data = assignRole.toJSON();

export const execute = async (interaction, config) => {
    const role = interaction.guild.roles.cache.get(config.discord.roleId);

    if (role) {
        if (!interaction.member.roles.cache.has(role.id)) {
            logger.info('Assigning role %s to discord user %s', config.discord.roleId, interaction.member.user.username);

            await interaction.member.roles.add(config.discord.roleId);

            await interaction.reply(interaction.id, interaction.token, {
                content: `Je viens de t'assigner le rôle V Rising !`,
                ephemeral: true
            });
        } else {
            logger.info('Member %s already has the role %s', interaction.member.user.username, config.discord.roleId);
            await interaction.reply({
                content: 'Tu as déjà le rôle V Rising !',
                ephemeral: true
            });
        }
    }
}
