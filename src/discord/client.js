import {Routes, Events, Client, GatewayIntentBits, Collection, REST} from 'discord.js';
import path from "path";
import url from "url";
import * as fs from "fs";
import {logger} from "../logger.js";
import {EventEmitter} from "events";
import lodash from "lodash";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class VRisingDiscordBot extends EventEmitter {
    constructor(config) {
        super();
        this.updateConfig(config);
        this.server = null;
        this.commands = new Collection();
    }

    updateConfig(config) {
        this.config = config;
        this.config.discord.channelIds = lodash.uniq(config.discord.channelIds.concat([this.channelId]));
    }

    async setup(server) {
        this.server = server;

        this.token = this.config.discord.token;

        this.rest = new REST().setToken(this.token);

        await this.initBotCommands();

        this.client = new Client({
            intents: [GatewayIntentBits.MessageContent]
        });
        this.client.on(Events.InteractionCreate, this.onInteractionCreate);
        this.client.once(Events.ClientReady, () => logger.info('Discord BOT is Ready !'));

        await this.client.login(this.token);
        logger.info('Discord client connected !');
    }

    async initBotCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            logger.debug('importing command %s', file);
            const command = await import(`file://${filePath}`);

            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
            } else {
                logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }

        const result = await this.rest.put(
            Routes.applicationCommands(this.config.discord.appId),
            {
                body: this.commands.map(command => command.data)
            }
        );

        logger.info('initialised %d bot commands', result.length);
    }

    async onInteractionCreate(interaction) {
        console.log(interaction);
        if (!this.config.discord.channelIds.includes(interaction.channelId)) return;

        if (!interaction.isChatInputCommand()) {
            logger.debug('%s is not an application command !', interaction.commandName);
            return;
        }

        if (!this.commands.has(interaction.commandName)) {
            logger.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        const command = this.commands.get(interaction.commandName);

        try {
            await command.execute(interaction, this.config, this.server);
        } catch (err) {
            logger.error(err, 'Discord Interaction error');
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            }
        }
    }

    async sendDiscordMessage(message) {
        logger.debug('Sending discord message: "%s"', message);
        const channel = this.client.channels.cache.get(this.channelId);
        return channel.send(message);
    }
}
