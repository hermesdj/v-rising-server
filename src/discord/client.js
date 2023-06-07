import {Routes, Events, Client, GatewayIntentBits, Collection, REST} from 'discord.js';
import path from "path";
import url from "url";
import * as fs from "fs";
import {logger} from "../logger.js";
import {EventEmitter} from "events";
import lodash from "lodash";
import {i18n} from "../i18n.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class VRisingDiscordBot extends EventEmitter {
    constructor(config) {
        super();
        this.server = null;
        this.commands = new Collection();
        this.channelIds = [];
        this.updateConfig(config);
    }

    updateConfig(config) {
        this.config = config;
        this.channelIds = lodash.uniq(config.discord.channelIds.concat([config.discord.channelId]));
        logger.debug('Initialized discord bot on channels %j', this.channelIds);
    }

    async setup(server) {
        this.server = server;

        if (!this.config.discord.enabled) {
            return;
        }

        this.token = this.config.discord.token;

        this.rest = new REST().setToken(this.token);

        await this.initBotCommands();

        this.client = new Client({
            intents: [GatewayIntentBits.MessageContent]
        });
        this.client.on(Events.InteractionCreate, (interaction) => this.onInteractionCreate(interaction));
        this.client.once(Events.ClientReady, () => {
            logger.info('Discord BOT is Ready !');
            this.populateClientCache();
        });

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
        if (!this.channelIds.includes(interaction.channelId)) return;

        const {commandName} = interaction;

        if (!interaction.isChatInputCommand()) {
            logger.debug('%s is not an application command !', commandName);
            return;
        }

        if (!this.commands.has(commandName)) {
            logger.error(`No command matching ${commandName} was found.`);
            return;
        }

        logger.debug('Executing discord bot command %s', commandName);

        const command = this.commands.get(commandName);

        const context = {
            config: this.config,
            server: this.server,
            headers: {
                'accept-language': interaction.locale
            }
        };

        logger.debug('Init discord execute context with locale %s', interaction.locale);
        i18n.init(context);

        try {
            logger.info('Executing command %s', commandName);
            await command.execute(interaction, context);
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
        if (!this.config.discord.enabled) return null;
        logger.debug('Sending discord message: "%s"', message);
        const channel = this.client.channels.cache.get(this.channelId);
        return channel.send(message);
    }

    async populateClientCache() {
        for (const guild of this.client.guilds.cache.values()) {
            await guild.fetch();
            await guild.roles.fetch();
            logger.debug('Populated discord bot cache for %s', guild.name);
        }
    }
}
