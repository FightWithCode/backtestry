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

  deleteStrategy: (id) => _request('DELETE', `/api/strategies/${id}/`),

  regenerateScript: (id) => _request('POST', `/api/strategies/${id}/regenerate_script/`),

  getScriptHistory: (id) => _request('GET', `/api/strategies/${id}/script_history/`),

  getStrategyStatus: (id) => _request('GET', `/api/strategies/${id}/status/`),

  // Backtests
  createBacktest: (data) => _request('POST', '/api/backtests/', data),

  getBacktests: () => _request('GET', '/api/backtests/'),

  getBacktest: (id) => _request('GET', `/api/backtests/${id}/`),

  getBacktestStatus: (id) => _request('GET', `/api/backtests/${id}/status/`),
};
