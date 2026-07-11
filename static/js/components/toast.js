// toast.js — lightweight toast notification system
const Toast = (() => {
  function show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const colors = {
      success: { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)', icon: '#10b981' },
      error:   { bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.3)',  icon: '#ef4444' },
      info:    { bg: 'rgba(99,102,241,.12)', border: 'rgba(99,102,241,.3)', icon: '#6366f1' },
      warning: { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)', icon: '#f59e0b' },
    };
    const c = colors[type] || colors.info;

    const icons = {
      success: '<polyline points="20 6 9 17 4 12"/>',
      error:   '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    };

    const el = document.createElement('div');
    el.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      background: ${c.bg}; border: 1px solid ${c.border};
      border-radius: 10px; padding: 12px 16px;
      pointer-events: all; max-width: 340px;
      backdrop-filter: blur(12px);
      animation: toastIn .25s ease;
      font-size: 14px; color: #e2e8f0;
    `;
    el.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${icons[type] || icons.info}</svg>
      <span style="flex:1">${message}</span>
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`;
    document.head.appendChild(style);

    container.appendChild(el);

    setTimeout(() => {
      el.style.animation = 'toastOut .2s ease forwards';
      const out = document.createElement('style');
      out.textContent = `@keyframes toastOut{to{opacity:0;transform:translateX(20px)}}`;
      document.head.appendChild(out);
      setTimeout(() => el.remove(), 220);
    }, duration);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error:   (msg) => show(msg, 'error'),
    info:    (msg) => show(msg, 'info'),
    warning: (msg) => show(msg, 'warning'),
  };
})();
