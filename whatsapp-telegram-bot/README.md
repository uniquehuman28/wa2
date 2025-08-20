# WhatsApp Bot dengan Kontrol Telegram

Sistem Bot WhatsApp yang dapat dikontrol melalui Bot Telegram dengan arsitektur Backend REST API menggunakan Baileys dan Node.js.

## 🚀 Features

- **Login WhatsApp via Telegram**: Login menggunakan QR Code
- **Manajemen Grup**: List, info, dan kontrol grup WhatsApp
- **Pengaturan Grup**: Ubah setting info, pesan, media, dan approval
- **Edit Grup**: Rename, update bio, ganti foto profil
- **Invite Anggota**: Undang member ke grup
- **Cache System**: Redis atau File-based caching
- **Queue & Delay**: Optimized untuk VPS low spec

## 📋 Prerequisites

- Node.js 18+ 
- Redis (optional, akan fallback ke file cache jika tidak ada)
- Telegram Bot Token
- Telegram User ID (Owner)

## 🛠 Installation

1. **Clone & Install Dependencies**
```bash
git clone <repository>
cd whatsapp-telegram-bot
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
```

Edit file `.env`:
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
OWNER_TELEGRAM_ID=your_telegram_user_id

# Server Configuration  
PORT=3000
NODE_ENV=production

# Cache Configuration
CACHE_TYPE=file  # atau 'redis'
REDIS_URL=redis://localhost:6379

# WhatsApp Session
SESSION_PATH=./sessions
```

3. **Get Telegram Bot Token**
- Chat dengan [@BotFather](https://t.me/BotFather)
- Buat bot baru: `/newbot`
- Dapatkan token dan masukkan ke `TELEGRAM_BOT_TOKEN`

4. **Get Telegram User ID**
- Chat dengan [@userinfobot](https://t.me/userinfobot) 
- Salin ID dan masukkan ke `OWNER_TELEGRAM_ID`

## 🏃‍♂️ Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Dengan PM2 (Recommended)
```bash
npm install -g pm2
pm2 start server.js --name "wa-telegram-bot"
pm2 save
pm2 startup
```

## 📱 Penggunaan

### 1. Login WhatsApp
```
/login 628123456789
```
Bot akan mengirim QR Code, scan dengan WhatsApp Anda.

### 2. Check Status
```
/status
```
Cek apakah WhatsApp terhubung.

### 3. List Groups
```
/list_groups
```
Tampilkan semua grup WhatsApp dengan info detail.

### 4. Group Settings (Bulk)
```bash
# Matikan edit info grup untuk semua grup
/set_info off all

# Nyalakan pesan untuk grup nomor 1
/set_msg on 1

# Matikan media untuk grup nomor 3  
/set_media off 3

# Nyalakan approval untuk semua grup
/set_approve on all
```

### 5. Group Management
```bash
# Rename grup
/rename 1 Nama Grup Baru

# Update bio grup
/bio 1 Deskripsi grup yang baru

# Set foto profil grup (kirim perintah ini, lalu kirim foto)
/setpp 1

# Hapus foto profil grup  
/delpp 1

# Invite member ke grup
/invite 1 628123456789

# Info detail grup
/group_info 1
```

### 6. Help
```
/help
```
Tampilkan semua command yang tersedia.

## 🔧 API Endpoints

Server menyediakan REST API yang dapat digunakan langsung:

### Authentication
- `POST /api/wa/login` - Login WhatsApp
- `GET /api/wa/status` - Status koneksi  
- `POST /api/wa/logout` - Logout WhatsApp

### Groups  
- `GET /api/wa/groups` - List semua grup
- `GET /api/wa/group/:number` - Info grup spesifik
- `POST /api/wa/group/settings` - Ubah pengaturan grup
- `POST /api/wa/group/rename` - Rename grup
- `POST /api/wa/group/description` - Update bio grup
- `POST /api/wa/group/picture` - Ubah/hapus foto grup
- `POST /api/wa/group/invite` - Invite member

### Health Check
- `GET /health` - Status server

## 📁 Struktur Project

```
whatsapp-telegram-bot/
├── config.js              # Konfigurasi aplikasi
├── server.js              # Main server file  
├── package.json           # Dependencies
├── .env                   # Environment variables
├── routes/
│   └── api.js            # REST API routes
├── services/
│   ├── whatsapp.js       # WhatsApp service (Baileys)  
│   └── telegram.js       # Telegram bot service
├── utils/
│   ├── logger.js         # Winston logger
│   └── cache.js          # Cache manager (Redis/File)
├── sessions/             # WhatsApp auth sessions
├── cache/               # File-based cache (jika tidak pakai Redis)
└── logs/               # Application logs
```

## ⚙️ Configuration

### Cache System
Sistem mendukung 2 jenis cache:

**File Cache (Default)**
- Tidak perlu setup tambahan
- Data disimpan di folder `./cache`
- Cocok untuk single server

**Redis Cache**
- Performa lebih baik
- Cocok untuk scaling dan multiple instances
- Set `CACHE_TYPE=redis` di `.env`

### Queue & Delay System
Untuk operasi bulk (seperti `/set_info off all`), sistem otomatis menambahkan delay 2-5 detik antar eksekusi untuk mencegah spam dan rate limiting.

### VPS Low Spec Optimization
- Menggunakan file cache sebagai default
- Implementasi queue system dengan delay
- Efficient memory usage dengan caching
- Automatic session management

## 🔒 Security

- **Owner Only**: Hanya owner (berdasarkan Telegram User ID) yang bisa menggunakan bot
- **Admin Check**: Command yang mengubah grup hanya bisa dijalankan jika bot adalah admin
- **Session Management**: Session WhatsApp otomatis tersimpan dan di-restore
- **Error Handling**: Comprehensive error handling dan logging

## 📝 Logs

Aplikasi menggunakan Winston untuk logging:
- `logs/combined.log` - Semua log
- `logs/error.log` - Error logs saja
- Console output untuk development

## 🐛 Troubleshooting

### WhatsApp Tidak Connect
1. Pastikan QR Code di-scan dengan benar
2. Check logs untuk error detail
3. Hapus folder `sessions` dan login ulang

### Telegram Bot Tidak Respond  
1. Pastikan bot token benar
2. Pastikan bot sudah di-start dengan `/start`  
3. Check owner Telegram ID sudah benar

### Command Tidak Work
1. Pastikan WhatsApp dalam status connected (`/status`)
2. Untuk group commands, pastikan bot adalah admin grup
3. Check logs untuk error detail

### Memory Issues (VPS Low Spec)
1. Gunakan file cache instead of Redis
2. Restart aplikasi secara berkala dengan cron job
3. Monitor memory usage dengan `htop`

## 📈 Monitoring

### PM2 Monitoring
```bash
pm2 status
pm2 logs wa-telegram-bot
pm2 monit
```

### Health Check
```bash
curl http://localhost:3000/health
```

## 🔄 Updates

Untuk update aplikasi:
```bash
git pull
npm install  
pm2 restart wa-telegram-bot
```

## ⚠️ Important Notes

1. **Rate Limiting**: WhatsApp membatasi operasi berturut-turut, sistem sudah handle dengan delay otomatis
2. **Session Persistence**: Jangan hapus folder `sessions` kecuali ingin logout
3. **Admin Rights**: Bot harus admin grup untuk mengubah settings  
4. **Backup**: Backup folder `sessions` dan `cache` secara berkala
5. **Resource Usage**: Monitor penggunaan CPU dan memory di VPS

## 📞 Support

Jika ada masalah atau pertanyaan:
1. Check logs di `logs/` folder
2. Lihat troubleshooting section
3. Create issue di repository

---

**Happy Botting! 🤖📱**# wa2
