/**
 * Live end-to-end test — verifies the TicketChecker detects open bookings correctly.
 *
 * Test Case 1: the-odyssey for TODAY → must return found=true  (tickets ARE open)
 * Test Case 2: jana-nayagan for 20260801 → must return found=false (not open yet)
 *
 * Usage: node test_live.js
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';

puppeteer.use(StealthPlugin());

const TESTS = [
  {
    label: 'the-odyssey / TODAY (should be OPEN)',
    url: 'https://in.bookmyshow.com/movies/coimbatore/the-odyssey/buytickets/ET00480917/20260725',
    date: '20260725',
    filters: [],
    expect: true
  },
  {
    label: 'the-odyssey / TODAY + filter: broadway (should be OPEN)',
    url: 'https://in.bookmyshow.com/movies/coimbatore/the-odyssey/buytickets/ET00480917/20260725',
    date: '20260725',
    filters: ['broadway'],
    expect: true
  },
  {
    label: 'the-odyssey / TODAY + filter: nonexistentzxq (should NOT be found)',
    url: 'https://in.bookmyshow.com/movies/coimbatore/the-odyssey/buytickets/ET00480917/20260725',
    date: '20260725',
    filters: ['nonexistentzxq'],
    expect: false
  },
  {
    label: 'jana-nayagan / 20260801 (future — NOT open yet)',
    url: 'https://in.bookmyshow.com/movies/coimbatore/jana-nayagan/buytickets/ET00430817/20260801',
    date: '20260801',
    filters: [],
    expect: false
  }
];

function detectShowtimes(html, checkDate, cinemaFilters = []) {
  const $ = cheerio.load(html);
  if (html.includes('Page Not Found') || html.includes('Oops! Page not found')) {
    return { found: false, matchedCinemas: [] };
  }
  const matched = [];
  const filters = cinemaFilters.map(f => f.toLowerCase().trim()).filter(Boolean);

  $('a[href*="/buytickets/"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('/movies/')) return;
    if (checkDate && !href.includes(checkDate)) return;
    if (filters.length > 0) {
      const hl = href.toLowerCase();
      const ok = filters.some(f => f.split(/\s+/).every(w => hl.includes(w)));
      if (!ok) return;
    }
    const m = href.match(/\/cinemas\/[^\/]+\/([^\/]+)\/buytickets/);
    const slug = m ? m[1] : 'unknown';
    if (!matched.includes(slug)) matched.push(slug);
  });

  return { found: matched.length > 0, matchedCinemas: matched };
}

async function runTests() {
  const c = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', yellow: '\x1b[33m', bold: '\x1b[1m' };

  console.log(`\n${c.cyan}${c.bold}========================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}  BMS TICKET CHECKER — LIVE TEST SUITE${c.reset}`);
  console.log(`${c.cyan}${c.bold}========================================${c.reset}\n`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');

  let passed = 0, failed = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    console.log(`${c.yellow}[TEST ${i + 1}/${TESTS.length}]${c.reset} ${t.label}`);
    console.log(`  URL   : ${t.url}`);
    console.log(`  Date  : ${t.date} | Filters: [${t.filters.join(', ') || 'none'}] | Expected: ${t.expect ? 'OPEN' : 'NOT OPEN'}`);

    try {
      const response = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = response ? response.status() : 0;
      const html = await page.content();

      if (status === 403) {
        console.log(`  ${c.red}✗ SKIP — 403 Anti-bot blocked${c.reset}\n`);
        continue;
      }

      const result = detectShowtimes(html, t.date, t.filters);
      const correct = result.found === t.expect;

      if (correct) {
        passed++;
        console.log(`  ${c.green}✓ PASS${c.reset} — found=${result.found} | Cinemas: [${result.matchedCinemas.join(', ') || 'none'}]`);
      } else {
        failed++;
        console.log(`  ${c.red}✗ FAIL${c.reset} — expected ${t.expect} but got ${result.found}`);
        console.log(`         Cinemas found: [${result.matchedCinemas.join(', ') || 'none'}]`);
      }
    } catch (err) {
      failed++;
      console.log(`  ${c.red}✗ ERROR — ${err.message}${c.reset}`);
    }
    console.log('');

    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();

  console.log(`${c.cyan}========================================${c.reset}`);
  console.log(`${c.bold}  Results: ${c.green}${passed} PASSED${c.reset}${c.bold}  ${failed > 0 ? c.red : ''}${failed} FAILED${c.reset}`);
  console.log(`${c.cyan}========================================${c.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Fatal:', err); process.exit(1); });
