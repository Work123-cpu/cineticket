#!/bin/bash
# ============================================================
#  BookMyShow Telegram Bot - Oracle Cloud 1-Click Installer
# ============================================================

set -e

echo "🚀 Starting Oracle Cloud Setup for BMS Ticket Bot..."

# 1. Update Ubuntu packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20 & build tools
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# 3. Install Chromium dependencies for Puppeteer Extra Stealth
echo "🌐 Installing Chromium dependencies for Puppeteer..."
sudo apt install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libss3 \
  libxtst6 \
  lsb-release \
  wget \
  x11-utils

# 4. Install npm dependencies
echo "📦 Installing project dependencies..."
npm install

# 5. Install PM2 Process Manager globally
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# 6. Start bot with PM2
echo "🤖 Starting BMS Bot with PM2..."
pm2 start src/index.js --name bms-bot
pm2 save

echo ""
echo "==========================================================="
echo "🎉 SUCCESS! BMS Ticket Monitor Bot is running 24/7 on Oracle!"
echo "==========================================================="
echo "useful commands:"
echo "  • View live logs : pm2 logs bms-bot"
echo "  • Check status   : pm2 status"
echo "  • Restart bot    : pm2 restart bms-bot"
echo "==========================================================="
