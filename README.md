# Schedulr - Discord Meeting Scheduler

A Discord bot for scheduling and managing meetings built with Discord.js.

## Features

- Create meetings with specific dates, times, and channels
- Schedule meetings in text or voice channels
- Send automatic reminders before meetings
- Allow attendees to confirm or decline attendance
- Reschedule or cancel meetings
- View all upcoming meetings

## Tech Stack

- **Language**: JavaScript (Node.js)
- **Framework**: discord.js v14
- **Database**: SQLite
- **Scheduler**: node-schedule

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/BorisDemay/Schedulr
   cd schedulr
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create and configure your `.env` file:
   ```
   cp .env.example .env
   ```
   
4. Edit the `.env` file with your Discord bot token and other settings:
   ```
   TOKEN=your_discord_bot_token_here
   DATABASE_PATH=./data/schedulr.db
   REMINDER_TIMES=60,15
   ```

5. Start the bot:
   ```
   npm run build
   npm start
   ```

## Bot Commands

The bot provides the following slash commands:

- `/meeting` - Create a new meeting
  - `subject` - The subject of the meeting
  - `time` - The time (HH:MM format)
  - `channel` - The channel where the meeting will be held
  - `attendee1` - A user or role to invite
  - `date` - (Optional) The date (DD/MM/YYYY format)
  - `attendee2-5` - (Optional) Additional users or roles to invite

- `/reschedule` - Reschedule an existing meeting
  - `meeting_id` - The ID of the meeting to reschedule
  - `time` - The new time (HH:MM format)
  - `date` - The new date (DD/MM/YYYY format)
  - `channel` - (Optional) The new channel for the meeting
  - `subject` - (Optional) The new subject

- `/meetings` - List all upcoming meetings

- `/cancel` - Cancel an existing meeting
  - `meeting_id` - The ID of the meeting to cancel

## Discord Bot Setup

1. Create a new application at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot user for your application
3. Enable the following Privileged Gateway Intents:
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
4. Generate an invite URL with the following permissions:
   - `bot`
   - `applications.commands`
   - Permissions: Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions
5. Invite the bot to your server

## Meeting Features

- **Automatic Reminders**: The bot sends reminders at configured intervals (default: 60 and 15 minutes before the meeting)
- **RSVP System**: Members can confirm or decline attendance with buttons
- **Meeting Invitations**: Creates invitation links for meeting channels
- **Timezone Support**: Stores meetings with timezone information

## Requirements

- Node.js 16.x or higher
- Discord.js v14
- SQLite database

## License

This project is licensed under the MIT License.

---

## 🚀 Getting Started

### 1. Clone the project

```bash
git clone https://github.com/BorisDemay/Schedulr
cd schedulr

## V2 Features 

- create new channel for each meeting to have a better organization and to have a chat history for the meeting
- change settings for the bot to be more flexible, like the reminder time, the channel where the bot will send the announcement, the channel where the bot will send the reminders
- add a command to view the bot's settings
- add a command to change the bot's settings
- add a command to reset the bot's settings to the default values
- add a command to view the bot's version
- better logging
- better attendance management