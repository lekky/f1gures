import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, absCard, ogImg, wmTopLeft, urlBottomLeft, statBlock } from './og-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_PATH = path.resolve(__dirname, '../../public/images/logo/icon-512.png');
const ICON_DATA_URI = (() => {
  try {
    return `data:image/png;base64,${fs.readFileSync(ICON_PATH).toString('base64')}`;
  } catch {
    return null;
  }
})();

const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/**
 * Generic branded card for static / hub / listing pages.
 * @param {object} p
 * @param {string}  p.kicker   red uppercase eyebrow
 * @param {string}  p.title    headline (auto-sized)
 * @param {string}  p.subtitle muted supporting line
 * @param {Array}   [p.stats]  [{ value, label }] stat blocks
 * @param {boolean} [p.icon=true] show the brand mark on the right
 */
export function renderPageOg({ kicker, title, subtitle, stats = [], icon = true }) {
  const showIcon = icon && ICON_DATA_URI;
  const width = showIcon ? 740 : 1000;
  const titleSize = title.length > 24 ? 68 : title.length > 16 ? 82 : 96;

  const left = div({ flexDirection: 'column', position: 'absolute', top: 132, left: 60, width }, [
    kicker ? txt({ fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }, kicker) : div({}, []),
    txt({ fontSize: titleSize, fontWeight: 700, lineHeight: 1.02, marginTop: 6 }, title),
    subtitle ? txt({ fontSize: 32, color: COLORS.muted, marginTop: 16, lineHeight: 1.15 }, subtitle) : div({}, []),
    stats.length ? div({ marginTop: 44, gap: 44 }, stats.map((s) => statBlock(s.value, s.label))) : div({}, []),
  ]);

  const right = showIcon
    ? div({ position: 'absolute', top: 165, right: 80, width: 300, height: 300, borderRadius: 24, overflow: 'hidden' }, [ogImg(ICON_DATA_URI, 300, 300)])
    : div({}, []);

  return absCard([right, left, wmTopLeft(), urlBottomLeft()]);
}
