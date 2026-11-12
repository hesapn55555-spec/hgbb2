const express = require('express');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const W = 1024;
const H = 576;

// ---------- Font (repoya font.ttf koyarsan kullanılır) ----------
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

// ---------- Arka plan (background.png / .jpg / .jpeg) ----------
const bgFile = ['background.png', 'background.jpg', 'background.jpeg']
  .map((f) => path.join(__dirname, f))
  .find((f) => fs.existsSync(f));

const bgPromise = bgFile
  ? loadImage(bgFile).catch((e) => {
      console.error('Arka plan yüklenemedi:', e.message);
      return null;
    })
  : Promise.resolve(null);

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

function drawCover(ctx, img) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// Yazı sığmazsa fontu küçült
function fitFont(ctx, text, maxWidth, start, min) {
  let size = start;
  ctx.font = `bold ${size}px ${FONT}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `bold ${size}px ${FONT}`;
  }
}

function cleanName(s) {
  return String(s || 'Kullanıcı')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 32) || 'Kullanıcı';
}

// ---------- Küçük bellek önbelleği ----------
const cache = new Map();
const CACHE_MAX = 200;
function cacheSet(key, buf) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, buf);
}

// ---------- Görsel üretimi ----------
async function render({ type, name, count, avatarUrl }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Arka plan
  const bg = await bgPromise;
  if (bg) {
    drawCover(ctx, bg);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b2a41');
    g.addColorStop(1, '#ff7a45');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Alt kısma doğru koyulaşan perde (yazılar rahat okunsun)
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.10)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  shade.addColorStop(1, 'rgba(0,0,0,0.60)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = 190;
  const r = 135;
  const accent = type === 'leave' ? '#ff9b9b' : '#b5e8a8';

  // Avatar çerçevesi + gölge
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  // Avatar
  const avatar = await loadAvatar(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#4f545c';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  // Yazılar
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  const title = type === 'leave' ? `Güle Güle ${name}!` : `Hoş Geldin ${name}!`;
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, title, W - 80, 60, 28);
  ctx.fillText(title, cx, 440);

  ctx.fillStyle = '#e8e8e8';
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(`#${count}`, cx, 512);

  return canvas.toBuffer('image/png');
}

// ---------- Rotalar ----------
// Örnek: /image?type=welcome&name=Ahmet&count=240&avatar=https://cdn.discordapp.com/...
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

// Uyumasın diye UptimeRobot gibi bir servisle ping atılabilir (içerik döndürmez)
app.get('/ping', (req, res) => res.status(204).end());

// Diğer her şey (ana sayfa dahil) boş 404
app.use((req, res) => res.status(404).end());

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

app.listen(PORT, () => console.log(`Çalışıyor: ${PORT}`));
