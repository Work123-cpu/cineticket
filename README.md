# Telegram BMS Ticket Monitoring Bot 🎟️

A robust, stealthy Telegram bot designed to monitor BookMyShow movie ticket availability in real-time.

## Features ✨

1. **Step-by-Step Interactive Wizard (`/add`)**:
   - Prompts step-by-step for Location, Movie Name/Slug, Event ID, Date (`YYYYMMDD`), and optional Showtime ID instead of requiring a long single-line input.
   - Automatically builds target BookMyShow URL:
     `https://in.bookmyshow.com/movies/[location]/[movie-name]/[Event_ID]/[date]`
2. **Smart Speed & Anti-Block Mechanism**:
   - 🐢 **Eco Mode**: When event date is > 2 days away, checks every 5–10 minutes with random jitter.
   - ⚡ **Turbo Mode**: Automatically switches to 30–60 seconds polling interval with jitter when event date is within 48 hours.
   - **Stealth Tactics**: Rotates Chrome, Firefox, Edge, Safari User-Agents and sends full browser headers to avoid anti-bot blocks.
3. **Background Loop & Error Handling**:
   - Silently logs 404 / empty showtime count ("bookings not open yet").
   - Pauses monitoring and alerts on 403 / Cloudflare anti-bot blocks to protect your IP.
4. **Multiple Checks Management**:
   - `/list`: Lists active monitoring tasks with index numbers, mode, and health stats.
   - `/del <number>`: Delete active check by index number (e.g. `/del 1`).
   - `/status`: Single dashboard message summary.

---

## Setup Instructions 🚀

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### 2. Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and set your `BOT_TOKEN`:
   ```env
   BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```

### 3. Running the Bot
- **Production Mode**:
  ```bash
  npm start
  ```
- **Development Mode (Auto Reload)**:
  ```bash
  npm run dev
  ```

---

## Telegram Commands Reference 🤖

- `/start` or `/help` - View command guide and URL format info.
- `/add` - Start interactive 5-step wizard to add a new movie monitor.
- `/check` or `/check <number>` - Instantly trigger an on-demand check and reset background timer.
- `/cancel` - Abort active interactive step wizard.
- `/list` - Display all currently active monitoring tasks.
- `/del <number>` - Delete a monitoring task by index number (e.g. `/del 1`).
- `/status` - Display live summary dashboard.
