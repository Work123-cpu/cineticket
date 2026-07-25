import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'checks.json');

class Store {
  constructor() {
    this.checks = [];
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.checks = JSON.parse(raw);
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Failed to initialize store:', err);
      this.checks = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.checks, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save store:', err);
    }
  }

  getAll() {
    return this.checks;
  }

  getByChatId(chatId) {
    return this.checks.filter(c => c.chatId === chatId);
  }

  addCheck(checkData) {
    const location = checkData.location.toLowerCase().trim().replace(/\s+/g, '-');
    const movieName = checkData.movieName.toLowerCase().trim().replace(/\s+/g, '-');
    const eventId = checkData.eventId.trim().toUpperCase();
    const date = checkData.date.trim();

    // Ensure cinemaFilters is an array of lowercase strings
    let filters = [];
    if (Array.isArray(checkData.cinemaFilters)) {
      filters = checkData.cinemaFilters.map(f => String(f).toLowerCase().trim()).filter(Boolean);
    } else if (checkData.cinemaFilter) {
      filters = [String(checkData.cinemaFilter).toLowerCase().trim()];
    }

    const newCheck = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      chatId: checkData.chatId,
      location,
      movieName,
      eventId,
      date,
      showtimeId: checkData.showtimeId ? checkData.showtimeId.trim() : null,
      cinemaFilters: filters,
      url: `https://in.bookmyshow.com/movies/${location}/${movieName}/buytickets/${eventId}/${date}`,
      addedAt: new Date().toISOString(),
      checksCount: 0,
      failCount: 0,
      status: 'active',
      speedOverride: null,
      lastChecked: null,
      lastError: null
    };

    this.checks.push(newCheck);
    this.save();
    return newCheck;
  }

  deleteCheckByIndex(chatId, indexOneBased) {
    const userChecks = this.getByChatId(chatId);
    if (indexOneBased < 1 || indexOneBased > userChecks.length) {
      return null;
    }
    const targetCheck = userChecks[indexOneBased - 1];
    this.checks = this.checks.filter(c => c.id !== targetCheck.id);
    this.save();
    return targetCheck;
  }

  updateCheckStatus(id, updates) {
    const check = this.checks.find(c => c.id === id);
    if (check) {
      Object.assign(check, updates);
      this.save();
    }
    return check;
  }
}

export const store = new Store();
