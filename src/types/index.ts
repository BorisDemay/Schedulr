import { Client, CommandInteraction } from 'discord.js';

// Meeting related interfaces
export interface IMeetingParams {
    subject: string;
    dateTime: Date;
    channelId: string;
    isVoiceChannel: boolean;
    guildId: string;
    creatorId: string;
    attendeeIds: Set<string>;
    channelOriginId: string;
}

export interface IMeetingData {
    id: string;
    subject: string;
    dateTime: string; // ISO date string
    channelId: string;
    isVoiceChannel: number; // 0 or 1 for SQLite
    guildId: string;
    creatorId: string;
    attendeeIds: string; // JSON string
    confirmedAttendees: string | null; // JSON string
    absentAttendees: string | null; // JSON string
    invitationUrl: string | null;
    messageId: string | null;
    isCompleted: number; // 0 or 1 for SQLite
    channelOriginId: string;
    timezone: string;
}

// Database related interfaces
export interface IDatabaseService {
    initialize(): Promise<void>;
    saveMeeting(meeting: IMeeting): Promise<void>;
    getMeetingById(meetingId: string): Promise<IMeeting | null>;
    getUpcomingMeetings(): Promise<IMeeting[]>;
    getMeetingsForReminder(reminderTime: Date): Promise<IMeeting[]>;
    updateMeetingStatus(meetingId: string, isCompleted: boolean): Promise<void>;
    deleteMeeting(meetingId: string): Promise<void>;
}

// Scheduler related interfaces
export interface ISchedulerService {
    scheduleReminder(meeting: IMeeting, minutesBefore: number, reminderTask: () => Promise<void>): void;
    scheduleMeetingCompletion(meeting: IMeeting, completionTask: () => Promise<void>): void;
    cancelMeetingJobs(meetingId: string): void;
    shutdown(): void;
}

// Meeting service related interfaces
export interface IMeetingService {
    parseReminderTimes(): Set<number>;
    restoreScheduledMeetings(): Promise<void>;
    createMeeting(params: IMeetingParams): Promise<IMeeting>;
    updateMeeting(meetingId: string, params: Partial<IMeetingParams>): Promise<IMeeting>;
    deleteMeeting(meetingId: string): Promise<void>;
    completeMeeting(meetingId: string): Promise<IMeeting>;
    getMeetingById(meetingId: string): Promise<IMeeting | null>;
    getUpcomingMeetings(): Promise<IMeeting[]>;
    createMeetingInvitation(meeting: IMeeting): Promise<string | null>;
    sendMeetingAnnouncement(meeting: IMeeting): Promise<any | null>;
    sendMeetingReminder(meeting: IMeeting, minutesBefore: number): Promise<any | null>;
    updateAttendeeStatus(meetingId: string, userId: string, isConfirmed: boolean): Promise<IMeeting>;
    updateMeetingMessage(meeting: IMeeting): Promise<any | null>;
    scheduleMeetingReminders(meeting: IMeeting): void;
    scheduleMeetingCompletion(meeting: IMeeting): void;
    getChannelMention(meeting: IMeeting): string;
}

// Discord.js command interface
export interface ICommand {
    data: any; // SlashCommandBuilder data
    execute(interaction: CommandInteraction, meetingService: IMeetingService): Promise<void>;
}

// Meeting model interface
export interface IMeeting {
    id: string;
    subject: string;
    dateTime: Date;
    channelId: string;
    isVoiceChannel: boolean;
    guildId: string;
    creatorId: string;
    attendeeIds: Set<string>;
    confirmedAttendees: Set<string>;
    absentAttendees: Set<string>;
    invitationUrl: string | null;
    messageId: string | null;
    isCompleted: boolean;
    channelOriginId: string;
    timezone: string;

    // Methods
    addAttendee(attendeeId: string): void;
    removeAttendee(attendeeId: string): void;
    addConfirmedAttendee(attendeeId: string): void;
    addAbsentAttendee(attendeeId: string): void;
    getFormattedDate(): string;
    getFormattedTime(): string;
    getFormattedDateTime(): string;
    toJSON(): IMeetingData;
}

// Bot configuration
export interface IBotConfig {
    token: string;
    databasePath: string;
    reminderTimes: string;
}

// Bot class interface
export interface ISchedulrBot {
    client: Client;
    commandsData: any[];
    databaseService: IDatabaseService;
    schedulerService: ISchedulerService;
    meetingService: IMeetingService;

    initialize(): Promise<void>;
    createDirectories(): void;
    loadCommands(): Promise<void>;
    registerCommands(): Promise<void>;
    registerEventHandlers(): void;
} 