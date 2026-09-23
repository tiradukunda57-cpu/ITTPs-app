const root = document.getElementById('root');
let state = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  view: 'dashboard',
  authTab: 'login',
  businessDetail: null, // for superadmin drill-down
  historyFilter: 'all',
  customerFilter: null,
  dispatchTab: 'pending',
  newDispatchItems: [],
  returningDispatchId: null,
  procTab: 'pending',
  newProcItems: []
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

// Uturere 30 tw'u Rwanda, buri kamwe hamwe n'umujyi wako uzwi cyane.
const RW_DISTRICTS = [
  { district: 'Nyarugenge', town: 'Nyarugenge (Kigali)' },
  { district: 'Gasabo', town: 'Gasabo (Kigali)' },
  { district: 'Kicukiro', town: 'Kicukiro (Kigali)' },
  { district: 'Huye', town: 'Huye (Butare)' },
  { district: 'Nyanza', town: 'Nyanza' },
  { district: 'Gisagara', town: 'Gisagara' },
  { district: 'Nyaruguru', town: 'Nyaruguru (Kibeho)' },
  { district: 'Muhanga', town: 'Muhanga (Gitarama)' },
  { district: 'Kamonyi', town: 'Kamonyi' },
  { district: 'Ruhango', town: 'Ruhango' },
  { district: 'Nyamagabe', town: 'Nyamagabe (Gikongoro)' },
  { district: 'Rubavu', town: 'Rubavu (Gisenyi)' },
  { district: 'Rusizi', town: 'Rusizi (Kamembe)' },
  { district: 'Nyabihu', town: 'Nyabihu' },
  { district: 'Ngororero', town: 'Ngororero' },
  { district: 'Rutsiro', town: 'Rutsiro' },
  { district: 'Karongi', town: 'Karongi (Kibuye)' },
  { district: 'Nyamasheke', town: 'Nyamasheke' },
  { district: 'Musanze', town: 'Musanze (Ruhengeri)' },
  { district: 'Gicumbi', town: 'Gicumbi (Byumba)' },
  { district: 'Rulindo', town: 'Rulindo' },
  { district: 'Burera', town: 'Burera' },
  { district: 'Gakenke', town: 'Gakenke' },
  { district: 'Rwamagana', town: 'Rwamagana' },
  { district: 'Nyagatare', town: 'Nyagatare' },
  { district: 'Gatsibo', town: 'Gatsibo' },
  { district: 'Kayonza', town: 'Kayonza' },
  { district: 'Kirehe', town: 'Kirehe' },
  { district: 'Ngoma', town: 'Ngoma (Kibungo)' },
  { district: 'Bugesera', town: 'Bugesera (Nyamata)' }
];

// Amabanki akoreshwa cyane mu Rwanda
const RW_BANKS = [
  'Bank of Kigali (BK)', 'Equity Bank Rwanda', 'I&M Bank Rwanda', 'Cogebanque',
  'Ecobank Rwanda', 'KCB Bank Rwanda', 'Access Bank Rwanda', 'Urwego Bank',
  'GT Bank Rwanda', 'NCBA Bank Rwanda', 'Banque Populaire du Rwanda (BPR)',
  'Zigama CSS', 'AB Bank Rwanda', 'Unguka Bank', 'Development Bank of Rwanda (BRD)'
];

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
      ['pending', '🕓', t('superadmin') + ': ' + 'Approvals'],
      ['businesses', '🏢', 'Businesses'],
      ['notifications', '🔔', t('notifications')],
      ['auditlog', '📜', 'Audit log']
    ];
  }
  const common = [
    ['dashboard', '📊', t('dashboard')],
    ['products', '📦', t('products')],
    ['sell', '🧾', t('sell')],
    ['dispatches', '🚚', t('dispatches')],
    ['history', '🕘', t('history')],
    ['customers', '👥', t('customers')]
  ];
  if (role === 'admin') {
    return [...common, ['procurements', '🛒', t('procurements')], ['guests', '🧑‍💼', t('guests')], ['payments', '💳', t('commission')], ['trash', '🗑️', t('trash')], ['audit', '📜', 'Audit log'], ['notifications', '🔔', t('notifications')]];
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
          ${items.map(([key, icon, label]) => `<button data-view="${key}" class="${state.view === key ? 'active' : ''}"><span class="nav-icon">${icon}</span><span class="nav-label">${label}</span></button>`).join('')}
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
  else if (view === 'dispatches') html = await dispatchesHtml();
  else if (view === 'procurements') html = await procurementsHtml();
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
      <div class="form-row" style="grid-template-columns:2fr 1fr 1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('productName')}</label><input id="p-name" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('price')}</label><input id="p-price" type="number" min="0"></div>
        <div class="field" style="margin:0;"><label>${t('stock')}</label><input id="p-stock" type="number" min="0"></div>
        <div class="field" style="margin:0;"><label>${t('unit')}</label>
          <select id="p-unit">
            <option value="unit">${t('unitPiece')}</option>
            <option value="kg">${t('unitKg')}</option>
            <option value="litre">${t('unitLitre')}</option>
            <option value="metre">${t('unitMetre')}</option>
          </select>
        </div>
      </div>
      <button class="btn-secondary" id="add-product-btn">${t('addProduct')}</button>
      <div class="form-msg" id="product-msg"></div>
    </div>` : ''}
    ${products.length === 0 ? `<div class="empty">—</div>` : `
    <table><thead><tr><th>${t('productName')}</th><th>${t('price')}</th><th>${t('stock')}</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>
      ${products.map(p => `
        <tr class="${p.stock <= 5 ? 'flag' : ''}">
          <td class="name-cell">${esc(p.name)}${p.stock <= 5 ? `<span class="pill warn">${t('lowStock')}</span>` : ''}</td>
          <td>${fmtRWF(p.price)}</td><td>${p.stock} ${unitAbbrev(p.unit)}</td>
          ${isAdmin ? `<td><button class="btn-secondary btn-danger" data-del="${p.id}" style="padding:4px 10px;font-size:12px;">✕</button></td>` : ''}
        </tr>`).join('')}
    </tbody></table>`}
  `;
}

function unitAbbrev(unit) {
  return unit === 'kg' ? 'kg' : unit === 'litre' ? 'L' : unit === 'metre' ? 'm' : t('unitPieceShort');
}
function unitLabel(unit) {
  return unit === 'kg' ? t('unitKg') : unit === 'litre' ? t('unitLitre') : unit === 'metre' ? t('unitMetre') : t('unitPiece');
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
              products.map(p => `<option value="${p.id}">${esc(p.name)} — ${fmtRWF(p.price)} (${p.stock} ${unitAbbrev(p.unit)})</option>`).join('')}
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
          ${RW_BANKS.map(b => `<option value="${esc(b)}">`).join('')}
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

// ===================== Kohereza Ibicuruzwa (Field Dispatch) =====================

function relTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('now');
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h${mins % 60 ? ' ' + (mins % 60) + 'min' : ''}`;
  return fmtDate(iso);
}

async function dispatchesHtml() {
  const tab = state.dispatchTab || 'pending';
  const dispatches = await API.get('/api/dispatches');
  const pending = dispatches.filter(d => d.status === 'pending');
  const completed = dispatches.filter(d => d.status === 'returned');

  let inner = '';
  if (tab === 'new') inner = await dispatchNewFormHtml();
  else if (tab === 'pending') inner = dispatchPendingHtml(pending);
  else inner = dispatchCompletedHtml(completed);

  return `
    <div class="topbar">
      <h2>${t('dispatches')}</h2>
      <div class="hist-filter">
        <button data-dtab="pending" class="${tab === 'pending' ? 'active' : ''}">${t('pendingDispatches')}${pending.length ? ` (${pending.length})` : ''}</button>
        <button data-dtab="completed" class="${tab === 'completed' ? 'active' : ''}">${t('completedDispatches')}</button>
        <button data-dtab="new" class="${tab === 'new' ? 'active' : ''}">+ ${t('newDispatch')}</button>
      </div>
    </div>
    ${inner}
  `;
}

async function dispatchNewFormHtml() {
  const products = await API.get('/api/products');
  const rows = state.newDispatchItems || [];
  return `
    <div class="card">
      <h3 class="disp-section-title">${t('vendorName')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('vendorName')}</label><input id="d-vname" type="text" value="${esc((state.user && state.user.name) || '')}" placeholder="${t('vendorName')}"></div>
        <div class="field" style="margin:0;"><label>${t('vendorContact')}</label><input id="d-vcontact" type="tel" value="${esc((state.user && state.user.phone) || '')}" placeholder="07XX XXX XXX"></div>
        <div class="field" style="margin:0;"><label>${t('vendorEmail')} (${t('optional')})</label><input id="d-vemail" type="email" value="${esc((state.user && state.user.email) || '')}"></div>
      </div>

      <h3 class="disp-section-title" style="margin-top:22px;">${t('itemsToTake')}</h3>
      <div class="sell-row" style="align-items:flex-end;">
        <div class="field" style="margin:0;">
          <label>${t('productName')}</label>
          <select id="d-product">
            ${products.length === 0 ? `<option value="">—</option>` :
              products.map(p => `<option value="${p.id}" data-price="${p.price}" data-name="${esc(p.name)}" data-stock="${p.stock}">${esc(p.name)} — ${fmtRWF(p.price)} (${p.stock} ${unitAbbrev(p.unit)})</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0;max-width:130px;"><label>${t('quantity')}</label><input id="d-qty" type="number" min="1" value="1"></div>
        <button class="btn-secondary" id="d-add-item" type="button" style="width:auto;">+ ${t('addItem')}</button>
      </div>
      <div class="form-msg" id="d-add-msg"></div>

      ${rows.length > 0 ? `
      <div style="overflow-x:auto;margin-top:14px;">
      <table><thead><tr><th>${t('productName')}</th><th>${t('quantity')}</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr>
          <td class="name-cell">${esc(r.name)}</td>
          <td>${r.qty}</td>
          <td><button class="btn-secondary remove-item-btn" data-idx="${i}" type="button" style="padding:4px 10px;font-size:12px;">${t('removeItem')}</button></td>
        </tr>`).join('')}
      </tbody></table>
      </div>` : `<div class="empty" style="margin-top:14px;">—</div>`}

      <button class="btn-primary" id="dispatch-submit-btn" style="width:auto;margin-top:18px;" ${rows.length === 0 ? 'disabled' : ''}>🚚 ${t('dispatchGoods')}</button>
      <div class="form-msg" id="dispatch-msg"></div>
    </div>
  `;
}

function dispatchPendingHtml(pending) {
  if (pending.length === 0) return `<div class="empty">${t('noPendingDispatches')}</div>`;
  return `
    <div class="disp-grid">
      ${pending.map(d => `
        <div class="disp-card">
          <div class="disp-card-head">
            <div>
              <div class="cust-name">${esc(d.vendorName)}</div>
              <div class="cust-sub">${esc(d.vendorContact || d.vendorEmail || '—')}</div>
            </div>
            <span class="pay-badge pending">🕒 ${t('pending')}</span>
          </div>
          <div class="disp-items">
            ${d.items.map(it => `<div class="disp-item-row"><span>${esc(it.productName)}</span><span>${it.qtyTaken}</span></div>`).join('')}
          </div>
          <div class="disp-card-foot">
            <span class="cust-count">${t('dispatchedAt')}: ${relTime(d.dispatchedAt)}</span>
            <button class="btn-primary return-dispatch-btn" data-id="${d.id}" style="width:auto;padding:8px 16px;font-size:13px;">${t('markReturned')}</button>
          </div>
          ${state.returningDispatchId === d.id ? dispatchReturnFormHtml(d) : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function dispatchReturnFormHtml(d) {
  return `
    <div class="disp-return-form">
      <div class="disp-return-grid">
        ${d.items.map(it => `
          <div class="field" style="margin:0;">
            <label>${esc(it.productName)} — ${t('qtyTaken')}: ${it.qtyTaken}</label>
            <input type="number" min="0" max="${it.qtyTaken}" value="0" class="return-qty-input" data-product-id="${it.productId}" placeholder="${t('qtyReturned')}">
          </div>
        `).join('')}
      </div>
      <div class="field" style="max-width:260px;margin-top:10px;">
        <label>${t('amountCollected')}</label>
        <input type="number" min="0" id="return-amount-${d.id}" placeholder="0">
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="btn-primary confirm-return-btn" data-id="${d.id}" style="width:auto;">${t('confirmReturn')}</button>
        <button class="btn-secondary cancel-return-btn" style="width:auto;">✕</button>
      </div>
      <div class="form-msg" id="return-msg-${d.id}"></div>
    </div>
  `;
}

function dispatchCompletedHtml(completed) {
  if (completed.length === 0) return `<div class="empty">${t('noCompletedDispatches')}</div>`;
  return `
    <div style="overflow-x:auto;">
    <table><thead><tr>
      <th>${t('vendorName')}</th><th>${t('dispatchedAt')}</th><th>${t('returnedAt')}</th>
      <th>${t('amountCollected')}</th><th>${t('expectedAmount')}</th><th>${t('variance')}</th>
    </tr></thead><tbody>
      ${completed.map(d => {
        const v = d.variance || 0;
        const vLabel = v === 0 ? `✅ ${t('matches')}` : v < 0 ? `⚠️ ${t('shortfall')} · ${fmtRWF(Math.abs(v))}` : `💰 ${t('surplus')} · ${fmtRWF(v)}`;
        const vClass = v === 0 ? 'paid' : v < 0 ? 'debt' : 'bank';
        return `<tr>
          <td class="name-cell">${esc(d.vendorName)}${d.vendorContact ? `<div style="font-size:11px;color:var(--ink-muted);font-family:'IBM Plex Mono',monospace;font-weight:400;">${esc(d.vendorContact)}</div>` : ''}</td>
          <td>${fmtDate(d.dispatchedAt)}</td>
          <td>${fmtDate(d.returnedAt)}</td>
          <td>${fmtRWF(d.amountCollected)}</td>
          <td>${fmtRWF(d.expectedAmount)}</td>
          <td><span class="pay-badge ${vClass}">${vLabel}</span></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    </div>
  `;
}

// ===================== Kurangura (Procurement) =====================

async function procurementsHtml() {
  const tab = state.procTab || 'pending';
  const list = await API.get('/api/procurements');
  const pending = list.filter(p => p.status === 'pending');
  const confirmed = list.filter(p => p.status === 'confirmed');

  let inner = '';
  if (tab === 'new') inner = await procNewFormHtml();
  else if (tab === 'pending') inner = procPendingHtml(pending);
  else inner = procConfirmedHtml(confirmed);

  return `
    <div class="topbar">
      <h2>${t('procurements')}</h2>
      <div class="hist-filter">
        <button data-ptab="pending" class="${tab === 'pending' ? 'active' : ''}">${t('pendingProcurements')}${pending.length ? ` (${pending.length})` : ''}</button>
        <button data-ptab="confirmed" class="${tab === 'confirmed' ? 'active' : ''}">${t('confirmedProcurements')}</button>
        <button data-ptab="new" class="${tab === 'new' ? 'active' : ''}">+ ${t('newProcurement')}</button>
      </div>
    </div>
    ${inner}
  `;
}

async function procNewFormHtml() {
  const products = await API.get('/api/products');
  const rows = state.newProcItems || [];
  return `
    <div class="card">
      <h3 class="disp-section-title">${t('itemsToProcure')}</h3>
      <div class="sell-row" style="align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="margin:0;">
          <label>${t('productName')}</label>
          <select id="pr-product">
            <option value="__new__">＋ ${t('newProductEntry')}</option>
            ${products.map(p => `<option value="${p.id}" data-name="${esc(p.name)}" data-unit="${p.unit || 'unit'}">${esc(p.name)} (${p.stock} ${unitAbbrev(p.unit)})</option>`).join('')}
          </select>
        </div>
        <div class="field" id="pr-new-name-wrap" style="margin:0;display:none;">
          <label>${t('newProductName')}</label>
          <input id="pr-new-name" type="text">
        </div>
        <div class="field" style="margin:0;max-width:110px;"><label>${t('quantity')}</label><input id="pr-qty" type="number" min="1" value="1"></div>
        <div class="field" id="pr-unit-wrap" style="margin:0;max-width:130px;display:none;">
          <label>${t('unit')}</label>
          <select id="pr-unit">
            <option value="unit">${t('unitPiece')}</option>
            <option value="kg">${t('unitKg')}</option>
            <option value="litre">${t('unitLitre')}</option>
            <option value="metre">${t('unitMetre')}</option>
          </select>
        </div>
        <div class="field" style="margin:0;max-width:150px;"><label>${t('unitCost')} (${t('optional')})</label><input id="pr-cost" type="number" min="0"></div>
        <button class="btn-secondary" id="pr-add-item" type="button" style="width:auto;">+ ${t('addItem')}</button>
      </div>
      <div class="form-msg" id="pr-add-msg"></div>
      ${rows.length > 0 ? `
      <div style="overflow-x:auto;margin-top:14px;">
      <table><thead><tr><th>${t('productName')}</th><th>${t('quantity')}</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr>
          <td class="name-cell">${esc(r.productName || r.name)}</td>
          <td>${r.qty} ${unitAbbrev(r.unit)}</td>
          <td><button class="btn-secondary remove-proc-item-btn" data-idx="${i}" type="button" style="padding:4px 10px;font-size:12px;">${t('removeItem')}</button></td>
        </tr>`).join('')}
      </tbody></table>
      </div>` : `<div class="empty" style="margin-top:14px;">—</div>`}
    </div>

    <div class="card">
      <h3 class="disp-section-title">${t('destination')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="field" style="margin:0;">
          <label>${t('district')}</label>
          <select id="pr-district">
            ${RW_DISTRICTS.map(d => `<option value="${esc(d.district)}">${esc(d.town)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0;"><label>${t('route')}</label><input id="pr-route" type="text" placeholder="${t('routePlaceholder')}"></div>
      </div>
      <div class="field" style="max-width:220px;"><label>${t('distanceKm')}</label><input id="pr-distance" type="number" min="0" placeholder="0"></div>
    </div>

    <div class="card">
      <h3 class="disp-section-title">${t('driverInfo')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr 1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('driverName')}</label><input id="pr-dname" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('driverPhone')}</label><input id="pr-dphone" type="tel"></div>
        <div class="field" style="margin:0;"><label>${t('driverEmail')} (${t('optional')})</label><input id="pr-demail" type="email"></div>
        <div class="field" style="margin:0;"><label>${t('plateNumber')}</label><input id="pr-plate" type="text" placeholder="RAD 123 A"></div>
      </div>
    </div>

    <div class="card">
      <h3 class="disp-section-title">${t('supplierInfo')}</h3>
      <div class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('supplierName')}</label><input id="pr-sname" type="text"></div>
        <div class="field" style="margin:0;"><label>${t('supplierBusinessName')} (${t('optional')})</label><input id="pr-sbusiness" type="text"></div>
      </div>
      <div class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="field" style="margin:0;"><label>${t('supplierPhone')}</label><input id="pr-sphone" type="tel"></div>
        <div class="field" style="margin:0;"><label>${t('supplierEmail')} (${t('optional')})</label><input id="pr-semail" type="email"></div>
      </div>
      <div class="field"><label>${t('supplierLocation')}</label><input id="pr-slocation" type="text"></div>
    </div>

    <div class="card">
      <h3 class="disp-section-title">${t('paymentMethod')}</h3>
      <div class="pay-toggle">
        <button type="button" class="pay-opt active" data-ppay="cash">💵 ${t('cash')}</button>
        <button type="button" class="pay-opt" data-ppay="phone">📱 ${t('mobileMoney')}</button>
        <button type="button" class="pay-opt" data-ppay="bank">🏦 ${t('bank')}</button>
        <button type="button" class="pay-opt" data-ppay="debt">📝 ${t('debt')}</button>
      </div>
      <div class="field" id="pr-bankname-wrap" style="display:none;margin-top:12px;">
        <label>${t('bankName')}</label>
        <input id="pr-bankname" type="text" list="bank-list-proc" placeholder="${t('bankNamePlaceholder')}">
        <datalist id="bank-list-proc">${RW_BANKS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      </div>
      <button class="btn-primary" id="proc-submit-btn" style="width:auto;margin-top:18px;" ${rows.length === 0 ? 'disabled' : ''}>🛒 ${t('startProcurement')}</button>
      <div class="form-msg" id="proc-msg"></div>
    </div>
  `;
}

function procPendingHtml(pending) {
  if (pending.length === 0) return `<div class="empty">${t('noPendingProcurements')}</div>`;
  return `
    <div class="disp-grid">
      ${pending.map(p => `
        <div class="disp-card">
          <div class="disp-card-head">
            <div>
              <div class="cust-name">${esc(p.supplier.businessName || p.supplier.name)}</div>
              <div class="cust-sub">${esc(p.destination.town)}${p.distanceKm ? ` · ${p.distanceKm} km` : ''}</div>
            </div>
            <span class="pay-badge pending">🕒 ${t('pending')}</span>
          </div>
          <div class="disp-items">
            ${p.items.map(it => `<div class="disp-item-row"><span>${esc(it.productName || '—')}</span><span>${it.qty} ${unitAbbrev(it.unit)}</span></div>`).join('')}
          </div>
          <div style="font-size:12.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:10px;">
            🚚 ${esc(p.driver.name)}${p.driver.plateNumber ? ' · ' + esc(p.driver.plateNumber) : ''}${p.driver.phone ? ' · ' + esc(p.driver.phone) : ''}<br>
            📍 ${esc(p.destination.route || '—')}
          </div>
          <div class="disp-card-foot">
            <span class="cust-count">${t('startedAt')}: ${relTime(p.startedAt)}</span>
            <button class="btn-primary confirm-proc-btn" data-id="${p.id}" style="width:auto;padding:8px 16px;font-size:13px;">✅ ${t('confirmArrival')}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function procConfirmedHtml(confirmed) {
  if (confirmed.length === 0) return `<div class="empty">${t('noConfirmedProcurements')}</div>`;
  return `
    <div style="overflow-x:auto;">
    <table><thead><tr>
      <th>${t('supplierInfo')}</th><th>${t('itemsToProcure')}</th><th>${t('destination')}</th>
      <th>${t('startedAt')}</th><th>${t('arrivedAt')}</th><th>${t('paymentMethod')}</th>
    </tr></thead><tbody>
      ${confirmed.map(p => {
        const payLabel = p.paymentMethod === 'phone' ? `📱 ${t('mobileMoney')}` :
          p.paymentMethod === 'bank' ? `🏦 ${esc(p.bankName || t('bank'))}` :
          p.paymentMethod === 'debt' ? `📝 ${t('debt')}` : `💵 ${t('cash')}`;
        const payClass = p.paymentMethod === 'phone' ? 'phone' : p.paymentMethod === 'bank' ? 'bank' : p.paymentMethod === 'debt' ? 'debt' : 'cash';
        return `<tr>
          <td class="name-cell">${esc(p.supplier.name)}${p.supplier.businessName ? `<div style="font-size:11px;color:var(--ink-muted);font-weight:400;">${esc(p.supplier.businessName)}</div>` : ''}</td>
          <td class="name-cell">${p.items.map(it => `${esc(it.productName)} (${it.qty}${unitAbbrev(it.unit)})`).join(', ')}</td>
          <td>${esc(p.destination.town)}</td>
          <td>${fmtDate(p.startedAt)}</td>
          <td>${fmtDate(p.confirmedAt)}</td>
          <td><span class="pay-badge ${payClass}">${payLabel}</span></td>
        </tr>`;
      }).join('')}
    </tbody></table>
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
      const unit = document.getElementById('p-unit').value;
      const msg = document.getElementById('product-msg');
      try {
        await API.post('/api/products', { name, price, stock, unit });
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
  if (view === 'dispatches') {
    document.querySelectorAll('[data-dtab]').forEach(tbtn => {
      tbtn.addEventListener('click', () => {
        state.dispatchTab = tbtn.dataset.dtab;
        state.returningDispatchId = null;
        renderApp();
      });
    });

    // ---- New dispatch form ----
    const addBtn = document.getElementById('d-add-item');
    if (addBtn) addBtn.addEventListener('click', () => {
      const sel = document.getElementById('d-product');
      const qtyInput = document.getElementById('d-qty');
      const opt = sel.options[sel.selectedIndex];
      const msg = document.getElementById('d-add-msg');
      const qty = parseInt(qtyInput.value, 10);
      if (!opt || !opt.value || !qty || qty < 1) {
        msg.textContent = t('selectProductFirst');
        msg.className = 'form-msg show error';
        return;
      }
      const stock = parseInt(opt.dataset.stock, 10);
      if (qty > stock) {
        msg.textContent = `${opt.dataset.name}: ${stock} ${t('quantity')}`;
        msg.className = 'form-msg show error';
        return;
      }
      msg.textContent = '';
      msg.className = 'form-msg';
      const existing = state.newDispatchItems.find(r => r.productId === opt.value);
      if (existing) existing.qty += qty;
      else state.newDispatchItems.push({ productId: opt.value, name: opt.dataset.name, qty });
      renderApp();
    });

    document.querySelectorAll('.remove-item-btn').forEach(rbtn => {
      rbtn.addEventListener('click', () => {
        state.newDispatchItems.splice(parseInt(rbtn.dataset.idx, 10), 1);
        renderApp();
      });
    });

    const submitBtn = document.getElementById('dispatch-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', async () => {
      const vendorName = document.getElementById('d-vname').value.trim();
      const vendorContact = document.getElementById('d-vcontact').value.trim();
      const vendorEmail = document.getElementById('d-vemail').value.trim();
      const msg = document.getElementById('dispatch-msg');
      if (!vendorName) {
        msg.textContent = t('customerNameRequired');
        msg.className = 'form-msg show error';
        return;
      }
      try {
        await API.post('/api/dispatches', {
          vendorName, vendorContact, vendorEmail,
          items: state.newDispatchItems.map(r => ({ productId: r.productId, qty: r.qty }))
        });
        state.newDispatchItems = [];
        state.dispatchTab = 'pending';
        renderApp();
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });

    // ---- Pending list: open/cancel/confirm return ----
    document.querySelectorAll('.return-dispatch-btn').forEach(rbtn => {
      rbtn.addEventListener('click', () => {
        state.returningDispatchId = rbtn.dataset.id;
        renderApp();
      });
    });
    document.querySelectorAll('.cancel-return-btn').forEach(cbtn => {
      cbtn.addEventListener('click', () => { state.returningDispatchId = null; renderApp(); });
    });
    document.querySelectorAll('.confirm-return-btn').forEach(cbtn => {
      cbtn.addEventListener('click', async () => {
        const id = cbtn.dataset.id;
        const qtyInputs = document.querySelectorAll(`.return-qty-input`);
        const items = [...qtyInputs].map(inp => ({ productId: inp.dataset.productId, qtyReturned: parseInt(inp.value, 10) || 0 }));
        const amountEl = document.getElementById(`return-amount-${id}`);
        const amountCollected = amountEl.value === '' ? null : parseFloat(amountEl.value);
        const msg = document.getElementById(`return-msg-${id}`);
        try {
          await API.patch(`/api/dispatches/${id}/return`, { items, amountCollected });
          state.returningDispatchId = null;
          renderApp();
        } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
      });
    });
  }
  if (view === 'procurements') {
    document.querySelectorAll('[data-ptab]').forEach(tbtn => {
      tbtn.addEventListener('click', () => { state.procTab = tbtn.dataset.ptab; renderApp(); });
    });

    // Product selector: toggle "new product" name field + unit field
    const productSel = document.getElementById('pr-product');
    if (productSel) {
      const syncProductFields = () => {
        const opt = productSel.options[productSel.selectedIndex];
        const isNew = opt && opt.value === '__new__';
        document.getElementById('pr-new-name-wrap').style.display = isNew ? 'block' : 'none';
        document.getElementById('pr-unit-wrap').style.display = isNew ? 'block' : 'none';
      };
      productSel.addEventListener('change', syncProductFields);
      syncProductFields();
    }

    const addItemBtn = document.getElementById('pr-add-item');
    if (addItemBtn) addItemBtn.addEventListener('click', () => {
      const sel = document.getElementById('pr-product');
      const opt = sel.options[sel.selectedIndex];
      const qty = parseInt(document.getElementById('pr-qty').value, 10);
      const costRaw = document.getElementById('pr-cost').value;
      const unitCost = costRaw === '' ? null : parseFloat(costRaw);
      const msg = document.getElementById('pr-add-msg');
      if (!qty || qty < 1) {
        msg.textContent = t('selectProductFirst');
        msg.className = 'form-msg show error';
        return;
      }
      let row;
      if (opt.value === '__new__') {
        const newName = document.getElementById('pr-new-name').value.trim();
        const unit = document.getElementById('pr-unit').value;
        if (!newName) {
          msg.textContent = t('selectProductFirst');
          msg.className = 'form-msg show error';
          return;
        }
        row = { productId: null, productName: newName, unit, qty, unitCost };
      } else {
        row = { productId: opt.value, productName: opt.dataset.name, unit: opt.dataset.unit, qty, unitCost };
      }
      msg.textContent = '';
      msg.className = 'form-msg';
      state.newProcItems.push(row);
      renderApp();
    });

    document.querySelectorAll('.remove-proc-item-btn').forEach(rbtn => {
      rbtn.addEventListener('click', () => {
        state.newProcItems.splice(parseInt(rbtn.dataset.idx, 10), 1);
        renderApp();
      });
    });

    let selectedProcPay = 'cash';
    document.querySelectorAll('[data-ppay]').forEach(pbtn => {
      pbtn.addEventListener('click', () => {
        document.querySelectorAll('[data-ppay]').forEach(b => b.classList.remove('active'));
        pbtn.classList.add('active');
        selectedProcPay = pbtn.dataset.ppay;
        const bankWrap = document.getElementById('pr-bankname-wrap');
        if (bankWrap) bankWrap.style.display = selectedProcPay === 'bank' ? 'block' : 'none';
      });
    });

    const procSubmitBtn = document.getElementById('proc-submit-btn');
    if (procSubmitBtn) procSubmitBtn.addEventListener('click', async () => {
      const msg = document.getElementById('proc-msg');
      const payload = {
        items: state.newProcItems.map(r => ({ productId: r.productId, productName: r.productName, unit: r.unit, qty: r.qty, unitCost: r.unitCost })),
        district: document.getElementById('pr-district').value,
        town: (RW_DISTRICTS.find(d => d.district === document.getElementById('pr-district').value) || {}).town || '',
        route: document.getElementById('pr-route').value.trim(),
        distanceKm: document.getElementById('pr-distance').value,
        driverName: document.getElementById('pr-dname').value.trim(),
        driverPhone: document.getElementById('pr-dphone').value.trim(),
        driverEmail: document.getElementById('pr-demail').value.trim(),
        plateNumber: document.getElementById('pr-plate').value.trim(),
        supplierName: document.getElementById('pr-sname').value.trim(),
        supplierPhone: document.getElementById('pr-sphone').value.trim(),
        supplierEmail: document.getElementById('pr-semail').value.trim(),
        supplierBusinessName: document.getElementById('pr-sbusiness').value.trim(),
        supplierLocation: document.getElementById('pr-slocation').value.trim(),
        paymentMethod: selectedProcPay,
        bankName: document.getElementById('pr-bankname') ? document.getElementById('pr-bankname').value.trim() : ''
      };
      try {
        await API.post('/api/procurements', payload);
        state.newProcItems = [];
        state.procTab = 'pending';
        renderApp();
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg show error'; }
    });

    document.querySelectorAll('.confirm-proc-btn').forEach(cbtn => {
      cbtn.addEventListener('click', async () => {
        if (!confirm(t('confirmArrival') + '?')) return;
        try {
          await API.patch(`/api/procurements/${cbtn.dataset.id}/confirm`, {});
          renderApp();
        } catch (e) { alert(e.message); }
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
