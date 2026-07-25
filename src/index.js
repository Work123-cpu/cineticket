import dotenv from 'dotenv';
import { setupBot } from './bot/telegramBot.js';
import { TicketChecker } from './monitor/checker.js';
import { logger } from './utils/logger.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN || BOT_TOKEN === 'your_telegram_bot_token_here') {
  logger.error('ERROR: TELEGRAM BOT TOKEN is missing or unset in .env file!');
  process.exit(1);
}

const banner = `
===========================================================
  🎟️  BOOKMYSHOW TICKET MONITORING BOT v3.0  🎟️
===========================================================
  [Engine]    : Puppeteer Extra + Stealth WAF Bypass
  [Storage]   : Persistent Store (data/checks.json)
  [Audit Log] : logs/checker.log
===========================================================
`;

console.log('\x1b[36m%s\x1b[0m', banner);
logger.info('Initializing BookMyShow Ticket Monitoring Bot engine...');

// Initialize Ticket Checker
const checker = new TicketChecker();

// Initialize Telegram Bot
const bot = setupBot(BOT_TOKEN, checker);

// Start ticket monitoring loop for active tasks in database
checker.startAll();

// Launch Telegram bot polling
bot.telegram.getMe()
  .then((me) => {
    logger.success(`🤖 Telegram Bot connected as @${me.username} (${me.first_name})`);
    return bot.launch();
  })
  .then(() => {
    logger.success('⚡ Long polling active. Bot is listening for Telegram commands & URLs...');
  })
  .catch((err) => {
    if (err.response?.error_code === 404) {
      logger.error('❌ Failed to start Telegram bot: HTTP 404 Not Found. Check BOT_TOKEN in .env!');
    } else {
      logger.error(`Failed to start Telegram bot: ${err.message}`);
    }
  });

// Graceful shutdown handling
process.once('SIGINT', () => {
  logger.warn('Received SIGINT. Shutting down cleanly...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  logger.warn('Received SIGTERM. Shutting down cleanly...');
  bot.stop('SIGTERM');
  process.exit(0);
});
