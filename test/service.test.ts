/**
 * Service integration tests
 * Run with: npm test
 */
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { DatabaseService } from '../src/services/DatabaseService';
import { SchedulerService } from '../src/services/SchedulerService';
import { MeetingService } from '../src/services/MeetingService';
import { Meeting } from '../src/models/Meeting';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * Ensure test database directory exists
 */
function ensureTestDirExists(): void {
    const testDbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(testDbDir)) {
        fs.mkdirSync(testDbDir, { recursive: true });
    }
}

/**
 * Run service integration tests
 */
async function runTests(): Promise<void> {
    console.log('Starting integration tests...');
    let testMeeting;
    let dbService;

    try {
        ensureTestDirExists();

        // Create a mock client
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        // Initialize database service
        console.log('Initializing database service...');
        dbService = new DatabaseService('./data/test.db');
        await dbService.initialize();
        console.log('✅ Database service initialized');

        // Initialize scheduler service
        console.log('Initializing scheduler service...');
        const schedulerService = new SchedulerService();
        console.log('✅ Scheduler service initialized');

        // Initialize meeting service
        console.log('Initializing meeting service...');
        // Initializing but not using in this test
        new MeetingService(dbService, schedulerService, client);
        console.log('✅ Meeting service initialized');

        // Create a test meeting
        console.log('Creating test meeting...');
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 2); // 2 hours in the future

        testMeeting = new Meeting({
            subject: "Test Meeting",
            dateTime: futureDate,
            channelId: "test-channel-id",
            isVoiceChannel: false,
            guildId: "test-guild-id",
            creatorId: "test-creator-id",
            attendeeIds: new Set(["attendee1", "attendee2"]),
            channelOriginId: "test-channel-origin-id"
        });

        // Save the meeting to the database
        console.log('Saving test meeting to database...');
        await dbService.saveMeeting(testMeeting);
        console.log('✅ Test meeting saved with ID:', testMeeting.id);

        // Retrieve the meeting from the database
        console.log('Retrieving test meeting from database...');
        const retrievedMeeting = await dbService.getMeetingById(testMeeting.id);

        if (retrievedMeeting && retrievedMeeting.id === testMeeting.id) {
            console.log('✅ Test meeting retrieved successfully');
            console.log('Meeting details:', {
                id: retrievedMeeting.id,
                subject: retrievedMeeting.subject,
                dateTime: retrievedMeeting.dateTime,
                attendees: Array.from(retrievedMeeting.attendeeIds)
            });
        } else {
            throw new Error('Failed to retrieve test meeting');
        }

        console.log('\nAll tests completed successfully! ✅');
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    } finally {
        // Clean up
        if (testMeeting && dbService) {
            try {
                console.log('Cleaning up test data...');
                await dbService.deleteMeeting(testMeeting.id);
                console.log('✅ Test meeting deleted');
            } catch (cleanupError) {
                console.error('❌ Error during cleanup:', cleanupError);
            }
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

export { runTests }; 