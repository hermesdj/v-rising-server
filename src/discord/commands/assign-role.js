import {SlashCommandBuilder} from "@discordjs/builders";
import {MessageFlags} from "@discordjs/core";
import {logger} from "../../logger.js";

const assignRole = new SlashCommandBuilder().setName('v-role').setDescription('Obtenir le rôle V Rising');
export const data = assignRole.toJSON();

export const execute = async (interaction, api, config) => {
    if (!interaction.member.roles.some(roleId => roleId === config.discord.roleId)) {
        logger.info('Assigning role %s to discord user %s', config.discord.roleId, interaction.member.user.username);
        await api.guilds.addRoleToMember(interaction.guild_id, interaction.member.user.id, config.discord.roleId);
        await api.interactions.reply(interaction.id, interaction.token, {
            content: `Je viens de t'assigner le rôle V Rising !`,
            flags: MessageFlags.Ephemeral
        });
    } else {
        logger.info('Member %s already has the role %s', interaction.member.user.username, config.discord.roleId);
        await api.interactions.reply(interaction.id, interaction.token, {
            content: 'Tu as déjà le rôle V Rising !',
            flags: MessageFlags.Ephemeral
        });
    }
}
