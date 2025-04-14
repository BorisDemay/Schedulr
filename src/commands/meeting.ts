import { SlashCommandBuilder, CommandInteraction, ChannelType, GuildMember, Role } from 'discord.js';
import { ICommand, IMeetingService } from '../types';
import { ValidationService } from '../services/ValidationService';
import { LoggingService } from '../services/LoggingService';

// Get service instances
const validator = ValidationService.getInstance();
const logger = LoggingService.getInstance();

const command: ICommand = {
    data: new SlashCommandBuilder()
        .setName('meeting')
        .setDescription('Create a new meeting')
        .addStringOption(option =>
            option.setName('subject')
                .setDescription('The subject of the meeting')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('The time of the meeting (format HH:MM)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where the meeting will be held')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
                .setRequired(true))
        .addMentionableOption(option =>
            option.setName('attendee1')
                .setDescription('A role or user to invite')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('The date of the meeting (format DD/MM/YYYY), defaults to today')
                .setRequired(false))
        .addMentionableOption(option =>
            option.setName('attendee2')
                .setDescription('A role or user to invite')
                .setRequired(false))
        .addMentionableOption(option =>
            option.setName('attendee3')
                .setDescription('A role or user to invite')
                .setRequired(false))
        .addMentionableOption(option =>
            option.setName('attendee4')
                .setDescription('A role or user to invite')
                .setRequired(false))
        .addMentionableOption(option =>
            option.setName('attendee5')
                .setDescription('A role or user to invite')
                .setRequired(false)),

    async execute(interaction: CommandInteraction, meetingService: IMeetingService): Promise<void> {
        try {
            // Check if the command is used in a guild
            if (!interaction.guild) {
                await interaction.reply({ content: 'This command can only be used in a Discord server.', ephemeral: true });
                return;
            }

            // Validate create permission
            const permCheck = validator.canCreateMeeting(interaction);
            if (!permCheck.canCreate) {
                await interaction.reply({ content: permCheck.errorMessage || 'You do not have permission to create meetings.', ephemeral: true });
                return;
            }

            // Get command parameters
            const options = interaction.options;
            const subject = options.get('subject')?.value as string;

            // Validate subject
            const subjectValidation = validator.validateSubject(subject);
            if (!subjectValidation.isValid) {
                await interaction.reply({ content: subjectValidation.errorMessage || 'Invalid meeting subject.', ephemeral: true });
                return;
            }

            const timeStr = options.get('time')?.value as string;

            // Parse date (optional, defaults to today)
            let date = new Date();
            const dateOption = options.get('date')?.value as string | undefined;

            if (dateOption) {
                const dateValidation = validator.validateDateString(dateOption);
                if (!dateValidation.isValid || !dateValidation.date) {
                    await interaction.reply({ content: dateValidation.errorMessage || 'Invalid date format.', ephemeral: true });
                    return;
                }
                date = dateValidation.date;
            }

            // Parse time
            const timeValidation = validator.validateTimeString(timeStr);
            if (!timeValidation.isValid) {
                await interaction.reply({ content: timeValidation.errorMessage || 'Invalid time format.', ephemeral: true });
                return;
            }

            // Set the time on the date object
            date.setHours(timeValidation.hours!, timeValidation.minutes!, 0, 0);

            // Check if the date is in the future
            const futureCheck = validator.isDateInFuture(date);
            if (!futureCheck.isInFuture) {
                await interaction.reply({ content: futureCheck.errorMessage || 'Meeting time must be in the future.', ephemeral: true });
                return;
            }

            // Get the channel
            const channel = options.get('channel')?.channel;
            if (!channel) {
                await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
                return;
            }

            // Validate channel
            const channelValidation = validator.validateChannel(interaction.guild, channel.id);
            if (!channelValidation.isValid) {
                await interaction.reply({ content: channelValidation.errorMessage || 'Invalid channel.', ephemeral: true });
                return;
            }

            const isVoiceChannel = channelValidation.isVoiceChannel;

            // Collect attendees (roles and users)
            const attendeeIds = new Set<string>();

            for (let i = 1; i <= 5; i++) {
                const attendeeOption = options.get(`attendee${i}`);
                if (!attendeeOption) continue;

                // Get the mentionable value (User or Role)
                const mentionableId = attendeeOption.value as string;
                const mentionable = interaction.options.resolved?.roles?.get(mentionableId) ||
                    interaction.options.resolved?.users?.get(mentionableId);

                if (!mentionable) continue;

                if (mentionable instanceof Role) {
                    // It's a role, add all members
                    try {
                        mentionable.members.forEach((member: GuildMember) => {
                            if (!member.user.bot) {
                                attendeeIds.add(member.id);
                            }
                        });
                    } catch (error) {
                        logger.warn(`Error adding role members: ${error}`);
                    }
                } else {
                    // It's a user, add directly
                    if ('bot' in mentionable && !mentionable.bot) {
                        attendeeIds.add(mentionable.id);
                    }
                }
            }

            // Check if there are any attendees
            if (attendeeIds.size === 0) {
                await interaction.reply({ content: 'No valid attendees were provided. Please include at least one user or role with members.', ephemeral: true });
                return;
            }

            // Defer the reply to avoid timeout
            await interaction.deferReply();

            // Create the meeting
            try {
                const meeting = await meetingService.createMeeting({
                    subject,
                    dateTime: date,
                    channelId: channel.id,
                    isVoiceChannel,
                    guildId: interaction.guild.id,
                    creatorId: interaction.user.id,
                    attendeeIds,
                    channelOriginId: interaction.channelId
                });

                // Send the announcement
                const message = await meetingService.sendMeetingAnnouncement(meeting);

                if (message) {
                    await interaction.editReply(`✅ Meeting created successfully! ID: ${meeting.id}`);
                } else {
                    await interaction.editReply(`✅ Meeting created but failed to send announcement. ID: ${meeting.id}`);
                }
            } catch (error) {
                logger.error('Error creating meeting:', error);
                await interaction.editReply('❌ Failed to create meeting. Please try again later.');
            }
        } catch (error) {
            logger.error('Error handling meeting command:', error);

            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while creating the meeting. Please try again.');
            } else {
                await interaction.reply({ content: '❌ An error occurred while creating the meeting. Please try again.', ephemeral: true });
            }
        }
    }
};

export = command; 