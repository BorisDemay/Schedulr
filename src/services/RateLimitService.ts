/**
 * Simple rate limiting service to prevent command spam
 */
export class RateLimitService {
    private static instance: RateLimitService;

    // Store user command timestamps: userId -> commandName -> timestamps[]
    private userCommandHistory: Map<string, Map<string, number[]>> = new Map();

    // Default rate limits (commands per time window)
    private defaultLimits = {
        global: { count: 10, window: 60 * 1000 }, // 10 commands per minute globally
        meeting: { count: 3, window: 60 * 1000 }, // 3 meeting creations per minute
        reschedule: { count: 5, window: 60 * 1000 }, // 5 reschedules per minute
        cancel: { count: 5, window: 60 * 1000 } // 5 cancellations per minute
    };

    /**
     * Get singleton instance
     */
    public static getInstance(): RateLimitService {
        if (!RateLimitService.instance) {
            RateLimitService.instance = new RateLimitService();
        }
        return RateLimitService.instance;
    }

    /**
     * Check if a user is rate limited for a specific command
     * @param userId User ID to check
     * @param commandName Command name to check
     * @returns Object with result and cooldown time if limited
     */
    public isRateLimited(userId: string, commandName: string): { limited: boolean, retryAfter?: number } {
        const now = Date.now();

        // Initialize user history if not exists
        if (!this.userCommandHistory.has(userId)) {
            this.userCommandHistory.set(userId, new Map());
        }

        const userHistory = this.userCommandHistory.get(userId)!;

        // Initialize command history if not exists
        if (!userHistory.has(commandName)) {
            userHistory.set(commandName, []);
        }

        // Get command timestamps
        const commandHistory = userHistory.get(commandName)!;

        // Get limits for command
        const commandLimit = this.defaultLimits[commandName as keyof typeof this.defaultLimits] || this.defaultLimits.global;

        // Cleanup old timestamps
        const cutoff = now - commandLimit.window;
        const recentCommands = commandHistory.filter(timestamp => timestamp > cutoff);
        userHistory.set(commandName, recentCommands);

        // Check if user is rate limited
        if (recentCommands.length >= commandLimit.count) {
            // Calculate the time when the oldest command will expire
            const oldestTimestamp = recentCommands[0];
            const retryAfter = Math.ceil((oldestTimestamp + commandLimit.window - now) / 1000);

            return { limited: true, retryAfter };
        }

        // Add current timestamp to history
        recentCommands.push(now);
        userHistory.set(commandName, recentCommands);

        return { limited: false };
    }

    /**
     * Reset rate limit for a user and command
     * @param userId User ID to reset
     * @param commandName Optional command name (if not provided, resets all commands)
     */
    public resetRateLimit(userId: string, commandName?: string): void {
        if (!this.userCommandHistory.has(userId)) {
            return;
        }

        const userHistory = this.userCommandHistory.get(userId)!;

        if (commandName) {
            // Reset specific command
            userHistory.delete(commandName);
        } else {
            // Reset all commands
            this.userCommandHistory.delete(userId);
        }
    }

    /**
     * Set custom rate limit for a command
     * @param commandName Command name
     * @param count Max number of commands in the window
     * @param window Time window in milliseconds
     */
    public setCommandLimit(commandName: string, count: number, window: number): void {
        if (count < 1) count = 1;
        if (window < 1000) window = 1000; // Minimum 1 second window

        this.defaultLimits[commandName as keyof typeof this.defaultLimits] = { count, window };
    }

    /**
     * Clean up old rate limit data
     * This should be called periodically to prevent memory leaks
     */
    public cleanup(): void {
        const now = Date.now();
        const maxWindow = Object.values(this.defaultLimits)
            .reduce((max, limit) => Math.max(max, limit.window), 0);

        // Iterate through all users
        for (const [userId, userHistory] of this.userCommandHistory.entries()) {
            // Iterate through all commands for this user
            for (const [commandName, timestamps] of userHistory.entries()) {
                // Keep only recent timestamps
                const cutoff = now - maxWindow;
                const recentTimestamps = timestamps.filter(ts => ts > cutoff);

                if (recentTimestamps.length === 0) {
                    // No recent commands, remove this command entry
                    userHistory.delete(commandName);
                } else {
                    // Update with only recent timestamps
                    userHistory.set(commandName, recentTimestamps);
                }
            }

            // If user has no commands left, remove the user entry
            if (userHistory.size === 0) {
                this.userCommandHistory.delete(userId);
            }
        }
    }
} 