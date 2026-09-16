const root = document.getElementById('root');
let state = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  view: 'dashboard',
  authTab: 'login',
  businessDetail: null, // for superadmin drill-down
  historyFilter: 'all',
  customerFilter: null
};

function fmtRWF(n) { return Math.round(n || 0).toLocaleString('en-US') + ' RWF'; }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function t(k) { return I18N.t(k); }

async function init() {
  await I18N.load(state.user ? state.user.language : I18N.lang);
  render();
}

function setUser(user, token) {
  state.user = user;
  if (token) API.setToken(token);
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  API.setToken(null);
  localStorage.removeItem('user');
  state.user = null;
  render();
}

// ---------------- LANGUAGE PICKER ----------------
function langPickerHtml() {
  const langs = [['en', 'EN'], ['rw', 'RW'], ['fr', 'FR']];
  return `<div class="lang-picker">${langs.map(([code, label]) =>
    `<button data-lang="${code}" class="${I18N.lang === code ? 'active' : ''}">${label}</button>`
  ).join('')}</div>`;
}

function bindLangPicker() {
  document.querySelectorAll('.lang-picker button').forEach(btn => {
    btn.addEventListener('click', async () => {
      await I18N.load(btn.dataset.lang);
      render();
    });
  });
}

// ================= AUTH SCREEN =================
function renderAuth() {
  root.innerHTML = `
    ${langPickerHtml()}
    <div class="auth-shell">
      <div class="auth-card">
        <h1>${t('appName')}</h1>
        <div class="auth-sub">Kwinjira / Kwiyandikisha</div>
        <div class="auth-tabs">
          <button data-tab="login" class="${state.authTab === 'login' ? 'active' : ''}">${t('login')}</button>
          <button data-tab="register" class="${state.authTab === 'register' ? 'active' : ''}">${t('register')}</button>
        </div>
        <div id="auth-form-area"></div>
      </div>
    </div>
  `;
  bindLangPicker();
  document.querySelectorAll('.auth-tabs button').forEach(b => {
    b.addEventListener('click', () => { state.authTab = b.dataset.tab; renderAuth(); });
  });
  state.authTab === 'login' ? renderLoginForm() : renderRegisterForm();
}

function renderLoginForm() {
  const area = document.getElementById('auth-form-area');
  area.innerHTML = `
    <div class="field"><label>${t('email')}</label><input id="li-email" type="email"></div>
    <div class="field"><label>${t('password')}</label><input id="li-password" type="password"></div>
    <button class="btn-primary" id="li-submit">${t('login')}</button>
    <div class="form-msg" id="li-msg"></div>
  `;
  document.getElementById('li-submit').addEventListener('click', async () => {
    const email = document.getElementById('li-email').value.trim();
    const password = document.getElementById('li-password').value;
    const msg = document.getElementById('li-msg');
    try {
      const data = await API.post('/api/auth/login', { email, password });
      setUser(data.user, data.token);
      await I18N.load(data.user.language || 'rw');
      render();
    } catch (e) {
      let text = e.message;
      if (e.code === 'ACCOUNT_PENDING') text = t('pendingApproval');
      if (e.code === 'ACCOUNT_BLOCKED') text = t('accountBlocked');
      if (e.code === 'ACCOUNT_LOCKED') text = t('accountLocked');
      msg.textContent = text;
      msg.className = 'form-msg show error';
    }
  });
}

function renderRegisterForm() {
  const area = document.getElementById('auth-form-area');
  area.innerHTML = `
    <div class="field"><label>${t('fullName')}</label><input id="re-name" type="text"></div>
    <div class="field"><label>${t('email')}</label><input id="re-email" type="email"></div>
    <div class="field"><label>${t('phone')}</label><input id="re-phone" type="tel" placeholder="07XXXXXXXX"></div>
    <div class="field"><label>${t('password')}</label><input id="re-password" type="password"></div>
    <button class="btn-primary" id="re-submit">${t('register')}</button>
    <div class="form-msg" id="re-msg"></div>
  `;
  document.getElementById('re-submit').addEventListener('click', async () => {
    const name = document.getElementById('re-name').value.trim();
    const email = document.getElementById('re-email').value.trim();
    const phone = document.getElementById('re-phone').value.trim();
    const password = document.getElementById('re-password').value;
    const msg = document.getElementById('re-msg');
    try {
      const data = await API.post('/api/auth/register', { name, email, phone, password, language: I18N.lang });
      msg.textContent = data.message;
      msg.className = 'form-msg show success';
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'form-msg show error';
    }
  });
}

// ================= APP SHELL =================
function navItemsFor(role) {
  if (role === 'superadmin') {
    return [
      ['pending', t('superadmin') + ': ' + 'Approvals'],
      ['businesses', 'Businesses'],
      ['notifications', t('notifications')],
      ['auditlog', 'Audit log']
    ];
  }
  const common = [
    ['dashboard', t('dashboard')],
    ['products', t('products')],
    ['sell', t('sell')],
    ['history', t('history')],
    ['customers', t('customers')]
  ];
  if (role === 'admin') {
    return [...common, ['guests', t('guests')], ['payments', t('commission')], ['trash', t('trash')], ['audit', 'Audit log'], ['notifications', t('notifications')]];
  }
  return common; // guest
}

function renderShell(innerHtml) {
  const role = state.user.role;
  const items = navItemsFor(role);
  root.innerHTML = `
    <div class="mobile-topbar">
      <span class="mobile-brand"><img src="/logo.svg" alt="ITTP"><strong>ITTP</strong></span>
      <button id="menu-toggle">☰</button>
    </div>
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="/logo.svg" alt="ITTP"><span>ITTP</span></div>
        <div class="role-tag">${role.toUpperCase()} · ${esc(state.user.name)}</div>
        <nav>
          ${items.map(([key, label]) => `<button data-view="${key}" class="${state.view === key ? 'active' : ''}">${label}</button>`).join('')}
        </nav>
        <div class="divider"></div>
        ${langPickerInlineHtml()}
        <button class="logout-btn" id="logout-btn">${t('logout')}</button>
      </aside>
      <main class="main">${innerHtml}</main>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.querySelectorAll('.sidebar nav button').forEach(b => {
    b.addEventListener('click', () => { state.view = b.dataset.view; state.businessDetail = null; renderApp(); });
  });
  const toggle = document.getElementById('menu-toggle');
  if (toggle) toggle.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.querySelectorAll('.lang-picker-inline button').forEach(btn => {
    btn.addEventListener('click', async () => { await I18N.load(btn.dataset.lang); renderApp(); });
  });
}

function langPickerInlineHtml() {
  const langs = [['en', 'EN'], ['rw', 'RW'], ['fr', 'FR']];
  return `<div class="lang-picker-inline" style="display:flex;gap:6px;margin-bottom:14px;">${langs.map(([code, label]) =>
    `<button data-lang="${code}" style="flex:1;background:${I18N.lang === code ? 'var(--ink)' : 'var(--panel)'};color:${I18N.lang === code ? 'var(--paper)' : 'var(--ink-muted)'};border:1px solid var(--line);padding:5px 0;font-size:11.5px;font-family:'IBM Plex Mono',monospace;">${label}</button>`
  ).join('')}</div>`;
}

// ================= STATUS SCREEN (pending/blocked/locked) =================
function renderStatusScreen(status) {
  const messages = {
    pending: t('pendingApproval'),
    blocked: t('accountBlocked'),
    locked: t('accountLocked')
  };
  root.innerHTML = `
    ${langPickerHtml()}
    <div class="status-screen">
      <div class="badge">${status.toUpperCase()}</div>
      <h2 style="margin-bottom:14px;">${t('appName')}</h2>
      <p style="color:var(--ink-muted);line-height:1.6;">${messages[status]}</p>
      <button class="btn-secondary" id="back-logout" style="margin-top:20px;">${t('logout')}</button>
    </div>
  `;
  bindLangPicker();
  document.getElementById('back-logout').addEventListener('click', logout);
}

// ================= MAIN RENDER DISPATCH =================
function render() {
  if (!state.user) return renderAuth();
  renderApp();
}

async function renderApp() {
  const role = state.user.role;
  try {
    if (role === 'superadmin') return await renderSuperadminView();
    return await renderBusinessView();
  } catch (e) {
    if (e.status === 401) return logout();
    root.innerHTML = `<div style="padding:40px;color:var(--danger)">Ikibazo: ${esc(e.message)}</div>`;
  }
}

// ================= ADMIN / GUEST VIEWS =================
async function renderBusinessView() {
  const view = state.view;
  let html = '';
  if (view === 'dashboard') html = await dashboardHtml();
  else if (view === 'products') html = await productsHtml();
  else if (view === 'sell') html = await sellHtml();
  else if (view === 'history') html = await historyHtml();
  else if (view === 'customers') html = await customersHtml();
  else if (view === 'guests' && state.user.role === 'admin') html = await guestsHtml();
  else if (view === 'payments' && state.user.role === 'admin') html = await paymentsHtml();
  else if (view === 'trash' && state.user.role === 'admin') html = await trashHtml();
  else if (view === 'audit' && state.user.role === 'admin') html = await auditHtml('/api/admin/audit-log');
  else if (view === 'notifications') html = await notificationsHtml(state.user.role === 'admin' ? '/api/admin/notifications' : null);
  else html = dashboardHtml();

  renderShell(html);
  bindBusinessViewEvents(view);
}

async function dashboardHtml() {
  const summary = await API.get('/api/sales/summary');
  let insights = null;
  if (state.user.role === 'admin') {
    try { insights = await API.get('/api/admin/insights'); } catch (e) { /* ignore */ }
  }
  return `
    <div class="topbar"><h2>${t('dashboard')}</h2></div>
    <div class="grid-stats">
      <div class="stat positive"><div class="label">${t('totalRevenue')}</div><div class="value">${fmtRWF(summary.totalRevenue)}</div></div>
      <div class="stat"><div class="label">${t('itemsSold')}</div><div class="value">${summary.totalItemsSold}</div></div>
      <div class="stat ${summary.lowStock.length ? 'warn' : ''}"><div class="label">${t('remainingStock')}</div><div class="value">${summary.totalStock}</div></div>
    </div>
    ${insights ? insightBoxHtml(insights) : ''}
    ${insights ? extraStatsHtml(insights) : ''}
    ${insights ? revenueChartHtml(insights.dailyRevenue) : ''}
    ${insights && insights.topProducts.length ? topProductsHtml(insights.topProducts) : ''}
    <h3 style="margin-bottom:12px;">${t('lowStock')}</h3>
    ${summary.lowStock.length === 0
      ? `<div class="empty">—</div>`
      : `<table><thead><tr><th>${t('productName')}</th><th>${t('stock')}</th></tr></thead><tbody>${
          summary.lowStock.map(p => `<tr class="flag"><td class="name-cell">${esc(p.name)}</td><td>${p.stock}</td></tr>`).join('')
        }</tbody></table>`}
  `;
}

function extraStatsHtml(insights) {
  return `
    <h3 style="margin-bottom:12px;">Andi makuru</h3>
    <div class="grid-stats">
      <div class="stat"><div class="label">Iki cyumweru</div><div class="value">${fmtRWF(insights.revenueThisWeek)}</div></div>
      <div class="stat"><div class="label">Uku kwezi</div><div class="value">${fmtRWF(insights.revenueThisMonth)}</div></div>
      <div class="stat"><div class="label">Umubare w'amagurisha</div><div class="value">${insights.salesCount}</div></div>
      <div class="stat"><div class="label">Impuzandengo/igurisha</div><div class="value">${fmtRWF(insights.avgSaleValue)}</div></div>
      <div class="stat"><div class="label">Agaciro k'ibisigaye</div><div class="value">${fmtRWF(insights.totalStockValue)}</div></div>
      <div class="stat"><div class="label">Umunsi mwiza (iminsi 7)</div><div class="value" style="font-size:16px;">${insights.bestDay ? insights.bestDay.label + ' — ' + fmtRWF(insights.bestDay.revenue) : '—'}</div></div>
    </div>
  `;
}

function revenueChartHtml(dailyRevenue) {
  const max = Math.max(1, ...dailyRevenue.map(d => d.revenue));
  return `
    <div class="card">
      <h3>Amafaranga mu minsi 7 ishize</h3>
      <div class="bar-chart">
        ${dailyRevenue.map(d => `
          <div class="bar-col">
            <div class="bar-track">
              <div class="bar-fill" style="height:${Math.max(3, Math.round((d.revenue / max) * 100))}%;" title="${fmtRWF(d.revenue)}"></div>
            </div>
            <div class="bar-label">${d.label}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

function topProductsHtml(topProducts) {
  return `
    <div class="card">
      <h3>Ibicuruzwa byagurishijwe cyane</h3>
      <table><thead><tr><th>${t('productName')}</th><th>${t('quantity')}</th><th>${t('amount')}</th></tr></thead><tbody>
        ${topProducts.map((p, i) => `<tr><td class="name-cell">${i + 1}. ${esc(p.name)}</td><td>${p.qty}</td><td>${fmtRWF(p.revenue)}</td></tr>`).join('')}
      </tbody></table>
    </div>
  `;
}

function insightBoxHtml(insights) {
  const trendLabel = insights.trend === 'up' ? '↑' : insights.trend === 'down' ? '↓' : '→';
  const fallback = `${t('totalRevenue')}: ${fmtRWF(insights.totalRevenue)}. ${
    insights.topProduct ? `Icyagurishijwe cyane: ${insights.topProduct.name} (${fmtRWF(insights.topProduct.revenue)}).` : ''
  } Uyu munsi ugereranyije n'ejo: ${trendLabel} ${Math.abs(insights.trendPct)}%. ${
    insights.lowStockCount > 0 ? `Ibicuruzwa ${insights.lowStockCount} bigiye kubura.` : ''
  }`;
  return `<div class="insight-box"><span class="tag">${t('aiInsights')}</span>${esc(insights.narrative || fallback)}</div>`;
}

async function productsHtml() {
  const products = await API.get('/api/products');
  const isAdmin = state.user.role === 'admin';
  return `
    <div class="topbar"><h2>${t('products')}</h2></div>
    ${isAdmin ? `
    <div class="card">
      <h3>${t('addProduct')}</h3>
      <div class="form-row">
        <div class="field" style="margin:0;"><label>${t('productName')}</label><input id="p-name" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('price')}</label><input id="p-price" type="number" min="0"></div>
        <div class="field" style="margin:0;"><label>${t('stock')}</label><input id="p-stock" type="number" min="0"></div>
      </div>
      <button class="btn-secondary" id="add-product-btn">${t('addProduct')}</button>
      <div class="form-msg" id="product-msg"></div>
    </div>` : ''}
    ${products.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>${t('productName')}</th><th>${t('price')}</th><th>${t('stock')}</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
      ${products.map(p => `
        <tr class="${p.stock <= 5 ? 'flag' : ''}">
          <td class="name-cell">${esc(p.name)}${p.stock <= 5 ? `<span class="pill warn">${t('lowStock')}</span>` : ''}</td>
          <td>${fmtRWF(p.price)}</td><td>${p.stock}</td>
          ${isAdmin ? `<td><button class="btn-secondary btn-danger" data-del="${p.id}" style="padding:4px 10px;font-size:12px;">✕</button></td>` : ''}
        </tr>`).join('')}
    </tbody></table>`}
  `;
}

async function sellHtml() {
  const products = await API.get('/api/products');
  return `
    <div class="topbar"><h2>${t('sell')}</h2></div>
    <div class="card">
      <div class="sell-row">
        <div class="field" style="margin:0;">
          <label>${t('productName')}</label>
          <select id="s-product">
            ${products.length === 0 ? `<option value="">—</option>` :
              products.map(p => `<option value="${p.id}">${esc(p.name)} — ${fmtRWF(p.price)} (${p.stock})</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0;"><label>${t('quantity')}</label><input id="s-qty" type="number" min="1" value="1"></div>
      </div>
      <div class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('customerName')}</label><input id="s-cname" type="text" placeholder="${t('customerName')}"></div>
        <div class="field" style="margin:0;"><label>${t('customerPhone')}</label><input id="s-cphone" type="tel" placeholder="07XX XXX XXX"></div>
      </div>
      <div class="field"><label>${t('customerEmail')} (${t('optional')})</label><input id="s-cemail" type="email" placeholder="client@email.com"></div>
      <div class="field">
        <label>${t('paymentMethod')}</label>
        <div class="pay-toggle">
          <button type="button" class="pay-opt active" data-pay="cash">💵 ${t('cash')}</button>
          <button type="button" class="pay-opt" data-pay="phone">📱 ${t('mobileMoney')}</button>
          <button type="button" class="pay-opt" data-pay="bank">🏦 ${t('bank')}</button>
        </div>
      </div>
      <div class="field" id="s-bankname-wrap" style="display:none;">
        <label>${t('bankName')}</label>
        <input id="s-bankname" type="text" list="bank-list" placeholder="${t('bankNamePlaceholder')}">
        <datalist id="bank-list">
          <option value="Bank of Kigali (BK)">
          <option value="Equity Bank">
          <option value="I&M Bank">
          <option value="Cogebanque">
          <option value="Ecobank">
          <option value="KCB Bank">
          <option value="Access Bank">
          <option value="Urwego Bank">
        </datalist>
      </div>
      <div class="field" style="max-width:280px;">
        <label>${t('amountPaid')}</label>
        <input id="s-amount" type="number" min="0" placeholder="${t('amountPaidHint')}">
      </div>
      <button class="btn-primary" id="sell-btn" ${products.length === 0 ? 'disabled' : ''} style="width:auto;">${t('recordSale')}</button>
      <div class="form-msg" id="sell-msg"></div>
    </div>
  `;
}

async function customersHtml() {
  const sales = await API.get('/api/sales');
  const map = new Map();
  for (const s of sales) {
    const key = (s.customerName || '—').trim().toLowerCase() + '|' + (s.customerPhone || '').trim();
    if (!map.has(key)) {
      map.set(key, {
        name: s.customerName || '—',
        phone: s.customerPhone || '',
        email: s.customerEmail || '',
        total: 0,
        debt: 0,
        count: 0,
        last: s.timestamp
      });
    }
    const c = map.get(key);
    c.total += (s.amountPaid != null ? s.amountPaid : s.total);
    const isDebt = s.paymentStatus === 'debt' || (s.balance != null && s.balance < 0);
    if (isDebt) c.debt += Math.abs(s.balance || (s.total - s.amountPaid));
    c.count += 1;
    if (new Date(s.timestamp) > new Date(c.last)) c.last = s.timestamp;
  }
  const customers = [...map.values()].sort((a, b) => b.total - a.total);
  return `
    <div class="topbar"><h2>${t('customers')}</h2></div>
    ${customers.length === 0 ? `<div class="empty">${t('noCustomersYet')}</div>` : `
    <div class="cust-grid">
      ${customers.map(c => `
        <div class="cust-card" data-cust-filter="${esc(c.name)}">
          <div class="cust-name">${esc(c.name)}</div>
          <div class="cust-sub">${esc(c.phone || c.email || '—')}</div>
          <div class="cust-stats">
            <div>
              <div class="cust-total">${fmtRWF(c.total)}</div>
              <div class="cust-count">${c.count} ${t('purchases')} · ${fmtDate(c.last)}</div>
            </div>
          </div>
          ${c.debt > 0 ? `<div style="margin-top:10px;"><span class="pay-badge debt">⚠️ ${t('debt')} · ${fmtRWF(c.debt)}</span></div>` : ''}
        </div>
      `).join('')}
    </div>`}
  `;
}

async function historyHtml() {
  const allSales = await API.get('/api/sales');
  const filter = state.historyFilter || 'all';
  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  let sales = filter === 'today' ? allSales.filter(s => isToday(s.timestamp)) : allSales;
  if (state.customerFilter) {
    sales = sales.filter(s => (s.customerName || '—') === state.customerFilter);
  }
  const payLabel = (s) => {
    if (s.paymentMethod === 'phone') return `📱 ${t('mobileMoney')}`;
    if (s.paymentMethod === 'bank') return `🏦 ${esc(s.bankName || t('bank'))}`;
    return `💵 ${t('cash')}`;
  };
  const payClass = (s) => s.paymentMethod === 'phone' ? 'phone' : s.paymentMethod === 'bank' ? 'bank' : 'cash';
  return `
    <div class="topbar">
      <h2>${t('history')}</h2>
      <div class="hist-filter">
        <button data-hist="all" class="${filter === 'all' ? 'active' : ''}">${t('allHistory')}</button>
        <button data-hist="today" class="${filter === 'today' ? 'active' : ''}">${t('todayOnly')}</button>
      </div>
    </div>
    ${state.customerFilter ? `
      <div class="filter-banner">
        <span>${t('showingHistoryFor')}: <strong>${esc(state.customerFilter)}</strong></span>
        <button id="clear-cust-filter">${t('clearFilter')}</button>
      </div>` : ''}
    ${sales.length === 0 ? `<div class="empty">—</div>` : `
    <div style="overflow-x:auto;">
    <table><thead><tr>
      <th>${t('givenAt')}</th><th>${t('customerName')}</th><th>${t('productName')}</th><th>${t('quantity')}</th>
      <th>Total</th><th>${t('paymentMethod')}</th><th>${t('amountPaid')}</th><th>${t('paymentStatus')}</th><th>${t('paidAt')}</th><th></th>
    </tr></thead><tbody>
      ${sales.map(s => {
        const isDebt = s.paymentStatus === 'debt' || (s.balance != null && s.balance < 0);
        return `<tr class="${isDebt ? 'flag' : ''}">
        <td>${fmtDate(s.givenAt || s.timestamp)}</td>
        <td class="name-cell">${esc(s.customerName || '—')}${s.customerPhone ? `<div style="font-size:11px;color:var(--ink-muted);font-family:'IBM Plex Mono',monospace;font-weight:400;">${esc(s.customerPhone)}</div>` : ''}</td>
        <td class="name-cell">${esc(s.productName)}</td>
        <td>${s.qty}</td>
        <td>${fmtRWF(s.total)}</td>
        <td><span class="pay-badge ${payClass(s)}">${payLabel(s)}</span></td>
        <td>${s.amountPaid != null ? fmtRWF(s.amountPaid) : fmtRWF(s.total)}</td>
        <td>${isDebt
            ? `<span class="pay-badge debt">⚠️ ${t('debt')} · ${fmtRWF(Math.abs(s.balance || (s.total - s.amountPaid)))}</span>`
            : `<span class="pay-badge paid">✅ ${t('paid')}</span>`}</td>
        <td>${s.paidAt ? fmtDate(s.paidAt) : t('notApplicable')}</td>
        <td>${isDebt ? `<button class="btn-secondary settle-btn" data-sale-id="${s.id}" style="padding:5px 10px;font-size:12px;">${t('settleDebt')}</button>` : ''}</td>
      </tr>`;
      }).join('')}
    </tbody></table>
    </div>`}
  `;
}

async function guestsHtml() {
  const guests = await API.get('/api/admin/guests');
  return `
    <div class="topbar"><h2>${t('guests')}</h2></div>
    <div class="card">
      <h3>${t('addGuest')}</h3>
      <div class="form-row">
        <div class="field" style="margin:0;"><label>${t('fullName')}</label><input id="g-name" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('email')}</label><input id="g-email" type="email"></div>
        <div class="field" style="margin:0;"><label>${t('phone')}</label><input id="g-phone" type="tel"></div>
      </div>
      <div class="field" style="max-width:260px;"><label>${t('password')}</label><input id="g-password" type="password"></div>
      <button class="btn-secondary" id="add-guest-btn">${t('addGuest')}</button>
      <div class="form-msg" id="guest-msg"></div>
    </div>
    ${guests.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>${t('fullName')}</th><th>${t('email')}</th><th>${t('phone')}</th><th>Status</th><th></th></tr></thead><tbody>
      ${guests.map(g => `<tr><td class="name-cell">${esc(g.name)}</td><td>${esc(g.email)}</td><td>${esc(g.phone)}</td>
        <td><span class="pill ${g.status === 'blocked' ? 'warn' : 'ok'}">${g.status}</span></td>
        <td><button class="btn-secondary" data-toggle-block="${g.id}" style="padding:4px 10px;font-size:12px;">${g.status === 'blocked' ? 'Unblock' : 'Block'}</button></td>
      </tr>`).join('')}
    </tbody></table>`}
  `;
}

async function paymentsHtml() {
  const payments = await API.get('/api/payments');
  return `
    <div class="topbar"><h2>${t('commission')}</h2></div>
    ${payments.length === 0 ? `<div class="empty">Nta bwishyu buracyabaho. Bizajya bikorwa buri munsi bitewe n'ibyagurishijwe.</div>` : payments.map(p => paymentCardHtml(p)).join('')}
  `;
}

function paymentCardHtml(p) {
  const statusColor = { pending: 'muted', confirmed: 'ok', shortfall: 'warn', missed: 'warn' }[p.status] || 'muted';
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>${fmtDate(p.periodEnd)}</strong>
        <span class="pill ${statusColor}">${p.status}</span>
      </div>
      <div style="font-size:14px;color:var(--ink-muted);margin-bottom:10px;">
        Ibyagurishijwe: ${fmtRWF(p.totalSales)} · Commission isabwa: <strong class="mono">${fmtRWF(p.expectedAmount)}</strong>
        ${p.confirmedAmount != null ? ` · Wemeje: ${fmtRWF(p.confirmedAmount)}` : ''}
        ${p.shortfall ? ` · Usigaje: ${fmtRWF(p.shortfall)}` : ''}
      </div>
      ${p.status === 'pending' ? `
      <div class="form-row">
        <div class="field" style="margin:0;"><label>${t('phone')}</label><input class="pay-phone" type="tel" value="${esc(state.user.phone)}"></div>
        <div class="field" style="margin:0;"><label>${t('amountSent')}</label><input class="pay-amount" type="number" min="0"></div>
        <div class="field" style="margin:0;"><label>${t('reference')}</label><input class="pay-ref" type="text"></div>
      </div>
      <button class="btn-secondary" data-confirm-pay="${p.id}">${t('confirmPayment')}</button>
      <div class="form-msg pay-msg"></div>` : ''}
    </div>
  `;
}

async function trashHtml() {
  const trash = await API.get('/api/admin/trash');
  return `
    <div class="topbar"><h2>${t('trash')}</h2></div>
    ${trash.products.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>${t('productName')}</th><th>${t('price')}</th><th>Yasibwe</th></tr></thead><tbody>
      ${trash.products.map(p => `<tr><td class="name-cell">${esc(p.name)}</td><td>${fmtRWF(p.price)}</td><td>${fmtDate(p.deletedAt)}</td></tr>`).join('')}
    </tbody></table>`}
  `;
}

async function auditHtml(endpoint) {
  const log = await API.get(endpoint);
  return `
    <div class="topbar"><h2>Audit log</h2></div>
    ${log.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>Itariki</th><th>Action</th><th>Entity</th></tr></thead><tbody>
      ${log.map(a => `<tr><td>${fmtDate(a.timestamp)}</td><td class="name-cell">${esc(a.action)}</td><td>${esc(a.entity)}</td></tr>`).join('')}
    </tbody></table>`}
  `;
}

async function notificationsHtml(endpoint) {
  const notes = endpoint ? await API.get(endpoint) : [];
  return `
    <div class="topbar"><h2>${t('notifications')}</h2></div>
    ${notes.length === 0 ? `<div class="empty">—</div>` : notes.map(n => `
      <div class="notif-item ${n.type}">
        <div>${esc(n.message)}</div>
        <div class="time">${fmtDate(n.timestamp)}</div>
      </div>`).join('')}
  `;
}

function bindBusinessViewEvents(view) {
  if (view === 'products') {
    const addBtn = document.getElementById('add-product-btn');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const name = document.getElementById('p-name').value.trim();
      const price = parseFloat(document.getElementById('p-price').value);
      const stock = parseInt(document.getElementById('p-stock').value, 10);
      const msg = document.getElementById('product-msg');
      try {
        await API.post('/api/products', { name, price, stock });
        renderApp();
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Siba iki gicuruzwa?')) return;
        await API.del('/api/products/' + btn.dataset.del);
        renderApp();
      });
    });
  }
  if (view === 'sell') {
    let selectedPayMethod = 'cash';
    document.querySelectorAll('.pay-opt').forEach(pbtn => {
      pbtn.addEventListener('click', () => {
        document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
        pbtn.classList.add('active');
        selectedPayMethod = pbtn.dataset.pay;
        const bankWrap = document.getElementById('s-bankname-wrap');
        if (bankWrap) bankWrap.style.display = selectedPayMethod === 'bank' ? 'block' : 'none';
      });
    });
    const btn = document.getElementById('sell-btn');
    if (btn) btn.addEventListener('click', async () => {
      const productId = document.getElementById('s-product').value;
      const qty = parseInt(document.getElementById('s-qty').value, 10);
      const customerName = document.getElementById('s-cname').value.trim();
      const customerPhone = document.getElementById('s-cphone').value.trim();
      const customerEmail = document.getElementById('s-cemail').value.trim();
      const bankName = document.getElementById('s-bankname') ? document.getElementById('s-bankname').value.trim() : '';
      const amountRaw = document.getElementById('s-amount').value;
      const amountPaid = amountRaw === '' ? null : parseFloat(amountRaw);
      const msg = document.getElementById('sell-msg');
      if (!customerName) {
        msg.textContent = t('customerNameRequired');
        msg.className = 'form-msg show error';
        return;
      }
      try {
        await API.post('/api/sales', { productId, qty, customerName, customerPhone, customerEmail, paymentMethod: selectedPayMethod, bankName, amountPaid });
        msg.textContent = 'Byakunze!';
        msg.className = 'form-msg show success';
        setTimeout(renderApp, 600);
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });
  }
  if (view === 'history') {
    document.querySelectorAll('[data-hist]').forEach(hbtn => {
      hbtn.addEventListener('click', () => { state.historyFilter = hbtn.dataset.hist; renderApp(); });
    });
    const clearBtn = document.getElementById('clear-cust-filter');
    if (clearBtn) clearBtn.addEventListener('click', () => { state.customerFilter = null; renderApp(); });
    document.querySelectorAll('.settle-btn').forEach(sbtn => {
      sbtn.addEventListener('click', async () => {
        const amountStr = window.prompt(t('settleDebtAmount'));
        if (amountStr === null) return;
        const amount = parseFloat(amountStr);
        if (!amount || amount <= 0) return;
        try {
          await API.patch(`/api/sales/${sbtn.dataset.saleId}/settle`, { amount });
          renderApp();
        } catch (e) { alert(e.message); }
      });
    });
  }
  if (view === 'customers') {
    document.querySelectorAll('[data-cust-filter]').forEach(card => {
      card.addEventListener('click', () => {
        state.customerFilter = card.dataset.custFilter;
        state.historyFilter = 'all';
        state.view = 'history';
        renderApp();
      });
    });
  }
  if (view === 'guests') {
    const btn = document.getElementById('add-guest-btn');
    if (btn) btn.addEventListener('click', async () => {
      const name = document.getElementById('g-name').value.trim();
      const email = document.getElementById('g-email').value.trim();
      const phone = document.getElementById('g-phone').value.trim();
      const password = document.getElementById('g-password').value;
      const msg = document.getElementById('guest-msg');
      try {
        await API.post('/api/admin/guests', { name, email, phone, password });
        renderApp();
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });
    document.querySelectorAll('[data-toggle-block]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.patch('/api/admin/guests/' + btn.dataset.toggleBlock + '/block');
        renderApp();
      });
    });
  }
  if (view === 'payments') {
    document.querySelectorAll('[data-confirm-pay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.card');
        const phone = card.querySelector('.pay-phone').value.trim();
        const amountSent = parseFloat(card.querySelector('.pay-amount').value);
        const reference = card.querySelector('.pay-ref').value.trim();
        const msg = card.querySelector('.pay-msg');
        try {
          await API.post('/api/payments/' + btn.dataset.confirmPay + '/confirm', { phone, amountSent, reference });
          renderApp();
        } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
      });
    });
  }
}

// ================= SUPERADMIN VIEWS =================
async function renderSuperadminView() {
  const view = state.view;
  let html = '';
  if (view === 'pending') html = await pendingAdminsHtml();
  else if (view === 'businesses') html = state.businessDetail ? await businessDetailHtml(state.businessDetail) : await businessesListHtml();
  else if (view === 'notifications') html = await notificationsHtml('/api/superadmin/notifications');
  else if (view === 'auditlog') html = await auditHtml('/api/superadmin/audit-log');
  else html = await pendingAdminsHtml();

  renderShell(html);
  bindSuperadminEvents(view);
}

async function pendingAdminsHtml() {
  const pending = await API.get('/api/superadmin/pending-admins');
  return `
    <div class="topbar"><h2>Pending approvals</h2></div>
    ${pending.length === 0 ? `<div class="empty">Nta muntu ategereje kwemezwa.</div>` : `
    <table><thead><tr><th>${t('fullName')}</th><th>${t('email')}</th><th>${t('phone')}</th><th></th></tr></thead><tbody>
      ${pending.map(u => `<tr><td class="name-cell">${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td>
        <td><button class="btn-secondary" data-approve="${u.id}" style="padding:4px 10px;font-size:12px;">Approve</button></td></tr>`).join('')}
    </tbody></table>`}
  `;
}

async function businessesListHtml() {
  const businesses = await API.get('/api/superadmin/businesses');
  return `
    <div class="topbar"><h2>Businesses</h2></div>
    ${businesses.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>${t('fullName')}</th><th>${t('totalRevenue')}</th><th>Products</th><th>Guests</th><th>Status</th><th></th></tr></thead><tbody>
      ${businesses.map(b => `<tr>
        <td class="name-cell">${esc(b.name)}</td>
        <td>${fmtRWF(b.totalRevenue)}</td>
        <td>${b.productCount} (${b.deletedProductCount} deleted)</td>
        <td>${b.guestCount}</td>
        <td><span class="pill ${b.status === 'blocked' || b.status === 'locked' ? 'warn' : 'ok'}">${b.status}</span></td>
        <td>
          <button class="btn-secondary" data-view-business="${b.id}" style="padding:4px 10px;font-size:12px;">View</button>
          <button class="btn-secondary" data-toggle-block-business="${b.id}" style="padding:4px 10px;font-size:12px;">${b.status === 'blocked' ? 'Unblock' : 'Block'}</button>
          ${b.status === 'locked' ? `<button class="btn-secondary" data-unlock-business="${b.id}" style="padding:4px 10px;font-size:12px;">Unlock</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>`}
  `;
}

async function businessDetailHtml(businessId) {
  const detail = await API.get('/api/superadmin/businesses/' + businessId);
  const activeProducts = detail.products.filter(p => !p.deletedAt);
  const deletedProducts = detail.products.filter(p => p.deletedAt);
  return `
    <div class="topbar">
      <h2>${esc(detail.admin.name)}</h2>
      <button class="btn-secondary" id="back-to-list">← Back</button>
    </div>
    <div class="grid-stats">
      <div class="stat positive"><div class="label">${t('totalRevenue')}</div><div class="value">${fmtRWF(detail.sales.reduce((s, x) => s + x.total, 0))}</div></div>
      <div class="stat"><div class="label">Products</div><div class="value">${activeProducts.length}</div></div>
      <div class="stat"><div class="label">Guests</div><div class="value">${detail.guests.length}</div></div>
    </div>

    <h3 style="margin-bottom:12px;">Products (${t('trash')}: ${deletedProducts.length})</h3>
    <table><thead><tr><th>${t('productName')}</th><th>${t('price')}</th><th>${t('stock')}</th><th>Status</th></tr></thead><tbody>
      ${detail.products.map(p => `<tr class="${p.deletedAt ? 'flag' : ''}"><td class="name-cell">${esc(p.name)}</td><td>${fmtRWF(p.price)}</td><td>${p.stock}</td><td>${p.deletedAt ? 'Deleted ' + fmtDate(p.deletedAt) : 'Active'}</td></tr>`).join('')}
    </tbody></table>

    <h3 style="margin:22px 0 12px;">Recent sales</h3>
    ${detail.sales.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>Itariki</th><th>${t('productName')}</th><th>${t('quantity')}</th><th>Total</th></tr></thead><tbody>
      ${detail.sales.slice(0, 30).map(s => `<tr><td>${fmtDate(s.timestamp)}</td><td class="name-cell">${esc(s.productName)}</td><td>${s.qty}</td><td>${fmtRWF(s.total)}</td></tr>`).join('')}
    </tbody></table>`}

    <h3 style="margin:22px 0 12px;">Payments</h3>
    ${detail.payments.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>Period</th><th>Expected</th><th>Confirmed</th><th>Status</th></tr></thead><tbody>
      ${detail.payments.map(p => `<tr><td>${fmtDate(p.periodEnd)}</td><td>${fmtRWF(p.expectedAmount)}</td><td>${p.confirmedAmount != null ? fmtRWF(p.confirmedAmount) : '—'}</td><td><span class="pill ${p.status === 'confirmed' ? 'ok' : 'warn'}">${p.status}</span></td></tr>`).join('')}
    </tbody></table>`}
  `;
}

function bindSuperadminEvents(view) {
  if (view === 'pending') {
    document.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.patch('/api/superadmin/users/' + btn.dataset.approve + '/approve');
        renderApp();
      });
    });
  }
  if (view === 'businesses') {
    document.querySelectorAll('[data-view-business]').forEach(btn => {
      btn.addEventListener('click', () => { state.businessDetail = btn.dataset.viewBusiness; renderApp(); });
    });
    document.querySelectorAll('[data-toggle-block-business]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.patch('/api/superadmin/users/' + btn.dataset.toggleBlockBusiness + '/block');
        renderApp();
      });
    });
    document.querySelectorAll('[data-unlock-business]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.patch('/api/superadmin/users/' + btn.dataset.unlockBusiness + '/unlock');
        renderApp();
      });
    });
    const back = document.getElementById('back-to-list');
    if (back) back.addEventListener('click', () => { state.businessDetail = null; renderApp(); });
  }
}

init();
