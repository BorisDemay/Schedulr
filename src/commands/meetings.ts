import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from 'discord.js';
import { ICommand, IMeetingService } from '../types';

const command: ICommand = {
    data: new SlashCommandBuilder()
        .setName('meetings')
        .setDescription('List all upcoming meetings'),

    async execute(interaction: CommandInteraction, meetingService: IMeetingService): Promise<void> {
        try {
            // Check if the command is used in a guild
            if (!interaction.guild) {
                await interaction.reply({ content: 'This command can only be used in a Discord server.', ephemeral: true });
                return;
            }

            // Defer the reply to avoid timeout
            await interaction.deferReply();

            // Get upcoming meetings
            const meetings = await meetingService.getUpcomingMeetings();

            if (meetings.length === 0) {
                await interaction.editReply('There are no upcoming meetings.');
                return;
            }

            // Filter meetings for this guild
            const guildId = interaction.guild?.id;
            if (!guildId) {
                await interaction.editReply('Error: Cannot identify the current server.');
                return;
            }

            const guildMeetings = meetings.filter(meeting => meeting.guildId === guildId);

            if (guildMeetings.length === 0) {
                await interaction.editReply('There are no upcoming meetings in this server.');
                return;
            }

            // Sort meetings by date
            guildMeetings.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

            // Create an embed for each meeting
            const embeds = guildMeetings.map(meeting => {
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`📅 ${meeting.subject}`)
                    .addFields(
                        { name: 'Date', value: meeting.getFormattedDate(), inline: true },
                        { name: 'Time', value: meeting.getFormattedTime(), inline: true },
                        { name: 'Location', value: meeting.isVoiceChannel ? `🔊 <#${meeting.channelId}>` : `💬 <#${meeting.channelId}>`, inline: true },
                        { name: 'Organizer', value: `<@${meeting.creatorId}>`, inline: true },
                        { name: 'ID', value: meeting.id, inline: true }
                    )
                    .setFooter({ text: `Use /reschedule ${meeting.id} to modify this meeting` });

                // Add confirmed attendees if any
                if (meeting.confirmedAttendees.size > 0) {
                    const confirmed = Array.from(meeting.confirmedAttendees)
                        .map(id => `<@${id}>`)
                        .join(', ');

                    embed.addFields({ name: '✅ Confirmed', value: confirmed });
                }

                return embed;
            });

            // We can't send more than 10 embeds at once
            const firstTenEmbeds = embeds.slice(0, 10);

            // Send response
            await interaction.editReply({
                content: `Found ${guildMeetings.length} upcoming meeting${guildMeetings.length === 1 ? '' : 's'}:`,
                embeds: firstTenEmbeds
            });

            // If there are more than 10 meetings, let the user know
            if (guildMeetings.length > 10) {
                await interaction.followUp({
                    content: `Showing 10 of ${guildMeetings.length} meetings. The closest upcoming meetings are displayed.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error listing meetings:', error);

            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while listing meetings. Please try again.');
            } else {
                await interaction.reply({ content: '❌ An error occurred while listing meetings. Please try again.', ephemeral: true });
            }
        }
    }
};

export = command; 