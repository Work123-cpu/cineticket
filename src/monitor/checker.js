import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { store } from '../storage/store.js';
import { logger } from '../utils/logger.js';

// Apply Stealth Plugin to bypass anti-bot WAF flags
puppeteer.use(StealthPlugin());

export class TicketChecker {
  constructor(onSuccessCallback, onBlockCallback) {
    this.onSuccessCallback = onSuccessCallback;
    this.onBlockCallback = onBlockCallback;
    this.activeTimers = new Map();
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser || !this.browser.connected) {
      logger.info('Launching Puppeteer Chrome (Stealth Mode)...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        ]
      });
      logger.info('Browser ready.');
    }
    return this.browser;
  }

  startAll() {
    const checks = store.getAll().filter(c => c.status === 'active');
    logger.info(`Starting checker for ${checks.length} active monitoring task(s)...`);
    checks.forEach(check => this.scheduleNextCheck(check.id, 1000));
  }

  stopCheck(checkId) {
    if (this.activeTimers.has(checkId)) {
      clearTimeout(this.activeTimers.get(checkId));
      this.activeTimers.delete(checkId);
    }
  }

  isTurboMode(checkOrDateStr) {
    if (typeof checkOrDateStr === 'object' && checkOrDateStr !== null) {
      if (checkOrDateStr.speedOverride === 'turbo') return true;
      if (checkOrDateStr.speedOverride === 'eco') return false;
      return this.isTurboMode(checkOrDateStr.date);
    }
    try {
      const targetDateStr = String(checkOrDateStr);
      const year = parseInt(targetDateStr.substring(0, 4), 10);
      const month = parseInt(targetDateStr.substring(4, 6), 10) - 1;
      const day = parseInt(targetDateStr.substring(6, 8), 10);
      const targetDate = new Date(year, month, day);
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours <= 48;
    } catch {
      return false;
    }
  }

  getNextIntervalMs(checkOrDateStr) {
    const turbo = this.isTurboMode(checkOrDateStr);
    if (turbo) {
      const baseSec = 30;
      const jitterSec = Math.random() * 30;
      return Math.floor((baseSec + jitterSec) * 1000);
    } else {
      const baseSec = 300;
      const jitterSec = Math.random() * 300;
      return Math.floor((baseSec + jitterSec) * 1000);
    }
  }

  scheduleNextCheck(checkId, customDelayMs = null) {
    this.stopCheck(checkId);
    const check = store.getAll().find(c => c.id === checkId);
    if (!check || check.status !== 'active') return; // NEVER schedule if blocked or triggered
    const delay = customDelayMs !== null ? customDelayMs : this.getNextIntervalMs(check);
    logger.debug(`Next check for [${check.movieName}] in ${Math.round(delay / 1000)}s`);
    const timer = setTimeout(() => {
      this.performCheck(checkId);
    }, delay);
    this.activeTimers.set(checkId, timer);
  }

  async performCheck(checkId, force = false) {
    const check = store.getAll().find(c => c.id === checkId);
    if (!check) return { success: false, reason: 'Check not found' };

    // Strict Status Check: If blocked or triggered and NOT forced, STOP!
    if (!force && check.status !== 'active') {
      this.stopCheck(checkId);
      return { success: false, reason: `Check status is ${check.status}` };
    }

    // Unblock if forced by user action
    if (force && check.status === 'blocked') {
      store.updateCheckStatus(checkId, { status: 'active', lastError: null });
    }
    if (force && check.status === 'triggered') {
      store.updateCheckStatus(checkId, { status: 'active', lastError: null });
    }

    const currentChecksCount = (check.checksCount || 0) + 1;
    let currentFailCount = check.failCount || 0;

    const filters = check.cinemaFilters || (check.cinemaFilter ? [check.cinemaFilter] : []);
    const filterLabel = filters.length > 0 ? ` [Theaters: ${filters.join(', ')}]` : ' [All Cinemas]';

    logger.info(`⏳ [CHECK #${currentChecksCount}] ${check.movieName} | ${check.location} | ${check.date}${filterLabel}`);

    let page = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      });

      // Override navigator.webdriver
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      let targetUrl = check.url;
      let response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      let statusCode = response ? response.status() : 0;
      let html = await page.content();

      // Fallback URL strategy if primary gets 403
      if (statusCode === 403 || html.includes('Access Denied') || html.includes('cf-browser-verification')) {
        const altCityCode = check.location.substring(0, 4);
        const fallbackUrl = `https://in.bookmyshow.com/buytickets/${check.movieName}-${check.location}/movie-${altCityCode}-${check.eventId}-MT/${check.date}`;
        logger.warn(`Primary URL got 403. Trying fallback URL: ${fallbackUrl}`);

        try {
          response = await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          statusCode = response ? response.status() : 0;
          html = await page.content();
        } catch {
          // If fallback fails, keep primary status
        }
      }

      // ── Anti-bot block detection ──────────────────────────────────────────
      if (statusCode === 403 || html.includes('Access Denied') || html.includes('cf-browser-verification')) {
        logger.warn(`🚫 [BLOCKED] Anti-bot 403 for ${check.movieName} | URL: ${check.url}`);

        // HARD STOP: Stop any timers and set status to blocked
        this.stopCheck(checkId);

        store.updateCheckStatus(checkId, {
          status: 'blocked',
          checksCount: currentChecksCount,
          lastChecked: new Date().toISOString(),
          lastError: '403 Forbidden / Cloudflare Anti-Bot triggered'
        });

        await page.close();

        // Send alert to Telegram user with recovery buttons
        if (this.onBlockCallback) this.onBlockCallback(check);
        return { success: false, reason: '403 Anti-bot block' };
      }

      // ── Showtime detection ────────────────────────────────────────────────
      let result = { found: false, matchedCinemas: [] };
      if (statusCode === 200) {
        result = this.detectShowtimes(html, check.date, check.showtimeId, filters);
      }

      if (result.found) {
        // 🎉 TICKETS FOUND — HARD STOP: stop monitoring, mark triggered
        const cinemaDisplay = result.matchedCinemas.length > 0
          ? result.matchedCinemas.map(c => this.formatCinemaName(c)).join(', ')
          : 'Available Cinemas';

        logger.success(`🎉 [TICKETS OPEN!] ${check.movieName} on ${check.date} at: ${cinemaDisplay}`);

        // HARD STOP: Stop timer completely
        this.stopCheck(checkId);

        store.updateCheckStatus(checkId, {
          status: 'triggered',
          checksCount: currentChecksCount,
          triggeredAt: new Date().toISOString(),
          lastChecked: new Date().toISOString(),
          lastError: null
        });

        logger.info(`✅ Monitoring STOPPED for task ${checkId} (${check.movieName}) — tickets found.`);

        if (this.onSuccessCallback) {
          this.onSuccessCallback(check, result.matchedCinemas);
        }
        await page.close();
        return { success: true, message: 'Tickets available!', matchedCinemas: result.matchedCinemas };
      } else {
        const filterNote = filters.length > 0 ? ` (filters: ${filters.join(', ')})` : '';
        logger.info(`💤 [WAITING] ${check.movieName} (${check.date})${filterNote} — not open yet. Checks: ${currentChecksCount}`);
        currentFailCount += 1;
        store.updateCheckStatus(checkId, {
          checksCount: currentChecksCount,
          failCount: currentFailCount,
          lastChecked: new Date().toISOString(),
          lastError: 'Bookings not open yet'
        });
        await page.close();

        // Only schedule next check if task is still active
        const freshCheck = store.getAll().find(c => c.id === checkId);
        if (freshCheck && freshCheck.status === 'active') {
          this.scheduleNextCheck(checkId);
        }
        return { success: false, message: 'Bookings not open yet' };
      }

    } catch (error) {
      logger.error(`❌ [ERROR] Check failed for ${check.movieName}: ${error.message}`);
      if (page) await page.close().catch(() => {});
      currentFailCount += 1;
      store.updateCheckStatus(checkId, {
        checksCount: currentChecksCount,
        failCount: currentFailCount,
        lastChecked: new Date().toISOString(),
        lastError: error.message
      });
      const freshCheck = store.getAll().find(c => c.id === checkId);
      if (freshCheck && freshCheck.status === 'active') {
        this.scheduleNextCheck(checkId);
      }
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  // Format cinema slug to display name
  formatCinemaName(slug) {
    if (!slug) return 'Unknown';
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Detects if showtimes are available for the given date and optional cinema filters.
  // Returns: { found: boolean, matchedCinemas: string[] }
  detectShowtimes(html, checkDate, filterShowtimeId, cinemaFilters = []) {
    if (!html || typeof html !== 'string') return { found: false, matchedCinemas: [] };

    const $ = cheerio.load(html);

    if (
      html.includes('Page Not Found') ||
      html.includes('404 Not Found') ||
      html.includes('Oops! Page not found')
    ) {
      return { found: false, matchedCinemas: [] };
    }

    const matchedCinemas = [];
    const filters = Array.isArray(cinemaFilters)
      ? cinemaFilters.map(f => f.toLowerCase().trim()).filter(Boolean)
      : [];

    $('a[href*="/buytickets/"]').each((i, el) => {
      const href = $(el).attr('href') || '';

      // Skip movie breadcrumb links
      if (href.includes('/movies/')) return;

      // Must contain target date
      if (checkDate && !href.includes(checkDate)) return;

      // If cinema filters specified, match ANY of them
      if (filters.length > 0) {
        const hrefLower = href.toLowerCase();
        const matchesAnyFilter = filters.some(filterStr => {
          const words = filterStr.split(/\s+/);
          return words.every(word => hrefLower.includes(word));
        });
        if (!matchesAnyFilter) return;
      }

      // Extract cinema slug
      const cinemaMatch = href.match(/\/cinemas\/[^\/]+\/([^\/]+)\/buytickets/);
      const cinemaSlug = cinemaMatch ? cinemaMatch[1] : 'unknown';

      if (!matchedCinemas.includes(cinemaSlug)) {
        matchedCinemas.push(cinemaSlug);
      }
    });

    return { found: matchedCinemas.length > 0, matchedCinemas };
  }
}
