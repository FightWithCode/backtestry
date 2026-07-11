// dashboard.js — home page
const DashboardPage = {
  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <!-- Hero -->
        <div style="text-align:center;padding:60px 0 48px;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);border-radius:999px;padding:5px 14px;font-size:12px;color:#818cf8;margin-bottom:20px;">
            <span style="width:6px;height:6px;background:#6366f1;border-radius:50%;display:inline-block;"></span>
            AI-Powered Strategy Research
          </div>
          <h1 style="font-size:52px;font-weight:800;letter-spacing:-1.5px;line-height:1.1;margin-bottom:16px;">
            <span class="gradient-text">TradingAgent</span>
          </h1>
          <p style="font-size:18px;color:var(--text-muted);max-width:480px;margin:0 auto 32px;line-height:1.6;">
            Backtest Any Strategy. Preserve Every Edge.
          </p>
          <a data-link href="/strategies/new" class="btn-primary" style="font-size:15px;padding:12px 28px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add New Strategy
          </a>
        </div>

        <!-- Stats row skeleton -->
        <div id="stats-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:36px;">
          ${[1,2,3,4].map(() => `<div class="skeleton" style="height:90px;"></div>`).join('')}
        </div>

        <!-- Recent strategies -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="font-size:17px;font-weight:600;">Recent Strategies</h2>
          <a data-link href="/strategies" style="font-size:13px;color:var(--indigo);text-decoration:none;">View all →</a>
        </div>
        <div id="recent-list">
          ${[1,2,3].map(() => `<div class="skeleton" style="height:52px;margin-bottom:8px;"></div>`).join('')}
        </div>
      </div>
    `;

    try {
      const strategies = await API.getStrategies();
      this._renderStats(strategies);
      this._renderRecent(strategies.slice(0, 5));
    } catch (e) {
      Toast.error('Failed to load dashboard: ' + e.message);
    }
  },

  _renderStats(strategies) {
    const total = strategies.length;
    const generated = strategies.filter(s => s.script_status === 'generated').length;
    const avgWin = 0; // Would need backtest data — placeholder

    const statsEl = document.getElementById('stats-row');
    if (!statsEl) return;

    const stats = [
      { label: 'Total Strategies', value: total, icon: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>', color: '#818cf8' },
      { label: 'Scripts Generated', value: generated, icon: '<polyline points="20 6 9 17 4 12"/>', color: '#10b981' },
      { label: 'Strategies Pending', value: strategies.filter(s => ['pending','generating'].includes(s.script_status)).length, icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', color: '#f59e0b' },
      { label: 'Failed Scripts', value: strategies.filter(s => s.script_status === 'failed').length, icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', color: '#ef4444' },
    ];

    statsEl.innerHTML = stats.map(s => `
      <div class="card" style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <span style="font-size:12px;color:var(--text-muted);">${s.label}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
        </div>
        <div style="font-size:32px;font-weight:700;color:${s.color};">${s.value}</div>
      </div>
    `).join('');
  },

  _renderRecent(strategies) {
    const el = document.getElementById('recent-list');
    if (!el) return;

    if (strategies.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:40px;text-align:center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;display:block;opacity:.3;color:var(--indigo)"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <p style="color:var(--text-muted);font-size:14px;">No strategies yet — <a data-link href="/strategies/new" style="color:var(--indigo);">create your first one</a></p>
        </div>`;
      return;
    }

    el.innerHTML = strategies.map(s => {
      const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `
        <div class="card" style="padding:14px 18px;display:flex;align-items:center;gap:14px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <span style="font-size:14px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${s.name}</span>
            <span style="font-size:12px;color:var(--text-muted);">${s.source_type} · ${date}</span>
          </div>
          <span style="background:rgba(99,102,241,.12);color:#818cf8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;">${s.timeframe || '—'}</span>
          <span class="badge badge-${s.script_status}">${s.script_status.replace('_', ' ')}</span>
          <a data-link href="/strategies/${s.id}" class="btn-secondary" style="padding:5px 12px;font-size:12px;white-space:nowrap;">View</a>
        </div>`;
    }).join('');
  }
};
