// Trackside dot-matrix "Did you know" board. Types an F1 trivia fact out
// character-by-character with a blinking cursor, holds, then advances to the
// next fact (shuffled order, looping). Pauses on hover. Facts come from the
// curated, evergreen pool in src/data/trivia.json.
//
// The board is always a single line at a fixed height (so it never grows tall
// with long facts, especially on mobile). As the text types past the right
// edge, the inner line scrolls left to keep the cursor — and the latest words,
// where the punchline usually sits — in view, like a terminal.
//
// SSR/hydration: the first render shows facts[0] fully typed so the prerendered
// HTML is sensible for no-JS users and matches the hydration starting point.
// The typewriter engine starts on mount (client only). prefers-reduced-motion
// drops the typewriter and the horizontal scroll: facts wrap and simply swap
// every few seconds, with the cursor/dot blinking stopped.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import triviaData from '../../../data/trivia.json';

const FACTS = triviaData.facts || [];

// Each page load picks a small random set of facts to rotate through, so a
// refresh surfaces a different handful rather than grinding through all 107.
// Selection is client-only (Math.random), keeping SSR deterministic.
const SET_MIN = 3;
const SET_MAX = 4;

function pickSet(n) {
  const size = Math.min(n, SET_MIN + Math.floor(Math.random() * (SET_MAX - SET_MIN + 1)));
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, size);
}

// Mobile types slower and dwells longer: a long fact scrolls horizontally as it
// types, so a fast speed leaves no time to read words before they slide off the
// narrow screen. Desktop fits most facts without scrolling, so it stays snappy.
const TIMING = {
  desktop: { type: 28, hold: 3800 },
  mobile:  { type: 55, hold: 4800 },
};
const PAUSE_POLL_MS = 200;

export default function TriviaBoard() {
  const [display, setDisplay] = useState(FACTS.length ? FACTS[0].text : '');
  const [reduced, setReduced] = useState(false);
  // Mobile shows two wrapped lines and scrolls vertically; desktop shows one
  // line and scrolls horizontally. Both keep the cursor (and the latest words)
  // in view as the fact types past the viewport.
  const [twoLine, setTwoLine] = useState(false);
  const pausedRef = useRef(false);
  const lineRef = useRef(null);   // viewport (clips overflow)
  const innerRef = useRef(null);  // scrolled content (text + cursor)

  // Keep the cursor in view by scrolling the inner line so its trailing edge
  // stays at the viewport edge. Runs after every character. No-op under reduced
  // motion (the line wraps freely instead).
  useLayoutEffect(() => {
    if (reduced) return;
    const vp = lineRef.current;
    const inner = innerRef.current;
    if (!vp || !inner) return;
    const position = () => {
      if (twoLine) {
        // diff <= 0: fact fits the two-line viewport, so centre it vertically.
        // diff > 0: it overflows, so scroll up to keep the cursor (bottom) in view.
        const diff = inner.scrollHeight - vp.clientHeight;
        inner.style.transform = `translateY(${diff <= 0 ? -diff / 2 : -diff}px)`;
      } else {
        const offset = Math.max(0, inner.scrollWidth - vp.clientWidth);
        inner.style.transform = `translateX(${-offset}px)`;
      }
    };
    if (display.length <= 1) {
      // New fact starting: snap into place without animating the reset.
      inner.style.transition = 'none';
      position();
      void inner.offsetWidth;
      inner.style.transition = '';
      return;
    }
    position();
  }, [display, reduced, twoLine]);

  useEffect(() => {
    const mm = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia : null;
    const isReduced = !!(mm && mm('(prefers-reduced-motion: reduce)').matches);
    const isMobile = !!(mm && mm('(max-width: 720px)').matches);
    const timing = isMobile ? TIMING.mobile : TIMING.desktop;
    setReduced(isReduced);
    setTwoLine(!isReduced);

    if (FACTS.length < 2) return;

    // The random set is the rotation. Fact 0 is only the SSR placeholder; we
    // advance immediately (below) so the first fact the visitor reads is a
    // random one. Guard against that first pick being fact 0 again, so each
    // load opens on a fact different from the prerendered intro.
    const order = pickSet(FACTS.length);
    if (order[0] === 0 && order.length > 1) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    let oi = -1;
    let timer;
    let cancelled = false;

    // Schedule `cb` after `delay`, but keep deferring while hovered.
    const later = (cb, delay) => {
      timer = setTimeout(function tick() {
        if (cancelled) return;
        if (pausedRef.current) { timer = setTimeout(tick, PAUSE_POLL_MS); return; }
        cb();
      }, delay);
    };

    const advance = () => {
      oi = (oi + 1) % order.length;
      const text = FACTS[order[oi]].text;
      if (isReduced) {
        setDisplay(text);
        later(advance, timing.hold);
      } else {
        typeOut(text);
      }
    };

    const typeOut = (text) => {
      let c = 0;
      setDisplay('');
      const step = () => {
        if (cancelled) return;
        if (pausedRef.current) { timer = setTimeout(step, PAUSE_POLL_MS); return; }
        c += 1;
        setDisplay(text.slice(0, c));
        if (c < text.length) timer = setTimeout(step, timing.type);
        else later(advance, timing.hold);
      };
      timer = setTimeout(step, timing.type);
    };

    // The SSR intro fact (fact 0) is already painted; start a random fact
    // straight away rather than dwelling on it, so each load opens differently.
    advance();

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (!FACTS.length) return null;

  return (
    <div
      className={`trivia${reduced ? ' trivia--reduce' : ''}${twoLine ? ' trivia--2line' : ''}`}
      aria-label="Did you know? Formula 1 trivia"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="trivia-lab">
        <span className="trivia-dot" aria-hidden="true"></span>
        Did You Know
      </div>
      <div className="trivia-scr">
        <span className="trivia-pre" aria-hidden="true">&gt;&gt;</span>
        <span className="trivia-line" ref={lineRef}>
          <span className="trivia-line-inner" ref={innerRef}>
            <span className="trivia-txt">{display}</span>
            <span className="trivia-cur" aria-hidden="true"></span>
          </span>
        </span>
      </div>
    </div>
  );
}
