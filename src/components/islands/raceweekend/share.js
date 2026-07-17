// Branded share-card renderer for the Visualisation Explorer.
// Serialises the live chart (SVG directly, or HTML via foreignObject) and
// draws it onto a canvas card in one of three social formats:
//   wide  1920×1080  (Reddit / X / link previews)
//   sq    1080×1080  (Instagram feed)
//   story 1080×1920  (Instagram / TikTok story)
// The canvas is supersampled at EXPORT_SCALE, so the downloaded PNG is
// double those dimensions — crisp after platform re-compression/zoom.
// Client-only (canvas + XMLSerializer).

export const SHARE_FORMATS = {
  wide: { w: 1920, h: 1080, label: '16:9 Wide' },
  sq: { w: 1080, h: 1080, label: '1:1 Feed' },
  story: { w: 1080, h: 1920, label: '9:16 Story' },
};
export const EXPORT_SCALE = 2;

const CARD_BG = '#0B0C0F';
const INSET_BG = '#141519';
const INSET_LINE = '#26272E';
const RED = '#E8002D';
const GREY = '#9A9BA3';
const LOGO_SRC = '/images/logo/f1gures-wordmark-dark.png';

function loadImg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function serializeNode(node) {
  // Returns { url, w, h } — an SVG data URI of the chart, declared at a
  // resolution ≥ its largest drawn size on the supersampled card (browsers
  // may rasterise SVG images at intrinsic size before scaling, so a
  // too-small declaration would soften the export).
  const svg = node.tagName?.toLowerCase() === 'svg' ? node : node.querySelector('svg');
  if (svg && !node.querySelector('select')) {
    const vb = svg.viewBox.baseVal;
    const k = Math.min(6, Math.max(2, Math.ceil(2100 / vb.width)));
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb.width * k);
    clone.setAttribute('height', vb.height * k);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', vb.width); bg.setAttribute('height', vb.height);
    bg.setAttribute('fill', '#0F1014');
    clone.insertBefore(bg, clone.firstChild);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    return { url, w: vb.width * k, h: vb.height * k };
  }
  // HTML chart (heat tables, bar lists, feeds) → foreignObject wrap.
  // MUST be serialized as XML (XMLSerializer), not outerHTML: HTML void tags
  // like the driver-face <img>s aren't well-formed XML and would make the
  // whole SVG unparseable (the export image silently error-events).
  const w = node.offsetWidth || 900;
  const h = Math.min(node.scrollHeight || 500, 1100);
  const k = Math.min(4, Math.max(2, Math.ceil(2100 / w)));
  const xhtml = new XMLSerializer().serializeToString(node).replace(/&nbsp;/g, ' ');
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * k}" height="${h * k}">` +
    `<foreignObject width="100%" height="100%" transform="scale(${k})">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;background:#0F1014;color:#F2F2F4;` +
    `font-family:'JetBrains Mono',monospace;">` +
    xhtml +
    `</div></foreignObject></svg>`;
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(html), w: w * k, h: h * k };
}

// Shrink a font size until `text` fits within maxWidth.
function fitFont(ctx, text, weight, family, startPx, minPx, maxWidth) {
  let px = startPx;
  while (px > minPx) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 4;
  }
  return px;
}

// Word-wrap `text` to maxWidth using the current ctx.font.
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width <= maxWidth) { line = probe; continue; }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

// meta: { raceName, circuit, roundTag ("R9 · 2026"), session, title, desc }
export async function renderShareCard(node, fmt, meta) {
  const { w: W, h: H } = SHARE_FORMATS[fmt] || SHARE_FORMATS.sq;
  const { url, w: iw, h: ih } = serializeNode(node);
  try { await document.fonts.ready; } catch { /* older browsers: draw anyway */ }
  const [img, logo] = await Promise.all([
    new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    }),
    loadImg(LOGO_SRC),
  ]);

  const cv = document.createElement('canvas');
  cv.width = W * EXPORT_SCALE; cv.height = H * EXPORT_SCALE;
  const ctx = cv.getContext('2d');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = CARD_BG; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = RED; ctx.fillRect(0, 0, W, 12); ctx.fillRect(0, H - 12, W, 12);

  const wide = fmt === 'wide';
  const story = fmt === 'story';
  const mx = wide ? 80 : 64;
  const aw = W - 2 * mx;
  const raceLine = `${meta.raceName.toUpperCase()}${meta.circuit ? ' · ' + meta.circuit.toUpperCase() : ''} · ${meta.session.toUpperCase()}`;

  if (story) {
    // 9:16 — scaled-up type; the description sits under the title and the
    // chart is centred inside a full-height framed inset, so wide charts read
    // as a deliberate composition instead of floating in dead space.
    let y = 168;
    if (logo && logo.width) {
      const lh = 56, lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, mx, y - lh, lw, lh);
    } else {
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + 10, y - 18, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 54px "Barlow Condensed", sans-serif';
      ctx.fillText('F1GURES', mx + 36, y);
    }
    ctx.font = '600 26px "JetBrains Mono", monospace'; ctx.fillStyle = GREY;
    ctx.textAlign = 'right'; ctx.fillText(meta.roundTag, W - mx, y); ctx.textAlign = 'left';
    y += 74;

    ctx.fillStyle = GREY;
    const rlPx = fitFont(ctx, raceLine, '500', '"JetBrains Mono", monospace', 26, 18, aw);
    ctx.font = `500 ${rlPx}px "JetBrains Mono", monospace`;
    ctx.fillText(raceLine, mx, y);
    y += 92;

    const title = meta.title.toUpperCase();
    const tPx = fitFont(ctx, title, '800', '"Barlow Condensed", sans-serif', 88, 56, aw);
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${tPx}px "Barlow Condensed", sans-serif`;
    ctx.fillText(title, mx, y);
    ctx.fillStyle = RED; ctx.fillRect(mx, y + 24, 120, 8);
    y += 88;

    ctx.font = '400 30px "Barlow", sans-serif';
    const descLines = meta.desc ? wrapText(ctx, meta.desc, aw, 3) : [];
    if (descLines.length) {
      ctx.fillStyle = '#C2C3CA';
      let ty = y + 18;
      for (const line of descLines) {
        ctx.fillText(line, mx, ty);
        ty += 46;
      }
      y = ty + 6;
    }

    // full-width framed inset that hugs the chart's height; the framed block
    // centres in the space between description and footer, so wide charts get
    // clean breathing room instead of acres of empty frame.
    const availTop = y + 16;
    const availBottom = H - 150;
    const pad = 28;
    const s = Math.min(1, (aw - 2 * pad) / iw, (availBottom - availTop - 2 * pad) / ih);
    const dw = iw * s, dh = ih * s;
    const panelH = dh + 2 * pad;
    // 42/58 split: optically centred, slightly high — dead centre reads as floating
    const panelTop = availTop + Math.max(0, (availBottom - availTop - panelH) * 0.42);
    ctx.fillStyle = INSET_BG; ctx.fillRect(mx, panelTop, aw, panelH);
    ctx.strokeStyle = INSET_LINE; ctx.strokeRect(mx + 0.5, panelTop + 0.5, aw - 1, panelH - 1);
    const dx = mx + (aw - dw) / 2, dy = panelTop + pad;
    ctx.drawImage(img, dx, dy, dw, dh);

    const fy = H - 76;
    ctx.font = '700 28px "JetBrains Mono", monospace'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText('www.f1gures.app', mx, fy);
    return cv.toDataURL('image/png');
  }

  // 16:9 wide + 1:1 feed
  let y = wide ? 96 : 110;
  if (logo && logo.width) {
    const lh = 44, lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, mx, y - lh, lw, lh);
  } else {
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + 8, y - 14, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 42px "Barlow Condensed", sans-serif';
    ctx.fillText('F1GURES', mx + 28, y);
  }
  ctx.font = '600 22px "JetBrains Mono", monospace'; ctx.fillStyle = GREY;
  ctx.textAlign = 'right'; ctx.fillText(meta.roundTag, W - mx, y); ctx.textAlign = 'left';
  y += wide ? 44 : 52;

  ctx.fillStyle = GREY;
  const rlPx = fitFont(ctx, raceLine, '500', '"JetBrains Mono", monospace', 23, 16, aw);
  ctx.font = `500 ${rlPx}px "JetBrains Mono", monospace`;
  ctx.fillText(raceLine, mx, y);
  y += wide ? 54 : 58;

  const title = meta.title.toUpperCase();
  const tPx = fitFont(ctx, title, '800', '"Barlow Condensed", sans-serif', 56, 40, aw);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${tPx}px "Barlow Condensed", sans-serif`;
  ctx.fillText(title, mx, y);
  ctx.fillStyle = RED; ctx.fillRect(mx, y + 18, 90, 6);

  const top = y + 56;
  const bottom = H - (wide ? 96 : 110);
  const ah = bottom - top;
  const s = Math.min(aw / iw, ah / ih);
  const dw = iw * s, dh = ih * s;
  const dx = mx + (aw - dw) / 2, dy = top + (ah - dh) / 2;
  ctx.fillStyle = INSET_BG; ctx.fillRect(dx - 14, dy - 14, dw + 28, dh + 28);
  ctx.strokeStyle = INSET_LINE; ctx.strokeRect(dx - 14.5, dy - 14.5, dw + 29, dh + 29);
  ctx.drawImage(img, dx, dy, dw, dh);

  const fy = H - (wide ? 44 : 52);
  ctx.font = '700 22px "JetBrains Mono", monospace'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText('www.f1gures.app', mx, fy);

  return cv.toDataURL('image/png');
}

export function shareFileName(meta, chartKey, fmt) {
  const slug = (s) => String(s || '').toLowerCase().replace(/grand prix/g, 'gp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dims = { wide: '16x9', sq: '1x1', story: '9x16' }[fmt] || fmt;
  return `f1gures-${slug(meta.raceName)}-${meta.year}-${slug(chartKey)}-${dims}.png`;
}
