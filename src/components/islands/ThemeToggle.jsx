// Theme switcher - React island for the dark/light toggle in the nav.
// Pre-hydration script in BaseLayout.astro already set the html.light class
// from localStorage before paint, so this component just reflects the saved
// state and writes back on click. No flash on hydration.

import { useEffect, useState } from 'react';
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

  return (
    <div className="theme-switcher" role="group" aria-label="Theme">
      <button className={`theme-opt ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setMode('light')}>Light</button>
      <button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setMode('dark')}>Dark</button>
    </div>
  );
}
