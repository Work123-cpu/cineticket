import { Telegraf } from 'telegraf';
import { store } from '../storage/store.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CINEMAS_FILE = path.join(__dirname, '../../data/cinemas.json');

// In-memory conversation state
const userSessions = new Map();

// ─── Cinema Config ────────────────────────────────────────────────────────────

function getCinemasForCity(city) {
  try {
    const raw = fs.readFileSync(CINEMAS_FILE, 'utf-8');
    const all = JSON.parse(raw);
    const key = city ? city.toLowerCase().replace(/-/g, '') : '';
    for (const [k, v] of Object.entries(all)) {
      if (k.replace(/-/g, '') === key) return v;
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Date Parser ─────────────────────────────────────────────────────────────

export function parseFlexibleDate(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return null;

  let str = inputStr.trim().toLowerCase();
  str = str.replace(/(\d+)(st|nd|rd|th)/g, '$1');

  const monthMap = {
    jan: '01', january: '01', feb: '02', february: '02',
    mar: '03', march: '03', apr: '04', april: '04', may: '05',
    jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08',
    sep: '09', sept: '09', september: '09', oct: '10', october: '10',
    nov: '11', november: '11', dec: '12', december: '12'
  };

  if (/^\d{8}$/.test(str)) return str;

  const dmmmyyyy = /^(\d{1,2})[\s\-\/\.]*([a-z]{3,9})[\s\-\/\.]*(\d{2,4})$/i;
  let m = str.match(dmmmyyyy);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = monthMap[m[2].substring(0, 3)] || monthMap[m[2]];
    let year = m[3]; if (year.length === 2) year = '20' + year;
    if (month && day && year && year.length === 4) return `${year}${month}${day}`;
  }

  const mmmddyyyy = /^([a-z]{3,9})[\s\-\/\.]*(\d{1,2})[\s\-\/\.]*(\d{2,4})$/i;
  m = str.match(mmmddyyyy);
  if (m) {
    const month = monthMap[m[1].substring(0, 3)] || monthMap[m[1]];
    const day = m[2].padStart(2, '0');
    let year = m[3]; if (year.length === 2) year = '20' + year;
    if (month && day && year && year.length === 4) return `${year}${month}${day}`;
  }

  const ddmmyyyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
  m = str.match(ddmmyyyy);
  if (m) {
    const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0');
    let year = m[3]; if (year.length === 2) year = '20' + year;
    return `${year}${month}${day}`;
  }

  const yyyymmdd = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/;
  m = str.match(yyyymmdd);
  if (m) {
    return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`;
  }

  return null;
}

// ─── URL Parser ───────────────────────────────────────────────────────────────

export function parseBmsUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const f1 = /in\.bookmyshow\.com\/movies\/([^\/]+)\/([^\/]+)\/buytickets\/(ET[A-Z0-9]+)(?:\/(\d{8}))?/i;
    let m = urlStr.match(f1);
    if (m) return { location: m[1].toLowerCase(), movieName: m[2].toLowerCase(), eventId: m[3].toUpperCase(), urlDate: m[4] || null };

    const f2 = /in\.bookmyshow\.com\/movies\/([^\/]+)\/([^\/]+)\/(ET[A-Z0-9]+)(?:\/(\d{8}))?/i;
    m = urlStr.match(f2);
    if (m) return { location: m[1].toLowerCase(), movieName: m[2].toLowerCase(), eventId: m[3].toUpperCase(), urlDate: m[4] || null };

    return null;
  } catch { return null; }
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

function formatCinemaList(cinemas) {
  if (!cinemas || cinemas.length === 0) return 'Unknown';
  return cinemas.map(c => c.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join('\n  • ');
}

function fmtDate(d) {
  if (!d || d.length !== 8) return d;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

function fmtTime(iso) {
  if (!iso) return 'Never';
  const dt = new Date(iso);
  return dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, dateStyle: 'short', timeStyle: 'short' });
}

function getStatusBadge(status) {
  if (status === 'active') return '🟢 *Active*';
  if (status === 'blocked') return '🔴 *Blocked*';
  if (status === 'triggered') return '✅ *Tickets Found!*';
  return `⚪ ${status}`;
}

function buildTaskCard(check, checker, extraLine = '') {
  const mode = checker.isTurboMode(check) ? '⚡ Turbo (30-60s)' : '🐢 Eco (5-10m)';
  const filters = check.cinemaFilters || (check.cinemaFilter ? [check.cinemaFilter] : []);
  const theaterLine = filters.length > 0
    ? `🏟️ Theaters: \`${filters.join(' + ')}\``
    : `🏟️ Theaters: _All Cinemas_`;
  const lastCheck = check.lastChecked ? fmtTime(check.lastChecked) : '_Never_';

  let card =
    `${getStatusBadge(check.status)} | 🎬 *${check.movieName.toUpperCase()}*\n` +
    `📍 \`${check.location}\` · 📅 \`${fmtDate(check.date)}\` · 🆔 \`${check.eventId}\`\n` +
    `${theaterLine}\n` +
    `⚙️ Speed: ${mode} | 🔄 Checks: ${check.checksCount || 0} | ❌ Waits: ${check.failCount || 0}\n` +
    `🕐 Last Check: ${lastCheck}`;

  if (check.status === 'triggered' && check.triggeredAt) {
    card += `\n🎉 *Detected At:* ${fmtTime(check.triggeredAt)}`;
  }
  if (extraLine) card += `\n${extraLine}`;
  card += `\n🔗 [View on BookMyShow](${check.url})`;
  return card;
}

// ─── Keyboards ───────────────────────────────────────────────────────────────

function getSpeedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: `⚡ Turbo Mode  (30-60s)`, callback_data: `selspeed_turbo` }],
      [{ text: `🐢 Eco Mode    (5-10m)`, callback_data: `selspeed_eco` }],
      [{ text: `🤖 Auto Detect Speed`, callback_data: `selspeed_auto` }]
    ]
  };
}

function getMultiTheaterKeyboard(city, selectedKeywords = []) {
  const cinemas = getCinemasForCity(city);
  const rows = [];
  for (let i = 0; i < cinemas.length; i += 2) {
    const c1 = cinemas[i];
    const sel1 = selectedKeywords.includes(c1.keyword);
    const row = [{ text: `${sel1 ? '✅' : '⬜'} ${c1.name}`, callback_data: `toggletheater_${c1.keyword}` }];
    if (cinemas[i + 1]) {
      const c2 = cinemas[i + 1];
      const sel2 = selectedKeywords.includes(c2.keyword);
      row.push({ text: `${sel2 ? '✅' : '⬜'} ${c2.name}`, callback_data: `toggletheater_${c2.keyword}` });
    }
    rows.push(row);
  }
  const count = selectedKeywords.length;
  rows.push([{ text: count > 0 ? `📥 Confirm (${count} selected)` : `📥 Confirm (All Cinemas)`, callback_data: `donetheater` }]);
  if (cinemas.length > 0) rows.push([{ text: `⏭️ Skip — Monitor ALL Cinemas`, callback_data: `selskiptheater` }]);
  else rows.push([{ text: `⏭️ Monitor ALL Cinemas`, callback_data: `selskiptheater` }]);
  return { inline_keyboard: rows };
}

function getActiveTaskKeyboard(check, checker) {
  const isTurbo = checker.isTurboMode(check);
  return {
    inline_keyboard: [
      [{ text: `🔄 Recheck Now`, callback_data: `btn_recheck_${check.id}` }],
      [
        { text: isTurbo ? `⚡ Turbo (On)` : `⚡ Turbo`, callback_data: `btn_turbo_${check.id}` },
        { text: !isTurbo ? `🐢 Eco (On)` : `🐢 Eco`, callback_data: `btn_eco_${check.id}` }
      ],
      [{ text: `🗑️ Delete Task`, callback_data: `btn_delete_${check.id}` }]
    ]
  };
}

function getTriggeredTaskKeyboard(check) {
  return {
    inline_keyboard: [
      [{ text: `🎟️ Open BookMyShow Now`, url: check.url }],
      [{ text: `🗑️ Clear from History`, callback_data: `btn_delete_${check.id}` }]
    ]
  };
}

function getBlockedTaskKeyboard(check) {
  return {
    inline_keyboard: [
      [{ text: `🔄 Retry Now`, callback_data: `btn_recheck_${check.id}` }],
      [{ text: `🐢 Switch to Eco & Retry`, callback_data: `btn_eco_${check.id}` }],
      [{ text: `🗑️ Delete Task`, callback_data: `btn_delete_${check.id}` }]
    ]
  };
}

// ─── Bot Setup ────────────────────────────────────────────────────────────────

export function setupBot(token, checker) {
  const bot = new Telegraf(token);

  // ─── Ticket Found Alert ───────────────────────────────────────────────────
  checker.onSuccessCallback = (check, matchedCinemas = []) => {
    const cinemasText = matchedCinemas.length > 0 ? `\n  • ${formatCinemaList(matchedCinemas)}` : 'Available Cinemas';
    const filters = check.cinemaFilters || [];
    const filterNote = filters.length > 0 ? `\n🔍 Filter Applied: \`${filters.join(', ')}\`` : '';

    const msg =
      `🚨🎉 *BOOKING OPEN — ACT FAST!* 🎉🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎬 *Movie:* \`${check.movieName.toUpperCase()}\`\n` +
      `📍 *City:* \`${check.location}\`\n` +
      `📅 *Show Date:* \`${fmtDate(check.date)}\`\n` +
      `🆔 *Event ID:* \`${check.eventId}\`${filterNote}\n\n` +
      `🏟️ *Tickets Available At:*${cinemasText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ _Monitoring stopped automatically — booking detected!_\n\n` +
      `🎟️ *Book Your Seats Now:*\n${check.url}`;

    logger.success(`🚨 ALERT SENT to Chat ${check.chatId} — ${check.movieName} on ${check.date}`);

    bot.telegram.sendMessage(check.chatId, msg, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
      reply_markup: { inline_keyboard: [[{ text: `🎟️ Book Now on BookMyShow`, url: check.url }]] }
    }).catch(err => logger.error(`Alert send failed: ${err.message}`));
  };

  // ─── Anti-Bot Block Alert ─────────────────────────────────────────────────
  checker.onBlockCallback = (check) => {
    const msg =
      `⚠️ *ANTI-BOT BLOCK DETECTED* ⚠️\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎬 *Movie:* \`${check.movieName}\`\n` +
      `📍 *City:* \`${check.location}\`\n` +
      `📅 *Date:* \`${fmtDate(check.date)}\`\n\n` +
      `🚫 BookMyShow returned HTTP 403 (Cloudflare Anti-Bot).\n\n` +
      `🛡️ *Action Taken:* Monitoring is *PAUSED* to protect your IP.\n\n` +
      `💡 *What to do:*\n` +
      `  1️⃣ Wait 10-15 minutes\n` +
      `  2️⃣ Tap *"🔄 Retry Now"* below\n` +
      `  3️⃣ Or switch to Eco Mode (less frequent = safer)`;

    logger.warn(`Block alert sent to Chat ${check.chatId} for ${check.movieName}`);

    bot.telegram.sendMessage(check.chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: getBlockedTaskKeyboard(check)
    }).catch(err => logger.error(`Block alert failed: ${err.message}`));
  };

  // ─── /start & /help ───────────────────────────────────────────────────────
  bot.command(['start', 'help'], (ctx) => {
    logger.info(`Chat ${ctx.chat.id} → /start`);
    return ctx.replyWithMarkdown(
      `🎟️ *BookMyShow Ticket Monitor v3.0*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Quickest way:* Just paste a BookMyShow movie URL!\n\n` +
      `📋 *Commands:*\n` +
      `🔹 /add      — Wizard to add a monitoring task\n` +
      `🔹 /list     — All tasks (active + done + blocked)\n` +
      `🔹 /check    — Force instant recheck\n` +
      `🔹 /status   — Live dashboard\n` +
      `🔹 /info     — Bot info & total user count\n` +
      `🔹 /blocked  — Paused tasks & recovery\n` +
      `🔹 /done     — Successfully detected bookings\n` +
      `🔹 /logs     — Live audit log (last 12 events)\n` +
      `🔹 /export   — Export tasks as JSON\n` +
      `🔹 /cancel   — Cancel active wizard\n\n` +
      `🔗 *Supported URL:*\n` +
      `\`https://in.bookmyshow.com/movies/[city]/[movie]/buytickets/[EventID]/[date]\``
    );
  });

  // ─── /add ─────────────────────────────────────────────────────────────────
  bot.command('add', (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, { step: 1, data: { cinemaFilters: [] } });
    logger.info(`Chat ${chatId} → /add wizard started`);
    return ctx.replyWithMarkdown(
      `🧙 *Monitoring Wizard — Step 1 of 5*\n\n` +
      `📍 *City / Location*\n\n` +
      `Reply with the city as it appears in the BookMyShow URL.\n` +
      `_e.g._ \`coimbatore\`, \`chennai\`, \`rajapalayam\`\n\n` +
      `💡 _Tip: Paste a BookMyShow URL to auto-fill all steps!_\n` +
      `_(Type /cancel to abort)_`
    );
  });

  // ─── /cancel ─────────────────────────────────────────────────────────────
  bot.command('cancel', (ctx) => {
    const chatId = ctx.chat.id;
    if (userSessions.has(chatId)) {
      userSessions.delete(chatId);
      logger.info(`Chat ${chatId} cancelled wizard`);
      return ctx.reply('❌ Wizard cancelled.');
    }
    return ctx.reply('No active wizard to cancel.');
  });

  // ─── /list ────────────────────────────────────────────────────────────────
  bot.command('list', async (ctx) => {
    const chatId = ctx.chat.id;
    const checks = store.getByChatId(chatId);
    logger.info(`Chat ${chatId} → /list (${checks.length} tasks)`);

    if (checks.length === 0) {
      return ctx.replyWithMarkdown('📋 *No tasks found.* Paste a BookMyShow URL or use /add!');
    }

    const active = checks.filter(c => c.status === 'active');
    const triggered = checks.filter(c => c.status === 'triggered');
    const blocked = checks.filter(c => c.status === 'blocked');

    await ctx.replyWithMarkdown(
      `📋 *Your Monitoring Tasks*\n` +
      `🟢 Active: ${active.length}  ✅ Done: ${triggered.length}  🔴 Blocked: ${blocked.length}`
    );

    for (const c of active) {
      await ctx.replyWithMarkdown(buildTaskCard(c, checker), {
        disable_web_page_preview: true,
        reply_markup: getActiveTaskKeyboard(c, checker)
      });
    }

    for (const c of triggered) {
      await ctx.replyWithMarkdown(buildTaskCard(c, checker), {
        disable_web_page_preview: true,
        reply_markup: getTriggeredTaskKeyboard(c)
      });
    }

    for (const c of blocked) {
      await ctx.replyWithMarkdown(buildTaskCard(c, checker), {
        disable_web_page_preview: true,
        reply_markup: getBlockedTaskKeyboard(c)
      });
    }
  });

  // ─── /done ────────────────────────────────────────────────────────────────
  bot.command('done', (ctx) => {
    const chatId = ctx.chat.id;
    const triggered = store.getByChatId(chatId).filter(c => c.status === 'triggered');
    logger.info(`Chat ${chatId} → /done (${triggered.length} completed tasks)`);

    if (triggered.length === 0) {
      return ctx.replyWithMarkdown('📭 *No completed detections yet.*\n\nAs soon as booking opens for a monitored movie, it will appear here.');
    }

    ctx.replyWithMarkdown(`✅ *Booking Detected — ${triggered.length} Task(s)*`);

    for (const c of triggered) {
      ctx.replyWithMarkdown(buildTaskCard(c, checker), {
        disable_web_page_preview: true,
        reply_markup: getTriggeredTaskKeyboard(c)
      });
    }
  });

  // ─── /blocked ─────────────────────────────────────────────────────────────
  bot.command('blocked', (ctx) => {
    const chatId = ctx.chat.id;
    const blockedChecks = store.getByChatId(chatId).filter(c => c.status === 'blocked');
    logger.info(`Chat ${chatId} → /blocked (${blockedChecks.length} blocked tasks)`);

    if (blockedChecks.length === 0) {
      return ctx.replyWithMarkdown('🟢 *No blocked tasks.* Everything is running normally!');
    }

    ctx.replyWithMarkdown(
      `🔴 *Blocked Tasks — ${blockedChecks.length}*\n\n` +
      `These were paused due to anti-bot detection.\n` +
      `💡 Wait 10-15 minutes before retrying.`
    );

    for (const c of blockedChecks) {
      ctx.replyWithMarkdown(buildTaskCard(c, checker), {
        disable_web_page_preview: true,
        reply_markup: getBlockedTaskKeyboard(c)
      });
    }
  });

  // ─── /status ─────────────────────────────────────────────────────────────
  bot.command('status', (ctx) => {
    const chatId = ctx.chat.id;
    const checks = store.getByChatId(chatId);
    logger.info(`Chat ${chatId} → /status`);

    if (checks.length === 0) {
      return ctx.replyWithMarkdown('📊 *No tasks found.* Use /add or paste a URL!');
    }

    let active = 0, triggered = 0, blocked = 0, total = 0, fails = 0, turbo = 0, withFilter = 0;
    checks.forEach(c => {
      if (c.status === 'active') active++;
      if (c.status === 'triggered') triggered++;
      if (c.status === 'blocked') blocked++;
      total += c.checksCount || 0;
      fails += c.failCount || 0;
      if (checker.isTurboMode(c)) turbo++;
      const f = c.cinemaFilters || [];
      if (f.length > 0) withFilter++;
    });

    return ctx.replyWithMarkdown(
      `📊 *BMS Monitoring Dashboard*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🟢 *Active:* ${active}  ✅ *Done:* ${triggered}  🔴 *Blocked:* ${blocked}\n` +
      `⚡ *Turbo:* ${turbo}  🐢 *Eco:* ${checks.length - turbo}\n` +
      `🏟️ *Theater Filtered:* ${withFilter}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔄 *Total Checks Run:* ${total}\n` +
      `💤 *Total Waits:* ${fails}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 Use /list to manage | /blocked to unpause | /done to see completed`
    );
  });

  // ─── /info ────────────────────────────────────────────────────────────────
  bot.command('info', (ctx) => {
    logger.info(`Chat ${ctx.chat.id} → /info`);

    const allChecks = store.getAll();
    const uniqueUserIds = new Set(allChecks.map(c => c.chatId));
    const totalUsersCount = uniqueUserIds.size;
    const totalTasksCount = allChecks.length;

    return ctx.replyWithMarkdown(
      `🤖 *CineTicket Bot Information*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 *Total Active Users:* \`${totalUsersCount}\` user(s)\n` +
      `📦 *Total Tasks Monitored:* \`${totalTasksCount}\` task(s)\n\n` +
      `🎟️ *About CineTicket:*\n` +
      `Real-time BookMyShow ticket availability monitor & instant Telegram alert bot. Never miss movie tickets!\n\n` +
      `✨ *Key Features:*\n` +
      `• 🔗 *Instant URL Recognition:* Paste any BookMyShow link\n` +
      `• 📅 *Date-Matched Detection:* Monitors exact show dates accurately\n` +
      `• 🏟️ *Multi-Theater Filter:* Choose specific theaters (PVR, INOX, Broadway)\n` +
      `• ⚡ *Turbo & Eco Modes:* Adaptive background check speed\n` +
      `• 🚨 *Instant Push Alerts:* Direct booking link sent to chat\n\n` +
      `🔒 *Privacy Policy:*\n` +
      `1. *Information We Collect:* Only stores your Telegram Chat ID and requested movie parameters.\n` +
      `2. *How We Use Data:* Strictly used to check BookMyShow ticket availability.\n` +
      `3. *Data Storage & Security:* No passwords, identities, or payment details stored.\n` +
      `4. *Control & Deletion:* Delete your tasks anytime using /del or the Delete button.`
    );
  });

  // ─── /check ───────────────────────────────────────────────────────────────
  bot.command('check', async (ctx) => {
    const chatId = ctx.chat.id;
    const parts = ctx.message.text.trim().split(/\s+/);
    const checks = store.getByChatId(chatId);

    if (checks.length === 0) {
      return ctx.replyWithMarkdown('📋 *No tasks found.* Paste a BookMyShow URL or use /add!');
    }

    let targets = checks;
    if (parts.length >= 2) {
      const idx = parseInt(parts[1], 10);
      if (!isNaN(idx) && idx >= 1 && idx <= checks.length) targets = [checks[idx - 1]];
      else return ctx.reply(`⚠️ Invalid index. Usage: /check 1  or just /check`);
    }

    logger.info(`Chat ${chatId} → /check (${targets.length} tasks)`);
    const msg = await ctx.replyWithMarkdown(`⏳ *Checking ${targets.length} task(s)...*`).catch(() => {});
    const lines = [`⚡ *Instant Check Results*\n`];

    for (const c of targets) {
      try {
        const res = await checker.performCheck(c.id, true);
        const icon = res?.success ? '🎉 OPEN!' : '💤 Not Open';
        const detail = String(res?.message || res?.reason || '').replace(/[_*`[\]()]/g, '');
        const cinemas = res?.matchedCinemas?.length > 0 ? `\n   🏟️ At: ${formatCinemaList(res.matchedCinemas)}` : '';
        const f = c.cinemaFilters || [];
        const filterNote = f.length > 0 ? `\n   🔍 Filters: \`${f.join(', ')}\`` : '';
        lines.push(`🎬 *${c.movieName.toUpperCase()}* (${c.location}) — ${fmtDate(c.date)}\n📊 ${icon} — ${detail}${filterNote}${cinemas}\n`);
      } catch (err) {
        lines.push(`🎬 *${c.movieName}* — ⚠️ Error: ${err.message}\n`);
      }
    }

    lines.push(`💡 _Timers reset. Monitoring continues automatically._`);
    try {
      await ctx.telegram.editMessageText(chatId, msg.message_id, null, lines.join('\n'), { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(lines.join('\n').replace(/[*`_]/g, ''));
    }
  });

  // ─── /del ─────────────────────────────────────────────────────────────────
  bot.command('del', (ctx) => {
    const chatId = ctx.chat.id;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) return ctx.replyWithMarkdown('⚠️ Usage: `/del 1` — see /list for index numbers.');
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx)) return ctx.reply('⚠️ Invalid number.');
    const deleted = store.deleteCheckByIndex(chatId, idx);
    if (!deleted) return ctx.reply('❌ Task not found. Check /list.');
    checker.stopCheck(deleted.id);
    logger.info(`Chat ${chatId} deleted task #${idx} (${deleted.movieName})`);
    return ctx.replyWithMarkdown(`🗑️ Deleted task #${idx} — *${deleted.movieName}* (${deleted.location})`);
  });

  // ─── /logs ────────────────────────────────────────────────────────────────
  bot.command('logs', (ctx) => {
    logger.info(`Chat ${ctx.chat.id} → /logs`);
    const logPath = path.join(__dirname, '../../logs/checker.log');
    try {
      if (!fs.existsSync(logPath)) return ctx.replyWithMarkdown('📝 *No log file yet.* Events will appear here once checking starts.');
      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
      const last = lines.slice(-12).join('\n');
      return ctx.replyWithMarkdown(`📝 *Live Audit Log (Last 12 Events)*\n\`\`\`\n${last}\n\`\`\``);
    } catch (err) {
      return ctx.reply(`⚠️ Failed to read logs: ${err.message}`);
    }
  });

  // ─── /export ──────────────────────────────────────────────────────────────
  bot.command('export', (ctx) => {
    const chatId = ctx.chat.id;
    const checks = store.getByChatId(chatId);
    logger.info(`Chat ${chatId} → /export`);
    if (checks.length === 0) return ctx.replyWithMarkdown('📋 *No tasks to export.*');
    return ctx.replyWithMarkdown(`📦 *Tasks Export*\n\`\`\`json\n${JSON.stringify(checks, null, 2)}\n\`\`\``);
  });

  // ─── Speed Selection → Creates Task ──────────────────────────────────────
  bot.action(/^selspeed_(turbo|eco|auto)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const speedMode = ctx.match[1];
    ctx.answerCbQuery(`Speed set: ${speedMode.toUpperCase()}`).catch(() => {});

    const session = userSessions.get(chatId);
    if (!session?.data?.movieName || !session?.data?.date) {
      return ctx.reply('⚠️ Session expired. Paste a URL or use /add again.');
    }

    session.data.chatId = chatId;
    session.data.speedOverride = speedMode === 'auto' ? null : speedMode;

    const newCheck = store.addCheck(session.data);
    userSessions.delete(chatId);
    checker.scheduleNextCheck(newCheck.id, 1500);

    const mode = checker.isTurboMode(newCheck) ? '⚡ Turbo (30-60s)' : '🐢 Eco (5-10m)';
    const filters = newCheck.cinemaFilters || [];
    const theaterLine = filters.length > 0 ? `🏟️ Theaters: \`${filters.join(' + ')}\`` : `🏟️ Theaters: _All Cinemas_`;

    logger.info(`Chat ${chatId} created task: ${newCheck.movieName} | ${newCheck.location} | ${newCheck.date} | [${filters.join(', ')}]`);

    const text =
      `✅ *Monitoring Task Created!*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎬 *Movie:* \`${newCheck.movieName.toUpperCase()}\`\n` +
      `📍 *City:* \`${newCheck.location}\`\n` +
      `📅 *Date:* \`${fmtDate(newCheck.date)}\`\n` +
      `${theaterLine}\n` +
      `⚙️ *Speed:* ${mode}\n\n` +
      `🔗 *Monitoring URL:*\n${newCheck.url}\n\n` +
      `💡 _First check running in ~1s..._`;

    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: getActiveTaskKeyboard(newCheck, checker) });
    } catch {
      await ctx.replyWithMarkdown(text, { disable_web_page_preview: true, reply_markup: getActiveTaskKeyboard(newCheck, checker) });
    }
  });

  // ─── Multi-Theater Toggle ─────────────────────────────────────────────────
  bot.action(/^toggletheater_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const keyword = ctx.match[1];
    const session = userSessions.get(chatId);
    if (!session) return ctx.reply('⚠️ Session expired.');

    if (!Array.isArray(session.data.cinemaFilters)) session.data.cinemaFilters = [];
    const idx = session.data.cinemaFilters.indexOf(keyword);
    if (idx !== -1) {
      session.data.cinemaFilters.splice(idx, 1);
      ctx.answerCbQuery(`❌ Deselected`).catch(() => {});
    } else {
      session.data.cinemaFilters.push(keyword);
      ctx.answerCbQuery(`✅ Selected`).catch(() => {});
    }

    const selected = session.data.cinemaFilters;
    logger.info(`Chat ${chatId} toggled theater '${keyword}' → [${selected.join(', ')}]`);

    const note = selected.length > 0
      ? `✅ Selected (${selected.length}): \`${selected.join(', ')}\``
      : `_Nothing selected — will monitor all cinemas_`;

    try {
      await ctx.editMessageText(
        `🏟️ *Select Theater(s) — Step 5 of 5*\n\n${note}`,
        { parse_mode: 'Markdown', reply_markup: getMultiTheaterKeyboard(session.data.location || '', selected) }
      );
    } catch { /* unchanged message */ }
  });

  // ─── Confirm Theater Selection ────────────────────────────────────────────
  bot.action('donetheater', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    if (!session) return ctx.reply('⚠️ Session expired.');

    session.step = 6;
    const selected = session.data.cinemaFilters || [];
    ctx.answerCbQuery(`Confirmed ${selected.length} theater(s)`).catch(() => {});
    logger.info(`Chat ${chatId} confirmed theaters: [${selected.join(', ')}]`);

    const note = selected.length > 0
      ? `🏟️ Theaters: \`${selected.join(' + ')}\``
      : `🏟️ Theaters: _All Cinemas_`;

    try {
      await ctx.editMessageText(`✅ ${note}\n\n⚙️ *Choose Monitoring Speed:*`, { parse_mode: 'Markdown', reply_markup: getSpeedKeyboard() });
    } catch {
      await ctx.replyWithMarkdown(`✅ ${note}\n\n⚙️ *Choose Monitoring Speed:*`, { reply_markup: getSpeedKeyboard() });
    }
  });

  // ─── Skip Theater ─────────────────────────────────────────────────────────
  bot.action('selskiptheater', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    if (!session) return ctx.reply('⚠️ Session expired.');

    session.data.cinemaFilters = [];
    session.step = 6;
    ctx.answerCbQuery('All cinemas selected').catch(() => {});
    logger.info(`Chat ${chatId} skipped theater filter`);

    try {
      await ctx.editMessageText(`✅ 🏟️ Theaters: _All Cinemas_\n\n⚙️ *Choose Monitoring Speed:*`, { parse_mode: 'Markdown', reply_markup: getSpeedKeyboard() });
    } catch {
      await ctx.replyWithMarkdown(`✅ 🏟️ Theaters: _All Cinemas_\n\n⚙️ *Choose Monitoring Speed:*`, { reply_markup: getSpeedKeyboard() });
    }
  });

  // ─── Recheck ─────────────────────────────────────────────────────────────
  bot.action(/^btn_recheck_(.+)$/, async (ctx) => {
    const checkId = ctx.match[1];
    ctx.answerCbQuery('🔄 Checking now...').catch(() => {});
    const check = store.getAll().find(c => c.id === checkId);
    if (!check) return ctx.reply('❌ Task not found.');
    logger.info(`Chat ${ctx.chat.id} force-rechecked task ${checkId} (${check.movieName})`);
    const res = await checker.performCheck(checkId, true);
    const icon = res?.success ? '🎉 OPEN!' : '💤 Not Open';
    const detail = String(res?.message || res?.reason || '').replace(/[_*`[\]()]/g, '');
    const updated = store.getAll().find(c => c.id === checkId) || check;
    const kb = updated.status === 'triggered' ? getTriggeredTaskKeyboard(updated)
      : updated.status === 'blocked' ? getBlockedTaskKeyboard(updated)
      : getActiveTaskKeyboard(updated, checker);
    return ctx.editMessageText(
      buildTaskCard(updated, checker, `⚡ *Recheck:* ${icon} — ${detail}`),
      { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: kb }
    ).catch(() => {});
  });

  // ─── Turbo ───────────────────────────────────────────────────────────────
  bot.action(/^btn_turbo_(.+)$/, (ctx) => {
    const checkId = ctx.match[1];
    let check = store.getAll().find(c => c.id === checkId);
    if (!check) return ctx.answerCbQuery('❌ Not found').catch(() => {});

    check = store.updateCheckStatus(checkId, { speedOverride: 'turbo' });
    ctx.answerCbQuery('⚡ Switched to Turbo!').catch(() => {});
    logger.info(`Task ${checkId} switched to Turbo mode`);

    if (check.status === 'active') {
      checker.scheduleNextCheck(checkId, 1000);
    }

    const kb = check.status === 'triggered' ? getTriggeredTaskKeyboard(check)
      : check.status === 'blocked' ? getBlockedTaskKeyboard(check)
      : getActiveTaskKeyboard(check, checker);

    return ctx.editMessageText(buildTaskCard(check, checker), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb
    }).catch(() => {});
  });

  // ─── Eco ─────────────────────────────────────────────────────────────────
  bot.action(/^btn_eco_(.+)$/, (ctx) => {
    const checkId = ctx.match[1];
    let check = store.getAll().find(c => c.id === checkId);
    if (!check) return ctx.answerCbQuery('❌ Not found').catch(() => {});

    check = store.updateCheckStatus(checkId, { speedOverride: 'eco' });
    ctx.answerCbQuery('🐢 Switched to Eco!').catch(() => {});
    logger.info(`Task ${checkId} switched to Eco mode`);

    if (check.status === 'active') {
      checker.scheduleNextCheck(checkId);
    }

    const kb = check.status === 'triggered' ? getTriggeredTaskKeyboard(check)
      : check.status === 'blocked' ? getBlockedTaskKeyboard(check)
      : getActiveTaskKeyboard(check, checker);

    return ctx.editMessageText(buildTaskCard(check, checker), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb
    }).catch(() => {});
  });

  // ─── Delete ───────────────────────────────────────────────────────────────
  bot.action(/^btn_delete_(.+)$/, (ctx) => {
    const checkId = ctx.match[1];
    const check = store.getAll().find(c => c.id === checkId);
    if (!check) return ctx.answerCbQuery('❌ Already deleted').catch(() => {});
    store.checks = store.checks.filter(c => c.id !== checkId);
    store.save();
    checker.stopCheck(checkId);
    ctx.answerCbQuery('🗑️ Deleted').catch(() => {});
    logger.info(`Task ${checkId} (${check.movieName}) deleted`);
    return ctx.editMessageText(`🗑️ *Deleted:* \`${check.movieName}\` (${check.location}) — ${fmtDate(check.date)}`, { parse_mode: 'Markdown' }).catch(() => {});
  });

  // ─── Text Handler (URL Paste + Wizard) ───────────────────────────────────
  bot.on('text', (ctx, next) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith('/')) return next();

    // URL paste detection
    const parsed = parseBmsUrl(text);
    if (parsed) {
      logger.info(`Chat ${chatId} pasted URL → ${parsed.movieName} | ${parsed.location} | ${parsed.eventId}`);
      userSessions.set(chatId, {
        step: 4,
        data: { location: parsed.location, movieName: parsed.movieName, eventId: parsed.eventId, date: null, cinemaFilters: [] }
      });
      return ctx.replyWithMarkdown(
        `🔗 *BookMyShow Link Detected!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📍 City: \`${parsed.location}\`\n` +
        `🎬 Movie: \`${parsed.movieName}\`\n` +
        `🆔 Event ID: \`${parsed.eventId}\`\n\n` +
        `📅 *Which date do you want to monitor?*\n\n` +
        `Reply with:\n` +
        `• \`25 jul 2026\` or \`25 july 2026\`\n` +
        `• \`25/07/2026\` or \`20260725\`\n\n` +
        `_(Type /cancel to abort)_`
      );
    }

    // Wizard steps
    const session = userSessions.get(chatId);
    if (!session) return next();

    switch (session.step) {
      case 1:
        session.data.location = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        session.step = 2;
        return ctx.replyWithMarkdown(
          `✅ City: \`${session.data.location}\`\n\n` +
          `🧙 *Step 2 of 5: Movie Slug*\n\n` +
          `Reply with the movie name as it appears in the BookMyShow URL.\n` +
          `_e.g._ \`coolie\`, \`stree-2\`, \`the-odyssey\``
        );

      case 2:
        session.data.movieName = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        session.step = 3;
        return ctx.replyWithMarkdown(
          `✅ Movie: \`${session.data.movieName}\`\n\n` +
          `🧙 *Step 3 of 5: Event ID*\n\n` +
          `Reply with the Event ID from the BookMyShow URL.\n` +
          `_e.g._ \`ET00480917\`, \`ET00430817\``
        );

      case 3:
        session.data.eventId = text.toUpperCase().trim();
        session.step = 4;
        return ctx.replyWithMarkdown(
          `✅ Event ID: \`${session.data.eventId}\`\n\n` +
          `🧙 *Step 4 of 5: Target Date*\n\n` +
          `Reply with the show date:\n` +
          `• \`25 jul 2026\`  or  \`25 july 2026\`\n` +
          `• \`25/07/2026\`  or  \`20260725\``
        );

      case 4: {
        const parsedDate = parseFlexibleDate(text);
        if (!parsedDate) {
          return ctx.replyWithMarkdown(`⚠️ *Invalid date format.*\nTry: \`25 jul 2026\` or \`20260725\``);
        }
        session.data.date = parsedDate;
        session.step = 5;
        if (!Array.isArray(session.data.cinemaFilters)) session.data.cinemaFilters = [];
        const city = session.data.location || '';
        const hasCinemas = getCinemasForCity(city).length > 0;
        const hint = hasCinemas ? `Tap a cinema button below, or Skip for all:` : `Type a partial name (e.g. \`pvr\`, \`inox\`) or Skip:`;
        return ctx.replyWithMarkdown(
          `✅ Date: \`${fmtDate(parsedDate)}\`\n\n` +
          `🧙 *Step 5 of 5: Theater Filter (Optional)*\n\n` +
          `${hint}`,
          { reply_markup: getMultiTheaterKeyboard(city, session.data.cinemaFilters) }
        );
      }

      case 5: {
        const typed = text.toLowerCase().trim();
        if (!Array.isArray(session.data.cinemaFilters)) session.data.cinemaFilters = [];
        if (typed && !session.data.cinemaFilters.includes(typed)) session.data.cinemaFilters.push(typed);
        session.step = 6;
        const note = session.data.cinemaFilters.length > 0
          ? `🏟️ Theaters: \`${session.data.cinemaFilters.join(', ')}\``
          : `🏟️ Theaters: _All Cinemas_`;
        return ctx.replyWithMarkdown(`✅ ${note}\n\n⚙️ *Choose Monitoring Speed:*`, { reply_markup: getSpeedKeyboard() });
      }

      default:
        userSessions.delete(chatId);
        return ctx.reply('Something went wrong. Paste a URL or use /add.');
    }
  });

  return bot;
}
