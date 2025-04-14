import fs from 'fs';
import path from 'path';

/**
 * Log levels
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

/**
 * Logging service for consistent logging throughout the application
 */
export class LoggingService {
    private static instance: LoggingService;
    private logLevel: LogLevel;
    private logToConsole: boolean;
    private logToFile: boolean;
    private logDir: string;
    private logFile: string;
    private logStream: fs.WriteStream | null = null;

    /**
     * Create a new logging service instance
     */
    private constructor() {
        // Default values
        this.logLevel = LogLevel.INFO;
        this.logToConsole = true;
        this.logToFile = true;
        this.logDir = path.join(process.cwd(), 'logs');
        this.logFile = path.join(this.logDir, `schedulr_${this.getCurrentDate()}.log`);

        this.initializeLogFile();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService();
        }
        return LoggingService.instance;
    }

    /**
     * Initialize log file and directory
     */
    private initializeLogFile(): void {
        try {
            // Create log directory if it doesn't exist
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // Open log file stream
            if (this.logToFile) {
                this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });

                // Handle errors
                this.logStream.on('error', (error) => {
                    console.error(`Error writing to log file: ${error}`);
                    this.logToFile = false;
                });
            }
        } catch (error) {
            console.error(`Failed to initialize log file: ${error}`);
            this.logToFile = false;
        }
    }

    /**
     * Get current date in YYYY-MM-DD format
     */
    private getCurrentDate(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    /**
     * Format log message with timestamp and level
     */
    private formatLogMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    /**
     * Write log message to console and/or file
     */
    private log(level: LogLevel, levelStr: string, message: string, data?: any): void {
        if (level < this.logLevel) {
            return;
        }

        // Format message
        let formattedMessage = this.formatLogMessage(levelStr, message);

        // Add data if provided
        if (data !== undefined) {
            let dataStr: string;
            try {
                if (data instanceof Error) {
                    dataStr = `${data.message}\n${data.stack}`;
                } else if (typeof data === 'object') {
                    dataStr = JSON.stringify(data, null, 2);
                } else {
                    dataStr = String(data);
                }
                formattedMessage += `\n${dataStr}`;
            } catch (error) {
                formattedMessage += `\n[Error serializing data: ${error}]`;
            }
        }

        // Write to console
        if (this.logToConsole) {
            const consoleMethod = level >= LogLevel.ERROR ? 'error' : level === LogLevel.WARN ? 'warn' : 'log';
            console[consoleMethod](formattedMessage);
        }

        // Write to file
        if (this.logToFile && this.logStream) {
            this.logStream.write(formattedMessage + '\n');
        }
    }

    /**
     * Set the minimum log level
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    /**
     * Enable or disable console logging
     */
    public setConsoleLogging(enabled: boolean): void {
        this.logToConsole = enabled;
    }

    /**
     * Enable or disable file logging
     */
    public setFileLogging(enabled: boolean): void {
        if (enabled && !this.logToFile) {
            this.logToFile = true;
            this.initializeLogFile();
        } else if (!enabled && this.logToFile) {
            this.logToFile = false;
            if (this.logStream) {
                this.logStream.end();
                this.logStream = null;
            }
        }
    }

    /**
     * Log a debug message
     */
    public debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, data);
    }

    /**
     * Log an info message
     */
    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, 'INFO', message, data);
    }

    /**
     * Log a warning message
     */
    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, 'WARN', message, data);
    }

    /**
     * Log an error message
     */
    public error(message: string, data?: any): void {
        this.log(LogLevel.ERROR, 'ERROR', message, data);
    }

    /**
     * Log a fatal error message
     */
    public fatal(message: string, data?: any): void {
        this.log(LogLevel.FATAL, 'FATAL', message, data);
    }

    /**
     * Close the log stream when shutting down
     */
    public shutdown(): void {
        if (this.logStream) {
            this.logStream.end();
            this.logStream = null;
        }
    }
} 