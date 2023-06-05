import {SlashCommandBuilder} from "discord.js";
import {logger} from "../../logger.js";

const assignRole = new SlashCommandBuilder()
    .setName('v-role')
    .setDescription('Obtenir le rôle V Rising');
export const data = assignRole.toJSON();

export const execute = async (interaction, context) => {
    const role = await interaction.guild.roles.cache.get(context.config.discord.roleId + '');

    if (role) {
        if (!interaction.member.roles.cache.has(role.id)) {
            logger.info('Assigning role %s to discord user %s', role.name, interaction.member.user.username);

            await interaction.member.roles.add(role.id);

            await interaction.reply({
                content: context.$t("discord.commands.assign-role.assigned", role),
                ephemeral: true
            });
        } else {
            logger.info('Member %s already has the role %s', interaction.member.user.username, role.name);
            await interaction.reply({
                content: context.$t('discord.commands.assign-role.alreadyAssigned', role),
                ephemeral: true
            });
        }
    } else {
        throw new Error(`role with id ${context.config.discord.roleId} not found`);
    }
}
