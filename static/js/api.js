// api.js — all fetch() wrappers for the DRF backend
const API_BASE = '';

async function _request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': _getCsrf() },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(API_BASE + path, opts);
  const json = await resp.json();

  if (!resp.ok || !json.success) {
    const msg = json.error || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json.data;
}

function _getCsrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

// Strategies
const API = {
  getStrategies: () => _request('GET', '/api/strategies/'),

  getStrategy: (id) => _request('GET', `/api/strategies/${id}/`),

  createStrategy: (data) => _request('POST', '/api/strategies/', data),

  updateStrategy: (id, data) => _request('PATCH', `/api/strategies/${id}/`, data),

  deleteStrategy: (id) => _request('DELETE', `/api/strategies/${id}/`),

  regenerateScript: (id) => _request('POST', `/api/strategies/${id}/regenerate_script/`),

  updateConfig: (id, backtestScript) => _request('POST', `/api/strategies/${id}/update_config/`, { backtest_script: backtestScript }),

  getScriptHistory: (id) => _request('GET', `/api/strategies/${id}/script_history/`),

  getStrategyStatus: (id) => _request('GET', `/api/strategies/${id}/status/`),

  // Backtests
  createBacktest: (data) => _request('POST', '/api/backtests/', data),

  getBacktests: () => _request('GET', '/api/backtests/'),

  getBacktest: (id) => _request('GET', `/api/backtests/${id}/`),

  getBacktestStatus: (id) => _request('GET', `/api/backtests/${id}/status/`),

  deleteBacktest: (id) => _request('DELETE', `/api/backtests/${id}/`),

  // Lab (multi-symbol, multi-variant parameter-sweep backtesting)
  getTunables: (strategyId) => _request('GET', `/api/lab/strategies/${strategyId}/tunables/`),

  createLabRun: (data) => _request('POST', '/api/lab/runs/', data),

  getLabRuns: () => _request('GET', '/api/lab/runs/'),

  getLabRun: (id) => _request('GET', `/api/lab/runs/${id}/`),

  getLabRunStatus: (id) => _request('GET', `/api/lab/runs/${id}/status/`),

  deleteLabRun: (id) => _request('DELETE', `/api/lab/runs/${id}/`),

  // Screener (scans a symbol universe for current entry signals)
  getUniverses: () => _request('GET', '/api/screener/universes/'),

  createUniverse: (data) => _request('POST', '/api/screener/universes/', data),

  updateUniverse: (id, data) => _request('PATCH', `/api/screener/universes/${id}/`, data),

  deleteUniverse: (id) => _request('DELETE', `/api/screener/universes/${id}/`),

  createScreenerRun: (data) => _request('POST', '/api/screener/runs/', data),

  getScreenerRuns: () => _request('GET', '/api/screener/runs/'),

  getScreenerRun: (id) => _request('GET', `/api/screener/runs/${id}/`),

  getScreenerRunStatus: (id) => _request('GET', `/api/screener/runs/${id}/status/`),

  deleteScreenerRun: (id) => _request('DELETE', `/api/screener/runs/${id}/`),
};
