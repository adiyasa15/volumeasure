# PileMetric — Deployment Guide

Panduan deployment lengkap untuk semua environment.

---

## Daftar Isi

1. [Arsitektur Aplikasi](#1-arsitektur-aplikasi)
2. [Prasyarat](#2-prasyarat)
3. [File .env — Referensi Lengkap](#3-file-env--referensi-lengkap)
4. [Setup Database](#4-setup-database)
5. [Seed Akun Superadmin](#5-seed-akun-superadmin)
6. [Build untuk Production](#6-build-untuk-production)
7. [Deploy — VM / VPS Linux (Debian/Ubuntu)](#7-deploy--vm--vps-linux-debianubuntu)
8. [Deploy — Docker](#8-deploy--docker)
9. [Deploy — Rumahweb cPanel](#9-deploy--rumahweb-cpanel)
10. [Deploy — Web Hosting (Vercel + Railway)](#10-deploy--web-hosting-vercel--railway)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Arsitektur Aplikasi

```
Browser
  │
  └── HTTPS ──► Nginx / Reverse Proxy
                  │
                  ├── /        ──► Frontend (React + Vite, file statis)
                  └── /api/    ──► API Server (Node.js + Express, port 8080)
                                       │
                                       ├── PostgreSQL (Drizzle ORM)
                                       ├── WebODM Lightning (fotogrametri)
                                       └── Google OAuth 2.0
```

| Package | Path | Fungsi |
|---|---|---|
| `@workspace/stockpile` | `artifacts/stockpile/` | React 19 + Vite frontend |
| `@workspace/api-server` | `artifacts/api-server/` | Express 5 REST API |
| `@workspace/db` | `lib/db/` | Drizzle ORM schema + migrasi |

---

## 2. Prasyarat

### Software

| Tool | Versi Minimum | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Git | 2.40+ | https://git-scm.com |
| PostgreSQL | 15+ | https://www.postgresql.org |

### Akun Eksternal

| Layanan | Kebutuhan | URL |
|---|---|---|
| Google Cloud | OAuth 2.0 Client ID (Web application) | https://console.cloud.google.com |
| WebODM Lightning | API Token untuk fotogrametri | https://webodm.net/lightning |

---

## 3. File .env — Referensi Lengkap

Buat file `.env` di **root project**. File ini memuat semua konfigurasi rahasia aplikasi.

```env
# ════════════════════════════════════════════
# DATABASE
# ════════════════════════════════════════════
DATABASE_URL=postgresql://pilemetric_user:password@localhost:5432/pilemetric

# ════════════════════════════════════════════
# GOOGLE OAUTH 2.0
# Buat di: https://console.cloud.google.com
#   → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
#   → Application type: Web application
# ════════════════════════════════════════════
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
FRONTEND_URL=https://yourdomain.com

# ════════════════════════════════════════════
# SESSION / JWT
# Generate: openssl rand -hex 32
# ════════════════════════════════════════════
SESSION_SECRET=isi_dengan_string_acak_panjang_minimal_32_karakter

# ════════════════════════════════════════════
# WEBODM LIGHTNING
# Dapatkan token di: https://webodm.net/lightning → Account → API Token
# ════════════════════════════════════════════
WEBODM_LIGHTNING_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ════════════════════════════════════════════
# SERVER
# ════════════════════════════════════════════
PORT=8080
NODE_ENV=production

# ════════════════════════════════════════════
# OPSIONAL
# ════════════════════════════════════════════
LOG_LEVEL=info
```

### Penjelasan Variabel

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ✅ | String koneksi PostgreSQL |
| `GOOGLE_CLIENT_ID` | ✅ | Client ID dari Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | Client Secret dari Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | ✅ | Harus sama persis dengan yang didaftarkan di Google Console |
| `FRONTEND_URL` | ✅ | URL publik frontend (tanpa `/` di akhir) |
| `SESSION_SECRET` | ✅ | Kunci rahasia untuk menandatangani JWT. Jangan dibagikan. |
| `WEBODM_LIGHTNING_TOKEN` | ✅ | Token API WebODM untuk pemrosesan fotogrametri |
| `PORT` | ✅ | Port API server (default: 8080) |
| `NODE_ENV` | ✅ | Gunakan `production` saat deploy |
| `LOG_LEVEL` | ❌ | Default `info`. Gunakan `debug` saat troubleshooting |

### Generate SESSION_SECRET

```bash
openssl rand -hex 32
```

Salin output dan tempelkan sebagai nilai `SESSION_SECRET`.

---

## 4. Setup Database

### Buat database dan user PostgreSQL

```sql
CREATE DATABASE pilemetric;
CREATE USER pilemetric_user WITH PASSWORD 'password_anda';
GRANT ALL PRIVILEGES ON DATABASE pilemetric TO pilemetric_user;
GRANT ALL ON SCHEMA public TO pilemetric_user;
ALTER DATABASE pilemetric OWNER TO pilemetric_user;
```

Jalankan via psql:

```bash
sudo -u postgres psql
```

### Push skema Drizzle ke database

```bash
pnpm --filter @workspace/db run push
```

Jalankan ulang setiap kali ada perubahan file di `lib/db/src/schema/`.

---

## 5. Seed Akun Superadmin

Jalankan script berikut **satu kali** setelah database siap untuk membuat akun superadmin pertama:

```bash
pnpm --filter @workspace/scripts run seed-superadmin
```

Script ini akan:
- Membuat akun superadmin baru jika belum ada
- Jika akun sudah ada, memperbarui role dan status menjadi `super_admin` / `approved`

**Kredensial default superadmin:**

| Field | Nilai |
|---|---|
| Username | `superadmin` |
| Password | `D1gitech` |
| Role | `super_admin` |

> **Penting:** Ganti password segera setelah login pertama melalui menu Admin → Settings.

### Login superadmin

Buka URL: `https://yourdomain.com/admin-login`

### Fallback: SQL langsung (jika script tidak bisa dijalankan)

```bash
# 1. Generate bcrypt hash password
node -e "const b=require('bcryptjs'); b.hash('D1gitech',10).then(h=>console.log(h))"
```

```sql
INSERT INTO user_profiles (
  username, email, display_name, password_hash, role, status
) VALUES (
  'superadmin',
  'admin@yourdomain.com',
  'Super Admin',
  '<hash dari perintah di atas>',
  'super_admin',
  'approved'
);
```

---

## 6. Build untuk Production

### Build API server

```bash
pnpm --filter @workspace/api-server run build
```

Output: `artifacts/api-server/dist/index.mjs`

### Build frontend

```bash
BASE_PATH=/ pnpm --filter @workspace/stockpile run build
```

Output: `artifacts/stockpile/dist/public/`

### Typecheck semua package (opsional, sebelum deploy)

```bash
pnpm run typecheck
```

---

## 7. Deploy — VM / VPS Linux (Debian/Ubuntu)

Cocok untuk: AWS EC2, GCP Compute Engine, DigitalOcean Droplet, Rumahweb VPS, atau server Debian/Ubuntu apapun.

**Spesifikasi minimum:** 2 vCPU, 2 GB RAM, 20 GB SSD

---

### 7.1 Install dependensi sistem

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
sudo npm install -g pnpm@9

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Nginx
sudo apt install -y nginx

# Git
sudo apt install -y git
```

---

### 7.2 Setup database PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE pilemetric;
CREATE USER pilemetric_user WITH PASSWORD 'password_aman_anda';
GRANT ALL PRIVILEGES ON DATABASE pilemetric TO pilemetric_user;
GRANT ALL ON SCHEMA public TO pilemetric_user;
ALTER DATABASE pilemetric OWNER TO pilemetric_user;
\q
```

---

### 7.3 Clone project dan install dependensi

```bash
cd /var/www
sudo git clone https://github.com/username/pilemetric.git
sudo chown -R $USER:$USER pilemetric
cd pilemetric
pnpm install --frozen-lockfile
```

---

### 7.4 Buat file .env

```bash
nano /var/www/pilemetric/.env
```

Isi dengan template berikut (sesuaikan semua nilai):

```env
DATABASE_URL=postgresql://pilemetric_user:password_aman_anda@localhost:5432/pilemetric
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
FRONTEND_URL=https://yourdomain.com
SESSION_SECRET=isi_dengan_output_openssl_rand_hex_32
WEBODM_LIGHTNING_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
```

Proteksi file:

```bash
chmod 600 /var/www/pilemetric/.env
```

---

### 7.5 Push skema dan seed superadmin

```bash
cd /var/www/pilemetric

# Push skema database
pnpm --filter @workspace/db run push

# Buat akun superadmin
pnpm --filter @workspace/scripts run seed-superadmin
```

---

### 7.6 Build aplikasi

```bash
cd /var/www/pilemetric

# Build API server
pnpm --filter @workspace/api-server run build

# Build frontend
BASE_PATH=/ pnpm --filter @workspace/stockpile run build
```

---

### 7.7 Autostart API server — systemd (Disarankan)

systemd adalah sistem init bawaan Debian/Ubuntu, tidak memerlukan dependensi tambahan.

**Langkah 1 — Cek lokasi pnpm:**

```bash
which pnpm
```

Catat outputnya (contoh: `/usr/bin/pnpm` atau `/usr/local/bin/pnpm`). Gunakan path ini di `ExecStart`.

**Langkah 2 — Buat file service:**

```bash
sudo nano /etc/systemd/system/pilemetric-api.service
```

Paste konten berikut (sesuaikan `User`, `WorkingDirectory`, dan path `pnpm`):

```ini
[Unit]
Description=PileMetric API Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/pilemetric
ExecStart=/usr/bin/pnpm --filter @workspace/api-server run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=/var/www/pilemetric/.env

[Install]
WantedBy=multi-user.target
```

**Langkah 3 — Aktifkan dan jalankan:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable pilemetric-api
sudo systemctl start pilemetric-api
sudo systemctl status pilemetric-api
```

**Perintah sehari-hari:**

```bash
# Lihat log real-time
sudo journalctl -u pilemetric-api -f

# Restart setelah update kode
sudo systemctl restart pilemetric-api

# Hentikan service
sudo systemctl stop pilemetric-api
```

---

### 7.8 Autostart API server — PM2 (Alternatif)

```bash
sudo npm install -g pm2
```

Buat file `ecosystem.config.cjs` di root project:

```javascript
module.exports = {
  apps: [
    {
      name: "pilemetric-api",
      script: "node",
      args: "--enable-source-maps artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/pilemetric",
      env_file: "/var/www/pilemetric/.env",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Jalankan perintah yang ditampilkan oleh pm2 startup
```

---

### 7.9 Konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/pilemetric
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/pilemetric/artifacts/stockpile/dist/public;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy ke API server
    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 500M;
        proxy_read_timeout   300s;
        proxy_send_timeout   300s;
    }

    # Cache asset statis
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pilemetric /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7.10 HTTPS dengan Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot memperbarui sertifikat secara otomatis via cron.

---

### 7.11 Update aplikasi

> **Penting:** `dist/` ada di `.gitignore` — `git pull` hanya mengambil source code, **bukan** file yang sudah di-build. Anda **wajib** rebuild setiap kali update kode.

#### Cara cepat — gunakan script deploy.sh

Script `deploy.sh` sudah tersedia di root project dan menjalankan semua langkah sekaligus:

```bash
cd /var/www/pilemetric
git pull origin main
./deploy.sh
```

Script ini otomatis melakukan:
1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @workspace/db run push`
3. Build API server → `artifacts/api-server/dist/index.mjs`
4. Build frontend → `artifacts/stockpile/dist/public/`
5. `sudo systemctl restart pilemetric-api` (atau PM2 jika digunakan)

#### Cara manual (langkah per langkah)

```bash
cd /var/www/pilemetric
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/stockpile run build
sudo systemctl restart pilemetric-api
```

---

## 8. Deploy — Docker

---

### 8.1 Buat file .env untuk Docker

```bash
nano /var/www/pilemetric/.env
```

```env
# Gunakan nama service docker-compose sebagai host database (bukan localhost)
DATABASE_URL=postgresql://pilemetric_user:password_db@db:5432/pilemetric
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
FRONTEND_URL=https://yourdomain.com
SESSION_SECRET=isi_dengan_output_openssl_rand_hex_32
WEBODM_LIGHTNING_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# Khusus Docker Compose — password untuk service db
POSTGRES_PASSWORD=password_db
```

> `DATABASE_URL` menggunakan `@db:5432` (nama service di docker-compose), bukan `@localhost:5432`.

---

### 8.2 docker-compose.yml

Buat file `docker-compose.yml` di root project:

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    container_name: pilemetric-db
    restart: always
    environment:
      POSTGRES_DB: pilemetric
      POSTGRES_USER: pilemetric_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: pilemetric-api
    restart: always
    env_file: .env
    ports:
      - "8080:8080"
    depends_on:
      - db

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: pilemetric-frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - api

volumes:
  pgdata:
```

---

### 8.3 Dockerfile (API server)

Buat file `Dockerfile` di root project:

```dockerfile
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/artifacts/api-server/dist/ ./dist/
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
```

---

### 8.4 Dockerfile.frontend

Buat file `Dockerfile.frontend` di root project:

```dockerfile
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/stockpile/ ./artifacts/stockpile/
RUN pnpm install --frozen-lockfile
RUN BASE_PATH=/ pnpm --filter @workspace/stockpile run build

FROM nginx:alpine
COPY --from=builder /app/artifacts/stockpile/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

### 8.5 docker/nginx.conf

Buat file `docker/nginx.conf`:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 500M;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### 8.6 Jalankan dengan Docker

```bash
# Build dan jalankan semua service
docker compose up -d --build

# Push skema database (pertama kali)
docker compose exec api pnpm --filter @workspace/db run push

# Seed akun superadmin (pertama kali)
docker compose exec api pnpm --filter @workspace/scripts run seed-superadmin

# Lihat log API
docker compose logs -f api

# Restart service API
docker compose restart api
```

---

### 8.7 Autostart Docker saat booting

Container dengan `restart: always` sudah otomatis restart. Pastikan Docker daemon aktif:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

---

### 8.8 Update aplikasi (Docker)

```bash
cd /var/www/pilemetric
git pull origin main
docker compose up -d --build
docker compose exec api pnpm --filter @workspace/db run push
```

---

## 9. Deploy — Rumahweb cPanel

> **Catatan:** PileMetric hanya bisa berjalan di **Rumahweb VPS** atau paket hosting **Business ke atas** yang mendukung Node.js. Paket shared hosting biasa tidak didukung karena tidak ada akses SSH dan Node.js.
>
> Jika menggunakan **Rumahweb VPS**, ikuti panduan [Deploy — VM/VPS Linux](#7-deploy--vm--vps-linux-debianubuntu).

---

### 9.1 Setup PostgreSQL eksternal (Neon.tech)

Rumahweb cPanel tidak menyediakan PostgreSQL. Gunakan Neon.tech (gratis):

1. Daftar di https://neon.tech
2. Buat project baru → region: **Asia Pacific (Singapore)**
3. Salin **Connection String**, contoh:

```
postgresql://pilemetric_owner:password@ep-xxx.ap-southeast-1.aws.neon.tech/pilemetric?sslmode=require
```

4. Push skema dari komputer lokal:

```bash
DATABASE_URL="postgresql://pilemetric_owner:password@ep-xxx.neon.tech/pilemetric?sslmode=require" \
  pnpm --filter @workspace/db run push
```

5. Seed superadmin dari komputer lokal:

```bash
DATABASE_URL="postgresql://pilemetric_owner:password@ep-xxx.neon.tech/pilemetric?sslmode=require" \
  pnpm --filter @workspace/scripts run seed-superadmin
```

---

### 9.2 Buat subdomain untuk API

1. Login cPanel → **Domains** → **Subdomains**
2. Buat subdomain: `api` → domain: `yourdomain.com`
3. Klik **Create**

Hasil: `api.yourdomain.com` tersedia untuk Node.js app.

---

### 9.3 Setup Node.js App di cPanel

1. cPanel → **Software** → **Setup Node.js App** → **Create Application**
2. Isi form:

| Field | Nilai |
|---|---|
| Node.js version | `20.x` |
| Application mode | `Production` |
| Application root | `api.yourdomain.com` |
| Application URL | `api.yourdomain.com` |
| Application startup file | `dist/index.mjs` |

3. Klik **Create**

---

### 9.4 Set variabel .env di cPanel

Di antarmuka **Setup Node.js App**, scroll ke bagian **Environment Variables** dan tambahkan setiap baris berikut satu per satu, lalu klik **Save**:

| Name | Value |
|---|---|
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://...neon.tech/pilemetric?sslmode=require` |
| `GOOGLE_CLIENT_ID` | `xxxxxxxxxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `GOOGLE_REDIRECT_URI` | `https://api.yourdomain.com/api/auth/google/callback` |
| `FRONTEND_URL` | `https://yourdomain.com` |
| `SESSION_SECRET` | (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `WEBODM_LIGHTNING_TOKEN` | token dari webodm.net |
| `LOG_LEVEL` | `info` |

> **Catatan PORT:** Di Rumahweb Passenger gunakan `PORT=3000`, bukan `8080`.

---

### 9.5 Build dan upload file

Di komputer lokal, build:

**API server:**
```bash
pnpm --filter @workspace/api-server run build
```

**Frontend** (arahkan ke subdomain API):
```bash
BASE_PATH=/ VITE_API_URL=https://api.yourdomain.com/api \
  pnpm --filter @workspace/stockpile run build
```

---

### 9.6 Upload via cPanel File Manager

**Upload frontend:**
1. cPanel → **File Manager** → buka folder `public_html/`
2. Hapus file placeholder default
3. Upload semua isi folder `artifacts/stockpile/dist/public/`

**Upload API:**
1. cPanel → **File Manager** → buka folder `api.yourdomain.com/`
2. Buat subfolder `dist/`
3. Upload file `artifacts/api-server/dist/index.mjs` ke dalam `dist/`

---

### 9.7 Buat file .htaccess

**Untuk `public_html/.htaccess`** (SPA routing):

```apache
Options -Indexes

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

LimitRequestBody 524288000
```

**Untuk `api.yourdomain.com/.htaccess`** (Passenger):

```apache
LimitRequestBody 524288000
PassengerEnabled On
PassengerAppType node
PassengerStartupFile dist/index.mjs
```

---

### 9.8 Start aplikasi dan aktifkan SSL

1. cPanel → **Setup Node.js App** → klik **Restart** pada aplikasi Anda
2. cPanel → **Security** → **SSL/TLS Status** → klik **Run AutoSSL**
3. Test:

```bash
curl https://api.yourdomain.com/api/healthz
# Expected: {"status":"ok"}
```

---

### 9.9 Konfigurasi Google OAuth untuk Rumahweb

Di Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID Anda:

- **Authorized redirect URIs** → tambahkan: `https://api.yourdomain.com/api/auth/google/callback`
- **Authorized JavaScript origins** → tambahkan: `https://yourdomain.com`

---

### 9.10 Update aplikasi (Rumahweb)

```bash
# 1. Rebuild API
pnpm --filter @workspace/api-server run build
# Upload api-server/dist/index.mjs → api.yourdomain.com/dist/ via File Manager

# 2. Rebuild frontend
BASE_PATH=/ VITE_API_URL=https://api.yourdomain.com/api \
  pnpm --filter @workspace/stockpile run build
# Upload isi stockpile/dist/public/ → public_html/ via File Manager

# 3. Restart di cPanel → Setup Node.js App → Restart
```

---

## 10. Deploy — Web Hosting (Vercel + Railway)

Pilihan termudah: frontend ke Vercel, API ke Railway.

---

### 10.1 Deploy API ke Railway

1. https://railway.app → **New Project** → **Deploy from GitHub**
2. Set **Start command**: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
3. Set **Build command**: `pnpm install && pnpm --filter @workspace/api-server run build`
4. Tambah **PostgreSQL plugin** dari Railway dashboard
5. Set environment variables di Railway:

| Name | Value |
|---|---|
| `DATABASE_URL` | (dari Railway PostgreSQL plugin) |
| `GOOGLE_CLIENT_ID` | `xxxxxxxxxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `GOOGLE_REDIRECT_URI` | `https://pilemetric-api.up.railway.app/api/auth/google/callback` |
| `FRONTEND_URL` | `https://pilemetric.vercel.app` |
| `SESSION_SECRET` | (string acak 64 karakter) |
| `WEBODM_LIGHTNING_TOKEN` | token dari webodm.net |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |

6. Push skema database setelah deploy pertama:

```bash
DATABASE_URL=<railway_url> pnpm --filter @workspace/db run push
DATABASE_URL=<railway_url> pnpm --filter @workspace/scripts run seed-superadmin
```

---

### 10.2 Deploy frontend ke Vercel

1. https://vercel.com → **New Project** → Import dari GitHub
2. **Root Directory**: `artifacts/stockpile`
3. **Build Command**: `cd ../.. && pnpm install && BASE_PATH=/ pnpm --filter @workspace/stockpile run build`
4. **Output Directory**: `dist/public`
5. Set environment variables:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://pilemetric-api.up.railway.app` |
| `BASE_PATH` | `/` |

6. Buat file `artifacts/stockpile/vercel.json` untuk proxy `/api`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://pilemetric-api.up.railway.app/api/:path*"
    }
  ]
}
```

---

### 10.3 Konfigurasi Google OAuth untuk Vercel + Railway

Di Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID:

- **Authorized redirect URIs**: `https://pilemetric-api.up.railway.app/api/auth/google/callback`
- **Authorized JavaScript origins**: `https://pilemetric.vercel.app`

---

## 11. Troubleshooting

---

### API server tidak mau start

**Error:** `Error: PORT environment variable is required`
**Solusi:** Pastikan `PORT=8080` ada di file `.env`.

---

**Error:** `FATAL: database "pilemetric" does not exist`
**Solusi:** Jalankan perintah CREATE DATABASE di [Section 4](#4-setup-database), kemudian `pnpm --filter @workspace/db run push`.

---

**Error:** `permission denied for schema public`
**Solusi:**
```sql
GRANT ALL ON SCHEMA public TO pilemetric_user;
```

---

**Error:** `pnpm: command not found` di systemd
**Solusi:** Cek path pnpm dengan `which pnpm`, sesuaikan di `ExecStart` pada file service.

---

### Nginx 502 Bad Gateway

API server tidak berjalan. Cek:
```bash
sudo systemctl status pilemetric-api
sudo journalctl -u pilemetric-api -n 50
```

---

### Upload foto gagal (413 Request Entity Too Large)

Tambahkan di konfigurasi Nginx:
```nginx
client_max_body_size 500M;
```
Kemudian: `sudo systemctl reload nginx`

---

### Google login tidak berfungsi (`redirect_uri_mismatch`)

Nilai `GOOGLE_REDIRECT_URI` di `.env` harus **sama persis** (termasuk huruf besar/kecil dan tanpa trailing slash) dengan yang didaftarkan di Google Cloud Console.

---

### Rumahweb — Setup Node.js App tidak muncul di cPanel

Paket hosting Anda tidak mendukung Node.js. Upgrade ke paket **Business** atau gunakan **Rumahweb VPS**.

---

### Rumahweb — API mengembalikan 503

1. cPanel → **Setup Node.js App** → klik **Restart**
2. Pastikan file `dist/index.mjs` ada di folder `api.yourdomain.com/dist/`
3. Periksa semua environment variable sudah terisi → **Save** → **Restart**

---

### Rumahweb — Koneksi database ditolak dari Neon

Pastikan `DATABASE_URL` diakhiri dengan `?sslmode=require`:
```
postgresql://user:pass@ep-xxx.neon.tech/pilemetric?sslmode=require
```

---

### Jobs stuck di status "queued" selamanya

Token WebODM tidak valid atau kadaluarsa. Test:
```bash
curl -s "https://spark1.webodm.net/api/projects/1/?token=YOUR_TOKEN"
```
Jika hasilnya 401, perbarui token di https://webodm.net/lightning → Account.

---

### Volume tidak terhitung / nilai sangat besar

DSM file tidak berhasil di-download sebelum NodeODM menghapus asetnya. Untuk job lama:
```bash
POST /api/jobs/<id>/recalculate-dsm
Authorization: Bearer <admin-token>
```
