# راه‌اندازی سرور

یک دامنه با HTTPS، یک فرآیند Node، MongoDB، و فایل حساب Firebase. پنل و API روی همان پورت هستند؛ ربات تلگرام پورت عمومی نمی‌خواهد.

## روی سرور

```bash
sudo apt update
sudo apt install -y git curl nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# MongoDB 7 — دستور رسمی mongodb.com برای اوبونتو همان نسخه
```

```bash
sudo mkdir -p /opt/companyapplock
sudo chown "$USER" /opt/companyapplock
git clone https://github.com/OWNER/CompanyAppLock.git /opt/companyapplock
cd /opt/companyapplock
npm --prefix backend install
npm --prefix telegram-mini-app install
npm run build:panel
```

`backend/.env` را از `backend/.env.example` بساز. حداقل:

```
PORT=3000
HOST=127.0.0.1
MONGO_URI=mongodb://127.0.0.1:27017/companyapplock
FIREBASE_CREDENTIALS=/opt/companyapplock/backend/firebase-service-account.json
TELEGRAM_BOT_TOKEN=توکن_بات‌فادر
ADMIN_TELEGRAM_ID=آیدی_عددی_مالک
CORS_ORIGIN=https://panel.example.com
```

فایل JSON حساب سرویس Firebase را همان مسیر `FIREBASE_CREDENTIALS` بگذار. این فایل را در گیت نگذار.

## Nginx

`/etc/nginx/sites-available/companyapplock`:

```nginx
server {
    server_name panel.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/companyapplock /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d panel.example.com
```

## سرویس

`/etc/systemd/system/companyapplock.service`:

```ini
[Unit]
Description=CompanyAppLock API, panel, Telegram bot
After=network.target mongod.service

[Service]
Type=simple
User=USER
WorkingDirectory=/opt/companyapplock
ExecStart=/usr/bin/node scripts/start-prod.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now companyapplock
curl -s https://panel.example.com/health
```

خروجی سالم: `{"ok":true,...}`

## تلگرام

در BotFather:

1. `/setdomain` اگر لازم است
2. Menu Button → آدرس `https://panel.example.com`
3. ربات را در گروه پورت ادمین کن

## اندروید

روی ماشین بیلد، نه روی سرور:

```bash
node android/tools/encrypt-bootstrap.mjs --port <کد-۲۰-حرفی> https://panel.example.com/api/v1
```

بعد در Android Studio بیلد `velvet` (یا flavor مورد نظر) و نصب. Gradle را روی سرور اجرا نکن.

## به‌روزرسانی

```bash
cd /opt/companyapplock
git pull
npm --prefix backend install
npm --prefix telegram-mini-app install
npm run build:panel
sudo systemctl restart companyapplock
```
