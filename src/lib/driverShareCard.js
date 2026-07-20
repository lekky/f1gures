// driverShareCard — renders one of the driver-profile visual sections
// (Teammate Duels · Career Mosaic · Season Outcomes) to a shareable PNG on a
// <canvas>. Branded "f1gures" card in one of three social formats and either
// theme, matching the Compare Mode / Visualisation Explorer share flow:
//   sq     1080×1080  (Instagram feed — the default)
//   wide   1920×1080  (Reddit / X / link previews)
//   story  1080×1920  (Instagram / TikTok story)
//
//   const url  = await renderDriverCard('duels', payload, { fmt, light });
//   const blob = await buildDriverBlob('duels', payload, { fmt, light });
//
// Everything is hand-drawn (no external fetch beyond the brand wordmark) so the
// card carries the exact panel colours regardless of the site's live theme.
// Consumed by DriverSectionShare.jsx via the share modal.

export const DRIVER_SHARE_FORMATS = {
  // 'fit' has no fixed height — the card grows to exactly hold the driver's
  // data, so a light career (few teammates / seasons) gets a compact card and a
  // long one (Hamilton) gets a tall one, both at the same comfortable density.
  fit: { w: 1080, h: null, label: 'Auto' },
  sq: { w: 1080, h: 1080, label: '1:1 Feed' },
  wide: { w: 1920, h: 1080, label: '16:9 Wide' },
  story: { w: 1080, h: 1920, label: '9:16 Story' },
};
const EXPORT_SCALE = 2;

const DISPLAY = "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif";
const MONO = "'JetBrains Mono', 'Consolas', ui-monospace, monospace";

// Two palettes mirroring public/css/app.css :root (dark) / html.light. The red
// accent is constant across both; the outcome ramp + neutrals flip.
const THEMES = {
  dark: {
    bg: '#0B0C10', panel: '#16171C', line: '#2A2C34', track: '#23242A',
    fg: '#F5F5F5', fg2: '#B8B9BD', fg3: '#9A9BA1', fg4: '#8A8B91',
    accent: '#E8002D', accentText: '#FF3B57', gold: '#E0A82E',
    bandInk: '#0C0C0D', duelThem: '#484C56',
    twill: 'rgba(255,255,255,0.02)', logo: '/images/logo/f1gures-wordmark-dark.png',
    waffle: { win: '#E0A82E', podium: '#4C90D0', points: '#E8722E', finished: '#62656E', mech: '#CF463D', crash: '#97302F', dsq: '#611A22' },
  },
  light: {
    bg: '#FFFFFF', panel: '#F4F4F6', line: '#DADBE1', track: '#E6E7EC',
    fg: '#14151A', fg2: '#3C3D45', fg3: '#6C6D76', fg4: '#7A7B82',
    accent: '#E8002D', accentText: '#C8002A', gold: '#CF9A1F',
    bandInk: '#0C0C0D', duelThem: '#AAB0BC',
    twill: 'rgba(0,0,0,0.025)', logo: '/images/logo/f1gures-wordmark-light.png',
    waffle: { win: '#CF9A1F', podium: '#3B80C0', points: '#D8611F', finished: '#797C85', mech: '#BB3F36', crash: '#8A2A2A', dsq: '#5E1620' },
  },
};

// DNF kinds render with a diagonal hatch (both on the tiles and the legend
// swatch) so "did not finish" reads by texture, mirroring the mosaic on the
// page. Keep this set in sync with the .w-mech/.w-crash/.w-dsq CSS.
const HATCH_KINDS = new Set(['mech', 'crash', 'dsq']);

// Overlay a 45° hatch of faint light lines onto the rect just filled — matches
// the repeating-linear-gradient used by the page tiles.
function drawHatch(ctx, x, y, w, h, gap = 4) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = Math.max(1, gap / 4);
  for (let d = -h; d < w; d += gap) {
    ctx.beginPath();
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Per-section chrome: the accent kicker, the mono footer tag, and the file slug.
const SECTIONS = {
  duels: { kicker: 'TEAMMATE DUELS', tag: 'TEAMMATE DUELS', slug: 'teammate-duels' },
  mosaic: { kicker: 'CAREER MOSAIC', tag: 'CAREER MOSAIC', slug: 'career-mosaic' },
  outcomes: { kicker: 'SEASON OUTCOMES', tag: 'SEASON OUTCOMES', slug: 'season-outcomes' },
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

function teamHex(payload, PAL) {
  const c = payload.teamColor;
  return c && c[0] === '#' ? c : PAL.accent;
}

// Shrink `px` until `text` fits `maxW` at the given weight/family.
function fitFont(ctx, text, maxW, maxPx, weight = 800, family = DISPLAY, minPx = 18) {
  let px = maxPx;
  do {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 2;
  } while (px > minPx);
  return px;
}

// Truncate `text` with an ellipsis so it fits `maxW` at the current font.
function ellipsize(ctx, text, maxW) {
  const s = String(text || '');
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

// Draw a wrapping legend of {kind,label,count} chips. Returns the y baseline
// after the final row.
function drawLegend(ctx, PAL, counts, x, y, maxW, sw = 15, rowH = 30, fontPx = 20) {
  let cx = x, cy = y;
  const gap = 22, textGap = 9, countGap = 8;
  for (const c of counts) {
    ctx.font = `600 ${fontPx}px ${DISPLAY}`;
    const lblW = ctx.measureText(c.label).width;
    ctx.font = `400 ${fontPx - 2}px ${MONO}`;
    const cntW = ctx.measureText(String(c.count)).width;
    const chipW = sw + textGap + lblW + countGap + cntW;
    if (cx + chipW > x + maxW && cx > x) { cx = x; cy += rowH; }
    ctx.fillStyle = PAL.waffle[c.kind] || PAL.fg3;
    ctx.fillRect(cx, cy - sw + 2, sw, sw);
    if (HATCH_KINDS.has(c.kind)) drawHatch(ctx, cx, cy - sw + 2, sw, sw, 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PAL.fg2;
    ctx.font = `600 ${fontPx}px ${DISPLAY}`;
    ctx.fillText(c.label, cx + sw + textGap, cy);
    ctx.fillStyle = PAL.fg4;
    ctx.font = `400 ${fontPx - 2}px ${MONO}`;
    ctx.fillText(String(c.count), cx + sw + textGap + lblW + countGap, cy);
    cx += chipW + gap;
  }
  return cy;
}

// How many rows drawLegend would wrap `counts` into at width `maxW` — mirrors
// its chip-width maths so measure and draw stay in lock-step.
function measureLegendRows(ctx, counts, maxW, sw = 15, fontPx = 20) {
  let cx = 0, rows = 1;
  const gap = 22, textGap = 9, countGap = 8;
  for (const c of counts) {
    ctx.font = `600 ${fontPx}px ${DISPLAY}`;
    const lblW = ctx.measureText(c.label).width;
    ctx.font = `400 ${fontPx - 2}px ${MONO}`;
    const cntW = ctx.measureText(String(c.count)).width;
    const chipW = sw + textGap + lblW + countGap + cntW;
    if (cx + chipW > maxW && cx > 0) { cx = 0; rows++; }
    cx += chipW + gap;
  }
  return rows;
}

const DUEL_BAR_H = 46;
const DUEL_MATE_ROW_H = 74;
const LEGEND_ROW_H = 30;
const OUTCOME_ROW_H = 46;
const MOSAIC_TILE = 30;
const MOSAIC_GAP = 5;

// Natural (comfortable-density) height the section's body needs, in CSS px.
// Drives the 'fit' format's canvas height and the vertical centring in the
// fixed formats. Kept in step with the painters below.
function measureBody(section, ctx, PAL, payload, w) {
  if (section === 'duels') {
    const modes = [payload.quali, payload.race].filter((d) => d && (d.wins + d.losses) > 0).length;
    const rows = Math.ceil((payload.mates || []).length / 2);
    let h = modes * (DUEL_BAR_H + 60) + 28 + rows * DUEL_MATE_ROW_H;
    if ((payload.restCount || 0) > 0) h += 24;
    return h + 10;
  }
  if (section === 'mosaic') {
    const counts = payload.counts || [];
    const total = counts.reduce((s, c) => s + c.count, 0) || payload.total || 1;
    const legendH = (measureLegendRows(ctx, counts, w) - 1) * LEGEND_ROW_H;
    const cols = Math.max(1, Math.floor((w + MOSAIC_GAP) / (MOSAIC_TILE + MOSAIC_GAP)));
    const gridH = Math.ceil(total / cols) * (MOSAIC_TILE + MOSAIC_GAP) - MOSAIC_GAP;
    return 8 + legendH + 28 + gridH + 8;
  }
  const counts = payload.counts || [];
  const legendH = (measureLegendRows(ctx, counts, w) - 1) * LEGEND_ROW_H;
  return 8 + legendH + 26 + (payload.seasons || []).length * OUTCOME_ROW_H + 8;
}

function pct(w, l) {
  const n = w + l;
  return n > 0 ? Math.round((w / n) * 100) : 0;
}

// ── section painters ─────────────────────────────────────────────
// Each paints its visual inside the box { x, y, w, h } and is responsible for
// staying within it (scaling / truncating long content as needed).

function paintDuels(ctx, PAL, payload, box, teamCol) {
  const { x, w } = box;
  // Centre the whole block when the box is taller than the content needs
  // (fixed formats with a light career); it fills exactly under 'fit'.
  const naturalH = measureBody('duels', ctx, PAL, payload, w);
  let y = box.y + Math.max(0, (box.h - naturalH) / 2);
  const modes = [
    { label: 'QUALIFYING', d: payload.quali },
    { label: 'RACE', d: payload.race },
  ].filter((m) => m.d && (m.d.wins + m.d.losses) > 0);

  const barH = DUEL_BAR_H;
  const surname = (payload.surname || '').toUpperCase();

  for (const m of modes) {
    const wins = m.d.wins, losses = m.d.losses, p = pct(wins, losses);
    // labels row
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 22px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.fg2;
    ctx.fillText(`${surname} `, x, y);
    const swW = ctx.measureText(`${surname} `).width;
    ctx.fillStyle = teamCol;
    ctx.fillText(String(wins), x + swW, y);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.fg3;
    ctx.font = `400 16px ${MONO}`;
    ctx.fillText(m.label, x + w / 2, y);
    ctx.textAlign = 'right';
    ctx.font = `800 22px ${DISPLAY}`;
    ctx.fillStyle = PAL.fg2;
    ctx.fillText(` TEAMMATE`, x + w, y);
    const tmW = ctx.measureText(` TEAMMATE`).width;
    ctx.fillStyle = PAL.fg;
    ctx.fillText(String(losses), x + w - tmW, y);
    y += 12;

    // the bar
    const meW = Math.max(barH + 8, (w * p) / 100);
    ctx.fillStyle = teamCol;
    ctx.fillRect(x, y, meW, barH);
    ctx.fillStyle = PAL.duelThem;
    ctx.fillRect(x + meW, y, w - meW, barH);
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, barH - 1);
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(barH * 0.52)}px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.bandInk;
    ctx.fillText(`${p}%`, x + 12, y + barH / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = PAL.fg;
    ctx.fillText(`${100 - p}%`, x + w - 12, y + barH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    y += barH + 22;

    // foot line
    ctx.textAlign = 'left';
    ctx.font = `400 15px ${MONO}`;
    ctx.fillStyle = PAL.fg4;
    ctx.fillText(`${wins}–${losses} across ${wins + losses} weekends`, x, y);
    y += 26;
  }

  const mates = payload.mates || [];
  if (!mates.length) return;

  y += 6;
  ctx.textAlign = 'left';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = PAL.fg4;
  ctx.fillText('BY TEAMMATE', x, y);
  y += 22;

  // Two-column rival grid. Rows have: name+years, then Q and R mini-bar rows.
  const colGap = 40;
  const colW = (w - colGap) / 2;
  const rowH = 74;
  const remaining = box.y + box.h - y;
  let capacity = Math.max(0, Math.floor(remaining / rowH)) * 2;
  let show = mates;
  let hiddenExtra = payload.restCount || 0;
  if (mates.length > capacity) {
    // keep room for the "+N more" line
    capacity = Math.max(0, capacity - 1);
    show = mates.slice(0, capacity);
    hiddenExtra += mates.length - capacity;
  }

  const drawMini = (mx, my, mw, d, tag) => {
    const total = d.wins + d.losses;
    if (total === 0) return;
    const win = d.wins >= d.losses;
    const p = pct(d.wins, d.losses);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = PAL.fg4;
    ctx.fillText(tag, mx, my);
    const barX = mx + 20, recW = 62, barW = mw - 20 - recW - 8, bh = 10;
    ctx.fillStyle = PAL.track;
    ctx.fillRect(barX, my - bh / 2, barW, bh);
    ctx.fillStyle = win ? teamCol : PAL.duelThem;
    ctx.fillRect(barX, my - bh / 2, (barW * p) / 100, bh);
    ctx.textAlign = 'right';
    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = win ? PAL.fg : PAL.fg3;
    ctx.fillText(`${d.wins}–${d.losses}`, mx + mw, my);
    ctx.textBaseline = 'alphabetic';
  };

  show.forEach((mate, i) => {
    const col = i % 2;
    const mx = x + col * (colW + colGap);
    const my = y + Math.floor(i / 2) * rowH;
    // name + years
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 18px ${DISPLAY}`;
    ctx.fillStyle = PAL.fg;
    const yrsTxt = mate.years || '';
    ctx.font = `400 13px ${MONO}`;
    const yrsW = ctx.measureText(yrsTxt).width;
    ctx.font = `700 18px ${DISPLAY}`;
    const nm = ellipsize(ctx, `v ${mate.name}`, colW - yrsW - 10);
    ctx.fillText(nm, mx, my + 14);
    ctx.textAlign = 'right';
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = PAL.fg4;
    ctx.fillText(yrsTxt, mx + colW, my + 14);
    drawMini(mx, my + 38, colW, mate.quali, 'Q');
    drawMini(mx, my + 58, colW, mate.race, 'R');
  });

  if (hiddenExtra > 0) {
    const rows = Math.ceil(show.length / 2);
    const fy = y + rows * rowH + 4;
    ctx.textAlign = 'left';
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = PAL.fg4;
    ctx.fillText(`+${hiddenExtra} earlier teammate${hiddenExtra > 1 ? 's' : ''}`, x, fy);
  }
}

function paintMosaic(ctx, PAL, payload, box) {
  const { x, w } = box;
  let y = box.y + 8;
  y = drawLegend(ctx, PAL, payload.counts || [], x, y, w);
  y += 28;

  // Tile order follows whatever the user picked on the page. Chronological is
  // carried as a packed one-char-per-tile string (see WAFFLE_CODE in
  // DriverPage.astro); outcome order is reconstructed from the legend counts.
  const CODE_KIND = { w: 'win', p: 'podium', o: 'points', f: 'finished', m: 'mech', c: 'crash', d: 'dsq' };
  let tiles = [];
  if (payload.order === 'chrono' && payload.chrono) {
    tiles = payload.chrono.split('').map((ch) => CODE_KIND[ch]).filter(Boolean);
  } else {
    for (const c of payload.counts || []) for (let i = 0; i < c.count; i++) tiles.push(c.kind);
  }
  const total = tiles.length || payload.total || 1;
  const gridTop = y;
  const gridH = box.y + box.h - gridTop;
  const gridW = w;
  const gap = 5;
  // Pick the tile size that packs every tile into the available box. Search
  // downward from a comfortable size until rows × cols ≥ total fits the height.
  let tile = 30;
  for (; tile >= 6; tile -= 1) {
    const cols = Math.max(1, Math.floor((gridW + gap) / (tile + gap)));
    const rows = Math.ceil(total / cols);
    if (rows * (tile + gap) - gap <= gridH) break;
  }
  const cols = Math.max(1, Math.floor((gridW + gap) / (tile + gap)));
  const rows = Math.ceil(total / cols);
  const actualH = rows * (tile + gap) - gap;
  const top = gridTop + Math.max(0, (gridH - actualH) / 2); // centre in the box
  tiles.forEach((kind, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const tx = x + c * (tile + gap);
    const ty = top + r * (tile + gap);
    ctx.fillStyle = PAL.waffle[kind] || PAL.fg4;
    ctx.fillRect(tx, ty, tile, tile);
    if (HATCH_KINDS.has(kind)) drawHatch(ctx, tx, ty, tile, tile, Math.max(3, tile / 5));
  });
}

function paintOutcomes(ctx, PAL, payload, box) {
  const { x, w } = box;
  let y = box.y + 8;
  y = drawLegend(ctx, PAL, payload.counts || [], x, y, w);
  y += 26;

  const seasons = payload.seasons || [];
  const gridTop = y;
  const gridH = box.y + box.h - gridTop;
  const yearW = 56, teamW = Math.min(190, w * 0.24), gapC = 14;
  const barX = x + yearW + teamW + gapC * 2;
  const barW = x + w - barX;

  // Fit rows into the available height; truncate to the newest seasons if the
  // full list would overflow even at the minimum comfortable row height.
  let show = seasons;
  let hidden = 0;
  const minRowH = 30, maxRowH = 46;
  let rowH = Math.min(maxRowH, gridH / Math.max(1, seasons.length));
  if (rowH < minRowH) {
    const cap = Math.max(1, Math.floor(gridH / minRowH) - 1);
    show = seasons.slice(0, cap);
    hidden = seasons.length - cap;
    rowH = minRowH;
  }
  const barH = Math.min(26, rowH - 8);
  const rowsTop = gridTop + Math.max(0, (gridH - show.length * rowH) / 2); // centre in the box

  show.forEach((s, i) => {
    const cy = rowsTop + i * rowH;
    const mid = cy + rowH / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.font = `400 17px ${MONO}`;
    ctx.fillStyle = PAL.fg3;
    ctx.fillText(String(s.year), x + yearW, mid);
    ctx.textAlign = 'left';
    ctx.font = `600 16px ${DISPLAY}`;
    ctx.fillStyle = PAL.fg2;
    ctx.fillText(ellipsize(ctx, s.team || '—', teamW), x + yearW + gapC, mid);
    // stacked bar
    const by = mid - barH / 2;
    ctx.fillStyle = PAL.track;
    ctx.fillRect(barX, by, barW, barH);
    let bx = barX;
    for (const seg of s.segments || []) {
      const segW = (barW * seg.pct) / 100;
      ctx.fillStyle = PAL.waffle[seg.kind] || PAL.fg4;
      ctx.fillRect(bx, by, segW, barH);
      bx += segW;
    }
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, by + 0.5, barW - 1, barH - 1);
    ctx.textBaseline = 'alphabetic';
  });

  if (hidden > 0) {
    const fy = rowsTop + show.length * rowH + 18;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 15px ${MONO}`;
    ctx.fillStyle = PAL.fg4;
    ctx.fillText(`+${hidden} earlier season${hidden > 1 ? 's' : ''}`, barX, fy);
  }
}

const PAINTERS = { duels: paintDuels, mosaic: paintMosaic, outcomes: paintOutcomes };

// ── the branded card scaffold ────────────────────────────────────
export async function renderDriverCard(section, payload, { fmt = 'fit', light = false } = {}) {
  const PAL = THEMES[light ? 'light' : 'dark'];
  const meta = SECTIONS[section] || SECTIONS.duels;
  const fmtDef = DRIVER_SHARE_FORMATS[fmt] || DRIVER_SHARE_FORMATS.fit;
  const auto = fmtDef.h == null;
  const W = fmtDef.w;
  const wide = fmt === 'wide', story = fmt === 'story';
  const teamCol = teamHex(payload, PAL);

  const padX = wide ? 84 : 64;
  const padTop = story ? 84 : 56;
  const bodyGap = story ? 30 : 20;
  const footBelow = story ? 92 : wide ? 72 : 78;

  // Header geometry is deterministic (one-line kicker/name/blurb), so the body
  // top is known before the canvas height — which is what lets 'fit' size the
  // card to the data (header + measured body + footer).
  const kickerY = padTop + (story ? 84 : 66);
  const nameY = kickerY + (story ? 66 : 56);
  let afterName = nameY + 20;
  let blurbY = null;
  if (payload.blurb) { afterName += story ? 24 : 20; blurbY = afterName; afterName += 6; }
  const dividerY = afterName + 20;
  const bodyTop = dividerY + (story ? 46 : 34);

  const wordmark = await loadImg(PAL.logo);
  try { await document.fonts.ready; } catch { /* draw anyway */ }

  let H = fmtDef.h;
  if (auto) {
    const mctx = document.createElement('canvas').getContext('2d');
    H = bodyTop + measureBody(section, mctx, PAL, payload, W - padX * 2) + bodyGap + footBelow;
  }

  const canvas = document.createElement('canvas');
  canvas.width = W * EXPORT_SCALE;
  canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingQuality = 'high';

  // background + subtle twill
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PAL.twill;
  ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }

  // ── masthead: wordmark + "DRIVER PROFILE" tag ──
  ctx.textBaseline = 'alphabetic';
  const wmH = story ? 52 : 46;
  if (wordmark && wordmark.width) {
    const lw = (wordmark.width / wordmark.height) * wmH;
    ctx.drawImage(wordmark, padX, padTop - wmH + 8, lw, wmH);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.fg;
    ctx.font = `800 ${Math.round(wmH * 0.72)}px ${DISPLAY}`;
    ctx.fillText('F1GURES', padX, padTop);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${story ? 19 : 17}px ${MONO}`;
  ctx.fillText('DRIVER PROFILE', W - padX, padTop);

  // ── kicker (accent) + driver name + section blurb ──
  const nameMax = W - padX * 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.accent;
  ctx.font = `800 ${story ? 30 : 26}px ${DISPLAY}`;
  ctx.fillText(meta.kicker, padX, kickerY);
  const name = (payload.driverName || '').toUpperCase();
  const namePx = fitFont(ctx, name, nameMax, story ? 84 : wide ? 76 : 64);
  ctx.fillStyle = PAL.fg;
  ctx.font = `800 ${namePx}px ${DISPLAY}`;
  ctx.fillText(name, padX, nameY);
  if (blurbY != null) {
    ctx.fillStyle = PAL.fg3;
    ctx.font = `400 ${story ? 21 : 18}px ${MONO}`;
    ctx.fillText(ellipsize(ctx, payload.blurb, nameMax), padX, blurbY);
  }

  // divider
  ctx.strokeStyle = PAL.line;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padX, dividerY); ctx.lineTo(W - padX, dividerY); ctx.stroke();

  // ── body ──
  const footerLineY = H - footBelow;
  const box = { x: padX, y: bodyTop, w: W - padX * 2, h: footerLineY - bodyTop - bodyGap };
  (PAINTERS[section] || paintDuels)(ctx, PAL, payload, box, teamCol);

  // ── footer ──
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(padX, footerLineY); ctx.lineTo(W - padX, footerLineY); ctx.stroke();
  const footBase = footerLineY + (story ? 42 : 30);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.fg2;
  ctx.font = `700 ${story ? 24 : 20}px ${DISPLAY}`;
  ctx.fillText('www.f1gures.app', padX, footBase);
  ctx.textAlign = 'right';
  ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${story ? 16 : 14}px ${MONO}`;
  ctx.fillText(meta.tag, W - padX, footBase - 1);

  return canvas.toDataURL('image/png');
}

/** Convenience: the same card as a PNG Blob (for copy / native share). */
export async function buildDriverBlob(section, payload, opts) {
  const url = await renderDriverCard(section, payload, opts);
  return (await fetch(url)).blob();
}

/** Deterministic download filename for a section export. */
export function driverShareFileName(section, driverRef, fmt) {
  const meta = SECTIONS[section] || SECTIONS.duels;
  const dims = { fit: 'auto', sq: '1x1', wide: '16x9', story: '9x16' }[fmt] || fmt;
  return `f1gures-${driverRef}-${meta.slug}-${dims}.png`;
}
