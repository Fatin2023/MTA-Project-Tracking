/* ==========================================================
   MULTITRADE — Project Salary Management (PostgreSQL version)
   ========================================================== */

//const API = 'http://localhost:3001/api';
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : '/api';


async function api(path, opts = {}) {
    const res = await fetch(API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function localISO(d) {
    if (!d) d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}


/* ==========================================================
   SECTION 1: DATA LAYER — in-memory cache loaded from API
   ========================================================== */

let DB = {
    projects: [],
    members: [],
    users: [],
    positions: [],
    departments: [],
    scopes: [],
    subScopes: [],
    details: [],
    projectAssignments: [],
    attendance: []
};

async function loadDB() {
    try {
        const [projects, members, users, positions, departments, scopes, subScopes, details, assignments, attendance] = await Promise.all([
            api('/projects'),
            api('/members'),
            api('/users'),
            api('/positions'),
            api('/departments'),
            api('/scopes'),
            api('/subscopes'),
            api('/details'),
            api('/assignments'),
            api('/attendance')
        ]);
        DB.projects = projects;
        DB.members = members;
        DB.users = users;
        DB.positions = positions;
        DB.departments = departments;
        DB.scopes = scopes;
        DB.subScopes = subScopes;
        DB.details = details;
        DB.projectAssignments = assignments;
        DB.attendance = attendance;
    } catch (e) {
        console.error('Failed to load data:', e);
    }
}




/* ==========================================================
   SECTION 2: UTILITIES
   ========================================================== */

function fmt(n) { return n == null ? '—' : 'RM' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function getPositionName(pid) { const p = DB.positions.find(x => x.id === pid); return p ? p.name : '—'; }
function getDeptName(did) { const d = DB.departments.find(x => x.id === did); return d ? d.name : '—'; }

function latestSalary(member) {
    if (!member.salaries) return null;
    const keys = Object.keys(member.salaries).sort().reverse();
    return keys.length ? member.salaries[keys[0]] : null;
}

function getMemberProjects(memberId) {
    return DB.projectAssignments.filter(pa => pa.memberId === memberId)
        .map(pa => DB.projects.find(p => p.id === pa.projectId)).filter(Boolean);
}

function getProjectMembers(projectId) {
    return DB.projectAssignments.filter(pa => pa.projectId === projectId)
        .map(pa => DB.members.find(m => m.id === pa.memberId)).filter(Boolean);
}

function getProjectCost(projectId) {
    return getProjectMembers(projectId).reduce((s, m) => { const v = latestSalary(m); return s + (v || 0); }, 0);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0h 0m';
    const t = Math.floor(ms / 1000);
    return Math.floor(t / 3600) + 'h ' + Math.floor((t % 3600) / 60) + 'm ' + (t % 60) + 's';
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Cost calculation helpers
function getHourlyRate(member) {
    const salary = latestSalary(member);
    if (!salary || salary <= 0) return null;
    return salary / 176; // 8 hours × 22 working days
}

function getEntryCost(memberId, durationMs) {
    const member = DB.members.find(m => m.id === memberId);
    if (!member) return null;
    const hourlyRate = getHourlyRate(member);
    if (!hourlyRate) return null;
    return hourlyRate * (durationMs / (1000 * 60 * 60));
}

function fmtCost(val) {
    if (val == null) return '—';
    return 'RM ' + Number(val).toFixed(2);
}

function fmtHourlyRate(member) {
    const rate = getHourlyRate(member);
    if (!rate) return '—';
    return 'RM ' + Number(rate).toFixed(2) + '/hr';
}

function getSubScopeName(id) {
    if (!id) return '—';
    const s = DB.subScopes.find(x => x.id === id);
    return s ? s.name : '—';
}

function getDetailName(id) {
    if (!id) return '—';
    const d = DB.details.find(x => x.id === id);
    return d ? d.name : '—';
}

function subScopeOpts(selectedId) {
    return '<option value="">-- None --</option>' +
        DB.subScopes.map(s => '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
}

function detailOpts(selectedId) {
    return '<option value="">-- None --</option>' +
        DB.details.map(d => '<option value="' + d.id + '"' + (d.id === selectedId ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('');
}

function getScopeName(id) {
    if (!id) return '—';
    const s = DB.scopes.find(x => x.id === id);
    return s ? s.name : '—';
}

function scopeOpts(selectedId) {
    return '<option value="">-- None --</option>' +
        DB.scopes.map(s => '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
}



/* ==========================================================
   SECTION 3: MODAL
   ========================================================== */

function showModal(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() { document.getElementById('modal-overlay').classList.remove('active'); }

document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal();
});


/* ==========================================================
   SECTION 4: AUTHENTICATION
   ========================================================== */

let currentUser = null;
let clockInterval = null;

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    if (!u || !p) { err.textContent = 'Please enter username and password'; return; }
    try {
        localStorage.setItem('multitrade_session', JSON.stringify(currentUser));
        currentUser = await api('/login', { method: 'POST', body: { username: u, password: p } });
        err.textContent = '';
        localStorage.setItem('multitrade_session', JSON.stringify(currentUser));
        await loadDB();
        showPage(currentUser.role === 'admin' ? 'admin-layout' : 'employee-layout');
    } catch (ex) {
        err.textContent = ex.message;
    }
}


async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-user').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;
    const errEl = document.getElementById('reg-error');
    const sucEl = document.getElementById('reg-success');
    errEl.textContent = ''; sucEl.textContent = '';

    if (!name) { errEl.textContent = 'Please enter your name'; return; }
    if (!username) { errEl.textContent = 'Please enter a username'; return; }
    if (username.length < 2) { errEl.textContent = 'Username min 2 characters'; return; }
    if (pass.length < 6) { errEl.textContent = 'Password min 6 characters'; return; }
    if (pass !== pass2) { errEl.textContent = 'Passwords do not match'; return; }

    try {
        await api('/register', { method: 'POST', body: { username, password: pass, name } });
        const loginResult = await api('/login', { method: 'POST', body: { username, password: pass } });
        localStorage.setItem('multitrade_session', JSON.stringify(loginResult));
        sucEl.textContent = 'Registration successful! Redirecting…';
        errEl.textContent = '';
        document.getElementById('reg-name').value = '';
        document.getElementById('reg-user').value = '';
        document.getElementById('reg-pass').value = '';
        document.getElementById('reg-pass2').value = '';
        setTimeout(() => showPage('login-page'), 1200);
    } catch (ex) {
        errEl.textContent = ex.message;
    }
}


function confirmLogout() {
    showModal('<h3>Sign Out</h3><p style="color:var(--main-text2);line-height:1.6">Are you sure you want to sign out?</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doLogout()">Sign Out</button></div>');
}

function doLogout() {
    localStorage.removeItem('multitrade_session');
    localStorage.removeItem('multitrade_admin_page');
    localStorage.removeItem('multitrade_emp_page');
    currentUser = null;
    hideModal();
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('login-page').classList.add('active');
}


function doLogout() {
    localStorage.removeItem('multitrade_session');
    window.location.href = window.location.pathname;
}



/* ==========================================================
   SECTION 5: NAVIGATION
   ========================================================== */

let activeProjectId = null;

async function showPage(id) {
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'admin-layout') { await loadDB(); adminNav('projects'); updateAvatars(); }
    if (id === 'employee-layout') { await loadDB(); empNav('myprojects'); updateAvatars(); }
    if (id === 'detail-layout') { await loadDB(); renderProjectDetail(); updateAvatars(); }
}

async function adminNav(tab, el) {
    localStorage.setItem('multitrade_admin_page', tab);
    const nav = document.getElementById('admin-nav');
    document.querySelectorAll('#admin-layout .admin-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('admin-' + tab);
    if (target) target.style.display = '';

    if (nav) {
        nav.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.dataset.page === tab);
        });
    }

    await loadDB();
    switch (tab) {
        case 'projects': renderMainScope(); break;
        case 'users': renderUsersList(); break;
        case 'positions': renderPositionsList(); break;
        case 'departments': renderDepartmentsList(); break;
        case 'attendance': renderAdminAttendance(); break;
        case 'subscopes': renderAdminSubScopes(); break;
        case 'details': renderAdminDetails(); break;
        case 'report': renderAdminReport(); break;
    }
}


async function empNav(tab, el) {
    localStorage.setItem('multitrade_emp_page', tab);
    const nav = document.getElementById('emp-nav');
    document.querySelectorAll('#employee-layout .emp-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('emp-' + tab);
    if (target) target.style.display = '';

    if (nav) {
        nav.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.dataset.page === tab);
        });
    }

    await loadDB();
    switch (tab) {
        case 'myprojects': renderEmployeeProjects(); break;
        case 'attendance': renderEmployeeAttendance(); break;
    }
}


async function openProject(pid) {
    activeProjectId = pid;
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('detail-layout').classList.add('active');
    await loadDB();
    renderProjectDetail();
}

function updateAvatars() {
    if (!currentUser) return;
    const initial = currentUser.username.charAt(0).toUpperCase();
    ['admin-avatar', 'detail-avatar', 'emp-avatar'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = initial; });
    ['admin-user-name', 'detail-user-name', 'emp-user-name'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = currentUser.username; });
    const roleEl = document.getElementById('emp-user-role');
    if (roleEl) { const member = currentUser.memberId ? DB.members.find(m => m.id === currentUser.memberId) : null; roleEl.textContent = member && member.positionId ? getPositionName(member.positionId) : 'Employee'; }
}

// Mobile menu
function toggleMobileMenu() {
    document.querySelectorAll('.sidebar').forEach(function(s) { s.classList.toggle('open'); });
    document.querySelectorAll('.mobile-overlay').forEach(function(o) { o.classList.toggle('active'); });
}

function closeMobileMenu() {
    document.querySelectorAll('.sidebar').forEach(function(s) { s.classList.remove('open'); });
    document.querySelectorAll('.mobile-overlay').forEach(function(o) { o.classList.remove('active'); });
}

document.addEventListener('click', function(e) {
    if (e.target.closest('.nav-item')) closeMobileMenu();
});

document.addEventListener('touchmove', function(e) {
    if (!e.target.closest('.sidebar')) {
        var anyOpen = document.querySelector('.sidebar.open');
        if (anyOpen) closeMobileMenu();
    }
}, { passive: true });

// ===== INITIALIZATION =====
(async function(){
    const saved = localStorage.getItem('multitrade_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            await loadDB();
            document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));

            if (currentUser.role === 'admin') {
                document.getElementById('admin-layout').classList.add('active');
                var page = localStorage.getItem('multitrade_admin_page') || 'projects';
                var navItems = document.querySelectorAll('#admin-nav .nav-item');
                navItems.forEach(n => n.classList.remove('active'));
                navItems.forEach(n => {
                    if (n.getAttribute('onclick') && n.getAttribute('onclick').indexOf("'" + page + "'") !== -1) {
                        n.classList.add('active');
                    }
                });
                await adminNav(page);
            } else {
                document.getElementById('employee-layout').classList.add('active');
                var page = localStorage.getItem('multitrade_emp_page') || 'myprojects';
                var navItems = document.querySelectorAll('#emp-nav .nav-item');
                navItems.forEach(n => n.classList.remove('active'));
                navItems.forEach(n => {
                    if (n.getAttribute('onclick') && n.getAttribute('onclick').indexOf("'" + page + "'") !== -1) {
                        n.classList.add('active');
                    }
                });
                await empNav(page);
            }
            updateAvatars();
            return;
        } catch (e) {
            localStorage.removeItem('multitrade_session');
            localStorage.removeItem('multitrade_admin_page');
            localStorage.removeItem('multitrade_emp_page');
            currentUser = null;
        }
    }
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('login-page').classList.add('active');
})();





/* ==========================================================
   SECTION 6: MAIN SCOPE — Categories + Items
   ========================================================== */
function getProjectCountdown(project) {
    if (!project.endDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(project.endDate); end.setHours(0, 0, 0, 0);
    const diffMs = end - today;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getProjectDuration(project) {
    if (!project.startDate || !project.endDate) return null;
    const start = new Date(project.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(project.endDate); end.setHours(0, 0, 0, 0);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

function getCountdownHtml(project) {
    const cd = getProjectCountdown(project);
    if (cd === null) return '';
    if (cd > 0) {
        const urgency = cd <= 7 ? 'color:var(--danger)' : cd <= 30 ? 'color:var(--warning)' : 'color:var(--ok)';
        return `<div class="pc-countdown" style="${urgency}">
            <span class="cd-icon">&#9200;</span>
            <span class="cd-text">${cd} day${cd !== 1 ? 's' : ''} remaining</span>
        </div>`;
    } else if (cd === 0) {
        return `<div class="pc-countdown" style="color:var(--warning)">
            <span class="cd-icon">&#9888;</span>
            <span class="cd-text">Due today!</span>
        </div>`;
    } else {
        return `<div class="pc-countdown" style="color:var(--danger)">
            <span class="cd-icon">&#10006;</span>
            <span class="cd-text">${Math.abs(cd)} day${Math.abs(cd) !== 1 ? 's' : ''} overdue</span>
        </div>`;
    }
}

function getDateRangeHtml(project) {
    if (!project.startDate && !project.endDate) return '';
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const dur = getProjectDuration(project);
    return `<div class="pc-dates">
        <span class="cd-icon">&#128197;</span>
        ${fmtDate(project.startDate)} — ${fmtDate(project.endDate)}
        ${dur ? ' <span class="pc-duration">(' + dur + ' days)</span>' : ''}
    </div>`;
}


function renderMainScope() {
    const view = document.getElementById('admin-projects');
    const totalScopes = DB.scopes.length;
    const totalItems = DB.projects.length;

    // Group projects by scope
    const groups = {};
    DB.scopes.forEach(s => { groups[s.id] = { scope: s, items: [] }; });
    groups[0] = { scope: { id: 0, name: 'Uncategorized' }, items: [] };

    DB.projects.forEach(p => {
        const sid = p.categoryId || 0;
        if (groups[sid]) groups[sid].items.push(p);
    });

    if (groups[0].items.length === 0) delete groups[0];

    view.innerHTML = `
    <div class="app-header"><h2>Main Scope</h2><div class="header-sub">Manage scopes and items</div></div>
    <div class="app-body">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Scopes</div><div class="stat-value">${totalScopes}</div></div>
        <div class="stat-card"><div class="stat-label">Total Items</div><div class="stat-value">${totalItems}</div></div>
      </div>
      <div class="section-head">
        <h2>All Scopes</h2>
        <div style="display:flex;gap:8px">
            <button class="btn btn-green" onclick="showAddCategory()">+ New Scope</button>
        </div>
      </div>
      <div id="scope-groups"></div>
    </div>`;

    const container = document.getElementById('scope-groups');

    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<div class="empty"><div class="icon">&#128193;</div><p>No scopes yet.</p></div>';
        return;
    }

    let html = '';

    Object.values(groups).forEach(g => {
        const itemCount = g.items.length;
        const totalCost = g.items.reduce((s, p) => s + getProjectCost(p.id), 0);

        html += `
        <div style="margin-bottom:32px">
          <!-- Scope Header -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--main-border)">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:1.15rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">${esc(g.scope.name)}</span>
              <span style="font-size:.82rem;color:var(--main-text3)">${itemCount} item${itemCount !== 1 ? 's' : ''} · ${fmt(totalCost)}/mo</span>
            </div>
            <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
              ${g.scope.id !== 0 ? `
                <button class="btn-icon" onclick="showEditCategory(${g.scope.id})" title="Edit Scope">&#9998;</button>
                <button class="btn-icon danger" onclick="confirmDeleteCategory(${g.scope.id})" title="Delete Scope">&#10005;</button>
              ` : ''}
              <button class="btn btn-green btn-sm" onclick="showAddItem(${g.scope.id})">+ Item</button>
            </div>
          </div>

          <!-- Items Grid -->
          <div class="project-grid">
            ${itemCount === 0 ? '<div style="color:var(--main-text3);font-size:.85rem;padding:12px">No items in this scope</div>' : ''}
            ${g.items.map(p => {
                const mc = getProjectMembers(p.id).length;
                const cost = getProjectCost(p.id);
                return `<div class="card project-card" onclick="openProject(${p.id})">
                  <div class="pc-top">
                    <div class="pc-name">${esc(p.name)}</div>
                    <div class="pc-actions" onclick="event.stopPropagation()">
                      <button class="btn-icon" onclick="showEditItem(${p.id})" title="Edit">&#9998;</button>
                      <button class="btn-icon danger" onclick="confirmDeleteItem(${p.id})" title="Delete">&#10005;</button>
                    </div>
                  </div>
                  ${getDateRangeHtml(p)}
                  ${getCountdownHtml(p)}
                  <div class="pc-meta">
                    <div class="pc-meta-item">&#128101; <span class="val">${mc}</span> members</div>
                    <div class="pc-meta-item">&#128176; <span class="val">${fmt(cost)}</span>/mo</div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    });

    container.innerHTML = html;
}

// ---- Category CRUD ----

function showAddCategory() {
    showModal(`<h3>New Category</h3>
    <div class="field"><label>Category Name</label><input class="input" id="inp-cat-name" placeholder="e.g. Project, Training, Support"></div>
    <p class="auth-error" id="cat-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddCategory()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-cat-name')?.focus(), 100);
}

async function doAddCategory() {
    const errEl = document.getElementById('cat-error');
    const name = document.getElementById('inp-cat-name').value.trim();
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/scopes', { method: 'POST', body: { name } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditCategory(sid) {
    const scope = DB.scopes.find(s => s.id === sid);
    if (!scope) return;
    showModal(`<h3>Edit Category</h3>
    <div class="field"><label>Category Name</label><input class="input" id="inp-cat-edit" value="${esc(scope.name)}"></div>
    <p class="auth-error" id="cat-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditCategory(${sid})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-cat-edit'); el.focus(); el.select(); }, 100);
}

async function doEditCategory(sid) {
    const errEl = document.getElementById('cat-error');
    const name = document.getElementById('inp-cat-edit').value.trim();
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/scopes/' + sid, { method: 'PUT', body: { name } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteCategory(sid) {
    const scope = DB.scopes.find(s => s.id === sid);
    if (!scope) return;
    const itemCount = DB.projects.filter(p => p.categoryId === sid).length;
    showModal(`<h3>Delete Category</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(scope.name)}</strong>?<br>${itemCount} item(s) will become uncategorized.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteCategory(${sid})">Delete</button></div>`);
}

async function doDeleteCategory(sid) {
    await api('/scopes/' + sid, { method: 'DELETE' });
    hideModal(); await loadDB(); renderMainScope();
}

// ---- Scope Detail (show items in category) ----

function openScopeDetail(scopeId) {
    const scope = scopeId === 0 ? { id: 0, name: 'Uncategorized' } : DB.scopes.find(s => s.id === scopeId);
    if (!scope) return;

    const items = DB.projects.filter(p => (p.categoryId || 0) === scopeId);
    const totalCost = items.reduce((s, p) => s + getProjectCost(p.id), 0);

    document.getElementById('admin-projects').innerHTML = `
    <div class="app-header">
      <button class="btn btn-ghost btn-sm" onclick="renderMainScope()" style="margin-bottom:8px">&larr; Back</button>
      <h2>${esc(scope.name)}</h2>
      <div class="header-sub">${items.length} items · ${fmt(totalCost)}/mo</div>
    </div>
    <div class="app-body">
      <div class="section-head">
        <h2>Items</h2>
        <button class="btn btn-green" onclick="showAddItem(${scopeId})">+ New Item</button>
      </div>
      <div id="items-grid" class="project-grid"></div>
    </div>`;

    const grid = document.getElementById('items-grid');
    if (items.length === 0) {
        grid.innerHTML = '<div class="empty"><div class="icon">&#128193;</div><p>No items in this category.</p></div>';
        return;
    }

    grid.innerHTML = items.map(p => {
        const mc = getProjectMembers(p.id).length;
        const cost = getProjectCost(p.id);
        return `<div class="card project-card" onclick="openProject(${p.id})">
      <div class="pc-top">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="showEditItem(${p.id})" title="Edit">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeleteItem(${p.id})" title="Delete">&#10005;</button>
        </div>
      </div>
      ${getDateRangeHtml(p)}
      ${getCountdownHtml(p)}
      <div class="pc-meta">
        <div class="pc-meta-item">&#128101; <span class="val">${mc}</span> members</div>
        <div class="pc-meta-item">&#128176; <span class="val">${fmt(cost)}</span>/mo</div>
      </div>
    </div>`;
    }).join('');
}

// ---- Item CRUD (inside category) ----

function showAddItem(categoryId) {
    const catOpts = DB.scopes.map(s => {
        const sel = s.id === categoryId ? 'selected' : '';
        return `<option value="${s.id}" ${sel}>${esc(s.name)}</option>`;
    }).join('');

    showModal(`<h3>New Item</h3>
    <div class="field"><label>Item Name</label><input class="input" id="inp-item-name" placeholder="e.g. Marketing Campaign"></div>
    <div class="field"><label>Category</label><select class="input" id="inp-item-cat">${catOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Date</label><input class="input" id="inp-item-start" type="date"></div>
        <div class="field"><label>End Date</label><input class="input" id="inp-item-end" type="date"></div>
    </div>
    <p class="auth-error" id="item-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddItem(${categoryId})">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-item-name')?.focus(), 100);
}

async function doAddItem(categoryId) {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-name').value.trim();
    const catId = document.getElementById('inp-item-cat').value;
    const startDate = document.getElementById('inp-item-start').value || null;
    const endDate = document.getElementById('inp-item-end').value || null;
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/projects', { method: 'POST', body: { name, categoryId: catId ? parseInt(catId) : null, startDate, endDate } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditItem(pid) {
    const proj = DB.projects.find(p => p.id === pid);
    if (!proj) return;
    const catOpts = DB.scopes.map(s => {
        const sel = (proj.categoryId || 0) === s.id ? 'selected' : '';
        return `<option value="${s.id}" ${sel}>${esc(s.name)}</option>`;
    }).join('');

    showModal(`<h3>Edit Item</h3>
    <div class="field"><label>Item Name</label><input class="input" id="inp-item-edit" value="${esc(proj.name)}"></div>
    <div class="field"><label>Category</label><select class="input" id="inp-item-cat-edit">${catOpts}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Date</label><input class="input" id="inp-item-start-edit" type="date" value="${proj.startDate || ''}"></div>
        <div class="field"><label>End Date</label><input class="input" id="inp-item-end-edit" type="date" value="${proj.endDate || ''}"></div>
    </div>
    <p class="auth-error" id="item-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditItem(${pid})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-item-edit'); el.focus(); el.select(); }, 100);
}

async function doEditItem(pid) {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-edit').value.trim();
    const catId = document.getElementById('inp-item-cat-edit').value;
    const startDate = document.getElementById('inp-item-start-edit').value || null;
    const endDate = document.getElementById('inp-item-end-edit').value || null;
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/projects/' + pid, { method: 'PUT', body: { name, categoryId: catId ? parseInt(catId) : null, startDate, endDate } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteItem(pid) {
    const p = DB.projects.find(x => x.id === pid);
    if (!p) return;
    const mc = getProjectMembers(pid).length;
    showModal(`<h3>Delete Item</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(p.name)}</strong>?<br>${mc} assignment(s) removed. Members kept.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteItem(${pid})">Delete</button></div>`);
}

async function doDeleteItem(pid) {
    await api('/projects/' + pid, { method: 'DELETE' });
    hideModal(); await loadDB(); renderMainScope();
}




/* ==========================================================
   SECTION 7: ADMIN — USERS
   ========================================================== */

function renderUsersList() {
    const view = document.getElementById('admin-users');
    let rows = '';
    if (DB.users.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No users</td></tr>';
    } else {
        rows = DB.users.map(u => {
            const member = u.memberId ? DB.members.find(m => m.id === u.memberId) : null;
            const mName = member ? member.name : '—';
            const pos = member && member.positionId ? getPositionName(member.positionId) : '—';
            const dept = member && member.departmentId ? getDeptName(member.departmentId) : '—';
            const sal = member ? latestSalary(member) : null;
            const projs = member ? getMemberProjects(member.id) : [];
            const projHtml = projs.length ? projs.map(p => `<span class="badge badge-employee" style="margin:1px">${esc(p.name)}</span>`).join(' ') : '<span style="color:var(--main-text3)">None</span>';
            const roleClass = u.role === 'admin' ? 'badge-admin' : 'badge-employee';
            return `<tr>
        <td style="font-family:var(--font-m)">${esc(u.username)}</td>
        <td>${esc(mName)}</td>
        <td><span class="badge ${roleClass}">${u.role}</span></td>
        <td>${esc(pos)}</td>
        <td>${esc(dept)}</td>
        <td>${sal != null ? '<span class="salary-val">' + fmt(sal) + '</span>' : '<span class="salary-na">Not set</span>'}</td>
        <td>${projHtml}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditUser(${u.id})" title="Edit">&#9998;</button>
          ${u.username !== 'admin' ? `<button class="btn-icon danger" onclick="confirmDeleteUser(${u.id})" title="Delete">&#10005;</button>` : ''}
        </div></td>
      </tr>`;
        }).join('');
    }

    view.innerHTML = `
    <div class="app-header"><h2>Users</h2><div class="header-sub">Manage accounts, salaries, positions and departments</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Users</h2><button class="btn btn-green" onclick="showAddUser()">+ Add User</button></div>
      <div class="table-wrap"><table><thead><tr>
        <th>Username</th><th>Name</th><th>Role</th><th>Position</th><th>Department</th><th>Salary</th><th>Projects</th><th>Actions</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

function showAddUser() {
    const posOpts = DB.positions.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const deptOpts = DB.departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    showModal(`<h3>Add User</h3>
    <div class="field"><label>Role</label><select class="input" id="adduser-role" onchange="toggleAddUserFields()"><option value="employee">Employee</option><option value="admin">Admin</option></select></div>
    <div id="emp-fields">
      <div class="field"><label>Full Name</label><input class="input" id="adduser-name" placeholder="e.g. John Smith"></div>
      <div class="field"><label>Position</label><select class="input" id="adduser-pos"><option value="">None</option>${posOpts}</select></div>
      <div class="field"><label>Department</label><select class="input" id="adduser-dept"><option value="">None</option>${deptOpts}</select></div>
      <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="adduser-salary" type="number" placeholder="e.g. 15000.00"></div>
    </div>
    <div class="field"><label>Username</label><input class="input" id="adduser-user" placeholder="Login username"></div>
    <div class="field"><label>Password</label><input class="input" id="adduser-pass" type="password" placeholder="Min. 6 characters"></div>
    <p class="auth-error" id="adduser-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddUser()">Create</button></div>`);
    setTimeout(() => document.getElementById('adduser-name')?.focus(), 100);
}

function toggleAddUserFields() {
    const role = document.getElementById('adduser-role').value;
    document.getElementById('emp-fields').style.display = role === 'employee' ? '' : 'none';
}

async function doAddUser() {
    const role = document.getElementById('adduser-role').value;
    const username = document.getElementById('adduser-user').value.trim();
    const pass = document.getElementById('adduser-pass').value;
    const errEl = document.getElementById('adduser-error'); errEl.textContent = '';
    if (!username) { errEl.textContent = 'Enter a username'; return; }
    if (username.length < 2) { errEl.textContent = 'Min 2 characters'; return; }
    if (pass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    let memberId = null;
    if (role === 'employee') {
        const name = document.getElementById('adduser-name').value.trim();
        if (!name) { errEl.textContent = 'Enter a name'; return; }
        const posId = document.getElementById('adduser-pos').value;
        const deptId = document.getElementById('adduser-dept').value;
        const sal = parseFloat(document.getElementById('adduser-salary').value);
        const now = new Date().toISOString().slice(0, 7);

        // Create member
        const memberResult = await api('/members', {
            method: 'POST',
            body: { name, positionId: posId ? parseInt(posId) : null, departmentId: deptId ? parseInt(deptId) : null }
        });
        memberId = memberResult.id;

        // Set salary if provided
        if (!isNaN(sal) && sal > 0) {
            await api('/salaries', { method: 'PUT', body: { memberId, month: now, amount: sal } });
        }
    }

    try {
        await api('/users', { method: 'POST', body: { username, password: pass, role, memberId } });
    } catch (ex) {
        errEl.textContent = ex.message; return;
    }

    hideModal(); await loadDB(); renderUsersList();
}

function showEditUser(userId) {
    const user = DB.users.find(u => u.id === userId); if (!user) return;
    const member = user.memberId ? DB.members.find(m => m.id === user.memberId) : null;
    const posOpts = DB.positions.map(p => { const sel = member && member.positionId === p.id ? 'selected' : ''; return `<option value="${p.id}" ${sel}>${esc(p.name)}</option>`; }).join('');
    const deptOpts = DB.departments.map(d => { const sel = member && member.departmentId === d.id ? 'selected' : ''; return `<option value="${d.id}" ${sel}>${esc(d.name)}</option>`; }).join('');

    let html = `<h3>Edit — ${esc(user.username)}</h3>`;
    if (user.role === 'employee' && member) {
        const curSal = latestSalary(member);
        html += `<div class="field"><label>Full Name</label><input class="input" id="edituser-name" value="${esc(member.name)}"></div>
      <div class="field"><label>Position</label><select class="input" id="edituser-pos"><option value="">None</option>${posOpts}</select></div>
      <div class="field"><label>Department</label><select class="input" id="edituser-dept"><option value="">None</option>${deptOpts}</select></div>
      <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="edituser-salary" type="number" value="${curSal || ''}" placeholder="e.g. 15000.00"></div>`;
    }
    html += `<div class="field"><label>Username</label><input class="input" id="edituser-user" value="${esc(user.username)}"></div>
    <div class="field"><label>New Password (blank = keep)</label><input class="input" id="edituser-pass" type="password" placeholder="Leave blank"></div>
    <div class="field"><label>Role</label><select class="input" id="edituser-role"><option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>
    <p class="auth-error" id="edituser-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditUser(${user.id})">Save</button></div>`;
    showModal(html);
}

async function doEditUser(userId) {
    const user = DB.users.find(u => u.id === userId); if (!user) return;
    const errEl = document.getElementById('edituser-error');
    const newUsername = document.getElementById('edituser-user').value.trim();
    const newPass = document.getElementById('edituser-pass').value;
    const newRole = document.getElementById('edituser-role').value;
    if (!newUsername) { errEl.textContent = 'Username cannot be empty'; return; }
    if (newPass && newPass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    await api('/users/' + userId, {
        method: 'PUT',
        body: { username: newUsername, password: newPass || null, role: newRole }
    });

    if (user.memberId) {
        const nameEl = document.getElementById('edituser-name');
        const posEl = document.getElementById('edituser-pos');
        const deptEl = document.getElementById('edituser-dept');
        const salEl = document.getElementById('edituser-salary');
        const name = nameEl ? nameEl.value.trim() : null;
        const posId = posEl ? (posEl.value ? parseInt(posEl.value) : null) : undefined;
        const deptId = deptEl ? (deptEl.value ? parseInt(deptEl.value) : null) : undefined;

        if (name || posId !== undefined || deptId !== undefined) {
            const member = DB.members.find(m => m.id === user.memberId);
            if (member) {
                await api('/members/' + user.memberId, {
                    method: 'PUT',
                    body: {
                        name: name || member.name,
                        positionId: posId !== undefined ? posId : member.positionId,
                        departmentId: deptId !== undefined ? deptId : member.departmentId
                    }
                });
            }
        }

        if (salEl) {
            const val = parseFloat(salEl.value);
            const now = new Date().toISOString().slice(0, 7);
            await api('/salaries', { method: 'PUT', body: { memberId: user.memberId, month: now, amount: isNaN(val) ? 0 : val } });
        }
    }

    hideModal(); await loadDB(); renderUsersList();
}

function confirmDeleteUser(userId) {
    const user = DB.users.find(u => u.id === userId); if (!user || user.username === 'admin') return;
    showModal(`<h3>Delete User</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(user.username)}</strong>?<br>${user.memberId ? 'Member profile, salary and attendance will be deleted.' : ''}</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteUser(${userId})">Delete</button></div>`);
}

async function doDeleteUser(userId) {
    await api('/users/' + userId, { method: 'DELETE' });
    hideModal(); await loadDB(); renderUsersList();
}


/* ==========================================================
   SECTION 8: ADMIN — POSITIONS
   ========================================================== */

function renderPositionsList() {
    const view = document.getElementById('admin-positions');
    let rows = '';
    if (DB.positions.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No positions defined</td></tr>';
    } else {
        rows = DB.positions.map((p, index) => {
            const count = DB.members.filter(m => m.positionId === p.id).length;
            return `<tr><td style="font-family:var(--font-m)">${index + 1}</td><td>${esc(p.name)}</td><td>${count}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditPosition(${p.id})">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeletePosition(${p.id})">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }
    view.innerHTML = `
    <div class="app-header"><h2>Positions</h2><div class="header-sub">Manage job positions</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Positions</h2><button class="btn btn-green" onclick="showAddPosition()">+ New Position</button></div>
      <div class="table-wrap"><table><thead><tr><th style="width:60px">No</th><th>Position Name</th><th style="width:100px">Members</th><th style="width:100px">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

function showAddPosition() {
    showModal(`<h3>New Position</h3>
    <div class="field"><label>Position Name</label><input class="input" id="inp-pos-name" placeholder="e.g. Software Engineer"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddPosition()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-pos-name')?.focus(), 100);
}

async function doAddPosition() {
    const name = document.getElementById('inp-pos-name').value.trim(); if (!name) return;
    await api('/positions', { method: 'POST', body: { name } });
    hideModal(); await loadDB(); renderPositionsList();
}

function showEditPosition(id) {
    const pos = DB.positions.find(p => p.id === id); if (!pos) return;
    showModal(`<h3>Edit Position</h3>
    <div class="field"><label>Position Name</label><input class="input" id="inp-pos-name" value="${esc(pos.name)}"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditPosition(${id})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-pos-name'); el.focus(); el.select(); }, 100);
}

async function doEditPosition(id) {
    const name = document.getElementById('inp-pos-name').value.trim(); if (!name) return;
    await api('/positions/' + id, { method: 'PUT', body: { name } });
    hideModal(); await loadDB(); renderPositionsList();
}

function confirmDeletePosition(id) {
    const pos = DB.positions.find(p => p.id === id); if (!pos) return;
    const count = DB.members.filter(m => m.positionId === id).length;
    showModal(`<h3>Delete Position</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(pos.name)}</strong>?<br>${count} member(s) will have position cleared.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeletePosition(${id})">Delete</button></div>`);
}

async function doDeletePosition(id) {
    await api('/positions/' + id, { method: 'DELETE' });
    hideModal(); await loadDB(); renderPositionsList();
}


/* ==========================================================
   SECTION 9: ADMIN — DEPARTMENTS
   ========================================================== */

function renderDepartmentsList() {
    const view = document.getElementById('admin-departments');
    let rows = '';
    if (DB.departments.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No departments defined</td></tr>';
    } else {
        rows = DB.departments.map((d, index) => {
            const count = DB.members.filter(m => m.departmentId === d.id).length;
            return `<tr><td style="font-family:var(--font-m)">${index + 1}</td><td>${esc(d.name)}</td><td>${count}</td>
            <td><div class="actions-cell">
            <button class="btn-icon" onclick="showEditDepartment(${d.id})">&#9998;</button>
            <button class="btn-icon danger" onclick="confirmDeleteDepartment(${d.id})">&#10005;</button>
            </div></td></tr>`;
        }).join('');
    }

    view.innerHTML = `
    <div class="app-header"><h2>Departments</h2><div class="header-sub">Manage departments</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Departments</h2><button class="btn btn-green" onclick="showAddDepartment()">+ New Department</button></div>
      <div class="table-wrap"><table><thead><tr><th style="width:60px">No</th><th>Department Name</th><th style="width:100px">Members</th><th style="width:100px">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

function showAddDepartment() {
    showModal(`<h3>New Department</h3>
    <div class="field"><label>Department Name</label><input class="input" id="inp-dept-name" placeholder="e.g. Engineering"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddDepartment()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-dept-name')?.focus(), 100);
}

async function doAddDepartment() {
    const name = document.getElementById('inp-dept-name').value.trim(); if (!name) return;
    await api('/departments', { method: 'POST', body: { name } });
    hideModal(); await loadDB(); renderDepartmentsList();
}

function showEditDepartment(id) {
    const dept = DB.departments.find(d => d.id === id); if (!dept) return;
    showModal(`<h3>Edit Department</h3>
    <div class="field"><label>Department Name</label><input class="input" id="inp-dept-name" value="${esc(dept.name)}"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditDepartment(${id})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-dept-name'); el.focus(); el.select(); }, 100);
}

async function doEditDepartment(id) {
    const name = document.getElementById('inp-dept-name').value.trim(); if (!name) return;
    await api('/departments/' + id, { method: 'PUT', body: { name } });
    hideModal(); await loadDB(); renderDepartmentsList();
}

function confirmDeleteDepartment(id) {
    const dept = DB.departments.find(d => d.id === id); if (!dept) return;
    const count = DB.members.filter(m => m.departmentId === id).length;
    showModal(`<h3>Delete Department</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(dept.name)}</strong>?<br>${count} member(s) will have department cleared.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteDepartment(${id})">Delete</button></div>`);
}

async function doDeleteDepartment(id) {
    await api('/departments/' + id, { method: 'DELETE' });
    hideModal(); await loadDB(); renderDepartmentsList();
}


/* ==========================================================
   SECTION 10: PROJECT DETAIL （Change to Main Scope now)
   ========================================================== */

function renderProjectDetail() {
    const pid = activeProjectId;
    const proj = DB.projects.find(p => p.id === pid);
    if (!proj) { showPage('admin-layout'); return; }

    const members = getProjectMembers(pid);
    const cost = getProjectCost(pid);
    const avg = members.length ? Math.round(cost / members.length) : 0;

    let memberRows = '';
    if (members.length === 0) {
        memberRows = '<tr><td colspan="5" style="text-align:center;color:var(--main-text3);padding:30px">No members assigned</td></tr>';
    } else {
        memberRows = members.map(m => {
            const sal = latestSalary(m);
            const salDisplay = sal != null ? `<span class="salary-val">${fmt(sal)}</span>` : '<span class="salary-na">Not set</span>';
            return `<tr>
        <td>${esc(m.name)}</td><td>${esc(getPositionName(m.positionId))}</td><td>${esc(getDeptName(m.departmentId))}</td>
        <td>${salDisplay}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditUser_byMember(${m.id})" title="Edit user">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmRemoveFromProject(${pid},${m.id})" title="Remove">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }

    const catId = proj.categoryId || 0;
    const scope = catId ? DB.scopes.find(s => s.id === catId) : null;
    const catName = scope ? scope.name : 'Uncategorized';

   document.getElementById('project-detail-content').innerHTML = `
    <div class="app-header">
      <button class="btn btn-ghost btn-sm" onclick="showPage('admin-layout')" style="margin-bottom:8px">&larr; Go Back</button>
    </div>

    <div class="app-body">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
        <div class="stat-card"><div class="stat-label">Monthly Cost</div><div class="stat-value">${fmt(cost)}</div></div>
        <div class="stat-card"><div class="stat-label">Avg Salary</div><div class="stat-value">${fmt(avg)}</div></div>
      </div>
      <div class="section-head"><h2>Assigned Members</h2><button class="btn btn-accent" onclick="showAssignMember(${pid})">+ Assign Member</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Cost</th><th style="width:100px">Actions</th></tr></thead><tbody>${memberRows}</tbody></table></div>
    </div>`;
}


function showEditUser_byMember(memberId) {
    const user = DB.users.find(u => u.memberId === memberId);
    if (user) showEditUser(user.id);
}

function showAssignMember(pid) {
    const assignedIds = getProjectMembers(pid).map(m => m.id);
    const seen = new Set();
    const available = DB.members.filter(m => {
        if (assignedIds.includes(m.id)) return false;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

    if (available.length === 0) {
        showModal(`<h3>Assign Members</h3>
            <p style="color:var(--main-text3);margin-bottom:16px">All members already assigned. Add new users in User Management first.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>`);
        return;
    }

    const memberItems = available.map(m => {
        const sal = latestSalary(m);
        const salLabel = sal != null ? ' — ' + fmt(sal) : '';
        return `<label class="multi-select-item" style="padding:8px 10px">
            <input type="checkbox" value="${m.id}" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer">
            ${esc(m.name)} <span style="color:var(--main-text3);font-size:.82rem">(${esc(getPositionName(m.positionId))}${salLabel})</span>
        </label>`;
    }).join('');

    showModal(`<h3>Assign Members to Project</h3>
        <div style="margin-bottom:8px;display:flex;gap:10px">
            <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-member-list input[type=checkbox]').forEach(c=>c.checked=true)">Select All</button>
            <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-member-list input[type=checkbox]').forEach(c=>c.checked=false)">Clear All</button>
            <span id="assign-count" style="font-size:.82rem;color:var(--main-text3);display:flex;align-items:center;margin-left:auto">0 selected</span>
        </div>
        <div id="assign-member-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:6px">
            ${memberItems}
        </div>
        <p class="auth-error" id="assign-error"></p>
        <div class="btns" style="margin-top:16px">
            <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
            <button class="btn btn-accent" onclick="doAssignMember(${pid})">Assign Selected</button>
        </div>`);

    // Live counter
    setTimeout(() => {
        document.querySelectorAll('#assign-member-list input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', updateAssignCount);
        });
    }, 50);
}

function updateAssignCount() {
    const checked = document.querySelectorAll('#assign-member-list input[type=checkbox]:checked').length;
    const el = document.getElementById('assign-count');
    if (el) el.textContent = checked + ' selected';
}



async function doAssignMember(pid) {
    const checkboxes = document.querySelectorAll('#assign-member-list input[type=checkbox]:checked');
    const errEl = document.getElementById('assign-error');

    if (checkboxes.length === 0) {
        if (errEl) errEl.textContent = 'Please select at least one member';
        return;
    }

    const memberIds = Array.from(checkboxes).map(c => parseInt(c.value));

    for (const memberId of memberIds) {
        const already = DB.projectAssignments.find(pa => pa.projectId === pid && pa.memberId === memberId);
        if (!already) {
            await api('/assignments', { method: 'POST', body: { projectId: pid, memberId } });
        }
    }

    hideModal(); await loadDB(); renderProjectDetail();
}


function confirmRemoveFromProject(pid, memberId) {
    const m = DB.members.find(x => x.id === memberId); if (!m) return;
    showModal(`<h3>Remove from Project</h3>
    <p style="color:var(--main-text2);line-height:1.6">Remove <strong style="color:var(--main-text)">${esc(m.name)}</strong>? Account and salary kept.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doRemoveFromProject(${pid},${memberId})">Remove</button></div>`);
}

async function doRemoveFromProject(pid, memberId) {
    await api('/assignments', { method: 'DELETE', body: { projectId: pid, memberId } });
    hideModal(); await loadDB(); renderProjectDetail();
}


/* ==========================================================
   SECTION 11: EMPLOYEE — MY ITEMS (grouped by Scope)
   ========================================================== */

function renderEmployeeProjects() {
    if (!currentUser || !currentUser.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId); if (!member) return;
    const projs = getMemberProjects(member.id);

    // Group by scope
    const groups = {};
    DB.scopes.forEach(s => { groups[s.id] = { scope: s, items: [] }; });
    groups[0] = { scope: { id: 0, name: 'Uncategorized' }, items: [] };

    projs.forEach(p => {
        const sid = p.categoryId || 0;
        if (groups[sid]) groups[sid].items.push(p);
    });
    if (groups[0].items.length === 0) delete groups[0];

    let content = '';
    if (projs.length === 0) {
        content = '<div class="empty"><div class="icon">&#128193;</div><p>Not assigned to any item</p></div>';
    } else {
        Object.values(groups).forEach(g => {
            if (g.items.length === 0) return;
            content += `
            <div style="margin-bottom:28px">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--main-border)">
                <span style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">${esc(g.scope.name)}</span>
                <span style="font-size:.82rem;color:var(--main-text3)">${g.items.length} item${g.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="table-wrap"><table>
                <thead><tr><th>Item Name</th><th>Timeline</th><th>Team Size</th><th>Countdown</th></tr></thead>
                <tbody>
                  ${g.items.map(p => {
                    const mc = getProjectMembers(p.id).length;
                    const cd = getProjectCountdown(p);
                    let cdHtml = '—';
                    if (cd !== null) {
                        if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">&#9200; ' + cd + ' days left</span>';
                        else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">&#9200; ' + cd + ' days left</span>';
                        else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">&#9200; ' + cd + ' days left</span>';
                        else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">&#9888; Due today!</span>';
                        else cdHtml = '<span style="color:var(--danger);font-weight:600">&#10006; ' + Math.abs(cd) + ' days overdue</span>';
                    }
                    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                    return `<tr>
                        <td><div style="font-family:var(--font-d);font-size:1rem">${esc(p.name)}</div></td>
                        <td style="font-family:var(--font-m);font-size:.85rem">${fmtDate(p.startDate)} — ${fmtDate(p.endDate)}</td>
                        <td>${mc} member${mc !== 1 ? 's' : ''}</td>
                        <td>${cdHtml}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>
            </div>`;
        });
    }

    document.getElementById('emp-myprojects').innerHTML = `
    <div class="app-header"><h2>My Items</h2><div class="header-sub">Items you are involved in</div></div>
    <div class="app-body" style="max-width:none">
      <div class="emp-card">
        <div class="emp-name">${esc(member.name)}</div>
        <div class="emp-project">Position: ${esc(getPositionName(member.positionId))} &nbsp;|&nbsp; Department: ${esc(getDeptName(member.departmentId))}</div>
        <div class="emp-project" style="margin-bottom:8px">Assigned Items: <strong>${projs.length}</strong></div>
      </div>
      ${content}
    </div>`;
}



/* ==========================================================
   SECTION 12: EMPLOYEE — TIME ENTRIES (filter by scope → item + date + pagination)
   ========================================================== */

let empAttCurrentPage = 1;
let empAttPageSize = 10;
let empAttFilteredData = [];

function getEmployeeProjects(memberId) {
    return DB.projectAssignments
        .filter(pa => pa.memberId === memberId)
        .map(pa => DB.projects.find(p => p.id === pa.projectId))
        .filter(Boolean);
}

function renderEmployeeAttendance() {
    if (!currentUser || !currentUser.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;

    empAttCurrentPage = 1;
    empAttPageSize = 10;

    const myProjects = getEmployeeProjects(member.id);

    // Build multi-select options from my projects
    const myScopeIds = [...new Set(myProjects.map(p => p.categoryId).filter(Boolean))];
    const myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));
    const scopeMsOpts = myScopes.map(s => ({ value: s.id, label: s.name }));
    const projMsOpts = myProjects.map(p => ({ value: p.id, label: p.name }));

    const today = todayStr();
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    const myEntries = DB.attendance.filter(a => a.memberId === member.id);
    const todayEntries = myEntries.filter(a => a.date === today);

    const todayMs = todayEntries.reduce((s, r) => {
        if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn));
        return s;
    }, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEntries = myEntries.filter(a => a.date >= weekStartStr);
    const weekMs = weekEntries.reduce((s, r) => {
        if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn));
        return s;
    }, 0);

    const todayCost = todayEntries.reduce((s, r) => {
        if (r.clockIn && r.clockOut) { const c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);

    const projectInfo = myProjects.length > 0
        ? myProjects.map(p => {
            const scope = p.categoryId ? DB.scopes.find(s => s.id === p.categoryId) : null;
            const label = scope ? scope.name + ' → ' + p.name : p.name;
            return '<span class="badge badge-employee" style="margin:2px">' + esc(label) + '</span>';
          }).join(' ')
        : '<span style="color:var(--main-text3)">Not assigned to any item</span>';

    document.getElementById('emp-attendance').innerHTML = `
    <div class="app-header"><h2>My Attendance</h2><div class="header-sub">Log and track your work hours</div></div>
    <div class="app-body" style="max-width:none">
      <div class="emp-card" style="text-align:left;padding:28px 32px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div class="emp-name" style="margin-bottom:0;font-size:1.3rem">${esc(member.name)}</div>
          <span style="color:var(--main-text3);font-size:.85rem">${esc(getPositionName(member.positionId))} | ${esc(getDeptName(member.departmentId))}</span>
        </div>
        <div style="font-size:.85rem;color:var(--main-text2)">My Items: ${projectInfo}</div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-label">Today</div><div class="stat-value" style="font-size:1.2rem">${formatDuration(todayMs)}</div></div>
        <div class="stat-card"><div class="stat-label">Today Cost</div><div class="stat-value" style="font-size:1.2rem">${fmtCost(todayCost)}</div></div>
        <div class="stat-card"><div class="stat-label">This Week</div><div class="stat-value" style="font-size:1.2rem">${formatDuration(weekMs)}</div></div>
        <div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value" style="font-size:1.2rem">${myEntries.length}</div></div>
        <div class="stat-card"><div class="stat-label">Hourly Rate</div><div class="stat-value" style="font-size:1.1rem">${fmtHourlyRate(member)}</div></div>
      </div>

      <!-- Filter bar -->
      <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label>
            <input type="date" class="input" id="emp-att-from" value="${defaultFrom}" style="width:145px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label>
            <input type="date" class="input" id="emp-att-to" value="${today}" style="width:145px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Scope</label>
            <div style="min-width:140px">${msGenerate('emp-ms-scope', scopeMsOpts, 'All Scopes')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Item</label>
            <div style="min-width:160px">${msGenerate('emp-ms-item', projMsOpts, 'All Items')}</div>
          </div>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="btn btn-accent btn-sm" onclick="applyEmpAttendanceFilter()">Search</button>
            <button class="btn btn-ghost btn-sm" onclick="resetEmpAttendanceFilter()">Reset</button>
            <button class="btn btn-blue btn-sm" onclick="exportAttendanceCSV()">&#128196; Export CSV</button>
          </div>
        </div>
      </div>

      <div id="emp-att-stats-area"></div>
      <div id="emp-att-project-summary"></div>
      <div class="section-head time-entry-head">
        <h2>Time Entries</h2>
        <button class="btn btn-green" onclick="showAddTimeEntry()">+ Add Attendance</button>
      </div>
      <div id="emp-att-table-area"></div>
    </div>`;

    /* When Scope selection changes, rebuild Item options */
    msOnChange('emp-ms-scope', function(selectedScopeIds) {
        var filtered = selectedScopeIds.length > 0
            ? myProjects.filter(function(p) { return selectedScopeIds.indexOf(p.categoryId) !== -1; })
            : myProjects;
        msRebuild('emp-ms-item', filtered.map(function(p) { return { value: p.id, label: p.name }; }), true);
    });

    applyEmpAttendanceFilter();
}


function resetEmpAttendanceFilter() {
    var today = todayStr();
    var thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('emp-att-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('emp-att-to').value = today;

    /* Clear multi-selects */
    msClear('emp-ms-scope');

    /* Reset Item to show all my projects */
    var myProjects = getEmployeeProjects(currentUser.memberId);
    msRebuild('emp-ms-item', myProjects.map(function(p) { return { value: p.id, label: p.name }; }), false);

    empAttCurrentPage = 1;
    applyEmpAttendanceFilter();
}


function applyEmpAttendanceFilter() {
    if (!currentUser || !currentUser.memberId) return;
    var member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;

    var fromDate = document.getElementById('emp-att-from').value;
    var toDate = document.getElementById('emp-att-to').value;
    var scopeIds = msGetValues('emp-ms-scope');
    var itemIds = msGetValues('emp-ms-item');
    if (!fromDate || !toDate) return;

    var filtered = DB.attendance.filter(a => a.memberId === member.id && a.date >= fromDate && a.date <= toDate);

    /* Filter by selected scope(s) */
    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(p => scopeIds.indexOf(p.categoryId) !== -1).map(p => p.id);
        filtered = filtered.filter(a => scopeItemIds.indexOf(a.projectId) !== -1);
    }

    /* Filter by selected item(s) */
    if (itemIds.length > 0) {
        filtered = filtered.filter(a => itemIds.indexOf(a.projectId) !== -1);
    }

    filtered = filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    empAttFilteredData = filtered;

    // Stats for filtered range
    const totalMs = filtered.reduce((s, r) => {
        if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn));
        return s;
    }, 0);
    const totalCost = filtered.reduce((s, r) => {
        if (r.clockIn && r.clockOut) { const c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);

    document.getElementById('emp-att-stats-area').innerHTML =
        '<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px">' +
            '<div class="stat-card"><div class="stat-label">Filtered Entries</div><div class="stat-value" style="font-size:1.2rem">' + filtered.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Filtered Hours</div><div class="stat-value" style="font-size:1.2rem">' + formatDuration(totalMs) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Filtered Cost</div><div class="stat-value" style="font-size:1.2rem">' + fmtCost(totalCost) + '</div></div>' +
        '</div>';

    // Summary by scope → item
    const itemGroups = {};
    filtered.forEach(r => {
        if (!r.clockIn || !r.clockOut) return;
        const pid = r.projectId || 0;
        if (!itemGroups[pid]) itemGroups[pid] = { ms: 0, cost: 0, entries: 0 };
        const ms = new Date(r.clockOut) - new Date(r.clockIn);
        itemGroups[pid].ms += ms;
        itemGroups[pid].cost += (getEntryCost(r.memberId, ms) || 0);
        itemGroups[pid].entries++;
    });

    const hasGroups = Object.keys(itemGroups).length > 0;
    let summaryRows = '';
    if (hasGroups) {
        summaryRows = Object.entries(itemGroups).map(([pid, data]) => {
            const proj = pid === '0' ? null : DB.projects.find(p => p.id === parseInt(pid));
            const scope = proj && proj.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
            const label = proj
                ? (scope ? scope.name + ' → ' + proj.name : proj.name)
                : '<span style="color:var(--main-text3)">Unassigned</span>';
            return '<tr><td>' + label +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + data.entries +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + formatDuration(data.ms) +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + fmtCost(data.cost) + '</td></tr>';
        }).join('');
    }

    document.getElementById('emp-att-project-summary').innerHTML = hasGroups
        ? '<div class="section-head" style="margin-top:4px"><h2>Item Summary</h2></div>' +
          '<div class="table-wrap" style="margin-bottom:24px"><table>' +
          '<thead><tr><th>Scope → Item</th><th style="text-align:right">Entries</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
          '<tbody>' + summaryRows + '</tbody></table></div>'
        : '';

    // Clamp page
    const totalPages = Math.ceil(filtered.length / empAttPageSize) || 1;
    if (empAttCurrentPage > totalPages) empAttCurrentPage = totalPages;
    if (empAttCurrentPage < 1) empAttCurrentPage = 1;

    renderEmpAttendancePage();
}


function renderEmpAttendancePage() {
    const filtered = empAttFilteredData;
    const totalPages = Math.ceil(filtered.length / empAttPageSize) || 1;
    const startIdx = (empAttCurrentPage - 1) * empAttPageSize;
    const endIdx = startIdx + empAttPageSize;
    const pageData = filtered.slice(startIdx, endIdx);

    let rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No time entries found</td></tr>';
    } else {
        rows = pageData.map(r => {
            var proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
            var scope = proj && proj.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
            var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            var startParts = r.clockIn ? r.clockIn.split('T') : [];
            var endParts = r.clockOut ? r.clockOut.split('T') : [];
            var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '—';
            var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '—';
            var subScopeName = r.subScopeId ? getSubScopeName(r.subScopeId) : '';
            var detailName = r.detailId ? getDetailName(r.detailId) : '';

            var itemDisplay = '—';
            if (proj) {
                itemDisplay = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            }

            return '<tr>' +
                '<td style="font-family:var(--font-m)">' + r.date + '</td>' +
                '<td>' + itemDisplay + '</td>' +
                '<td>' + (subScopeName ? esc(subScopeName) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + (detailName ? esc(detailName) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.description || '') + '">' + (r.description ? esc(r.description) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td style="font-family:var(--font-m)">' + startTime + '</td>' +
                '<td style="font-family:var(--font-m)">' + endTime + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + dur + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditTimeEntry(' + r.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteTimeEntry(' + r.id + ')" title="Delete">&#10005;</button>' +
                '</div></td></tr>';
        }).join('');
    }

    let paginationHtml = '';
    if (filtered.length > 0) {
        const showFrom = startIdx + 1;
        const showTo = Math.min(endIdx, filtered.length);
        let pageButtons = '';
        const maxVisible = 5;
        let startPage = Math.max(1, empAttCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goEmpAttPage(1)" ' + (empAttCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goEmpAttPage(' + (empAttCurrentPage - 1) + ')" ' + (empAttCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (let p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goEmpAttPage(' + p + ')" class="' + (p === empAttCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goEmpAttPage(' + (empAttCurrentPage + 1) + ')" ' + (empAttCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goEmpAttPage(' + totalPages + ')" ' + (empAttCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + filtered.length + ' entries</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeEmpAttPageSize(this.value)">' +
                        '<option value="5"' + (empAttPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (empAttPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (empAttPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (empAttPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (empAttPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    var tableArea = document.getElementById('emp-att-table-area');
    tableArea.innerHTML =
        '<div class="table-wrap">' +
            '<table><thead><tr>' +
                '<th>Date</th><th>Scope &rarr; Item</th><th>Sub Scope</th><th>Detail</th><th>Description</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>' +
        paginationHtml;
}

function showAddTimeEntry() {
    var myProjects = getEmployeeProjects(currentUser.memberId);
    if (myProjects.length === 0) {
        showModal('<h3>Add Time Entry</h3>' +
            '<p style="color:var(--main-text3);line-height:1.6">You are not assigned to any item.<br>Please ask admin to assign you to an item first.</p>' +
            '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>');
        return;
    }

    var today = todayStr();
    var myScopeIds = [...new Set(myProjects.map(p => p.categoryId).filter(Boolean))];
    var myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));
    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        myScopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    showModal(`
    <h3>Add Time Entry</h3>
    <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${today}"></div>
    <div class="field"><label>Scope</label><select class="input" id="entry-scope-filter" onchange="entryScopeChanged()">${scopeOptions}</select></div>
    <div class="field"><label>Item</label><select class="input" id="entry-project"><option value="">-- Select Item --</option></select></div>
    <div class="field"><label>Sub Scope</label><select class="input" id="entry-subscope">${subScopeOpts(null)}</select></div>
    <div class="field"><label>Detail</label><select class="input" id="entry-detail">${detailOpts(null)}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="09:00"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="17:00"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="input" id="entry-desc" rows="3" placeholder="What did you work on?" style="resize:vertical"></textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>`);
    setTimeout(function() { document.getElementById('entry-scope-filter').focus(); }, 100);
}


function goEmpAttPage(page) {
    const totalPages = Math.ceil(empAttFilteredData.length / empAttPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    empAttCurrentPage = page;
    renderEmpAttendancePage();
}

function changeEmpAttPageSize(size) {
    empAttPageSize = parseInt(size);
    empAttCurrentPage = 1;
    renderEmpAttendancePage();
}

function showAddTimeEntry() {
    var myProjects = getEmployeeProjects(currentUser.memberId);
    if (myProjects.length === 0) {
        showModal('<h3>Add Time Entry</h3>' +
            '<p style="color:var(--main-text3);line-height:1.6">You are not assigned to any item.<br>Please ask admin to assign you to an item first.</p>' +
            '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>');
        return;
    }

    var today = todayStr();
    var myScopeIds = [...new Set(myProjects.map(p => p.categoryId).filter(Boolean))];
    var myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));
    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        myScopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    showModal(`
    <h3>Add Time Entry</h3>
    <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${today}"></div>
    <div class="field"><label>Scope</label><select class="input" id="entry-scope-filter" onchange="entryScopeChanged()">${scopeOptions}</select></div>
    <div class="field"><label>Item</label><select class="input" id="entry-project"><option value="">-- Select Item --</option></select></div>
    <div class="field"><label>Scope (ref)</label><select class="input" id="entry-scope">${scopeOpts(null)}</select></div>
    <div class="field"><label>Sub Scope</label><select class="input" id="entry-subscope">${subScopeOpts(null)}</select></div>
    <div class="field"><label>Detail</label><select class="input" id="entry-detail">${detailOpts(null)}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="09:00"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="17:00"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="input" id="entry-desc" rows="3" placeholder="What did you work on?" style="resize:vertical"></textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>`);
    setTimeout(function() { document.getElementById('entry-scope-filter').focus(); }, 100);
}

// Scope changed in Add/Edit modal → filter items
function entryScopeChanged() {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var projSelect = document.getElementById('entry-project');
    var myProjects = getEmployeeProjects(currentUser.memberId);

    var filtered = scopeId
        ? myProjects.filter(p => p.categoryId === parseInt(scopeId))
        : myProjects;

    projSelect.innerHTML = '<option value="">-- Select Item --</option>' +
        filtered.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
}

async function doAddTimeEntry() {
    var errEl = document.getElementById('entry-error');
    var date = document.getElementById('entry-date').value;
    var projectId = document.getElementById('entry-project').value;
    var scopeId = document.getElementById('entry-scope').value;
    var subScopeId = document.getElementById('entry-subscope').value;
    var detailId = document.getElementById('entry-detail').value;
    var start = document.getElementById('entry-start').value;
    var end = document.getElementById('entry-end').value;
    var desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select an item'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var newStart = date + 'T' + start + ':00';
    var newEnd = date + 'T' + end + ':00';

    var myEntries = DB.attendance.filter(function(a) {
        return a.memberId === currentUser.memberId && a.date === date && a.clockIn && a.clockOut;
    });
    var overlap = null;
    for (var i = 0; i < myEntries.length; i++) {
        if (newStart < myEntries[i].clockOut && newEnd > myEntries[i].clockIn) {
            overlap = myEntries[i]; break;
        }
    }
    if (overlap) {
        var oStart = overlap.clockIn.split('T')[1].substring(0, 5);
        var oEnd = overlap.clockOut.split('T')[1].substring(0, 5);
        var oProj = overlap.projectId ? DB.projects.find(function(p) { return p.id === overlap.projectId; }) : null;
        var oScope = oProj && oProj.categoryId ? DB.scopes.find(function(s) { return s.id === oProj.categoryId; }) : null;
        var oLabel = oScope ? oScope.name + ' → ' + oProj.name : (oProj ? oProj.name : '');
        errEl.textContent = 'Overlaps with ' + oStart + '-' + oEnd + (oLabel ? ' (' + oLabel + ')' : '');
        return;
    }

    try {
        await api('/attendance', {
            method: 'POST',
            body: {
                memberId: currentUser.memberId,
                date: date,
                clockIn: newStart,
                clockOut: newEnd,
                projectId: parseInt(projectId),
                scopeId: scopeId ? parseInt(scopeId) : null,
                subScopeId: subScopeId ? parseInt(subScopeId) : null,
                detailId: detailId ? parseInt(detailId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}




function showAddTimeEntry() {
    var myProjects = getEmployeeProjects(currentUser.memberId);
    if (myProjects.length === 0) {
        showModal('<h3>Add Time Entry</h3>' +
            '<p style="color:var(--main-text3);line-height:1.6">You are not assigned to any item.<br>Please ask admin to assign you to an item first.</p>' +
            '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>');
        return;
    }

    var today = todayStr();
    var myScopeIds = [...new Set(myProjects.map(p => p.categoryId).filter(Boolean))];
    var myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));
    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        myScopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    showModal(`
    <h3>Add Time Entry</h3>
    <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${today}"></div>
    <div class="field"><label>Scope</label><select class="input" id="entry-scope-filter" onchange="entryScopeChanged()">${scopeOptions}</select></div>
    <div class="field"><label>Item</label><select class="input" id="entry-project"><option value="">-- Select Item --</option></select></div>
    <div class="field"><label>Sub Scope</label><select class="input" id="entry-subscope">${subScopeOpts(null)}</select></div>
    <div class="field"><label>Detail</label><select class="input" id="entry-detail">${detailOpts(null)}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="09:00"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="17:00"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="input" id="entry-desc" rows="3" placeholder="What did you work on?" style="resize:vertical"></textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>`);
    setTimeout(function() { document.getElementById('entry-scope-filter').focus(); }, 100);
}

function showEditTimeEntry(entryId) {
    var entry = DB.attendance.find(a => a.id === entryId);
    if (!entry) return;
    var myProjects = getEmployeeProjects(currentUser.memberId);
    var allProjects = myProjects;
    if (entry.projectId && !allProjects.find(p => p.id === entry.projectId)) {
        var curProj = DB.projects.find(p => p.id === entry.projectId);
        if (curProj) allProjects = [curProj].concat(allProjects);
    }

    var currentProj = entry.projectId ? DB.projects.find(p => p.id === entry.projectId) : null;
    var currentScopeId = currentProj && currentProj.categoryId ? currentProj.categoryId : '';

    var myScopeIds = [...new Set(allProjects.map(p => p.categoryId).filter(Boolean))];
    var myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));
    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        myScopes.map(s => {
            var sel = currentScopeId === s.id ? 'selected' : '';
            return '<option value="' + s.id + '" ' + sel + '>' + esc(s.name) + '</option>';
        }).join('');

    var scopeItems = currentScopeId
        ? allProjects.filter(p => p.categoryId === currentScopeId)
        : allProjects;
    var projectOpts = scopeItems.map(p => {
        var sel = entry.projectId === p.id ? 'selected' : '';
        return '<option value="' + p.id + '" ' + sel + '>' + esc(p.name) + '</option>';
    }).join('');

    var startParts = entry.clockIn ? entry.clockIn.split('T') : [];
    var endParts = entry.clockOut ? entry.clockOut.split('T') : [];
    var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
    var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';

    showModal(`
    <h3>Edit Time Entry</h3>
    <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${entry.date}"></div>
    <div class="field"><label>Scope</label><select class="input" id="entry-scope-filter" onchange="entryScopeChangedEdit()">${scopeOptions}</select></div>
    <div class="field"><label>Item</label><select class="input" id="entry-project"><option value="">-- Select Item --</option>${projectOpts}</select></div>
    <div class="field"><label>Sub Scope</label><select class="input" id="entry-subscope">${subScopeOpts(entry.subScopeId)}</select></div>
    <div class="field"><label>Detail</label><select class="input" id="entry-detail">${detailOpts(entry.detailId)}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="${startTime}"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="${endTime}"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="input" id="entry-desc" rows="3" style="resize:vertical">${esc(entry.description || '')}</textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditTimeEntry(${entryId})">Save</button></div>`);
}

function entryScopeChangedEdit() {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var projSelect = document.getElementById('entry-project');
    var myProjects = getEmployeeProjects(currentUser.memberId);
    var allProjects = myProjects;

    var filtered = scopeId
        ? allProjects.filter(p => p.categoryId === parseInt(scopeId))
        : allProjects;

    projSelect.innerHTML = '<option value="">-- Select Item --</option>' +
        filtered.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
}

async function doAddTimeEntry() {
    var errEl = document.getElementById('entry-error');
    var date = document.getElementById('entry-date').value;
    var projectId = document.getElementById('entry-project').value;
    var subScopeId = document.getElementById('entry-subscope').value;
    var detailId = document.getElementById('entry-detail').value;
    var start = document.getElementById('entry-start').value;
    var end = document.getElementById('entry-end').value;
    var desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select an item'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var newStart = date + 'T' + start + ':00';
    var newEnd = date + 'T' + end + ':00';

    var myEntries = DB.attendance.filter(function(a) {
        return a.memberId === currentUser.memberId && a.date === date && a.clockIn && a.clockOut;
    });
    var overlap = null;
    for (var i = 0; i < myEntries.length; i++) {
        if (newStart < myEntries[i].clockOut && newEnd > myEntries[i].clockIn) {
            overlap = myEntries[i]; break;
        }
    }
    if (overlap) {
        var oStart = overlap.clockIn.split('T')[1].substring(0, 5);
        var oEnd = overlap.clockOut.split('T')[1].substring(0, 5);
        var oProj = overlap.projectId ? DB.projects.find(function(p) { return p.id === overlap.projectId; }) : null;
        var oScope = oProj && oProj.categoryId ? DB.scopes.find(function(s) { return s.id === oProj.categoryId; }) : null;
        var oLabel = oScope ? oScope.name + ' -> ' + oProj.name : (oProj ? oProj.name : '');
        errEl.textContent = 'Overlaps with ' + oStart + '-' + oEnd + (oLabel ? ' (' + oLabel + ')' : '');
        return;
    }

    try {
        await api('/attendance', {
            method: 'POST',
            body: {
                memberId: currentUser.memberId,
                date: date,
                clockIn: newStart,
                clockOut: newEnd,
                projectId: parseInt(projectId),
                scopeId: null,
                subScopeId: subScopeId ? parseInt(subScopeId) : null,
                detailId: detailId ? parseInt(detailId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

async function doEditTimeEntry(entryId) {
    var errEl = document.getElementById('entry-error');
    var date = document.getElementById('entry-date').value;
    var projectId = document.getElementById('entry-project').value;
    var subScopeId = document.getElementById('entry-subscope').value;
    var detailId = document.getElementById('entry-detail').value;
    var start = document.getElementById('entry-start').value;
    var end = document.getElementById('entry-end').value;
    var desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select an item'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var newStart = date + 'T' + start + ':00';
    var newEnd = date + 'T' + end + ':00';

    var myEntries = DB.attendance.filter(function(a) {
        return a.memberId === currentUser.memberId && a.date === date && a.clockIn && a.clockOut && a.id !== entryId;
    });
    var overlap = null;
    for (var i = 0; i < myEntries.length; i++) {
        if (newStart < myEntries[i].clockOut && newEnd > myEntries[i].clockIn) {
            overlap = myEntries[i]; break;
        }
    }
    if (overlap) {
        var oStart = overlap.clockIn.split('T')[1].substring(0, 5);
        var oEnd = overlap.clockOut.split('T')[1].substring(0, 5);
        var oProj = overlap.projectId ? DB.projects.find(function(p) { return p.id === overlap.projectId; }) : null;
        var oScope = oProj && oProj.categoryId ? DB.scopes.find(function(s) { return s.id === oProj.categoryId; }) : null;
        var oLabel = oScope ? oScope.name + ' -> ' + oProj.name : (oProj ? oProj.name : '');
        errEl.textContent = 'Overlaps with ' + oStart + '-' + oEnd + (oLabel ? ' (' + oLabel + ')' : '');
        return;
    }

    try {
        await api('/attendance/' + entryId, {
            method: 'PUT',
            body: {
                date: date,
                clockIn: newStart,
                clockOut: newEnd,
                projectId: parseInt(projectId),
                scopeId: null,
                subScopeId: subScopeId ? parseInt(subScopeId) : null,
                detailId: detailId ? parseInt(detailId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}



async function doDeleteTimeEntry(entryId) {
    try {
        await api('/attendance/' + entryId, { method: 'DELETE' });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { alert('Failed: ' + e.message); }
}




/* ==========================================================
   MULTI-SELECT COMPONENT HELPERS
   ========================================================== */
var _msState = {};
var _msCallbacks = {};
var _msIds = new Set();

function msGenerate(id, options, placeholder) {
    _msIds.add(id);
    _msState[id] = new Set();
    _msState[id + '_opts'] = options;
    _msState[id + '_ph'] = placeholder || 'Select...';

    var itemsHtml = options.length > 0
        ? options.map(function(o) {
            return '<label class="multi-select-item" onclick="event.stopPropagation()">' +
                '<input type="checkbox" value="' + o.value + '" ' +
                'onchange="msOnCheck(\'' + id + '\', this.value, this.checked)">' +
                '<span>' + esc(o.label) + '</span></label>';
        }).join('')
        : '<div style="padding:14px;text-align:center;color:var(--main-text3);font-size:.82rem">No options</div>';

    return '<div class="multi-select" id="' + id + '-wrap">' +
        '<div class="multi-select-trigger" onclick="msToggle(\'' + id + '\')">' +
            '<span class="ms-display" id="' + id + '-disp">' + esc(placeholder || 'Select...') + '</span>' +
            '<span class="arrow">&#9662;</span>' +
        '</div>' +
        '<div class="multi-select-dropdown">' +
            '<div class="multi-select-actions">' +
                '<button type="button" onclick="msSelectAll(\'' + id + '\');event.stopPropagation()">Select All</button>' +
                '<button type="button" onclick="msClear(\'' + id + '\');event.stopPropagation()">Clear</button>' +
            '</div>' +
            itemsHtml +
        '</div>' +
    '</div>';
}

function msToggle(id) {
    _msIds.forEach(function(k) {
        if (k !== id) {
            var wrap = document.getElementById(k + '-wrap');
            if (wrap) wrap.classList.remove('open');
        }
    });
    var wrap = document.getElementById(id + '-wrap');
    if (wrap) wrap.classList.toggle('open');
}

function msOnCheck(id, value, checked) {
    if (!_msState[id]) return;
    if (checked) _msState[id].add(String(value));
    else _msState[id].delete(String(value));
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msSelectAll(id) {
    var opts = _msState[id + '_opts'] || [];
    _msState[id] = new Set(opts.map(function(o) { return String(o.value); }));
    msSyncCheckboxes(id);
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msClear(id) {
    if (_msState[id]) _msState[id].clear();
    msSyncCheckboxes(id);
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msSyncCheckboxes(id) {
    var wrap = document.getElementById(id + '-wrap');
    if (!wrap) return;
    var cbs = wrap.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = _msState[id] ? _msState[id].has(String(cbs[i].value)) : false;
    }
}

function msUpdateDisplay(id) {
    var el = document.getElementById(id + '-disp');
    if (!el) return;
    var sel = _msState[id];
    var ph = _msState[id + '_ph'] || 'Select...';
    if (!sel || sel.size === 0) {
        el.textContent = ph;
        el.style.color = '';
        return;
    }
    var opts = _msState[id + '_opts'] || [];
    var matches = opts.filter(function(o) { return sel.has(String(o.value)); });
    if (matches.length === 1) {
        el.textContent = matches[0].label;
        el.style.color = 'var(--main-text)';
    } else {
        el.innerHTML = '<span class="multi-select-count">' + matches.length + ' selected</span>';
    }
}

function msGetValues(id) {
    if (!_msState[id]) return [];
    return Array.from(_msState[id]).map(Number);
}

function msRebuild(id, options, keepSelection) {
    var prev = keepSelection && _msState[id] ? new Set(_msState[id]) : new Set();
    _msState[id + '_opts'] = options;
    var validSet = new Set(options.map(function(o) { return String(o.value); }));
    _msState[id] = new Set(Array.from(prev).filter(function(v) { return validSet.has(v); }));

    var wrap = document.getElementById(id + '-wrap');
    if (!wrap) return;
    var dd = wrap.querySelector('.multi-select-dropdown');
    if (!dd) return;

    var actionsHtml = '<div class="multi-select-actions">' +
        '<button type="button" onclick="msSelectAll(\'' + id + '\');event.stopPropagation()">Select All</button>' +
        '<button type="button" onclick="msClear(\'' + id + '\');event.stopPropagation()">Clear</button>' +
    '</div>';

    var itemsHtml = options.length > 0
        ? options.map(function(o) {
            var chk = _msState[id].has(String(o.value)) ? 'checked ' : '';
            return '<label class="multi-select-item" onclick="event.stopPropagation()">' +
                '<input type="checkbox" value="' + o.value + '" ' + chk +
                'onchange="msOnCheck(\'' + id + '\', this.value, this.checked)">' +
                '<span>' + esc(o.label) + '</span></label>';
        }).join('')
        : '<div style="padding:14px;text-align:center;color:var(--main-text3);font-size:.82rem">No options</div>';

    dd.innerHTML = actionsHtml + itemsHtml;
    msUpdateDisplay(id);
}

function msOnChange(id, fn) {
    _msCallbacks[id] = fn;
}

/* Close dropdowns on outside click */
document.addEventListener('click', function(e) {
    _msIds.forEach(function(id) {
        var wrap = document.getElementById(id + '-wrap');
        if (wrap && !wrap.contains(e.target)) {
            wrap.classList.remove('open');
        }
    });
});


/* ==========================================================
   SECTION 10: ADMIN — ATTENDANCE (scope → item)
   ========================================================== */

var adminAttCurrentPage = 1;
var adminAttPageSize = 25;
var adminAttFilteredData = [];

function renderAdminAttendance() {
    adminAttCurrentPage = 1;
    adminAttPageSize = 25;

    var today = todayStr();
    var thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var scopeOpts = DB.scopes.map(function(s) { return { value: s.id, label: s.name }; });
    var empOpts = DB.members.map(function(m) { return { value: m.id, label: m.name }; });

    var view = document.getElementById('admin-attendance');
    view.innerHTML =
    '<div class="app-header"><h2>Attendance</h2><div class="header-sub">Track all employee attendance</div></div>' +
    '<div class="app-body">' +
      '<div class="stats-grid" id="att-stats"></div>' +

      '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>' +
        '</div>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label>' +
            '<input type="date" class="input" id="att-from" value="' + defaultFrom + '" style="width:145px;padding:8px 10px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label>' +
            '<input type="date" class="input" id="att-to" value="' + today + '" style="width:145px;padding:8px 10px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Scope</label>' +
            '<div style="min-width:140px">' + msGenerate('att-ms-scope', scopeOpts, 'All Scopes') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Item</label>' +
            '<div style="min-width:160px">' + msGenerate('att-ms-item', [], 'All Items') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label>' +
            '<div style="min-width:150px">' + msGenerate('att-ms-emp', empOpts, 'All Employees') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-left:auto">' +
            '<button class="btn btn-accent btn-sm" onclick="applyAdminAttendanceFilter()">Search</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="resetAdminAttendanceFilter()">Reset</button>' +
            '<button class="btn btn-blue btn-sm" onclick="exportAttendanceCSV()">&#128196; Export CSV</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-head time-entry-head">' +
        '<h2>Time Entries</h2>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-green" onclick="showAdminAddAttendance()">+ Add Attendance</button>' +
        '</div>' +
      '</div>' +
      '<div id="admin-att-table-area"></div>' +
    '</div>';

    /* Populate Item multi-select with all projects */
    var allItemOpts = DB.projects.map(function(p) { return { value: p.id, label: p.name }; });
    msRebuild('att-ms-item', allItemOpts, false);

    /* When Scope selection changes, rebuild Item options to match */
    msOnChange('att-ms-scope', function(selectedScopeIds) {
        var filtered = selectedScopeIds.length > 0
            ? DB.projects.filter(function(p) { return selectedScopeIds.indexOf(p.categoryId) !== -1; })
            : DB.projects;
        msRebuild('att-ms-item', filtered.map(function(p) { return { value: p.id, label: p.name }; }), true);
    });

    applyAdminAttendanceFilter();
}

function resetAdminAttendanceFilter() {
    var today = todayStr();
    var thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('att-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('att-to').value = today;

    /* Clear all multi-selects */
    msClear('att-ms-scope');
    msClear('att-ms-emp');

    /* Reset Item to show all projects */
    var allItemOpts = DB.projects.map(function(p) { return { value: p.id, label: p.name }; });
    msRebuild('att-ms-item', allItemOpts, false);

    adminAttCurrentPage = 1;
    applyAdminAttendanceFilter();
}

function applyAdminAttendanceFilter() {
    var fromDate = document.getElementById('att-from').value;
    var toDate = document.getElementById('att-to').value;
    var scopeIds = msGetValues('att-ms-scope');
    var itemIds = msGetValues('att-ms-item');
    var empIds = msGetValues('att-ms-emp');
    if (!fromDate || !toDate) return;

    var filtered = DB.attendance.filter(function(a) { return a.date >= fromDate && a.date <= toDate; });

    /* Filter by selected scope(s) */
    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return scopeItemIds.indexOf(a.projectId) !== -1; });
    }

    /* Filter by selected item(s) */
    if (itemIds.length > 0) {
        filtered = filtered.filter(function(a) { return itemIds.indexOf(a.projectId) !== -1; });
    }

    /* Filter by selected employee(s) */
    if (empIds.length > 0) {
        filtered = filtered.filter(function(a) { return empIds.indexOf(a.memberId) !== -1; });
    }

    filtered = filtered.sort(function(a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
    adminAttFilteredData = filtered;

    /* Stats */
    var totalMs = filtered.reduce(function(s, r) {
        if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn));
        return s;
    }, 0);
    var totalCost = filtered.reduce(function(s, r) {
        if (r.clockIn && r.clockOut) { var c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);
    var uniqueEmps = [].concat.apply([], [filtered.map(function(r) { return r.memberId; })]);
    uniqueEmps = uniqueEmps.filter(function(v, i, a) { return a.indexOf(v) === i; }).length;
    var uniqueProjects = filtered.map(function(r) { return r.projectId; }).filter(Boolean);
    uniqueProjects = uniqueProjects.filter(function(v, i, a) { return a.indexOf(v) === i; }).length;

    document.getElementById('att-stats').innerHTML =
        '<div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">' + filtered.length + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Employees</div><div class="stat-value">' + uniqueEmps + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Items</div><div class="stat-value">' + uniqueProjects + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Hours</div><div class="stat-value">' + formatDuration(totalMs) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Cost</div><div class="stat-value">' + fmtCost(totalCost) + '</div></div>';

    var totalPages = Math.ceil(filtered.length / adminAttPageSize) || 1;
    if (adminAttCurrentPage > totalPages) adminAttCurrentPage = totalPages;
    if (adminAttCurrentPage < 1) adminAttCurrentPage = 1;

    renderAdminAttPage();
}

/* ── Everything below is UNCHANGED from your original ── */

function renderAdminAttPage() {
    var filtered = adminAttFilteredData;
    var totalPages = Math.ceil(filtered.length / adminAttPageSize) || 1;
    var startIdx = (adminAttCurrentPage - 1) * adminAttPageSize;
    var endIdx = startIdx + adminAttPageSize;
    var pageData = filtered.slice(startIdx, endIdx);

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No attendance records found</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            var emp = DB.members.find(function(m) { return m.id === r.memberId; });
            var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
            var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
            var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            var startParts = r.clockIn ? r.clockIn.split('T') : [];
            var endParts = r.clockOut ? r.clockOut.split('T') : [];
            var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '—';
            var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '—';
            var subScopeName = r.subScopeId ? getSubScopeName(r.subScopeId) : '';
            var detailName = r.detailId ? getDetailName(r.detailId) : '';
            var itemDisplay = '—';
            if (proj) {
                itemDisplay = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            }
            return '<tr>' +
                '<td style="font-family:var(--font-m)">' + r.date + '</td>' +
                '<td>' + (emp ? esc(emp.name) : '?') + '</td>' +
                '<td>' + itemDisplay + '</td>' +
                '<td>' + (subScopeName ? esc(subScopeName) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + (detailName ? esc(detailName) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.description || '') + '">' + (r.description ? esc(r.description) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td style="font-family:var(--font-m)">' + startTime + '</td>' +
                '<td style="font-family:var(--font-m)">' + endTime + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + dur + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showAdminEditAttendance(' + r.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteAttendance(' + r.id + ')" title="Delete">&#10005;</button>' +
                '</div></td></tr>';
        }).join('');
    }

    var paginationHtml = '';
    if (filtered.length > 0) {
        var showFrom = startIdx + 1;
        var showTo = Math.min(endIdx, filtered.length);
        var pageButtons = '';
        var maxVisible = 5;
        var startPage = Math.max(1, adminAttCurrentPage - Math.floor(maxVisible / 2));
        var endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goAdminAttPage(1)" ' + (adminAttCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goAdminAttPage(' + (adminAttCurrentPage - 1) + ')" ' + (adminAttCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goAdminAttPage(' + p + ')" class="' + (p === adminAttCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goAdminAttPage(' + (adminAttCurrentPage + 1) + ')" ' + (adminAttCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goAdminAttPage(' + totalPages + ')" ' + (adminAttCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + filtered.length + ' entries</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeAdminAttPageSize(this.value)">' +
                        '<option value="10"' + (adminAttPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (adminAttPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (adminAttPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (adminAttPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('admin-att-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Date</th><th>Employee</th><th>Scope &rarr; Item</th><th>Sub Scope</th><th>Detail</th><th>Description</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
        paginationHtml;
}

function goAdminAttPage(page) {
    var totalPages = Math.ceil(adminAttFilteredData.length / adminAttPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    adminAttCurrentPage = page;
    renderAdminAttPage();
}

function changeAdminAttPageSize(size) {
    adminAttPageSize = parseInt(size);
    adminAttCurrentPage = 1;
    renderAdminAttPage();
}

function showAdminAddAttendance() {
    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        DB.scopes.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
    var memberOpts = '<option value="">-- Select Employee --</option>' +
        DB.members.map(function(m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');

    showModal(
    '<h3>Add Attendance</h3>' +
    '<div class="field"><label>Employee</label><select class="input" id="att-member">' + memberOpts + '</select></div>' +
    '<div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="' + todayStr() + '"></div>' +
    '<div class="field"><label>Scope</label><select class="input" id="att-scope-filter" onchange="adminAttItemChanged()">' + scopeOptions + '</select></div>' +
    '<div class="field"><label>Item</label><select class="input" id="att-item"><option value="">-- Select Item --</option></select></div>' +
    '<div class="field"><label>Sub Scope</label><select class="input" id="att-subscope">' + subScopeOpts(null) + '</select></div>' +
    '<div class="field"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(null) + '</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="09:00"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="17:00"></div>' +
    '</div>' +
    '<div class="field"><label>Description</label><textarea class="input" id="att-desc" rows="3" placeholder="Description" style="resize:vertical"></textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminAddAttendance()">Save</button></div>');
    setTimeout(function() { var el = document.getElementById('att-member'); if (el) el.focus(); }, 100);
}

function adminAttItemChanged() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var itemSelect = document.getElementById('att-item');
    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;
    itemSelect.innerHTML = '<option value="">-- Select Item --</option>' +
        filtered.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
}

async function doAdminAddAttendance() {
    var errEl = document.getElementById('att-error');
    var memberId = document.getElementById('att-member').value;
    var date = document.getElementById('att-date').value;
    var itemId = document.getElementById('att-item').value;
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var start = document.getElementById('att-start').value;
    var end = document.getElementById('att-end').value;
    var desc = document.getElementById('att-desc').value.trim();

    errEl.textContent = '';
    if (!memberId) { errEl.textContent = 'Please select an employee'; return; }
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!itemId) { errEl.textContent = 'Please select an item'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var clockIn = date + 'T' + start + ':00';
    var clockOut = date + 'T' + end + ':00';

    try {
        await api('/attendance', {
            method: 'POST',
            body: {
                memberId: parseInt(memberId),
                date: date, clockIn: clockIn, clockOut: clockOut,
                projectId: parseInt(itemId),
                scopeId: null,
                subScopeId: subScopeId ? parseInt(subScopeId) : null,
                detailId: detailId ? parseInt(detailId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderAdminAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showAdminEditAttendance(id) {
    var entry = DB.attendance.find(function(a) { return a.id === id; });
    if (!entry) return;

    var proj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var currentScopeId = proj && proj.categoryId ? proj.categoryId : '';

    var scopeOptions = '<option value="">-- Select Scope --</option>' +
        DB.scopes.map(function(s) {
            var sel = currentScopeId === s.id ? 'selected' : '';
            return '<option value="' + s.id + '" ' + sel + '>' + esc(s.name) + '</option>';
        }).join('');

    var scopeItems = currentScopeId
        ? DB.projects.filter(function(p) { return p.categoryId === currentScopeId; })
        : DB.projects;
    var itemOpts = scopeItems.map(function(p) {
        var sel = entry.projectId === p.id ? 'selected' : '';
        return '<option value="' + p.id + '" ' + sel + '>' + esc(p.name) + '</option>';
    }).join('');

    var startParts = entry.clockIn ? entry.clockIn.split('T') : [];
    var endParts = entry.clockOut ? entry.clockOut.split('T') : [];
    var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
    var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';

    showModal(
    '<h3>Edit Attendance</h3>' +
    '<div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="' + entry.date + '"></div>' +
    '<div class="field"><label>Scope</label><select class="input" id="att-scope-filter" onchange="adminAttItemChangedEdit()">' + scopeOptions + '</select></div>' +
    '<div class="field"><label>Item</label><select class="input" id="att-item"><option value="">-- Select Item --</option>' + itemOpts + '</select></div>' +
    '<div class="field"><label>Sub Scope</label><select class="input" id="att-subscope">' + subScopeOpts(entry.subScopeId) + '</select></div>' +
    '<div class="field"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(entry.detailId) + '</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="' + startTime + '"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="' + endTime + '"></div>' +
    '</div>' +
    '<div class="field"><label>Description</label><textarea class="input" id="att-desc" rows="3" style="resize:vertical">' + esc(entry.description || '') + '</textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminEditAttendance(' + id + ')">Save</button></div>');
}

function adminAttItemChangedEdit() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var itemSelect = document.getElementById('att-item');
    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;
    itemSelect.innerHTML = '<option value="">-- Select Item --</option>' +
        filtered.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
}

async function doAdminEditAttendance(id) {
    var errEl = document.getElementById('att-error');
    var date = document.getElementById('att-date').value;
    var itemId = document.getElementById('att-item').value;
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var start = document.getElementById('att-start').value;
    var end = document.getElementById('att-end').value;
    var desc = document.getElementById('att-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!itemId) { errEl.textContent = 'Please select an item'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var clockIn = date + 'T' + start + ':00';
    var clockOut = date + 'T' + end + ':00';

    try {
        await api('/attendance/' + id, {
            method: 'PUT',
            body: {
                date: date, clockIn: clockIn, clockOut: clockOut,
                projectId: parseInt(itemId),
                scopeId: null,
                subScopeId: subScopeId ? parseInt(subScopeId) : null,
                detailId: detailId ? parseInt(detailId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderAdminAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

async function confirmDeleteAttendance(id) {
    var entry = DB.attendance.find(function(a) { return a.id === id; });
    if (!entry) return;
    var emp = DB.members.find(function(m) { return m.id === entry.memberId; });
    var proj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
    var label = proj ? (scope ? scope.name + ' → ' + proj.name : proj.name) : '—';

    showModal('<h3>Delete Attendance</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete entry for <strong style="color:var(--main-text)">' + esc(emp ? emp.name : '?') + '</strong> on <strong style="color:var(--main-text)">' + entry.date + '</strong>?<br>Item: ' + esc(label) + '</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteAttendance(' + id + ')">Delete</button></div>');
}

async function doDeleteAttendance(id) {
    try {
        await api('/attendance/' + id, { method: 'DELETE' });
        hideModal(); await loadDB(); renderAdminAttendance();
    } catch (e) { alert('Failed: ' + e.message); }
}

function exportAttendanceCSV() {
    var data = adminAttFilteredData;
    if (data.length === 0) { alert('No data to export'); return; }

    var headers = ['Date', 'Employee', 'Scope', 'Item', 'Sub Scope', 'Detail', 'Start', 'End', 'Duration', 'Description'];
    var rows = data.map(function(r) {
        var emp = DB.members.find(function(m) { return m.id === r.memberId; });
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '';
        var startParts = r.clockIn ? r.clockIn.split('T') : [];
        var endParts = r.clockOut ? r.clockOut.split('T') : [];
        var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
        var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';
        var scopeName = scope ? scope.name : '';
        var itemName = proj ? proj.name : '';
        var subScopeName = r.subScopeId ? getSubScopeName(r.subScopeId) : '';
        var detailName = r.detailId ? getDetailName(r.detailId) : '';

        return [r.date, emp ? emp.name : '', scopeName, itemName, subScopeName, detailName, startTime, endTime, dur, r.description || ''];
    });

    var csv = headers.join(',') + '\n';
    rows.forEach(function(row) {
        csv += row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}




/* ==========================================================
   SECTION 14: ADMIN — SUB SCOPES
   ========================================================== */

function renderAdminSubScopes() {
    const view = document.getElementById('admin-subscopes');
    let rows = '';
    if (DB.subScopes.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No sub scopes yet</td></tr>';
    } else {
        rows = DB.subScopes.map((s, index) =>
            '<tr>' +
                '<td style="font-family:var(--font-m);width:60px">' + (index + 1) + '</td>' +
                '<td>' + esc(s.name) + '</td>' +
                '<td style="color:var(--main-text3);font-size:.82rem">' + (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—') + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditSubScope(' + s.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteSubScope(' + s.id + ')" title="Delete">&#10005;</button>' +
                '</div></td>' +
            '</tr>'
        ).join('');
    }


    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Sub Scopes</h2>' +
            '<div class="header-sub">Manage sub scope categories</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div class="section-head">' +
                '<h2>All Sub Scopes <span style="color:var(--main-text3);font-weight:400;font-size:.85rem">(' + DB.subScopes.length + ')</span></h2>' +
                '<button class="btn btn-green" onclick="showAddSubScope()">+ Add Sub Scope</button>' +
            '</div>' +
            '<div class="table-wrap"><table>' +
                '<thead><tr>' +
                    '<th style="width:60px">No</th>' +
                    '<th>Name</th>' +
                    '<th style="width:140px">Created</th>' +
                    '<th style="width:90px">Actions</th>' +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table></div>' +
        '</div>';
}

function showAddSubScope() {
    showModal('<h3>Add Sub Scope</h3>' +
        '<div class="field"><label>Name</label><input class="input" id="subscope-name" placeholder="Enter sub scope name"></div>' +
        '<p class="auth-error" id="subscope-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddSubScope()">Save</button></div>');
    setTimeout(function() { document.getElementById('subscope-name').focus(); }, 100);
}

async function doAddSubScope() {
    var errEl = document.getElementById('subscope-error');
    var name = document.getElementById('subscope-name').value.trim();
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/subscopes', { method: 'POST', body: { name: name } });
        hideModal(); await loadDB(); renderAdminSubScopes();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditSubScope(id) {
    var item = DB.subScopes.find(s => s.id === id);
    if (!item) return;
    showModal('<h3>Edit Sub Scope</h3>' +
        '<div class="field"><label>Name</label><input class="input" id="subscope-name" value="' + esc(item.name) + '"></div>' +
        '<p class="auth-error" id="subscope-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditSubScope(' + id + ')">Save</button></div>');
    setTimeout(function() { document.getElementById('subscope-name').focus(); }, 100);
}

async function doEditSubScope(id) {
    var errEl = document.getElementById('subscope-error');
    var name = document.getElementById('subscope-name').value.trim();
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/subscopes/' + id, { method: 'PUT', body: { name: name } });
        hideModal(); await loadDB(); renderAdminSubScopes();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteSubScope(id) {
    var item = DB.subScopes.find(s => s.id === id);
    if (!item) return;
    showModal('<h3>Delete Sub Scope</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(item.name) + '</strong>?</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteSubScope(' + id + ')">Delete</button></div>');
}

async function doDeleteSubScope(id) {
    try {
        await api('/subscopes/' + id, { method: 'DELETE' });
        hideModal(); await loadDB(); renderAdminSubScopes();
    } catch (e) { alert('Failed: ' + e.message); }
}


/* ==========================================================
   SECTION 15: ADMIN — DETAILS
   ========================================================== */

function renderAdminDetails() {
    const view = document.getElementById('admin-details');
    let rows = '';
    if (DB.details.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No details yet</td></tr>';
    } else {
        rows = DB.details.map((d, index) =>
            '<tr>' +
                '<td style="font-family:var(--font-m);width:60px">' + (index + 1) + '</td>' +
                '<td>' + esc(d.name) + '</td>' +
                '<td style="color:var(--main-text3);font-size:.82rem">' + (d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—') + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditDetail(' + d.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteDetail(' + d.id + ')" title="Delete">&#10005;</button>' +
                '</div></td>' +
            '</tr>'
        ).join('');

    }

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Details</h2>' +
            '<div class="header-sub">Manage detail categories</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div class="section-head">' +
                '<h2>All Details <span style="color:var(--main-text3);font-weight:400;font-size:.85rem">(' + DB.details.length + ')</span></h2>' +
                '<button class="btn btn-green" onclick="showAddDetail()">+ Add Detail</button>' +
            '</div>' +
            '<div class="table-wrap"><table>' +
                '<thead><tr>' +
                    '<th style="width:60px">No</th>' +
                    '<th>Name</th>' +
                    '<th style="width:140px">Created</th>' +
                    '<th style="width:90px">Actions</th>' +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table></div>' +
        '</div>';
}

function showAddDetail() {
    showModal('<h3>Add Detail</h3>' +
        '<div class="field"><label>Name</label><input class="input" id="detail-name" placeholder="Enter detail name"></div>' +
        '<p class="auth-error" id="detail-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddDetail()">Save</button></div>');
    setTimeout(function() { document.getElementById('detail-name').focus(); }, 100);
}

async function doAddDetail() {
    var errEl = document.getElementById('detail-error');
    var name = document.getElementById('detail-name').value.trim();
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/details', { method: 'POST', body: { name: name } });
        hideModal(); await loadDB(); renderAdminDetails();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditDetail(id) {
    var item = DB.details.find(d => d.id === id);
    if (!item) return;
    showModal('<h3>Edit Detail</h3>' +
        '<div class="field"><label>Name</label><input class="input" id="detail-name" value="' + esc(item.name) + '"></div>' +
        '<p class="auth-error" id="detail-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditDetail(' + id + ')">Save</button></div>');
    setTimeout(function() { document.getElementById('detail-name').focus(); }, 100);
}

async function doEditDetail(id) {
    var errEl = document.getElementById('detail-error');
    var name = document.getElementById('detail-name').value.trim();
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/details/' + id, { method: 'PUT', body: { name: name } });
        hideModal(); await loadDB(); renderAdminDetails();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteDetail(id) {
    var item = DB.details.find(d => d.id === id);
    if (!item) return;
    showModal('<h3>Delete Detail</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(item.name) + '</strong>?</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteDetail(' + id + ')">Delete</button></div>');
}

async function doDeleteDetail(id) {
    try {
        await api('/details/' + id, { method: 'DELETE' });
        hideModal(); await loadDB(); renderAdminDetails();
    } catch (e) { alert('Failed: ' + e.message); }
}


// /* ==========================================================
//    SECTION 16: ADMIN — SCOPES
//    ========================================================== */

// function renderAdminScopes() {
//     const view = document.getElementById('admin-scopes');
//     let rows = '';
//     if (DB.scopes.length === 0) {
//         rows = '<tr><td colspan="3" style="text-align:center;color:var(--main-text3);padding:30px">No scopes yet</td></tr>';
//     } else {
//         rows = DB.scopes.map((s, index) =>
//             '<tr>' +
//                 '<td style="font-family:var(--font-m);width:60px">' + (index + 1) + '</td>' +
//                 '<td>' + esc(s.name) + '</td>' +
//                 '<td><div class="actions-cell">' +
//                     '<button class="btn-icon" onclick="showEditScope(' + s.id + ')" title="Edit">&#9998;</button>' +
//                     '<button class="btn-icon danger" onclick="confirmDeleteScope(' + s.id + ')" title="Delete">&#10005;</button>' +
//                 '</div></td>' +
//             '</tr>'
//         ).join('');

//     }

//     view.innerHTML =
//         '<div class="app-header">' +
//             '<h2>Scopes</h2>' +
//             '<div class="header-sub">Manage scope categories</div>' +
//         '</div>' +
//         '<div class="app-body">' +
//             '<div class="section-head">' +
//                 '<h2>All Scopes <span style="color:var(--main-text3);font-weight:400;font-size:.85rem">(' + DB.scopes.length + ')</span></h2>' +
//                 '<button class="btn btn-green" onclick="showAddScope()">+ Add Scope</button>' +
//             '</div>' +
//             '<div class="table-wrap"><table>' +
//                 '<thead><tr>' +
//                     '<th style="width:60px">No</th>' +
//                     '<th>Name</th>' +
//                     '<th style="width:90px">Actions</th>' +
//                 '</tr></thead>' +
//                 '<tbody>' + rows + '</tbody>' +
//             '</table></div>' +
//         '</div>';
// }

// function showAddScope() {
//     showModal('<h3>Add Scope</h3>' +
//         '<div class="field"><label>Name</label><input class="input" id="scope-name" placeholder="Enter scope name"></div>' +
//         '<p class="auth-error" id="scope-error"></p>' +
//         '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddScope()">Save</button></div>');
//     setTimeout(function() { document.getElementById('scope-name').focus(); }, 100);
// }

// async function doAddScope() {
//     var errEl = document.getElementById('scope-error');
//     var name = document.getElementById('scope-name').value.trim();
//     errEl.textContent = '';
//     if (!name) { errEl.textContent = 'Name is required'; return; }
//     try {
//         await api('/scopes', { method: 'POST', body: { name: name } });
//         hideModal(); await loadDB(); renderAdminScopes();
//     } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
// }

// function showEditScope(id) {
//     var item = DB.scopes.find(s => s.id === id);
//     if (!item) return;
//     showModal('<h3>Edit Scope</h3>' +
//         '<div class="field"><label>Name</label><input class="input" id="scope-name" value="' + esc(item.name) + '"></div>' +
//         '<p class="auth-error" id="scope-error"></p>' +
//         '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditScope(' + id + ')">Save</button></div>');
//     setTimeout(function() { document.getElementById('scope-name').focus(); }, 100);
// }

// async function doEditScope(id) {
//     var errEl = document.getElementById('scope-error');
//     var name = document.getElementById('scope-name').value.trim();
//     errEl.textContent = '';
//     if (!name) { errEl.textContent = 'Name is required'; return; }
//     try {
//         await api('/scopes/' + id, { method: 'PUT', body: { name: name } });
//         hideModal(); await loadDB(); renderAdminScopes();
//     } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
// }

// function confirmDeleteScope(id) {
//     var item = DB.scopes.find(s => s.id === id);
//     if (!item) return;
//     showModal('<h3>Delete Scope</h3>' +
//         '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(item.name) + '</strong>?</p>' +
//         '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteScope(' + id + ')">Delete</button></div>');
// }

// async function doDeleteScope(id) {
//     try {
//         await api('/scopes/' + id, { method: 'DELETE' });
//         hideModal(); await loadDB(); renderAdminScopes();
//     } catch (e) { alert('Failed: ' + e.message); }
// }


/* ==========================================================
   SECTION 18: ADMIN — Report (scope → item)
   ========================================================== */

function renderAdminReport() {
    var view = document.getElementById('admin-report');
    var today = todayStr();
    var defaultMonth = today.substring(0, 7);
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    var defaultFrom = sixMonthsAgo.toISOString().slice(0, 7);

    var scopeFilterOpts = DB.scopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Report</h2>' +
            '<div class="header-sub">Summary and analytics</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>' +
                '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="month" class="input" id="rpt-from" value="' + defaultFrom + '" style="width:160px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="month" class="input" id="rpt-to" value="' + defaultMonth + '" style="width:160px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Scope</label><select class="input" id="rpt-scope" onchange="rptScopeChanged()" style="width:140px;padding:8px 10px;font-size:.82rem"><option value="">All Scopes</option>' + scopeFilterOpts + '</select></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Item</label><select class="input" id="rpt-item" style="width:160px;padding:8px 10px;font-size:.82rem"><option value="">All Items</option></select></div>' +
                    '<div style="display:flex;gap:8px;margin-left:auto">' +
                        '<button class="btn btn-accent btn-sm" onclick="generateReport()">Generate</button>' +
                        '<button class="btn btn-ghost btn-sm" onclick="resetReport()">Reset</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="rpt-stats"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px" id="rpt-charts-row1"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px" id="rpt-charts-row2"></div>' +
            '<div id="rpt-tables"></div>' +
        '</div>';

    generateReport();
}

function rptScopeChanged() {
    var scopeId = document.getElementById('rpt-scope').value;
    var itemSelect = document.getElementById('rpt-item');
    var filtered = scopeId
        ? DB.projects.filter(p => p.categoryId === parseInt(scopeId))
        : DB.projects;
    itemSelect.innerHTML = '<option value="">All Items</option>' +
        filtered.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
}

function resetReport() {
    var today = todayStr();
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    document.getElementById('rpt-from').value = sixMonthsAgo.toISOString().slice(0, 7);
    document.getElementById('rpt-to').value = today.substring(0, 7);
    document.getElementById('rpt-scope').value = '';
    document.getElementById('rpt-item').innerHTML = '<option value="">All Items</option>';
    generateReport();
}

function generateReport() {
    var fromMonth = document.getElementById('rpt-from').value;
    var toMonth = document.getElementById('rpt-to').value;
    var scopeId = document.getElementById('rpt-scope') ? document.getElementById('rpt-scope').value : '';
    var itemId = document.getElementById('rpt-item') ? document.getElementById('rpt-item').value : '';
    if (!fromMonth || !toMonth) return;

    // Filter attendance by month range
    var filtered = DB.attendance.filter(function(a) {
        var m = a.date ? a.date.substring(0, 7) : '';
        return m >= fromMonth && m <= toMonth;
    });

    // Filter by scope
    if (scopeId) {
        var scopeItemIds = DB.projects.filter(p => p.categoryId === parseInt(scopeId)).map(p => p.id);
        filtered = filtered.filter(a => scopeItemIds.includes(a.projectId));
    }

    // Filter by item
    if (itemId) {
        filtered = filtered.filter(a => a.projectId === parseInt(itemId));
    }

    // ===== STATS =====
    var totalHours = 0, totalCost = 0;
    filtered.forEach(function(r) {
        if (r.clockIn && r.clockOut) {
            var ms = new Date(r.clockOut) - new Date(r.clockIn);
            totalHours += ms;
            totalCost += (getEntryCost(r.memberId, ms) || 0);
        }
    });
    var uniqueEmployees = new Set(filtered.map(function(a) { return a.memberId; })).size;
    var uniqueItems = new Set(filtered.filter(function(a) { return a.projectId; }).map(function(a) { return a.projectId; })).size;
    var uniqueScopes = new Set(filtered.filter(function(a) { return a.projectId; }).map(function(a) {
        var proj = DB.projects.find(p => p.id === a.projectId);
        return proj && proj.categoryId ? proj.categoryId : 0;
    })).size;

    document.getElementById('rpt-stats').innerHTML =
        '<div class="stats-grid" style="margin-bottom:24px">' +
            '<div class="stat-card"><div class="stat-label">Total Records</div><div class="stat-value">' + filtered.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">' + formatDuration(totalHours) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Total Cost</div><div class="stat-value">' + fmtCost(totalCost) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active Employees</div><div class="stat-value">' + uniqueEmployees + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active Scopes</div><div class="stat-value">' + uniqueScopes + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active Items</div><div class="stat-value">' + uniqueItems + '</div></div>' +
        '</div>';

    // ===== CHART 1: Cost by Scope → Item (Bar) =====
    var itemCosts = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        var pid = r.projectId || 0;
        if (!itemCosts[pid]) itemCosts[pid] = 0;
        itemCosts[pid] += cost;
    });
    var itemLabels = [], itemData = [], itemColors = [];
    var palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
    Object.entries(itemCosts).forEach(function(entry, i) {
        var pid = parseInt(entry[0]);
        var cost = entry[1];
        var proj = pid === 0 ? null : DB.projects.find(function(p) { return p.id === pid; });
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var label = proj ? (scope ? scope.name + ' → ' + proj.name : proj.name) : 'Unassigned';
        itemLabels.push(label);
        itemData.push(Math.round(cost * 100) / 100);
        itemColors.push(palette[i % palette.length]);
    });

    // ===== CHART 2: Cost by Scope (Pie) =====
    var scopeCosts = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        // Get scope from item's categoryId instead of attendance's scopeId
        var proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        var sid = proj && proj.categoryId ? proj.categoryId : 0;
        if (!scopeCosts[sid]) scopeCosts[sid] = 0;
        scopeCosts[sid] += cost;
    });
    var scopeLabels = [], scopeData = [], scopeColors = [];
    Object.entries(scopeCosts).forEach(function(entry, i) {
        var sid = parseInt(entry[0]);
        var cost = entry[1];
        var scope = sid === 0 ? null : DB.scopes.find(function(s) { return s.id === sid; });
        scopeLabels.push(scope ? scope.name : 'Uncategorized');
        scopeData.push(Math.round(cost * 100) / 100);
        scopeColors.push(palette[i % palette.length]);
    });

    document.getElementById('rpt-charts-row1').innerHTML =
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Scope &rarr; Item</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-item-cost"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Scope</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-scope-cost"></canvas></div>' +
        '</div>';

    // ===== CHART 3: Monthly Hours Trend (Bar) =====
    var monthlyHours = {};
    var monthlyCost = {};
    DB.attendance.forEach(function(r) {
        if (!r.clockIn || !r.clockOut || !r.date) return;
        var m = r.date.substring(0, 7);
        if (m < fromMonth || m > toMonth) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        if (!monthlyHours[m]) { monthlyHours[m] = 0; monthlyCost[m] = 0; }
        monthlyHours[m] += ms;
        monthlyCost[m] += cost;
    });
    var monthLabels = Object.keys(monthlyHours).sort();
    var monthHoursData = monthLabels.map(function(m) { return Math.round(monthlyHours[m] / (1000 * 60 * 60) * 10) / 10; });
    var monthCostData = monthLabels.map(function(m) { return Math.round(monthlyCost[m] * 100) / 100; });
    var prettyMonths = monthLabels.map(function(m) { var parts = m.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(parts[1])-1] + ' ' + parts[0].substring(2); });

    // ===== CHART 4: Employee Hours (Horizontal Bar) =====
    var empHours = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        if (!empHours[r.memberId]) empHours[r.memberId] = 0;
        empHours[r.memberId] += ms;
    });
    var empSorted = Object.entries(empHours).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
    var empLabels = empSorted.map(function(e) {
        var m = DB.members.find(function(x) { return x.id === parseInt(e[0]); });
        return m ? m.name : 'Unknown';
    });
    var empData = empSorted.map(function(e) { return Math.round(e[1] / (1000 * 60 * 60) * 10) / 10; });

    document.getElementById('rpt-charts-row2').innerHTML =
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Monthly Trend</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-monthly"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Top Employees by Hours</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-emp-hours"></canvas></div>' +
        '</div>';

    // ===== TABLES =====
    // Item summary table (grouped by scope → item)
    var itemSummaryRows = '';
    Object.entries(itemCosts).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(entry) {
        var pid = parseInt(entry[0]);
        var cost = entry[1];
        var proj = pid === 0 ? null : DB.projects.find(function(p) { return p.id === pid; });
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var label = proj ? (scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name)) : '<span style="color:var(--main-text3)">Unassigned</span>';
        var hours = filtered.filter(function(r) { return (r.projectId || 0) === pid && r.clockIn && r.clockOut; }).reduce(function(s, r) { return s + (new Date(r.clockOut) - new Date(r.clockIn)); }, 0);
        var entries = filtered.filter(function(r) { return (r.projectId || 0) === pid; }).length;
        var members = new Set(filtered.filter(function(r) { return (r.projectId || 0) === pid; }).map(function(r) { return r.memberId; })).size;
        var cd = proj ? getProjectCountdown(proj) : null;
        var cdHtml = '—';
        if (cd !== null) {
            if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">' + cd + 'd left</span>';
            else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Today!</span>';
            else cdHtml = '<span style="color:var(--danger);font-weight:600">' + Math.abs(cd) + 'd overdue</span>';
        }
        itemSummaryRows += '<tr><td>' + label + '</td>' +
            '<td>' + cdHtml + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + members + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + entries + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(hours) + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(cost) + '</td></tr>';
    });

    // Employee summary table
    var empSummaryRows = '';
    var empStats = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        if (!empStats[r.memberId]) empStats[r.memberId] = { ms: 0, cost: 0, entries: 0, days: new Set() };
        empStats[r.memberId].ms += ms;
        empStats[r.memberId].cost += cost;
        empStats[r.memberId].entries++;
        empStats[r.memberId].days.add(r.date);
    });
    Object.entries(empStats).sort(function(a, b) { return b[1].ms - a[1].ms; }).forEach(function(entry) {
        var mid = parseInt(entry[0]);
        var data = entry[1];
        var member = DB.members.find(function(m) { return m.id === mid; });
        empSummaryRows += '<tr><td>' + (member ? esc(member.name) : 'Unknown') + '</td>' +
            '<td>' + (member ? esc(getPositionName(member.positionId)) : '—') + '</td>' +
            '<td>' + (member ? esc(getDeptName(member.departmentId)) : '—') + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + data.entries + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + data.days.size + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(data.ms) + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(data.cost) + '</td>' +
            '<td style="text-align:right;font-family:var(--font-m)">' + fmtHourlyRate(member) + '</td></tr>';
    });

    document.getElementById('rpt-tables').innerHTML =
        '<div class="section-head" style="margin-top:8px"><h2>Item Summary</h2></div>' +
        '<div class="table-wrap" style="margin-bottom:32px"><table>' +
            '<thead><tr><th>Scope &rarr; Item</th><th>Countdown</th><th style="text-align:right">Members</th><th style="text-align:right">Entries</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
            '<tbody>' + itemSummaryRows + '</tbody>' +
        '</table></div>' +
        '<div class="section-head"><h2>Employee Summary</h2></div>' +
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Employee</th><th>Position</th><th>Department</th><th style="text-align:right">Entries</th><th style="text-align:right">Days</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th><th style="text-align:right">Rate</th></tr></thead>' +
            '<tbody>' + empSummaryRows + '</tbody>' +
        '</table></div>';

    // ===== RENDER CHARTS =====
    var chartTextColor = '#7a7570';
    var chartGridColor = 'rgba(122,117,112,0.15)';

    // Chart 1: Cost by Scope → Item (Bar)
    new Chart(document.getElementById('chart-item-cost'), {
        type: 'bar',
        data: {
            labels: itemLabels,
            datasets: [{ label: 'Cost (RM)', data: itemData, backgroundColor: itemColors, borderRadius: 6, maxBarThickness: 50 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return 'RM' + v; } }, grid: { color: chartGridColor } },
                x: { ticks: { color: chartTextColor, maxRotation: 45, font: { size: 10 } }, grid: { display: false } }
            }
        }
    });

    // Chart 2: Cost by Scope (Doughnut)
    new Chart(document.getElementById('chart-scope-cost'), {
        type: 'doughnut',
        data: {
            labels: scopeLabels,
            datasets: [{ data: scopeData, backgroundColor: scopeColors, borderWidth: 0, hoverOffset: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: chartTextColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': RM' + ctx.parsed.toFixed(2); } } }
            }
        }
    });

    // Chart 3: Monthly Trend (Bar with dual axis)
    new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: {
            labels: prettyMonths,
            datasets: [
                { label: 'Hours', data: monthHoursData, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
                { label: 'Cost (RM)', data: monthCostData, type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 4, pointBackgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y1', fill: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: chartTextColor, usePointStyle: true, padding: 16 } } },
            scales: {
                y: { beginAtZero: true, position: 'left', ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } },
                y1: { beginAtZero: true, position: 'right', ticks: { color: '#ef4444', callback: function(v) { return 'RM' + v; } }, grid: { drawOnChartArea: false } },
                x: { ticks: { color: chartTextColor }, grid: { display: false } }
            }
        }
    });

    // Chart 4: Employee Hours (Horizontal Bar)
    new Chart(document.getElementById('chart-emp-hours'), {
        type: 'bar',
        data: {
            labels: empLabels,
            datasets: [{ label: 'Hours', data: empData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, maxBarThickness: 30 }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } },
                y: { ticks: { color: chartTextColor, font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}




/* ==========================================================
   Pre-load data on page load
   ========================================================== */

// Pre-load data on page load
(async function(){
    const saved = localStorage.getItem('multitrade_session');

    function activateNav(navId, page) {
        document.querySelectorAll('#' + navId + ' .nav-item').forEach(function(n) {
            n.classList.toggle('active', n.dataset.page === page);
        });
    }

    function showLogin() {
        document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('login-page').classList.add('active');
    }

    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            await loadDB();
            document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });

            if (currentUser.role === 'admin') {
                var page = localStorage.getItem('multitrade_admin_page') || 'projects';
                document.getElementById('admin-layout').classList.add('active');
                activateNav('admin-nav', page);
                await adminNav(page);
            } else {
                var page = localStorage.getItem('multitrade_emp_page') || 'myprojects';
                document.getElementById('employee-layout').classList.add('active');
                activateNav('emp-nav', page);
                await empNav(page);
            }

            updateAvatars();
            return;
        } catch (e) {
            localStorage.removeItem('multitrade_session');
            localStorage.removeItem('multitrade_admin_page');
            localStorage.removeItem('multitrade_emp_page');
        }
    }

    showLogin();
})();
