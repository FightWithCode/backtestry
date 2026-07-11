// strategy-card.js — renders a single strategy card for the grid
const StrategyCard = {
  sourceIcon(type) {
    const icons = {
      youtube: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7s-.3-1.9-1.2-2.7c-1.1-1.2-2.4-1.2-3-1.3C16.1 3 12 3 12 3s-4.1 0-6.8.2c-.6.1-1.9.1-3 1.3C1.3 5.2 1 7 1 7S.7 9.1.7 11.2v2c0 2.1.3 4.2.3 4.2s.3 1.9 1.2 2.7c1.1 1.2 2.6 1.2 3.3 1.2C7.2 21.4 12 21.4 12 21.4s4.1 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.7 1.2-2.7s.3-2.1.3-4.2v-2C23.3 9.1 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/></svg>`,
      webpage: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      keyword: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    };
    return icons[type] || icons.webpage;
  },

  statusBadge(status) {
    return `<span class="badge badge-${status}">${status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}</span>`;
  },

  deleteStrategy(id, name, btn) {
    if (!confirm(`Delete "${name}"?\n\nThis will permanently remove the strategy and all backtest history.`)) return;
    btn.disabled = true;
    API.deleteStrategy(id)
      .then(() => {
        Toast.success('Strategy deleted');
        // Remove the card from DOM directly for instant feedback
        const card = btn.closest('.card');
        if (card) {
          card.style.transition = 'opacity .25s';
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 260);
        }
      })
      .catch(e => {
        Toast.error('Failed to delete: ' + e.message);
        btn.disabled = false;
      });
  },

  render(s) {
    const indicators = Array.isArray(s.indicators) ? s.indicators : [];
    const shown = indicators.slice(0, 3);
    const extra = indicators.length - 3;

    const patterns = Array.isArray(s.candle_patterns) ? s.candle_patterns.slice(0, 2) : [];

    const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <div class="card" style="padding:20px;display:flex;flex-direction:column;gap:14px;transition:border-color .2s;cursor:pointer;" onclick="App.navigate('/strategies/${s.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <h3 style="font-size:15px;font-weight:600;color:#fff;line-height:1.35;">${s.name}</h3>
          ${this.statusBadge(s.script_status)}
        </div>

        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);">
          <span style="display:flex;align-items:center;gap:4px;color:var(--text-muted);">
            ${this.sourceIcon(s.source_type)} ${s.source_type}
          </span>
          <span style="color:var(--border);">·</span>
          <span style="background:rgba(99,102,241,.12);color:#818cf8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${s.timeframe || '—'}</span>
        </div>

        ${indicators.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${shown.map(i => `<span style="background:rgba(99,102,241,.1);color:#818cf8;padding:2px 8px;border-radius:4px;font-size:11px;">${i}</span>`).join('')}
          ${extra > 0 ? `<span style="background:rgba(255,255,255,.05);color:var(--text-muted);padding:2px 8px;border-radius:4px;font-size:11px;">+${extra} more</span>` : ''}
        </div>` : ''}

        ${patterns.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${patterns.map(p => `<span style="background:rgba(245,158,11,.1);color:#fbbf24;padding:2px 8px;border-radius:4px;font-size:11px;">${p}</span>`).join('')}
        </div>` : ''}

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
          <span style="font-size:12px;color:var(--text-muted);">${date}</span>
          <div style="display:flex;gap:6px;">
            <a data-link href="/strategies/${s.id}" class="btn-secondary" style="padding:5px 12px;font-size:12px;">View Details</a>
            <button onclick="event.stopPropagation();StrategyCard.deleteStrategy('${s.id}','${s.name.replace(/'/g,"\\'")}',this)" class="btn-secondary" style="padding:5px 9px;color:#ef4444;border-color:rgba(239,68,68,.2);" title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }
};
