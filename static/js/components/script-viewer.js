// script-viewer.js — syntax-highlighted config/script viewer
const ScriptViewer = {
  _isJson(text) {
    return text && text.trimStart().startsWith('{');
  },

  _format(text) {
    if (this._isJson(text)) {
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
    }
    return text;
  },

  render(script) {
    if (!script) {
      return `<div style="text-align:center;padding:40px;color:var(--text-muted);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;display:block;opacity:.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        No config generated yet
      </div>`;
    }

    const lang = this._isJson(script) ? 'language-json' : 'language-python';
    const formatted = this._format(script);
    const escaped = formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `
      <div style="position:relative;">
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
          <button onclick="ScriptViewer.copyScript(this)" class="btn-secondary" style="padding:5px 12px;font-size:12px;gap:5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <div style="max-height:520px;overflow:auto;border-radius:8px;">
          <pre id="script-code-block" style="margin:0;"><code class="${lang}">${escaped}</code></pre>
        </div>
      </div>
    `;
  },

  highlight() {
    const block = document.getElementById('script-code-block');
    if (block && window.hljs) {
      hljs.highlightElement(block.querySelector('code'));
    }
  },

  copyScript(btn) {
    const code = document.querySelector('#script-code-block code');
    if (!code) return;
    navigator.clipboard.writeText(code.innerText).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      btn.style.color = '#10b981';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1800);
    });
  }
};
