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
    .slice(0, 22) || 'Kullanıcı';
}

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

// ---------- Devasa Yazılı & Önbelleksiz Tasarım ----------
async function render({ type, name, count, avatarUrl }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isLeave = type === 'leave';
  const accentColor = isLeave ? '#ff4757' : '#2ECC71';
  const accentGlow = isLeave ? 'rgba(255, 71, 87, 0.35)' : 'rgba(46, 204, 113, 0.35)';

  // 1. Arkaplan Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(0.5, '#111827');
  bgGrad.addColorStop(1, '#070a10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Arkaplan Neon Işığı
  const radialGlow = ctx.createRadialGradient(
    isLeave ? 800 : 210, 140, 10,
    isLeave ? 800 : 210, 140, 500
  );
  radialGlow.addColorStop(0, accentGlow);
  radialGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, W, H);

  // 3. Cam Efektli Kart Çerçevesi
  ctx.save();
  roundRect(ctx, 30, 30, W - 60, H - 60, 28);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();
  ctx.restore();

  // 4. Sol Taraf: Avatar
  const ax = 185;
  const ay = H / 2;
  const ar = 115;

  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 7, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.restore();

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

  // 5. Sağ Taraf: BÜYÜK YAZILAR
  const tx = 345;
  const maxTextW = W - tx - 50; // Yazının taşmaması için maksimum genişlik

  // Üst Durum Yazısı (34px)
  ctx.save();
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'left';
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = 12;
  const topLabel = isLeave ? 'ARAMIZDAN AYRILDI' : 'SUNUCUMUZA KATILDI';
  ctx.fillText(topLabel, tx, 165);
  ctx.restore();

  // DEVASA Kullanıcı Adı (82px'den başlar, sığmazsa otomatik ayarlar)
  ctx.save();
  let nameSize = 82;
  ctx.font = `bold ${nameSize}px ${FONT}`;
  while (nameSize > 38 && ctx.measureText(name).width > maxTextW) {
    nameSize -= 3;
    ctx.font = `bold ${nameSize}px ${FONT}`;
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 5;
  ctx.fillText(name, tx, 265);
  ctx.restore();

  // Büyük Alt Sayaç Rozeti (30px)
  const badgeY = 325;
  const badgeText = isLeave ? `Geriye ${count} kişi kaldık` : `Toplam ${count} üyeye ulaştık!`;
  
  ctx.save();
  ctx.font = `bold 30px ${FONT}`;
  const textWidth = ctx.measureText(badgeText).width;
  const badgeW = textWidth + 56;
  const badgeH = 66;
  const badgeX = tx;

  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 33);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.stroke();

  ctx.fillStyle = '#f3f4f6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + 28, badgeY + badgeH / 2 + 2);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ---------- Rotalar (Önbellek Kapalı - Anında Güncellenir) ----------
app.get('/image', async (req, res) => {
  try {
    const type = req.query.type === 'leave' ? 'leave' : 'welcome';
    const name = cleanName(req.query.name);
    const count = String(req.query.count || '0').replace(/\D/g, '').slice(0, 8) || '0';
    const avatarUrl = typeof req.query.avatar === 'string' ? req.query.avatar : '';

    const buf = await render({ type, name, count, avatarUrl });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
