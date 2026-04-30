# PileMetric — Deployment Guide

> **Scope:** This guide covers the current production version of PileMetric — the `artifacts/stockpile` React frontend + `artifacts/api-server` Express backend + `lib/db` PostgreSQL schema. It does not cover CartesianMetric or any proposed features.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Clone & Local Development](#3-clone--local-development)
4. [Environment Variables](#4-environment-variables)
5. [Database Setup](#5-database-setup)
6. [Build for Production](#6-build-for-production)
7. [Push to GitHub](#7-push-to-github)
8. [Deploy — Option A: Web Hosting (Vercel + Railway)](#8-deploy--option-a-web-hosting-vercel--railway)
9. [Deploy — Option B: VM Instance (Ubuntu + Nginx + PM2)](#9-deploy--option-b-vm-instance-ubuntu--nginx--pm2)
10. [Deploy — Option C: Kubernetes](#10-deploy--option-c-kubernetes)
11. [Deploy — Option D: Rumahweb cPanel Hosting](#11-deploy--option-d-rumahweb-cpanel-hosting)
12. [Testing & Smoke Checks](#12-testing--smoke-checks)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser / Client                       │
└────────────────────┬────────────────────────────────────────-┘
                     │ HTTPS
          ┌──────────▼──────────┐
          │   Reverse Proxy      │  (Nginx / Ingress / CDN)
          │   / → Frontend       │
          │   /api → API Server  │
          └──────┬──────┬───────┘
                 │      │
    ┌────────────▼──┐ ┌─▼──────────────────┐
    │  Frontend      │ │  API Server         │
    │  React + Vite  │ │  Node.js + Express  │
    │  Static files  │ │  Port 8080          │
    └────────────────┘ └────────┬────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   PostgreSQL DB         │
                    │   (Drizzle ORM)         │
                    └───────────────────────-┘
                                │
                    ┌───────────▼───────────┐
                    │  WebODM Lightning       │
                    │  spark1.webodm.net      │
                    │  (NodeODM photogram.)   │
                    └────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Clerk Auth             │
                    │  (clerk.com SaaS)       │
                    └────────────────────────┘
```

**Monorepo packages:**

| Package | Path | Role |
|---|---|---|
| `@workspace/stockpile` | `artifacts/stockpile/` | React 19 + Vite frontend |
| `@workspace/api-server` | `artifacts/api-server/` | Express 5 REST API |
| `@workspace/db` | `lib/db/` | Drizzle ORM schema + migrations |
| `@workspace/api-spec` | `lib/api-spec/` | OpenAPI 3 contract |
| `@workspace/api-zod` | `lib/api-zod/` | Generated Zod validators |
| `@workspace/api-client-react` | `lib/api-client-react/` | Generated React Query hooks |

---

## 2. Prerequisites

### Software (all platforms)

| Tool | Minimum Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org or `nvm install 20` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Git | 2.40+ | https://git-scm.com |
| PostgreSQL | 15+ | https://www.postgresql.org |

### External Accounts / API Keys

| Service | Purpose | Signup |
|---|---|---|
| **Clerk** | User authentication (OAuth + email/password) | https://clerk.com — free tier covers dev |
| **WebODM Lightning** | Photogrammetry processing (NodeODM SaaS) | https://webodm.net/lightning |

### Optional (for VM / Kubernetes only)

| Tool | Purpose |
|---|---|
| Docker 24+ | Container builds |
| kubectl + helm | Kubernetes deployments |
| nginx | Reverse proxy on VMs |
| PM2 | Node.js process manager on VMs |

---

## 3. Clone & Local Development

### 3.1 Clone the repository

```bash
git clone https://github.com/<your-org>/pilemetric.git
cd pilemetric
```

### 3.2 Install dependencies

```bash
pnpm install
```

> pnpm installs all workspace packages from a single `pnpm-lock.yaml`. Never use `npm install` or `yarn`.

### 3.3 Configure environment variables

Copy the example file and fill in your values (see [Section 4](#4-environment-variables)):

```bash
cp .env.example .env
```

### 3.4 Push the database schema

```bash
pnpm --filter @workspace/db run push
```

This applies all Drizzle table definitions to your PostgreSQL database. Re-run whenever schema files in `lib/db/src/schema/` change.

### 3.5 Start the development servers

**Terminal 1 — API server:**
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend:**
```bash
PORT=18296 BASE_PATH=/ pnpm --filter @workspace/stockpile run dev
```

Open http://localhost:18296 in your browser.

The API runs on port 8080 (`/api` prefix). The Vite dev server proxies nothing — in development the frontend hits the API directly via `/api` path, which your browser routes to the API server through the reverse proxy (or you can run them behind a local nginx).

---

## 4. Environment Variables

Create a `.env` file at the **project root** (or inject them into the runtime environment on your hosting platform). The API server loads these at startup.

### 4.1 Required — API Server

```dotenv
# ----- Database -----
DATABASE_URL=postgresql://user:password@localhost:5432/pilemetric

# ----- Authentication (Clerk) -----
# From Clerk Dashboard → API Keys
CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx

# ----- Session -----
# Any long random string — used to sign local-admin JWTs
SESSION_SECRET=change-me-to-a-64-char-random-string

# ----- NodeODM / WebODM Lightning -----
# API token from https://webodm.net/lightning → Account → API Token
WEBODM_LIGHTNING_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ----- Server -----
PORT=8080
NODE_ENV=production
```

### 4.2 Required — Frontend build

These are read at **build time** by Vite (they are baked into the static bundle):

```dotenv
# Clerk publishable key (safe to expose — starts with pk_)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx

# Base path the frontend is served from (/ for root, /app for a sub-path)
BASE_PATH=/
```

> `VITE_` prefixed variables are embedded in the JS bundle. Never put secret keys with this prefix.

### 4.3 Local admin account

The first run automatically seeds a `super_admin` local account. You can change credentials via the Admin → Settings page in the running app. These credentials are stored hashed in the database — they are not environment variables.

Default credentials (change immediately after first deploy):
- Username: `superadmin`
- Password: `D1g1t3ch`

---

## 5. Database Setup

PileMetric uses **Drizzle ORM** with PostgreSQL. There are no migration files — Drizzle uses `push` mode which applies the TypeScript schema directly.

### 5.1 Create the database

```sql
-- Connect to postgres as superuser
CREATE DATABASE pilemetric;
CREATE USER pilemetric_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE pilemetric TO pilemetric_user;
```

### 5.2 Apply schema

```bash
DATABASE_URL=postgresql://pilemetric_user:your_password@localhost:5432/pilemetric \
  pnpm --filter @workspace/db run push
```

### 5.3 Tables created

| Table | Purpose |
|---|---|
| `jobs` | Photogrammetry jobs — polygon, volume, DSM/DTM cache |
| `user_profiles` | Clerk users + local admin accounts, role, status |
| `activity_logs` | Audit trail — logins, job creation, deletions |
| `app_settings` | Key-value store — WebODM token override, system config |

### 5.4 Schema updates

When code changes alter `lib/db/src/schema/*.ts`:

```bash
pnpm --filter @workspace/db run push
```

For destructive changes (column renames, drops) use:
```bash
pnpm --filter @workspace/db run push-force
```

---

## 6. Build for Production

### 6.1 Typecheck everything

```bash
pnpm run typecheck
```

### 6.2 Build the API server

```bash
NODE_ENV=production pnpm --filter @workspace/api-server run build
```

Output: `artifacts/api-server/dist/index.mjs` (single bundled ESM file via esbuild).

### 6.3 Build the frontend

```bash
BASE_PATH=/ \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
pnpm --filter @workspace/stockpile run build
```

Output: `artifacts/stockpile/dist/public/` — static HTML/CSS/JS files ready to serve.

### 6.4 Run the API server in production

```bash
PORT=8080 NODE_ENV=production \
  CLERK_SECRET_KEY=sk_live_xxx \
  DATABASE_URL=postgresql://... \
  SESSION_SECRET=... \
  WEBODM_LIGHTNING_TOKEN=xxx \
  node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Health check endpoint: `GET /api/healthz` → returns `{"status":"ok"}` with HTTP 200.

---

## 7. Push to GitHub

### 7.1 Create repository

```bash
# Create a new private repo on GitHub, then:
git remote add origin https://github.com/<your-org>/pilemetric.git
git branch -M main
git push -u origin main
```

### 7.2 Recommended `.gitignore` additions

Ensure these are in `.gitignore`:

```
.env
.env.local
node_modules/
artifacts/*/dist/
artifacts/api-server/dist/
lib/*/dist/
*.tif
attached_assets/
```

### 7.3 GitHub Actions CI (optional but recommended)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  typecheck-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm run typecheck

      - name: Build API server
        run: pnpm --filter @workspace/api-server run build
        env:
          NODE_ENV: production

      - name: Build frontend
        run: pnpm --filter @workspace/stockpile run build
        env:
          BASE_PATH: /
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
```

Add the following repository secrets in GitHub → Settings → Secrets:
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `SESSION_SECRET`
- `WEBODM_LIGHTNING_TOKEN`

---

## 8. Deploy — Option A: Web Hosting (Vercel + Railway)

This is the simplest option. The frontend (static files) goes to Vercel/Netlify/Cloudflare Pages and the API server goes to Railway/Render/Fly.io.

### 8.1 Deploy the API server to Railway

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select your repository
3. Railway detects Node.js. Set the **Start command**:
   ```
   node --enable-source-maps artifacts/api-server/dist/index.mjs
   ```
4. Set the **Build command**:
   ```
   pnpm install && pnpm --filter @workspace/api-server run build
   ```
5. Add environment variables in Railway dashboard:
   ```
   DATABASE_URL         = (use Railway's built-in Postgres plugin)
   CLERK_SECRET_KEY     = sk_live_xxx
   SESSION_SECRET       = (64-char random string)
   WEBODM_LIGHTNING_TOKEN = xxx
   PORT                 = 8080
   NODE_ENV             = production
   ```
6. Add a **PostgreSQL plugin** in Railway. Copy the `DATABASE_URL` it generates.
7. After deploy, run the schema push once:
   ```bash
   DATABASE_URL=<railway_url> pnpm --filter @workspace/db run push
   ```
8. Note your Railway service URL, e.g. `https://pilemetric-api.up.railway.app`

### 8.2 Deploy the frontend to Vercel

1. Go to https://vercel.com → New Project → Import from GitHub
2. Set **Framework Preset** to `Vite`
3. Set **Root Directory** to `artifacts/stockpile`
4. Set **Build Command** to:
   ```
   cd ../.. && pnpm install && BASE_PATH=/ pnpm --filter @workspace/stockpile run build
   ```
5. Set **Output Directory** to `dist/public`
6. Add environment variables:
   ```
   VITE_CLERK_PUBLISHABLE_KEY = pk_live_xxx
   BASE_PATH                  = /
   ```
7. Deploy. Note your Vercel domain, e.g. `https://pilemetric.vercel.app`

### 8.3 Configure Clerk allowed origins

In Clerk Dashboard → Settings → Allowed Origins, add:
- `https://pilemetric.vercel.app`
- `https://pilemetric-api.up.railway.app`

### 8.4 Wire up the API base URL

In Vercel, add a rewrite rule so `/api/*` proxies to your Railway API:

Create `artifacts/stockpile/vercel.json`:
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

Redeploy Vercel after adding this file.

---

## 9. Deploy — Option B: VM Instance (Ubuntu + Nginx + PM2)

Suitable for AWS EC2, GCP Compute Engine, Azure VM, DigitalOcean Droplet, or any bare Ubuntu 22.04 server.

### 9.1 Provision the VM

Minimum recommended specs:
- **CPU:** 2 vCPU
- **RAM:** 4 GB (GeoTIFF parsing is memory-intensive)
- **Disk:** 20 GB SSD
- **OS:** Ubuntu 22.04 LTS
- **Open ports:** 80 (HTTP), 443 (HTTPS), 22 (SSH)

### 9.2 Install system dependencies

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
sudo npm install -g pnpm@9

# Install PM2 (process manager)
sudo npm install -g pm2

# Install nginx
sudo apt-get install -y nginx

# Install PostgreSQL 15
sudo apt-get install -y postgresql postgresql-contrib

# Install git
sudo apt-get install -y git

# Verify versions
node --version    # v20.x.x
pnpm --version    # 9.x.x
nginx -v
psql --version
```

### 9.3 Set up PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE DATABASE pilemetric;
CREATE USER pilemetric_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE pilemetric TO pilemetric_user;
EOF
```

### 9.4 Clone and build

```bash
# Clone repo
cd /var/www
sudo git clone https://github.com/<your-org>/pilemetric.git
sudo chown -R $USER:$USER pilemetric
cd pilemetric

# Install dependencies
pnpm install --frozen-lockfile

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://pilemetric_user:your_secure_password@localhost:5432/pilemetric
CLERK_SECRET_KEY=sk_live_xxx
SESSION_SECRET=your-64-char-secret
WEBODM_LIGHTNING_TOKEN=xxx
PORT=8080
NODE_ENV=production
EOF

# Push DB schema
pnpm --filter @workspace/db run push

# Build API server
NODE_ENV=production pnpm --filter @workspace/api-server run build

# Build frontend
BASE_PATH=/ \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
pnpm --filter @workspace/stockpile run build
```

### 9.5 Configure PM2

Create `ecosystem.config.cjs` at the project root:

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
      error_file: "/var/log/pilemetric/api-error.log",
      out_file: "/var/log/pilemetric/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
```

```bash
# Create log directory
sudo mkdir -p /var/log/pilemetric
sudo chown $USER:$USER /var/log/pilemetric

# Start the API server
pm2 start ecosystem.config.cjs

# Save PM2 config so it survives reboots
pm2 save

# Auto-start PM2 on boot
pm2 startup
# Run the command that pm2 outputs, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 9.6 Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/pilemetric
```

Paste:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Frontend — serve static files
    root /var/www/pilemetric/artifacts/stockpile/dist/public;
    index index.html;

    # SPA fallback — send all non-asset requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API — proxy to Node.js
    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout for long-running DSM downloads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Increase body size for image uploads
        client_max_body_size 500M;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/pilemetric /etc/nginx/sites-enabled/
sudo nginx -t               # test config
sudo systemctl reload nginx
```

### 9.7 Enable HTTPS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
# Follow prompts — certbot auto-renews via cron
```

### 9.8 Deploy updates

```bash
cd /var/www/pilemetric

# Pull latest code
git pull origin main

# Install any new dependencies
pnpm install --frozen-lockfile

# Re-run schema push if schema changed
pnpm --filter @workspace/db run push

# Rebuild
NODE_ENV=production pnpm --filter @workspace/api-server run build
BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
  pnpm --filter @workspace/stockpile run build

# Restart API server (zero-downtime reload)
pm2 reload pilemetric-api
```

---

## 10. Deploy — Option C: Kubernetes

### 10.1 Prerequisites

- Kubernetes cluster (GKE, EKS, AKS, or local k3s/minikube)
- `kubectl` configured and connected to your cluster
- `helm` v3
- Container registry (Docker Hub, GCR, ECR, or GHCR)
- PostgreSQL accessible from the cluster (Cloud SQL, RDS, or in-cluster)

### 10.2 Create Dockerfile for the API server

Create `artifacts/api-server/Dockerfile`:

```dockerfile
# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install all workspace deps
RUN pnpm install --frozen-lockfile

# Build the API server
RUN NODE_ENV=production pnpm --filter @workspace/api-server run build

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy built bundle only (no source or node_modules)
COPY --from=builder /app/artifacts/api-server/dist/ ./dist/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
```

### 10.3 Create Dockerfile for the frontend

Create `artifacts/stockpile/Dockerfile`:

```dockerfile
# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/stockpile/ ./artifacts/stockpile/

RUN pnpm install --frozen-lockfile

ARG VITE_CLERK_PUBLISHABLE_KEY
ARG BASE_PATH=/

RUN BASE_PATH=${BASE_PATH} \
    VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
    pnpm --filter @workspace/stockpile run build

# ── Nginx runtime ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/artifacts/stockpile/dist/public/ /usr/share/nginx/html/

# nginx config for SPA routing
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / { try_files $uri $uri/ /index.html; }\n\
  location /api/ { return 404; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 10.4 Build and push Docker images

```bash
export REGISTRY=ghcr.io/<your-org>
export TAG=$(git rev-parse --short HEAD)

# API server
docker build \
  -f artifacts/api-server/Dockerfile \
  -t ${REGISTRY}/pilemetric-api:${TAG} \
  -t ${REGISTRY}/pilemetric-api:latest \
  .
docker push ${REGISTRY}/pilemetric-api:${TAG}
docker push ${REGISTRY}/pilemetric-api:latest

# Frontend
docker build \
  -f artifacts/stockpile/Dockerfile \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
  --build-arg BASE_PATH=/ \
  -t ${REGISTRY}/pilemetric-web:${TAG} \
  -t ${REGISTRY}/pilemetric-web:latest \
  .
docker push ${REGISTRY}/pilemetric-web:${TAG}
docker push ${REGISTRY}/pilemetric-web:latest
```

### 10.5 Kubernetes manifests

Create `k8s/` directory at project root with the following files:

**`k8s/namespace.yaml`**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: pilemetric
```

**`k8s/secrets.yaml`** (do not commit — apply manually or use Vault/External Secrets)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: pilemetric-secrets
  namespace: pilemetric
type: Opaque
stringData:
  DATABASE_URL: "postgresql://pilemetric_user:password@postgres-service:5432/pilemetric"
  CLERK_SECRET_KEY: "sk_live_xxx"
  SESSION_SECRET: "your-64-char-random-string"
  WEBODM_LIGHTNING_TOKEN: "xxx"
```

**`k8s/api-deployment.yaml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pilemetric-api
  namespace: pilemetric
  labels:
    app: pilemetric-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pilemetric-api
  template:
    metadata:
      labels:
        app: pilemetric-api
    spec:
      containers:
        - name: api
          image: ghcr.io/<your-org>/pilemetric-api:latest
          ports:
            - containerPort: 8080
          env:
            - name: PORT
              value: "8080"
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: pilemetric-secrets
                  key: DATABASE_URL
            - name: CLERK_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: pilemetric-secrets
                  key: CLERK_SECRET_KEY
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: pilemetric-secrets
                  key: SESSION_SECRET
            - name: WEBODM_LIGHTNING_TOKEN
              valueFrom:
                secretKeyRef:
                  name: pilemetric-secrets
                  key: WEBODM_LIGHTNING_TOKEN
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /api/healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
```

**`k8s/api-service.yaml`**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: pilemetric-api-svc
  namespace: pilemetric
spec:
  selector:
    app: pilemetric-api
  ports:
    - protocol: TCP
      port: 8080
      targetPort: 8080
```

**`k8s/web-deployment.yaml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pilemetric-web
  namespace: pilemetric
  labels:
    app: pilemetric-web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pilemetric-web
  template:
    metadata:
      labels:
        app: pilemetric-web
    spec:
      containers:
        - name: web
          image: ghcr.io/<your-org>/pilemetric-web:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
```

**`k8s/web-service.yaml`**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: pilemetric-web-svc
  namespace: pilemetric
spec:
  selector:
    app: pilemetric-web
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```

**`k8s/ingress.yaml`** (requires nginx-ingress-controller or similar)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pilemetric-ingress
  namespace: pilemetric
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "500m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - your-domain.com
      secretName: pilemetric-tls
  rules:
    - host: your-domain.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: pilemetric-api-svc
                port:
                  number: 8080
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pilemetric-web-svc
                port:
                  number: 80
```

### 10.6 Apply to cluster

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply secrets (do NOT commit this file to git)
kubectl apply -f k8s/secrets.yaml

# Push DB schema (one-time, from your local machine with DB access)
DATABASE_URL=<prod_db_url> pnpm --filter @workspace/db run push

# Deploy everything
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/web-service.yaml
kubectl apply -f k8s/ingress.yaml

# Verify pods are running
kubectl get pods -n pilemetric
kubectl logs -n pilemetric -l app=pilemetric-api --tail=50
```

### 10.7 Update to a new version

```bash
# Build new images with new tag
export TAG=$(git rev-parse --short HEAD)
docker build ... -t ${REGISTRY}/pilemetric-api:${TAG} .
docker push ${REGISTRY}/pilemetric-api:${TAG}

# Rolling update (zero downtime)
kubectl set image deployment/pilemetric-api \
  api=${REGISTRY}/pilemetric-api:${TAG} \
  -n pilemetric

kubectl rollout status deployment/pilemetric-api -n pilemetric
```

---

## 11. Deploy — Option D: Rumahweb cPanel Hosting

Rumahweb adalah penyedia hosting Indonesia yang menggunakan cPanel. Panduan ini menggunakan Bahasa Inggris agar konsisten dengan seluruh dokumen, namun mencakup semua langkah yang berlaku khusus untuk lingkungan Rumahweb.

### Important notes before you start

| Constraint | Detail |
|---|---|
| **Node.js support** | Only available on **Business** plan or higher. Shared Starter/Personal plans do NOT support Node.js. Verify your plan at cPanel → Software → **Setup Node.js App**. |
| **No PostgreSQL** | Rumahweb cPanel provides only MySQL. PileMetric requires PostgreSQL. You must use an **external** free PostgreSQL provider (Neon.tech is recommended). |
| **Memory limit** | Shared hosting memory is typically 256–512 MB. GeoTIFF parsing peaks at ~800 MB RAM. If the API crashes on large files, you need a VPS instead. |
| **Upload size** | Apache default is 128 MB. You must raise this in `.htaccess`. |
| **API subdomain** | The API server runs on a subdomain (e.g. `api.yourdomain.com`) because cPanel Passenger apps are bound to a domain/subdomain, not a path. |

### Architecture on Rumahweb

```
Browser
  │
  ├─── https://yourdomain.com/       → Apache → public_html/ (static frontend)
  │
  └─── https://api.yourdomain.com/api/  → Apache → Passenger → Node.js (API server)
                                                         │
                                              PostgreSQL on Neon.tech (external)
```

---

### 11.1 Set up external PostgreSQL (Neon.tech)

Neon provides a free PostgreSQL 16 database accessible from any host.

1. Go to https://neon.tech → **Sign Up** (free)
2. Click **New Project** → name it `pilemetric` → region: `Asia Pacific (Singapore)` (closest to Indonesian servers)
3. After creation, copy the **Connection String** — it looks like:
   ```
   postgresql://pilemetric_owner:password@ep-xxx.ap-southeast-1.aws.neon.tech/pilemetric?sslmode=require
   ```
4. Save this as your `DATABASE_URL`

**Push the schema from your local machine:**
```bash
DATABASE_URL="postgresql://pilemetric_owner:password@ep-xxx.ap-southeast-1.aws.neon.tech/pilemetric?sslmode=require" \
  pnpm --filter @workspace/db run push
```

---

### 11.2 Create a subdomain for the API in cPanel

1. Log in to cPanel → **Domains** → **Subdomains**
2. Create subdomain: `api`
3. Domain: `yourdomain.com`
4. Document Root: leave as `api.yourdomain.com` (cPanel sets this automatically)
5. Click **Create**

You now have `api.yourdomain.com` pointing to a folder inside your account.

---

### 11.3 Set up Node.js App in cPanel

1. cPanel → **Software** → **Setup Node.js App**
2. Click **Create Application**
3. Fill in:

   | Field | Value |
   |---|---|
   | Node.js version | 20.x (choose the highest 20.x available) |
   | Application mode | Production |
   | Application root | `api.yourdomain.com` (or any folder name — this is where code is stored) |
   | Application URL | `api.yourdomain.com` |
   | Application startup file | `dist/index.mjs` |

4. Click **Create**
5. cPanel shows you the **virtual environment path** and a button **Run NPM Install** — note both

---

### 11.4 Set environment variables in the Node.js App

Still in the **Setup Node.js App** interface, scroll to **Environment Variables** and add each one:

| Name | Value |
|---|---|
| `PORT` | `3000` (Passenger uses this port internally — do not change) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://...neon.tech/pilemetric?sslmode=require` |
| `CLERK_SECRET_KEY` | `sk_live_xxx` |
| `SESSION_SECRET` | (64-char random string) |
| `WEBODM_LIGHTNING_TOKEN` | Your WebODM Lightning API token |

Click **Save** after adding all variables.

> **Generate a secure SESSION_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

### 11.5 Build the project locally and prepare the API bundle

On your **local machine** (not on the server), run:

```bash
# Build the API server
NODE_ENV=production pnpm --filter @workspace/api-server run build
```

This produces `artifacts/api-server/dist/index.mjs` — a single bundled file with no `node_modules` needed.

---

### 11.6 Build the frontend locally

The frontend must be built with `VITE_API_URL` pointing to your API subdomain, because on Rumahweb the frontend and API are on different domains:

```bash
BASE_PATH=/ \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
VITE_API_URL=https://api.yourdomain.com/api \
pnpm --filter @workspace/stockpile run build
```

Output: `artifacts/stockpile/dist/public/` — ready to upload.

---

### 11.7 Upload the frontend via cPanel File Manager

1. cPanel → **Files** → **File Manager**
2. Navigate to `public_html/`
3. Delete any default placeholder files (`index.html`, `cgi-bin/`, etc.)
4. Click **Upload** → upload the entire contents of `artifacts/stockpile/dist/public/`

   **Directory structure inside `public_html/` must look like:**
   ```
   public_html/
   ├── index.html
   ├── assets/
   │   ├── index-xxxxx.js
   │   └── index-xxxxx.css
   └── favicon.ico
   ```

   > If you have many files, zip first: `cd artifacts/stockpile/dist/public && zip -r ../frontend.zip .` then upload and extract in File Manager.

5. Create a `.htaccess` file in `public_html/` with this content:

   ```apache
   Options -Indexes

   # SPA routing — send all non-file requests to index.html
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>

   # Increase upload size for photo batches
   <IfModule mod_php.c>
     php_value upload_max_filesize 500M
     php_value post_max_size 500M
   </IfModule>

   LimitRequestBody 524288000

   # Cache static assets
   <IfModule mod_expires.c>
     ExpiresActive On
     ExpiresByType text/css "access plus 1 year"
     ExpiresByType application/javascript "access plus 1 year"
     ExpiresByType image/png "access plus 1 month"
     ExpiresByType image/jpeg "access plus 1 month"
   </IfModule>
   ```

---

### 11.8 Upload the API server via cPanel File Manager

1. cPanel → **File Manager**
2. Navigate to the **Application root** folder you set in step 11.3 (e.g. `api.yourdomain.com/`)
3. Upload the file `artifacts/api-server/dist/index.mjs`

   Final structure:
   ```
   api.yourdomain.com/
   └── dist/
       └── index.mjs
   ```

4. Also create a `.htaccess` file in the `api.yourdomain.com/` root:

   ```apache
   # Increase body size for image batch uploads
   LimitRequestBody 524288000

   # Let Passenger handle everything
   PassengerEnabled On
   PassengerAppType node
   PassengerStartupFile dist/index.mjs
   ```

---

### 11.9 Start / restart the Node.js App

1. cPanel → **Setup Node.js App**
2. Find your app in the list
3. Click **Restart** (or **Start** if it was never started)
4. Wait 10–15 seconds, then click **Open** to verify the startup file path is correct

Test the API is alive:
```bash
curl https://api.yourdomain.com/api/healthz
# Expected: {"status":"ok"}
```

If you get a 500 error, check the application log inside cPanel → **Setup Node.js App** → view the error log link shown in the app row.

---

### 11.10 Enable SSL (HTTPS) for both domains

1. cPanel → **Security** → **SSL/TLS Status**
2. Both `yourdomain.com` and `api.yourdomain.com` should appear in the list
3. Click **Run AutoSSL** — Rumahweb uses Let's Encrypt via AutoSSL at no cost
4. Wait 2–5 minutes, then refresh — both domains should show a green padlock

> If AutoSSL fails for `api.yourdomain.com`, go to cPanel → **SSL/TLS** → **Install and Manage SSL** and issue a certificate manually for that subdomain.

---

### 11.11 Configure Clerk for the new domain

1. Log in to https://clerk.com → Your Application → **Settings** → **Domains**
2. Add your production domain: `yourdomain.com`
3. Under **Allowed Origins** add:
   - `https://yourdomain.com`
   - `https://api.yourdomain.com`
4. Clerk will verify domain ownership via DNS TXT record — follow the prompts
5. After verification, update `CLERK_PUBLISHABLE_KEY` to the **production** key (`pk_live_...`)
6. Rebuild and re-upload the frontend with the production key:
   ```bash
   BASE_PATH=/ \
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
   VITE_API_URL=https://api.yourdomain.com/api \
   pnpm --filter @workspace/stockpile run build
   ```

---

### 11.12 End-to-end deployment checklist

| Step | How to verify |
|---|---|
| Frontend loads | Open `https://yourdomain.com` — dashboard appears |
| API responds | `curl https://api.yourdomain.com/api/healthz` → `{"status":"ok"}` |
| Database connected | Admin login succeeds (returns JWT token) |
| Clerk auth works | Click Sign In → Clerk modal appears → can log in with Google/email |
| File upload works | Create a new job, upload 3+ photos → status changes to `queued` |
| NodeODM connected | Job status progresses from `queued` → `running` → `completed` |
| Volume calculated | After completion, draw polygon → volume appears in m³ |

---

### 11.13 Updating the deployment

Every time you push new code to GitHub, deploy manually:

**Update the API:**
```bash
# 1. Rebuild locally
NODE_ENV=production pnpm --filter @workspace/api-server run build

# 2. Upload artifacts/api-server/dist/index.mjs via cPanel File Manager
#    (overwrite the existing file in api.yourdomain.com/dist/)

# 3. Restart the Node.js App in cPanel → Setup Node.js App → Restart
```

**Update the frontend:**
```bash
# 1. Rebuild locally
BASE_PATH=/ \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
VITE_API_URL=https://api.yourdomain.com/api \
pnpm --filter @workspace/stockpile run build

# 2. Upload contents of artifacts/stockpile/dist/public/ to public_html/
#    (overwrite all files — keep the .htaccess you created)
```

**Schema changes:**
```bash
DATABASE_URL="postgresql://...neon.tech/pilemetric?sslmode=require" \
  pnpm --filter @workspace/db run push
```

---

### 11.14 FTP upload alternative (optional)

If File Manager is slow for large uploads, use an FTP client:

1. cPanel → **FTP Accounts** → Create a dedicated FTP account
2. Use [FileZilla](https://filezilla-project.org/) (free):
   - Host: `ftp.yourdomain.com`
   - Username: the FTP account you created
   - Password: as set
   - Port: `21`
3. Upload `public_html/` contents from `artifacts/stockpile/dist/public/`
4. Upload `dist/index.mjs` to `api.yourdomain.com/dist/`

---

## 12. Testing & Smoke Checks

### 12.1 API health check

```bash
curl -s https://your-domain.com/api/healthz
# Expected: {"status":"ok"}
```

### 12.2 Authentication flow

1. Open https://your-domain.com in a browser
2. Click **Sign In** — Clerk sign-in modal should appear
3. Sign in with Google or email/password
4. After sign-in, the dashboard should load

For local-admin login test:
```bash
curl -s -X POST https://your-domain.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"D1g1t3ch"}' | head -c 200
# Expected: {"token":"eyJ...","profile":{"id":"...","role":"super_admin"}}
```

### 12.3 Database connectivity

```bash
curl -s -X POST https://your-domain.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"D1g1t3ch"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{ const t=JSON.parse(d).token; require('child_process').execSync(\`curl -s -H 'Authorization: Bearer ${t}' https://your-domain.com/api/jobs\`) })"
# Expected: [] or a JSON array of jobs — confirms DB connectivity
```

### 12.4 WebODM token check

Log in to the app as super_admin → Settings → WebODM Settings. The token status should show green. Or test directly:

```bash
curl -s "https://spark1.webodm.net/api/projects/1/?token=YOUR_TOKEN"
# Expected: JSON with project data (not 401)
```

### 12.5 Image upload test

1. Log in to the app
2. Click **New Job**
3. Upload 3+ JPEG photos taken with GPS-enabled camera/phone
4. Submit the job
5. Status should progress: `queued → running → completed`
6. After completion, click **Edit Polygon** and draw a boundary
7. Volume should appear in m³ (not 0 and not 999999)

---

## 13. Troubleshooting

### API server does not start

**Symptom:** `Error: PORT environment variable is required`
**Fix:** Ensure `PORT` is set in the environment before starting.

```bash
# Check env
echo $PORT
# Set if missing
export PORT=8080
```

---

**Symptom:** `Error: CLERK_SECRET_KEY is not set` or Clerk 401 errors
**Fix:** Ensure `CLERK_SECRET_KEY` matches the key in your Clerk dashboard. Development and production keys are different (`sk_test_` vs `sk_live_`).

---

**Symptom:** `FATAL: database "pilemetric" does not exist`
**Fix:** Run the database creation commands from [Section 5](#5-database-setup). Then run schema push.

---

**Symptom:** `column "dsm_cache_b64" does not exist`
**Fix:** Schema push was not run after a code update. Run:
```bash
pnpm --filter @workspace/db run push
```

---

### Volume calculation is wrong / blown up

**Symptom:** Volume shows a very large number (e.g. 812 m³ for a small polygon)
**Cause:** DSM file was not downloaded before NodeODM cleared its assets, so the geometric fallback was used.
**Fix:**
1. Download `odm_dem/dsm.tif` and `odm_dem/dtm.tif` from the NodeODM output zip
2. Log in as super_admin
3. Call `POST /api/jobs/:id/recalculate-dsm` with a Bearer token — this uses the cached bytes

For new jobs this should not happen — DSM bytes are now cached immediately after processing.

---

### Frontend shows blank page / 404 in production

**Symptom:** Opening the app URL shows a blank white page or nginx 404
**Fix 1:** Check that the frontend was built:
```bash
ls artifacts/stockpile/dist/public/index.html
```
If missing, rebuild:
```bash
BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx pnpm --filter @workspace/stockpile run build
```

**Fix 2:** Nginx root path must point to `dist/public/`, not `dist/`:
```nginx
root /var/www/pilemetric/artifacts/stockpile/dist/public;
```

---

### `/api` routes return 404 from the browser

**Symptom:** API calls from the browser return HTML 404 (nginx default page)
**Cause:** Nginx proxy config is missing or misconfigured.
**Fix:** Check that the nginx `location /api/` block has `proxy_pass http://127.0.0.1:8080;` and that PM2 shows the API as **online**:
```bash
pm2 status
pm2 logs pilemetric-api --lines 50
```

---

### Kubernetes pods crash-looping

**Symptom:** `kubectl get pods -n pilemetric` shows `CrashLoopBackOff`
**Fix:**
```bash
kubectl logs -n pilemetric -l app=pilemetric-api --previous
```
Common cause: missing environment variable in the Secret. Verify all keys in `k8s/secrets.yaml` match what the API expects.

---

### NodeODM jobs stuck at "queued" forever

**Symptom:** Jobs submitted but never start processing
**Cause 1:** `WEBODM_LIGHTNING_TOKEN` is invalid or expired.
**Cause 2:** spark1.webodm.net is unavailable or rate-limiting.
**Fix:**
```bash
# Test the token
curl -s "https://spark1.webodm.net/api/projects/1/?token=YOUR_TOKEN"
```
If this returns 401, the token is wrong. Get a fresh token from https://webodm.net/lightning → Account.

---

### DSM download fails on polygon edit (status 404)

**Symptom:** Editing the polygon gives wrong/geometric estimate volume
**Cause:** NodeODM assets expired. spark1.webodm.net stores assets to S3 after completion. The DB cache (added in the current version) prevents this for new jobs.
**Fix for old jobs:** Provide the `dsm.tif` + `dtm.tif` files from the NodeODM output zip and use the recalculate endpoint:
```bash
# Inject DSM bytes into DB, then call:
POST /api/jobs/<id>/recalculate-dsm
Authorization: Bearer <admin-token>
```

---

### Clerk "Unauthorized" on every request after deploy

**Symptom:** All authenticated API calls return 401 after deploying to a new domain
**Fix:** Add the new domain to Clerk Dashboard → Allowed Origins. Also ensure `CLERK_PUBLISHABLE_KEY` in the frontend build matches `CLERK_SECRET_KEY` in the API server (they must be from the same Clerk application).

---

### Rumahweb — "Setup Node.js App" not visible in cPanel

**Symptom:** cPanel Software section does not show "Setup Node.js App"
**Cause:** Your current plan does not include Node.js support
**Fix:** Upgrade to Rumahweb **Business** hosting or higher. Alternatively, use Rumahweb **VPS** and follow the [VM Instance guide](#9-deploy--option-b-vm-instance-ubuntu--nginx--pm2) instead.

---

### Rumahweb — API returns 503 or "Application Error"

**Symptom:** `https://api.yourdomain.com/api/healthz` returns 503 Service Unavailable or a cPanel error page
**Cause 1:** The Node.js app is not started.
**Fix:** cPanel → Setup Node.js App → click **Restart**.

**Cause 2:** `dist/index.mjs` is missing or in the wrong folder.
**Fix:** Confirm the file exists at `api.yourdomain.com/dist/index.mjs` inside File Manager. The startup file configured in cPanel must match exactly.

**Cause 3:** A required environment variable is missing (e.g. `DATABASE_URL`).
**Fix:** cPanel → Setup Node.js App → edit the app → check all environment variables are set → Save → Restart.

---

### Rumahweb — Database connection refused from Neon

**Symptom:** API starts but crashes with `connection refused` or `SSL required`
**Cause:** Neon requires SSL. The `sslmode=require` parameter must be in the connection string.
**Fix:** Ensure `DATABASE_URL` ends with `?sslmode=require`:
```
postgresql://user:pass@ep-xxx.neon.tech/pilemetric?sslmode=require
```

---

### Rumahweb — Frontend shows blank page after upload

**Symptom:** `https://yourdomain.com` shows a blank white page
**Cause 1:** `index.html` is not in `public_html/` directly — it may be in a subfolder.
**Fix:** In File Manager, confirm `public_html/index.html` exists. If files are inside `public_html/dist/`, move them up one level.

**Cause 2:** Missing `.htaccess` for SPA routing — refreshing any page other than `/` gives 404.
**Fix:** Create the `.htaccess` file from [step 11.7](#117-upload-the-frontend-via-cpanel-file-manager) in `public_html/`.

---

### Rumahweb — Image uploads fail with 413 Request Entity Too Large

**Symptom:** Uploading photos returns error 413
**Fix:** The `LimitRequestBody` line in `.htaccess` must be present:
```apache
LimitRequestBody 524288000
```
Also check cPanel → **Select PHP Version** → PHP options → ensure `upload_max_filesize` and `post_max_size` are set to `500M`.

---

### Rumahweb — API crashes on large GeoTIFF files (out of memory)

**Symptom:** Volume calculation works for small jobs but crashes for large ones; cPanel error log shows `JavaScript heap out of memory`
**Cause:** Shared hosting RAM is too low for large DSM files.
**Fix options:**
1. Upgrade to Rumahweb VPS (minimum 4 GB RAM recommended)
2. Or use the Node.js app startup file with increased heap:
   - Change startup file to a wrapper script `start.sh` with:
     ```bash
     #!/bin/bash
     node --max-old-space-size=2048 --enable-source-maps dist/index.mjs
     ```
   - Make it executable and set it as the Passenger startup file

---

### Rumahweb — CORS error in browser console

**Symptom:** Browser shows `Access to fetch at 'https://api.yourdomain.com' from origin 'https://yourdomain.com' has been blocked by CORS policy`
**Cause:** The API server CORS config does not include your production frontend domain.
**Fix:** In cPanel → Setup Node.js App, add the environment variable:
```
ALLOWED_ORIGINS=https://yourdomain.com
```
Then restart the app. (The API server reads this to configure its CORS allowed origins.)
