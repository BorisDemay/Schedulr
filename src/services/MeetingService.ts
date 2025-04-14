import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Client, Message, MessageCreateOptions } from 'discord.js';
import { Meeting } from '../models/Meeting';
import { IDatabaseService, ISchedulerService, IMeetingService, IMeetingParams, IMeeting } from '../types';

/**
 * Service for managing meetings
 */
export class MeetingService implements IMeetingService {
    private databaseService: IDatabaseService;
    private schedulerService: ISchedulerService;
    private client: Client;
    private reminderMinutes: Set<number>;

    /**
     * Create a new meeting service
     * 
     * @param databaseService - The database service
     * @param schedulerService - The scheduler service
     * @param client - The Discord client
     */
    constructor(databaseService: IDatabaseService, schedulerService: ISchedulerService, client: Client) {
        this.databaseService = databaseService;
        this.schedulerService = schedulerService;
        this.client = client;
        this.reminderMinutes = this.parseReminderTimes();
    }

    /**
     * Parse reminder times from environment variable
     * 
     * @returns Set of reminder times in minutes
     */
    parseReminderTimes(): Set<number> {
        const result = new Set<number>();
        const reminderTimesStr = process.env.REMINDER_TIMES || '60,15';

        for (const timeStr of reminderTimesStr.split(',')) {
            try {
                const minutes = parseInt(timeStr.trim(), 10);
                if (minutes > 0) {
                    result.add(minutes);
                }
            } catch (error) {
                console.warn(`Invalid value in reminder.times: ${timeStr}`);
            }
        }

        if (result.size === 0) {
            result.add(60); // Default, reminder 1h before
            result.add(15); // And 15 minutes before
        }

        return result;
    }

    /**
     * Restore scheduled meetings from the database
     */
    async restoreScheduledMeetings(): Promise<void> {
        try {
            const upcomingMeetings = await this.databaseService.getUpcomingMeetings();
            console.log(`Restoring ${upcomingMeetings.length} scheduled meetings`);

            for (const meeting of upcomingMeetings) {
                this.scheduleMeetingReminders(meeting);
                this.scheduleMeetingCompletion(meeting);
            }
        } catch (error) {
            console.error('Error restoring scheduled meetings:', error);
        }
    }

    /**
     * Create a new meeting
     * 
     * @param params - Meeting parameters
     * @returns The created meeting
     */
    async createMeeting(params: IMeetingParams): Promise<IMeeting> {
        // Create the meeting object
        const meeting = new Meeting(params);

        // Save to database
        await this.databaseService.saveMeeting(meeting);

        // Schedule reminders
        this.scheduleMeetingReminders(meeting);

        // Schedule completion
        this.scheduleMeetingCompletion(meeting);

        console.log(`New meeting created: ${meeting.id}`);
        return meeting;
    }

    /**
     * Update an existing meeting
     * 
     * @param meetingId - The ID of the meeting to update
     * @param params - Updated meeting parameters
     * @returns The updated meeting
     */
    async updateMeeting(meetingId: string, params: Partial<IMeetingParams>): Promise<IMeeting> {
        const meeting = await this.databaseService.getMeetingById(meetingId);
        if (!meeting) {
            throw new Error(`Meeting not found: ${meetingId}`);
        }

        const timeChanged = params.dateTime && meeting.dateTime.getTime() !== params.dateTime.getTime();

        // Update fields
        if (params.subject) meeting.subject = params.subject;
        if (params.dateTime) meeting.dateTime = params.dateTime;
        if (params.channelId) meeting.channelId = params.channelId;
        if (params.isVoiceChannel !== undefined) meeting.isVoiceChannel = params.isVoiceChannel;

        // Reset invitation URL if channel changes
        if (params.channelId && meeting.channelId !== params.channelId) {
            meeting.invitationUrl = null;
        }

        // Save to database
        await this.databaseService.saveMeeting(meeting);

        // If time changed, reschedule reminders
        if (timeChanged) {
            // Cancel old reminders
            this.schedulerService.cancelMeetingJobs(meetingId);

            // Schedule new reminders
            this.scheduleMeetingReminders(meeting);

            // Schedule new completion
            this.scheduleMeetingCompletion(meeting);
        }

        console.log(`Meeting updated: ${meeting.id}`);
        return meeting;
    }

    /**
     * Delete a meeting
     * 
     * @param meetingId - The ID of the meeting to delete
     */
    async deleteMeeting(meetingId: string): Promise<void> {
        const meeting = await this.databaseService.getMeetingById(meetingId);
        if (!meeting) {
            throw new Error(`Meeting not found: ${meetingId}`);
        }

        // Cancel scheduled jobs
        this.schedulerService.cancelMeetingJobs(meetingId);

        // Delete from database
        await this.databaseService.deleteMeeting(meetingId);

        // Delete the message if it exists
        if (meeting.messageId && meeting.channelOriginId) {
            try {
                const channel = await this.client.channels.fetch(meeting.channelOriginId);
                if (channel && ('messages' in channel)) {
                    const message = await channel.messages.fetch(meeting.messageId);
                    if (message) {
                        await message.delete();
                        console.log(`Deleted meeting message: ${meeting.messageId}`);
                    }
                }
            } catch (error) {
                console.error(`Error deleting meeting message:`, error);
            }
        }

        console.log(`Meeting deleted: ${meetingId}`);
    }

    /**
     * Mark a meeting as completed
     * 
     * @param meetingId - The ID of the meeting to complete
     * @returns The completed meeting
     */
    async completeMeeting(meetingId: string): Promise<IMeeting> {
        const meeting = await this.databaseService.getMeetingById(meetingId);
        if (!meeting) {
            throw new Error(`Meeting not found: ${meetingId}`);
        }

        meeting.isCompleted = true;
        await this.databaseService.saveMeeting(meeting);

        // Update message to show it's completed
        await this.updateMeetingMessage(meeting);

        console.log(`Meeting marked as completed: ${meetingId}`);
        return meeting;
    }

    /**
     * Get a meeting by ID
     * 
     * @param meetingId - The ID of the meeting
     * @returns The meeting
     */
    async getMeetingById(meetingId: string): Promise<IMeeting | null> {
        return await this.databaseService.getMeetingById(meetingId);
    }

    /**
     * Get all upcoming meetings
     * 
     * @returns List of upcoming meetings
     */
    async getUpcomingMeetings(): Promise<IMeeting[]> {
        return await this.databaseService.getUpcomingMeetings();
    }

    /**
     * Create an invitation link for a meeting
     * 
     * @param meeting - The meeting
     * @returns Invitation URL or null if failed
     */
    async createMeetingInvitation(meeting: IMeeting): Promise<string | null> {
        try {
            // Get the channel
            const channel = await this.client.channels.fetch(meeting.channelId);
            if (!channel) {
                console.error(`Channel not found: ${meeting.channelId}`);
                return null;
            }

            // Check if it's a guild channel (has guild property)
            if (!('guild' in channel)) {
                console.error(`Not a guild channel: ${meeting.channelId}`);
                return null;
            }

            // Create invite (only for voice channels or text channels with view permission)
            if (meeting.isVoiceChannel || ('permissionsFor' in channel)) {
                // Need to make sure the channel supports creating invites
                if ('createInvite' in channel) {
                    const invite = await channel.createInvite({
                        maxAge: 0, // 0 = never expires
                        maxUses: 0, // 0 = unlimited uses
                        reason: `Meeting invitation: ${meeting.subject}`
                    });

                    return invite.url;
                }
            }

            return null;
        } catch (error) {
            console.error('Error creating invitation:', error);
            return null;
        }
    }

    /**
     * Send a meeting announcement
     * 
     * @param meeting - The meeting to announce
     * @returns The sent message or null if failed
     */
    async sendMeetingAnnouncement(meeting: IMeeting): Promise<Message | null> {
        try {
            // Get the channel
            const channel = await this.client.channels.fetch(meeting.channelOriginId);
            if (!channel || !('send' in channel)) {
                console.error(`Invalid announcement channel: ${meeting.channelOriginId}`);
                return null;
            }

            // Create invitation link if not already created
            if (!meeting.invitationUrl && meeting.isVoiceChannel) {
                meeting.invitationUrl = await this.createMeetingInvitation(meeting);
                if (meeting.invitationUrl) {
                    await this.databaseService.saveMeeting(meeting);
                }
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`📅 ${meeting.subject}`)
                .setDescription(`A new meeting has been scheduled`)
                .addFields(
                    { name: 'Date', value: meeting.getFormattedDate(), inline: true },
                    { name: 'Time', value: meeting.getFormattedTime(), inline: true },
                    { name: 'Channel', value: this.getChannelMention(meeting), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Meeting ID: ${meeting.id}` });

            // Add invitation link if available
            if (meeting.invitationUrl) {
                embed.addFields({ name: 'Invitation', value: `[Click to join](${meeting.invitationUrl})`, inline: false });
            }

            // Get creator name
            try {
                const creator = await this.client.users.fetch(meeting.creatorId);
                if (creator) {
                    embed.setAuthor({ name: `Created by ${creator.username}`, iconURL: creator.displayAvatarURL() });
                }
            } catch (error) {
                console.error(`Error fetching creator: ${meeting.creatorId}`, error);
            }

            // Create attendance buttons
            const attendRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`meeting_confirm_${meeting.id}`)
                        .setLabel('I will attend')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`meeting_decline_${meeting.id}`)
                        .setLabel('I cannot attend')
                        .setStyle(ButtonStyle.Danger)
                );

            // Create management buttons
            const manageRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`meeting_cancel_${meeting.id}`)
                        .setLabel('Cancel Meeting')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`meeting_complete_${meeting.id}`)
                        .setLabel('Mark as Completed')
                        .setStyle(ButtonStyle.Primary)
                );

            // Send the message
            const messageOptions: MessageCreateOptions = {
                embeds: [embed],
                components: [attendRow, manageRow]
            };

            // Mention attendees if there are any
            let content = '';
            if (meeting.attendeeIds.size > 0) {
                const mentions: string[] = [];
                for (const id of meeting.attendeeIds) {
                    mentions.push(`<@${id}>`);
                }
                content = `Meeting invitation for: ${mentions.join(' ')}`;
            }

            if (content) {
                messageOptions.content = content;
            }

            const message = await channel.send(messageOptions);

            // Store message ID
            meeting.messageId = message.id;
            await this.databaseService.saveMeeting(meeting);

            return message;
        } catch (error) {
            console.error('Error sending meeting announcement:', error);
            return null;
        }
    }

    /**
     * Send a reminder for a meeting
     * 
     * @param meeting - The meeting to remind about
     * @param minutesBefore - Minutes before the meeting
     * @returns The sent message or null if failed
     */
    async sendMeetingReminder(meeting: IMeeting, minutesBefore: number): Promise<Message | null> {
        try {
            // Skip if meeting is completed
            if (meeting.isCompleted) {
                return null;
            }

            // Get the channel
            const channel = await this.client.channels.fetch(meeting.channelOriginId);
            if (!channel || !('send' in channel)) {
                console.error(`Invalid announcement channel: ${meeting.channelOriginId}`);
                return null;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle(`⏰ Reminder: ${meeting.subject}`)
                .setDescription(`The meeting will start ${minutesBefore > 0 ? `in ${minutesBefore} minutes` : 'now'}`)
                .addFields(
                    { name: 'Date', value: meeting.getFormattedDate(), inline: true },
                    { name: 'Time', value: meeting.getFormattedTime(), inline: true },
                    { name: 'Channel', value: this.getChannelMention(meeting), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Meeting ID: ${meeting.id}` });

            // Add invitation link if available
            if (meeting.invitationUrl) {
                embed.addFields({ name: 'Invitation', value: `[Click to join](${meeting.invitationUrl})`, inline: false });
            }

            // Create content mentioning confirmed attendees
            let content = '';
            if (meeting.confirmedAttendees.size > 0) {
                const mentions: string[] = [];
                for (const id of meeting.confirmedAttendees) {
                    mentions.push(`<@${id}>`);
                }
                content = `Meeting reminder for: ${mentions.join(' ')}`;
            }

            // Send the message
            const messageOptions: MessageCreateOptions = {
                embeds: [embed]
            };

            if (content) {
                messageOptions.content = content;
            }

            return await channel.send(messageOptions);
        } catch (error) {
            console.error(`Error sending meeting reminder:`, error);
            return null;
        }
    }

    /**
     * Update attendee status
     * 
     * @param meetingId - The meeting ID
     * @param userId - The user ID
     * @param isConfirmed - Whether the user confirmed attendance
     * @returns The updated meeting
     */
    async updateAttendeeStatus(meetingId: string, userId: string, isConfirmed: boolean): Promise<IMeeting> {
        const meeting = await this.databaseService.getMeetingById(meetingId);
        if (!meeting) {
            throw new Error(`Meeting not found: ${meetingId}`);
        }

        if (isConfirmed) {
            meeting.addConfirmedAttendee(userId);
            meeting.absentAttendees.delete(userId);
        } else {
            meeting.addAbsentAttendee(userId);
            meeting.confirmedAttendees.delete(userId);
        }

        await this.databaseService.saveMeeting(meeting);
        await this.updateMeetingMessage(meeting);

        return meeting;
    }

    /**
     * Update the meeting announcement message
     * 
     * @param meeting - The meeting to update
     * @returns The updated message or null if failed
     */
    async updateMeetingMessage(meeting: IMeeting): Promise<Message | null> {
        if (!meeting.messageId || !meeting.channelOriginId) {
            return null;
        }

        try {
            // Get the channel
            const channel = await this.client.channels.fetch(meeting.channelOriginId);
            if (!channel || !('messages' in channel)) {
                console.error(`Invalid announcement channel: ${meeting.channelOriginId}`);
                return null;
            }

            // Get the message
            const message = await channel.messages.fetch(meeting.messageId);
            if (!message) {
                console.error(`Meeting message not found: ${meeting.messageId}`);
                return null;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(meeting.isCompleted ? '#888888' : '#0099ff')
                .setTitle(`${meeting.isCompleted ? '✅ Completed: ' : '📅 '}${meeting.subject}`)
                .setDescription(`${meeting.isCompleted ? 'This meeting has ended' : 'A meeting has been scheduled'}`)
                .addFields(
                    { name: 'Date', value: meeting.getFormattedDate(), inline: true },
                    { name: 'Time', value: meeting.getFormattedTime(), inline: true },
                    { name: 'Channel', value: this.getChannelMention(meeting), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Meeting ID: ${meeting.id}` });

            // Add invitation link if available
            if (meeting.invitationUrl) {
                embed.addFields({ name: 'Invitation', value: `[Click to join](${meeting.invitationUrl})`, inline: false });
            }

            // Get creator name
            try {
                const creator = await this.client.users.fetch(meeting.creatorId);
                if (creator) {
                    embed.setAuthor({ name: `Created by ${creator.username}`, iconURL: creator.displayAvatarURL() });
                }
            } catch (error) {
                console.error(`Error fetching creator: ${meeting.creatorId}`, error);
            }

            // Add confirmed attendees
            if (meeting.confirmedAttendees.size > 0) {
                let confirmedText = '';
                for (const id of meeting.confirmedAttendees) {
                    confirmedText += `<@${id}> `;
                }
                embed.addFields({ name: `Confirmed Attendees (${meeting.confirmedAttendees.size})`, value: confirmedText.trim() || 'None', inline: false });
            }

            // Add absent attendees
            if (meeting.absentAttendees.size > 0) {
                let absentText = '';
                for (const id of meeting.absentAttendees) {
                    absentText += `<@${id}> `;
                }
                embed.addFields({ name: `Declined Attendance (${meeting.absentAttendees.size})`, value: absentText.trim() || 'None', inline: false });
            }

            // Create components
            const components = [];

            if (!meeting.isCompleted) {
                // Create attendance buttons
                const attendRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`meeting_confirm_${meeting.id}`)
                            .setLabel('I will attend')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`meeting_decline_${meeting.id}`)
                            .setLabel('I cannot attend')
                            .setStyle(ButtonStyle.Danger)
                    );
                components.push(attendRow);

                // Create management buttons
                const manageRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`meeting_cancel_${meeting.id}`)
                            .setLabel('Cancel Meeting')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`meeting_complete_${meeting.id}`)
                            .setLabel('Mark as Completed')
                            .setStyle(ButtonStyle.Primary)
                    );
                components.push(manageRow);
            } else {
                // Meeting is completed, only show the re-open button
                const manageRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`meeting_reopen_${meeting.id}`)
                            .setLabel('Re-open Meeting')
                            .setStyle(ButtonStyle.Primary)
                    );
                components.push(manageRow);
            }

            // Update the message
            await message.edit({
                embeds: [embed],
                components: components
            });

            return message;
        } catch (error) {
            console.error('Error updating meeting message:', error);
            return null;
        }
    }

    /**
     * Schedule reminders for a meeting
     * 
     * @param meeting - The meeting to schedule reminders for
     */
    scheduleMeetingReminders(meeting: IMeeting): void {
        for (const minutesBefore of this.reminderMinutes) {
            this.schedulerService.scheduleReminder(
                meeting,
                minutesBefore,
                async () => {
                    await this.sendMeetingReminder(meeting, minutesBefore);
                }
            );
        }
    }

    /**
     * Schedule the meeting completion
     * 
     * @param meeting - The meeting to schedule completion for
     */
    scheduleMeetingCompletion(meeting: IMeeting): void {
        this.schedulerService.scheduleMeetingCompletion(
            meeting,
            async () => {
                await this.completeMeeting(meeting.id);
            }
        );
    }

    /**
     * Get a mention for the meeting channel
     * 
     * @param meeting - The meeting
     * @returns The channel mention
     */
    getChannelMention(meeting: IMeeting): string {
        return `<#${meeting.channelId}>`;
    }
} 