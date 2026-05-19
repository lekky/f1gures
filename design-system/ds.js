// F1gures Design System — shared chrome
(function () {
  // ── Theme persistence (matches f1gures site: html.light) ──
  var THEME_KEY = 'ds-theme';
  function applyTheme(t) {
    if (t === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    document.querySelectorAll('.ds-theme button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === t);
    });
  }
  var saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.ds-theme button');
    if (!btn) return;
    var t = btn.dataset.theme;
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  });

  // ── Mark active nav based on current filename ──
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.ds-nav-item').forEach(function (a) {
    var href = (a.getAttribute('href') || '').toLowerCase();
    if (href === here) a.classList.add('active');
  });

  // ── Smooth scroll for in-page anchors ──
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var t = document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    var y = t.getBoundingClientRect().top + window.pageYOffset - 70;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
})();
