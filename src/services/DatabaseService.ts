import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { Meeting } from '../models/Meeting';
import { IDatabaseService, IMeeting } from '../types';

/**
 * Service for database operations
 */
export class DatabaseService implements IDatabaseService {
    private dbPath: string;
    private db: Database | null = null;

    /**
     * Create a new database service
     * @param dbPath Path to the SQLite database file
     */
    constructor(dbPath: string) {
        this.dbPath = dbPath || path.join(__dirname, '../../data/schedulr.db');
    }

    /**
     * Initialize the database connection and create tables if needed
     */
    async initialize(): Promise<void> {
        // Ensure parent directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Open database connection
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await this.db.exec('PRAGMA foreign_keys = ON');

        // Create tables if they don't exist
        await this.db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        dateTime TEXT NOT NULL,
        channelId TEXT NOT NULL,
        isVoiceChannel INTEGER NOT NULL,
        guildId TEXT NOT NULL,
        creatorId TEXT NOT NULL,
        attendeeIds TEXT NOT NULL,
        confirmedAttendees TEXT,
        absentAttendees TEXT,
        invitationUrl TEXT,
        messageId TEXT,
        isCompleted INTEGER NOT NULL DEFAULT 0,
        channelOriginId TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Europe/Paris'
      )
    `);

        console.log('Database initialized successfully');
    }

    /**
     * Save a meeting to the database
     * @param meeting The meeting to save
     */
    async saveMeeting(meeting: IMeeting): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const data = meeting.toJSON();

        const sql = `
      INSERT OR REPLACE INTO meetings (
        id, subject, dateTime, channelId, isVoiceChannel, 
        guildId, creatorId, attendeeIds, confirmedAttendees, 
        absentAttendees, invitationUrl, messageId, isCompleted, 
        channelOriginId, timezone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        await this.db.run(sql, [
            data.id,
            data.subject,
            data.dateTime,
            data.channelId,
            data.isVoiceChannel,
            data.guildId,
            data.creatorId,
            data.attendeeIds,
            data.confirmedAttendees,
            data.absentAttendees,
            data.invitationUrl,
            data.messageId,
            data.isCompleted,
            data.channelOriginId,
            data.timezone
        ]);

        console.log(`Meeting saved successfully: ${meeting.id}`);
    }

    /**
     * Get a meeting by its ID
     * @param meetingId The ID of the meeting to retrieve
     * @returns The meeting or null if not found
     */
    async getMeetingById(meetingId: string): Promise<IMeeting | null> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const row = await this.db.get('SELECT * FROM meetings WHERE id = ?', [meetingId]);

        if (!row) return null;

        return Meeting.fromDatabase(row);
    }

    /**
     * Get all upcoming meetings
     * @returns Array of upcoming meetings
     */
    async getUpcomingMeetings(): Promise<IMeeting[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const rows = await this.db.all(
            'SELECT * FROM meetings WHERE dateTime > ? AND isCompleted = 0 ORDER BY dateTime ASC',
            [new Date().toISOString()]
        );

        return rows.map(row => Meeting.fromDatabase(row));
    }

    /**
     * Get meetings that should be reminded
     * @param reminderTime Time threshold for reminder
     * @returns Array of meetings that need reminders
     */
    async getMeetingsForReminder(reminderTime: Date): Promise<IMeeting[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const rows = await this.db.all(
            'SELECT * FROM meetings WHERE dateTime > ? AND dateTime <= ? AND isCompleted = 0',
            [new Date().toISOString(), reminderTime.toISOString()]
        );

        return rows.map(row => Meeting.fromDatabase(row));
    }

    /**
     * Update meeting completion status
     * @param meetingId The ID of the meeting
     * @param isCompleted Whether the meeting is completed
     */
    async updateMeetingStatus(meetingId: string, isCompleted: boolean): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        await this.db.run(
            'UPDATE meetings SET isCompleted = ? WHERE id = ?',
            [isCompleted ? 1 : 0, meetingId]
        );

        console.log(`Meeting status updated: ${meetingId}, completed: ${isCompleted}`);
    }

    /**
     * Delete a meeting
     * @param meetingId The ID of the meeting to delete
     */
    async deleteMeeting(meetingId: string): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        await this.db.run('DELETE FROM meetings WHERE id = ?', [meetingId]);
        console.log(`Meeting deleted: ${meetingId}`);
    }
} 