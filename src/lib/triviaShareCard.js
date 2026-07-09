// triviaShareCard — renders a "Did You Know" trivia fact to a shareable PNG on
// a <canvas>. Always drawn on a dark, branded card sized 1080×1080 so it
// previews well on Reddit / WhatsApp / X regardless of the site's current
// theme. Carries the f1gures brand wordmark (loaded from /images/logo/).
//
//   const blob = await buildTriviaShareBlob(factText);
//
// Consumed by TriviaBoard.jsx for its Share action.

const PAL = {
  bg: '#0B0C10', panel: '#16171C', line: '#2A2C34',
  fg: '#F5F5F5', fg2: '#B8B9BD', fg3: '#9A9BA1', accent: '#E8002D', white: '#FAFAFA',
};
const DISPLAY = "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif";
const MONO = "'JetBrains Mono', 'Consolas', ui-monospace, monospace";
const LOGO_SRC = '/images/logo/f1gures-wordmark-dark.png';

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Wrap `text` into lines that fit `maxW` at the current font.
function wrapLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Pick the largest font size (within [min, max]) at which the fact wraps into
// no more than `maxLines` lines within `maxW`. Returns { px, lines, lineH }.
function fitFact(ctx, text, maxW, maxLines) {
  let px = 68;
  const min = 30;
  let lines = [];
  for (; px >= min; px -= 2) {
    ctx.font = `800 ${px}px ${DISPLAY}`;
    lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines) break;
  }
  return { px, lines, lineH: px * 1.16 };
}

export async function buildTriviaShareBlob(fact) {
  const text = (fact || '').trim();
  const logo = await loadImg(LOGO_SRC);
  const W = 1080, H = 1080, S = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  // background + subtle twill
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }

  const pad = 72;

  // ── masthead: brand wordmark (falls back to text), section label on the right ──
  ctx.textBaseline = 'alphabetic';
  if (logo && logo.width) {
    const lh = 52, lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, pad, 40, lw, lh);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.fg;
    ctx.font = `800 34px ${DISPLAY}`;
    ctx.fillText('F1GURES', pad, 80);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 18px ${MONO}`;
  ctx.fillText('F1 TRIVIA', W - pad, 76);
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(pad, 112); ctx.lineTo(W - pad, 112); ctx.stroke();

  // ── "DID YOU KNOW" kicker ──
  ctx.fillStyle = PAL.accent;
  ctx.beginPath(); ctx.arc(pad + 6, 176, 7, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.accent;
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillText('DID YOU KNOW', pad + 26, 187);

  // ── the fact, auto-fit and centred in the body ──
  const maxW = W - pad * 2;
  const { px, lines, lineH } = fitFact(ctx, text, maxW, 8);
  ctx.font = `800 ${px}px ${DISPLAY}`;
  ctx.fillStyle = PAL.fg;
  ctx.textAlign = 'left';
  const blockH = lines.length * lineH;
  const bodyTop = 240, bodyBottom = H - 150;
  let y = bodyTop + Math.max(0, (bodyBottom - bodyTop - blockH) / 2) + px;
  for (const ln of lines) {
    ctx.fillText(ln, pad, y);
    y += lineH;
  }

  // ── footer ──
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(pad, H - 64); ctx.lineTo(W - pad, H - 64); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 22px ${DISPLAY}`;
  ctx.fillText('f1gures.app', pad, H - 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 15px ${MONO}`;
  ctx.fillText('DID YOU KNOW', W - pad, H - 33);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
