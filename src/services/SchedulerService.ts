import * as schedule from 'node-schedule';
import { ISchedulerService, IMeeting } from '../types';

/**
 * Service for scheduling tasks
 */
export class SchedulerService implements ISchedulerService {
    private scheduledJobs: Record<string, schedule.Job>;

    constructor() {
        this.scheduledJobs = {};
    }

    /**
     * Schedule a reminder for a meeting
     * 
     * @param meeting The meeting object
     * @param minutesBefore Minutes before the meeting to send the reminder
     * @param reminderTask Function to execute as reminder
     */
    scheduleReminder(meeting: IMeeting, minutesBefore: number, reminderTask: () => Promise<void>): void {
        // Calculate the time for the reminder
        const reminderTime = new Date(meeting.dateTime);
        reminderTime.setMinutes(reminderTime.getMinutes() - minutesBefore);

        // Don't schedule if the time is in the past
        if (reminderTime <= new Date()) {
            console.warn(`Attempted to schedule a reminder in the past for meeting ${meeting.id}`);
            return;
        }

        const jobId = `${meeting.id}_${minutesBefore}`;

        // Schedule the job
        this.scheduledJobs[jobId] = schedule.scheduleJob(reminderTime, async () => {
            try {
                console.log(`Executing reminder for meeting ${meeting.id} (${minutesBefore}min before)`);
                await reminderTask();
            } catch (error) {
                console.error('Error executing reminder job:', error);
            }
        });

        console.log(`Reminder scheduled for meeting ${meeting.id} at ${reminderTime.toLocaleString()} (${minutesBefore}min before)`);
    }

    /**
     * Schedule the completion of a meeting
     * 
     * @param meeting The meeting object
     * @param completionTask Function to execute for completion
     */
    scheduleMeetingCompletion(meeting: IMeeting, completionTask: () => Promise<void>): void {
        // Calculate the time for the completion (30 minutes after the meeting)
        const completionTime = new Date(meeting.dateTime);
        completionTime.setMinutes(completionTime.getMinutes() + 30);

        const jobId = `${meeting.id}_completion`;

        // Schedule the job
        this.scheduledJobs[jobId] = schedule.scheduleJob(completionTime, async () => {
            try {
                console.log(`Executing completion for meeting ${meeting.id}`);
                await completionTask();
            } catch (error) {
                console.error('Error executing completion job:', error);
            }
        });

        console.log(`Completion scheduled for meeting ${meeting.id} at ${completionTime.toLocaleString()} (30min after)`);
    }

    /**
     * Cancel all jobs related to a meeting
     * 
     * @param meetingId The ID of the meeting
     */
    cancelMeetingJobs(meetingId: string): void {
        // Find all jobs for this meeting
        Object.keys(this.scheduledJobs).forEach(jobId => {
            if (jobId.startsWith(meetingId)) {
                // Cancel the job
                this.scheduledJobs[jobId].cancel();
                delete this.scheduledJobs[jobId];
                console.log(`Canceled job ${jobId}`);
            }
        });

        console.log(`Jobs canceled for meeting ${meetingId}`);
    }

    /**
     * Shutdown the scheduler
     */
    shutdown(): void {
        // Cancel all scheduled jobs
        Object.values(this.scheduledJobs).forEach(job => job.cancel());
        this.scheduledJobs = {};
        console.log('Scheduler shut down successfully');
    }
} 