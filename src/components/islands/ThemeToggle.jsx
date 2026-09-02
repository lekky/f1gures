// Theme switcher - React island for the dark/light toggle in the nav.
// Pre-hydration script in BaseLayout.astro already set the html.light class
// from localStorage before paint, so this component just reflects the saved
// state and writes back on click. No flash on hydration.
//
// One icon button: the glyph shows the mode you'd switch TO (sun while dark,
// moon while light), the aria-label says so in words, and a visually-hidden
// span carries the same text for anything that reads content over labels.

import { useEffect, useState } from 'react';
import { Icon } from '../../lib/shared.jsx';
import { track } from '../../lib/analytics.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  // Read the actual saved theme on mount (the pre-hydration script ran already)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('f1-theme') || 'light';
      setTheme(saved);
    } catch (e) {
      setTheme('light');
    }
  }, []);

  function setMode(next) {
    document.documentElement.classList.toggle('light', next === 'light');
    try { localStorage.setItem('f1-theme', next); } catch (e) {}
    track('theme_change', { theme: next });
    setTheme(next);
  }

  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <button
      type="button"
      className="theme-toggle icon-btn"
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
