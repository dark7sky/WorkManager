(() => {
  const preference = localStorage.getItem('wm-theme-v1') || 'auto';
  const dark = preference === 'dark' || (preference === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
