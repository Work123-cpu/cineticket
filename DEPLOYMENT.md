# 🚀 How to Run BMS Ticket Monitor 24/7 in the Cloud (Without PC)

To run this bot 24/7 so it monitors BookMyShow and sends Telegram alerts even when your computer is turned off, you need to host it on a **Cloud Server (VPS)** or a **Node.js Cloud Service**.

---

## 🌟 Option 1: Free Forever VPS (Oracle Cloud Free Tier) ⭐ RECOMMENDED
Oracle Cloud offers a 100% **Free Forever VPS** (Ampere ARM / AMD) with up to 4 CPUs and 24 GB RAM.

### Step-by-Step Setup:

#### Step 1: Create Oracle Cloud Free Account
1. Go to [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) and sign up.
2. Create an **Ubuntu 22.04 LTS** virtual machine instance.

#### Step 2: Connect to your Server
Open your terminal (PowerShell / Command Prompt) and SSH into your server:
```bash
ssh ubuntu@YOUR_SERVER_IP
```

#### Step 3: Install Node.js & Chrome Dependencies for Puppeteer
Run these commands on your server:
```bash
# Update Ubuntu packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# Install Chromium dependencies required for Puppeteer Stealth
sudo apt install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
libatk1.0-0 libc6 libcairo2 libcup2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 \
libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libss3 libxtst6 \
lsb-release wget x11-utils
```

#### Step 4: Clone / Copy your Project & Install PM2
```bash
# Clone your repository or upload your BMSAnti folder
git clone <your-github-repo-url> bms-bot
cd bms-bot

# Install npm dependencies
npm install

# Install PM2 Process Manager (keeps bot running 24/7)
sudo npm install -g pm2
```

#### Step 5: Configure `.env` & Start 24/7 Monitoring
Create your `.env` file on the server:
```bash
nano .env
```
Paste your Telegram bot token:
```env
BOT_TOKEN=8420619576:AAH7cvAEd23RtegodUhGDP8_UyyYbjE9Zmg
```
Save with `Ctrl + O`, `Enter`, and exit with `Ctrl + X`.

#### Step 6: Start Bot with PM2 (Auto-Restart on Crash/Reboot)
```bash
# Start bot in background
pm2 start src/index.js --name bms-bot

# Enable auto-start on server reboot
pm2 startup
pm2 save
```

### Useful PM2 Commands:
- View live logs: `pm2 logs bms-bot`
- View status: `pm2 status`
- Restart bot: `pm2 restart bms-bot`

---

## ☁️ Option 2: Render.com / Railway.app (Cloud Hosting)

### Render.com Setup:
1. Push your project code to **GitHub**.
2. Go to [Render.com](https://render.com) and create a **Web Service** or **Background Worker**.
3. Connect your GitHub repository.
4. Set Environment Variables:
   - Key: `BOT_TOKEN`
   - Value: `8420619576:AAH7cvAEd23RtegodUhGDP8_UyyYbjE9Zmg`
5. Set Build Command: `npm install`
6. Set Start Command: `npm start`
7. Click **Deploy**. Render will run your bot continuously!

---

## 🎯 Summary
Once deployed to Oracle Cloud Free Tier or Render.com, you can turn off your PC completely. The bot will run 24/7 in the cloud and send instant alerts to your Telegram app on your phone whenever tickets open!
