// compareShareCard — renders a Compare Mode result to a shareable PNG on a
// <canvas> (no dependency, no external fetch beyond the site's own face/badge
// images). Always drawn on a dark, branded card sized 1080×1080 so it previews
// well on Reddit / WhatsApp / X regardless of the site's current theme.
//
//   const blob = await buildShareBlob(cmp, { bColor });
//
// Consumed by CompareCta.jsx for Save / Copy / Share.

import { fmtVal } from './compareStats.js';
import { NATIONALITY } from './nationality.js';

const PAL = {
  bg: '#0B0C10', panel: '#16171C', line: '#2A2C34', track: '#23242A',
  fg: '#F5F5F5', fg2: '#B8B9BD', fg3: '#9A9BA1', accent: '#E8002D', accentText: '#FF3B57', white: '#FFFFFF',
};
const DISPLAY = "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif";
const MONO = "'JetBrains Mono', 'Consolas', ui-monospace, monospace";
const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston' };
const WORDMARK_SRC = '/images/logo/f1gures-wordmark-dark.png';

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function faceSrc(kind, ref) {
  if (kind === 'team') return `/images/teams/${LOGO_ALIAS[ref] || ref}.jpg`;
  return `/images/drivers/${ref}.webp`;
}

function flagSrc(nat) {
  const n = nat && NATIONALITY[nat];
  return n && n.country ? `/images/flags/${n.country.toLowerCase()}.svg` : null;
}

function logoSrc(ref) {
  return ref ? `/images/teams/${LOGO_ALIAS[ref] || ref}.jpg` : null;
}

function drawFlag(ctx, img, x, y, w, h) {
  if (!img) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const r = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * r) / 2, y + (h - img.height * r) / 2, img.width * r, img.height * r);
  ctx.restore();
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawLogo(ctx, img, x, y, s) {
  if (!img) return;
  ctx.fillStyle = PAL.white; ctx.fillRect(x, y, s, s);
  const pad = s * 0.14, iw = s - pad * 2;
  const r = Math.min(iw / img.width, iw / img.height);
  ctx.drawImage(img, x + (s - img.width * r) / 2, y + (s - img.height * r) / 2, img.width * r, img.height * r);
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function fitFont(ctx, text, maxW, maxPx, weight = 800) {
  let px = maxPx;
  do {
    ctx.font = `${weight} ${px}px ${DISPLAY}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 2;
  } while (px > 22);
  return px;
}

function contextForCard(cmp) {
  const c = cmp.context, A = cmp.a, B = cmp.b;
  if (cmp.kind === 'team') {
    return {
      kick: 'Shared-season record',
      text: c.shared > 0
        ? `${c.shared} seasons head to head · ${A.name} led ${c.aAhead}, ${B.name} led ${c.bAhead}`
        : 'Their seasons never overlapped · a pure record comparison',
    };
  }
  if (c.type === 'teammate') {
    return {
      kick: `Teammates · ${c.years}`,
      text: `${c.weekends} weekends together · Qualifying ${c.quali.wins}–${c.quali.losses} · Race ${c.race.wins}–${c.race.losses}`,
    };
  }
  if (c.type === 'rival') {
    return {
      kick: 'On-track rivals',
      text: c.decided > 0
        ? `${c.shared} races on the same grid · ${A.surname} finished ahead ${c.aAhead}, ${B.surname} ${c.bAhead}`
        : `${c.shared} races on the same grid · never teammates`,
    };
  }
  return { kick: 'Different eras', text: `Never shared a grid · ${A.span} vs ${B.span}` };
}

function drawAvatar(ctx, img, x, y, size, color, fallback, isTeam) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  if (img) {
    if (isTeam) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(x, y, size, size);
      const pad = size * 0.12;
      const iw = size - pad * 2;
      const ratio = Math.min(iw / img.width, iw / img.height);
      const w = img.width * ratio, h = img.height * ratio;
      ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    } else {
      // cover
      const ratio = Math.max(size / img.width, size / img.height);
      const w = img.width * ratio, h = img.height * ratio;
      ctx.drawImage(img, x + (size - w) / 2, y, w, h); // top-aligned for faces
    }
  } else {
    // fallback monogram on a team-tinted panel
    ctx.fillStyle = PAL.panel;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(size * 0.4)}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((fallback || '?').slice(0, 3).toUpperCase(), x + size / 2, y + size / 2 + 2);
  }
  ctx.restore();
  // team-colour base rule + frame
  ctx.fillStyle = color;
  ctx.fillRect(x, y + size - 4, size, 4);
  ctx.strokeStyle = PAL.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/** Draw one mirrored metric row centred on cx. */
function drawRow(ctx, r, y, cx, aColor, bColor) {
  const a = r.a, b = r.b;
  let aFrac = 0, bFrac = 0;
  if (r.better === 'lo') {
    const m = Math.min(a ?? Infinity, b ?? Infinity);
    aFrac = a ? m / a : 0; bFrac = b ? m / b : 0;
  } else {
    const max = Math.max(a ?? 0, b ?? 0) || 1;
    aFrac = (a ?? 0) / max; bFrac = (b ?? 0) / max;
  }
  // label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 26px ${DISPLAY}`;
  ctx.fillText(r.label.toUpperCase(), cx, y - 4);
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 15px ${MONO}`;
  ctx.fillText(r.unit, cx, y + 15);

  // values
  const aWin = r.winner === 'a', bWin = r.winner === 'b';
  ctx.font = `600 30px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = aWin ? PAL.fg : PAL.fg3;
  ctx.fillText(fmtVal(a, r.fmt), 168, y + 8);
  ctx.textAlign = 'left';
  ctx.fillStyle = bWin ? PAL.fg : PAL.fg3;
  ctx.fillText(fmtVal(b, r.fmt), 912, y + 8);

  // bars (left grows toward centre from the value; right mirrors)
  const barY = y + 20, barH = 12;
  const lX0 = 185, lW = 250;   // 185..435
  const rX0 = 645, rW = 250;   // 645..895
  ctx.fillStyle = PAL.track;
  ctx.fillRect(lX0, barY, lW, barH);
  ctx.fillRect(rX0, barY, rW, barH);
  ctx.fillStyle = aWin ? aColor : PAL.line;
  ctx.fillRect(lX0 + lW - lW * aFrac, barY, lW * aFrac, barH);
  ctx.fillStyle = bWin ? bColor : PAL.line;
  ctx.fillRect(rX0, barY, rW * bFrac, barH);
}

export async function buildShareBlob(cmp, { bColor } = {}) {
  const A = cmp.a, B = cmp.b;
  const aColor = PAL.accent;
  const bCol = bColor || B.color || PAL.accentText;
  const [aImg, bImg, aFlag, bFlag, aLogo, bLogo, wordmark] = await Promise.all([
    loadImg(faceSrc(cmp.kind, A.ref)),
    loadImg(faceSrc(cmp.kind, B.ref)),
    loadImg(flagSrc(A.nationality)),
    loadImg(flagSrc(B.nationality)),
    loadImg(cmp.kind === 'team' ? null : logoSrc(A.teamRef)),
    loadImg(cmp.kind === 'team' ? null : logoSrc(B.teamRef)),
    loadImg(WORDMARK_SRC),
  ]);

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

  const pad = 60;
  // ── masthead: brand wordmark (falls back to dot + text) ──
  ctx.textBaseline = 'alphabetic';
  if (wordmark && wordmark.width) {
    const lh = 42, lw = (wordmark.width / wordmark.height) * lh;
    ctx.drawImage(wordmark, pad, 18, lw, lh);
  } else {
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(pad + 5, 52, 6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.fg;
    ctx.font = `800 30px ${DISPLAY}`;
    ctx.fillText('F1GURES', pad + 20, 62);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 18px ${MONO}`;
  ctx.fillText(cmp.kind === 'team' ? 'CONSTRUCTOR HEAD-TO-HEAD' : 'DRIVER HEAD-TO-HEAD', W - pad, 60);
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(pad, 84); ctx.lineTo(W - pad, 84); ctx.stroke();

  const cx = W / 2;
  // ── fighters ──
  const av = 150, avY = 104;
  drawAvatar(ctx, aImg, pad, avY, av, aColor, A.code || A.short || A.surname || A.name, cmp.kind === 'team');
  drawAvatar(ctx, bImg, W - pad - av, avY, av, bCol, B.code || B.short || B.surname || B.name, cmp.kind === 'team');

  const txtL = pad + av + 22;
  const txtR = W - pad - av - 22;
  const nameMaxW = (cx - 66) - txtL; // keep long names clear of the centre VS
  // team labels
  ctx.font = `700 22px ${DISPLAY}`;
  ctx.textAlign = 'left'; ctx.fillStyle = aColor;
  ctx.fillText((cmp.kind === 'team' ? A.nationality : (A.team || A.nationality) || '').toUpperCase(), txtL, avY + 24);
  ctx.textAlign = 'right'; ctx.fillStyle = bCol;
  ctx.fillText((cmp.kind === 'team' ? B.nationality : (B.team || B.nationality) || '').toUpperCase(), txtR, avY + 24);
  // surnames (auto-fit so long names never reach the centre)
  const aName = (A.surname || A.name).toUpperCase();
  const bName = (B.surname || B.name).toUpperCase();
  ctx.fillStyle = PAL.fg;
  ctx.textAlign = 'left';
  ctx.font = `800 ${fitFont(ctx, aName, nameMaxW, 50)}px ${DISPLAY}`;
  ctx.fillText(aName, txtL, avY + 78);
  ctx.textAlign = 'right';
  ctx.font = `800 ${fitFont(ctx, bName, nameMaxW, 50)}px ${DISPLAY}`;
  ctx.fillText(bName, txtR, avY + 78);
  // spans
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 18px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText(A.span || '', txtL, avY + 106);
  ctx.textAlign = 'right';
  ctx.fillText(B.span || '', txtR, avY + 106);
  // flag + team-logo marks under the span
  const mY = avY + 122, fW = 30, fH = 20, lS = 26;
  drawFlag(ctx, aFlag, txtL, mY, fW, fH);
  drawLogo(ctx, aLogo, txtL + fW + 10, mY - 3, lS);
  drawFlag(ctx, bFlag, txtR - fW, mY, fW, fH);
  drawLogo(ctx, bLogo, txtR - fW - 10 - lS, mY - 3, lS);

  // ── VS + verdict (verdict on its own line, below the fighters) ──
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.accent;
  ctx.font = `800 44px ${DISPLAY}`;
  ctx.fillText('VS', cx, avY + 62);
  const v = cmp.verdict;
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 21px ${DISPLAY}`;
  if (v.lead) {
    const leadName = (v.lead === 'a' ? (A.surname || A.name) : (B.surname || B.name)).toUpperCase();
    const leadCount = v.lead === 'a' ? v.a : v.b;
    ctx.fillText(`${leadName} TAKES ${leadCount} OF ${v.of}`, cx, avY + av + 26);
  } else {
    ctx.fillText(`DEAD HEAT ${v.a}–${v.b}`, cx, avY + av + 26);
  }

  // ── context strip ──
  const cc = contextForCard(cmp);
  const stripY = 308, stripH = 74;
  ctx.fillStyle = PAL.panel;
  ctx.fillRect(pad, stripY, W - pad * 2, stripH);
  ctx.fillStyle = cmp.context.type === 'era' ? '#FFB020' : cmp.context.type === 'teammate' ? bCol : PAL.accentText;
  ctx.fillRect(pad, stripY, 4, stripH);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `700 15px ${DISPLAY}`;
  ctx.fillText(cc.kick.toUpperCase(), pad + 20, stripY + 26);
  ctx.fillStyle = PAL.fg;
  ctx.font = `400 17px ${MONO}`;
  const lines = wrapLines(ctx, cc.text, W - pad * 2 - 40, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, pad + 20, stripY + 48 + i * 22));

  // ── metric rows (standard group) ──
  const rows = (cmp.groups[0]?.rows || []).slice(0, 7);
  let ry = 452;
  const rowGap = 76;
  for (const r of rows) { drawRow(ctx, r, ry, cx, aColor, bCol); ry += rowGap; }

  // ── footer ──
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(pad, H - 56); ctx.lineTo(W - pad, H - 56); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 20px ${DISPLAY}`;
  ctx.fillText('www.f1gures.app', pad, H - 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 15px ${MONO}`;
  ctx.fillText('COMPARE MODE', W - pad, H - 29);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
