'use strict';
(() => {
  const key = 'qj-reader-theme-v2';
  const legacyKey = 'qj-reader-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let preference = 'system';
  let transitionTimer;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'system' || saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) {}
  function current() {
    if (preference === 'light' || preference === 'dark') return preference;
    return system.matches ? 'dark' : 'light';
  }
  function apply(theme, animate = false) {
    const root = document.documentElement;
    const changed = !!root.dataset.theme && root.dataset.theme !== theme;
    if (animate && changed && !reducedMotion.matches) {
      root.classList.add('theme-transition');
      void root.offsetWidth;
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 240);
    }
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#000000' : '#f4f6f8';
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = favicon.href.replace(/%23(?:2d6551|383838|1f4b7a|6f9fd3)/gi, theme === 'dark' ? '%236f9fd3' : '%231f4b7a');
    const select = document.getElementById('theme-select');
    if (select) select.value = preference;
  }
  apply(current());
  system.addEventListener('change', () => {if (preference === 'system') apply(current(), true);});
  document.addEventListener('DOMContentLoaded', () => {
    try {localStorage.removeItem(legacyKey);} catch (_) {}
    apply(current());
    const select = document.getElementById('theme-select');
    if (select) select.addEventListener('change', () => {
      preference = select.value === 'light' || select.value === 'dark' ? select.value : 'system';
      try {localStorage.setItem(key, preference);} catch (_) {}
      select.classList.remove('is-changing');
      void select.offsetWidth;
      select.classList.add('is-changing');
      setTimeout(() => select.classList.remove('is-changing'), 260);
      apply(current(), true);
    });
  });
})();
