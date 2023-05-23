import {REST} from '@discordjs/rest';
import {WebSocketManager} from '@discordjs/ws';
import {
    Client,
    GatewayIntentBits,
    GatewayDispatchEvents,
    API,
    ApplicationCommandsAPI,
    InteractionType,
    MessageFlags
} from '@discordjs/core';
import {Collection} from '@discordjs/collection';
import path from "path";
import url from "url";
import * as fs from "fs";
import {logger} from "../logger.js";
import {loadServerConfig} from "../config.js";

const config = loadServerConfig();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const token = config.discord.token;

const rest = new REST({version: '10'}).setToken(token);

const gateway = new WebSocketManager({
    token,
    intents: GatewayIntentBits.MessageContent,
    rest
});

const api = new API(rest);

const commandApi = new ApplicationCommandsAPI(rest);

const commands = new Collection();

const client = new Client({rest, gateway});

client.on(GatewayDispatchEvents.Ready, () => logger.info('Discord BOT is ready !'));

client.on(GatewayDispatchEvents.InteractionCreate, async ({data: interaction, api}) => {
    if (interaction.channel_id !== config.discord.channelId) return;

    if (interaction.type !== InteractionType.ApplicationCommand) {
        logger.debug('%s is not an application command !', interaction.data.name);
        return;
    }

    const command = commands.get(interaction.data.name);

    if (!command) {
        logger.error(`No command matching ${interaction.data.name} was found.`);
        return;
    }

    try {
        await command.execute(interaction, api);
    } catch (err) {
        logger.error(err);
        if (interaction.replied || interaction.deferred) {
            await api.interactions.followUp(interaction.id, interaction.token, {
                content: 'There was an error executing this command!',
                flags: MessageFlags.Ephemeral
            });
        } else {
            await api.interactions.reply(interaction.id, interaction.token, {
                content: 'There was an error executing this command!',
                flags: MessageFlags.Ephemeral
            });
        }
    }
});

export const sendDiscordMessage = async (message) => {
    logger.debug('Sending discord message: %s', message);
    return api.channels.createMessage(
        config.discord.channelId,
        {
            content: message
        }
    );
};

export const initBotCommands = async () => {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        logger.debug('importing command %s', file);
        const command = await import(`file://${filePath}`);

        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
        } else {
            logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    const result = await commandApi.bulkOverwriteGlobalCommands(config.discord.appId, commands.map(command => command.data));

    logger.info('initialised %d bot commands', result.length);
}

gateway.connect().then(() => logger.info('Discord gateway connected !'));
