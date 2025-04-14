import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { ICommand, IMeetingService } from '../types';

const command: ICommand = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel an existing meeting')
        .addStringOption(option =>
            option.setName('meeting_id')
                .setDescription('The ID of the meeting to cancel')
                .setRequired(true)),

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
                await interaction.reply({ content: 'You do not have permission to cancel this meeting. Only the creator can cancel it.', ephemeral: true });
                return;
            }

            // Defer the reply to avoid timeout during deletion
            await interaction.deferReply();

            // Delete the meeting
            await meetingService.deleteMeeting(meetingId);

            // Reply with success
            await interaction.editReply(`✅ Meeting "${meeting.subject}" has been canceled.`);
        } catch (error) {
            console.error('Error canceling meeting:', error);

            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while canceling the meeting. Please try again.');
            } else {
                await interaction.reply({ content: '❌ An error occurred while canceling the meeting. Please try again.', ephemeral: true });
            }
        }
    }
};

export = command; 