import { Client, GatewayIntentBits, Collection, Events, ActivityType, ClientOptions, CommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ICommand, ISchedulrBot, IMeetingService, IDatabaseService, ISchedulerService } from './types';

import { DatabaseService } from './services/DatabaseService';
import { SchedulerService } from './services/SchedulerService';
import { MeetingService } from './services/MeetingService';
import { ValidationService } from './services/ValidationService';
import { LoggingService } from './services/LoggingService';
import { RateLimitService } from './services/RateLimitService';

// Load environment variables
dotenv.config();

// Get service instances
const logger = LoggingService.getInstance();
const validator = ValidationService.getInstance();
const rateLimit = RateLimitService.getInstance();

/**
 * Main bot class
 */
class SchedulrBot implements ISchedulrBot {
    public client: Client;
    public commandsData: any[] = [];
    public databaseService: IDatabaseService;
    public schedulerService: ISchedulerService;
    public meetingService: IMeetingService;

    // Collection to store commands
    private commands: Collection<string, ICommand> = new Collection();

    constructor() {
        logger.info('Initializing SchedulrBot...');

        const options: ClientOptions = {
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        };

        this.client = new Client(options);
        this.databaseService = new DatabaseService(process.env.DATABASE_PATH || '');
        this.schedulerService = new SchedulerService();
        this.meetingService = new MeetingService(this.databaseService, this.schedulerService, this.client);
    }

    /**
     * Initialize the bot and services
     */
    async initialize(): Promise<void> {
        logger.info('Starting SchedulrBot...');

        // Validate environment variables first
        const envValidation = validator.validateEnvironment();
        if (!envValidation.isValid) {
            logger.fatal('Environment validation failed:', envValidation.errors);
            process.exit(1);
        }
        logger.info('Environment validation passed');

        // Create necessary directories
        this.createDirectories();

        // Initialize services
        logger.info('Initializing services...');
        try {
            await this.databaseService.initialize();
            logger.info('Database service initialized successfully');
        } catch (error) {
            logger.fatal('Failed to initialize database service:', error);
            process.exit(1);
        }

        // Load commands
        logger.info('Loading commands...');
        try {
            await this.loadCommands();
            logger.info(`Loaded ${this.commandsData.length} commands`);
        } catch (error) {
            logger.error('Error loading commands:', error);
        }

        // Register event handlers
        logger.info('Registering event handlers...');
        this.registerEventHandlers();

        // Start rate limit cleanup interval (every 10 minutes)
        setInterval(() => {
            rateLimit.cleanup();
        }, 10 * 60 * 1000);

        // Login to Discord
        logger.info('Logging in to Discord...');
        try {
            await this.client.login(process.env.TOKEN);
        } catch (error) {
            logger.fatal('Failed to login to Discord:', error);
            process.exit(1);
        }
    }

    /**
     * Create necessary directories for data and logs
     */
    createDirectories(): void {
        const dataDir = path.join(__dirname, '..', 'data');
        const logsDir = path.join(__dirname, '..', 'logs');

        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                logger.info('Data directory created successfully');
            }

            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
                logger.info('Logs directory created successfully');
            }
        } catch (error) {
            logger.error('Error creating directories:', error);
        }
    }

    /**
     * Load command modules
     */
    async loadCommands(): Promise<void> {
        const commandsPath = path.join(__dirname, 'commands');

        // Make sure the commands directory exists
        if (!fs.existsSync(commandsPath)) {
            logger.error(`Commands directory not found: ${commandsPath}`);
            return;
        }

        // Always use .js in the compiled version
        const commandFiles = fs.readdirSync(commandsPath).filter(file =>
            file.endsWith('.js')
        );

        this.commandsData = [];

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);

            try {
                // Import the command module
                const command = await import(filePath);
                const commandModule = command.default || command;

                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ('data' in commandModule && 'execute' in commandModule) {
                    this.commands.set(commandModule.data.name, commandModule);
                    this.commandsData.push(commandModule.data.toJSON());
                    logger.info(`Loaded command: ${commandModule.data.name}`);
                } else {
                    logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                logger.error(`Error loading command from ${filePath}:`, error);
            }
        }
    }

    /**
     * Register bot commands with Discord API
     */
    async registerCommands(): Promise<void> {
        if (!this.client.application) {
            logger.error('Cannot register commands: client application is not defined');
            return;
        }

        try {
            logger.info('Started refreshing application (/) commands...');

            // Register commands globally
            await this.client.application.commands.set(this.commandsData);

            logger.info(`Successfully registered ${this.commandsData.length} application commands globally`);
        } catch (error) {
            logger.error('Error registering application commands:', error);
        }
    }

    /**
     * Register event handlers for bot events
     */
    registerEventHandlers(): void {
        // Ready event - register commands when the bot is ready
        this.client.once(Events.ClientReady, async client => {
            logger.info(`Ready! Logged in as ${client.user.tag}`);

            // Register commands when the bot is ready
            await this.registerCommands();

            // Set presence
            client.user.setPresence({
                activities: [{ name: 'your meetings', type: ActivityType.Watching }],
                status: 'online',
            });

            // Restore scheduled meetings
            try {
                await this.meetingService.restoreScheduledMeetings();
                logger.info('Successfully restored scheduled meetings');
            } catch (error) {
                logger.error('Error restoring scheduled meetings:', error);
            }

            // Log connected servers
            logger.info('\n=== CONNECTION INFORMATION ===');
            logger.info(`Bot connected as: ${client.user.tag}`);
            logger.info(`Servers where the bot is present (${client.guilds.cache.size}):`);

            client.guilds.cache.forEach(guild => {
                logger.info(` - ${guild.name} (ID: ${guild.id})`);
                logger.debug('   Text channels:');

                const textChannels = guild.channels.cache.filter(channel => channel.type === 0);
                const displayChannels = Array.from(textChannels.values()).slice(0, 5);

                displayChannels.forEach(channel => {
                    logger.debug(`    * ${channel.name} (ID: ${channel.id})`);
                });

                if (textChannels.size > 5) {
                    logger.debug(`    * ... and ${textChannels.size - 5} other channels`);
                }
            });

            logger.info('===============================\n');
            logger.info('SchedulrBot is ready to manage your meetings!');
        });

        // Command interaction handler
        this.client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isCommand()) return;

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                logger.warn(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            // Check for rate limiting
            const rateLimitCheck = rateLimit.isRateLimited(interaction.user.id, interaction.commandName);
            if (rateLimitCheck.limited) {
                const retryAfter = rateLimitCheck.retryAfter || 60;
                await interaction.reply({
                    content: `You are using this command too frequently. Please try again in ${retryAfter} seconds.`,
                    ephemeral: true
                });
                return;
            }

            try {
                logger.info(`Executing command: ${interaction.commandName} (User: ${interaction.user.tag})`);
                await command.execute(interaction as CommandInteraction, this.meetingService);
            } catch (error) {
                logger.error(`Error executing command ${interaction.commandName}:`, error);

                const errorMessage = 'There was an error executing this command!';

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        });

        // Button interaction handler
        this.client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isButton()) return;

            const customId = interaction.customId;

            try {
                logger.debug(`Button interaction: ${customId} (User: ${interaction.user.tag})`);

                // Format: meeting_action_meetingId
                if (customId.startsWith('meeting_')) {
                    const parts = customId.split('_');
                    if (parts.length >= 3) {
                        const action = parts[1];
                        const meetingId = parts[2];

                        if (action === 'confirm') {
                            await this.meetingService.updateAttendeeStatus(meetingId, interaction.user.id, true);
                            await interaction.reply({ content: 'You have confirmed your attendance!', ephemeral: true });
                        } else if (action === 'decline') {
                            await this.meetingService.updateAttendeeStatus(meetingId, interaction.user.id, false);
                            await interaction.reply({ content: 'You have declined your attendance!', ephemeral: true });
                        } else if (action === 'cancel') {
                            // Check if the user is the creator of the meeting
                            const meeting = await this.meetingService.getMeetingById(meetingId);

                            if (!meeting) {
                                await interaction.reply({ content: 'This meeting no longer exists!', ephemeral: true });
                                return;
                            }

                            // Check permission - only creator or server admin can cancel
                            const guild = this.client.guilds.cache.get(meeting.guildId);
                            if (!guild) {
                                await interaction.reply({ content: 'Could not find the server for this meeting!', ephemeral: true });
                                return;
                            }

                            const member = guild.members.cache.get(interaction.user.id);
                            if (!member) {
                                await interaction.reply({ content: 'Could not verify your permissions!', ephemeral: true });
                                return;
                            }

                            const isAdmin = member.permissions.has('Administrator');
                            const isCreator = meeting.creatorId === interaction.user.id;

                            if (isCreator || isAdmin) {
                                await this.meetingService.deleteMeeting(meetingId);
                                await interaction.reply({ content: 'Meeting has been deleted!', ephemeral: true });
                            } else {
                                await interaction.reply({ content: 'You do not have permission to delete this meeting!', ephemeral: true });
                            }
                        } else if (action === 'complete') {
                            // Check if the user is the creator of the meeting
                            const meeting = await this.meetingService.getMeetingById(meetingId);

                            if (!meeting) {
                                await interaction.reply({ content: 'This meeting no longer exists!', ephemeral: true });
                                return;
                            }

                            // Check permission - only creator or server admin can complete
                            const guild = this.client.guilds.cache.get(meeting.guildId);
                            if (!guild) {
                                await interaction.reply({ content: 'Could not find the server for this meeting!', ephemeral: true });
                                return;
                            }

                            const member = guild.members.cache.get(interaction.user.id);
                            if (!member) {
                                await interaction.reply({ content: 'Could not verify your permissions!', ephemeral: true });
                                return;
                            }

                            const isAdmin = member.permissions.has('Administrator');
                            const isCreator = meeting.creatorId === interaction.user.id;

                            if (isCreator || isAdmin) {
                                await this.meetingService.completeMeeting(meetingId);
                                await interaction.reply({ content: 'Meeting has been marked as completed!', ephemeral: true });
                            } else {
                                await interaction.reply({ content: 'You do not have permission to mark this meeting as completed!', ephemeral: true });
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error handling button interaction ${customId}:`, error);

                if (!interaction.replied) {
                    await interaction.reply({ content: 'There was an error processing your request!', ephemeral: true });
                }
            }
        });

        // Error handler
        this.client.on('error', error => {
            logger.error('Discord client error:', error);
        });

        // Warning handler
        this.client.on('warn', warning => {
            logger.warn('Discord client warning:', warning);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection:', { reason, promise });
        });

        process.on('uncaughtException', (error) => {
            logger.fatal('Uncaught Exception:', error);
            // Shutdown gracefully
            this.shutdown().catch(err => {
                logger.error('Error during shutdown:', err);
                process.exit(1);
            });
        });
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down SchedulrBot...');

        // Stop accepting new connections
        this.client.destroy();

        // Shutdown scheduler
        this.schedulerService.shutdown();

        // Close logger
        logger.info('Shutdown complete');
        logger.shutdown();

        // Exit with success code
        process.exit(0);
    }
}

// Create and initialize the bot
const bot = new SchedulrBot();
bot.initialize().catch(error => {
    console.error('Failed to initialize bot:', error);
    process.exit(1);
});

// Handle graceful shutdown on SIGINT and SIGTERM
process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT. Shutting down...');
    await bot.shutdown();
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM. Shutting down...');
    await bot.shutdown();
}); 