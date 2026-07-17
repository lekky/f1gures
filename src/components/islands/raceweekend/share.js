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
  const w = node.offsetWidth || 900;
  const h = Math.min(node.scrollHeight || 500, 1100);
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}">` +
    `<foreignObject width="100%" height="100%" transform="scale(2)">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;background:#0F1014;color:#F2F2F4;` +
    `font-family:'JetBrains Mono',monospace;">` +
    node.outerHTML.replace(/&nbsp;/g, ' ') +
    `</div></foreignObject></svg>`;
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(html), w: w * 2, h: h * 2 };
}

// meta: { raceName, circuit, roundTag ("R9 · 2026"), session, title }
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
  let y = story ? 170 : wide ? 96 : 110;

  // wordmark row
  ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + 8, y - 14, 8, 0, 7); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 42px "Barlow Condensed", sans-serif';
  ctx.fillText('F1GURES', mx + 28, y);
  ctx.font = '600 22px "JetBrains Mono", monospace'; ctx.fillStyle = GREY;
  ctx.textAlign = 'right'; ctx.fillText(meta.roundTag, W - mx, y); ctx.textAlign = 'left';
  y += story ? 64 : wide ? 44 : 52;

  // race / session line
  ctx.fillStyle = GREY; ctx.font = '500 23px "JetBrains Mono", monospace';
  ctx.fillText(`${meta.raceName.toUpperCase()}${meta.circuit ? ' · ' + meta.circuit.toUpperCase() : ''} · ${meta.session.toUpperCase()}`, mx, y);
  y += story ? 70 : wide ? 54 : 58;

  // chart title + red rule
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 56px "Barlow Condensed", sans-serif';
  ctx.fillText(meta.title.toUpperCase(), mx, y);
  ctx.fillStyle = RED; ctx.fillRect(mx, y + 18, 90, 6);

  // chart inset
  const top = y + 56;
  const bottom = H - (story ? 150 : wide ? 96 : 110);
  const aw = W - 2 * mx, ah = bottom - top;
  const s = Math.min(aw / iw, ah / ih);
  const dw = iw * s, dh = ih * s;
  const dx = mx + (aw - dw) / 2, dy = top + (ah - dh) / 2;
  ctx.fillStyle = INSET_BG; ctx.fillRect(dx - 14, dy - 14, dw + 28, dh + 28);
  ctx.strokeStyle = INSET_LINE; ctx.strokeRect(dx - 14.5, dy - 14.5, dw + 29, dh + 29);
  ctx.drawImage(img, dx, dy, dw, dh);

  // footer
  const fy = H - (story ? 70 : wide ? 44 : 52);
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
