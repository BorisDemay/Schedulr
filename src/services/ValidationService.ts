import { PermissionsBitField, CommandInteraction, GuildMember, Guild, GuildChannel, ChannelType } from 'discord.js';
import fs from 'fs';
import path from 'path';

/**
 * Service for handling validations across the application
 */
export class ValidationService {
    private static instance: ValidationService;
    private requiredEnvVars: string[] = [
        'TOKEN',
        'DATABASE_PATH'
    ];
    private optionalEnvVars: Map<string, string> = new Map([
        ['REMINDER_TIMES', '60,15']
    ]);

    /**
     * Get singleton instance
     */
    public static getInstance(): ValidationService {
        if (!ValidationService.instance) {
            ValidationService.instance = new ValidationService();
        }
        return ValidationService.instance;
    }

    /**
     * Validate all required environment variables are set
     * @returns Object with validation result and any error messages
     */
    public validateEnvironment(): { isValid: boolean, errors: string[] } {
        const errors: string[] = [];

        // Check required env vars
        for (const envVar of this.requiredEnvVars) {
            if (!process.env[envVar]) {
                errors.push(`Missing required environment variable: ${envVar}`);
            }
        }

        // Set defaults for optional env vars
        for (const [envVar, defaultValue] of this.optionalEnvVars.entries()) {
            if (!process.env[envVar]) {
                process.env[envVar] = defaultValue;
                console.log(`Setting default value for ${envVar}: ${defaultValue}`);
            }
        }

        // Validate database path exists or can be created
        if (process.env.DATABASE_PATH) {
            try {
                const dbDir = path.dirname(process.env.DATABASE_PATH);
                if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                }
            } catch (error) {
                errors.push(`Invalid database path: ${process.env.DATABASE_PATH}. Error: ${error}`);
            }
        }

        // Validate reminder times
        if (process.env.REMINDER_TIMES) {
            try {
                const reminderTimesStr = process.env.REMINDER_TIMES;
                const times = reminderTimesStr.split(',');

                for (const timeStr of times) {
                    const minutes = parseInt(timeStr.trim(), 10);
                    if (isNaN(minutes) || minutes <= 0) {
                        errors.push(`Invalid value in REMINDER_TIMES: ${timeStr}. Must be a positive number.`);
                    }
                }
            } catch (error) {
                errors.push(`Invalid REMINDER_TIMES format. Error: ${error}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate if user has manage channel permission
     * @param member The guild member
     * @param channel The channel to check permissions for
     * @returns boolean indicating if user has permission
     */
    public hasManageChannelPermission(member: GuildMember, channel: GuildChannel): boolean {
        return member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
            channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ManageChannels) ||
            false;
    }

    /**
     * Validate if user has permission to manage meetings
     * @param interaction The command interaction
     * @returns Object with validation result and error message if any
     */
    public canManageMeetings(interaction: CommandInteraction): { canManage: boolean, errorMessage: string | null } {
        if (!interaction.guild) {
            return { canManage: false, errorMessage: 'This command can only be used in a server.' };
        }

        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!member) {
            return { canManage: false, errorMessage: 'Could not find you in this server.' };
        }

        // Admin or manage server rights can always manage meetings
        if (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
            member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return { canManage: true, errorMessage: null };
        }

        return { canManage: true, errorMessage: null };
    }

    /**
     * Check if a user can create meetings
     * @param interaction The command interaction
     * @returns Object with validation result and error message if any
     */
    public canCreateMeeting(_interaction: CommandInteraction): { canCreate: boolean, errorMessage: string | null } {
        // All members can create meetings by default, but this can be extended with custom logic
        return { canCreate: true, errorMessage: null };
    }

    /**
     * Validate a date string is in correct format (DD/MM/YYYY)
     * @param dateStr The date string to validate
     * @returns Object with validation result, parsed date, and error message if any
     */
    public validateDateString(dateStr: string): { isValid: boolean, date: Date | null, errorMessage: string | null } {
        try {
            const dateParts = dateStr.split('/');
            if (dateParts.length !== 3) {
                return { isValid: false, date: null, errorMessage: 'Invalid date format. Use DD/MM/YYYY.' };
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // Months are 0-indexed in JS
            const year = parseInt(dateParts[2], 10);

            if (isNaN(day) || isNaN(month) || isNaN(year)) {
                return { isValid: false, date: null, errorMessage: 'Invalid date format. Use DD/MM/YYYY with numbers.' };
            }

            const date = new Date(year, month, day);

            if (isNaN(date.getTime())) {
                return { isValid: false, date: null, errorMessage: 'Invalid date. Please check your input.' };
            }

            return { isValid: true, date, errorMessage: null };
        } catch (error) {
            return { isValid: false, date: null, errorMessage: 'Error parsing date: ' + error };
        }
    }

    /**
     * Validate a time string is in correct format (HH:MM)
     * @param timeStr The time string to validate
     * @returns Object with validation result, hours and minutes, and error message if any
     */
    public validateTimeString(timeStr: string): { isValid: boolean, hours: number | null, minutes: number | null, errorMessage: string | null } {
        try {
            const timeParts = timeStr.split(':');
            if (timeParts.length !== 2) {
                return { isValid: false, hours: null, minutes: null, errorMessage: 'Invalid time format. Use HH:MM.' };
            }

            const hours = parseInt(timeParts[0], 10);
            const minutes = parseInt(timeParts[1], 10);

            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                return {
                    isValid: false,
                    hours: null,
                    minutes: null,
                    errorMessage: 'Invalid time. Please use 24-hour format (00:00 to 23:59).'
                };
            }

            return { isValid: true, hours, minutes, errorMessage: null };
        } catch (error) {
            return { isValid: false, hours: null, minutes: null, errorMessage: 'Error parsing time: ' + error };
        }
    }

    /**
     * Check if a date is in the future
     * @param date The date to check
     * @returns Object with validation result and error message if any
     */
    public isDateInFuture(date: Date): { isInFuture: boolean, errorMessage: string | null } {
        if (date <= new Date()) {
            return { isInFuture: false, errorMessage: 'The meeting date and time must be in the future.' };
        }
        return { isInFuture: true, errorMessage: null };
    }

    /**
     * Check if a channel is a valid meeting channel
     * @param guild The guild (server)
     * @param channelId The channel ID to validate
     * @returns Object with validation result, channel object, and error message if any
     */
    public validateChannel(guild: Guild, channelId: string): {
        isValid: boolean,
        channel: GuildChannel | null,
        isVoiceChannel: boolean,
        errorMessage: string | null
    } {
        try {
            const channel = guild.channels.cache.get(channelId) as GuildChannel;

            if (!channel) {
                return {
                    isValid: false,
                    channel: null,
                    isVoiceChannel: false,
                    errorMessage: 'Channel not found.'
                };
            }

            // Check if channel is text or voice channel
            if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildVoice) {
                return {
                    isValid: false,
                    channel: null,
                    isVoiceChannel: false,
                    errorMessage: 'Channel must be a text or voice channel.'
                };
            }

            const isVoiceChannel = channel.type === ChannelType.GuildVoice;

            return {
                isValid: true,
                channel,
                isVoiceChannel,
                errorMessage: null
            };
        } catch (error) {
            return {
                isValid: false,
                channel: null,
                isVoiceChannel: false,
                errorMessage: 'Error validating channel: ' + error
            };
        }
    }

    /**
     * Validate subject string meets requirements
     * @param subject The meeting subject
     * @returns Object with validation result and error message if any
     */
    public validateSubject(subject: string): { isValid: boolean, errorMessage: string | null } {
        if (!subject || subject.trim().length === 0) {
            return { isValid: false, errorMessage: 'Meeting subject cannot be empty.' };
        }

        if (subject.length > 100) {
            return { isValid: false, errorMessage: 'Meeting subject cannot exceed 100 characters.' };
        }

        return { isValid: true, errorMessage: null };
    }
} 