// universe-picker.js — a grouped <select> for loading a symbol universe (built
// via the Screener's "Manage Universes") into any symbol tag input. Shared by
// strategy-detail.js (Backtest), lab-new.js, and screener-new.js so "pick a
// universe instead of typing symbols" behaves identically everywhere.
//
// Universes store bare NSE symbols (e.g. "RELIANCE") — Upstox's API already
// treats a bare symbol as NSE by default, but yfinance needs ".NS" appended.
// adaptSymbol()/adaptSymbols() apply that at the point of loading into a
// tag list, based on whichever data provider is currently active.
const UniversePicker = {
  _providerCache: null,

  async fetch() {
    try {
      return await API.getUniverses();
    } catch (e) {
      return [];
    }
  },

  async getEffectiveProvider() {
    if (this._providerCache) return this._providerCache;
    try {
      const settings = await API.getDataProviderSettings();
      this._providerCache = settings.effective_data_provider || 'yfinance';
    } catch (e) {
      this._providerCache = 'yfinance';
    }
    return this._providerCache;
  },

  adaptSymbol(symbol, provider) {
    if (provider === 'yfinance' && !symbol.includes('.')) return `${symbol}.NS`;
    return symbol;
  },

  adaptSymbols(symbols, provider) {
    return symbols.map(s => this.adaptSymbol(s, provider));
  },

  /** Builds <option>/<optgroup> markup: combined + F&O at top level, then
   * "By Market Cap" / "By Sector" / "My Universes" groups. */
  optionsHtml(universes, placeholder) {
    if (!universes || !universes.length) {
      return `<option value="">No universes yet — add one via Screener → Manage Universes</option>`;
    }

    const combined = universes.filter(u => u.is_default && u.group_type === 'combined');
    const fno = universes.filter(u => u.is_default && u.group_type === 'fno');
    const marketCap = universes.filter(u => u.is_default && u.group_type === 'market_cap');
    const sector = universes.filter(u => u.is_default && u.group_type === 'sector');
    const custom = universes.filter(u => !u.is_default);

    const opt = (u) => `<option value="${u.id}">${u.name} (${u.symbol_count})</option>`;
    let html = `<option value="">${placeholder || 'Load symbols from a universe...'}</option>`;

    html += combined.map(opt).join('');
    html += fno.map(opt).join('');
    if (marketCap.length) html += `<optgroup label="By Market Cap">${marketCap.map(opt).join('')}</optgroup>`;
    if (sector.length) html += `<optgroup label="By Sector">${sector.map(opt).join('')}</optgroup>`;
    if (custom.length) html += `<optgroup label="My Universes">${custom.map(opt).join('')}</optgroup>`;
    return html;
  },

  find(universes, id) {
    return (universes || []).find(u => u.id === id) || null;
  }
};
