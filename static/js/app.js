// app.js — SPA router. Loaded last, starts the application.

const ROUTES = [
  { pattern: /^\/$/, page: DashboardPage },
  { pattern: /^\/strategies\/new$/, page: NewStrategyPage },
  { pattern: /^\/strategies\/([a-f0-9-]{36})$/, page: StrategyDetailPage, paramKey: 'id' },
  { pattern: /^\/strategies\/?$/, page: StrategiesPage },
  { pattern: /^\/backtests\/([a-f0-9-]{36})$/, page: BacktestResultsPage, paramKey: 'id' },
  { pattern: /^\/backtests\/?$/, page: BacktestHistoryPage },
  { pattern: /^\/lab\/new$/, page: LabNewPage },
  { pattern: /^\/lab\/([a-f0-9-]{36})$/, page: LabResultsPage, paramKey: 'id' },
  { pattern: /^\/lab\/?$/, page: LabListPage },
  { pattern: /^\/screener\/new$/, page: ScreenerNewPage },
  { pattern: /^\/screener\/([a-f0-9-]{36})$/, page: ScreenerResultsPage, paramKey: 'id' },
  { pattern: /^\/screener\/?$/, page: ScreenerListPage },
  { pattern: /^\/settings\/?$/, page: SettingsPage },
];

const App = {
  _currentPage: null,

  navigate(path) {
    if (window.location.pathname === path) return;
    history.pushState(null, '', path);
    this._render(path);
  },

  _match(path) {
    for (const route of ROUTES) {
      const m = path.match(route.pattern);
      if (m) {
        const params = {};
        if (route.paramKey) params[route.paramKey] = m[1];
        return { page: route.page, params };
      }
    }
    return null;
  },

  _render(path) {
    const container = document.getElementById('app');
    if (!container) return;

    // Cleanup previous page
    if (this._currentPage && typeof this._currentPage._cleanup === 'function') {
      this._currentPage._cleanup();
    }

    Navbar.update(path);

    const match = this._match(path);
    if (!match) {
      container.innerHTML = `
        <div class="page-enter" style="text-align:center;padding:80px 20px;">
          <div style="font-size:64px;font-weight:800;color:var(--border);margin-bottom:16px;">404</div>
          <p style="color:var(--text-muted);margin-bottom:24px;">Page not found</p>
          <a data-link href="/" class="btn-primary">Go Home</a>
        </div>`;
      return;
    }

    this._currentPage = match.page;

    // Show skeleton immediately then render
    container.innerHTML = '<div class="page-enter" style="opacity:.5"><div class="skeleton" style="height:40px;margin-bottom:16px;width:200px;"></div><div class="skeleton" style="height:200px;"></div></div>';

    match.page.render(container, match.params || {});
  },

  _interceptLinks(e) {
    const target = e.target.closest('[data-link]');
    if (!target) return;
    e.preventDefault();
    const href = target.getAttribute('href');
    if (href) App.navigate(href);
  },

  init() {
    document.addEventListener('click', this._interceptLinks.bind(this));
    window.addEventListener('popstate', () => this._render(window.location.pathname));
    this._render(window.location.pathname);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
