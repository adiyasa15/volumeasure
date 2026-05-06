#!/usr/bin/env bash
# =============================================================================
# PileMetric — Deploy / Update Script
# Jalankan setelah "git pull" di VM production.
#
# Usage:
#   chmod +x deploy.sh          # sekali saja
#   ./deploy.sh                 # setiap kali update kode
#
# Apa yang dilakukan script ini:
#   1. Install / update dependensi npm
#   2. Push perubahan skema database (jika ada)
#   3. Build API server  → artifacts/api-server/dist/index.mjs
#   4. Build frontend    → artifacts/stockpile/dist/public/
#   5. Restart service   → systemd (pilemetric-api) atau PM2
# =============================================================================

set -euo pipefail

# ── Warna terminal ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step()  { echo -e "${GREEN}▶ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $1${NC}"; }
error() { echo -e "${RED}✗  $1${NC}"; exit 1; }

# ── Validasi: harus dijalankan dari root project ──────────────────────────────
if [ ! -f "pnpm-workspace.yaml" ]; then
  error "Jalankan script ini dari root project (direktori yang berisi pnpm-workspace.yaml)"
fi

# ── 1. Install dependensi ─────────────────────────────────────────────────────
step "Install / update dependensi npm..."
pnpm install --frozen-lockfile

# ── 2. Push skema database ────────────────────────────────────────────────────
step "Push skema database (drizzle-kit push)..."
pnpm --filter @workspace/db run push

# ── 3. Build API server ───────────────────────────────────────────────────────
step "Build API server..."
pnpm --filter @workspace/api-server run build
echo "   Output: artifacts/api-server/dist/index.mjs"

# ── 4. Build frontend ─────────────────────────────────────────────────────────
step "Build frontend (Vite)..."
BASE_PATH=/ pnpm --filter @workspace/stockpile run build
echo "   Output: artifacts/stockpile/dist/public/"

# ── 5. Restart service ────────────────────────────────────────────────────────
step "Restart API server..."

if systemctl is-active --quiet pilemetric-api 2>/dev/null; then
  sudo systemctl restart pilemetric-api
  echo "   systemd: pilemetric-api restarted"
elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "pilemetric"; then
  pm2 restart pilemetric
  echo "   PM2: pilemetric restarted"
else
  warn "Service tidak ditemukan (systemd: pilemetric-api / PM2: pilemetric)."
  warn "Restart manual: sudo systemctl restart pilemetric-api"
fi

echo ""
echo -e "${GREEN}✓ Deploy selesai.${NC}"
echo ""
echo "  Cek log API:  sudo journalctl -u pilemetric-api -f"
echo "  Cek status:   sudo systemctl status pilemetric-api"
