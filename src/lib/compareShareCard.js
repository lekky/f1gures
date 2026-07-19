// compareShareCard — renders a Compare Mode result to a shareable PNG on a
// <canvas> (no dependency, no external fetch beyond the site's own face/badge
// images). Draws a branded "tale of the tape" card in one of three social
// formats and either theme:
//   sq     1080×1080  (Instagram feed — the default)
//   wide   1920×1080  (Reddit / X / link previews)
//   story  1080×1920  (Instagram / TikTok story)
// and dark or light, matching the Visualisation Explorer's share flow.
//
//   const url  = await renderCompareCard(cmp, { bColor, fmt, light });
//   const blob = await buildCompareBlob(cmp, { bColor, fmt, light });
//
// Consumed by CompareView (compareShared.jsx) via the share modal.

import { fmtVal } from './compareStats.js';
import { NATIONALITY } from './nationality.js';

export const CMP_SHARE_FORMATS = {
  sq: { w: 1080, h: 1080, label: '1:1 Feed' },
  wide: { w: 1920, h: 1080, label: '16:9 Wide' },
  story: { w: 1080, h: 1920, label: '9:16 Story' },
};
const EXPORT_SCALE = 2;

const DISPLAY = "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif";
const MONO = "'JetBrains Mono', 'Consolas', ui-monospace, monospace";
const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston' };

// The red accent is constant across both themes; everything else flips.
const THEMES = {
  dark: {
    bg: '#0B0C10', panel: '#16171C', line: '#2A2C34', track: '#23242A',
    fg: '#F5F5F5', fg2: '#B8B9BD', fg3: '#9A9BA1',
    accent: '#E8002D', accentText: '#FF3B57', white: '#FFFFFF',
    twill: 'rgba(255,255,255,0.02)', logo: '/images/logo/f1gures-wordmark-dark.png',
  },
  light: {
    bg: '#FFFFFF', panel: '#F4F4F6', line: '#DADBE1', track: '#E6E7EC',
    fg: '#14151A', fg2: '#3C3D45', fg3: '#6C6D76',
    accent: '#E8002D', accentText: '#C8002A', white: '#FFFFFF',
    twill: 'rgba(0,0,0,0.025)', logo: '/images/logo/f1gures-wordmark-light.png',
  },
};

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
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

function drawFlag(ctx, PAL, img, x, y, w, h) {
  if (!img) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const r = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * r) / 2, y + (h - img.height * r) / 2, img.width * r, img.height * r);
  ctx.restore();
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawLogo(ctx, PAL, img, x, y, s) {
  if (!img) return;
  ctx.fillStyle = PAL.white; ctx.fillRect(x, y, s, s);
  const pad = s * 0.14, iw = s - pad * 2;
  const r = Math.min(iw / img.width, iw / img.height);
  ctx.drawImage(img, x + (s - img.width * r) / 2, y + (s - img.height * r) / 2, img.width * r, img.height * r);
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(' ');
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

function fitFont(ctx, text, maxW, maxPx, weight = 800, minPx = 22) {
  let px = maxPx;
  do {
    ctx.font = `${weight} ${px}px ${DISPLAY}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 2;
  } while (px > minPx);
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

function drawAvatar(ctx, PAL, img, x, y, size, color, fallback, isTeam) {
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
      const ratio = Math.max(size / img.width, size / img.height);
      const w = img.width * ratio, h = img.height * ratio;
      ctx.drawImage(img, x + (size - w) / 2, y, w, h); // top-aligned for faces
    }
  } else {
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
  ctx.fillStyle = color;
  ctx.fillRect(x, y + size - 4, size, 4);
  ctx.strokeStyle = PAL.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/** Draw one mirrored metric row, its content vertically centred in [cy]. */
function drawRow(ctx, PAL, L, r, cy, aColor, bColor) {
  const a = r.a, b = r.b;
  let aFrac = 0, bFrac = 0;
  if (r.better === 'lo') {
    const m = Math.min(a ?? Infinity, b ?? Infinity);
    aFrac = a ? m / a : 0; bFrac = b ? m / b : 0;
  } else {
    const max = Math.max(a ?? 0, b ?? 0) || 1;
    aFrac = (a ?? 0) / max; bFrac = (b ?? 0) / max;
  }
  const F = L.rowFont;
  // label + unit (centred)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 ${F.label}px ${DISPLAY}`;
  ctx.fillText(r.label.toUpperCase(), L.cx, cy - 6);
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${F.unit}px ${MONO}`;
  ctx.fillText(r.unit, L.cx, cy + F.unit + 2);

  // values
  const aWin = r.winner === 'a', bWin = r.winner === 'b';
  ctx.font = `600 ${F.value}px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = aWin ? PAL.fg : PAL.fg3;
  ctx.fillText(fmtVal(a, r.fmt), L.aValRight, cy + 6);
  ctx.textAlign = 'left';
  ctx.fillStyle = bWin ? PAL.fg : PAL.fg3;
  ctx.fillText(fmtVal(b, r.fmt), L.bValLeft, cy + 6);

  // bars (left grows toward centre from the value; right mirrors)
  const barY = cy + 18, barH = L.barH;
  const lW = L.lBarX1 - L.lBarX0;
  const rW = L.rBarX1 - L.rBarX0;
  ctx.fillStyle = PAL.track;
  ctx.fillRect(L.lBarX0, barY, lW, barH);
  ctx.fillRect(L.rBarX0, barY, rW, barH);
  ctx.fillStyle = aWin ? aColor : PAL.line;
  ctx.fillRect(L.lBarX0 + lW - lW * aFrac, barY, lW * aFrac, barH);
  ctx.fillStyle = bWin ? bColor : PAL.line;
  ctx.fillRect(L.rBarX0, barY, rW * bFrac, barH);
}

/** All format-dependent geometry + fonts in one place. */
function computeLayout(fmt) {
  const { w: W, h: H } = CMP_SHARE_FORMATS[fmt] || CMP_SHARE_FORMATS.sq;
  const wide = fmt === 'wide', story = fmt === 'story';
  const padX = W >= 1600 ? 84 : 60;
  const cx = W / 2;

  // fighters — story shares the square's 1080 width, so its header keeps the
  // square's horizontal sizing; only the vertical rhythm + rows grow taller.
  const av = wide ? 168 : 150;
  const nameFont = wide ? 58 : 50;
  const teamFont = wide ? 24 : 22;
  const spanFont = wide ? 20 : 18;
  const vsFont = wide ? 52 : story ? 48 : 44;
  const verdictFont = wide ? 24 : story ? 23 : 21;

  // rows — value/bar/label columns, scale with width
  const valW = W >= 1200 ? 122 : 108;
  const barGap = 18;
  const labelHalf = Math.round(W * 0.099);
  const aValRight = padX + valW;
  const bValLeft = W - padX - valW;
  const lBarX0 = aValRight + barGap;
  const lBarX1 = cx - labelHalf;
  const rBarX0 = cx + labelHalf;
  const rBarX1 = W - padX - valW - barGap;
  const rowFont = story
    ? { label: 34, unit: 18, value: 40 }
    : wide
      ? { label: 30, unit: 16, value: 34 }
      : { label: 26, unit: 15, value: 30 };
  const barH = story ? 16 : wide ? 13 : 12;

  return {
    W, H, wide, story, padX, cx, av,
    nameFont, teamFont, spanFont, vsFont, verdictFont,
    aValRight, bValLeft, lBarX0, lBarX1, rBarX0, rBarX1, rowFont, barH,
    // vertical rhythm knobs
    padY: story ? 54 : 30,
    wmH: story ? 52 : 44,
    stripH: story ? 90 : wide ? 82 : 74,
    footerH: story ? 70 : 54,
  };
}

export async function renderCompareCard(cmp, { bColor, fmt = 'sq', light = false } = {}) {
  const PAL = THEMES[light ? 'light' : 'dark'];
  const L = computeLayout(fmt);
  const { W, H, padX, cx } = L;
  const A = cmp.a, B = cmp.b;
  const aColor = PAL.accent;
  const bCol = (bColor && bColor[0] === '#' ? bColor : null) || (B.color && B.color[0] === '#' ? B.color : null) || PAL.accentText;

  const [aImg, bImg, aFlag, bFlag, aLogo, bLogo, wordmark] = await Promise.all([
    loadImg(faceSrc(cmp.kind, A.ref)),
    loadImg(faceSrc(cmp.kind, B.ref)),
    loadImg(flagSrc(A.nationality)),
    loadImg(flagSrc(B.nationality)),
    loadImg(cmp.kind === 'team' ? null : logoSrc(A.teamRef)),
    loadImg(cmp.kind === 'team' ? null : logoSrc(B.teamRef)),
    loadImg(PAL.logo),
  ]);
  try { await document.fonts.ready; } catch { /* draw anyway */ }

  const canvas = document.createElement('canvas');
  canvas.width = W * EXPORT_SCALE; canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingQuality = 'high';

  // background + subtle twill
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PAL.twill;
  ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }

  // ── masthead: brand wordmark (falls back to dot + text) ──
  ctx.textBaseline = 'alphabetic';
  const wmTop = L.padY - 12;
  if (wordmark && wordmark.width) {
    const lh = L.wmH, lw = (wordmark.width / wordmark.height) * lh;
    ctx.drawImage(wordmark, padX, wmTop, lw, lh);
  } else {
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(padX + 5, wmTop + L.wmH * 0.75, 6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.fg;
    ctx.font = `800 ${Math.round(L.wmH * 0.7)}px ${DISPLAY}`;
    ctx.fillText('F1GURES', padX + 20, wmTop + L.wmH * 0.82);
  }
  const kindLabel = cmp.kind === 'team' ? 'CONSTRUCTOR HEAD-TO-HEAD' : 'DRIVER HEAD-TO-HEAD';
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${L.story ? 20 : 18}px ${MONO}`;
  ctx.fillText(kindLabel, W - padX, wmTop + L.wmH * 0.75);
  const dividerY = wmTop + L.wmH + 20;
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(padX, dividerY); ctx.lineTo(W - padX, dividerY); ctx.stroke();

  // ── fighters ──
  const av = L.av;
  const avY = dividerY + (L.story ? 40 : 24);
  drawAvatar(ctx, PAL, aImg, padX, avY, av, aColor, A.code || A.short || A.surname || A.name, cmp.kind === 'team');
  drawAvatar(ctx, PAL, bImg, W - padX - av, avY, av, bCol, B.code || B.short || B.surname || B.name, cmp.kind === 'team');

  const txtL = padX + av + 22;
  const txtR = W - padX - av - 22;
  const nameMaxW = (cx - (L.vsFont * 0.9)) - txtL; // keep long names clear of the centre VS
  // team labels
  ctx.font = `700 ${L.teamFont}px ${DISPLAY}`;
  ctx.textAlign = 'left'; ctx.fillStyle = aColor;
  ctx.fillText((cmp.kind === 'team' ? A.nationality : (A.team || A.nationality) || '').toUpperCase(), txtL, avY + L.teamFont + 2);
  ctx.textAlign = 'right'; ctx.fillStyle = bCol;
  ctx.fillText((cmp.kind === 'team' ? B.nationality : (B.team || B.nationality) || '').toUpperCase(), txtR, avY + L.teamFont + 2);
  // surnames (auto-fit so long names never reach the centre)
  const aName = (A.surname || A.name).toUpperCase();
  const bName = (B.surname || B.name).toUpperCase();
  const nameBase = avY + L.teamFont + L.nameFont + 8;
  ctx.fillStyle = PAL.fg;
  ctx.textAlign = 'left';
  ctx.font = `800 ${fitFont(ctx, aName, nameMaxW, L.nameFont)}px ${DISPLAY}`;
  ctx.fillText(aName, txtL, nameBase);
  ctx.textAlign = 'right';
  ctx.font = `800 ${fitFont(ctx, bName, nameMaxW, L.nameFont)}px ${DISPLAY}`;
  ctx.fillText(bName, txtR, nameBase);
  // spans
  const spanBase = nameBase + L.spanFont + 8;
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${L.spanFont}px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText(A.span || '', txtL, spanBase);
  ctx.textAlign = 'right';
  ctx.fillText(B.span || '', txtR, spanBase);
  // flag + team-logo marks under the span
  const mY = spanBase + 14, fW = 30, fH = 20, lS = 26;
  drawFlag(ctx, PAL, aFlag, txtL, mY, fW, fH);
  drawLogo(ctx, PAL, aLogo, txtL + fW + 10, mY - 3, lS);
  drawFlag(ctx, PAL, bFlag, txtR - fW, mY, fW, fH);
  drawLogo(ctx, PAL, bLogo, txtR - fW - 10 - lS, mY - 3, lS);

  // ── VS (centred on the avatars) + verdict (below the fighters) ──
  ctx.textAlign = 'center';
  ctx.fillStyle = PAL.accent;
  ctx.font = `800 ${L.vsFont}px ${DISPLAY}`;
  ctx.fillText('VS', cx, avY + av / 2 + L.vsFont * 0.34);
  const v = cmp.verdict;
  const verdictY = avY + av + (L.story ? 40 : 26);
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 ${L.verdictFont}px ${DISPLAY}`;
  if (v.lead) {
    const leadName = (v.lead === 'a' ? (A.surname || A.name) : (B.surname || B.name)).toUpperCase();
    const leadCount = v.lead === 'a' ? v.a : v.b;
    ctx.fillText(`${leadName} TAKES ${leadCount} OF ${v.of}`, cx, verdictY);
  } else {
    ctx.fillText(`DEAD HEAT ${v.a}–${v.b}`, cx, verdictY);
  }

  // ── context strip ──
  const cc = contextForCard(cmp);
  const stripY = verdictY + (L.story ? 26 : 20);
  const stripH = L.stripH;
  ctx.fillStyle = PAL.panel;
  ctx.fillRect(padX, stripY, W - padX * 2, stripH);
  ctx.fillStyle = cmp.context.type === 'era' ? '#FFB020' : cmp.context.type === 'teammate' ? bCol : PAL.accentText;
  ctx.fillRect(padX, stripY, 4, stripH);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `700 ${L.story ? 17 : 15}px ${DISPLAY}`;
  ctx.fillText(cc.kick.toUpperCase(), padX + 20, stripY + (L.story ? 30 : 26));
  ctx.fillStyle = PAL.fg;
  const ctxFont = L.story ? 19 : 17;
  ctx.font = `400 ${ctxFont}px ${MONO}`;
  const lines = wrapLines(ctx, cc.text, W - padX * 2 - 40, 2);
  const ctxTop = stripY + (L.story ? 54 : 48);
  lines.forEach((ln, i) => ctx.fillText(ln, padX + 20, ctxTop + i * (ctxFont + 5)));

  // ── metric rows (standard group), spread to fill the remaining height ──
  const rows = (cmp.groups[0]?.rows || []).slice(0, 7);
  const footerLineY = H - L.footerH;
  const rowsTop = stripY + stripH + (L.story ? 30 : 18);
  const rowsBottom = footerLineY - (L.story ? 30 : 22);
  const rowGap = rows.length ? (rowsBottom - rowsTop) / rows.length : 0;
  rows.forEach((r, i) => {
    const cy = rowsTop + rowGap * (i + 0.5);
    drawRow(ctx, PAL, L, r, cy, aColor, bCol);
  });

  // ── footer ──
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(padX, footerLineY); ctx.lineTo(W - padX, footerLineY); ctx.stroke();
  const footBase = footerLineY + (L.story ? 42 : 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 ${L.story ? 24 : 20}px ${DISPLAY}`;
  ctx.fillText('www.f1gures.app', padX, footBase);
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${L.story ? 17 : 15}px ${MONO}`;
  ctx.fillText('COMPARE MODE', W - padX, footBase - 1);

  return canvas.toDataURL('image/png');
}

/** Convenience: the same card as a PNG Blob (for copy / native share). */
export async function buildCompareBlob(cmp, opts) {
  const url = await renderCompareCard(cmp, opts);
  return (await fetch(url)).blob();
}

/** Deterministic download filename for a comparison export. */
export function compareShareFileName(cmp, fmt) {
  const dims = { sq: '1x1', wide: '16x9', story: '9x16' }[fmt] || fmt;
  return `f1gures-${cmp.a.ref}-vs-${cmp.b.ref}-${dims}.png`;
}
