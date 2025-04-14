import { SlashCommandBuilder, ChannelType, CommandInteraction } from 'discord.js';
import { ICommand, IMeetingService } from '../types';

const command: ICommand = {
    data: new SlashCommandBuilder()
        .setName('reschedule')
        .setDescription('Reschedule an existing meeting')
        .addStringOption(option =>
            option.setName('meeting_id')
                .setDescription('The ID of the meeting to reschedule')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('The new time of the meeting (format HH:MM)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('The new date of the meeting (format DD/MM/YYYY)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The new channel for the meeting (optional)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('subject')
                .setDescription('The new subject of the meeting (optional)')
                .setRequired(false)),

    async execute(interaction: CommandInteraction, meetingService: IMeetingService): Promise<void> {
        try {
            // Check if the command is used in a guild
            if (!interaction.guild) {
                await interaction.reply({ content: 'This command can only be used in a Discord server.', ephemeral: true });
                return;
            }

            // Get the meeting ID
            const meetingId = interaction.options.get('meeting_id')?.value as string;

            // Get the meeting from the database
            const meeting = await meetingService.getMeetingById(meetingId);
            if (!meeting) {
                await interaction.reply({ content: `Meeting with ID ${meetingId} not found.`, ephemeral: true });
                return;
            }

            // Check if the user is the creator of the meeting
            if (meeting.creatorId !== interaction.user.id) {
                await interaction.reply({ content: 'You do not have permission to reschedule this meeting. Only the creator can reschedule it.', ephemeral: true });
                return;
            }

            // Parse date
            const dateStr = interaction.options.get('date')?.value as string;
            const dateParts = dateStr.split('/');
            if (dateParts.length !== 3) {
                await interaction.reply({ content: 'Invalid date format. Use DD/MM/YYYY.', ephemeral: true });
                return;
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // Months are 0-indexed in JS
            const year = parseInt(dateParts[2], 10);

            if (isNaN(day) || isNaN(month) || isNaN(year)) {
                await interaction.reply({ content: 'Invalid date format. Use DD/MM/YYYY with numbers.', ephemeral: true });
                return;
            }

            const date = new Date(year, month, day);

            if (isNaN(date.getTime())) {
                await interaction.reply({ content: 'Invalid date. Please check your input.', ephemeral: true });
                return;
            }

            // Parse time
            const timeStr = interaction.options.get('time')?.value as string;
            const timeParts = timeStr.split(':');
            if (timeParts.length !== 2) {
                await interaction.reply({ content: 'Invalid time format. Use HH:MM.', ephemeral: true });
                return;
            }

            const hours = parseInt(timeParts[0], 10);
            const minutes = parseInt(timeParts[1], 10);

            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                await interaction.reply({ content: 'Invalid time. Please use 24-hour format (00:00 to 23:59).', ephemeral: true });
                return;
            }

            // Set the time on the date object
            date.setHours(hours, minutes, 0, 0);

            // Check if the date is in the future
            if (date <= new Date()) {
                await interaction.reply({ content: 'The meeting date and time must be in the future.', ephemeral: true });
                return;
            }

            // Get optional parameters
            const newSubject = interaction.options.get('subject')?.value as string || meeting.subject;
            const newChannel = interaction.options.get('channel')?.channel;

            const newChannelId = newChannel ? newChannel.id : meeting.channelId;
            const isVoiceChannel = newChannel ? newChannel.type === ChannelType.GuildVoice : meeting.isVoiceChannel;

            // Defer the reply to avoid timeout
            await interaction.deferReply();

            // Update the meeting
            const updatedMeeting = await meetingService.updateMeeting(meetingId, {
                subject: newSubject,
                dateTime: date,
                channelId: newChannelId,
                isVoiceChannel
            });

            // Update the message
            await meetingService.updateMeetingMessage(updatedMeeting);

            // Reply with success
            await interaction.editReply(`✅ Meeting rescheduled successfully! New date and time: ${updatedMeeting.getFormattedDateTime()}`);
        } catch (error) {
            console.error('Error rescheduling meeting:', error);

            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while rescheduling the meeting. Please try again.');
            } else {
                await interaction.reply({ content: '❌ An error occurred while rescheduling the meeting. Please try again.', ephemeral: true });
            }
        }
    }
};

export = command; 