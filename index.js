const express = require('express');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const W = 1024;
const H = 576;

// ---------- Font ----------
let FONT = 'sans-serif';
const fontPath = path.join(__dirname, 'font.ttf');
if (fs.existsSync(fontPath)) {
  try {
    GlobalFonts.registerFromPath(fontPath, 'BotFont');
    FONT = 'BotFont';
  } catch (e) {
    console.error('Font yüklenemedi:', e.message);
  }
}

// ---------- Yardımcılar ----------
function isAllowedAvatar(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}

async function loadAvatar(url) {
  if (!url || !isAllowedAvatar(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

function cleanName(s) {
  return String(s || 'Kullanıcı')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 26) || 'Kullanıcı';
}

// ---------- Bellek Önbelleği ----------
const cache = new Map();
const CACHE_MAX = 200;
function cacheSet(key, buf) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, buf);
}

// Köşeleri yuvarlatılmış dikdörtgen yardımcısı
function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ---------- Modern & Şık Tasarım (Fotoğrafsız) ----------
async function render({ type, name, count, avatarUrl }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isLeave = type === 'leave';
  // Renkler: Hoş geldin için neon yeşil, Ayrılış için neon kırmızı
  const accentColor = isLeave ? '#ff4757' : '#2ed573';
  const accentGlow = isLeave ? 'rgba(255, 71, 87, 0.25)' : 'rgba(46, 213, 115, 0.25)';

  // 1. Derin koyu arkaplan gradienti
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(0.5, '#111827');
  bgGrad.addColorStop(1, '#070a10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Arkaplan neon ışık sızıntısı (Glow efekti)
  const radialGlow = ctx.createRadialGradient(
    isLeave ? 800 : 200, 100, 10,
    isLeave ? 800 : 200, 100, 450
  );
  radialGlow.addColorStop(0, accentGlow);
  radialGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, W, H);

  // 3. Cam efektli ana çerçeve (Glassmorphism kart)
  ctx.save();
  roundRect(ctx, 40, 40, W - 80, H - 80, 24);
  ctx.fillStyle = 'rgba(17, 24, 39, 0.75)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();
  ctx.restore();

  // 4. Sol Taraf: Avatar ve Parlayan Çerçevesi
  const ax = 210;
  const ay = H / 2;
  const ar = 120;

  // Avatar Dış Parıltısı
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 6, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.restore();

  // Avatar Maskesi ve Çizimi
  const avatar = await loadAvatar(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
  } else {
    ctx.fillStyle = '#374151';
    ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
  }
  ctx.restore();

  // 5. Sağ Taraf: Yazılar ve Rozetler
  const tx = 410;

  // Üst Durum Etiketi
  ctx.save();
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'left';
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = 10;
  const topLabel = isLeave ? 'ARAMIZDAN AYRILDI' : 'SUNUCUMUZA KATILDI';
  ctx.fillText(topLabel, tx, 175);
  ctx.restore();

  // Kullanıcı Adı (Büyük, Kalın ve Gölgeli)
  ctx.save();
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  
  let displayName = name;
  if (ctx.measureText(displayName).width > 540) {
    while (ctx.measureText(displayName + '...').width > 540 && displayName.length > 3) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  ctx.fillText(displayName, tx, 245);
  ctx.restore();

  // Alt Sayaç Rozeti (Pill Badge)
  const badgeY = 310;
  const badgeText = isLeave ? `Geriye ${count} kişi kaldık` : `Toplam ${count} üye ulaştık!`;
  
  ctx.save();
  ctx.font = `bold 22px ${FONT}`;
  const textWidth = ctx.measureText(badgeText).width;
  const badgeW = textWidth + 44;
  const badgeH = 50;
  const badgeX = tx;

  // Rozet Arka Planı (Hafif Şeffaf Kutu)
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 25);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();

  // Rozet Metni
  ctx.fillStyle = '#d1d5db';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + 22, badgeY + badgeH / 2 + 2);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ---------- Rotalar ----------
app.get('/image', async (req, res) => {
  try {
    const type = req.query.type === 'leave' ? 'leave' : 'welcome';
    const name = cleanName(req.query.name);
    const count = String(req.query.count || '0').replace(/\D/g, '').slice(0, 8) || '0';
    const avatarUrl = typeof req.query.avatar === 'string' ? req.query.avatar : '';

    const key = `${type}|${name}|${count}|${avatarUrl}`;
    let buf = cache.get(key);
    if (!buf) {
      buf = await render({ type, name, count, avatarUrl });
      cacheSet(key, buf);
    }

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get('/ping', (req, res) => res.status(204).end());
app.use((req, res) => res.status(404).end());

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

app.listen(PORT, () => console.log(`Çalışıyor: ${PORT}`));
