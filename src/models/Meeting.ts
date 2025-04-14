import { v4 as uuidv4 } from 'uuid';
import { IMeeting, IMeetingParams, IMeetingData } from '../types';

/**
 * Represents a meeting in the scheduling system
 */
export class Meeting implements IMeeting {
    public id: string;
    public subject: string;
    public dateTime: Date;
    public channelId: string;
    public isVoiceChannel: boolean;
    public guildId: string;
    public creatorId: string;
    public attendeeIds: Set<string>;
    public confirmedAttendees: Set<string>;
    public absentAttendees: Set<string>;
    public isCompleted: boolean;
    public channelOriginId: string;
    public timezone: string;
    public invitationUrl: string | null;
    public messageId: string | null;

    /**
     * Create a new meeting
     * 
     * @param params The meeting parameters
     */
    constructor(params: IMeetingParams) {
        this.id = uuidv4();
        this.subject = params.subject;
        this.dateTime = params.dateTime;
        this.channelId = params.channelId;
        this.isVoiceChannel = params.isVoiceChannel;
        this.guildId = params.guildId;
        this.creatorId = params.creatorId;
        this.attendeeIds = new Set(params.attendeeIds || []);
        this.confirmedAttendees = new Set();
        this.absentAttendees = new Set();
        this.isCompleted = false;
        this.channelOriginId = params.channelOriginId;
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.invitationUrl = null;
        this.messageId = null;
    }

    /**
     * Create a meeting instance from database data
     */
    static fromDatabase(data: IMeetingData): IMeeting {
        const attendeeIds = data.attendeeIds ? JSON.parse(data.attendeeIds) : [];
        const confirmedAttendees = data.confirmedAttendees ? JSON.parse(data.confirmedAttendees) : [];
        const absentAttendees = data.absentAttendees ? JSON.parse(data.absentAttendees) : [];

        const meeting = new Meeting({
            subject: data.subject,
            dateTime: new Date(data.dateTime),
            channelId: data.channelId,
            isVoiceChannel: Boolean(data.isVoiceChannel),
            guildId: data.guildId,
            creatorId: data.creatorId,
            attendeeIds: new Set(attendeeIds),
            channelOriginId: data.channelOriginId
        });

        meeting.id = data.id;
        meeting.confirmedAttendees = new Set(confirmedAttendees);
        meeting.absentAttendees = new Set(absentAttendees);
        meeting.invitationUrl = data.invitationUrl;
        meeting.messageId = data.messageId;
        meeting.isCompleted = Boolean(data.isCompleted);
        meeting.timezone = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        return meeting;
    }

    /**
     * Add an attendee to the meeting
     * @param attendeeId The ID of the attendee to add
     */
    addAttendee(attendeeId: string): void {
        this.attendeeIds.add(attendeeId);
    }

    /**
     * Remove an attendee from the meeting
     * @param attendeeId The ID of the attendee to remove
     */
    removeAttendee(attendeeId: string): void {
        this.attendeeIds.delete(attendeeId);
    }

    /**
     * Add a confirmed attendee to the meeting
     * @param attendeeId The ID of the attendee to confirm
     */
    addConfirmedAttendee(attendeeId: string): void {
        this.confirmedAttendees.add(attendeeId);
        this.absentAttendees.delete(attendeeId);
    }

    /**
     * Add an absent attendee to the meeting
     * @param attendeeId The ID of the attendee to mark as absent
     */
    addAbsentAttendee(attendeeId: string): void {
        this.absentAttendees.add(attendeeId);
        this.confirmedAttendees.delete(attendeeId);
    }

    /**
     * Get the formatted date string
     * @returns The formatted date (DD/MM/YYYY)
     */
    getFormattedDate(): string {
        return this.dateTime.toLocaleDateString('fr-FR');
    }

    /**
     * Get the formatted time string
     * @returns The formatted time (HH:MM)
     */
    getFormattedTime(): string {
        return this.dateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Get the formatted date and time string
     * @returns The formatted date and time (DD/MM/YYYY HH:MM)
     */
    getFormattedDateTime(): string {
        return `${this.getFormattedDate()} ${this.getFormattedTime()}`;
    }

    /**
     * Convert to a JSON-serializable object for database storage
     * @returns A plain object representation of the meeting
     */
    toJSON(): IMeetingData {
        return {
            id: this.id,
            subject: this.subject,
            dateTime: this.dateTime.toISOString(),
            channelId: this.channelId,
            isVoiceChannel: this.isVoiceChannel ? 1 : 0,
            guildId: this.guildId,
            creatorId: this.creatorId,
            attendeeIds: JSON.stringify(Array.from(this.attendeeIds)),
            confirmedAttendees: JSON.stringify(Array.from(this.confirmedAttendees)),
            absentAttendees: JSON.stringify(Array.from(this.absentAttendees)),
            invitationUrl: this.invitationUrl,
            messageId: this.messageId,
            isCompleted: this.isCompleted ? 1 : 0,
            channelOriginId: this.channelOriginId,
            timezone: this.timezone
        };
    }
} 