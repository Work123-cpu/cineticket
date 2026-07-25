import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'checker.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ANSI Color codes for clean terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

export function logMessage(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
  const rawLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;

  let coloredLine = rawLine;
  if (level === 'error') {
    coloredLine = `${colors.red}${colors.bright}${rawLine}${colors.reset}`;
  } else if (level === 'warn') {
    coloredLine = `${colors.yellow}${colors.bright}${rawLine}${colors.reset}`;
  } else if (level === 'info') {
    coloredLine = `${colors.cyan}${rawLine}${colors.reset}`;
  } else if (level === 'success') {
    coloredLine = `${colors.green}${colors.bright}${rawLine}${colors.reset}`;
  }

  // Print to console
  if (level === 'error') {
    console.error(coloredLine);
  } else {
    console.log(coloredLine);
  }

  // Append raw uncolored line to logs/checker.log with auto-rotation (max 5MB)
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > 5 * 1024 * 1024) { // 5 MB limit
        const raw = fs.readFileSync(LOG_FILE, 'utf-8');
        const lines = raw.split('\n');
        const trimmed = lines.slice(-5000).join('\n'); // Keep last 5000 lines
        fs.writeFileSync(LOG_FILE, trimmed, 'utf-8');
      }
    }
    fs.appendFileSync(LOG_FILE, rawLine + '\n', 'utf-8');
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

export const logger = {
  info: (msg, meta) => logMessage('info', msg, meta),
  warn: (msg, meta) => logMessage('warn', msg, meta),
  error: (msg, meta) => logMessage('error', msg, meta),
  success: (msg, meta) => logMessage('success', msg, meta),
  debug: (msg, meta) => logMessage('debug', msg, meta)
};
