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
    attendance: [],
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
        console.error('Failed to load core data:', e);
    }

    // worklist 单独加载，失败不影响其他页面
    try {
        DB.worklist = await api('/worklist');
    } catch (e) {
        console.error('Worklist failed:', e);
        DB.worklist = [];
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
        case 'worklist': renderWorkList(); break;
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
   SECTION 6: MAIN SCOPE (tabs = category, table = items)
   ========================================================== */

var activeCategoryId = null;
var itemSearchQuery = '';

function getProjectCountdown(project) {
    if (!project.endDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(project.endDate); end.setHours(0, 0, 0, 0);
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
}

function getProjectDuration(project) {
    if (!project.startDate || !project.endDate) return null;
    const start = new Date(project.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(project.endDate); end.setHours(0, 0, 0, 0);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

//toggle edit delete on category
function toggleCatMenu() {
    var dd = document.getElementById('cat-dropdown');
    if (!dd) return;
    var isOpen = dd.style.display === 'flex';
    dd.style.display = isOpen ? 'none' : 'flex';
}

function closeCatMenu() {
    var dd = document.getElementById('cat-dropdown');
    if (dd) dd.style.display = 'none';
}

document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.cat-dropdown') && !e.target.closest('.tab-more-btn')) {
        closeCatMenu();
    }
});
function renderMainScope() {
    const view = document.getElementById('admin-projects');

    // All tab
    const allCount = DB.projects.length;
    const allTab = '<div class="tab-item' + (!activeCategoryId ? ' active' : '') + '" onclick="switchScopeTab(null)">All <span class="tab-count">' + allCount + '</span></div>';

    // Category tabs
    const tabs = DB.scopes.map(function(s) {
        const count = DB.projects.filter(function(p) { return p.categoryId === s.id; }).length;
        return '<div class="tab-item' + (activeCategoryId === s.id ? ' active' : '') + '" onclick="switchScopeTab(' + s.id + ')">' + esc(s.name) + ' <span class="tab-count">' + count + '</span></div>';
    }).join('');

    // 三点按钮
    const activeScope = activeCategoryId ? DB.scopes.find(function(s) { return s.id === activeCategoryId; }) : null;
    var dotsHtml = activeScope
        ? '<div style="position:relative;display:inline-flex;align-items:center">' +
            '<button class="tab-more-btn" onclick="event.stopPropagation();toggleCatMenu()">&#8942;</button>' +
            '<div id="cat-dropdown" class="cat-dropdown">' +
              '<div class="cat-dropdown-item" onclick="closeCatMenu();showEditCategory(' + activeScope.id + ')">&#9998; Edit</div>' +
              '<div class="cat-dropdown-item danger" onclick="closeCatMenu();confirmDeleteCategory(' + activeScope.id + ')">&#10005; Delete</div>' +
            '</div>' +
          '</div>'
        : '';

    view.innerHTML = `
        <div class="app-header">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div><h2>Work Category</h2><div class="header-sub">Manage work categories and items</div></div>
            </div>
        </div>
        <div class="app-body">
            <div class="tabs-wrapper">
                <div class="tabs-bar">
                    ${allTab}${tabs}${dotsHtml}
                    <button class="btn btn-accent" onclick="showAddCategory()">+ Add Category</button>
                </div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
                <input class="input" id="item-search" placeholder="Search ID/Name..." value="${esc(itemSearchQuery)}" oninput="itemSearchChanged()" style="max-width:320px;padding:8px 12px;font-size:.85rem">
                <span id="item-count" style="font-size:.82rem;color:var(--main-text3)"></span>
                <div style="margin-left:auto">
                    <button class="btn btn-green" onclick="showAddItem()">+ Add Item</button>
                </div>
            </div>
            <div id="items-table-area"></div>
        </div>`;

    renderItemsTable();
}

function switchScopeTab(catId) {
    activeCategoryId = catId;
    itemSearchQuery = '';
    renderMainScope();
}

function itemSearchChanged() {
    itemSearchQuery = document.getElementById('item-search').value.trim().toLowerCase();
    renderItemsTable();
}

function renderItemsTable() {
    let allItems = activeCategoryId
        ? DB.projects.filter(p => p.categoryId === activeCategoryId)
        : DB.projects;

    if (itemSearchQuery) {
        allItems = allItems.filter(p => p.name.toLowerCase().indexOf(itemSearchQuery) !== -1);
    }

    const countEl = document.getElementById('item-count');
    if (countEl) countEl.textContent = allItems.length + ' item' + (allItems.length !== 1 ? 's' : '');

    let rows = '';
    if (allItems.length === 0) {
        rows = '<tr><td colspan="7" style="text-align:center;color:var(--main-text3);padding:30px">No items found</td></tr>';
    } else {
        rows = allItems.map((p, idx) => {
            const cat = p.categoryId ? DB.scopes.find(s => s.id === p.categoryId) : null;
            const members = getProjectMembers(p.id);
            const mc = members.length;
            const cost = getProjectCost(p.id);
            const cd = getProjectCountdown(p);

            let cdHtml = '—';
            if (cd !== null) {
                if (cd > 30) cdHtml = `<span style="color:var(--ok);font-weight:600">${cd}d left</span>`;
                else if (cd > 7) cdHtml = `<span style="color:var(--warning);font-weight:600">${cd}d left</span>`;
                else if (cd > 0) cdHtml = `<span style="color:var(--danger);font-weight:600">${cd}d left</span>`;
                else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Today!</span>';
                else cdHtml = `<span style="color:var(--danger);font-weight:600">${Math.abs(cd)}d overdue</span>`;
            }

            let memberAvatars = '';
            if (mc > 0) {
                const show = members.slice(0, 4);
                memberAvatars = show.map(m => `<span class="badge badge-employee" style="font-size:.72rem;padding:2px 6px">${esc(m.name.split(' ')[0])}</span>`).join(' ');
                if (mc > 4) memberAvatars += ` <span style="font-size:.75rem;color:var(--main-text3)">+${mc - 4}</span>`;
            } else {
                memberAvatars = '<span style="font-size:.8rem;color:var(--main-text3)">None</span>';
            }

            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3);width:50px">${idx + 1}</td>
                <td><div style="font-weight:600;cursor:pointer" onclick="showEditItem(${p.id})">${esc(p.name)}</div></td>
                <td>${cat ? '<span class="badge badge-scope">' + esc(cat.name) + '</span>' : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td>${cdHtml}</td>
                <td>${memberAvatars}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtCost(cost)}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditItem(${p.id})" title="Edit">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeleteItem(${p.id})" title="Delete">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('items-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr>' +
                '<th style="width:50px">No</th>' +
                '<th>ID / Name</th>' +
                '<th style="width:130px">Category</th>' +
                '<th style="width:100px">Countdown</th>' +
                '<th>Members</th>' +
                '<th style="width:100px;text-align:right">Cost</th>' +
                '<th style="width:90px">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>';
}

// ---- Category CRUD ----

function showAddCategory() {
    showModal(`<h3>New Category</h3>
    <div class="field"><label>Category Name</label><input class="input" id="inp-cat-name" placeholder="e.g. Electrical, Mechanical"></div>
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

// ---- Item CRUD ----

function showAddItem() {
    const catOpts = DB.scopes.map(s => {
        const sel = activeCategoryId === s.id ? 'selected' : '';
        return `<option value="${s.id}" ${sel}>${esc(s.name)}</option>`;
    }).join('');

    showModal(`<h3>Add Item</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>ID / Name</label><input class="input" id="inp-item-name" placeholder="e.g. PLC-001 Panel"></div>
        <div class="field"><label>Category</label><select class="input" id="inp-item-cat"><option value="">-- None --</option>${catOpts}</select></div>
        <div class="field"><label>Start Date</label><input class="input" id="inp-item-start" type="date"></div>
        <div class="field"><label>End Date</label><input class="input" id="inp-item-end" type="date"></div>
    </div>
    <p class="auth-error" id="item-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddItem()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-item-name')?.focus(), 100);
}

async function doAddItem() {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-name').value.trim();
    const catId = document.getElementById('inp-item-cat').value;
    const startDate = document.getElementById('inp-item-start').value || null;
    const endDate = document.getElementById('inp-item-end').value || null;
    if (!name) { errEl.textContent = 'ID / Name is required'; return; }
    try {
        await api('/projects', { method: 'POST', body: { name, categoryId: catId ? parseInt(catId) : null, startDate, endDate } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

// ---- Edit Item + Assign Members ----

function showEditItem(pid) {
    const proj = DB.projects.find(p => p.id === pid);
    if (!proj) return;

    const catOpts = DB.scopes.map(s => {
        const sel = (proj.categoryId || 0) === s.id ? 'selected' : '';
        return `<option value="${s.id}" ${sel}>${esc(s.name)}</option>`;
    }).join('');

    // Assigned members
    const assignedMembers = getProjectMembers(pid);
    const assignedIds = assignedMembers.map(m => m.id);

    // Available members
    const seen = new Set();
    const available = DB.members.filter(m => {
        if (assignedIds.includes(m.id)) return false;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

    // Assigned list
    let assignedHtml = '';
    if (assignedMembers.length === 0) {
        assignedHtml = '<div style="color:var(--main-text3);font-size:.85rem;padding:16px;text-align:center">No members assigned</div>';
    } else {
        assignedHtml = assignedMembers.map(m => {
            const sal = latestSalary(m);
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--main-border)">
                <div>
                    <span style="font-weight:500;font-size:.88rem">${esc(m.name)}</span>
                    <span style="font-size:.75rem;color:var(--main-text3);margin-left:6px">${esc(getPositionName(m.positionId))}</span>
                    ${sal != null ? `<span style="font-size:.75rem;color:var(--main-text3);margin-left:6px">${fmt(sal)}</span>` : ''}
                </div>
                <button class="btn-icon danger" onclick="doRemoveFromEdit(${pid},${m.id})" title="Remove" style="font-size:.8rem">&#10005;</button>
            </div>`;
        }).join('');
    }

    // Available checkboxes
    let availableHtml = '';
    if (available.length === 0) {
        availableHtml = '<div style="color:var(--main-text3);font-size:.85rem;padding:16px;text-align:center">All members assigned</div>';
    } else {
        availableHtml = `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:6px">
            <div style="display:flex;gap:8px;margin-bottom:6px">
                <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-new-list input[type=checkbox]').forEach(c=>c.checked=true)">All</button>
                <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-new-list input[type=checkbox]').forEach(c=>c.checked=false)">Clear</button>
            </div>
            <div id="assign-new-list">
                ${available.map(m => {
                    const sal = latestSalary(m);
                    const salLabel = sal != null ? ' — ' + fmt(sal) : '';
                    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)">
                        <input type="checkbox" value="${m.id}" style="accent-color:var(--accent);width:15px;height:15px">
                        ${esc(m.name)} <span style="color:var(--main-text3);font-size:.76rem">(${esc(getPositionName(m.positionId))}${salLabel})</span>
                    </label>`;
                }).join('')}
            </div>
        </div>`;
    }

    // Countdown
    const cd = getProjectCountdown(proj);
    let cdHtml = '—';
    if (cd !== null) {
        if (cd > 30) cdHtml = `<span style="color:var(--ok)">${cd} days left</span>`;
        else if (cd > 7) cdHtml = `<span style="color:var(--warning)">${cd} days left</span>`;
        else if (cd > 0) cdHtml = `<span style="color:var(--danger)">${cd} days left</span>`;
        else if (cd === 0) cdHtml = '<span style="color:var(--warning)">Due today</span>';
        else cdHtml = `<span style="color:var(--danger)">${Math.abs(cd)} days overdue</span>`;
    }

    const cost = getProjectCost(pid);

    showModal(`
    <h3 style="margin-bottom:16px">${esc(proj.name)}</h3>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>ID / Name</label><input class="input" id="inp-item-edit" value="${esc(proj.name)}"></div>
        <div class="field"><label>Category</label><select class="input" id="inp-item-cat-edit"><option value="">-- None --</option>${catOpts}</select></div>
        <div class="field"><label>Start Date</label><input class="input" id="inp-item-start-edit" type="date" value="${proj.startDate || ''}"></div>
        <div class="field"><label>End Date</label><input class="input" id="inp-item-end-edit" type="date" value="${proj.endDate || ''}"></div>
    </div>

    <div style="display:flex;gap:24px;margin:14px 0 8px;padding:10px 0;border-top:1px solid var(--main-border);border-bottom:1px solid var(--main-border)">
        <div><span style="font-size:.72rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Countdown</span><div style="font-size:.92rem;margin-top:2px">${cdHtml}</div></div>
        <div><span style="font-size:.72rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Members</span><div style="font-size:.92rem;margin-top:2px">${assignedMembers.length}</div></div>
        <div><span style="font-size:.72rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Monthly Cost</span><div style="font-size:.92rem;margin-top:2px">${fmt(cost)}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px">
        <div>
            <div style="font-size:.85rem;font-weight:600;color:var(--main-text);margin-bottom:8px">Assigned Members</div>
            <div style="border:1px solid var(--main-border);border-radius:var(--radius-sm);max-height:220px;overflow-y:auto" id="edit-assigned-area">${assignedHtml}</div>
        </div>
        <div>
            <div style="font-size:.85rem;font-weight:600;color:var(--main-text);margin-bottom:8px">Add Members</div>
            ${availableHtml}
        </div>
    </div>

    <p class="auth-error" id="item-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditItemFull(${pid})">Save</button></div>
    `);

    setTimeout(() => { const el = document.getElementById('inp-item-edit'); el.focus(); el.select(); }, 100);
}

async function doRemoveFromEdit(pid, memberId) {
    await api('/assignments', { method: 'DELETE', body: { projectId: pid, memberId: memberId } });
    await loadDB();
    showEditItem(pid);
}

async function doEditItemFull(pid) {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-edit').value.trim();
    const catId = document.getElementById('inp-item-cat-edit').value;
    const startDate = document.getElementById('inp-item-start-edit').value || null;
    const endDate = document.getElementById('inp-item-end-edit').value || null;

    if (!name) { errEl.textContent = 'ID / Name is required'; return; }

    try {
        await api('/projects/' + pid, {
            method: 'PUT',
            body: { name, categoryId: catId ? parseInt(catId) : null, startDate, endDate }
        });

        const checkboxes = document.querySelectorAll('#assign-new-list input[type=checkbox]:checked');
        for (let i = 0; i < checkboxes.length; i++) {
            const memberId = parseInt(checkboxes[i].value);
            const already = DB.projectAssignments.find(pa => pa.projectId === pid && pa.memberId === memberId);
            if (!already) {
                await api('/assignments', { method: 'POST', body: { projectId: pid, memberId } });
            }
        }

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
   SECTION 10: PROJECT DETAIL (keep for backward compat)
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
          <button class="btn-icon" onclick="showEditItem(${pid})" title="Edit">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmRemoveFromProject(${pid},${m.id})" title="Remove">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }

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
      <div class="section-head"><h2>Assigned Members</h2><button class="btn btn-accent" onclick="showEditItem(${pid})">+ Manage Members</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Cost</th><th style="width:100px">Actions</th></tr></thead><tbody>${memberRows}</tbody></table></div>
    </div>`;
}

function showEditUser_byMember(memberId) {
    const user = DB.users.find(u => u.memberId === memberId);
    if (user) showEditUser(user.id);
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
   SECTION 11: EMPLOYEE — MY ITEMS (grouped by Scope + Item Summary)
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
        content = '<div class="empty"><div class="icon">&#128193;</div><p>Not assigned to any</p></div>';
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
                <thead><tr><th>Work Category Id/Name</th><th>Timeline</th><th>Team Size</th><th>Countdown</th></tr></thead>
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

    // === Item Summary Table (from attendance data) ===
    var itemSummaryHtml = buildEmpItemSummary(member.id);

    document.getElementById('emp-myprojects').innerHTML = `
    <div class="app-header"><h2>My Work Category Details</h2><div class="header-sub">Items you are involved in</div></div>
    <div class="app-body" style="max-width:none">
      <div class="emp-card">
        <div class="emp-name">${esc(member.name)}</div>
        <div class="emp-project">Position: ${esc(getPositionName(member.positionId))} &nbsp;|&nbsp; Department: ${esc(getDeptName(member.departmentId))}</div>
        <div class="emp-project" style="margin-bottom:8px">Work Assigned: <strong>${projs.length}</strong></div>
      </div>
      ${itemSummaryHtml}
      ${content}
    </div>`;
}

function buildEmpItemSummary(memberId) {
    var myEntries = DB.attendance.filter(a => a.memberId === memberId && a.clockIn && a.clockOut);
    if (myEntries.length === 0) return '';

    var itemGroups = {};
    myEntries.forEach(function(r) {
        var pid = r.projectId || 0;
        if (!itemGroups[pid]) itemGroups[pid] = { ms: 0, cost: 0, entries: 0 };
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        itemGroups[pid].ms += ms;
        itemGroups[pid].cost += (getEntryCost(r.memberId, ms) || 0);
        itemGroups[pid].entries++;
    });

    var rows = Object.keys(itemGroups).map(function(pid) {
        var data = itemGroups[pid];
        var proj = pid === '0' ? null : DB.projects.find(p => p.id === parseInt(pid));
        var scope = proj && proj.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        var label = proj
            ? (scope ? scope.name + ' → ' + proj.name : proj.name)
            : '<span style="color:var(--main-text3)">Unassigned</span>';
        return '<tr><td>' + label +
            '</td><td style="text-align:right;font-family:var(--font-m)">' + data.entries +
            '</td><td style="text-align:right;font-family:var(--font-m)">' + formatDuration(data.ms) +
            '</td><td style="text-align:right;font-family:var(--font-m)">' + fmtCost(data.cost) + '</td></tr>';
    }).join('');

    return '<div class="section-head" style="margin-top:4px"><h2>Summary Table</h2></div>' +
        '<div class="table-wrap" style="margin-bottom:24px"><table>' +
        '<thead><tr><th>Scope → Item</th><th style="text-align:right">Entries</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
}



/* ==========================================================
   SECTION 12: EMPLOYEE — ATTENDANCE TIME ENTRIES (filter by scope → item + date + pagination)
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

    <!--*********************************************
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
    *************************************************-->

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
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label>
            <div style="min-width:140px">${msGenerate('emp-ms-scope', scopeMsOpts, 'All Categories')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label>
            <div style="min-width:160px">${msGenerate('emp-ms-item', projMsOpts, 'All ID/Name')}</div>
          </div>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="btn btn-accent btn-sm" onclick="applyEmpAttendanceFilter()">Search</button>
            <button class="btn btn-ghost btn-sm" onclick="resetEmpAttendanceFilter()">Reset</button>
            <button class="btn btn-blue btn-sm" onclick="exportEmpAttendanceCSV()">&#128196; Export CSV</button>
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
        rows = '<tr><td colspan="9" style="text-align:center;color:var(--main-text3);padding:30px">No time entries found</td></tr>';
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
            var itemDisplay = '—';
            if (proj) {
                itemDisplay = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            }
            var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
            var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;

            return '<tr>' +
                '<td style="font-family:var(--font-m)">' + r.date + '</td>' +
                '<td>' + itemDisplay + '</td>' +
                '<td>' + (wp ? esc(wp.title) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + (wd ? esc(wd.title) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
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
                '<th>Date</th><th>Category &rarr; ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>' +
        paginationHtml;
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
    var today = todayStr();
    // 显示所有 scope
    var scopeOptions = '<option value="">-- Select Category --</option>' +
        DB.scopes.map(function(s) {
            return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
        }).join('');

    showModal(`
    <h3>Add Time Entry</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${today}"></div><br>
        <div class="field"><label>Category</label><select class="input" id="entry-scope-filter" onchange="entryScopeChanged()">${scopeOptions}</select></div>
        <div class="field"><label>ID/Name</label><select class="input" id="entry-project"><option value="">-- Select Category First --</option></select></div>
        <div style="display:none"><select class="input" id="entry-detail">${detailOpts(null)}</select></div>
        <div class="field"><label>Work Plan</label><select class="input" id="entry-workplan"><option value="">-- Select Category First --</option></select></div>
        <div class="field"><label>Work Done</label><select class="input" id="entry-workdone"><option value="">-- Select Category First --</option></select></div>
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="09:00"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="17:00"></div>
    </div>
    <div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="entry-desc" rows="2" placeholder="For Other Selected" style="resize:vertical"></textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>`);
    setTimeout(function() { document.getElementById('entry-scope-filter').focus(); }, 100);
}

function showEditTimeEntry(entryId) {
    var entry = DB.attendance.find(function(a) { return a.id === entryId; });
    if (!entry) return;

    var currentProj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var currentScopeId = currentProj && currentProj.categoryId ? currentProj.categoryId : '';

    // 显示所有 scope
    var scopeOptions = '<option value="">-- Select Category --</option>' +
        DB.scopes.map(function(s) {
            var sel = currentScopeId === s.id ? 'selected' : '';
            return '<option value="' + s.id + '" ' + sel + '>' + esc(s.name) + '</option>';
        }).join('');

    // 显示该 scope 下所有 project
    var scopeItems = currentScopeId
        ? DB.projects.filter(function(p) { return p.categoryId === currentScopeId; })
        : DB.projects;
    var projectOpts = scopeItems.map(function(p) {
        var sel = entry.projectId === p.id ? 'selected' : '';
        return '<option value="' + p.id + '" ' + sel + '>' + esc(p.name) + '</option>';
    }).join('');

    var startParts = entry.clockIn ? entry.clockIn.split('T') : [];
    var endParts = entry.clockOut ? entry.clockOut.split('T') : [];
    var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
    var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';

    showModal(`
    <h3>Edit Time Entry</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${entry.date}"></div><br>
        <div class="field"><label>Category</label><select class="input" id="entry-scope-filter" onchange="entryScopeChangedEdit()">${scopeOptions}</select></div>
        <div class="field"><label>ID/Name</label><select class="input" id="entry-project"><option value="">-- Select ID/Name --</option>${projectOpts}</select></div>
        <div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="entry-subscope"><option value="">-- Select Category First --</option></select></div>
        <div style="display:none"><select class="input" id="entry-detail">${detailOpts(entry.detailId)}</select></div>
        <div class="field"><label>Work Plan</label><select class="input" id="entry-workplan"><option value="">-- Select Category First --</option></select></div>
        <div class="field"><label>Work Done</label><select class="input" id="entry-workdone"><option value="">-- Select Category First --</option></select></div>
        <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="${startTime}"></div>
        <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="${endTime}"></div>
    </div>
    <div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="entry-desc" rows="2" style="resize:vertical">${esc(entry.description || '')}</textarea></div>
    <p class="auth-error" id="entry-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditTimeEntry(${entryId})">Save</button></div>`);

    setTimeout(function() {
        entryFilterWorklist();
        if (entry.work_plan_id) {
            var wpEl = document.getElementById('entry-workplan');
            if (wpEl) wpEl.value = entry.work_plan_id;
        }
        if (entry.work_done_id) {
            var wdEl = document.getElementById('entry-workdone');
            if (wdEl) wdEl.value = entry.work_done_id;
        }
    }, 50);
}

function entryScopeChanged() {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var projSelect = document.getElementById('entry-project');

    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;

    projSelect.innerHTML = '<option value="">-- Select ID/Name --</option>' +
        filtered.map(function(p) {
            return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
        }).join('');

    entryFilterWorklist();
}

function entryScopeChangedEdit() {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var projSelect = document.getElementById('entry-project');

    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;

    projSelect.innerHTML = '<option value="">-- Select ID/Name --</option>' +
        filtered.map(function(p) {
            return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
        }).join('');

    entryFilterWorklist();
}

function entryFilterWorklist() {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var wpSelect = document.getElementById('entry-workplan');
    var wdSelect = document.getElementById('entry-workdone');
    if (!wpSelect || !wdSelect) return;
    if (!scopeId) {
        wpSelect.innerHTML = '<option value="">-- Select Category First --</option>';
        wdSelect.innerHTML = '<option value="">-- Select Category First --</option>';
        return;
    }
    var filtered = DB.worklist.filter(function(w) { return w.scopeId === parseInt(scopeId); });
    var opts = '<option value="">-- None --</option>' +
        filtered.map(function(w) {
            return '<option value="' + w.id + '">' + esc(w.title) + '</option>';
        }).join('');
    wpSelect.innerHTML = opts;
    wdSelect.innerHTML = opts;
}


async function doAddTimeEntry() {
    var errEl = document.getElementById('entry-error');
    var date = document.getElementById('entry-date').value;
    var projectId = document.getElementById('entry-project').value;
    var subScopeId = document.getElementById('entry-subscope').value;
    var detailId = document.getElementById('entry-detail').value;
    var workPlanId = document.getElementById('entry-workplan').value;
    var workDoneId = document.getElementById('entry-workdone').value;
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
                work_plan_id: workPlanId ? parseInt(workPlanId) : null,
                work_done_id: workDoneId ? parseInt(workDoneId) : null,
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
    var workPlanId = document.getElementById('entry-workplan').value;
    var workDoneId = document.getElementById('entry-workdone').value;
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
                work_plan_id: workPlanId ? parseInt(workPlanId) : null,
                work_done_id: workDoneId ? parseInt(workDoneId) : null,
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}
function confirmDeleteTimeEntry(entryId) {
    var entry = DB.attendance.find(a => a.id === entryId);
    if (!entry) return;
    var proj = entry.projectId ? DB.projects.find(p => p.id === entry.projectId) : null;
    var scope = proj && proj.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
    var label = proj ? (scope ? scope.name + ' → ' + proj.name : proj.name) : '—';

    showModal('<h3>Delete Time Entry</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete this entry?<br>' +
        'Date: <strong style="color:var(--main-text)">' + entry.date + '</strong><br>' +
        'Item: <strong style="color:var(--main-text)">' + esc(label) + '</strong></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="doDeleteTimeEntry(' + entryId + ')">Delete</button></div>');
}

async function doDeleteTimeEntry(entryId) {
    try {
        await api('/attendance/' + entryId, { method: 'DELETE' });
        hideModal();
        await loadDB();
        renderEmployeeAttendance();
        showToast('Time entry deleted successfully');
    } catch (e) { alert('Failed: ' + e.message); }
}

function exportEmpAttendanceCSV() {
    var data = empAttFilteredData;
    if (data.length === 0) { alert('No data to export'); return; }

    var headers = ['Date', 'Category', 'ID/Name', 'Work Plan', 'Work Done', 'Start', 'End', 'Duration', 'Remark'];
    var rows = data.map(function(r) {
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '';
        var startParts = r.clockIn ? r.clockIn.split('T') : [];
        var endParts = r.clockOut ? r.clockOut.split('T') : [];
        var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
        var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';
        var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
        var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;

        return [r.date, scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', startTime, endTime, dur, r.description || ''];
    });

    var csv = headers.join(',') + '\n';
    rows.forEach(function(row) {
        csv += row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'my_attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function showToast(message) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, 2500);
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
   SECTION 10: ADMIN — ATTENDANCE (work list(scope) → id/name(item))
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
    var deptOpts = DB.departments.map(function(d) { return { value: d.id, label: d.name }; });

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
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label>' +
            '<div style="min-width:140px">' + msGenerate('att-ms-dept', deptOpts, 'All Departments') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label>' +
            '<div style="min-width:140px">' + msGenerate('att-ms-scope', scopeOpts, 'All Categories') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label>' +
            '<div style="min-width:160px">' + msGenerate('att-ms-item', [], 'All ID/Names') + '</div>' +
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

    msClear('att-ms-scope');
    msClear('att-ms-dept');    // ← 加这行
    msClear('att-ms-emp');

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
    var deptIds = msGetValues('att-ms-dept');    // ← 加这行
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

    /* Filter by selected department(s) */    // ← 加这块
    if (deptIds.length > 0) {
        var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
        filtered = filtered.filter(function(a) { return deptMemberIds.indexOf(a.memberId) !== -1; });
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

function renderAdminAttPage() {
    var filtered = adminAttFilteredData;
    var totalPages = Math.ceil(filtered.length / adminAttPageSize) || 1;
    var startIdx = (adminAttCurrentPage - 1) * adminAttPageSize;
    var endIdx = startIdx + adminAttPageSize;
    var pageData = filtered.slice(startIdx, endIdx);

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="11" style="text-align:center;color:var(--main-text3);padding:30px">No attendance records found</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            var emp = DB.members.find(function(m) { return m.id === r.memberId; });
            var dept = emp && emp.departmentId ? getDeptName(emp.departmentId) : '';
            var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
            var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
            var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            var startParts = r.clockIn ? r.clockIn.split('T') : [];
            var endParts = r.clockOut ? r.clockOut.split('T') : [];
            var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '—';
            var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '—';
            var itemDisplay = '—';
            if (proj) {
                itemDisplay = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            }
            var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
            var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;
            return '<tr>' +
                '<td style="font-family:var(--font-m)">' + r.date + '</td>' +
                '<td>' + (dept ? esc(dept) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + (emp ? esc(emp.name) : '?') + '</td>' +
                '<td>' + itemDisplay + '</td>' +
                '<td>' + (wp ? esc(wp.title) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + (wd ? esc(wd.title) : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
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
            '<thead><tr><th>Date</th><th>Department</th><th>Employee</th><th>Category &rarr; ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th></tr></thead>' +
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
    var scopeOptions = '<option value="">-- Select Category --</option>' +
        DB.scopes.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
    var memberOpts = '<option value="">-- Select Employee --</option>' +
        DB.members.map(function(m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');

    showModal(
    '<h3>Add Attendance</h3>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>Employee</label><select class="input" id="att-member">' + memberOpts + '</select></div>' +
        '<div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="' + todayStr() + '"></div>' +
        '<div class="field"><label>Categories</label><select class="input" id="att-scope-filter" onchange="adminAttScopeChanged()">' + scopeOptions + '</select></div>' +
        '<div class="field"><label>ID/Name</label><select class="input" id="att-item"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(null) + '</select></div>' +
        '<div class="field"><label>Work Plan</label><select class="input" id="att-workplan"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field"><label>Work Done</label><select class="input" id="att-workdone"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="09:00"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="17:00"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" placeholder="For Other Selected" style="resize:vertical"></textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminAddAttendance()">Save</button></div>'
    );
    setTimeout(function() { var el = document.getElementById('att-member'); if (el) el.focus(); }, 100);
}

function adminAttItemChanged() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var itemSelect = document.getElementById('att-item');
    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;
    itemSelect.innerHTML = '<option value="">-- Select ID/Name --</option>' +
        filtered.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
}

async function doAdminAddAttendance() {
    var errEl = document.getElementById('att-error');
    var memberId = document.getElementById('att-member').value;
    var date = document.getElementById('att-date').value;
    var itemId = document.getElementById('att-item').value;
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var workPlanId = document.getElementById('att-workplan').value;
    var workDoneId = document.getElementById('att-workdone').value;
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
                work_plan_id: workPlanId ? parseInt(workPlanId) : null,
                work_done_id: workDoneId ? parseInt(workDoneId) : null,
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

    var scopeOptions = '<option value="">-- Select Category --</option>' +
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
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="' + entry.date + '"></div><br>' +
        '<div class="field"><label>Category</label><select class="input" id="att-scope-filter" onchange="adminAttScopeChangedEdit()">' + scopeOptions + '</select></div>' +
        '<div class="field"><label>ID/Names</label><select class="input" id="att-item"><option value="">-- Select ID/Name --</option>' + itemOpts + '</select></div>' +
        '<div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(entry.detailId) + '</select></div>' +
        '<div class="field"><label>Work Plan</label><select class="input" id="att-workplan"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field"><label>Work Done</label><select class="input" id="att-workdone"><option value="">-- Select Category First --</option></select></div>' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="' + startTime + '"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="' + endTime + '"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" style="resize:vertical">' + esc(entry.description || '') + '</textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminEditAttendance(' + id + ')">Save</button></div>');

    // ← 加在这里，showModal 括号结束后面
    setTimeout(function() {
        adminAttFilterSubScopes();
        adminAttFilterWorklist();
        if (entry.subScopeId) {
            var ssEl = document.getElementById('att-subscope');
            if (ssEl) ssEl.value = entry.subScopeId;
        }
        if (entry.work_plan_id) {
            var wpEl = document.getElementById('att-workplan');
            if (wpEl) wpEl.value = entry.work_plan_id;
        }
        if (entry.work_done_id) {
            var wdEl = document.getElementById('att-workdone');
            if (wdEl) wdEl.value = entry.work_done_id;
        }
    }, 50);
}

function adminAttItemChangedEdit() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var itemSelect = document.getElementById('att-item');
    var filtered = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === parseInt(scopeId); })
        : DB.projects;
    itemSelect.innerHTML = '<option value="">-- Select ID/Name --</option>' +
        filtered.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
}

// ===== Scope → Worklist 联动 =====

function adminAttScopeChanged() {
    adminAttItemChanged();
    adminAttFilterSubScopes();
    adminAttFilterWorklist();
}

function adminAttScopeChangedEdit() {
    adminAttItemChangedEdit();
    adminAttFilterSubScopes();
    adminAttFilterWorklist();
}

function adminAttFilterSubScopes() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var ssSelect = document.getElementById('att-subscope');
    if (!ssSelect) return;
    var filtered = scopeId
        ? DB.subScopes.filter(function(s) { return s.scopeId === parseInt(scopeId); })
        : DB.subScopes;
    ssSelect.innerHTML = '<option value="">-- None --</option>' +
        filtered.map(function(s) {
            return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
        }).join('');
}

function adminAttFilterWorklist() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var wpSelect = document.getElementById('att-workplan');
    var wdSelect = document.getElementById('att-workdone');
    if (!wpSelect || !wdSelect) return;
    var filtered = scopeId
        ? DB.worklist.filter(function(w) { return w.scopeId === parseInt(scopeId); })
        : DB.worklist;
    var opts = '<option value="">-- None --</option>' +
        filtered.map(function(w) {
            return '<option value="' + w.id + '">' + esc(w.title) + '</option>';
        }).join('');
    wpSelect.innerHTML = opts;
    wdSelect.innerHTML = opts;
}

async function doAdminEditAttendance(id) {
    var errEl = document.getElementById('att-error');
    var date = document.getElementById('att-date').value;
    var itemId = document.getElementById('att-item').value;
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var workPlanId = document.getElementById('att-workplan').value;
    var workDoneId = document.getElementById('att-workdone').value;
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
                work_plan_id: workPlanId ? parseInt(workPlanId) : null,
                work_done_id: workDoneId ? parseInt(workDoneId) : null,
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

    var headers = ['Date', 'Department', 'Employee', 'Category', 'ID/Name', 'Work Plan', 'Work Done', 'Start', 'End', 'Duration', 'Remark'];
    var rows = data.map(function(r) {
        var emp = DB.members.find(function(m) { return m.id === r.memberId; });
        var dept = emp && emp.departmentId ? getDeptName(emp.departmentId) : '';
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '';
        var startParts = r.clockIn ? r.clockIn.split('T') : [];
        var endParts = r.clockOut ? r.clockOut.split('T') : [];
        var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
        var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';
        var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
        var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;

        return [r.date, dept, emp ? emp.name : '', scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', startTime, endTime, dur, r.description || ''];
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
    var scopeFilterOpts = '<option value="">All Categories</option>' +
        DB.scopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Sub Scopes</h2>' +
            '<div class="header-sub">Manage sub scopes</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
                '<div style="display:flex;align-items:center;gap:10px">' +
                    '<label style="font-size:.82rem;color:var(--main-text3)">Filter by Category:</label>' +
                    '<select class="input" id="subscope-filter" onchange="renderSubScopeTable()" style="width:180px;padding:8px 10px;font-size:.82rem">' + scopeFilterOpts + '</select>' +
                '</div>' +
                '<button class="btn btn-green" onclick="showAddSubScope()">+ Add Sub Scope</button>' +
            '</div>' +
            '<div id="subscope-table-area"></div>' +
        '</div>';
    renderSubScopeTable();
}

function renderSubScopeTable() {
    var filterScopeId = document.getElementById('subscope-filter') ? document.getElementById('subscope-filter').value : '';
    var filtered = filterScopeId
        ? DB.subScopes.filter(s => s.scopeId === parseInt(filterScopeId))
        : DB.subScopes;

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="5" style="text-align:center;color:var(--main-text3);padding:30px">No sub scopes found</td></tr>';
    } else {
        rows = filtered.map((s, index) => {
            var scope = s.scopeId ? DB.scopes.find(sc => sc.id === s.scopeId) : null;
            return '<tr>' +
                '<td style="font-family:var(--font-m);width:60px">' + (index + 1) + '</td>' +
                '<td>' + (scope ? '<span class="badge badge-scope">' + esc(scope.name) + '</span>' : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + esc(s.name) + '</td>' +
                '<td style="color:var(--main-text3);font-size:.82rem">' + (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—') + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditSubScope(' + s.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteSubScope(' + s.id + ')" title="Delete">&#10005;</button>' +
                '</div></td>' +
            '</tr>';
        }).join('');
    }

    document.getElementById('subscope-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr>' +
                '<th style="width:60px">No</th>' +
                '<th style="width:160px">Category</th>' +
                '<th>Name</th>' +
                '<th style="width:140px">Created</th>' +
                '<th style="width:90px">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>';
}

function showAddSubScope() {
    var scopeOpts = '<option value="">-- None --</option>' +
        DB.scopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
    showModal('<h3>Add Sub Scope</h3>' +
        '<div class="field"><label>Category</label><select class="input" id="subscope-scope">' + scopeOpts + '</select></div>' +
        '<div class="field"><label>Name</label><input class="input" id="subscope-name" placeholder="Enter sub scope name"></div>' +
        '<p class="auth-error" id="subscope-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddSubScope()">Save</button></div>');
    setTimeout(function() { document.getElementById('subscope-name').focus(); }, 100);
}

async function doAddSubScope() {
    var errEl = document.getElementById('subscope-error');
    var name = document.getElementById('subscope-name').value.trim();
    var scopeId = document.getElementById('subscope-scope').value;
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/subscopes', { method: 'POST', body: { name: name, scopeId: scopeId ? parseInt(scopeId) : null } });
        hideModal(); await loadDB(); renderAdminSubScopes();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditSubScope(id) {
    var item = DB.subScopes.find(s => s.id === id);
    if (!item) return;
    var scopeOpts = '<option value="">-- None --</option>' +
        DB.scopes.map(s => {
            return '<option value="' + s.id + '"' + (item.scopeId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('');
    showModal('<h3>Edit Sub Scope</h3>' +
        '<div class="field"><label>Category</label><select class="input" id="subscope-scope">' + scopeOpts + '</select></div>' +
        '<div class="field"><label>Name</label><input class="input" id="subscope-name" value="' + esc(item.name) + '"></div>' +
        '<p class="auth-error" id="subscope-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditSubScope(' + id + ')">Save</button></div>');
    setTimeout(function() { document.getElementById('subscope-name').focus(); }, 100);
}

async function doEditSubScope(id) {
    var errEl = document.getElementById('subscope-error');
    var name = document.getElementById('subscope-name').value.trim();
    var scopeId = document.getElementById('subscope-scope').value;
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Name is required'; return; }
    try {
        await api('/subscopes/' + id, { method: 'PUT', body: { name: name, scopeId: scopeId ? parseInt(scopeId) : null } });
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
   SECTION 19: Work List
   ========================================================== */
function renderWorkList() {
    const view = document.getElementById('admin-worklist');
    var scopeFilterOpts = '<option value="">All Categories</option>' +
        DB.scopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Work List</h2>' +
            '<div class="header-sub">Manage work items for attendance tracking</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
                '<div style="display:flex;align-items:center;gap:10px">' +
                    '<label style="font-size:.82rem;color:var(--main-text3)">Filter by Category:</label>' +
                    '<select class="input" id="worklist-filter" onchange="renderWorklistTable()" style="width:180px;padding:8px 10px;font-size:.82rem">' + scopeFilterOpts + '</select>' +
                '</div>' +
                '<button class="btn btn-green" onclick="showAddWorklist()">+ Add Work List</button>' +
            '</div>' +
            '<div id="worklist-table-area"></div>' +
        '</div>';
    renderWorklistTable();
}

function renderWorklistTable() {
    var filterScopeId = document.getElementById('worklist-filter') ? document.getElementById('worklist-filter').value : '';
    var filtered = filterScopeId
        ? DB.worklist.filter(w => w.scopeId === parseInt(filterScopeId))
        : DB.worklist;

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No work items found</td></tr>';
    } else {
        rows = filtered.map(w => {
            var scope = w.scopeId ? DB.scopes.find(s => s.id === w.scopeId) : null;
            return '<tr>' +
                '<td style="font-family:var(--font-m)">' + w.id + '</td>' +
                '<td>' + (scope ? '<span class="badge badge-scope">' + esc(scope.name) + '</span>' : '<span style="color:var(--main-text3)">—</span>') + '</td>' +
                '<td>' + esc(w.title) + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditWorklist(' + w.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteWorklist(' + w.id + ')" title="Delete">&#10005;</button>' +
                '</div></td>' +
            '</tr>';
        }).join('');
    }

    document.getElementById('worklist-table-area').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:60px">ID</th>' +
            '<th style="width:160px">Category</th>' +
            '<th>Title</th>' +
            '<th style="width:90px">Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function showAddWorklist() {
    var scopeOpts = '<option value="">-- None --</option>' +
        DB.scopes.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
    showModal('<h3>Add Work List</h3>' +
        '<div class="field"><label>Category</label><select class="input" id="wl-scope">' + scopeOpts + '</select></div>' +
        '<div class="field"><label>Work List</label><input class="input" id="wl-title" placeholder="e.g. Wiring Installation"></div>' +
        '<p class="auth-error" id="wl-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-green" onclick="doAddWorklist()">Create</button></div>');
    setTimeout(function() { document.getElementById('wl-title').focus(); }, 100);
}

async function doAddWorklist() {
    var title = document.getElementById('wl-title').value.trim();
    var scopeId = document.getElementById('wl-scope').value;
    var errEl = document.getElementById('wl-error'); errEl.textContent = '';
    if (!title) { errEl.textContent = 'Title is required'; return; }
    try {
        await api('/worklist', { method: 'POST', body: { title: title, scopeId: scopeId ? parseInt(scopeId) : null } });
    } catch (ex) { errEl.textContent = ex.message; return; }
    hideModal(); await loadDB(); renderWorkList();
}

function showEditWorklist(id) {
    var w = DB.worklist.find(x => x.id === id); if (!w) return;
    var scopeOpts = '<option value="">-- None --</option>' +
        DB.scopes.map(s => {
            return '<option value="' + s.id + '"' + (w.scopeId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('');
    showModal('<h3>Edit — ' + esc(w.title) + '</h3>' +
        '<div class="field"><label>Category</label><select class="input" id="wl-scope">' + scopeOpts + '</select></div>' +
        '<div class="field"><label>Work List</label><input class="input" id="wl-title" value="' + esc(w.title) + '"></div>' +
        '<p class="auth-error" id="wl-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-green" onclick="doEditWorklist(' + id + ')">Save</button></div>');
}

async function doEditWorklist(id) {
    var title = document.getElementById('wl-title').value.trim();
    var scopeId = document.getElementById('wl-scope').value;
    var errEl = document.getElementById('wl-error'); errEl.textContent = '';
    if (!title) { errEl.textContent = 'Title is required'; return; }
    try {
        await api('/worklist/' + id, { method: 'PUT', body: { title: title, scopeId: scopeId ? parseInt(scopeId) : null } });
    } catch (ex) { errEl.textContent = ex.message; return; }
    hideModal(); await loadDB(); renderWorkList();
}

function confirmDeleteWorklist(id) {
    var w = DB.worklist.find(x => x.id === id); if (!w) return;
    showModal('<h3>Delete Work Item</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(w.title) + '</strong>?<br>Attendance records using this will be set to empty.</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteWorklist(' + id + ')">Delete</button></div>');
}

async function doDeleteWorklist(id) {
    await api('/worklist/' + id, { method: 'DELETE' });
    hideModal(); await loadDB(); renderWorkList();
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
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var scopeOpts = DB.scopes.map(function(s) { return { value: s.id, label: s.name }; });
    var deptOpts = DB.departments.map(function(d) { return { value: d.id, label: d.name }; });
    var empOpts = DB.members.map(function(m) { return { value: m.id, label: m.name }; });
    var itemOpts = DB.projects.map(function(p) { return { value: p.id, label: p.name }; });

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Report</h2>' +
            '<div class="header-sub">Summary and analytics</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>' +
                '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="rpt-from" value="' + defaultFrom + '" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="rpt-to" value="' + today + '" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px">' + msGenerate('rpt-ms-dept', deptOpts, 'All Departments') + '</div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px">' + msGenerate('rpt-ms-scope', scopeOpts, 'All Categories') + '</div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px">' + msGenerate('rpt-ms-item', itemOpts, 'All ID/Names') + '</div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:160px">' + msGenerate('rpt-ms-emp', empOpts, 'All Employees') + '</div></div>' +
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

    // Category → Item 联动
    msOnChange('rpt-ms-scope', function(selectedScopeIds) {
        var filtered = selectedScopeIds.length > 0
            ? DB.projects.filter(function(p) { return selectedScopeIds.indexOf(p.categoryId) !== -1; })
            : DB.projects;
        msRebuild('rpt-ms-item', filtered.map(function(p) { return { value: p.id, label: p.name }; }), true);
    });

    // Department → Employee 联动
    msOnChange('rpt-ms-dept', function(selectedDeptIds) {
        var filtered = selectedDeptIds.length > 0
            ? DB.members.filter(function(m) { return selectedDeptIds.indexOf(m.departmentId) !== -1; })
            : DB.members;
        msRebuild('rpt-ms-emp', filtered.map(function(m) { return { value: m.id, label: m.name }; }), true);
    });

    generateReport();
}

function rptDeptChanged() {
    var deptId = document.getElementById('rpt-dept').value;
    var empSelect = document.getElementById('rpt-emp');
    var filtered = deptId
        ? DB.members.filter(function(m) { return m.departmentId === parseInt(deptId); })
        : DB.members;
    empSelect.innerHTML = '<option value="">All Employees</option>' +
        filtered.map(function(m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
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
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('rpt-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('rpt-to').value = today;

    msClear('rpt-ms-scope');
    msClear('rpt-ms-dept');
    msClear('rpt-ms-emp');

    var allItemOpts = DB.projects.map(function(p) { return { value: p.id, label: p.name }; });
    msRebuild('rpt-ms-item', allItemOpts, false);

    generateReport();
}


function generateReport() {
    var fromDate = document.getElementById('rpt-from').value;
    var toDate = document.getElementById('rpt-to').value;
    var scopeIds = msGetValues('rpt-ms-scope');
    var itemIds = msGetValues('rpt-ms-item');
    var deptIds = msGetValues('rpt-ms-dept');
    var empIds = msGetValues('rpt-ms-emp');
    if (!fromDate || !toDate) return;

    // Filter attendance by date range
    var filtered = DB.attendance.filter(function(a) {
        if (!a.date) return false;
        return a.date >= fromDate && a.date <= toDate;
    });

    // Filter by scope(s)
    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return scopeItemIds.indexOf(a.projectId) !== -1; });
    }

    // Filter by item(s)
    if (itemIds.length > 0) {
        filtered = filtered.filter(function(a) { return itemIds.indexOf(a.projectId) !== -1; });
    }

    // Filter by department(s)
    if (deptIds.length > 0) {
        var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
        filtered = filtered.filter(function(a) { return deptMemberIds.indexOf(a.memberId) !== -1; });
    }

    // Filter by employee(s)
    if (empIds.length > 0) {
        filtered = filtered.filter(function(a) { return empIds.indexOf(a.memberId) !== -1; });
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
            '<div class="stat-card"><div class="stat-label">Active Categories</div><div class="stat-value">' + uniqueScopes + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active ID/Name</div><div class="stat-value">' + uniqueItems + '</div></div>' +
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
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category &rarr; ID/Name</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-item-cost"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category</h3>' +
            '<div style="position:relative;height:280px"><canvas id="chart-scope-cost"></canvas></div>' +
        '</div>';

    // ===== CHART 3: Monthly Hours Trend =====
    var monthlyHours = {};
    var monthlyCost = {};
    filtered.forEach(function(r) {    // ← DB.attendance 改成 filtered
        if (!r.clockIn || !r.clockOut || !r.date) return;
        var m = r.date.substring(0, 7);
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
