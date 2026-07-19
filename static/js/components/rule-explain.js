// rule-explain.js — renders the structured "why did this fire" condition tree
// produced by apps/screener/scan.py::explain_condition (a nested dict of
// kind: literal/ref/comparison/arithmetic/cross/lookback/logic, each with a
// resolved value and boolean result at the bar it fired). Shared by
// screener-results.js and simulator-results.js so a signal's rationale and a
// simulated trade's entry rationale render identically.
const RuleExplain = {
  _opLabels: {
    gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', neq: '≠',
    add: '+', sub: '−', mul: '×', div: '÷',
    crosses_above: 'crosses above', crosses_below: 'crosses below',
    prev: 'prev', rising: 'rising', falling: 'falling',
  },

  render(node) {
    if (!node) return '';
    if (node.kind === 'literal') return `<span style="color:#94a3b8;">${node.value}</span>`;
    if (node.kind === 'ref') return `<span style="color:#818cf8;font-weight:600;">${node.ref}</span><span style="color:var(--text-muted);">(${node.value})</span>`;

    if (node.kind === 'comparison' || node.kind === 'arithmetic' || node.kind === 'cross' || node.kind === 'lookback') {
      const opLabel = RuleExplain._opLabels[node.op] || node.op;
      const isBoolNode = node.kind === 'comparison' || node.kind === 'cross';
      const icon = isBoolNode ? (node.result ? '✓' : '✗') : '';
      const iconColor = node.result ? '#10b981' : '#ef4444';
      if (node.kind === 'lookback') {
        return `<span style="display:inline-flex;align-items:center;gap:5px;">
          <span style="color:var(--text-muted);">${opLabel}(</span>${RuleExplain.render(node.inner)}<span style="color:var(--text-muted);">) = ${node.result}</span>
        </span>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;">
        ${icon ? `<span style="color:${iconColor};font-weight:700;">${icon}</span>` : ''}
        ${RuleExplain.render(node.left)}
        <span style="color:var(--text-muted);font-weight:600;">${opLabel}</span>
        ${RuleExplain.render(node.right)}
        ${!isBoolNode ? `<span style="color:var(--text-muted);">= ${node.result}</span>` : ''}
      </span>`;
    }

    if (node.kind === 'logic') {
      const iconColor = node.result ? '#10b981' : '#ef4444';
      if (node.op === 'not') {
        return `<div style="display:flex;align-items:center;gap:6px;">
          <span style="color:${iconColor};font-weight:700;">${node.result ? '✓' : '✗'}</span>
          <span style="color:var(--text-muted);font-weight:600;">NOT</span>
          ${RuleExplain.render(node.children[0])}
        </div>`;
      }
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="color:${iconColor};font-weight:700;">${node.result ? '✓' : '✗'}</span>
          <span style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;">${node.op}</span>
        </div>
        <div style="padding-left:18px;border-left:2px solid var(--border);display:flex;flex-direction:column;gap:6px;">
          ${node.children.map(c => `<div>${RuleExplain.render(c)}</div>`).join('')}
        </div>
      `;
    }
    return '';
  }
};
