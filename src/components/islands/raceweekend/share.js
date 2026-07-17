// Branded share-card renderer for the Visualisation Explorer.
// Serialises the live chart (SVG directly, or HTML via foreignObject) and
// draws it onto a canvas card in one of three social formats:
//   wide  1920×1080  (Reddit / X / link previews)
//   sq    1080×1080  (Instagram feed)
//   story 1080×1920  (Instagram / TikTok story)
// Client-only (canvas + XMLSerializer).

export const SHARE_FORMATS = {
  wide: { w: 1920, h: 1080, label: '16:9 Wide' },
  sq: { w: 1080, h: 1080, label: '1:1 Feed' },
  story: { w: 1080, h: 1920, label: '9:16 Story' },
};

const CARD_BG = '#0B0C0F';
const INSET_BG = '#141519';
const INSET_LINE = '#26272E';
const RED = '#E8002D';
const GREY = '#9A9BA3';
const FOOT = '#63646C';

function serializeNode(node) {
  // Returns { url, w, h } — an SVG data URI of the chart at 2x.
  const svg = node.tagName?.toLowerCase() === 'svg' ? node : node.querySelector('svg');
  if (svg && !node.querySelector('select')) {
    const vb = svg.viewBox.baseVal;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb.width * 2);
    clone.setAttribute('height', vb.height * 2);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', vb.width); bg.setAttribute('height', vb.height);
    bg.setAttribute('fill', '#0F1014');
    clone.insertBefore(bg, clone.firstChild);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    return { url, w: vb.width * 2, h: vb.height * 2 };
  }
  // HTML chart (heat tables, bar lists, feeds) → foreignObject wrap.
  // MUST be serialized as XML (XMLSerializer), not outerHTML: HTML void tags
  // like the driver-face <img>s aren't well-formed XML and would make the
  // whole SVG unparseable (the export image silently error-events).
  const w = node.offsetWidth || 900;
  const h = Math.min(node.scrollHeight || 500, 1100);
  const xhtml = new XMLSerializer().serializeToString(node).replace(/&nbsp;/g, ' ');
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}">` +
    `<foreignObject width="100%" height="100%" transform="scale(2)">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;background:#0F1014;color:#F2F2F4;` +
    `font-family:'JetBrains Mono',monospace;">` +
    xhtml +
    `</div></foreignObject></svg>`;
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(html), w: w * 2, h: h * 2 };
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
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = CARD_BG; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = RED; ctx.fillRect(0, 0, W, 12); ctx.fillRect(0, H - 12, W, 12);

  const wide = fmt === 'wide';
  const story = fmt === 'story';
  const mx = wide ? 80 : 64;
  const aw = W - 2 * mx;
  const raceLine = `${meta.raceName.toUpperCase()}${meta.circuit ? ' · ' + meta.circuit.toUpperCase() : ''} · ${meta.session.toUpperCase()}`;

  if (story) {
    // 9:16 — scaled-up type, top-anchored chart, description fills the rest.
    let y = 168;
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + 10, y - 18, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 54px "Barlow Condensed", sans-serif';
    ctx.fillText('F1GURES', mx + 36, y);
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
    y += 84;

    // chart: full width, capped to leave room for the desc; the chart+desc
    // group is centred in the space between title and footer so wide charts
    // don't leave one big dead zone at the bottom.
    const maxH = H - y - 320;
    const s = Math.min(aw / iw, maxH / ih);
    const dw = iw * s, dh = ih * s;
    ctx.font = '400 30px "Barlow", sans-serif';
    const descLines = meta.desc ? wrapText(ctx, meta.desc, aw, 4) : [];
    const descH = descLines.length ? 76 + descLines.length * 46 : 0;
    const footerTop = H - 170;
    const groupH = 14 + dh + 28 + descH;
    const shift = Math.max(0, (footerTop - y - groupH) / 2);
    const dx = mx + (aw - dw) / 2, dy = y + 14 + shift;
    ctx.fillStyle = INSET_BG; ctx.fillRect(dx - 14, dy - 14, dw + 28, dh + 28);
    ctx.strokeStyle = INSET_LINE; ctx.strokeRect(dx - 14.5, dy - 14.5, dw + 29, dh + 29);
    ctx.drawImage(img, dx, dy, dw, dh);

    if (descLines.length) {
      ctx.font = '400 30px "Barlow", sans-serif';
      ctx.fillStyle = '#C2C3CA';
      let ty = dy + dh + 76;
      for (const line of descLines) {
        ctx.fillText(line, mx, ty);
        ty += 46;
      }
    }

    const fy = H - 76;
    ctx.font = '700 28px "JetBrains Mono", monospace'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText('f1gures.app', mx, fy);
    ctx.textAlign = 'right'; ctx.fillStyle = FOOT; ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText('DATA VIA FASTF1', W - mx, fy); ctx.textAlign = 'left';
    return cv.toDataURL('image/png');
  }

  // 16:9 wide + 1:1 feed
  let y = wide ? 96 : 110;
  ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + 8, y - 14, 8, 0, 7); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 42px "Barlow Condensed", sans-serif';
  ctx.fillText('F1GURES', mx + 28, y);
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
  ctx.fillText('f1gures.app', mx, fy);
  ctx.textAlign = 'right'; ctx.fillStyle = FOOT;
  ctx.fillText('DATA VIA FASTF1', W - mx, fy); ctx.textAlign = 'left';

  return cv.toDataURL('image/png');
}

export function shareFileName(meta, chartKey, fmt) {
  const slug = (s) => String(s || '').toLowerCase().replace(/grand prix/g, 'gp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dims = { wide: '16x9', sq: '1x1', story: '9x16' }[fmt] || fmt;
  return `f1gures-${slug(meta.raceName)}-${meta.year}-${slug(chartKey)}-${dims}.png`;
}
