// compareCanvasCard — renders the N-way "head-to-head canvas" (compareCanvas
// output) to a shareable branded PNG, in the same three social formats + both
// themes as the 2-way card. Draws a face legend, a verdict strip, then one
// grouped metric block per metric (a colour-coded bar per entity). Reuses the
// low-level primitives (themes, image loader, avatar, fit-font) from
// compareShareCard.js so the two exporters stay visually identical.
//
//   const url  = await renderCanvasCard(canvas, { fmt, light });
//   const blob = await buildCanvasBlob(canvas, { fmt, light });
//
// `canvas` is the object from compareStats.compareCanvas (+ per-entity colours
// assigned by the launcher). Consumed by CompareLauncher's share modal.

import { fmtVal } from './compareStats.js';
import {
  THEMES, DISPLAY, MONO, EXPORT_SCALE, CMP_SHARE_FORMATS,
  loadImg, faceSrc, fitFont, drawAvatar,
} from './compareShareCard.js';

export const CANVAS_SHARE_FORMATS = CMP_SHARE_FORMATS;
const MAX_METRICS = 8; // the full driver/team canvas set — keeps the card's rows in step with the "of N" verdict

const surname = (name) => (name || '').trim().split(/\s+/).slice(-1)[0] || name;
const tagOf = (e) => (e.code || e.short || surname(e.name) || '?').toUpperCase();
const nameOf = (kind, e) => (kind === 'team' ? e.name : surname(e.name)).toUpperCase();

export async function renderCanvasCard(cvs, { fmt = 'sq', light = false } = {}) {
  const PAL = THEMES[light ? 'light' : 'dark'];
  const { w: W, h: H } = CANVAS_SHARE_FORMATS[fmt] || CANVAS_SHARE_FORMATS.sq;
  const wide = fmt === 'wide', story = fmt === 'story';
  const padX = W >= 1600 ? 84 : 60;
  const entities = cvs.entities;
  const N = entities.length;
  const metrics = cvs.metrics.slice(0, MAX_METRICS);

  const [faces, wordmark] = await Promise.all([
    Promise.all(entities.map((e) => loadImg(faceSrc(cvs.kind, e.ref)))),
    loadImg(PAL.logo),
  ]);
  try { await document.fonts.ready; } catch { /* draw anyway */ }

  const canvas = document.createElement('canvas');
  canvas.width = W * EXPORT_SCALE; canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingQuality = 'high';

  // background + subtle twill
  ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PAL.twill; ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }

  // ── masthead ──
  ctx.textBaseline = 'alphabetic';
  const padY = story ? 54 : 34;
  const wmH = story ? 52 : 44;
  const wmTop = padY - 12;
  if (wordmark && wordmark.width) {
    const lw = (wordmark.width / wordmark.height) * wmH;
    ctx.drawImage(wordmark, padX, wmTop, lw, wmH);
  } else {
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(padX + 5, wmTop + wmH * 0.75, 6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.fg;
    ctx.font = `800 ${Math.round(wmH * 0.7)}px ${DISPLAY}`;
    ctx.fillText('F1GURES', padX + 20, wmTop + wmH * 0.82);
  }
  ctx.textAlign = 'right'; ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${story ? 20 : 18}px ${MONO}`;
  ctx.fillText(`${cvs.kind === 'team' ? 'CONSTRUCTOR' : 'DRIVER'} CANVAS · ${N} COMPARED`, W - padX, wmTop + wmH * 0.75);
  const dividerY = wmTop + wmH + 20;
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(padX, dividerY); ctx.lineTo(W - padX, dividerY); ctx.stroke();

  // ── face legend (colour ↔ entity key) ──
  const legendTop = dividerY + (story ? 34 : 22);
  const slotW = (W - padX * 2) / N;
  const av = Math.min(wide ? 128 : 116, Math.floor(slotW * 0.52), story ? 150 : 130);
  entities.forEach((e, i) => {
    const sx = padX + slotW * i;
    const ax = sx + (slotW - av) / 2;
    drawAvatar(ctx, PAL, faces[i], ax, legendTop, av, e.color, tagOf(e), cvs.kind === 'team');
    ctx.textAlign = 'center'; ctx.fillStyle = PAL.fg;
    const nm = nameOf(cvs.kind, e);
    const nf = fitFont(ctx, nm, slotW - 12, wide ? 30 : 28, 800, 15);
    ctx.font = `800 ${nf}px ${DISPLAY}`;
    ctx.fillText(nm, sx + slotW / 2, legendTop + av + (story ? 36 : 30));
  });
  const legendBottom = legendTop + av + (story ? 48 : 42);

  // ── verdict strip ──
  const v = cvs.verdict;
  const vStripY = legendBottom + (story ? 10 : 6);
  const vStripH = story ? 60 : 50;
  ctx.fillStyle = PAL.panel; ctx.fillRect(padX, vStripY, W - padX * 2, vStripH);
  const leadColor = v.leaderIdx != null ? entities[v.leaderIdx].color : PAL.accentText;
  ctx.fillStyle = leadColor; ctx.fillRect(padX, vStripY, 4, vStripH);
  ctx.textAlign = 'left'; ctx.fillStyle = PAL.fg3;
  ctx.font = `700 ${story ? 16 : 14}px ${DISPLAY}`;
  ctx.fillText('VERDICT', padX + 20, vStripY + (story ? 26 : 22));
  ctx.fillStyle = PAL.fg; ctx.font = `800 ${story ? 28 : 24}px ${DISPLAY}`;
  const vtxt = v.leaderIdx != null
    ? `${nameOf(cvs.kind, entities[v.leaderIdx])} LEADS ${v.lead} OF ${v.of}`
    : 'TOO CLOSE TO CALL';
  ctx.fillText(vtxt, padX + 20, vStripY + (story ? 50 : 43));

  // ── metric blocks (one grouped bar set per metric) ──
  const footerLineY = H - (story ? 70 : 54);
  const rowsTop = vStripY + vStripH + (story ? 26 : 18);
  const rowsBottom = footerLineY - (story ? 24 : 18);
  const blockH = (rowsBottom - rowsTop) / metrics.length;
  const labelW = Math.round(W * 0.2);
  const valueW = Math.round(W * 0.085);
  const idW = Math.round(W * 0.08);
  const barsX0 = padX + labelW + idW;
  const barsX1 = W - padX - valueW - 12;
  const barW = barsX1 - barsX0;
  const inner = blockH * 0.8;
  const barH = Math.max(7, Math.min(inner / N - 4, wide ? 15 : 18));
  const barGap = N > 1 ? Math.max(4, Math.min(8, (inner - N * barH) / (N - 1))) : 0;

  metrics.forEach((m, mi) => {
    const blockTop = rowsTop + blockH * mi;
    // metric label (fit to its column) + unit, centred in the block
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.fg2; ctx.textBaseline = 'alphabetic';
    const lf = fitFont(ctx, m.label.toUpperCase(), labelW - 10, wide ? 22 : 20, 700, 14);
    ctx.font = `700 ${lf}px ${DISPLAY}`;
    ctx.fillText(m.label.toUpperCase(), padX, blockTop + blockH / 2 - 2);
    ctx.fillStyle = PAL.fg3; ctx.font = `400 ${wide ? 13 : 12}px ${MONO}`;
    ctx.fillText(m.unit, padX, blockTop + blockH / 2 + (wide ? 18 : 16));

    const present = m.values.filter((x) => x != null);
    const max = present.length ? Math.max(...present) : 0;
    const stackH = N * barH + (N - 1) * barGap;
    let by = blockTop + (blockH - stackH) / 2;
    m.values.forEach((val, ei) => {
      const e = entities[ei];
      const frac = max > 0 && val != null ? val / max : 0;
      const lead = m.leaders.length >= 1 && m.leaders.includes(ei);
      // entity code
      ctx.textAlign = 'left'; ctx.font = `600 ${wide ? 14 : 13}px ${MONO}`;
      ctx.fillStyle = lead ? PAL.fg : PAL.fg3;
      ctx.fillText(tagOf(e), padX + labelW, by + barH / 2 + 4);
      // track + fill
      ctx.fillStyle = PAL.track; ctx.fillRect(barsX0, by, barW, barH);
      ctx.fillStyle = e.color; ctx.fillRect(barsX0, by, Math.max(barW * frac, val ? 3 : 0), barH);
      // value
      ctx.textAlign = 'right'; ctx.font = `600 ${wide ? 18 : 16}px ${MONO}`;
      ctx.fillStyle = lead ? PAL.fg : PAL.fg3;
      ctx.fillText(fmtVal(val, m.fmt), W - padX, by + barH / 2 + (wide ? 6 : 5));
      by += barH + barGap;
    });
  });

  // ── footer ──
  ctx.strokeStyle = PAL.line;
  ctx.beginPath(); ctx.moveTo(padX, footerLineY); ctx.lineTo(W - padX, footerLineY); ctx.stroke();
  const footBase = footerLineY + (story ? 42 : 28);
  ctx.textAlign = 'left'; ctx.fillStyle = PAL.fg2;
  ctx.font = `700 ${story ? 24 : 20}px ${DISPLAY}`;
  ctx.fillText('www.f1gures.app', padX, footBase);
  ctx.textAlign = 'right'; ctx.fillStyle = PAL.fg3;
  ctx.font = `400 ${story ? 17 : 15}px ${MONO}`;
  ctx.fillText('COMPARE CANVAS', W - padX, footBase - 1);

  return canvas.toDataURL('image/png');
}

/** The same card as a PNG Blob (for copy / native share). */
export async function buildCanvasBlob(cvs, opts) {
  const url = await renderCanvasCard(cvs, opts);
  return (await fetch(url)).blob();
}

/** Deterministic download filename for a canvas export. */
export function canvasShareFileName(cvs, fmt) {
  const dims = { sq: '1x1', wide: '16x9', story: '9x16' }[fmt] || fmt;
  const refs = cvs.entities.map((e) => e.ref).join('-').slice(0, 80);
  return `f1gures-canvas-${refs}-${dims}.png`;
}
