const express = require('express');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
const PORT = process.env.PORT || 3000;
const W = 1024;
const H = 576;

// Opsiyonel font: repoya font.ttf koyarsan kullanılır (Linux sunucuda sistem fontu olmayabilir)
let FONT = 'sans-serif';
const fontPath = path.join(__dirname, 'font.ttf');
if (fs.existsSync(fontPath)) {
  GlobalFonts.registerFromPath(fontPath, 'BotFont');
  FONT = 'BotFont';
}

// Arka plan: background.png / .jpg / .jpeg
const bgFile = ['background.png', 'background.jpg', 'background.jpeg']
  .map((f) => path.join(__dirname, f))
  .find((f) => fs.existsSync(f));

let bgImagePromise = bgFile ? loadImage(bgFile) : null;

// Güvenlik: sadece Discord CDN avatarlarına izin ver
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
    const res = await fetch(url);
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

app.get('/', (req, res) => res.send('Hoş geldin görsel sunucusu çalışıyor.'));

// Örnek: /image?type=welcome&name=Ahmet&avatar=https://cdn.discordapp.com/...&count=240
app.get('/image', async (req, res) => {
  try {
    const type = req.query.type === 'leave' ? 'leave' : 'welcome';
    const name = String(req.query.name || 'Kullanıcı').slice(0, 20);
    const count = String(req.query.count || '0').slice(0, 8);
    const avatarUrl = req.query.avatar;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Arka plan
    if (bgImagePromise) {
      drawCover(ctx, await bgImagePromise);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1b2a41');
      g.addColorStop(1, '#ff7a45');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Okunabilirlik için hafif karartma
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);

    // Avatar (daire + açık yeşil çerçeve)
    const cx = W / 2;
    const cy = 190;
    const r = 135;

    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#b5e8a8';
    ctx.fill();

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
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    const title = type === 'leave' ? `Güle Güle ${name}!` : `Hoş Geldin ${name}!`;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 60px ${FONT}`;
    ctx.fillText(title, cx, 440);

    ctx.fillStyle = '#e6e6e6';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(`#${count}`, cx, 510);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(canvas.toBuffer('image/png'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Görsel oluşturulamadı');
  }
});

app.listen(PORT, () => console.log(`Çalışıyor: ${PORT}`));
