function toggleMobileMenu(layoutId) {
    var layout = document.getElementById(layoutId || getActiveLayout());
    if (!layout) return;
    var sidebar = layout.querySelector('.sidebar');
    var overlay = layout.querySelector('.mobile-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    document.body.classList.toggle('menu-open');
}

function closeMobileMenu(layoutId) {
    var layout = document.getElementById(layoutId || getActiveLayout());
    if (!layout) return;
    var sidebar = layout.querySelector('.sidebar');
    var overlay = layout.querySelector('.mobile-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('menu-open');
}

function getActiveLayout() {
    var layouts = document.querySelectorAll('.app-layout.active');
    if (layouts.length > 0) return layouts[0].id;
    return null;
}

function initTheme() {
    var saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeUI(saved);
}

function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeUI(next);
}

function updateThemeUI(theme) {
    var icons = document.querySelectorAll('.theme-icon');
    var labels = document.querySelectorAll('.theme-label');
    icons.forEach(function(icon) {
        icon.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
    });
    labels.forEach(function(label) {
        label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    });
}

initTheme();
/* ==========================================================
   MULTITRADE — Project Salary Management (PostgreSQL version)
   ========================================================== */

//const API = 'http://localhost:3001/api';
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : '/api';


async function api(path, opts) {
    opts = opts || {};
    var url = '/api' + path;
    var headers = { 'Content-Type': 'application/json' };
    var session = localStorage.getItem('multitrade_session');
    if (session) {
        try {
            var user = JSON.parse(session);
            if (user && user.token) {
                headers['Authorization'] = 'Bearer ' + user.token;
            }
        } catch(e) {}
    }
    var options = {
        method: opts.method || 'GET',
        headers: headers
    };
    if (opts.body) options.body = JSON.stringify(opts.body);
    var res = await fetch(url, options);
    var data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem('multitrade_session');
            // 不在登录页才刷新，登录失败不刷新
            var loginPage = document.getElementById('login-page');
            if (!loginPage || !loginPage.classList.contains('active')) {
                window.location.href = window.location.pathname;
            }
        }
        throw new Error(data.error || 'Request failed');
    }
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
    worklist: [], 
    projectAssignments: [],
    attendance: [],
    viewerScopes: {},
};

async function loadDB() {
    try {
        const [projects, members, users, positions, departments, scopes, subScopes, details, assignments, attendance, worklist] = await Promise.all([
            api('/projects'),
            api('/members'),
            api('/users'),
            api('/positions'),
            api('/departments'),
            api('/scopes'),
            api('/subscopes'),
            api('/details'),
            api('/assignments'),
            api('/attendance'),
            api('/worklist')
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
        DB.worklist = worklist;

        // 加载 viewer 的额外 scope
        DB.viewerScopes = {};
        var viewerUsers = (DB.users || []).filter(function(u) { return u.role === 'viewer'; });
        for (var i = 0; i < viewerUsers.length; i++) {
            try {
                var scIds = await api('/viewer-scopes/' + viewerUsers[i].id);
                DB.viewerScopes[viewerUsers[i].id] = scIds;
            } catch (e) {
                DB.viewerScopes[viewerUsers[i].id] = [];
            }
        }
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

function formatDateDMY(dateStr) {
    if (!dateStr) return '—';
    var parts = dateStr.slice(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
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
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    if (!u || !pass) { err.textContent = 'Please enter username and password'; return; }
    try {
        currentUser = await api('/login', { method: 'POST', body: { username: u, password: pass } });
        err.textContent = '';
        localStorage.setItem('multitrade_session', JSON.stringify(currentUser));

        if (selectedModule === 'panel') {
            if (currentUser.role !== 'admin' && currentUser.role !== 'viewer') {
                err.textContent = 'Panel Tracking is for admin only';
                currentUser = null;
                localStorage.removeItem('multitrade_session');
                return;
            }
            localStorage.setItem('multitrade_module', 'panel');
            document.querySelectorAll('.auth-page,.app-layout').forEach(function(el) { el.classList.remove('active'); });
            document.getElementById('panel-layout').classList.add('active');
            var initial = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('pt-avatar').textContent = initial;
            document.getElementById('pt-user-name').textContent = currentUser.username;

            var isViewer = currentUser.role === 'viewer';
            document.querySelectorAll('#pt-nav .nav-item').forEach(function(item) {
                var page = item.getAttribute('data-page');
                if (page === 'pt-import' || page === 'pt-users') {
                    item.style.display = isViewer ? 'none' : '';
                }
            });
            document.querySelectorAll('#pt-nav .nav-section').forEach(function(s) {
                var t = s.textContent.trim();
                if (t === 'Tools' || t === 'Settings') {
                    s.style.display = isViewer ? 'none' : '';
                }
            });
            var roleLabel = document.querySelector('#panel-layout .sidebar-user .user-role');
            if (roleLabel) roleLabel.textContent = isViewer ? 'Viewer' : 'Admin';

            await ptLoadDB();
            ptNav('pt-dashboard');
        } else {
            localStorage.setItem('multitrade_module', 'attendance');
            await loadDB();
            document.querySelectorAll('.auth-page,.app-layout').forEach(function(el) { el.classList.remove('active'); });
            if (currentUser.role === 'admin' || currentUser.role === 'viewer') {
                document.getElementById('admin-layout').classList.add('active');

                var isViewer = currentUser.role === 'viewer';
                document.querySelectorAll('#admin-nav .nav-item').forEach(function(item) {
                    var page = item.getAttribute('data-page');
                    if (page === 'users' || page === 'departments' || page === 'positions') {
                        item.style.display = isViewer ? 'none' : '';
                    }
                });
                document.querySelectorAll('#admin-nav .nav-section').forEach(function(s) {
                    if (s.textContent.trim() === 'HR') {
                        s.style.display = isViewer ? 'none' : '';
                    }
                });
                var roleLabel = document.querySelector('#admin-layout .sidebar-user .user-role');
                if (roleLabel) roleLabel.textContent = isViewer ? 'Viewer' : 'Administrator';

                adminNav('projects');
            } else {
                document.getElementById('employee-layout').classList.add('active');
                empNav('attendance');
            }
            updateAvatars();
        }
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
    localStorage.removeItem('multitrade_pt_page');
    localStorage.removeItem('multitrade_module');
    currentUser = null;
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('login-page').classList.add('active');
    selectedModule = 'attendance';
    window.location.href = window.location.pathname;
    hideModal();
}


// function doLogout() {
//     localStorage.removeItem('multitrade_session');
//     window.location.href = window.location.pathname;
// }



/* ==========================================================
   SECTION 5: NAVIGATION
   ========================================================== */

let activeProjectId = null;

async function showPage(id) {
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'admin-layout') { await loadDB(); adminNav('projects'); updateAvatars(); }
    if (id === 'employee-layout') { await loadDB(); empNav('attendance'); updateAvatars(); }
    if (id === 'detail-layout') { await loadDB(); renderProjectDetail(); updateAvatars(); }
}

async function adminNav(tab, el) {
    // Viewer 不能访问 HR 管理页面
    if (currentUser && currentUser.role === 'viewer' && (tab === 'users' || tab === 'departments' || tab === 'positions')) {
        tab = 'projects';
    }

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

// filter not to see viewer in employee dropdown
function getViewerMemberIds() {
    var viewerIds = [];
    (DB.users || []).forEach(function(u) {
        if (u.role === 'viewer' && u.memberId) {
            viewerIds.push(u.memberId);
        }
    });
    return viewerIds;
}
function getNonViewerMembers() {
    var viewerIds = getViewerMemberIds();
    return DB.members.filter(function(m) {
        return viewerIds.indexOf(m.id) === -1;
    });
}

function getViewerVisibleScopeIds() {
    if (!currentUser || currentUser.role !== 'viewer') return null;
    if (!currentUser.memberId) return [];

    var visibleScopeIds = [];

    // 只用手动指定的 scope（Edit User 里勾选的）
    var extra = (DB.viewerScopes || {})[currentUser.id] || [];
    extra.forEach(function(sid) {
        if (visibleScopeIds.indexOf(sid) === -1) {
            visibleScopeIds.push(sid);
        }
    });

    return visibleScopeIds;
}

function getViewerVisibleProjects() {
    var scopeIds = getViewerVisibleScopeIds();
    if (scopeIds === null) return null;
    return DB.projects.filter(function(p) {
        return p.categoryId && scopeIds.indexOf(p.categoryId) !== -1;
    });
}

function empIsPIC() {
    if (!currentUser || !currentUser.memberId) return false;
    return DB.scopes.some(function(s) {
        return s.picMemberIds && s.picMemberIds.indexOf(currentUser.memberId) !== -1;
    });
}

async function empNav(tab, el) {
    // PIC 权限检查
    var reportNav = document.getElementById('emp-nav-report');
    if (reportNav) {
        reportNav.style.display = empIsPIC() ? '' : 'none';
    }
    if (tab === 'report' && !empIsPIC()) {
        tab = 'attendance';
    }

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
        case 'report': renderEmpReport(); break;
        case 'settings': renderEmpSettings(); break;
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




/* ==========================================================
   SECTION 6: Work Category/MAIN SCOPE (tabs = category, table = items)
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
    var view = document.getElementById('admin-projects');

    // viewer 只看到自己 department + 手动指定的 scope
    var viewerScopeIds = getViewerVisibleScopeIds();
    var visibleScopes = viewerScopeIds !== null
        ? DB.scopes.filter(function(s) { return viewerScopeIds.indexOf(s.id) !== -1; })
        : DB.scopes;

    var allProjects = viewerScopeIds !== null
        ? DB.projects.filter(function(p) { return p.categoryId && viewerScopeIds.indexOf(p.categoryId) !== -1; })
        : DB.projects;

    var allCount = allProjects.length;
    var allTab = '<div class="tab-item' + (!activeCategoryId ? ' active' : '') + '" onclick="switchScopeTab(null)">All <span class="tab-count">' + allCount + '</span></div>';

    var tabs = visibleScopes.map(function(s) {
        var count = allProjects.filter(function(p) { return p.categoryId === s.id; }).length;
        return '<div class="tab-item' + (activeCategoryId === s.id ? ' active' : '') + '" onclick="switchScopeTab(' + s.id + ')">' + esc(s.name) + ' <span class="tab-count">' + count + '</span></div>';
    }).join('');

    var activeScope = activeCategoryId ? visibleScopes.find(function(s) { return s.id === activeCategoryId; }) : null;
    var dotsHtml = '';
    if (activeScope && canEdit()) {
        dotsHtml = '<div style="position:relative;display:inline-flex;align-items:center">' +
            '<button class="tab-more-btn" onclick="event.stopPropagation();toggleCatMenu()">&#8942;</button>' +
            '<div id="cat-dropdown" class="cat-dropdown">' +
              '<div class="cat-dropdown-item" onclick="closeCatMenu();showEditCategory(' + activeScope.id + ')">&#9998; Edit</div>' +
              '<div class="cat-dropdown-item danger" onclick="closeCatMenu();confirmDeleteCategory(' + activeScope.id + ')">&#10005; Delete</div>' +
            '</div>' +
          '</div>';
    }

    var addCatBtn = canEdit() ? '<button class="btn btn-accent" onclick="showAddCategory()">+ Add Category</button>' : '';
    var addItemBtn = canEdit() ? '<button class="btn btn-green" onclick="showAddItem()">+ Add Item</button>' : '';

    // 存起来给 switchScopeTab 用
    window._viewerVisibleScopeIds = viewerScopeIds;
    window._viewerVisibleProjectIds = viewerScopeIds !== null ? allProjects.map(function(p) { return p.id; }) : null;

    view.innerHTML =
        '<div class="app-header">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
                '<div><h2>Work Category</h2><div class="header-sub">Manage work categories and items</div></div>' +
            '</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div class="tabs-wrapper">' +
                '<div class="tabs-bar">' +
                    allTab + tabs + dotsHtml +
                    addCatBtn +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">' +
                '<input class="input" id="item-search" placeholder="Search all columns..." value="' + esc(itemSearchQuery) + '" oninput="itemSearchChanged()" style="max-width:320px;padding:8px 12px;font-size:.85rem">' +
                '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Start Date</label><input type="date" class="input" id="item-filter-start" onchange="itemDateChanged()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
                '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">End Date</label><input type="date" class="input" id="item-filter-end" onchange="itemDateChanged()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
                '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="item-filter-inst-from" onchange="itemInstDateChanged()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
                '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="item-filter-inst-to" onchange="itemInstDateChanged()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
                '<button class="btn btn-ghost btn-sm" onclick="resetItemFilters()">Reset</button>' +
                '<span id="item-count" style="font-size:.82rem;color:var(--main-text3)"></span>' +
                '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
                    (activeCategoryId && canEdit() ?
                        '<a class="btn btn-accent btn-sm" href="/api/template/projects/' + activeCategoryId + '" style="text-decoration:none">Template Download</a>' +
                        '<label class="btn btn-blue btn-sm" style="cursor:pointer">Import Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="adminHandleItemImport(this)"></label>'
                    : '') +
                    addItemBtn +
                '</div>' +
            '</div>' +
            '<div id="items-table-area"></div>' +
        '</div>';

    renderItemsTable();
}

function itemDateChanged() {
    var f = document.getElementById('item-filter-start').value;
    var t = document.getElementById('item-filter-end').value;
    if (f) document.getElementById('item-filter-end').min = f;
    if (f && t && t < f) document.getElementById('item-filter-end').value = f;
    itemCurrentPage = 1;
    renderItemsTable();
}

function itemInstDateChanged() {
    var f = document.getElementById('item-filter-inst-from').value;
    var t = document.getElementById('item-filter-inst-to').value;
    if (f) document.getElementById('item-filter-inst-to').min = f;
    if (f && t && t < f) document.getElementById('item-filter-inst-to').value = f;
    itemCurrentPage = 1;
    renderItemsTable();
}

function resetItemFilters() {
    itemSearchQuery = '';
    document.getElementById('item-search').value = '';
    document.getElementById('item-filter-start').value = '';
    document.getElementById('item-filter-end').value = '';
    document.getElementById('item-filter-inst-from').value = '';
    document.getElementById('item-filter-inst-to').value = '';
    itemCurrentPage = 1;
    renderItemsTable();
}


// ========== Admin Item Import ==========
var adminImportBase64 = null;
var adminImportFilename = '';

function adminHandleItemImport(input) {
    var file = input.files[0];
    if (!file) return;

    var catId = activeCategoryId || 0;
    var catName = activeCategoryId ? (DB.scopes.find(function(s) { return s.id === activeCategoryId; }) || {}).name : 'All';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (rows.length === 0) {
                alert('File is empty');
                input.value = '';
                return;
            }

            var headers = Object.keys(rows[0]);
            var previewRows = rows.slice(0, 5);

            var previewHtml = '<div style="margin-top:10px;font-size:.85rem;color:var(--main-text3)">Preview (' + rows.length + ' rows total) — Category: <strong>' + esc(catName) + '</strong></div>' +
                '<div class="import-preview"><table><thead><tr>' + headers.map(function(h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
                previewRows.map(function(row) { return '<tr>' + headers.map(function(h) { return '<td>' + esc(String(row[h])) + '</td>'; }).join('') + '</tr>'; }).join('') +
                (rows.length > 5 ? '<tr><td colspan="' + headers.length + '" style="text-align:center;color:var(--main-text3)">... ' + (rows.length - 5) + ' more</td></tr>' : '') +
                '</tbody></table></div>';

            // Convert to base64
            var bytes = new Uint8Array(e.target.result);
            var binary = '';
            for (var i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            adminImportBase64 = btoa(binary);
            adminImportFilename = file.name;

            showModal('<h3>Import Items</h3>' +
                previewHtml +
                '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
                    '<button class="btn btn-ghost" onclick="hideModal();adminImportBase64=null">Cancel</button>' +
                    '<button class="btn btn-accent" onclick="adminDoItemImport()">Import ' + rows.length + ' Rows</button>' +
                '</div>');
        } catch (err) {
            alert('Error reading file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
}

async function adminDoItemImport() {
    if (!adminImportBase64) return;
    var catId = activeCategoryId || 0;
    try {
        var result = await api('/import/projects', {
            method: 'POST',
            body: {
                filename: adminImportFilename,
                data: adminImportBase64,
                categoryId: catId
            }
        });
        hideModal();
        adminImportBase64 = null;

        var msg = 'Imported: ' + result.inserted + ', Skipped: ' + result.skipped;
        if (result.errors && result.errors.length > 0) {
            msg += '\n\n' + result.errors.join('\n');
        }
        alert(msg);

        await loadDB();
        renderMainScope();
    } catch (e) {
        alert('Import failed: ' + e.message);
    }
}

function switchScopeTab(catId) {
    activeCategoryId = catId;
    itemSearchQuery = '';
    itemCurrentPage = 1;    // ← 加
    renderMainScope();
}

function itemSearchChanged() {
    itemSearchQuery = document.getElementById('item-search').value.trim().toLowerCase();
    itemCurrentPage = 1;    // ← 加
    renderItemsTable();
}

var itemCurrentPage = 1;
var itemPageSize = 10;

function renderItemsTable() {
    var allItems = getFilteredItems();

    var countEl = document.getElementById('item-count');
    if (countEl) countEl.textContent = allItems.length + ' item' + (allItems.length !== 1 ? 's' : '');

    var totalPages = Math.ceil(allItems.length / itemPageSize) || 1;
    if (itemCurrentPage > totalPages) itemCurrentPage = totalPages;
    if (itemCurrentPage < 1) itemCurrentPage = 1;
    var startIdx = (itemCurrentPage - 1) * itemPageSize;
    var endIdx = startIdx + itemPageSize;
    var pageData = allItems.slice(startIdx, endIdx);

    var rows = '';
    if (allItems.length === 0) {
        rows = '<tr><td colspan="11" style="text-align:center;color:var(--main-text3);padding:30px">No items found</td></tr>';
    } else {
        rows = pageData.map(function(p, idx) {
            var cat = p.categoryId ? DB.scopes.find(function(s) { return s.id === p.categoryId; }) : null;
            var members = getProjectMembers(p.id);
            var mc = members.length;
            var cost = getProjectCost(p.id);
            var cd = getProjectCountdown(p);

            var cdHtml = '\u2014';
            if (cd !== null) {
                if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">' + cd + 'd left</span>';
                else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">' + cd + 'd left</span>';
                else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">' + cd + 'd left</span>';
                else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Today!</span>';
                else cdHtml = '<span style="color:var(--danger);font-weight:600">' + Math.abs(cd) + 'd overdue</span>';
            }

            var memberAvatars = '';
            if (mc > 0) {
                var show = members.slice(0, 4);
                memberAvatars = show.map(function(m) { return '<span class="badge badge-employee" style="font-size:.72rem;padding:2px 6px">' + esc(m.name.split(' ')[0]) + '</span>'; }).join(' ');
                if (mc > 4) memberAvatars += ' <span style="font-size:.75rem;color:var(--main-text3)">+' + (mc - 4) + '</span>';
            } else {
                memberAvatars = '<span style="font-size:.8rem;color:var(--main-text3)">None</span>';
            }

            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3);width:50px">' + (startIdx + idx + 1) + '</td>' +
                '<td><div style="font-weight:600;cursor:pointer" onclick="showEditItem(' + p.id + ')">' + esc(p.name) + '</div></td>' +
                '<td>' + esc(p.customer || '\u2014') + '</td>' +
                '<td>' + (cat ? '<span class="badge badge-scope">' + esc(cat.name) + '</span>' : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.82rem">' + formatDateDMY(p.startDate) + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.82rem">' + formatDateDMY(p.endDate) + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.82rem">' + formatDateDMY(p.installDate) + '</td>' +
                '<td>' + cdHtml + '</td>' +
                '<td>' + memberAvatars + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(cost) + '</td>' +
                // 在 rows 的 map 里，把 Actions 列改成：
                '<td>' + (canEdit()
                    ? '<div class="actions-cell">' +
                        '<button class="btn-icon" onclick="showEditItem(' + p.id + ')" title="Edit">&#9998;</button>' +
                        '<button class="btn-icon danger" onclick="confirmDeleteItem(' + p.id + ')" title="Delete">&#10005;</button>' +
                    '</div>'
                    : '') + '</td></tr>';
        }).join('');
    }

    var paginationHtml = '';
    if (allItems.length > 0) {
        var showFrom = startIdx + 1;
        var showTo = Math.min(endIdx, allItems.length);
        var pageButtons = '';
        var maxVisible = 5;
        var startPage = Math.max(1, itemCurrentPage - Math.floor(maxVisible / 2));
        var endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goItemPage(1)" ' + (itemCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goItemPage(' + (itemCurrentPage - 1) + ')" ' + (itemCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goItemPage(' + p + ')" class="' + (p === itemCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goItemPage(' + (itemCurrentPage + 1) + ')" ' + (itemCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goItemPage(' + totalPages + ')" ' + (itemCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + allItems.length + ' items</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeItemPageSize(this.value)">' +
                        '<option value="5"' + (itemPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (itemPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (itemPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (itemPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (itemPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('items-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr>' +
                '<th style="width:50px">No</th>' +
                '<th>ID / Name</th>' +
                '<th>Customer</th>' +
                '<th style="width:130px">Category</th>' +
                '<th style="width:100px">Start Date</th>' +
                '<th style="width:100px">End Date</th>' +
                '<th style="width:100px">Install Date</th>' +
                '<th style="width:100px">Countdown</th>' +
                '<th>Members</th>' +
                '<th style="width:100px;text-align:right">Cost</th>' +
                '<th style="width:90px">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        paginationHtml;
}   

function goItemPage(page) {
    const totalPages = Math.ceil(getFilteredItems().length / itemPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    itemCurrentPage = page;
    renderItemsTable();
}

function changeItemPageSize(size) {
    itemPageSize = parseInt(size);
    itemCurrentPage = 1;
    renderItemsTable();
}

function getFilteredItems() {
    // viewer 过滤
    var viewerProjectIds = window._viewerVisibleProjectIds;
    var baseItems = viewerProjectIds !== null
        ? DB.projects.filter(function(p) { return viewerProjectIds.indexOf(p.id) !== -1; })
        : DB.projects;

    var allItems = activeCategoryId
        ? baseItems.filter(function(p) { return p.categoryId === activeCategoryId; })
        : baseItems;

    if (itemSearchQuery) {
        allItems = allItems.filter(function(p) {
            var cat = p.categoryId ? DB.scopes.find(function(s) { return s.id === p.categoryId; }) : null;
            var haystack = [
                p.name,
                p.customer,
                cat ? cat.name : '',
                p.startDate || '',
                p.endDate || '',
                p.installDate || '',
                formatDateDMY(p.startDate),
                formatDateDMY(p.endDate),
                formatDateDMY(p.installDate)
            ].map(function(v) { return String(v).toLowerCase(); }).join(' ');
            return haystack.indexOf(itemSearchQuery) !== -1;
        });
    }

    var startFilter = document.getElementById('item-filter-start') ? document.getElementById('item-filter-start').value : '';
    var endFilter = document.getElementById('item-filter-end') ? document.getElementById('item-filter-end').value : '';
    var instFrom = document.getElementById('item-filter-inst-from') ? document.getElementById('item-filter-inst-from').value : '';
    var instTo = document.getElementById('item-filter-inst-to') ? document.getElementById('item-filter-inst-to').value : '';

    if (startFilter) {
        allItems = allItems.filter(function(p) {
            var sd = p.startDate ? p.startDate.slice(0, 10) : '';
            return sd && sd >= startFilter;
        });
    }
    if (endFilter) {
        allItems = allItems.filter(function(p) {
            var ed = p.endDate ? p.endDate.slice(0, 10) : '';
            return ed && ed <= endFilter;
        });
    }
    if (instFrom) {
        allItems = allItems.filter(function(p) {
            var id = p.installDate ? p.installDate.slice(0, 10) : '';
            return id && id >= instFrom;
        });
    }
    if (instTo) {
        allItems = allItems.filter(function(p) {
            var id = p.installDate ? p.installDate.slice(0, 10) : '';
            return id && id <= instTo;
        });
    }

    return allItems;
}

// ---- Category CRUD ----

function showAddCategory() {
    var picList = DB.members.map(function(m) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" value="' + m.id + '" style="accent-color:var(--accent);width:15px;height:15px">' +
            esc(m.name) + ' <span style="color:var(--main-text3);font-size:.76rem">(' + esc(getPositionName(m.positionId)) + ' · ' + esc(getDeptName(m.departmentId)) + ')</span></label>';
    }).join('');
    var deptList = DB.departments.map(function(d) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" value="' + d.id + '" style="accent-color:var(--accent);width:15px;height:15px">' +
            esc(d.name) + '</label>';
    }).join('');

    showModal('<h3>New Category</h3>' +
        '<div class="field"><label>Category Name</label><input class="input" id="inp-cat-name" placeholder="e.g. Electrical, Mechanical"></div>' +
        '<div style="margin-top:8px"><label style="font-size:.85rem;display:block;margin-bottom:6px">PIC (Person In Charge - Can update the detials)</label>' +
            '<div style="display:flex;gap:6px;margin-bottom:6px">' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#pic-list-add input\').forEach(function(c){c.checked=true})">All</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#pic-list-add input\').forEach(function(c){c.checked=false})">Clear</button>' +
            '</div>' +
            '<div id="pic-list-add" style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">' + picList + '</div>' +
        '</div>' +
        '<div style="margin-top:12px"><label style="font-size:.85rem;display:block;margin-bottom:6px">Employee Attendance Access <span style="font-size:.76rem;color:var(--main-text3);font-weight:normal">— Employees in selected departments can see this category in attendance dropdown :</label>' +
            '<div style="display:flex;gap:6px;margin-bottom:6px">' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#dept-list-add input\').forEach(function(c){c.checked=true})">All</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#dept-list-add input\').forEach(function(c){c.checked=false})">Clear</button>' +
            '</div>' +
            '<div id="dept-list-add" style="max-height:150px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">' + deptList + '</div>' +
            '<div style="font-size:.76rem;color:var(--main-text3);margin-top:5px">Clear means all departments can view.</div>' +
        '</div>' +
        '<p class="auth-error" id="cat-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddCategory()">Create</button></div>');
    setTimeout(function() { document.getElementById('inp-cat-name').focus(); }, 100);
}

async function doAddCategory() {
    var errEl = document.getElementById('cat-error');
    var name = document.getElementById('inp-cat-name').value.trim();
    if (!name) { errEl.textContent = 'Name is required'; return; }
    var picMemberIds = [];
    document.querySelectorAll('#pic-list-add input:checked').forEach(function(c) {
        picMemberIds.push(parseInt(c.value));
    });
    var departmentIds = [];
    document.querySelectorAll('#dept-list-add input:checked').forEach(function(c) {
        departmentIds.push(parseInt(c.value));
    });
    try {
        await api('/scopes', { method: 'POST', body: { name: name, picMemberIds: picMemberIds, departmentIds: departmentIds } });
        hideModal(); await loadDB(); renderMainScope();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditCategory(sid) {
    var scope = DB.scopes.find(function(s) { return s.id === sid; });
    if (!scope) return;
    var currentPics = scope.picMemberIds || [];
    var currentDepartments = scope.departmentIds || [];

    var picList = DB.members.map(function(m) {
        var checked = currentPics.indexOf(m.id) !== -1 ? 'checked' : '';
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" value="' + m.id + '" ' + checked + ' style="accent-color:var(--accent);width:15px;height:15px">' +
            esc(m.name) + ' <span style="color:var(--main-text3);font-size:.76rem">(' + esc(getPositionName(m.positionId)) + ' · ' + esc(getDeptName(m.departmentId)) + ')</span></label>';
    }).join('');

    var deptList = DB.departments.map(function(d) {
        var checked = currentDepartments.indexOf(d.id) !== -1 ? 'checked' : '';
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" value="' + d.id + '" ' + checked + ' style="accent-color:var(--accent);width:15px;height:15px">' +
            esc(d.name) + '</label>';
    }).join('');

    showModal('<h3>Edit Category</h3>' +
        '<div class="field"><label>Category Name</label><input class="input" id="inp-cat-edit" value="' + esc(scope.name) + '"></div>' +
        '<div style="margin-top:8px"><label style="font-size:.85rem;display:block;margin-bottom:6px">PIC (Person In Charge - Can update the detials)</label>' +
            '<div style="display:flex;gap:6px;margin-bottom:6px">' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#pic-list-edit input\').forEach(function(c){c.checked=true})">All</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#pic-list-edit input\').forEach(function(c){c.checked=false})">Clear</button>' +
            '</div>' +
            '<div id="pic-list-edit" style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">' + picList + '</div>' +
        '</div>' +
        '<div style="margin-top:12px"><label style="font-size:.85rem;display:block;margin-bottom:6px">Employee Attendance Access <span style="font-size:.76rem;color:var(--main-text3);font-weight:normal">— Employees in selected departments can see <strong>' + esc(scope.name) + '</strong> in attendance dropdown</span></label>' +            '<div style="display:flex;gap:6px;margin-bottom:6px">' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#dept-list-edit input\').forEach(function(c){c.checked=true})">All</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" onclick="document.querySelectorAll(\'#dept-list-edit input\').forEach(function(c){c.checked=false})">Clear</button>' +
            '</div>' +
            '<div id="dept-list-edit" style="max-height:150px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">' + deptList + '</div>' +
            '<div style="font-size:.76rem;color:var(--main-text3);margin-top:5px">Clear means all departments can view.</div>' +
        '</div>' +
        '<p class="auth-error" id="cat-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditCategory(' + sid + ')">Save</button></div>');
    setTimeout(function() { var el = document.getElementById('inp-cat-edit'); el.focus(); el.select(); }, 100);
}

async function doEditCategory(sid) {
    var errEl = document.getElementById('cat-error');
    var name = document.getElementById('inp-cat-edit').value.trim();
    if (!name) { errEl.textContent = 'Name is required'; return; }
    var picMemberIds = [];
    document.querySelectorAll('#pic-list-edit input:checked').forEach(function(c) {
        picMemberIds.push(parseInt(c.value));
    });
    var departmentIds = [];
    document.querySelectorAll('#dept-list-edit input:checked').forEach(function(c) {
        departmentIds.push(parseInt(c.value));
    });
    try {
        await api('/scopes/' + sid, { method: 'PUT', body: { name: name, picMemberIds: picMemberIds, departmentIds: departmentIds } });
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

    showModal('<h3>Add Item</h3>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>ID / Name</label><input class="input" id="inp-item-name" placeholder="e.g. PLC-001 Panel"></div>' +
        '<div class="field"><label>Customer</label><input class="input" id="inp-item-customer" placeholder="e.g. Petronas"></div>' +
        '<div class="field"><label>Category</label><select class="input" id="inp-item-cat"><option value="">-- None --</option>' + catOpts + '</select></div>' +
        '<div class="field"><label>Start Date</label><input class="input" id="inp-item-start" type="date"></div>' +
        '<div class="field"><label>End Date</label><input class="input" id="inp-item-end" type="date"></div>' +
        '<div class="field"><label>Install Date</label><input class="input" id="inp-item-install" type="date"></div>' +
    '</div>' +
    '<p class="auth-error" id="item-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddItem()">Create</button></div>');
    setTimeout(() => document.getElementById('inp-item-name')?.focus(), 100);
}

async function doAddItem() {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-name').value.trim();
    const customer = document.getElementById('inp-item-customer').value.trim();
    const catId = document.getElementById('inp-item-cat').value;
    const startDate = document.getElementById('inp-item-start').value || null;
    const endDate = document.getElementById('inp-item-end').value || null;
    const installDate = document.getElementById('inp-item-install').value || null;
    if (!name) { errEl.textContent = 'ID / Name is required'; return; }
    try {
        await api('/projects', { method: 'POST', body: {
            name: name,
            categoryId: catId ? parseInt(catId) : null,
            startDate: startDate,
            endDate: endDate,
            customer: customer || '',
            installDate: installDate
        }});
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

    const assignedMembers = getProjectMembers(pid);
    const assignedIds = assignedMembers.map(m => m.id);

    const seen = new Set();
    const available = DB.members.filter(m => {
        if (assignedIds.includes(m.id)) return false;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

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
        <div class="field"><label>Customer</label><input class="input" id="inp-item-customer-edit" value="${esc(proj.customer || '')}" placeholder="e.g. Petronas"></div>
        <div class="field"><label>Category</label><select class="input" id="inp-item-cat-edit"><option value="">-- None --</option>${catOpts}</select></div>
        <div class="field"><label>Start Date</label><input class="input" id="inp-item-start-edit" type="date" value="${proj.startDate || ''}"></div>
        <div class="field"><label>End Date</label><input class="input" id="inp-item-end-edit" type="date" value="${proj.endDate || ''}"></div>
        <div class="field"><label>Install Date</label><input class="input" id="inp-item-install-edit" type="date" value="${proj.installDate || ''}"></div>
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

async function doEditItemFull(pid) {
    const errEl = document.getElementById('item-error');
    const name = document.getElementById('inp-item-edit').value.trim();
    const customer = document.getElementById('inp-item-customer-edit').value.trim();
    const catId = document.getElementById('inp-item-cat-edit').value;
    const startDate = document.getElementById('inp-item-start-edit').value || null;
    const endDate = document.getElementById('inp-item-end-edit').value || null;
    const installDate = document.getElementById('inp-item-install-edit').value || null;

    if (!name) { errEl.textContent = 'ID / Name is required'; return; }

    try {
        await api('/projects/' + pid, {
            method: 'PUT',
            body: {
                name: name,
                categoryId: catId ? parseInt(catId) : null,
                startDate: startDate,
                endDate: endDate,
                customer: customer || '',
                installDate: installDate
            }
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

async function doRemoveFromEdit(pid, memberId) {
    await api('/assignments', { method: 'DELETE', body: { projectId: pid, memberId: memberId } });
    await loadDB();
    showEditItem(pid);
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
   SECTION 10: Work Category DETAIL /Project  DETAIL
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
   SECTION 19: Work List
   ========================================================== */
var wlCurrentPage = 1;
var wlPageSize = 10;

function renderWorkList() {
    const view = document.getElementById('admin-worklist');

    // viewer 过滤 scope
    var viewerScopeIds = getViewerVisibleScopeIds();
    var visibleScopes = viewerScopeIds !== null
        ? DB.scopes.filter(function(s) { return viewerScopeIds.indexOf(s.id) !== -1; })
        : DB.scopes;

    var scopeFilterOpts = '<option value="">All Categories</option>' +
        visibleScopes.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');

    var addBtn = canEdit() ? '<button class="btn btn-green" onclick="showAddWorklist()">+ Add Work List</button>' : '';

    view.innerHTML =
        '<div class="app-header">' +
            '<h2>Work List</h2>' +
            '<div class="header-sub">Manage work items for attendance tracking</div>' +
        '</div>' +
        '<div class="app-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
                '<div style="display:flex;align-items:center;gap:10px">' +
                    '<label style="font-size:.82rem;color:var(--main-text3)">Filter by Category:</label>' +
                    '<select class="input" id="worklist-filter" onchange="wlFilterChanged()" style="width:180px;padding:8px 10px;font-size:.82rem">' + scopeFilterOpts + '</select>' +
                '</div>' +
                addBtn +
            '</div>' +
            '<div id="worklist-table-area"></div>' +
        '</div>';
    wlCurrentPage = 1;
    renderWorklistTable();
}

function wlFilterChanged() {
    wlCurrentPage = 1;
    renderWorklistTable();
}

function renderWorklistTable() {
    var filterScopeId = document.getElementById('worklist-filter') ? document.getElementById('worklist-filter').value : '';

    // viewer 过滤
    var viewerScopeIds = getViewerVisibleScopeIds();
    var baseList = viewerScopeIds !== null
        ? DB.worklist.filter(function(w) { return w.scopeId && viewerScopeIds.indexOf(w.scopeId) !== -1; })
        : DB.worklist;

    var filtered = filterScopeId
        ? baseList.filter(function(w) { return w.scopeId === parseInt(filterScopeId); })
        : baseList;

    var totalPages = Math.ceil(filtered.length / wlPageSize) || 1;
    if (wlCurrentPage > totalPages) wlCurrentPage = totalPages;
    if (wlCurrentPage < 1) wlCurrentPage = 1;
    var startIdx = (wlCurrentPage - 1) * wlPageSize;
    var endIdx = startIdx + wlPageSize;
    var pageData = filtered.slice(startIdx, endIdx);

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No work items found</td></tr>';
    } else {
        rows = pageData.map(function(w, idx) {
            var scope = w.scopeId ? DB.scopes.find(function(s) { return s.id === w.scopeId; }) : null;
            var actionCell = canEdit()
                ? '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditWorklist(' + w.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteWorklist(' + w.id + ')" title="Delete">&#10005;</button>' +
                  '</div></td>'
                : '<td></td>';
            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td>' + (scope ? '<span class="badge badge-scope">' + esc(scope.name) + '</span>' : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td style="font-weight:500">' + esc(w.title) + '</td>' +
                actionCell +
            '</tr>';
        }).join('');
    }

    // pagination 保持不变
    var paginationHtml = '';
    if (filtered.length > 0) {
        var showFrom = startIdx + 1;
        var showTo = Math.min(endIdx, filtered.length);
        var pageButtons = '';
        var maxVisible = 5;
        var startPage = Math.max(1, wlCurrentPage - Math.floor(maxVisible / 2));
        var endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goWlPage(1)" ' + (wlCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goWlPage(' + (wlCurrentPage - 1) + ')" ' + (wlCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goWlPage(' + p + ')" class="' + (p === wlCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goWlPage(' + (wlCurrentPage + 1) + ')" ' + (wlCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goWlPage(' + totalPages + ')" ' + (wlCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + filtered.length + ' items</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeWlPageSize(this.value)">' +
                        '<option value="5"' + (wlPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (wlPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (wlPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (wlPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (wlPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('worklist-table-area').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:50px">No</th>' +
            '<th style="width:160px">Category</th>' +
            '<th>Title</th>' +
            '<th style="width:90px">Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        paginationHtml;
}

function goWlPage(page) {
    var filterScopeId = document.getElementById('worklist-filter') ? document.getElementById('worklist-filter').value : '';
    var filtered = filterScopeId
        ? DB.worklist.filter(w => w.scopeId === parseInt(filterScopeId))
        : DB.worklist;
    var totalPages = Math.ceil(filtered.length / wlPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    wlCurrentPage = page;
    renderWorklistTable();
}

function changeWlPageSize(size) {
    wlPageSize = parseInt(size);
    wlCurrentPage = 1;
    renderWorklistTable();
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
   SECTION 7: ADMIN — USERS
   ========================================================== */

var usrCurrentPage = 1;
var usrPageSize = 10;
var usrSearchQuery = '';
var usrFilterRoles = [];
var usrFilterPositions = [];
var usrFilterDepts = [];

function renderUsersList() {
    var view = document.getElementById('admin-users');

    var posOpts = DB.positions.map(function(p) { return { value: p.id, label: p.name }; });
    var deptOpts = DB.departments.map(function(d) { return { value: d.id, label: d.name }; });

    view.innerHTML =
        '<div class="app-header"><h2>Users</h2><div class="header-sub">Manage accounts, salaries, positions and departments</div></div>' +
        '<div class="app-body">' +

            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
                    '<span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>' +
                '</div>' +
                '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                        '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Search</label>' +
                        '<input class="input" id="usr-search" placeholder="Name, username, position..." value="' + esc(usrSearchQuery) + '" oninput="usrSearchChanged()" style="max-width:220px;padding:8px 10px;font-size:.82rem">' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                        '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Position</label>' +
                        '<div style="min-width:140px">' + msGenerate('usr-ms-pos', posOpts, 'All Positions') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                        '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label>' +
                        '<div style="min-width:140px">' + msGenerate('usr-ms-dept', deptOpts, 'All Departments') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;margin-left:auto">' +
                        '<button class="btn btn-ghost btn-sm" onclick="resetUsrFilter()">Reset</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="section-head"><h2>All Users</h2><button class="btn btn-green" onclick="showAddUser()">+ Add User</button></div>' +
            '<div id="users-table-area"></div>' +
        '</div>';

    msOnChange('usr-ms-pos', function() { usrCurrentPage = 1; renderUsersTable(); });
    msOnChange('usr-ms-dept', function() { usrCurrentPage = 1; renderUsersTable(); });

    usrCurrentPage = 1;
    renderUsersTable();
}

function usrSearchChanged() {
    usrSearchQuery = document.getElementById('usr-search').value.trim().toLowerCase();
    usrCurrentPage = 1;
    renderUsersTable();
}

function usrFilterChanged() {
    usrCurrentPage = 1;
    renderUsersTable();
}

function resetUsrFilter() {
    usrSearchQuery = '';
    document.getElementById('usr-search').value = '';
    msClear('usr-ms-pos');
    msClear('usr-ms-dept');
    usrCurrentPage = 1;
    renderUsersTable();
}

function getFilteredUsers() {
    var posIds = [];
    var deptIds = [];
    try { posIds = msGetValues('usr-ms-pos') || []; } catch(e) {}
    try { deptIds = msGetValues('usr-ms-dept') || []; } catch(e) {}

    return DB.users.filter(function(u) {
        var member = u.memberId ? DB.members.find(function(m) { return m.id === u.memberId; }) : null;

        if (posIds.length > 0) {
            if (!member || !member.positionId) return false;
            var posMatch = false;
            for (var i = 0; i < posIds.length; i++) {
                if (String(posIds[i]) === String(member.positionId)) { posMatch = true; break; }
            }
            if (!posMatch) return false;
        }

        if (deptIds.length > 0) {
            if (!member || !member.departmentId) return false;
            var deptMatch = false;
            for (var i = 0; i < deptIds.length; i++) {
                if (String(deptIds[i]) === String(member.departmentId)) { deptMatch = true; break; }
            }
            if (!deptMatch) return false;
        }

        if (usrSearchQuery) {
            var posName = member && member.positionId ? getPositionName(member.positionId).toLowerCase() : '';
            var deptName = member && member.departmentId ? getDeptName(member.departmentId).toLowerCase() : '';
            var memberName = member ? member.name.toLowerCase() : '';
            var haystack = u.username.toLowerCase() + ' ' + memberName + ' ' + u.role + ' ' + posName + ' ' + deptName;
            if (haystack.indexOf(usrSearchQuery) === -1) return false;
        }

        return true;
    });
}

function renderUsersTable() {
    var filtered = getFilteredUsers();
    var totalPages = Math.ceil(filtered.length / usrPageSize) || 1;
    if (usrCurrentPage > totalPages) usrCurrentPage = totalPages;
    if (usrCurrentPage < 1) usrCurrentPage = 1;
    var startIdx = (usrCurrentPage - 1) * usrPageSize;
    var endIdx = startIdx + usrPageSize;
    var pageData = filtered.slice(startIdx, endIdx);

    var rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="9" style="text-align:center;color:var(--main-text3);padding:30px">No users found</td></tr>';
    } else {
        rows = pageData.map(function(u, idx) {
            var member = u.memberId ? DB.members.find(function(m) { return m.id === u.memberId; }) : null;
            var mName = member ? member.name : '—';
            var pos = member && member.positionId ? getPositionName(member.positionId) : '—';
            var dept = member && member.departmentId ? getDeptName(member.departmentId) : '—';
            var sal = member ? latestSalary(member) : null;
            var projs = member ? getMemberProjects(member.id) : [];
            var projHtml = projs.length ? projs.map(function(p) { return '<span class="badge badge-employee" style="margin:1px">' + esc(p.name) + '</span>'; }).join(' ') : '<span style="color:var(--main-text3)">None</span>';
            var roleClass = u.role === 'admin' ? 'badge-admin' : u.role === 'viewer' ? 'badge-viewer' : 'badge-employee';
            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td style="font-family:var(--font-m)">' + esc(u.username) + '</td>' +
                '<td>' + esc(mName) + '</td>' +
                '<td><span class="badge ' + roleClass + '">' + u.role + '</span></td>' +
                '<td>' + esc(pos) + '</td>' +
                '<td>' + esc(dept) + '</td>' +
                '<td>' + (sal != null && sal > 0 ? '<span class="salary-val">' + fmt(sal) + '</span>' : '<span class="salary-na">Not set</span>') + '</td>' +
                '<td>' + projHtml + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditUser(' + u.id + ')" title="Edit">&#9998;</button>' +
                    (u.username !== 'admin' ? '<button class="btn-icon danger" onclick="confirmDeleteUser(' + u.id + ')" title="Delete">&#10005;</button>' : '') +
                '</div></td></tr>';
        }).join('');
    }

    var paginationHtml = '';
    if (filtered.length > 0) {
        var showFrom = startIdx + 1;
        var showTo = Math.min(endIdx, filtered.length);
        var pageButtons = '';
        var maxVisible = 5;
        var startPage = Math.max(1, usrCurrentPage - Math.floor(maxVisible / 2));
        var endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goUsrPage(1)" ' + (usrCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goUsrPage(' + (usrCurrentPage - 1) + ')" ' + (usrCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goUsrPage(' + p + ')" class="' + (p === usrCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goUsrPage(' + (usrCurrentPage + 1) + ')" ' + (usrCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goUsrPage(' + totalPages + ')" ' + (usrCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + filtered.length + ' users</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeUsrPageSize(this.value)">' +
                        '<option value="5"' + (usrPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (usrPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (usrPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (usrPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (usrPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }
    document.getElementById('users-table-area').innerHTML =
    '<div class="table-wrap"><table><thead><tr>' +
        '<th style="width:50px">No</th><th>Username</th><th>Name</th><th>Role</th><th>Position</th><th>Department</th><th>Salary</th><th>Projects</th><th style="width:90px">Actions</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    paginationHtml;
}

function goUsrPage(page) {
    var filtered = getFilteredUsers();
    var totalPages = Math.ceil(filtered.length / usrPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    usrCurrentPage = page;
    renderUsersTable();
}

function changeUsrPageSize(size) {
    usrPageSize = parseInt(size);
    usrCurrentPage = 1;
    renderUsersTable();
}

function showAddUser() {
    var posOpts = DB.positions.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var deptOpts = DB.departments.map(function(d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');

    var viewerScopesHtml = '';
    viewerScopesHtml += '<div id="viewer-scope-fields" style="display:none">' +
        '<div class="field"><label>Work Category Access</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">';
    DB.scopes.forEach(function(s) {
        viewerScopesHtml += '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">' +
            '<input type="checkbox" class="add-viewer-scope-cb" value="' + s.id + '"> ' + esc(s.name) +
        '</label>';
    });
    viewerScopesHtml += '</div></div></div>';

    showModal('<h3>Add User</h3>' +
        '<div class="field"><label>Role</label><select class="input" id="adduser-role" onchange="toggleAddUserFields()"><option value="employee">Employee</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></div>' +
        '<div id="emp-fields">' +
            '<div class="field"><label>Full Name</label><input class="input" id="adduser-name" placeholder="e.g. John Smith"></div>' +
            '<div class="field"><label>Position</label><select class="input" id="adduser-pos"><option value="">None</option>' + posOpts + '</select></div>' +
            '<div class="field"><label>Department</label><select class="input" id="adduser-dept"><option value="">None</option>' + deptOpts + '</select></div>' +
            '<div class="field"><label>Monthly Salary</label><input class="input input-mono" id="adduser-salary" type="number" placeholder="e.g. 15000.00"></div>' +
        '</div>' +
        viewerScopesHtml +
        '<div class="field"><label>Username</label><input class="input" id="adduser-user" placeholder="Login username"></div>' +
        '<div class="field"><label>Password</label><input class="input" id="adduser-pass" type="password" placeholder="Min. 6 characters"></div>' +
        '<p class="auth-error" id="adduser-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddUser()">Create</button></div>');
    setTimeout(function() { var el = document.getElementById('adduser-name'); if (el) el.focus(); }, 100);
}

function toggleAddUserFields() {
    var role = document.getElementById('adduser-role').value;
    document.getElementById('emp-fields').style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    document.getElementById('viewer-scope-fields').style.display = role === 'viewer' ? '' : 'none';
}

async function doAddUser() {
    var role = document.getElementById('adduser-role').value;
    var username = document.getElementById('adduser-user').value.trim();
    var pass = document.getElementById('adduser-pass').value;
    var errEl = document.getElementById('adduser-error'); errEl.textContent = '';
    if (!username) { errEl.textContent = 'Enter a username'; return; }
    if (username.length < 2) { errEl.textContent = 'Min 2 characters'; return; }
    if (pass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    var memberId = null;
    if (role === 'employee' || role === 'viewer') {
        var name = document.getElementById('adduser-name').value.trim();
        if (!name) { errEl.textContent = 'Enter a name'; return; }
        var posId = document.getElementById('adduser-pos').value;
        var deptId = document.getElementById('adduser-dept').value;
        var sal = parseFloat(document.getElementById('adduser-salary').value);
        var now = new Date().toISOString().slice(0, 7);

        var memberResult = await api('/members', {
            method: 'POST',
            body: { name: name, positionId: posId ? parseInt(posId) : null, departmentId: deptId ? parseInt(deptId) : null }
        });
        memberId = memberResult.id;

        if (!isNaN(sal) && sal > 0) {
            await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: sal } });
        }
    }

    try {
        var result = await api('/users', { method: 'POST', body: { username: username, password: pass, role: role, memberId: memberId } });

        // 保存 viewer 的额外 scope
        if (role === 'viewer' && result && result.id) {
            var cbs = document.querySelectorAll('.add-viewer-scope-cb:checked');
            var scopeIds = [];
            cbs.forEach(function(cb) { scopeIds.push(parseInt(cb.value)); });
            if (scopeIds.length > 0) {
                await api('/viewer-scopes/' + result.id, {
                    method: 'PUT',
                    body: { scopeIds: scopeIds }
                });
            }
        }
    } catch (ex) {
        errEl.textContent = ex.message; return;
    }

    hideModal(); await loadDB(); renderUsersList();
}

function showEditUser(userId) {
    var user = DB.users.find(function(u) { return u.id === userId; }); if (!user) return;
    var member = user.memberId ? DB.members.find(function(m) { return m.id === user.memberId; }) : null;
    var posOpts = DB.positions.map(function(p) { var sel = member && member.positionId === p.id ? 'selected' : ''; return '<option value="' + p.id + '" ' + sel + '>' + esc(p.name) + '</option>'; }).join('');
    var deptOpts = DB.departments.map(function(d) { var sel = member && member.departmentId === d.id ? 'selected' : ''; return '<option value="' + d.id + '" ' + sel + '>' + esc(d.name) + '</option>'; }).join('');

    var html = '<h3>Edit — ' + esc(user.username) + '</h3>';

    // Member fields — 不管有没有 member 都渲染（admin 切换 role 时需要）
    html += '<div id="edit-member-fields"' + (user.role === 'admin' ? ' style="display:none"' : '') + '>';
    var curSal = member ? latestSalary(member) : 0;
    html += '<div class="field"><label>Full Name</label><input class="input" id="edituser-name" value="' + (member ? esc(member.name) : '') + '"></div>' +
        '<div class="field"><label>Position</label><select class="input" id="edituser-pos"><option value="">None</option>' + posOpts + '</select></div>' +
        '<div class="field"><label>Department</label><select class="input" id="edituser-dept"><option value="">None</option>' + deptOpts + '</select></div>' +
        '<div class="field"><label>Monthly Salary</label><input class="input input-mono" id="edituser-salary" type="number" value="' + (curSal > 0 ? curSal : '') + '" placeholder="e.g. 15000.00"></div>';
    html += '</div>';

    // Viewer scope
    var existing = (DB.viewerScopes || {})[user.id] || [];
    html += '<div id="edit-viewer-scope-fields"' + (user.role !== 'viewer' ? ' style="display:none"' : '') + '>' +
        '<div class="field"><label>Work Category Access</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">';
    DB.scopes.forEach(function(s) {
        var checked = existing.indexOf(s.id) !== -1 ? ' checked' : '';
        html += '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">' +
            '<input type="checkbox" class="viewer-scope-cb" value="' + s.id + '"' + checked + '> ' + esc(s.name) +
        '</label>';
    });
    html += '</div></div></div>';

    html += '<div class="field"><label>Username</label><input class="input" id="edituser-user" value="' + esc(user.username) + '"></div>' +
        '<div class="field"><label>New Password (blank = keep)</label><input class="input" id="edituser-pass" type="password" placeholder="Leave blank"></div>' +
        '<div class="field"><label>Role</label><select class="input" id="edituser-role" onchange="toggleEditUserFields()">' +
            '<option value="admin" ' + (user.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
            '<option value="viewer" ' + (user.role === 'viewer' ? 'selected' : '') + '>Viewer</option>' +
            '<option value="employee" ' + (user.role === 'employee' ? 'selected' : '') + '>Employee</option>' +
        '</select></div>' +
        '<p class="auth-error" id="edituser-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditUser(' + user.id + ')">Save</button></div>';

    showModal(html);
}

function toggleEditUserFields() {
    var role = document.getElementById('edituser-role').value;
    var memberFields = document.getElementById('edit-member-fields');
    var viewerFields = document.getElementById('edit-viewer-scope-fields');
    if (memberFields) memberFields.style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    if (viewerFields) viewerFields.style.display = role === 'viewer' ? '' : 'none';
}

async function doEditUser(userId) {
    var user = DB.users.find(function(u) { return u.id === userId; }); if (!user) return;
    var errEl = document.getElementById('edituser-error');
    var newUsername = document.getElementById('edituser-user').value.trim();
    var newPass = document.getElementById('edituser-pass').value;
    var newRole = document.getElementById('edituser-role').value;
    if (!newUsername) { errEl.textContent = 'Username cannot be empty'; return; }
    if (newPass && newPass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    // 如果从 admin 改成 employee/viewer，需要创建 member
    var memberId = user.memberId;
    if (!memberId && (newRole === 'employee' || newRole === 'viewer')) {
        var nameEl = document.getElementById('edituser-name');
        var posEl = document.getElementById('edituser-pos');
        var deptEl = document.getElementById('edituser-dept');
        var salEl = document.getElementById('edituser-salary');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { errEl.textContent = 'Enter a name'; return; }
        var posId = posEl ? posEl.value : '';
        var deptId = deptEl ? deptEl.value : '';
        var sal = salEl ? parseFloat(salEl.value) : 0;
        var now = new Date().toISOString().slice(0, 7);

        var memberResult = await api('/members', {
            method: 'POST',
            body: {
                name: name,
                positionId: posId ? parseInt(posId) : null,
                departmentId: deptId ? parseInt(deptId) : null
            }
        });
        memberId = memberResult.id;

        if (!isNaN(sal) && sal > 0) {
            await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: sal } });
        }
    }

    // 更新 user
    await api('/users/' + userId, {
        method: 'PUT',
        body: { username: newUsername, password: newPass || null, role: newRole, memberId: memberId }
    });

    // 更新 member（已有 member 时）
    if (memberId && (newRole === 'employee' || newRole === 'viewer')) {
        var nameEl = document.getElementById('edituser-name');
        var posEl = document.getElementById('edituser-pos');
        var deptEl = document.getElementById('edituser-dept');
        var salEl = document.getElementById('edituser-salary');
        var name = nameEl ? nameEl.value.trim() : null;
        var posId = posEl ? (posEl.value ? parseInt(posEl.value) : null) : undefined;
        var deptId = deptEl ? (deptEl.value ? parseInt(deptEl.value) : null) : undefined;

        if (name || posId !== undefined || deptId !== undefined) {
            var member = DB.members.find(function(m) { return m.id === memberId; });
            await api('/members/' + memberId, {
                method: 'PUT',
                body: {
                    name: name || (member ? member.name : ''),
                    positionId: posId !== undefined ? posId : (member ? member.positionId : null),
                    departmentId: deptId !== undefined ? deptId : (member ? member.departmentId : null)
                }
            });
        }

        if (salEl) {
            var rawVal = salEl.value.trim();
            var val = parseFloat(rawVal);
            var now = new Date().toISOString().slice(0, 7);
            await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: (!isNaN(val) && val > 0) ? val : 0 } });
        }
    }

    // 保存 viewer scope
    if (newRole === 'viewer') {
        var cbs = document.querySelectorAll('.viewer-scope-cb:checked');
        var scopeIds = [];
        cbs.forEach(function(cb) { scopeIds.push(parseInt(cb.value)); });
        await api('/viewer-scopes/' + userId, {
            method: 'PUT',
            body: { scopeIds: scopeIds }
        });
    }

    hideModal(); await loadDB(); renderUsersList();
}

function confirmDeleteUser(userId) {
    var user = DB.users.find(function(u) { return u.id === userId; }); if (!user || user.username === 'admin') return;
    showModal('<h3>Delete User</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(user.username) + '</strong>?<br>' + (user.memberId ? 'Member profile, salary and attendance will be deleted.' : '') + '</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteUser(' + userId + ')">Delete</button></div>');
}

async function doDeleteUser(userId) {
    await api('/users/' + userId, { method: 'DELETE' });
    hideModal(); await loadDB(); renderUsersList();
}


/* ==========================================================
   SECTION 8: ADMIN — POSITIONS
   ========================================================== */

var posCurrentPage = 1;
var posPageSize = 10;

function renderPositionsList() {
    const view = document.getElementById('admin-positions');

    view.innerHTML = `
    <div class="app-header"><h2>Positions</h2><div class="header-sub">Manage job positions</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Positions</h2><button class="btn btn-green" onclick="showAddPosition()">+ New Position</button></div>
      <div id="positions-table-area"></div>
    </div>`;

    posCurrentPage = 1;
    renderPositionsTable();
}

function renderPositionsTable() {
    const totalPages = Math.ceil(DB.positions.length / posPageSize) || 1;
    if (posCurrentPage > totalPages) posCurrentPage = totalPages;
    if (posCurrentPage < 1) posCurrentPage = 1;
    const startIdx = (posCurrentPage - 1) * posPageSize;
    const endIdx = startIdx + posPageSize;
    const pageData = DB.positions.slice(startIdx, endIdx);

    let rows = '';
    if (DB.positions.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No positions defined</td></tr>';
    } else {
        rows = pageData.map((p, index) => {
            const count = DB.members.filter(m => m.positionId === p.id).length;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx + index + 1}</td>
                <td style="font-weight:500">${esc(p.name)}</td>
                <td style="text-align:center;font-family:var(--font-m)">${count}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditPosition(${p.id})">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeletePosition(${p.id})">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    // Pagination
    let paginationHtml = '';
    if (DB.positions.length > 0) {
        const showFrom = startIdx + 1;
        const showTo = Math.min(endIdx, DB.positions.length);
        let pageButtons = '';
        const maxVisible = 5;
        let startPage = Math.max(1, posCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goPosPage(1)" ' + (posCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goPosPage(' + (posCurrentPage - 1) + ')" ' + (posCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (let p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goPosPage(' + p + ')" class="' + (p === posCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goPosPage(' + (posCurrentPage + 1) + ')" ' + (posCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goPosPage(' + totalPages + ')" ' + (posCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + DB.positions.length + ' positions</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changePosPageSize(this.value)">' +
                        '<option value="5"' + (posPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (posPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (posPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (posPageSize === 50 ? ' selected' : '') + '>50</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('positions-table-area').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:50px">No</th><th>Position Name</th><th style="width:100px">Members</th><th style="width:90px">Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        paginationHtml;
}

function goPosPage(page) {
    const totalPages = Math.ceil(DB.positions.length / posPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    posCurrentPage = page;
    renderPositionsTable();
}

function changePosPageSize(size) {
    posPageSize = parseInt(size);
    posCurrentPage = 1;
    renderPositionsTable();
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

var deptCurrentPage = 1;
var deptPageSize = 10;

function renderDepartmentsList() {
    const view = document.getElementById('admin-departments');

    view.innerHTML = `
    <div class="app-header"><h2>Departments</h2><div class="header-sub">Manage departments</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Departments</h2><button class="btn btn-green" onclick="showAddDepartment()">+ New Department</button></div>
      <div id="departments-table-area"></div>
    </div>`;

    deptCurrentPage = 1;
    renderDepartmentsTable();
}

function renderDepartmentsTable() {
    const totalPages = Math.ceil(DB.departments.length / deptPageSize) || 1;
    if (deptCurrentPage > totalPages) deptCurrentPage = totalPages;
    if (deptCurrentPage < 1) deptCurrentPage = 1;
    const startIdx = (deptCurrentPage - 1) * deptPageSize;
    const endIdx = startIdx + deptPageSize;
    const pageData = DB.departments.slice(startIdx, endIdx);

    let rows = '';
    if (DB.departments.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No departments defined</td></tr>';
    } else {
        rows = pageData.map((d, index) => {
            const count = DB.members.filter(m => m.departmentId === d.id).length;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx + index + 1}</td>
                <td style="font-weight:500">${esc(d.name)}</td>
                <td style="text-align:center;font-family:var(--font-m)">${count}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditDepartment(${d.id})">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeleteDepartment(${d.id})">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    // Pagination
    let paginationHtml = '';
    if (DB.departments.length > 0) {
        const showFrom = startIdx + 1;
        const showTo = Math.min(endIdx, DB.departments.length);
        let pageButtons = '';
        const maxVisible = 5;
        let startPage = Math.max(1, deptCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
        pageButtons += '<button onclick="goDeptPage(1)" ' + (deptCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goDeptPage(' + (deptCurrentPage - 1) + ')" ' + (deptCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (let p = startPage; p <= endPage; p++) {
            pageButtons += '<button onclick="goDeptPage(' + p + ')" class="' + (p === deptCurrentPage ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goDeptPage(' + (deptCurrentPage + 1) + ')" ' + (deptCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goDeptPage(' + totalPages + ')" ' + (deptCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + DB.departments.length + ' departments</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeDeptPageSize(this.value)">' +
                        '<option value="5"' + (deptPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (deptPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (deptPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (deptPageSize === 50 ? ' selected' : '') + '>50</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('departments-table-area').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:50px">No</th><th>Department Name</th><th style="width:100px">Members</th><th style="width:90px">Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        paginationHtml;
}

function goDeptPage(page) {
    const totalPages = Math.ceil(DB.departments.length / deptPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    deptCurrentPage = page;
    renderDepartmentsTable();
}

function changeDeptPageSize(size) {
    deptPageSize = parseInt(size);
    deptCurrentPage = 1;
    renderDepartmentsTable();
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
   SECTION 11: EMPLOYEE — MY ITEMS/MY WORK CATEGORY (grouped by Scope + Item Summary)
   ========================================================== */

var empItemSummaryPage = 1;
var empItemSummaryPageSize = 10;
var empItemSummaryData = [];
var empScopePages = {};
var empScopeSearch = {};

function renderEmployeeProjects() {
    empScopeSearch = {};

    if (!currentUser || !currentUser.memberId) return;
    var member = DB.members.find(function(m) { return m.id === currentUser.memberId; });
    if (!member) return;
    var assignedProjs = getMemberProjects(member.id);
    var assignedIds = new Set(assignedProjs.map(function(p) { return p.id; }));

    var groups = {};
    DB.scopes.forEach(function(s) {
        var isPic = s.picMemberIds && s.picMemberIds.indexOf(member.id) !== -1;
        var items;
        if (isPic) {
            items = DB.projects.filter(function(p) { return p.categoryId === s.id; });
        } else {
            items = assignedProjs.filter(function(p) { return p.categoryId === s.id; });
        }
        if (items.length > 0) {
            groups[s.id] = { scope: s, items: items, isPic: isPic };
        }
    });

    var uncatItems = assignedProjs.filter(function(p) { return !p.categoryId; });
    if (uncatItems.length > 0) {
        groups[0] = { scope: { id: 0, name: 'Uncategorized', picMemberIds: [] }, items: uncatItems, isPic: false };
    }

    empScopePages = {};
    var scopeSections = '';

    if (Object.keys(groups).length === 0) {
        scopeSections = '<div class="empty"><div class="icon">&#128193;</div><p>Not assigned to any</p></div>';
    } else {
        Object.values(groups).forEach(function(g) {
            var scopeId = g.scope.id;
            var isPic = g.isPic;

            var itemsData = g.items.map(function(p) {
                var mc = getProjectMembers(p.id).length;
                var cd = getProjectCountdown(p);
                var cdHtml = '\u2014';
                if (cd !== null) {
                    if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">' + cd + ' days left</span>';
                    else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">' + cd + ' days left</span>';
                    else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">' + cd + ' days left</span>';
                    else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Due today!</span>';
                    else cdHtml = '<span style="color:var(--danger);font-weight:600">' + Math.abs(cd) + ' days overdue</span>';
                }
                var fmtDate = function(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'; };
                return {
                    id: p.id,
                    name: esc(p.name),
                    customer: esc(p.customer || '\u2014'),
                    timeline: fmtDate(p.startDate) + ' \u2014 ' + fmtDate(p.endDate),
                    startDateRaw: p.startDate ? p.startDate.slice(0, 10) : '',
                    endDateRaw: p.endDate ? p.endDate.slice(0, 10) : '',
                    installDateRaw: p.installDate ? p.installDate.slice(0, 10) : '',
                    startDateFmt: formatDateDMY(p.startDate),
                    endDateFmt: formatDateDMY(p.endDate),
                    installDateFmt: formatDateDMY(p.installDate),
                    team: mc + ' member' + (mc !== 1 ? 's' : ''),
                    cdHtml: cdHtml
                };
            });

            empScopePages[scopeId] = { page: 1, pageSize: 5, data: itemsData, isPic: isPic, scopeId: scopeId };

            var picBadge = isPic ? ' <span class="badge badge-scope" style="font-size:.68rem;padding:2px 6px;vertical-align:middle">(You Are PIC)</span>' : '';

            scopeSections += '<div class="collapse-section" style="margin-bottom:12px">' +
                '<div class="collapse-header" onclick="toggleCollapse(\'scope-' + scopeId + '\')">' +
                    '<div style="display:flex;align-items:center;gap:10px">' +
                        '<span class="collapse-arrow" id="scope-' + scopeId + '-arrow">&#9654;</span>' +
                        '<span style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">' + esc(g.scope.name) + '</span>' +
                        picBadge +
                        '<span style="font-size:.82rem;color:var(--main-text3)">' + g.items.length + ' item' + (g.items.length !== 1 ? 's' : '') + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="collapse-content" id="scope-' + scopeId + '-content" style="display:none;padding-top:8px">' +
                    '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">' +
                        '<input class="input" id="scope-search-' + scopeId + '" placeholder="Search all columns..." value="' + esc(empScopeSearch[scopeId] || '') + '" oninput="scopeSearchChanged(' + scopeId + ')" style="max-width:260px;padding:7px 10px;font-size:.82rem;margin-right:auto">' +
                        (isPic ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
                            '<a class="btn btn-accent btn-sm" href="/api/template/projects/' + scopeId + '" style="text-decoration:none">Template Download</a>' +
                            '<label class="btn btn-blue btn-sm" style="cursor:pointer">Import Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="empHandleScopeImport(' + scopeId + ',this)"></label>' +
                            '<button class="btn btn-green btn-sm" onclick="empShowAddItem(' + scopeId + ')">+ Add Item</button>' +
                        '</div>' : '') +
                    '</div>' +
                '<div id="scope-items-table-' + scopeId + '"></div>' +
            '</div>';
        });
    }

    buildEmpItemSummaryData(member.id);
    var summaryHtml = empItemSummaryData.length > 0 ? '<div id="emp-item-summary-area"></div>' : '';

    document.getElementById('emp-myprojects').innerHTML =
        '<div class="app-header"><h2>My Work Category Details</h2><div class="header-sub">Items you are involved in</div></div>' +
        '<div class="app-body" style="max-width:none">' +
            '<div class="emp-card">' +
                '<div class="emp-name">' + esc(member.name) + '</div>' +
                '<div class="emp-project">Position: ' + esc(getPositionName(member.positionId)) + ' &nbsp;|&nbsp; Department: ' + esc(getDeptName(member.departmentId)) + '</div>' +
                '<div class="emp-project" style="margin-bottom:8px">Work Assigned: <strong>' + assignedProjs.length + '</strong></div>' +
            '</div>' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">' +
                '<div style="padding:12px 20px;border-bottom:1px solid var(--main-border)"><h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);letter-spacing:.02em;margin:0">Attendance Summary</h2></div>' +
                '<div style="padding:20px">' + summaryHtml + '</div>' +
            '</div>' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden">' +
                '<div style="padding:12px 20px;border-bottom:1px solid var(--main-border)"><h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);letter-spacing:.02em;margin:0">Work Contributed</h2></div>' +
                '<div style="padding:20px">' + scopeSections + '</div>' +
            '</div>' +
        '</div>';

    if (empItemSummaryData.length > 0) {
        empItemSummaryPage = 1;
        renderEmpItemSummaryTable();
    }
    Object.keys(empScopePages).forEach(function(sid) {
        renderScopeItemsTable(parseInt(sid));
    });
}
// search
function scopeSearchChanged(scopeId) {
    empScopeSearch[scopeId] = document.getElementById('scope-search-' + scopeId).value.trim().toLowerCase();
    var sp = empScopePages[scopeId];
    if (sp) sp.page = 1;
    renderScopeItemsTable(scopeId);
}

// ========== Employee PIC Import ==========
var empImportScopeId = null;


async function empHandleScopeImport(scopeId, input) {
    var file = input.files[0];
    if (!file) return;
    empImportScopeId = scopeId;

    var scope = DB.scopes.find(function(s) { return s.id === scopeId; });
    var scopeName = scope ? scope.name : '';

    var reader = new FileReader();
    reader.onload = async function(e) {
        try {
            // e.target.result is ArrayBuffer from readAsArrayBuffer
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (rows.length === 0) {
                alert('File is empty');
                input.value = '';
                return;
            }

            var headers = Object.keys(rows[0]);
            var previewRows = rows.slice(0, 5);

            var previewHtml = '<div style="margin-top:10px;font-size:.85rem;color:var(--main-text3)">Preview (' + rows.length + ' rows total)</div>' +
                '<div class="import-preview"><table><thead><tr>' + headers.map(function(h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
                previewRows.map(function(row) { return '<tr>' + headers.map(function(h) { return '<td>' + esc(String(row[h])) + '</td>'; }).join('') + '</tr>'; }).join('') +
                (rows.length > 5 ? '<tr><td colspan="' + headers.length + '" style="text-align:center;color:var(--main-text3)">... ' + (rows.length - 5) + ' more</td></tr>' : '') +
                '</tbody></table></div>';

            // Convert ArrayBuffer to base64
            var bytes = new Uint8Array(e.target.result);
            var binary = '';
            for (var i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            empImportBase64 = btoa(binary);
            empImportFilename = file.name;

            showModal('<h3>Import to ' + esc(scopeName) + '</h3>' +
                previewHtml +
                '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
                    '<button class="btn btn-ghost" onclick="hideModal();empImportBase64=null">Cancel</button>' +
                    '<button class="btn btn-accent" onclick="empDoScopeImport(' + scopeId + ')">Import ' + rows.length + ' Rows</button>' +
                '</div>');
        } catch (err) {
            alert('Error reading file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
}

var empImportBase64 = null;
var empImportFilename = '';

async function empDoScopeImport(scopeId) {
    if (!empImportBase64) return;
    try {
        var result = await api('/import/projects', {
            method: 'POST',
            body: {
                filename: empImportFilename,
                data: empImportBase64,
                categoryId: scopeId
            }
        });
        hideModal();
        empImportBase64 = null;

        var msg = 'Imported: ' + result.inserted + ', Skipped: ' + result.skipped;
        if (result.errors && result.errors.length > 0) {
            msg += '\n\n' + result.errors.join('\n');
        }
        alert(msg);

        await loadDB();
        renderEmployeeProjects();
    } catch (e) {
        alert('Import failed: ' + e.message);
    }
}

/* ---------- Employee PIC Item CRUD ---------- */

function empShowAddItem(scopeId) {
    var scope = DB.scopes.find(function(s) { return s.id === scopeId; });
    var scopeName = scope ? scope.name : '';
    showModal('<h3>Add Item to ' + esc(scopeName) + '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div class="field"><label>ID / Name</label><input class="input" id="emp-inp-item-name" placeholder="e.g. PLC-001 Panel"></div>' +
            '<div class="field"><label>Customer</label><input class="input" id="emp-inp-customer" placeholder="e.g. Petronas"></div>' +
            '<div class="field"><label>Start Date</label><input class="input" id="emp-inp-item-start" type="date"></div>' +
            '<div class="field"><label>End Date</label><input class="input" id="emp-inp-item-end" type="date"></div>' +
            '<div class="field"><label>Install Date</label><input class="input" id="emp-inp-item-install" type="date"></div>' +
        '</div>' +
        '<p class="auth-error" id="emp-item-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="empDoAddItem(' + scopeId + ')">Create</button></div>');
    setTimeout(function() { document.getElementById('emp-inp-item-name').focus(); }, 100);
}

async function empDoAddItem(scopeId) {
    var errEl = document.getElementById('emp-item-error');
    var name = document.getElementById('emp-inp-item-name').value.trim();
    var customerName = document.getElementById('emp-inp-customer').value.trim();
    var startDate = document.getElementById('emp-inp-item-start').value || null;
    var endDate = document.getElementById('emp-inp-item-end').value || null;
    var installDate = document.getElementById('emp-inp-item-install').value || null;
    if (!name) { errEl.textContent = 'ID / Name is required'; return; }
    try {
        await api('/projects', { method: 'POST', body: {
            name: name, categoryId: scopeId, startDate: startDate, endDate: endDate,
            customer: customerName || null, installDate: installDate
        }});
        hideModal(); await loadDB(); renderEmployeeProjects();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}


/* ---------- Edit Item — 加 Install Date ---------- */

function empShowEditItem(pid) {
    var proj = DB.projects.find(function(p) { return p.id === pid; });
    if (!proj) return;
    var cd = getProjectCountdown(proj);
    var cdHtml = '\u2014';
    if (cd !== null) {
        if (cd > 30) cdHtml = '<span style="color:var(--ok)">' + cd + ' days left</span>';
        else if (cd > 7) cdHtml = '<span style="color:var(--warning)">' + cd + ' days left</span>';
        else if (cd > 0) cdHtml = '<span style="color:var(--danger)">' + cd + ' days left</span>';
        else if (cd === 0) cdHtml = '<span style="color:var(--warning)">Due today</span>';
        else cdHtml = '<span style="color:var(--danger)">' + Math.abs(cd) + ' days overdue</span>';
    }
    showModal('<h3>Edit Item</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div class="field"><label>ID / Name</label><input class="input" id="emp-inp-item-edit" value="' + esc(proj.name) + '"></div>' +
            '<div class="field"><label>Customer</label><input class="input" id="emp-inp-customer-edit" value="' + esc(proj.customer || '') + '"></div>' +
            '<div class="field"><label>Start Date</label><input class="input" id="emp-inp-item-start-edit" type="date" value="' + (proj.startDate || '') + '"></div>' +
            '<div class="field"><label>End Date</label><input class="input" id="emp-inp-item-end-edit" type="date" value="' + (proj.endDate || '') + '"></div>' +
            '<div class="field"><label>Install Date</label><input class="input" id="emp-inp-item-install-edit" type="date" value="' + (proj.installDate || '') + '"></div>' +
            '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase">Countdown</span><span style="font-size:.9rem">' + cdHtml + '</span></div>' +
        '</div>' +
        '<p class="auth-error" id="emp-item-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="empDoEditItem(' + pid + ')">Save</button></div>');
    setTimeout(function() { var el = document.getElementById('emp-inp-item-edit'); el.focus(); el.select(); }, 100);
}

async function empDoEditItem(pid) {
    var errEl = document.getElementById('emp-item-error');
    var proj = DB.projects.find(function(p) { return p.id === pid; });
    var name = document.getElementById('emp-inp-item-edit').value.trim();
    var customerName = document.getElementById('emp-inp-customer-edit').value.trim();
    var startDate = document.getElementById('emp-inp-item-start-edit').value || null;
    var endDate = document.getElementById('emp-inp-item-end-edit').value || null;
    var installDate = document.getElementById('emp-inp-item-install-edit').value || null;
    if (!name) { errEl.textContent = 'ID / Name is required'; return; }
    try {
        await api('/projects/' + pid, { method: 'PUT', body: {
            name: name, categoryId: proj ? proj.categoryId : null,
            startDate: startDate, endDate: endDate,
            customer: customerName || null, installDate: installDate
        }});
        hideModal(); await loadDB(); renderEmployeeProjects();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function empConfirmDeleteItem(pid) {
    var p = DB.projects.find(function(x) { return x.id === pid; });
    if (!p) return;
    showModal('<h3>Delete Item</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">' + esc(p.name) + '</strong>?</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="empDoDeleteItem(' + pid + ')">Delete</button></div>');
}

async function empDoDeleteItem(pid) {
    try {
        await api('/projects/' + pid, { method: 'DELETE' });
        hideModal(); await loadDB(); renderEmployeeProjects();
    } catch (e) { alert('Failed: ' + e.message); }
}

function toggleCollapse(sectionId) {
    var content = document.getElementById(sectionId + '-content');
    var arrow = document.getElementById(sectionId + '-arrow');
    if (!content || !arrow) return;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        content.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}

/* ---------- Summary Table ---------- */

function buildEmpItemSummaryData(memberId) {
    var myEntries = DB.attendance.filter(function(a) { return a.memberId === memberId && a.clockIn && a.clockOut; });
    empItemSummaryData = [];
    if (myEntries.length === 0) return;

    var itemGroups = {};
    myEntries.forEach(function(r) {
        var pid = r.projectId || 0;
        if (!itemGroups[pid]) itemGroups[pid] = { ms: 0, cost: 0, entries: 0 };
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        itemGroups[pid].ms += ms;
        itemGroups[pid].cost += (getEntryCost(r.memberId, ms) || 0);
        itemGroups[pid].entries++;
    });

    Object.keys(itemGroups).forEach(function(pid) {
        var data = itemGroups[pid];
        var proj = pid === '0' ? null : DB.projects.find(function(p) { return p.id === parseInt(pid); });
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var label = proj ? (scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name)) : '<span style="color:var(--main-text3)">Unassigned</span>';
        empItemSummaryData.push({ label: label, entries: data.entries, hours: data.ms, cost: data.cost });
    });
}

function renderEmpItemSummaryTable() {
    var data = empItemSummaryData;
    var totalPages = Math.ceil(data.length / empItemSummaryPageSize) || 1;
    if (empItemSummaryPage > totalPages) empItemSummaryPage = totalPages;
    if (empItemSummaryPage < 1) empItemSummaryPage = 1;
    var startIdx = (empItemSummaryPage - 1) * empItemSummaryPageSize;
    var pageData = data.slice(startIdx, startIdx + empItemSummaryPageSize);

    var rows = '';
    if (data.length === 0) {
        rows = '<tr><td colspan="5" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>';
    } else {
        rows = pageData.map(function(r, idx) {
            return '<tr><td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td>' + r.label +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + r.entries +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + formatDuration(r.hours) +
                '</td><td style="text-align:right;font-family:var(--font-m)">' + fmtCost(r.cost) + '</td></tr>';
        }).join('');
    }

    var paginationHtml = buildRptPagination(data.length, empItemSummaryPage, empItemSummaryPageSize, 'goEmpItemSummaryPage', 'changeEmpItemSummaryPageSize');

    document.getElementById('emp-item-summary-area').innerHTML =
        '<div class="collapse-section" style="margin-bottom:16px">' +
            '<div class="collapse-header" onclick="toggleCollapse(\'emp-summary\')">' +
                '<div style="display:flex;align-items:center;gap:10px">' +
                    '<span class="collapse-arrow" id="emp-summary-arrow" style="transform:rotate(90deg)">&#9654;</span>' +
                    '<span style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">Attendance Overview</span>' +
                    '<span style="font-size:.82rem;color:var(--main-text3)">' + data.length + ' items</span>' +
                '</div>' +
            '</div>' +
            '<div class="collapse-content" id="emp-summary-content" style="display:block;padding-top:8px">' +
                '<div class="table-wrap"><table>' +
                    '<thead><tr><th style="width:50px">No</th><th>Work Category &rarr; ID/Name</th><th style="text-align:right">Records</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table></div>' +
                paginationHtml +
            '</div>' +
        '</div>';
}

function goEmpItemSummaryPage(page) {
    var totalPages = Math.ceil(empItemSummaryData.length / empItemSummaryPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    empItemSummaryPage = page;
    renderEmpItemSummaryTable();
}

function changeEmpItemSummaryPageSize(size) {
    empItemSummaryPageSize = parseInt(size);
    empItemSummaryPage = 1;
    renderEmpItemSummaryTable();
}

/* ---------- Scope Items Table ---------- */
function renderScopeItemsTable(scopeId) {
    var sp = empScopePages[scopeId];
    if (!sp) return;
    var isPic = sp.isPic;
    var query = (empScopeSearch[scopeId] || '').toLowerCase();

    var data = sp.data;
    if (query) {
        data = data.filter(function(r) {
            var haystack = [
                r.name,
                r.customer,
                r.startDateRaw,
                r.endDateRaw,
                r.installDateRaw,
                r.startDateFmt,
                r.endDateFmt,
                r.installDateFmt,
                r.team
            ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');
            return haystack.indexOf(query) !== -1;
        });
    }

    var totalPages = Math.ceil(data.length / sp.pageSize) || 1;
    if (sp.page > totalPages) sp.page = totalPages;
    if (sp.page < 1) sp.page = 1;
    var startIdx = (sp.page - 1) * sp.pageSize;
    var pageData = data.slice(startIdx, startIdx + sp.pageSize);

    var actionsCol = isPic ? '<th style="width:80px">Actions</th>' : '';
    var rows = '';
    if (data.length === 0) {
        var colCount = isPic ? 9 : 8;
        rows = '<tr><td colspan="' + colCount + '" style="text-align:center;color:var(--main-text3);padding:30px">' +
            (query ? 'No items matching "' + esc(query) + '"' : 'No items. ' + (isPic ? 'Click "+ Add Item" to create one.' : '')) +
            '</td></tr>';
    } else {
        rows = pageData.map(function(r, idx) {
            var actionCell = isPic ? '<td><div class="actions-cell">' +
                '<button class="btn-icon" onclick="empShowEditItem(' + r.id + ')" title="Edit">&#9998;</button>' +
                '<button class="btn-icon danger" onclick="empConfirmDeleteItem(' + r.id + ')" title="Delete">&#10005;</button>' +
            '</div></td>' : '';
            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td><div style="font-family:var(--font-d);font-size:1rem">' + r.name + '</div></td>' +
                '<td>' + r.customer + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.85rem">' + (r.startDateFmt || '\u2014') + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.85rem">' + (r.endDateFmt || '\u2014') + '</td>' +
                '<td style="font-family:var(--font-m);font-size:.85rem">' + (r.installDateFmt || '\u2014') + '</td>' +
                '<td>' + r.cdHtml + '</td>' +
                '<td style="font-size:.85rem">' + r.team + '</td>' +
                actionCell +
            '</tr>';
        }).join('');
    }

    var paginationHtml = '';
    if (data.length > 0) {
        var showFrom = startIdx + 1;
        var showTo = Math.min(startIdx + sp.pageSize, data.length);
        var pageButtons = '';
        var maxVisible = 5;
        var startP = Math.max(1, sp.page - Math.floor(maxVisible / 2));
        var endP = Math.min(totalPages, startP + maxVisible - 1);
        if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);
        pageButtons += '<button onclick="goScopeItemsPage(' + scopeId + ',1)" ' + (sp.page === 1 ? 'disabled' : '') + '>&laquo;</button>';
        pageButtons += '<button onclick="goScopeItemsPage(' + scopeId + ',' + (sp.page - 1) + ')" ' + (sp.page === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = startP; p <= endP; p++) {
            pageButtons += '<button onclick="goScopeItemsPage(' + scopeId + ',' + p + ')" class="' + (p === sp.page ? 'active' : '') + '">' + p + '</button>';
        }
        pageButtons += '<button onclick="goScopeItemsPage(' + scopeId + ',' + (sp.page + 1) + ')" ' + (sp.page === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        pageButtons += '<button onclick="goScopeItemsPage(' + scopeId + ',' + totalPages + ')" ' + (sp.page === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        paginationHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + data.length + '</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeScopeItemsPageSize(' + scopeId + ',this.value)">' +
                        '<option value="5"' + (sp.pageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (sp.pageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (sp.pageSize === 25 ? ' selected' : '') + '>25</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + pageButtons + '</div>' +
            '</div></div>';
    }

    document.getElementById('scope-items-table-' + scopeId).innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr>' +
                '<th style="width:50px">No</th>' +
                '<th>ID/Name</th>' +
                '<th>Customer</th>' +
                '<th style="width:100px">Start Date</th>' +
                '<th style="width:100px">End Date</th>' +
                '<th style="width:100px">Install Date</th>' +
                '<th>Countdown</th>' +
                '<th>Team</th>' +
                actionsCol +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' + paginationHtml;
}

function goScopeItemsPage(scopeId, page) {
    var sp = empScopePages[scopeId];
    if (!sp) return;
    var totalPages = Math.ceil(sp.data.length / sp.pageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    sp.page = page;
    renderScopeItemsTable(scopeId);
}

function changeScopeItemsPageSize(scopeId, size) {
    var sp = empScopePages[scopeId];
    if (!sp) return;
    sp.pageSize = parseInt(size);
    sp.page = 1;
    renderScopeItemsTable(scopeId);
}



/* ==========================================================
   SECTION 12: EMPLOYEE — ATTENDANCE TIME ENTRIES
   ========================================================== */

var empAttCurrentPage = 1;
var empAttPageSize = 10;
var empAttFilteredData = [];

function getEmployeeProjects(memberId) {
    return DB.projectAssignments
        .filter(function(pa) { return pa.memberId === memberId; })
        .map(function(pa) { return DB.projects.find(function(p) { return p.id === pa.projectId; }); })
        .filter(Boolean);
}

function canMemberViewScope(member, scope) {
    if (!scope) return true;
    var departmentIds = scope.departmentIds || [];
    if (departmentIds.length === 0) return true;
    return !!member && !!member.departmentId && departmentIds.indexOf(member.departmentId) !== -1;
}

function getEmployeeVisibleScopes(member, extraScopeId) {
    return DB.scopes.filter(function(s) {
        return s.id === extraScopeId || canMemberViewScope(member, s);
    });
}

function getEmployeeVisibleProjects(member, extraProjectId) {
    var visibleScopeIds = getEmployeeVisibleScopes(member).map(function(s) { return s.id; });
    return DB.projects.filter(function(p) {
        return p.id === extraProjectId || !p.categoryId || visibleScopeIds.indexOf(p.categoryId) !== -1;
    });
}


/* ---------- render ---------- */

function renderEmployeeAttendance() {
    if (!currentUser || !currentUser.memberId) return;
    var member = DB.members.find(function(m) { return m.id === currentUser.memberId; });
    if (!member) return;

    empAttCurrentPage = 1;
    empAttPageSize = 10;

    // Filter dropdown: 只显示有 attendance 记录的
    var myEntries = DB.attendance.filter(function(a) { return a.memberId === member.id; });
    var myProjectIds = [];
    myEntries.forEach(function(a) {
        if (a.projectId && myProjectIds.indexOf(a.projectId) === -1) myProjectIds.push(a.projectId);
    });
    var myProjects = DB.projects.filter(function(p) { return myProjectIds.indexOf(p.id) !== -1; });

    var myScopeIds = [];
    myProjects.forEach(function(p) {
        if (p.categoryId && myScopeIds.indexOf(p.categoryId) === -1) myScopeIds.push(p.categoryId);
    });
    var myScopes = DB.scopes.filter(function(s) { return myScopeIds.indexOf(s.id) !== -1; });
    var scopeMsOpts = myScopes.map(function(s) { return { value: s.id, label: s.name }; });

    var seenOther = false;
    var projMsOpts = [];
    myProjects.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    myProjects.forEach(function(p) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; projMsOpts.push({ value: 0, label: 'Other' }); }
        } else {
            projMsOpts.push({ value: p.id, label: p.name });
        }
    });

    var today = todayStr();
    var thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var todayEntries = myEntries.filter(function(a) { return a.date === today; });
    var todayMs = todayEntries.reduce(function(s, r) {
        return r.clockIn && r.clockOut ? s + (new Date(r.clockOut) - new Date(r.clockIn)) : s;
    }, 0);
    var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var weekStartStr = weekStart.toISOString().slice(0, 10);
    var weekMs = myEntries.filter(function(a) { return a.date >= weekStartStr; }).reduce(function(s, r) {
        return r.clockIn && r.clockOut ? s + (new Date(r.clockOut) - new Date(r.clockIn)) : s;
    }, 0);
    var todayCost = todayEntries.reduce(function(s, r) {
        if (r.clockIn && r.clockOut) { var c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);

    var view = document.getElementById('emp-attendance');
    view.innerHTML =
        '<div class="app-header"><h2>My Attendance</h2><div class="header-sub">Log and track your work hours</div></div>' +
        '<div class="app-body" style="max-width:none">' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>' +
                '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="emp-att-from" value="' + defaultFrom + '" onchange="applyEmpAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="emp-att-to" value="' + today + '" onchange="applyEmpAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-emp-scope"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-emp-item"></div></div>' +
                    '<div style="display:flex;gap:8px;margin-left:auto">' +
                        '<button class="btn btn-ghost btn-sm" onclick="resetEmpAttendanceFilter()">Reset</button>' +
                        '<button class="btn btn-blue btn-sm" onclick="exportEmpAttendanceCSV()">&#128196; Export CSV</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="emp-att-stats-area"></div>' +
            '<div id="emp-att-project-summary"></div>' +
            '<div class="section-head time-entry-head"><h2>Time Entries</h2><button class="btn btn-green" onclick="showAddTimeEntry()">+ Add Attendance</button></div>' +
            '<div id="emp-att-table-area"></div>' +
        '</div>';

    ssmCreate('ssm-emp-scope', scopeMsOpts, 'All Categories');
    ssmCreate('ssm-emp-item', projMsOpts, 'All ID/Name');

    ssmOnChange('ssm-emp-scope', function(selectedScopeIds) {
        var numIds = selectedScopeIds.map(function(v) { return parseInt(v); });
        var filtered = numIds.length > 0
            ? myProjects.filter(function(p) { return numIds.indexOf(p.categoryId) !== -1; })
            : myProjects;
        var seenOther2 = false;
        var opts = [];
        filtered.forEach(function(p) {
            if (p.name.toLowerCase() === 'other') {
                if (!seenOther2) { seenOther2 = true; opts.push({ value: 0, label: 'Other' }); }
            } else {
                opts.push({ value: p.id, label: p.name });
            }
        });
        ssmUpdate('ssm-emp-item', opts, true);
        applyEmpAttendanceFilter();
    });

    ssmOnChange('ssm-emp-item', function() { applyEmpAttendanceFilter(); });

    applyEmpAttendanceFilter();
}

function resetEmpAttendanceFilter() {
    var today = todayStr();
    var d30 = new Date(); d30.setDate(d30.getDate() - 30);
    document.getElementById('emp-att-from').value = d30.toISOString().slice(0, 10);
    document.getElementById('emp-att-to').value = today;
    ssmClear('ssm-emp-scope');

    // 从 attendance 记录里提取有记录的项目
    var myEntries = DB.attendance.filter(function(a) { return a.memberId === currentUser.memberId; });
    var myProjectIds = [];
    myEntries.forEach(function(a) {
        if (a.projectId && myProjectIds.indexOf(a.projectId) === -1) myProjectIds.push(a.projectId);
    });
    var myProjects = DB.projects.filter(function(p) { return myProjectIds.indexOf(p.id) !== -1; });

    myProjects.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    var seenOther = false;
    var opts = [];
    myProjects.forEach(function(p) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; opts.push({ value: 0, label: 'Other' }); }
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    });
    ssmUpdate('ssm-emp-item', opts, false);
    empAttCurrentPage = 1;
    applyEmpAttendanceFilter();
}

function applyEmpAttendanceFilter() {
    if (!currentUser || !currentUser.memberId) return;
    var member = DB.members.find(function(m) { return m.id === currentUser.memberId; });
    if (!member) return;
    var fromDate = document.getElementById('emp-att-from').value;
    var toDate = document.getElementById('emp-att-to').value;
    var scopeIds = ssmGetValues('ssm-emp-scope').map(function(v) { return parseInt(v); });
    var itemIds = ssmGetValues('ssm-emp-item').map(function(v) { return parseInt(v); });
    if (!fromDate || !toDate) return;

    var filtered = DB.attendance.filter(function(a) { return a.memberId === member.id && a.date >= fromDate && a.date <= toDate; });
    if (scopeIds.length > 0) {
        var sids = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return sids.indexOf(a.projectId) !== -1; });
    }
    if (itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        filtered = filtered.filter(function(a) { return expandedIds.indexOf(a.projectId) !== -1; });
    }
    filtered.sort(function(a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
    empAttFilteredData = filtered;

    var totalMs = 0, totalCost = 0;
    filtered.forEach(function(r) {
        if (r.clockIn && r.clockOut) {
            var ms = new Date(r.clockOut) - new Date(r.clockIn);
            totalMs += ms;
            totalCost += (getEntryCost(r.memberId, ms) || 0);
        }
    });

    document.getElementById('emp-att-stats-area').innerHTML =
        '<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px">' +
            '<div class="stat-card"><div class="stat-label">Filtered Entries</div><div class="stat-value" style="font-size:1.2rem">' + filtered.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Filtered Hours</div><div class="stat-value" style="font-size:1.2rem">' + formatDuration(totalMs) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Filtered Cost</div><div class="stat-value" style="font-size:1.2rem">' + fmtCost(totalCost) + '</div></div>' +
        '</div>';

    var tp = Math.ceil(filtered.length / empAttPageSize) || 1;
    if (empAttCurrentPage > tp) empAttCurrentPage = tp;
    if (empAttCurrentPage < 1) empAttCurrentPage = 1;
    renderEmpAttendancePage();
}


/* ---------- table + pagination ---------- */

function renderEmpAttendancePage() {
    var filtered = empAttFilteredData;
    var totalPages = Math.ceil(filtered.length / empAttPageSize) || 1;
    var startIdx = (empAttCurrentPage - 1) * empAttPageSize;
    var pageData = filtered.slice(startIdx, startIdx + empAttPageSize);

    var rows = '';
    if (!filtered.length) {
        rows = '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No time entries found</td></tr>';
    } else {
        rows = pageData.map(function(r, idx) {
            var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
            var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
            var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '\u2014';
            var st = r.clockIn ? r.clockIn.split('T') : [];
            var et = r.clockOut ? r.clockOut.split('T') : [];
            var sTime = st.length === 2 ? st[1].substring(0, 5) : '\u2014';
            var eTime = et.length === 2 ? et[1].substring(0, 5) : '\u2014';
            var itemDisp = '\u2014';
            if (proj) itemDisp = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
            var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;

            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td style="font-family:var(--font-m)">' + formatDateDMY(r.date) + '</td>' +
                '<td>' + itemDisp + '</td>' +
                '<td>' + (wp ? esc(wp.title) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td>' + (wd ? esc(wd.title) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.description || '') + '">' + (r.description ? esc(r.description) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td style="font-family:var(--font-m)">' + sTime + '</td>' +
                '<td style="font-family:var(--font-m)">' + eTime + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + dur + '</td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="showEditTimeEntry(' + r.id + ')" title="Edit">&#9998;</button>' +
                    '<button class="btn-icon danger" onclick="confirmDeleteTimeEntry(' + r.id + ')" title="Delete">&#10005;</button>' +
                '</div></td></tr>';
        }).join('');
    }

    var pgHtml = '';
    if (filtered.length > 0) {
        var showTo = Math.min(startIdx + empAttPageSize, filtered.length);
        var btns = '';
        var maxV = 5;
        var sp = Math.max(1, empAttCurrentPage - Math.floor(maxV / 2));
        var ep = Math.min(totalPages, sp + maxV - 1);
        if (ep - sp < maxV - 1) sp = Math.max(1, ep - maxV + 1);
        btns += '<button onclick="goEmpAttPage(1)" ' + (empAttCurrentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
        btns += '<button onclick="goEmpAttPage(' + (empAttCurrentPage - 1) + ')" ' + (empAttCurrentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
        for (var p = sp; p <= ep; p++) btns += '<button onclick="goEmpAttPage(' + p + ')" class="' + (p === empAttCurrentPage ? 'active' : '') + '">' + p + '</button>';
        btns += '<button onclick="goEmpAttPage(' + (empAttCurrentPage + 1) + ')" ' + (empAttCurrentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
        btns += '<button onclick="goEmpAttPage(' + totalPages + ')" ' + (empAttCurrentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
        pgHtml = '<div class="pagination">' +
            '<div class="pagination-info">Showing ' + (startIdx + 1) + ' to ' + showTo + ' of ' + filtered.length + ' entries</div>' +
            '<div style="display:flex;align-items:center;gap:20px">' +
                '<div class="pagination-size"><label>Show</label>' +
                    '<select onchange="changeEmpAttPageSize(this.value)">' +
                        '<option value="5"' + (empAttPageSize === 5 ? ' selected' : '') + '>5</option>' +
                        '<option value="10"' + (empAttPageSize === 10 ? ' selected' : '') + '>10</option>' +
                        '<option value="25"' + (empAttPageSize === 25 ? ' selected' : '') + '>25</option>' +
                        '<option value="50"' + (empAttPageSize === 50 ? ' selected' : '') + '>50</option>' +
                        '<option value="100"' + (empAttPageSize === 100 ? ' selected' : '') + '>100</option>' +
                    '</select></div>' +
                '<div class="pagination-controls">' + btns + '</div>' +
            '</div></div>';
    }

    document.getElementById('emp-att-table-area').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:50px">No</th><th>Date</th><th>Category &rarr; ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' + pgHtml;
}

function goEmpAttPage(page) {
    var tp = Math.ceil(empAttFilteredData.length / empAttPageSize) || 1;
    empAttCurrentPage = Math.max(1, Math.min(page, tp));
    renderEmpAttendancePage();
}

function changeEmpAttPageSize(size) {
    empAttPageSize = parseInt(size);
    empAttCurrentPage = 1;
    renderEmpAttendancePage();
}


/* ==========================================================
   ADD / EDIT — 用 ssCreate (跟 Admin 一样)
   ========================================================== */

function empSortedProjects(scopeId) {
    var list = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === scopeId; })
        : DB.projects.slice();
    list.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    return list;
}

function empAttScopeChanged(member) {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var sid = scopeId ? parseInt(scopeId) : null;
    var vis = getEmployeeVisibleProjects(member);
    var projects = sid
        ? vis.filter(function(p) { return p.categoryId === sid; })
        : vis;
    projects.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    ssUpdate('ss-entry-item', projects.map(function(p) { return { value: p.id, label: p.name }; }), false);

    var wlFiltered = sid ? DB.worklist.filter(function(w) { return w.scopeId === sid; }) : DB.worklist;
    var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
    ssUpdate('ss-entry-workplan', wlOpts, false);
    ssUpdate('ss-entry-workdone', wlOpts, false);
}

function empAttScopeChangedEdit(member, extraProjectId) {
    var scopeId = document.getElementById('entry-scope-filter').value;
    var sid = scopeId ? parseInt(scopeId) : null;
    var vis = getEmployeeVisibleProjects(member, extraProjectId);
    var projects = sid
        ? vis.filter(function(p) { return p.categoryId === sid; })
        : vis;
    projects.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    ssUpdate('ss-entry-item', projects.map(function(p) { return { value: p.id, label: p.name }; }), false);

    var wlFiltered = sid ? DB.worklist.filter(function(w) { return w.scopeId === sid; }) : DB.worklist;
    var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
    ssUpdate('ss-entry-workplan', wlOpts, false);
    ssUpdate('ss-entry-workdone', wlOpts, false);
}

function showAddTimeEntry() {
    try {
        var member = currentUser && currentUser.memberId ? DB.members.find(function(m) { return m.id === currentUser.memberId; }) : null;
        var visibleScopes = getEmployeeVisibleScopes(member);
        var today = todayStr();
        var scopeOptions = '<option value="">-- Select Category --</option>' +
            visibleScopes.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');

        showModal(
            '<h3>Add Time Entry</h3>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
                '<div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="' + today + '"></div><br>' +
                '<div class="field"><label>Category</label><select class="input" id="entry-scope-filter" onchange="empAttScopeChanged(_empModalMember)">' + scopeOptions + '</select></div>' +
                '<div class="field"><label>ID/Name</label><div id="ss-entry-item"></div></div>' +
                '<div style="display:none"><select class="input" id="entry-detail">' + detailOpts(null) + '</select></div>' +
                '<div class="field"><label>Work Plan</label><div id="ss-entry-workplan"></div></div>' +
                '<div class="field"><label>Work Done</label><div id="ss-entry-workdone"></div></div>' +
                '<div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="09:00"></div>' +
                '<div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="18:00"></div>' +
            '</div>' +
            '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="entry-desc" rows="2" placeholder="For Other Selected" style="resize:vertical"></textarea></div>' +
            '<p class="auth-error" id="entry-error"></p>' +
            '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>'
        );

        setTimeout(function() {
            window._empModalMember = member;
            ssCreate('ss-entry-item', [], '-- Select Category First --');
            var wlOpts = DB.worklist.map(function(w) { return { value: w.id, label: w.title }; });
            ssCreate('ss-entry-workplan', wlOpts, '-- None --');
            ssCreate('ss-entry-workdone', wlOpts, '-- None --');
        }, 50);
    } catch (e) { alert('Error: ' + e.message); }
}

function showEditTimeEntry(entryId) {
    var entry = DB.attendance.find(function(a) { return a.id === entryId; });
    if (!entry) return;

    var curProj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var curScopeId = curProj && curProj.categoryId ? curProj.categoryId : '';
    var member = currentUser && currentUser.memberId ? DB.members.find(function(m) { return m.id === currentUser.memberId; }) : null;
    var visibleScopes = getEmployeeVisibleScopes(member, curScopeId);

    var scopeOptions = '<option value="">-- Select Category --</option>' +
        visibleScopes.map(function(s) {
            var sel = curScopeId === s.id ? ' selected' : '';
            return '<option value="' + s.id + '"' + sel + '>' + esc(s.name) + '</option>';
        }).join('');

    var st = entry.clockIn ? entry.clockIn.split('T') : [];
    var et = entry.clockOut ? entry.clockOut.split('T') : [];
    var sTime = st.length === 2 ? st[1].substring(0, 5) : '';
    var eTime = et.length === 2 ? et[1].substring(0, 5) : '';

    showModal(
        '<h3>Edit Time Entry</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="' + entry.date + '"></div><br>' +
            '<div class="field"><label>Category</label><select class="input" id="entry-scope-filter" onchange="empAttScopeChangedEdit(_empModalMember, _empModalExtraProjectId)">' + scopeOptions + '</select></div>' +
            '<div class="field"><label>ID/Name</label><div id="ss-entry-item"></div></div>' +
            '<div style="display:none"><select class="input" id="entry-detail">' + detailOpts(entry.detailId) + '</select></div>' +
            '<div class="field"><label>Work Plan</label><div id="ss-entry-workplan"></div></div>' +
            '<div class="field"><label>Work Done</label><div id="ss-entry-workdone"></div></div>' +
            '<div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="' + sTime + '"></div>' +
            '<div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="' + eTime + '"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="entry-desc" rows="2" style="resize:vertical">' + esc(entry.description || '') + '</textarea></div>' +
        '<p class="auth-error" id="entry-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditTimeEntry(' + entryId + ')">Save</button></div>'
    );

    setTimeout(function() {
        window._empModalMember = member;
        window._empModalExtraProjectId = entry.projectId;

        var scopeItems = getEmployeeVisibleProjects(member, entry.projectId);
        if (curScopeId) {
            scopeItems = scopeItems.filter(function(p) { return p.categoryId === curScopeId; });
        }
        scopeItems.sort(function(a, b) {
            var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
            var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
            if (ao !== bo) return ao - bo;
            return a.name.localeCompare(b.name);
        });
        ssCreate('ss-entry-item', scopeItems.map(function(p) { return { value: p.id, label: p.name }; }), '-- Select ID/Name --');
        if (entry.projectId) ssSetValue('ss-entry-item', entry.projectId);

        var wlFiltered = curScopeId ? DB.worklist.filter(function(w) { return w.scopeId === curScopeId; }) : DB.worklist;
        var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
        ssCreate('ss-entry-workplan', wlOpts, '-- None --');
        if (entry.work_plan_id) ssSetValue('ss-entry-workplan', entry.work_plan_id);
        ssCreate('ss-entry-workdone', wlOpts, '-- None --');
        if (entry.work_done_id) ssSetValue('ss-entry-workdone', entry.work_done_id);
    }, 50);
}


/* ==========================================================
   SAVE / DELETE
   ========================================================== */

async function doAddTimeEntry() {
    var errEl = document.getElementById('entry-error');
    var date      = document.getElementById('entry-date').value;
    var projectId  = ssGetValue('ss-entry-item');
    var detailEl   = document.getElementById('entry-detail');
    var detailId   = detailEl ? detailEl.value : '';
    var wpId       = ssGetValue('ss-entry-workplan');
    var wdId       = ssGetValue('ss-entry-workdone');
    var start      = document.getElementById('entry-start').value;
    var end        = document.getElementById('entry-end').value;
    var desc       = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date)      { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select an item'; return; }
    if (!start)     { errEl.textContent = 'Start time is required'; return; }
    if (!end)       { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var newStart = date + 'T' + start + ':00';
    var newEnd   = date + 'T' + end + ':00';

    var overlap = _checkOverlap(currentUser.memberId, date, newStart, newEnd, null);
    if (overlap) { errEl.textContent = overlap; return; }

    try {
        await api('/attendance', { method: 'POST', body: {
            memberId: currentUser.memberId, date: date,
            clockIn: newStart, clockOut: newEnd,
            projectId: parseInt(projectId), scopeId: null,
            subScopeId: null, detailId: detailId ? parseInt(detailId) : null,
            work_plan_id: wpId ? parseInt(wpId) : null,
            work_done_id: wdId ? parseInt(wdId) : null,
            description: desc
        }});
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

async function doEditTimeEntry(entryId) {
    var errEl = document.getElementById('entry-error');
    var date      = document.getElementById('entry-date').value;
    var projectId  = ssGetValue('ss-entry-item');
    var detailEl   = document.getElementById('entry-detail');
    var detailId   = detailEl ? detailEl.value : '';
    var wpId       = ssGetValue('ss-entry-workplan');
    var wdId       = ssGetValue('ss-entry-workdone');
    var start      = document.getElementById('entry-start').value;
    var end        = document.getElementById('entry-end').value;
    var desc       = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date)      { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select an item'; return; }
    if (!start)     { errEl.textContent = 'Start time is required'; return; }
    if (!end)       { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    var newStart = date + 'T' + start + ':00';
    var newEnd   = date + 'T' + end + ':00';

    var overlap = _checkOverlap(currentUser.memberId, date, newStart, newEnd, entryId);
    if (overlap) { errEl.textContent = overlap; return; }

    try {
        await api('/attendance/' + entryId, { method: 'PUT', body: {
            date: date, clockIn: newStart, clockOut: newEnd,
            projectId: parseInt(projectId), scopeId: null,
            subScopeId: null, detailId: detailId ? parseInt(detailId) : null,
            work_plan_id: wpId ? parseInt(wpId) : null,
            work_done_id: wdId ? parseInt(wdId) : null,
            description: desc
        }});
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function _checkOverlap(memberId, date, newStart, newEnd, excludeId) {
    var myEntries = DB.attendance.filter(function(a) {
        return a.memberId === memberId && a.date === date && a.clockIn && a.clockOut && a.id !== excludeId;
    });
    for (var i = 0; i < myEntries.length; i++) {
        if (newStart < myEntries[i].clockOut && newEnd > myEntries[i].clockIn) {
            var oS = myEntries[i].clockIn.split('T')[1].substring(0, 5);
            var oE = myEntries[i].clockOut.split('T')[1].substring(0, 5);
            var oP = myEntries[i].projectId ? DB.projects.find(function(p) { return p.id === myEntries[i].projectId; }) : null;
            var oSc = oP && oP.categoryId ? DB.scopes.find(function(s) { return s.id === oP.categoryId; }) : null;
            var oL = oSc ? oSc.name + ' -> ' + oP.name : (oP ? oP.name : '');
            return 'Overlaps with ' + oS + '-' + oE + (oL ? ' (' + oL + ')' : '');
        }
    }
    return null;
}

function confirmDeleteTimeEntry(entryId) {
    var entry = DB.attendance.find(function(a) { return a.id === entryId; });
    if (!entry) return;
    var proj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
    var label = proj ? (scope ? scope.name + ' \u2192 ' + proj.name : proj.name) : '\u2014';
    showModal('<h3>Delete Time Entry</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete this entry?<br>' +
        'Date: <strong style="color:var(--main-text)">' + formatDateDMY(entry.date) + '</strong><br>' +
        'Item: <strong style="color:var(--main-text)">' + esc(label) + '</strong></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="doDeleteTimeEntry(' + entryId + ')">Delete</button></div>');
}

async function doDeleteTimeEntry(entryId) {
    try {
        await api('/attendance/' + entryId, { method: 'DELETE' });
        hideModal(); await loadDB(); renderEmployeeAttendance(); showToast('Time entry deleted successfully');
    } catch (e) { alert('Failed: ' + e.message); }
}

function exportEmpAttendanceCSV() {
    var data = empAttFilteredData;
    if (!data.length) { alert('No data to export'); return; }
    var headers = ['Date','Category','ID/Name','Work Plan','Work Done','Start','End','Duration','Remark'];
    var rows = data.map(function(r) {
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '';
        var st = r.clockIn ? r.clockIn.split('T') : [];
        var et = r.clockOut ? r.clockOut.split('T') : [];
        var sT = st.length === 2 ? st[1].substring(0, 5) : '';
        var eT = et.length === 2 ? et[1].substring(0, 5) : '';
        var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
        var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;
        return [formatDateDMY(r.date), scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', sT, eT, dur, r.description || ''];
    });
    var csv = headers.join(',') + '\n';
    rows.forEach(function(row) { csv += row.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',') + '\n'; });
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url;
    a.download = 'my_attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
}

function showToast(message) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add('show'); }, 10);
    setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 2500);
}

/* ==========================================================
   SECTION: EMPLOYEE — REPORT (PIC only)
   ========================================================== */

var empRptItemPage = 1;
var empRptItemPageSize = 10;
var empRptItemData_cache = [];
var empRptEmpPage = 1;
var empRptEmpPageSize = 10;
var empRptEmpData_cache = [];

function getPICScopeIds() {
    if (!currentUser || !currentUser.memberId) return [];
    return DB.scopes
        .filter(function(s) { return s.picMemberIds && s.picMemberIds.indexOf(currentUser.memberId) !== -1; })
        .map(function(s) { return s.id; });
}

function renderEmpReport() {
    var view = document.getElementById('emp-report');
    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var picScopeIds = getPICScopeIds();
    var scopeList = DB.scopes.filter(function(s) { return picScopeIds.indexOf(s.id) !== -1; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });
    var deptList = DB.departments.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });

    var scopeOpts = scopeList.map(function(s) { return { value: s.id, label: s.name }; });
    var deptOpts = deptList.map(function(d) { return { value: d.id, label: d.name }; });

    var picProjects = DB.projects.filter(function(p) { return p.categoryId && picScopeIds.indexOf(p.categoryId) !== -1; });
    var seenOther = false;
    var itemOpts = [];
    picProjects.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    picProjects.forEach(function(p) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; itemOpts.push({ value: 0, label: 'Other' }); }
        } else {
            itemOpts.push({ value: p.id, label: p.name });
        }
    });

    // 初始 employee 列表：PIC scope 下有 attendance 记录的人
    var empOpts = buildEmpRptEmpOpts([], []);

    view.innerHTML =
        '<div class="app-header"><h2>Report</h2><div class="header-sub">PIC summary and analytics</div></div>' +
        '<div class="app-body" style="max-width:none">' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>' +
                '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="emp-rpt-from" value="' + defaultFrom + '" onchange="generateEmpReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="emp-rpt-to" value="' + today + '" onchange="generateEmpReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-emp-rpt-dept"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-emp-rpt-scope"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-emp-rpt-item"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:160px" id="ssm-emp-rpt-emp"></div></div>' +
                    '<div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="resetEmpReport()">Reset</button></div>' +
                '</div>' +
            '</div>' +
            '<div id="emp-rpt-stats"></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px" id="emp-rpt-charts-row1"></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px" id="emp-rpt-charts-row2"></div>' +
            '<div id="emp-rpt-tables"></div>' +
        '</div>';

    ssmCreate('ssm-emp-rpt-dept', deptOpts, 'All Departments');
    ssmCreate('ssm-emp-rpt-scope', scopeOpts, 'All Categories');
    ssmCreate('ssm-emp-rpt-item', itemOpts, 'All ID/Names');
    ssmCreate('ssm-emp-rpt-emp', empOpts, 'All Employees');

    // Category 改变 → 更新 ID/Name 和 Employee
    ssmOnChange('ssm-emp-rpt-scope', function(selectedScopeIds) {
        var numIds = selectedScopeIds.map(function(v) { return parseInt(v); });
        var filtered = numIds.length > 0
            ? picProjects.filter(function(p) { return numIds.indexOf(p.categoryId) !== -1; })
            : picProjects;
        var seenOther2 = false;
        var opts = [];
        filtered.forEach(function(p) {
            if (p.name.toLowerCase() === 'other') {
                if (!seenOther2) { seenOther2 = true; opts.push({ value: 0, label: 'Other' }); }
            } else {
                opts.push({ value: p.id, label: p.name });
            }
        });
        ssmUpdate('ssm-emp-rpt-item', opts, true);

        // 根据 Category 和 ID/Name 更新 Employee
        var itemIds = ssmGetValues('ssm-emp-rpt-item').map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-emp-rpt-dept').map(function(v) { return parseInt(v); });
        var empOpts = buildEmpRptEmpOpts(numIds, itemIds);
        ssmUpdate('ssm-emp-rpt-emp', empOpts, true);

        generateEmpReport();
    });

    // Department 改变 → 更新 Employee
    ssmOnChange('ssm-emp-rpt-dept', function(selectedDeptIds) {
        var numIds = selectedDeptIds.map(function(v) { return parseInt(v); });
        var scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(function(v) { return parseInt(v); });
        var itemIds = ssmGetValues('ssm-emp-rpt-item').map(function(v) { return parseInt(v); });
        var empOpts = buildEmpRptEmpOpts(scopeIds, itemIds);
        if (numIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return numIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            empOpts = empOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-emp-rpt-emp', empOpts, true);
        generateEmpReport();
    });

    // ID/Name 改变 → 更新 Employee
    ssmOnChange('ssm-emp-rpt-item', function(selectedItemIds) {
        var scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(function(v) { return parseInt(v); });
        var itemIds = selectedItemIds.map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-emp-rpt-dept').map(function(v) { return parseInt(v); });
        var empOpts = buildEmpRptEmpOpts(scopeIds, itemIds);
        if (deptIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            empOpts = empOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-emp-rpt-emp', empOpts, true);
        generateEmpReport();
    });

    ssmOnChange('ssm-emp-rpt-emp', function() { generateEmpReport(); });

    generateEmpReport();
}

function buildEmpRptEmpOpts(scopeIds, itemIds) {
    // 什么都没选 → 返回全部非 viewer employee
    if ((!scopeIds || scopeIds.length === 0) && (!itemIds || itemIds.length === 0)) {
        return getNonViewerMembers()
            .sort(function(a, b) { return a.name.localeCompare(b.name); })
            .map(function(m) { return { value: m.id, label: m.name }; });
    }

    var picScopeIds = getPICScopeIds();
    var picProjectIds = DB.projects
        .filter(function(p) { return p.categoryId && picScopeIds.indexOf(p.categoryId) !== -1; })
        .map(function(p) { return p.id; });

    if (scopeIds && scopeIds.length > 0) {
        picProjectIds = DB.projects
            .filter(function(p) { return p.categoryId && scopeIds.indexOf(p.categoryId) !== -1; })
            .map(function(p) { return p.id; });
    }

    if (itemIds && itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        picProjectIds = picProjectIds.filter(function(id) { return expandedIds.indexOf(id) !== -1; });
    }

    var memberIds = [];
    DB.attendance.forEach(function(a) {
        if (a.projectId && picProjectIds.indexOf(a.projectId) !== -1 && memberIds.indexOf(a.memberId) === -1) {
            memberIds.push(a.memberId);
        }
    });

    var viewerMemberIds = getViewerMemberIds();
    memberIds = memberIds.filter(function(mid) { return viewerMemberIds.indexOf(mid) === -1; });

    return memberIds
        .map(function(mid) { return DB.members.find(function(m) { return m.id === mid; }); })
        .filter(Boolean)
        .sort(function(a, b) { return a.name.localeCompare(b.name); })
        .map(function(m) { return { value: m.id, label: m.name }; });
}

function resetEmpReport() {
    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('emp-rpt-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('emp-rpt-to').value = today;
    ssmClear('ssm-emp-rpt-scope');
    ssmClear('ssm-emp-rpt-dept');

    var picScopeIds = getPICScopeIds();
    var picProjects = DB.projects.filter(function(p) { return p.categoryId && picScopeIds.indexOf(p.categoryId) !== -1; });
    var seenOther = false;
    var itemOpts = [];
    picProjects.forEach(function(p) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; itemOpts.push({ value: 0, label: 'Other' }); }
        } else {
            itemOpts.push({ value: p.id, label: p.name });
        }
    });
    ssmUpdate('ssm-emp-rpt-item', itemOpts, false);
    ssmUpdate('ssm-emp-rpt-emp', buildEmpRptEmpOpts([], []), false);
    generateEmpReport();
}

function generateEmpReport() {
    var fromDate = document.getElementById('emp-rpt-from').value;
    var toDate = document.getElementById('emp-rpt-to').value;
    var scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(function(v) { return parseInt(v); });
    var itemIds = ssmGetValues('ssm-emp-rpt-item').map(function(v) { return parseInt(v); });
    var deptIds = ssmGetValues('ssm-emp-rpt-dept').map(function(v) { return parseInt(v); });
    var empIds = ssmGetValues('ssm-emp-rpt-emp').map(function(v) { return parseInt(v); });
    if (!fromDate || !toDate) return;

    var picScopeIds = getPICScopeIds();
    var picProjectIds = DB.projects
        .filter(function(p) { return p.categoryId && picScopeIds.indexOf(p.categoryId) !== -1; })
        .map(function(p) { return p.id; });

    var filtered = DB.attendance.filter(function(a) {
        if (!a.date || a.date < fromDate || a.date > toDate) return false;
        return picProjectIds.indexOf(a.projectId) !== -1;
    });

    var viewerMemberIds = getViewerMemberIds();
    filtered = filtered.filter(function(a) { return viewerMemberIds.indexOf(a.memberId) === -1; });

    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return scopeItemIds.indexOf(a.projectId) !== -1; });
    }
    if (itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        filtered = filtered.filter(function(a) { return expandedIds.indexOf(a.projectId) !== -1; });
    }
    if (deptIds.length > 0) {
        var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
        filtered = filtered.filter(function(a) { return deptMemberIds.indexOf(a.memberId) !== -1; });
    }
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
        var proj = DB.projects.find(function(p) { return p.id === a.projectId; });
        return proj && proj.categoryId ? proj.categoryId : 0;
    })).size;

    document.getElementById('emp-rpt-stats').innerHTML =
        '<div class="stats-grid" style="margin-bottom:24px">' +
            '<div class="stat-card"><div class="stat-label">Total Records</div><div class="stat-value">' + filtered.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">' + formatDuration(totalHours) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Total Cost</div><div class="stat-value">' + fmtCost(totalCost) + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active Employees</div><div class="stat-value">' + uniqueEmployees + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active Categories</div><div class="stat-value">' + uniqueScopes + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">Active ID/Name</div><div class="stat-value">' + uniqueItems + '</div></div>' +
        '</div>';

    // ===== CHARTS DATA =====
    var palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

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
    Object.entries(itemCosts).forEach(function(entry, i) {
        var pid = parseInt(entry[0]);
        var cost = entry[1];
        var proj = pid === 0 ? null : DB.projects.find(function(p) { return p.id === pid; });
        var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
        var label = proj ? (scope ? scope.name + ' \u2192 ' + proj.name : proj.name) : 'Unassigned';
        itemLabels.push(label);
        itemData.push(Math.round(cost * 100) / 100);
        itemColors.push(palette[i % palette.length]);
    });

    var scopeCosts = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
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

    document.getElementById('emp-rpt-charts-row1').innerHTML =
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category &rarr; ID/Name</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="emp-chart-item-cost"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="emp-chart-scope-cost"></canvas></div>' +
        '</div>';

    var monthlyHours = {}, monthlyCost = {};
    filtered.forEach(function(r) {
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

    document.getElementById('emp-rpt-charts-row2').innerHTML =
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Monthly Trend</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="emp-chart-monthly"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Top Employees by Hours</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="emp-chart-emp-hours"></canvas></div>' +
        '</div>';

    // ===== TABLES =====
    empRptItemData_cache = [];
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
        var cdHtml = '\u2014';
        if (cd !== null) {
            if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">' + cd + 'd left</span>';
            else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Today!</span>';
            else cdHtml = '<span style="color:var(--danger);font-weight:600">' + Math.abs(cd) + 'd overdue</span>';
        }
        empRptItemData_cache.push({ label: label, cdHtml: cdHtml, members: members, entries: entries, hours: hours, cost: cost });
    });

    empRptEmpData_cache = [];
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
        empRptEmpData_cache.push({
            name: member ? esc(member.name) : 'Unknown',
            pos: member ? esc(getPositionName(member.positionId)) : '\u2014',
            dept: member ? esc(getDeptName(member.departmentId)) : '\u2014',
            entries: data.entries,
            days: data.days.size,
            ms: data.ms,
            cost: data.cost,
            rate: fmtHourlyRate(member)
        });
    });

    document.getElementById('emp-rpt-tables').innerHTML =
        '<div class="section-head" style="margin-top:8px"><h2>Item Summary</h2></div>' +
        '<div id="emp-rpt-item-table-area"></div>' +
        '<div class="section-head" style="margin-top:24px"><h2>Employee Summary</h2></div>' +
        '<div id="emp-rpt-emp-table-area"></div>';

    empRptItemPage = 1;
    empRptEmpPage = 1;
    renderEmpRptItemTable(empRptItemData_cache);
    renderEmpRptEmpTable(empRptEmpData_cache);

    // ===== RENDER CHARTS =====
    var chartTextColor = '#7a7570';
    var chartGridColor = 'rgba(122,117,112,0.15)';

    new Chart(document.getElementById('emp-chart-item-cost'), {
        type: 'bar',
        data: { labels: itemLabels, datasets: [{ label: 'Cost (RM)', data: itemData, backgroundColor: itemColors, borderRadius: 6, maxBarThickness: 50 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { y: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return 'RM' + v; } }, grid: { color: chartGridColor } }, x: { ticks: { color: chartTextColor, maxRotation: 45, font: { size: 10 } }, grid: { display: false } } } }
    });

    new Chart(document.getElementById('emp-chart-scope-cost'), {
        type: 'doughnut',
        data: { labels: scopeLabels, datasets: [{ data: scopeData, backgroundColor: scopeColors, borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: chartTextColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': RM' + ctx.parsed.toFixed(2); } } } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; }
        }
    });

    new Chart(document.getElementById('emp-chart-monthly'), {
        type: 'bar',
        data: { labels: prettyMonths, datasets: [
            { label: 'Hours', data: monthHoursData, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'Cost (RM)', data: monthCostData, type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 4, pointBackgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y1', fill: true }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartTextColor, usePointStyle: true, padding: 16 } } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { y: { beginAtZero: true, position: 'left', ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#ef4444', callback: function(v) { return 'RM' + v; } }, grid: { drawOnChartArea: false } }, x: { ticks: { color: chartTextColor }, grid: { display: false } } } }
    });

    new Chart(document.getElementById('emp-chart-emp-hours'), {
        type: 'bar',
        data: { labels: empLabels, datasets: [{ label: 'Hours', data: empData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, maxBarThickness: 30 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { x: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } }, y: { ticks: { color: chartTextColor, font: { size: 11 } }, grid: { display: false } } } }
    });
}

function renderEmpRptItemTable(data) {
    var totalPages = Math.ceil(data.length / empRptItemPageSize) || 1;
    if (empRptItemPage > totalPages) empRptItemPage = totalPages;
    if (empRptItemPage < 1) empRptItemPage = 1;
    var startIdx = (empRptItemPage - 1) * empRptItemPageSize;
    var pageData = data.slice(startIdx, startIdx + empRptItemPageSize);

    var rows = '';
    if (data.length === 0) {
        rows = '<tr><td colspan="6" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            return '<tr><td>' + r.label + '</td>' +
                '<td>' + r.cdHtml + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.members + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.entries + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(r.hours) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(r.cost) + '</td></tr>';
        }).join('');
    }

    document.getElementById('emp-rpt-item-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Category &rarr; ID/Name</th><th>Countdown</th><th style="text-align:right">Members</th><th style="text-align:right">Entries</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        buildRptPagination(data.length, empRptItemPage, empRptItemPageSize, 'goEmpRptItemPage', 'changeEmpRptItemPageSize');
}

function renderEmpRptEmpTable(data) {
    var totalPages = Math.ceil(data.length / empRptEmpPageSize) || 1;
    if (empRptEmpPage > totalPages) empRptEmpPage = totalPages;
    if (empRptEmpPage < 1) empRptEmpPage = 1;
    var startIdx = (empRptEmpPage - 1) * empRptEmpPageSize;
    var pageData = data.slice(startIdx, startIdx + empRptEmpPageSize);

    var rows = '';
    if (data.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            return '<tr><td>' + r.name + '</td>' +
                '<td>' + r.pos + '</td>' +
                '<td>' + r.dept + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.entries + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.days + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(r.ms) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(r.cost) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.rate + '</td></tr>';
        }).join('');
    }

    document.getElementById('emp-rpt-emp-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Employee</th><th>Position</th><th>Department</th><th style="text-align:right">Entries</th><th style="text-align:right">Days</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th><th style="text-align:right">Rate</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        buildRptPagination(data.length, empRptEmpPage, empRptEmpPageSize, 'goEmpRptEmpPage', 'changeEmpRptEmpPageSize');
}

function goEmpRptItemPage(page) {
    var totalPages = Math.ceil(empRptItemData_cache.length / empRptItemPageSize) || 1;
    empRptItemPage = Math.max(1, Math.min(page, totalPages));
    renderEmpRptItemTable(empRptItemData_cache);
}

function changeEmpRptItemPageSize(size) {
    empRptItemPageSize = parseInt(size);
    empRptItemPage = 1;
    renderEmpRptItemTable(empRptItemData_cache);
}

function goEmpRptEmpPage(page) {
    var totalPages = Math.ceil(empRptEmpData_cache.length / empRptEmpPageSize) || 1;
    empRptEmpPage = Math.max(1, Math.min(page, totalPages));
    renderEmpRptEmpTable(empRptEmpData_cache);
}

function changeEmpRptEmpPageSize(size) {
    empRptEmpPageSize = parseInt(size);
    empRptEmpPage = 1;
    renderEmpRptEmpTable(empRptEmpData_cache);
}


/* ==========================================================
   SECTION: EMPLOYEE — SETTINGS
   ========================================================== */

function renderEmpSettings() {
    if (!currentUser || !currentUser.memberId) return;
    var member = DB.members.find(function(m) { return m.id === currentUser.memberId; });
    if (!member) return;

    var posName = getPositionName(member.positionId);
    var deptName = getDeptName(member.departmentId);

    document.getElementById('emp-settings').innerHTML =
        '<div class="app-header"><h2>Settings</h2><div class="header-sub">Your profile and preferences</div></div>' +
        '<div class="app-body" style="max-width:640px">' +

            // Profile Card
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">' +
                '<div style="padding:12px 20px;border-bottom:1px solid var(--main-border)">' +
                    '<h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Profile Information</h2>' +
                '</div>' +
                '<div style="padding:20px">' +
                    '<div style="display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:center">' +
                        '<span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Username</span>' +
                        '<span style="font-weight:500;color:var(--main-text)">' + esc(currentUser.username || '—') + '</span>' +

                        '<span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Name</span>' +
                        '<span style="font-weight:500;color:var(--main-text)">' + esc(member.name) + '</span>' +

                        '<span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Position</span>' +
                        '<span style="font-weight:500;color:var(--main-text)">' + esc(posName) + '</span>' +

                        '<span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Department</span>' +
                        '<span style="font-weight:500;color:var(--main-text)">' + esc(deptName) + '</span>' +
                    '</div>' +
                    '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--main-border)">' +
                        '<button class="btn btn-accent" onclick="togglePasswordSection()" id="pw-toggle-btn">Change Password</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // Change Password Card (hidden by default)
            '<div id="password-section" style="display:none;background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">' +
                '<div style="padding:12px 20px;border-bottom:1px solid var(--main-border)">' +
                    '<h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Change Password</h2>' +
                '</div>' +
                '<div style="padding:20px">' +
                    '<div style="display:flex;flex-direction:column;gap:14px;max-width:380px">' +
                        '<div class="field">' +
                            '<label>New Password</label>' +
                            '<input class="input" id="settings-new-pw" type="password" placeholder="Enter new password">' +
                        '</div>' +
                        '<div class="field">' +
                            '<label>Confirm New Password</label>' +
                            '<input class="input" id="settings-confirm-pw" type="password" placeholder="Re-enter new password">' +
                        '</div>' +
                        '<div style="display:flex;gap:8px">' +
                            '<button class="btn btn-accent" onclick="doChangePassword()" style="min-width:140px">Update Password</button>' +
                            '<button class="btn btn-ghost" onclick="cancelChangePassword()">Cancel</button>' +
                        '</div>' +
                        '<p class="auth-error" id="settings-error" style="margin:0"></p>' +
                        '<p id="settings-success" style="margin:0;font-size:.85rem;color:var(--ok);display:none"></p>' +
                    '</div>' +
                '</div>' +
            '</div>' +

        '</div>';
}

function togglePasswordSection() {
    var section = document.getElementById('password-section');
    var btn = document.getElementById('pw-toggle-btn');
    if (section.style.display === 'none') {
        section.style.display = '';
        btn.textContent = 'Change Password ▲';
    } else {
        section.style.display = 'none';
        btn.textContent = 'Change Password';
        // 清空输入框和提示
        document.getElementById('settings-new-pw').value = '';
        document.getElementById('settings-confirm-pw').value = '';
        document.getElementById('settings-error').textContent = '';
        document.getElementById('settings-success').style.display = 'none';
    }
}

function cancelChangePassword() {
    document.getElementById('password-section').style.display = 'none';
    document.getElementById('pw-toggle-btn').textContent = 'Change Password';
    document.getElementById('settings-new-pw').value = '';
    document.getElementById('settings-confirm-pw').value = '';
    document.getElementById('settings-error').textContent = '';
    document.getElementById('settings-success').style.display = 'none';
}

async function doChangePassword() {
    var errEl = document.getElementById('settings-error');
    var sucEl = document.getElementById('settings-success');
    var newPw = document.getElementById('settings-new-pw').value;
    var confirmPw = document.getElementById('settings-confirm-pw').value;

    errEl.textContent = '';
    sucEl.style.display = 'none';
    sucEl.textContent = '';

    if (!newPw) { errEl.textContent = 'New password is required'; return; }
    if (newPw.length < 4) { errEl.textContent = 'New password must be at least 4 characters'; return; }
    if (newPw !== confirmPw) { errEl.textContent = 'New passwords do not match'; return; }

    try {
        await api('/users/' + currentUser.id + '/password', {
            method: 'PUT',
            body: { newPassword: newPw }
        });
        document.getElementById('settings-new-pw').value = '';
        document.getElementById('settings-confirm-pw').value = '';
        sucEl.textContent = 'Password updated successfully';
        sucEl.style.display = 'block';
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
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
    _msState[id + '_opts'] = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    _msState[id + '_ph'] = placeholder || 'Select...';

    var itemsHtml = _msState[id + '_opts'].length > 0
        ? _msState[id + '_opts'].map(function(o) {
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
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });

    var prev = keepSelection && _msState[id] ? new Set(_msState[id]) : new Set();
    _msState[id + '_opts'] = sorted;
    var validSet = new Set(sorted.map(function(o) { return String(o.value); }));
    _msState[id] = new Set(Array.from(prev).filter(function(v) { return validSet.has(v); }));

    var wrap = document.getElementById(id + '-wrap');
    if (!wrap) return;
    var dd = wrap.querySelector('.multi-select-dropdown');
    if (!dd) return;

    var actionsHtml = '<div class="multi-select-actions">' +
        '<button type="button" onclick="msSelectAll(\'' + id + '\');event.stopPropagation()">Select All</button>' +
        '<button type="button" onclick="msClear(\'' + id + '\');event.stopPropagation()">Clear</button>' +
    '</div>';

    var itemsHtml = sorted.length > 0
        ? sorted.map(function(o) {
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
   Searchable Select Component (Single - for modals)
   ========================================================== */
var _ssInstances = {};

function ssCreate(containerId, options, placeholder, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    _ssInstances[containerId] = {
        options: options.slice(),
        selected: '',
        placeholder: placeholder || '-- Select --',
        onChange: onChange || null,
        filter: '',
        open: false
    };
    _ssRender(containerId);
}

function ssUpdate(containerId, options, keepSelected) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.options = options.slice();
    inst.filter = '';
    if (!keepSelected) inst.selected = '';
    if (keepSelected && inst.selected) {
        var found = options.find(function(o) { return String(o.value) === String(inst.selected); });
        if (!found) inst.selected = '';
    }
    _ssRender(containerId);
}

function ssGetValue(containerId) {
    var inst = _ssInstances[containerId];
    return inst ? inst.selected : '';
}

function ssSetValue(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = String(val);
    _ssRender(containerId);
}

function ssClear(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = '';
    inst.filter = '';
    _ssRender(containerId);
}

function ssGetFiltered(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return [];
    var f = inst.filter.toLowerCase();
    if (!f) return inst.options;
    return inst.options.filter(function(o) { return o.label.toLowerCase().indexOf(f) !== -1; });
}

function _ssRender(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    var container = document.getElementById(containerId);
    if (!container) return;

    var selectedLabel = inst.placeholder;
    if (inst.selected) {
        var found = inst.options.find(function(o) { return String(o.value) === String(inst.selected); });
        if (found) selectedLabel = found.label;
    }

    var filtered = ssGetFiltered(containerId);
    var displayFilter = inst.open ? inst.filter : '';

    var html =
        '<div class="ss-wrapper" style="position:relative">' +
            '<div class="ss-display" onclick="ssToggle(\'' + containerId + '\')" ' +
                'style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;' +
                'background:var(--main-input-bg);border:1px solid var(--main-border);border-radius:var(--radius,6px);' +
                'cursor:pointer;font-size:.85rem;min-height:38px;user-select:none;color:var(--main-text)">' +
                '<span style="' + (!inst.selected ? 'color:var(--main-text3)' : 'color:var(--main-text)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' +
                    esc(selectedLabel) +
                '</span>' +
                '<span style="margin-left:8px;color:var(--main-text3);font-size:.7rem;flex-shrink:0">' +
                    (inst.open ? '&#9650;' : '&#9660;') +
                '</span>' +
            '</div>' +
            (inst.open
                ? '<div class="ss-dropdown" style="position:absolute;top:100%;left:0;right:0;z-index:9999;' +
                    'background:var(--main-surface);border:1px solid var(--main-border);border-top:none;' +
                    'border-radius:0 0 var(--radius,6px) var(--radius,6px);max-height:260px;overflow:hidden;' +
                    'box-shadow:0 4px 12px rgba(0,0,0,.15)">' +
                    '<div style="padding:6px 8px;border-bottom:1px solid var(--main-border)">' +
                        '<input class="input ss-search" type="text" placeholder="Search..." ' +
                            'value="' + esc(displayFilter) + '" ' +
                            'oninput="ssOnFilter(\'' + containerId + '\', this.value)" ' +
                            'onclick="event.stopPropagation()" ' +
                            'style="width:100%;padding:6px 8px;font-size:.82rem;border:1px solid var(--main-border);' +
                            'border-radius:4px;outline:none;background:var(--main-input-bg);color:var(--main-text)">' +
                    '</div>' +
                    '<div class="ss-options" style="overflow-y:auto;max-height:210px">' +
                        (filtered.length === 0
                            ? '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results found</div>'
                            : '<div class="ss-option" data-value="" onclick="ssSelect(\'' + containerId + '\',\'\')" ' +
                                'style="padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--main-text3);' +
                                'border-bottom:1px solid var(--main-border);font-style:italic">' +
                                esc(inst.placeholder) +
                              '</div>' +
                              filtered.map(function(o) {
                                  var isSelected = String(o.value) === String(inst.selected);
                                  return '<div class="ss-option" data-value="' + o.value + '" ' +
                                      'onclick="ssSelect(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\')" ' +
                                      'style="padding:8px 12px;cursor:pointer;font-size:.82rem;' +
                                      (isSelected
                                          ? 'background:var(--accent-soft);color:var(--accent);font-weight:600'
                                          : 'color:var(--main-text)') +
                                      ';border-bottom:1px solid var(--main-border)">' +
                                      esc(o.label) +
                                      '</div>';
                              }).join('')
                        ) +
                    '</div>' +
                '</div>'
                : ''
            ) +
        '</div>';

    container.innerHTML = html;

    if (inst.open) {
        setTimeout(function() {
            var searchEl = container.querySelector('.ss-search');
            if (searchEl) searchEl.focus();
        }, 10);
    }
}

function ssToggle(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    Object.keys(_ssInstances).forEach(function(id) {
        if (id !== containerId && _ssInstances[id].open) {
            _ssInstances[id].open = false;
            _ssInstances[id].filter = '';
            _ssRender(id);
        }
    });
    if (typeof _ssmInstances !== 'undefined') {
        Object.keys(_ssmInstances).forEach(function(id) {
            if (_ssmInstances[id].open) {
                _ssmInstances[id].open = false;
                _ssmInstances[id].filter = '';
                _ssmRender(id);
            }
        });
    }
    inst.open = !inst.open;
    inst.filter = '';
    _ssRender(containerId);
}

function ssOnFilter(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.filter = val;
    var container = document.getElementById(containerId);
    if (!container) return;
    var optionsDiv = container.querySelector('.ss-options');
    if (!optionsDiv) return;
    var filtered = ssGetFiltered(containerId);
    optionsDiv.innerHTML =
        (filtered.length === 0
            ? '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results found</div>'
            : '<div class="ss-option" data-value="" onclick="ssSelect(\'' + containerId + '\',\'\')" ' +
                'style="padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--main-text3);' +
                'border-bottom:1px solid var(--main-border);font-style:italic">' +
                esc(inst.placeholder) +
              '</div>' +
              filtered.map(function(o) {
                  var isSelected = String(o.value) === String(inst.selected);
                  return '<div class="ss-option" data-value="' + o.value + '" ' +
                      'onclick="ssSelect(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\')" ' +
                      'style="padding:8px 12px;cursor:pointer;font-size:.82rem;' +
                      (isSelected
                          ? 'background:var(--main-accent-bg,rgba(99,102,241,.1));color:var(--main-accent,#6366f1);font-weight:600'
                          : 'color:var(--main-text)') +
                      ';border-bottom:1px solid var(--main-border,rgba(0,0,0,.05))">' +
                      esc(o.label) +
                      '</div>';
              }).join('')
        );
}

function ssSelect(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = String(val);
    inst.open = false;
    inst.filter = '';
    _ssRender(containerId);
    if (inst.onChange) inst.onChange(val);
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.ss-wrapper') && !e.target.closest('.ssm-wrapper')) {
        Object.keys(_ssInstances).forEach(function(id) {
            if (_ssInstances[id].open) {
                _ssInstances[id].open = false;
                _ssInstances[id].filter = '';
                _ssRender(id);
            }
        });
        if (typeof _ssmInstances !== 'undefined') {
            Object.keys(_ssmInstances).forEach(function(id) {
                if (_ssmInstances[id].open) {
                    _ssmInstances[id].open = false;
                    _ssmInstances[id].filter = '';
                    _ssmRender(id);
                }
            });
        }
    }
});

/* ==========================================================
   Searchable Multi-Select Component (for filters)
   ========================================================== */
var _ssmInstances = {};

function ssmCreate(containerId, options, placeholder) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        // 数字开头的排前面
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    _ssmInstances[containerId] = {
        options: sorted,
        selected: [],
        placeholder: placeholder || 'All',
        filter: '',
        open: false,
        onChange: null
    };
    _ssmRender(containerId);
}

function ssmUpdate(containerId, options, keepSelected) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    inst.options = sorted;
    inst.filter = '';
    if (keepSelected) {
        var validValues = sorted.map(function(o) { return String(o.value); });
        inst.selected = inst.selected.filter(function(v) { return validValues.indexOf(String(v)) !== -1; });
    } else {
        inst.selected = [];
    }
    _ssmRender(containerId);
}

function ssmGetValues(containerId) {
    var inst = _ssmInstances[containerId];
    return inst ? inst.selected.map(function(v) { return parseInt(v); }) : [];
}

function ssmClear(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    inst.selected = [];
    inst.filter = '';
    _ssmRender(containerId);
    if (inst.onChange) inst.onChange([]);
}

function ssmOnChange(containerId, callback) {
    var inst = _ssmInstances[containerId];
    if (inst) inst.onChange = callback;
}

function _ssmGetFiltered(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return [];
    var f = inst.filter.toLowerCase();
    if (!f) return inst.options;
    return inst.options.filter(function(o) { return o.label.toLowerCase().indexOf(f) !== -1; });
}

function _ssmRender(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var container = document.getElementById(containerId);
    if (!container) return;

    var count = inst.selected.length;
    var displayText = inst.placeholder;
    if (count === 1) {
        var found = inst.options.find(function(o) { return String(o.value) === String(inst.selected[0]); });
        displayText = found ? found.label : inst.selected[0];
    } else if (count > 1) {
        displayText = count + ' selected';
    }

    var filtered = _ssmGetFiltered(containerId);

    var html = '<div class="ssm-wrapper" style="position:relative">' +
        '<div class="ssm-display" onclick="ssmToggle(\'' + containerId + '\')" ' +
            'style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;' +
            'background:var(--main-input-bg);border:1px solid var(--main-border);border-radius:6px;' +
            'cursor:pointer;font-size:.82rem;min-height:36px;user-select:none;gap:6px;color:var(--main-text)">' +
            '<span style="' + (count === 0 ? 'color:var(--main-text3)' : 'color:var(--main-text)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' +
                esc(displayText) +
            '</span>' +
            (count > 0
                ? '<span onclick="event.stopPropagation();ssmClear(\'' + containerId + '\');_ssmRender(\'' + containerId + '\')" style="color:var(--main-text3);font-size:.85rem;cursor:pointer;flex-shrink:0" title="Clear">&times;</span>'
                : '<span style="color:var(--main-text3);font-size:.7rem;flex-shrink:0">' + (inst.open ? '&#9650;' : '&#9660;') + '</span>'
            ) +
        '</div>';

    if (inst.open) {
        html += '<div class="ssm-dropdown" style="position:absolute;top:100%;left:0;right:0;z-index:9999;' +
            'background:var(--main-surface);border:1px solid var(--main-border);border-top:none;' +
            'border-radius:0 0 6px 6px;max-height:300px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.15)">';

        html += '<div style="padding:6px 8px;border-bottom:1px solid var(--main-border)">' +
            '<input class="input ssm-search" type="text" placeholder="Search..." ' +
            'value="' + esc(inst.filter) + '" ' +
            'oninput="ssmOnFilter(\'' + containerId + '\', this.value)" ' +
            'onclick="event.stopPropagation()" ' +
            'style="width:100%;padding:6px 8px;font-size:.8rem;border:1px solid var(--main-border);' +
            'border-radius:4px;outline:none;background:var(--main-input-bg);color:var(--main-text)">' +
            '</div>';

        html += '<div style="display:flex;gap:10px;padding:5px 8px;border-bottom:1px solid var(--main-border);font-size:.75rem">' +
            '<a href="javascript:void(0)" onclick="ssmSelectAll(\'' + containerId + '\')" style="color:var(--accent);text-decoration:none">Select All</a>' +
            '<a href="javascript:void(0)" onclick="ssmClear(\'' + containerId + '\');_ssmRender(\'' + containerId + '\')" style="color:var(--main-text3);text-decoration:none">Clear</a>' +
            '</div>';

        html += '<div class="ssm-options" style="overflow-y:auto;max-height:200px">';
        if (filtered.length === 0) {
            html += '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results</div>';
        } else {
            filtered.forEach(function(o) {
                var checked = inst.selected.indexOf(String(o.value)) !== -1;
                html += '<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:.82rem;' +
                    (checked ? 'background:var(--accent-soft)' : '') + ';border-bottom:1px solid var(--main-border)">' +
                    '<input type="checkbox" ' + (checked ? 'checked' : '') + ' ' +
                    'onchange="ssmToggleOption(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\',this.checked)" ' +
                    'style="accent-color:var(--accent)">' +
                    '<span style="color:var(--main-text)">' + esc(o.label) + '</span>' +
                    '</label>';
            });
        }
        html += '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html;

    if (inst.open) {
        setTimeout(function() {
            var el = container.querySelector('.ssm-search');
            if (el) el.focus();
        }, 10);
    }
}

function ssmToggle(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    Object.keys(_ssmInstances).forEach(function(id) {
        if (id !== containerId && _ssmInstances[id].open) {
            _ssmInstances[id].open = false;
            _ssmInstances[id].filter = '';
            _ssmRender(id);
        }
    });
    if (typeof _ssInstances !== 'undefined') {
        Object.keys(_ssInstances).forEach(function(id) {
            if (_ssInstances[id] && _ssInstances[id].open) {
                _ssInstances[id].open = false;
                _ssInstances[id].filter = '';
                _ssRender(id);
            }
        });
    }
    inst.open = !inst.open;
    inst.filter = '';
    _ssmRender(containerId);
}

function ssmOnFilter(containerId, val) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    inst.filter = val;
    var container = document.getElementById(containerId);
    if (!container) return;
    var optionsDiv = container.querySelector('.ssm-options');
    if (!optionsDiv) return;
    var filtered = _ssmGetFiltered(containerId);
    if (filtered.length === 0) {
        optionsDiv.innerHTML = '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results</div>';
        return;
    }
    optionsDiv.innerHTML = filtered.map(function(o) {
        var checked = inst.selected.indexOf(String(o.value)) !== -1;
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:.82rem;' +
            (checked ? 'background:var(--accent-soft)' : '') + ';border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" ' + (checked ? 'checked' : '') + ' ' +
            'onchange="ssmToggleOption(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\',this.checked)" ' +
            'style="accent-color:var(--accent)">' +
            '<span style="color:var(--main-text)">' + esc(o.label) + '</span>' +
            '</label>';
    }).join('');
}

function ssmToggleOption(containerId, val, checked) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var strVal = String(val);
    if (checked) {
        if (inst.selected.indexOf(strVal) === -1) inst.selected.push(strVal);
    } else {
        inst.selected = inst.selected.filter(function(v) { return String(v) !== strVal; });
    }
    // 保存 scroll 位置
    var container = document.getElementById(containerId);
    var optionsDiv = container ? container.querySelector('.ssm-options') : null;
    var scrollTop = optionsDiv ? optionsDiv.scrollTop : 0;
    _ssmRender(containerId);
    // 恢复 scroll 位置
    var newContainer = document.getElementById(containerId);
    var newOptionsDiv = newContainer ? newContainer.querySelector('.ssm-options') : null;
    if (newOptionsDiv) newOptionsDiv.scrollTop = scrollTop;
    if (inst.onChange) inst.onChange(inst.selected.slice());
}

function ssmSelectAll(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var filtered = _ssmGetFiltered(containerId);
    inst.selected = filtered.map(function(o) { return String(o.value); });
    var container = document.getElementById(containerId);
    var optionsDiv = container ? container.querySelector('.ssm-options') : null;
    var scrollTop = optionsDiv ? optionsDiv.scrollTop : 0;
    _ssmRender(containerId);
    var newContainer = document.getElementById(containerId);
    var newOptionsDiv = newContainer ? newContainer.querySelector('.ssm-options') : null;
    if (newOptionsDiv) newOptionsDiv.scrollTop = scrollTop;
    if (inst.onChange) inst.onChange(inst.selected.slice());
}

/* ==========================================================
   SECTION 10: ADMIN — ATTENDANCE
   ========================================================== */

var adminAttCurrentPage = 1;
var adminAttPageSize = 10;
var adminAttFilteredData = [];

function buildFilterItemOpts(scopeId) {
    var list = sortedProjects(scopeId);
    var seenOther = false;
    var opts = [];
    list.forEach(function(p) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) {
                seenOther = true;
                opts.push({ value: 0, label: 'Other' });
            }
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    });
    return opts;
}

function expandOtherItemIds(itemIds) {
    var hasOther = false;
    var realIds = [];
    itemIds.forEach(function(id) {
        var n = parseInt(id);
        if (n === 0) hasOther = true;
        else if (!isNaN(n) && realIds.indexOf(n) === -1) realIds.push(n);
    });
    if (hasOther) {
        DB.projects.forEach(function(p) {
            if (p.name.toLowerCase() === 'other' && realIds.indexOf(p.id) === -1) {
                realIds.push(p.id);
            }
        });
    }
    return realIds;
}

function sortedMembers() {
    var viewerIds = getViewerMemberIds();
    return DB.members.filter(function(m) {
        return viewerIds.indexOf(m.id) === -1;
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function sortedProjects(scopeId) {
    var list = scopeId
        ? DB.projects.filter(function(p) { return p.categoryId === scopeId; })
        : DB.projects.slice();
    list.sort(function(a, b) {
        var ao = a.name.toLowerCase() === 'other' ? 1 : 0;
        var bo = b.name.toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
    });
    return list;
}

function buildAttEmpOpts(scopeIds, itemIds) {
    if ((!scopeIds || scopeIds.length === 0) && (!itemIds || itemIds.length === 0)) {
        return getNonViewerMembers()
            .sort(function(a, b) { return a.name.localeCompare(b.name); })
            .map(function(m) { return { value: m.id, label: m.name }; });
    }

    var projectIds = DB.projects.map(function(p) { return p.id; });

    if (scopeIds && scopeIds.length > 0) {
        projectIds = DB.projects
            .filter(function(p) { return p.categoryId && scopeIds.indexOf(p.categoryId) !== -1; })
            .map(function(p) { return p.id; });
    }

    if (itemIds && itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        projectIds = projectIds.filter(function(id) { return expandedIds.indexOf(id) !== -1; });
    }

    var memberIds = [];
    DB.attendance.forEach(function(a) {
        if (a.projectId && projectIds.indexOf(a.projectId) !== -1 && memberIds.indexOf(a.memberId) === -1) {
            memberIds.push(a.memberId);
        }
    });

    var viewerMemberIds = getViewerMemberIds();
    memberIds = memberIds.filter(function(mid) { return viewerMemberIds.indexOf(mid) === -1; });

    return memberIds
        .map(function(mid) { return DB.members.find(function(m) { return m.id === mid; }); })
        .filter(Boolean)
        .sort(function(a, b) { return a.name.localeCompare(b.name); })
        .map(function(m) { return { value: m.id, label: m.name }; });
}

function renderAdminAttendance() {
    adminAttCurrentPage = 1;
    adminAttPageSize = 10;

    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var viewerScopeIds = getViewerVisibleScopeIds();
    var scopeList = viewerScopeIds !== null
        ? DB.scopes.filter(function(s) { return viewerScopeIds.indexOf(s.id) !== -1; })
        : DB.scopes.slice();
    scopeList = scopeList.sort(function(a, b) { return a.name.localeCompare(b.name); });
    var deptList = DB.departments.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });

    var scopeOpts = scopeList.map(function(s) { return { value: s.id, label: s.name }; });
    var empOpts = buildAttEmpOpts([], []);
    var deptOpts = deptList.map(function(d) { return { value: d.id, label: d.name }; });

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
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="att-from" value="' + defaultFrom + '" onchange="applyAdminAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="att-to" value="' + today + '" onchange="applyAdminAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-att-dept"></div></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-att-scope"></div></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-att-item"></div></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:150px" id="ssm-att-emp"></div></div>' +
          '<div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">' +
            '<button class="btn btn-ghost btn-sm" onclick="resetAdminAttendanceFilter()">Reset</button>' +
            '<button class="btn btn-blue btn-sm" onclick="exportAttendanceCSV()">&#128196; Export CSV</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="section-head time-entry-head">' +
        '<h2>Time Entries</h2>' +
        '<div style="display:flex;gap:8px">' +
          (currentUser.role !== 'viewer' ? '<button class="btn btn-green" onclick="showAdminAddAttendance()">+ Add Attendance</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="admin-att-table-area"></div>' +
    '</div>';

    ssmCreate('ssm-att-dept', deptOpts, 'All Departments');
    ssmCreate('ssm-att-scope', scopeOpts, 'All Categories');
    ssmCreate('ssm-att-item', buildFilterItemOpts(), 'All ID/Names');
    ssmCreate('ssm-att-emp', empOpts, 'All Employees');

    ssmOnChange('ssm-att-scope', function(selectedScopeIds) {
        var numIds = selectedScopeIds.map(function(v) { return parseInt(v); });
        var filtered = numIds.length > 0
            ? sortedProjects().filter(function(p) { return numIds.indexOf(p.categoryId) !== -1; })
            : sortedProjects();
        var seenOther = false;
        var opts = [];
        filtered.forEach(function(p) {
            if (p.name.toLowerCase() === 'other') {
                if (!seenOther) { seenOther = true; opts.push({ value: 0, label: 'Other' }); }
            } else {
                opts.push({ value: p.id, label: p.name });
            }
        });
        ssmUpdate('ssm-att-item', opts, true);

        var itemIds = ssmGetValues('ssm-att-item').map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-att-dept').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAttEmpOpts(numIds, itemIds);
        if (deptIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-att-emp', newEmpOpts, true);
        applyAdminAttendanceFilter();
    });

    ssmOnChange('ssm-att-dept', function(selectedDeptIds) {
        var numIds = selectedDeptIds.map(function(v) { return parseInt(v); });
        var scopeIds = ssmGetValues('ssm-att-scope').map(function(v) { return parseInt(v); });
        var itemIds = ssmGetValues('ssm-att-item').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAttEmpOpts(scopeIds, itemIds);
        if (numIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return numIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-att-emp', newEmpOpts, true);
        applyAdminAttendanceFilter();
    });

    ssmOnChange('ssm-att-item', function(selectedItemIds) {
        var scopeIds = ssmGetValues('ssm-att-scope').map(function(v) { return parseInt(v); });
        var itemIds = selectedItemIds.map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-att-dept').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAttEmpOpts(scopeIds, itemIds);
        if (deptIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-att-emp', newEmpOpts, true);
        applyAdminAttendanceFilter();
    });

    ssmOnChange('ssm-att-emp', function() { applyAdminAttendanceFilter(); });

    applyAdminAttendanceFilter();
}

function resetAdminAttendanceFilter() {
    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('att-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('att-to').value = today;
    ssmClear('ssm-att-scope');
    ssmClear('ssm-att-dept');
    ssmUpdate('ssm-att-item', buildFilterItemOpts(), false);
    ssmUpdate('ssm-att-emp', buildAttEmpOpts([], []), false);
    adminAttCurrentPage = 1;
    applyAdminAttendanceFilter();
}

function applyAdminAttendanceFilter() {
    var fromDate = document.getElementById('att-from').value;
    var toDate = document.getElementById('att-to').value;
    var scopeIds = ssmGetValues('ssm-att-scope').map(function(v) { return parseInt(v); });
    var itemIds = ssmGetValues('ssm-att-item').map(function(v) { return parseInt(v); });
    var deptIds = ssmGetValues('ssm-att-dept').map(function(v) { return parseInt(v); });
    var empIds = ssmGetValues('ssm-att-emp').map(function(v) { return parseInt(v); });
    if (!fromDate || !toDate) return;

    var filtered = DB.attendance.filter(function(a) { return a.date >= fromDate && a.date <= toDate; });

    // 排除 viewer 的记录
    var viewerMemberIds = getViewerMemberIds();
    filtered = filtered.filter(function(a) { return viewerMemberIds.indexOf(a.memberId) === -1; });

    // 排除 viewer scope 以外的记录（没选 filter 也生效）
    var viewerScopeIds = getViewerVisibleScopeIds();
    if (viewerScopeIds !== null) {
        var vpIds = DB.projects.filter(function(p) {
            return p.categoryId && viewerScopeIds.indexOf(p.categoryId) !== -1;
        }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return vpIds.indexOf(a.projectId) !== -1; });
    }

    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return scopeItemIds.indexOf(a.projectId) !== -1; });
    }
    if (itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        filtered = filtered.filter(function(a) { return expandedIds.indexOf(a.projectId) !== -1; });
    }
    if (deptIds.length > 0) {
        var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
        filtered = filtered.filter(function(a) { return deptMemberIds.indexOf(a.memberId) !== -1; });
    }
    if (empIds.length > 0) {
        filtered = filtered.filter(function(a) { return empIds.indexOf(a.memberId) !== -1; });
    }

    filtered = filtered.sort(function(a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
    adminAttFilteredData = filtered;

    var totalMs = filtered.reduce(function(s, r) {
        if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn));
        return s;
    }, 0);
    var totalCost = filtered.reduce(function(s, r) {
        if (r.clockIn && r.clockOut) { var c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);
    var uniqueEmps = filtered.map(function(r) { return r.memberId; });
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
        rows = '<tr><td colspan="12" style="text-align:center;color:var(--main-text3);padding:30px">No attendance records found</td></tr>';
    } else {
        rows = pageData.map(function(r, idx) {
            var emp = DB.members.find(function(m) { return m.id === r.memberId; });
            var dept = emp && emp.departmentId ? getDeptName(emp.departmentId) : '';
            var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
            var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
            var dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '\u2014';
            var startParts = r.clockIn ? r.clockIn.split('T') : [];
            var endParts = r.clockOut ? r.clockOut.split('T') : [];
            var startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '\u2014';
            var endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '\u2014';
            var itemDisplay = '\u2014';
            if (proj) itemDisplay = scope ? esc(scope.name) + ' &rarr; ' + esc(proj.name) : esc(proj.name);
            var wp = r.work_plan_id ? DB.worklist.find(function(w) { return w.id === r.work_plan_id; }) : null;
            var wd = r.work_done_id ? DB.worklist.find(function(w) { return w.id === r.work_done_id; }) : null;
            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + idx + 1) + '</td>' +
                '<td style="font-family:var(--font-m)">' + formatDateDMY(r.date) + '</td>' +
                '<td style="font-family:var(--font-m)">' + startTime + '</td>' +
                '<td style="font-family:var(--font-m)">' + endTime + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + dur + '</td>' +
                '<td>' + (dept ? esc(dept) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td>' + (emp ? esc(emp.name) : '?') + '</td>' +
                '<td>' + itemDisplay + '</td>' +
                '<td>' + (wp ? esc(wp.title) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td>' + (wd ? esc(wd.title) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.description || '') + '">' + (r.description ? esc(r.description) : '<span style="color:var(--main-text3)">\u2014</span>') + '</td>' +
                '<td>' + (currentUser.role !== 'viewer'
                    ? '<div class="actions-cell">' +
                        '<button class="btn-icon" onclick="showAdminEditAttendance(' + r.id + ')" title="Edit">&#9998;</button>' +
                        '<button class="btn-icon danger" onclick="confirmDeleteAttendance(' + r.id + ')" title="Delete">&#10005;</button>' +
                    '</div>'
                    : '') + '</td></tr>';
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
        '<thead><tr><th style="width:50px">No</th><th>Date</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th>Department</th><th>Employee</th><th>Category &rarr; ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th style="width:90px">Actions</th></tr></thead>'+            '<tbody>' + rows + '</tbody></table></div>' +
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
    var scopeList = DB.scopes.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
    var scopeOptions = '<option value="">-- Select Category --</option>' +
        scopeList.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');

    showModal(
    '<h3>Add Attendance</h3>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="field"><label>Employee</label><div id="ss-att-member"></div></div>' +
        '<div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="' + todayStr() + '"></div>' +
        '<div class="field"><label>Category</label><select class="input" id="att-scope-filter" onchange="adminAttScopeChanged()">' + scopeOptions + '</select></div>' +
        '<div class="field"><label>ID/Name</label><div id="ss-att-item"></div></div>' +
        '<div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- None --</option></select></div>' +
        '<div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(null) + '</select></div>' +
        '<div class="field"><label>Work Plan</label><div id="ss-att-workplan"></div></div>' +
        '<div class="field"><label>Work Done</label><div id="ss-att-workdone"></div></div>' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="09:00"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="18:00"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" placeholder="For Other Selected" style="resize:vertical"></textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminAddAttendance()">Save</button></div>'
    );

    setTimeout(function() {
        var memberOpts = getNonViewerMembers().map(function(m) { return { value: m.id, label: m.name }; });
        ssCreate('ss-att-member', memberOpts, '-- Select Employee --');
        ssCreate('ss-att-item', [], '-- Select Category First --');
        var wlOpts = DB.worklist.map(function(w) { return { value: w.id, label: w.title }; });
        ssCreate('ss-att-workplan', wlOpts, '-- None --');
        ssCreate('ss-att-workdone', wlOpts, '-- None --');
    }, 50);
}

function adminAttScopeChanged() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var sid = scopeId ? parseInt(scopeId) : null;
    var projects = sortedProjects(sid);
    ssUpdate('ss-att-item', projects.map(function(p) { return { value: p.id, label: p.name }; }), false);

    var ssSelect = document.getElementById('att-subscope');
    if (ssSelect) {
        var ssFiltered = sid ? DB.subScopes.filter(function(s) { return s.scopeId === sid; }) : DB.subScopes;
        ssSelect.innerHTML = '<option value="">-- None --</option>' +
            ssFiltered.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
    }

    var wlFiltered = sid ? DB.worklist.filter(function(w) { return w.scopeId === sid; }) : DB.worklist;
    var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
    ssUpdate('ss-att-workplan', wlOpts, false);
    ssUpdate('ss-att-workdone', wlOpts, false);
}

async function doAdminAddAttendance() {
    var errEl = document.getElementById('att-error');
    var memberId = ssGetValue('ss-att-member');
    var date = document.getElementById('att-date').value;
    var itemId = ssGetValue('ss-att-item');
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var workPlanId = ssGetValue('ss-att-workplan');
    var workDoneId = ssGetValue('ss-att-workdone');
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
        hideModal();
        await loadDB();
        renderAdminAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showAdminEditAttendance(id) {
    var entry = DB.attendance.find(function(a) { return a.id === id; });
    if (!entry) return;

    var proj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var currentScopeId = proj && proj.categoryId ? proj.categoryId : '';

    var scopeList = DB.scopes.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
    var scopeOptions = '<option value="">-- Select Category --</option>' +
        scopeList.map(function(s) {
            var sel = currentScopeId === s.id ? ' selected' : '';
            return '<option value="' + s.id + '"' + sel + '>' + esc(s.name) + '</option>';
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
        '<div class="field"><label>ID/Name</label><div id="ss-att-item"></div></div>' +
        '<div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- None --</option></select></div>' +
        '<div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">' + detailOpts(entry.detailId) + '</select></div>' +
        '<div class="field"><label>Work Plan</label><div id="ss-att-workplan"></div></div>' +
        '<div class="field"><label>Work Done</label><div id="ss-att-workdone"></div></div>' +
        '<div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="' + startTime + '"></div>' +
        '<div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="' + endTime + '"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" style="resize:vertical">' + esc(entry.description || '') + '</textarea></div>' +
    '<p class="auth-error" id="att-error"></p>' +
    '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminEditAttendance(' + id + ')">Save</button></div>');

    setTimeout(function() {
        var scopeItems = sortedProjects(currentScopeId || null);
        ssCreate('ss-att-item', scopeItems.map(function(p) { return { value: p.id, label: p.name }; }), '-- Select ID/Name --');
        if (entry.projectId) ssSetValue('ss-att-item', entry.projectId);

        var wlFiltered = currentScopeId ? DB.worklist.filter(function(w) { return w.scopeId === currentScopeId; }) : DB.worklist;
        var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
        ssCreate('ss-att-workplan', wlOpts, '-- None --');
        if (entry.work_plan_id) ssSetValue('ss-att-workplan', entry.work_plan_id);
        ssCreate('ss-att-workdone', wlOpts, '-- None --');
        if (entry.work_done_id) ssSetValue('ss-att-workdone', entry.work_done_id);

        var ssSelect = document.getElementById('att-subscope');
        if (ssSelect) {
            var ssFiltered = currentScopeId ? DB.subScopes.filter(function(s) { return s.scopeId === currentScopeId; }) : DB.subScopes;
            ssSelect.innerHTML = '<option value="">-- None --</option>' +
                ssFiltered.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
            if (entry.subScopeId) ssSelect.value = entry.subScopeId;
        }
    }, 50);
}

function adminAttScopeChangedEdit() {
    var scopeId = document.getElementById('att-scope-filter').value;
    var sid = scopeId ? parseInt(scopeId) : null;
    var projects = sortedProjects(sid);
    ssUpdate('ss-att-item', projects.map(function(p) { return { value: p.id, label: p.name }; }), false);

    var ssSelect = document.getElementById('att-subscope');
    if (ssSelect) {
        var ssFiltered = sid ? DB.subScopes.filter(function(s) { return s.scopeId === sid; }) : DB.subScopes;
        ssSelect.innerHTML = '<option value="">-- None --</option>' +
            ssFiltered.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
    }

    var wlFiltered = sid ? DB.worklist.filter(function(w) { return w.scopeId === sid; }) : DB.worklist;
    var wlOpts = wlFiltered.map(function(w) { return { value: w.id, label: w.title }; });
    ssUpdate('ss-att-workplan', wlOpts, false);
    ssUpdate('ss-att-workdone', wlOpts, false);
}

async function doAdminEditAttendance(id) {
    var errEl = document.getElementById('att-error');
    var date = document.getElementById('att-date').value;
    var itemId = ssGetValue('ss-att-item');
    var subScopeId = document.getElementById('att-subscope').value;
    var detailId = document.getElementById('att-detail').value;
    var workPlanId = ssGetValue('ss-att-workplan');
    var workDoneId = ssGetValue('ss-att-workdone');
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
        hideModal();
        await loadDB();
        renderAdminAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

async function confirmDeleteAttendance(id) {
    var entry = DB.attendance.find(function(a) { return a.id === id; });
    if (!entry) return;
    var emp = DB.members.find(function(m) { return m.id === entry.memberId; });
    var proj = entry.projectId ? DB.projects.find(function(p) { return p.id === entry.projectId; }) : null;
    var scope = proj && proj.categoryId ? DB.scopes.find(function(s) { return s.id === proj.categoryId; }) : null;
    var label = proj ? (scope ? scope.name + ' \u2192 ' + proj.name : proj.name) : '\u2014';
    showModal('<h3>Delete Attendance</h3>' +
        '<p style="color:var(--main-text2);line-height:1.6">Delete entry for <strong style="color:var(--main-text)">' + esc(emp ? emp.name : '?') + '</strong> on <strong style="color:var(--main-text)">' + entry.date + '</strong>?<br>Item: ' + esc(label) + '</p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteAttendance(' + id + ')">Delete</button></div>');
}

async function doDeleteAttendance(id) {
    try {
        await api('/attendance/' + id, { method: 'DELETE' });
        hideModal();
        await loadDB();
        renderAdminAttendance();
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
        return [formatDateDMY(r.date), dept, emp ? emp.name : '', scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', startTime, endTime, dur, r.description || ''];
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

var rptItemPage = 1;
var rptItemPageSize = 10;
var rptItemData_cache = [];
var rptEmpPage = 1;
var rptEmpPageSize = 10;
var rptEmpData_cache = [];

function renderAdminReport() {
    var view = document.getElementById('admin-report');
    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);

    var viewerScopeIds = getViewerVisibleScopeIds();
    var scopeList = viewerScopeIds !== null
        ? DB.scopes.filter(function(s) { return viewerScopeIds.indexOf(s.id) !== -1; })
        : DB.scopes.slice();
    scopeList = scopeList.sort(function(a, b) { return a.name.localeCompare(b.name); });
    var deptList = DB.departments.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });

    var scopeOpts = scopeList.map(function(s) { return { value: s.id, label: s.name }; });
    var deptOpts = deptList.map(function(d) { return { value: d.id, label: d.name }; });
    var empOpts = buildAdminRptEmpOpts([], []);

    view.innerHTML =
        '<div class="app-header"><h2>Report</h2><div class="header-sub">Summary and analytics</div></div>' +
        '<div class="app-body">' +
            '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>' +
                '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="rpt-from" value="' + defaultFrom + '" onchange="generateReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="rpt-to" value="' + today + '" onchange="generateReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-rpt-dept"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-rpt-scope"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-rpt-item"></div></div>' +
                    '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:160px" id="ssm-rpt-emp"></div></div>' +
                    '<div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="resetReport()">Reset</button></div>' +
                '</div>' +
            '</div>' +
            '<div id="rpt-stats"></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px" id="rpt-charts-row1"></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px" id="rpt-charts-row2"></div>' +
            '<div id="rpt-tables"></div>' +
        '</div>';

    ssmCreate('ssm-rpt-dept', deptOpts, 'All Departments');
    ssmCreate('ssm-rpt-scope', scopeOpts, 'All Categories');
    ssmCreate('ssm-rpt-item', buildFilterItemOpts(), 'All ID/Names');
    ssmCreate('ssm-rpt-emp', empOpts, 'All Employees');

    // Category 改变 → 更新 ID/Name 和 Employee
    ssmOnChange('ssm-rpt-scope', function(selectedScopeIds) {
        var numIds = selectedScopeIds.map(function(v) { return parseInt(v); });
        var filtered = numIds.length > 0
            ? sortedProjects().filter(function(p) { return numIds.indexOf(p.categoryId) !== -1; })
            : sortedProjects();
        var seenOther = false;
        var opts = [];
        filtered.forEach(function(p) {
            if (p.name.toLowerCase() === 'other') {
                if (!seenOther) { seenOther = true; opts.push({ value: 0, label: 'Other' }); }
            } else {
                opts.push({ value: p.id, label: p.name });
            }
        });
        ssmUpdate('ssm-rpt-item', opts, true);

        // 更新 Employee
        var itemIds = ssmGetValues('ssm-rpt-item').map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-rpt-dept').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAdminRptEmpOpts(numIds, itemIds);
        if (deptIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-rpt-emp', newEmpOpts, true);

        generateReport();
    });

    // Department 改变 → 更新 Employee
    ssmOnChange('ssm-rpt-dept', function(selectedDeptIds) {
        var numIds = selectedDeptIds.map(function(v) { return parseInt(v); });
        var scopeIds = ssmGetValues('ssm-rpt-scope').map(function(v) { return parseInt(v); });
        var itemIds = ssmGetValues('ssm-rpt-item').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAdminRptEmpOpts(scopeIds, itemIds);
        if (numIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return numIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-rpt-emp', newEmpOpts, true);
        generateReport();
    });

    // ID/Name 改变 → 更新 Employee
    ssmOnChange('ssm-rpt-item', function(selectedItemIds) {
        var scopeIds = ssmGetValues('ssm-rpt-scope').map(function(v) { return parseInt(v); });
        var itemIds = selectedItemIds.map(function(v) { return parseInt(v); });
        var deptIds = ssmGetValues('ssm-rpt-dept').map(function(v) { return parseInt(v); });
        var newEmpOpts = buildAdminRptEmpOpts(scopeIds, itemIds);
        if (deptIds.length > 0) {
            var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
            newEmpOpts = newEmpOpts.filter(function(o) { return deptMemberIds.indexOf(parseInt(o.value)) !== -1; });
        }
        ssmUpdate('ssm-rpt-emp', newEmpOpts, true);
        generateReport();
    });

    ssmOnChange('ssm-rpt-emp', function() { generateReport(); });

    generateReport();
}

function buildAdminRptEmpOpts(scopeIds, itemIds) {
    // 什么都没选 → 返回全部非 viewer employee
    if ((!scopeIds || scopeIds.length === 0) && (!itemIds || itemIds.length === 0)) {
        return getNonViewerMembers()
            .sort(function(a, b) { return a.name.localeCompare(b.name); })
            .map(function(m) { return { value: m.id, label: m.name }; });
    }

    var projectIds = DB.projects.map(function(p) { return p.id; });

    if (scopeIds && scopeIds.length > 0) {
        projectIds = DB.projects
            .filter(function(p) { return p.categoryId && scopeIds.indexOf(p.categoryId) !== -1; })
            .map(function(p) { return p.id; });
    }

    if (itemIds && itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        projectIds = projectIds.filter(function(id) { return expandedIds.indexOf(id) !== -1; });
    }

    var memberIds = [];
    DB.attendance.forEach(function(a) {
        if (a.projectId && projectIds.indexOf(a.projectId) !== -1 && memberIds.indexOf(a.memberId) === -1) {
            memberIds.push(a.memberId);
        }
    });

    var viewerMemberIds = getViewerMemberIds();
    memberIds = memberIds.filter(function(mid) { return viewerMemberIds.indexOf(mid) === -1; });

    return memberIds
        .map(function(mid) { return DB.members.find(function(m) { return m.id === mid; }); })
        .filter(Boolean)
        .sort(function(a, b) { return a.name.localeCompare(b.name); })
        .map(function(m) { return { value: m.id, label: m.name }; });
}

function resetReport() {
    var today = todayStr();
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    document.getElementById('rpt-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('rpt-to').value = today;
    ssmClear('ssm-rpt-scope');
    ssmClear('ssm-rpt-dept');
    ssmUpdate('ssm-rpt-item', buildFilterItemOpts(), false);
    ssmUpdate('ssm-rpt-emp', buildAdminRptEmpOpts([], []), false);
    generateReport();
}

function generateReport() {
    var fromDate = document.getElementById('rpt-from').value;
    var toDate = document.getElementById('rpt-to').value;
    var scopeIds = ssmGetValues('ssm-rpt-scope').map(function(v) { return parseInt(v); });
    var itemIds = ssmGetValues('ssm-rpt-item').map(function(v) { return parseInt(v); });
    var deptIds = ssmGetValues('ssm-rpt-dept').map(function(v) { return parseInt(v); });
    var empIds = ssmGetValues('ssm-rpt-emp').map(function(v) { return parseInt(v); });
    if (!fromDate || !toDate) return;

    var filtered = DB.attendance.filter(function(a) {
        if (!a.date) return false;
        return a.date >= fromDate && a.date <= toDate;
    });

    var viewerMemberIds = getViewerMemberIds();
    filtered = filtered.filter(function(a) { return viewerMemberIds.indexOf(a.memberId) === -1; });
    var viewerScopeIds = getViewerVisibleScopeIds();
    if (viewerScopeIds !== null) {
        var vpIds = DB.projects.filter(function(p) {
            return p.categoryId && viewerScopeIds.indexOf(p.categoryId) !== -1;
        }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return vpIds.indexOf(a.projectId) !== -1; });
    }

    if (scopeIds.length > 0) {
        var scopeItemIds = DB.projects.filter(function(p) { return scopeIds.indexOf(p.categoryId) !== -1; }).map(function(p) { return p.id; });
        filtered = filtered.filter(function(a) { return scopeItemIds.indexOf(a.projectId) !== -1; });
    }
    if (itemIds.length > 0) {
        var expandedIds = expandOtherItemIds(itemIds);
        filtered = filtered.filter(function(a) { return expandedIds.indexOf(a.projectId) !== -1; });
    }
    if (deptIds.length > 0) {
        var deptMemberIds = DB.members.filter(function(m) { return deptIds.indexOf(m.departmentId) !== -1; }).map(function(m) { return m.id; });
        filtered = filtered.filter(function(a) { return deptMemberIds.indexOf(a.memberId) !== -1; });
    }
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
        var proj = DB.projects.find(function(p) { return p.id === a.projectId; });
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

    // ===== CHARTS DATA =====
    var palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

    // Chart 1: Cost by Scope → Item (Bar)
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

    // Chart 2: Cost by Scope (Pie)
    var scopeCosts = {};
    filtered.forEach(function(r) {
        if (!r.clockIn || !r.clockOut) return;
        var ms = new Date(r.clockOut) - new Date(r.clockIn);
        var cost = getEntryCost(r.memberId, ms) || 0;
        var proj = r.projectId ? DB.projects.find(function(p) { return p.id === r.projectId; }) : null;
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
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category &rarr; ID/Name</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="chart-item-cost"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Cost by Category</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="chart-scope-cost"></canvas></div>' +
        '</div>';

    // Chart 3: Monthly Hours Trend
    var monthlyHours = {};
    var monthlyCost = {};
    filtered.forEach(function(r) {
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

    // Chart 4: Employee Hours
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
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Monthly Trend</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="chart-monthly"></canvas></div>' +
        '</div>' +
        '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch">' +
            '<h3 style="margin-bottom:16px;font-size:1rem;color:var(--main-text)">Top Employees by Hours</h3>' +
            '<div style="min-width:600px;height:280px"><canvas id="chart-emp-hours"></canvas></div>' +
        '</div>';

    // ===== TABLES =====
    rptItemData_cache = [];
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
        var cdHtml = '\u2014';
        if (cd !== null) {
            if (cd > 30) cdHtml = '<span style="color:var(--ok);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 7) cdHtml = '<span style="color:var(--warning);font-weight:600">' + cd + 'd left</span>';
            else if (cd > 0) cdHtml = '<span style="color:var(--danger);font-weight:600">' + cd + 'd left</span>';
            else if (cd === 0) cdHtml = '<span style="color:var(--warning);font-weight:600">Today!</span>';
            else cdHtml = '<span style="color:var(--danger);font-weight:600">' + Math.abs(cd) + 'd overdue</span>';
        }
        rptItemData_cache.push({ label: label, cdHtml: cdHtml, members: members, entries: entries, hours: hours, cost: cost });
    });

    rptEmpData_cache = [];
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
        rptEmpData_cache.push({
            name: member ? esc(member.name) : 'Unknown',
            pos: member ? esc(getPositionName(member.positionId)) : '\u2014',
            dept: member ? esc(getDeptName(member.departmentId)) : '\u2014',
            entries: data.entries,
            days: data.days.size,
            ms: data.ms,
            cost: data.cost,
            rate: fmtHourlyRate(member)
        });
    });

    document.getElementById('rpt-tables').innerHTML =
        '<div class="section-head" style="margin-top:8px"><h2>Item Summary</h2></div>' +
        '<div id="rpt-item-table-area"></div>' +
        '<div class="section-head" style="margin-top:24px"><h2>Employee Summary</h2></div>' +
        '<div id="rpt-emp-table-area"></div>';

    rptItemPage = 1;
    rptEmpPage = 1;
    renderRptItemTable(rptItemData_cache);
    renderRptEmpTable(rptEmpData_cache);

    // ===== RENDER CHARTS =====
    var chartTextColor = '#7a7570';
    var chartGridColor = 'rgba(122,117,112,0.15)';

    new Chart(document.getElementById('chart-item-cost'), {
        type: 'bar',
        data: { labels: itemLabels, datasets: [{ label: 'Cost (RM)', data: itemData, backgroundColor: itemColors, borderRadius: 6, maxBarThickness: 50 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { y: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return 'RM' + v; } }, grid: { color: chartGridColor } }, x: { ticks: { color: chartTextColor, maxRotation: 45, font: { size: 10 } }, grid: { display: false } } } }
        });

    new Chart(document.getElementById('chart-scope-cost'), {
        type: 'doughnut',
        data: { labels: scopeLabels, datasets: [{ data: scopeData, backgroundColor: scopeColors, borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: chartTextColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': RM' + ctx.parsed.toFixed(2); } } } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; }
        }
    });

    new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: { labels: prettyMonths, datasets: [
            { label: 'Hours', data: monthHoursData, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'Cost (RM)', data: monthCostData, type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 4, pointBackgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y1', fill: true }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartTextColor, usePointStyle: true, padding: 16 } } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { y: { beginAtZero: true, position: 'left', ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#ef4444', callback: function(v) { return 'RM' + v; } }, grid: { drawOnChartArea: false } }, x: { ticks: { color: chartTextColor }, grid: { display: false } } } }
        });

    new Chart(document.getElementById('chart-emp-hours'), {
        type: 'bar',
        data: { labels: empLabels, datasets: [{ label: 'Hours', data: empData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, maxBarThickness: 30 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            onResize: function(chart, size) { chart.canvas.parentNode.style.width = Math.max(600, size.width) + 'px'; },
            scales: { x: { beginAtZero: true, ticks: { color: chartTextColor, callback: function(v) { return v + 'h'; } }, grid: { color: chartGridColor } }, y: { ticks: { color: chartTextColor, font: { size: 11 } }, grid: { display: false } } } }
        });
}

// ===== Report Table Pagination =====

function buildRptPagination(totalItems, currentPage, pageSize, goFunc, changeFunc) {
    if (totalItems <= 0) return '';
    var totalPages = Math.ceil(totalItems / pageSize) || 1;
    var startIdx = (currentPage - 1) * pageSize;
    var showFrom = startIdx + 1;
    var showTo = Math.min(startIdx + pageSize, totalItems);
    var pageButtons = '';
    var maxVisible = 5;
    var startP = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    var endP = Math.min(totalPages, startP + maxVisible - 1);
    if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);
    pageButtons += '<button onclick="' + goFunc + '(1)" ' + (currentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
    pageButtons += '<button onclick="' + goFunc + '(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
    for (var p = startP; p <= endP; p++) {
        pageButtons += '<button onclick="' + goFunc + '(' + p + ')" class="' + (p === currentPage ? 'active' : '') + '">' + p + '</button>';
    }
    pageButtons += '<button onclick="' + goFunc + '(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
    pageButtons += '<button onclick="' + goFunc + '(' + totalPages + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';
    return '<div class="pagination">' +
        '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + totalItems + '</div>' +
        '<div style="display:flex;align-items:center;gap:20px">' +
            '<div class="pagination-size"><label>Show</label>' +
                '<select onchange="' + changeFunc + '(this.value)">' +
                    '<option value="5"' + (pageSize === 5 ? ' selected' : '') + '>5</option>' +
                    '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10</option>' +
                    '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25</option>' +
                    '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50</option>' +
                '</select></div>' +
            '<div class="pagination-controls">' + pageButtons + '</div>' +
        '</div></div>';
}

function renderRptItemTable(data) {
    var totalPages = Math.ceil(data.length / rptItemPageSize) || 1;
    if (rptItemPage > totalPages) rptItemPage = totalPages;
    if (rptItemPage < 1) rptItemPage = 1;
    var startIdx = (rptItemPage - 1) * rptItemPageSize;
    var pageData = data.slice(startIdx, startIdx + rptItemPageSize);

    var rows = '';
    if (data.length === 0) {
        rows = '<tr><td colspan="6" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            return '<tr><td>' + r.label + '</td>' +
                '<td>' + r.cdHtml + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.members + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.entries + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(r.hours) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(r.cost) + '</td></tr>';
        }).join('');
    }

    document.getElementById('rpt-item-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Category &rarr; ID/Name</th><th>Countdown</th><th style="text-align:right">Members</th><th style="text-align:right">Entries</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        buildRptPagination(data.length, rptItemPage, rptItemPageSize, 'goRptItemPage', 'changeRptItemPageSize');
}

function renderRptEmpTable(data) {
    var totalPages = Math.ceil(data.length / rptEmpPageSize) || 1;
    if (rptEmpPage > totalPages) rptEmpPage = totalPages;
    if (rptEmpPage < 1) rptEmpPage = 1;
    var startIdx = (rptEmpPage - 1) * rptEmpPageSize;
    var pageData = data.slice(startIdx, startIdx + rptEmpPageSize);

    var rows = '';
    if (data.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>';
    } else {
        rows = pageData.map(function(r) {
            return '<tr><td>' + r.name + '</td>' +
                '<td>' + r.pos + '</td>' +
                '<td>' + r.dept + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.entries + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.days + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + formatDuration(r.ms) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + fmtCost(r.cost) + '</td>' +
                '<td style="text-align:right;font-family:var(--font-m)">' + r.rate + '</td></tr>';
        }).join('');
    }

    document.getElementById('rpt-emp-table-area').innerHTML =
        '<div class="table-wrap"><table>' +
            '<thead><tr><th>Employee</th><th>Position</th><th>Department</th><th style="text-align:right">Entries</th><th style="text-align:right">Days</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th><th style="text-align:right">Rate</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        buildRptPagination(data.length, rptEmpPage, rptEmpPageSize, 'goRptEmpPage', 'changeRptEmpPageSize');
}

function goRptItemPage(page) {
    var totalPages = Math.ceil(rptItemData_cache.length / rptItemPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    rptItemPage = page;
    renderRptItemTable(rptItemData_cache);
}

function changeRptItemPageSize(size) {
    rptItemPageSize = parseInt(size);
    rptItemPage = 1;
    renderRptItemTable(rptItemData_cache);
}

function goRptEmpPage(page) {
    var totalPages = Math.ceil(rptEmpData_cache.length / rptEmpPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    rptEmpPage = page;
    renderRptEmpTable(rptEmpData_cache);
}

function changeRptEmpPageSize(size) {
    rptEmpPageSize = parseInt(size);
    rptEmpPage = 1;
    renderRptEmpTable(rptEmpData_cache);
}


/*BOM Panel Material Tracking Part */

/* ==========================================================
   Role and Permission
   ========================================================== */
function getUserRole() {
    return currentUser ? currentUser.role : '';
}

function canEdit() {
    return getUserRole() === 'admin';
}

function ptDateOnly(value) {
    return value ? String(value).slice(0, 10) : '';
}

function ptExportRowsToExcel(rows, sheetName, filePrefix) {
    if (!rows || rows.length === 0) {
        alert('No data to export');
        return;
    }
    if (typeof XLSX === 'undefined') {
        alert('Excel library is not loaded');
        return;
    }

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filePrefix + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/* ==========================================================
   PANEL TRACKING MODULE
   ========================================================== */

let selectedModule = 'attendance';

function selectModule(mod, el) {
    selectedModule = mod;
    document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
    if (el) el.classList.add('active');
    document.getElementById('login-subtitle').textContent =
        mod === 'attendance' ? 'Project Tracking Management' : 'Panel Tracking System';
}

function ptLogout() {
    showModal('<h3>Sign Out</h3><p style="color:var(--main-text2);line-height:1.6">Are you sure you want to sign out?</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoLogout()">Sign Out</button></div>');
}

function ptDoLogout() {
    localStorage.removeItem('multitrade_session');
    localStorage.removeItem('multitrade_pt_page');
    localStorage.removeItem('multitrade_module');
    currentUser = null;
    document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('login-page').classList.add('active');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-error').textContent = '';
    selectedModule = 'attendance';
    document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelector('.login-tab').classList.add('active');
    document.getElementById('login-subtitle').textContent = 'Project Salary Management';
    hideModal();
}

function ptOpenModal(id) { document.getElementById(id).classList.add('active'); }
function ptCloseModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('#panel-layout .modal-overlay, [id^="modal-pt-"]').forEach(function(o) {
    o.addEventListener('click', function(e) { if (e.target === o) o.classList.remove('active'); });
});

// ========================================
// PAGINATION HELPER
// ========================================
var ptPageSize = 10;

function ptPagination(totalItems, currentPage, pageSize, onPageChange, sizeChangeFunc) {
    if (totalItems === 0) return '';
    var totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var startIdx = (currentPage - 1) * pageSize;
    var endIdx = Math.min(startIdx + pageSize, totalItems);
    var showFrom = startIdx + 1;
    var showTo = endIdx;

    var maxVisible = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    var endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    var pageButtons = '';
    pageButtons += '<button onclick="' + onPageChange + '(1)" ' + (currentPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
    pageButtons += '<button onclick="' + onPageChange + '(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') + '>&lsaquo;</button>';
    for (var p = startPage; p <= endPage; p++) {
        pageButtons += '<button onclick="' + onPageChange + '(' + p + ')" class="' + (p === currentPage ? 'active' : '') + '">' + p + '</button>';
    }
    pageButtons += '<button onclick="' + onPageChange + '(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
    pageButtons += '<button onclick="' + onPageChange + '(' + totalPages + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>&raquo;</button>';

    return '<div class="pagination">' +
        '<div class="pagination-info">Showing ' + showFrom + ' to ' + showTo + ' of ' + totalItems + '</div>' +
        '<div style="display:flex;align-items:center;gap:20px">' +
            '<div class="pagination-size"><label>Show</label>' +
                '<select onchange="' + sizeChangeFunc + '(this.value)">' +
                    '<option value="5"' + (pageSize === 5 ? ' selected' : '') + '>5</option>' +
                    '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10</option>' +
                    '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25</option>' +
                    '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50</option>' +
                    '<option value="100"' + (pageSize === 100 ? ' selected' : '') + '>100</option>' +
                '</select></div>' +
            '<div class="pagination-controls">' + pageButtons + '</div>' +
        '</div></div>';
}


// ========================================
//panel load db
// ========================================
let ptDB = { panels: [], materials: [], users: [], dashboard: {}, panelIds: [] };

async function ptLoadDB() {
    try {
        var results = await Promise.all([
            api('/m-dashboard'), api('/m-panels'), api('/m-materials'), api('/m-panel-ids')
        ]);
        ptDB.dashboard = results[0];
        ptDB.panels = results[1];
        ptDB.materials = results[2];
        ptDB.panelIds = results[3];
    } catch (e) {
        console.error('Panel Tracking load error:', e);
    }
    await ptLoadAllUsers();
}

function ptNav(tab, el) {
    localStorage.setItem('multitrade_pt_page', tab);
    document.querySelectorAll('#panel-layout .page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('#pt-nav .nav-item').forEach(n => n.classList.remove('active'));
    var target = document.getElementById('page-' + tab);
    if (target) target.classList.add('active');
    if (el) el.classList.add('active');
    else {
        var match = document.querySelector('#pt-nav .nav-item[data-page="' + tab + '"]');
        if (match) match.classList.add('active');
    }
    if (tab === 'pt-dashboard') ptRenderDashboard();
    else if (tab === 'pt-panel') ptRenderPanel();
    else if (tab === 'pt-material') ptRenderMaterial();
    else if (tab === 'pt-users') { loadDB().then(function() { ptRenderUsers(); }); }
    else if (tab === 'pt-import') ptRenderImport();
    window.scrollTo(0, 0);
}

function ptStatusBadge(s) {
    if (s === 'complete') return '<span class="badge b-green">Complete</span>';
    if (s === 'in_progress') return '<span class="badge b-yellow">In Progress</span>';
    return '<span class="badge b-red">Pending</span>';
}

//---------- Multiple dropdown select--------
function msGetTextValues(id) {
    if (!_msState[id]) return [];
    return Array.from(_msState[id]);
}

// ---------- DASHBOARD ----------
var dashCurrentPage = 1;
var dashPageSize = 10;
var dashCustSelected = [];

function ptRenderDashboard() {
    var d = ptDB.dashboard;
    var el = document.getElementById('pt-dashboard-content');
    var allPanels = ptDB.panelIds || [];

    var customers = [];
    allPanels.forEach(function(p) {
        var c = (p.customer || '').trim();
        if (c && customers.indexOf(c) === -1) customers.push(c);
    });
    customers.sort();
    var custOpts = customers.map(function(c) { return { value: c, label: c }; });

    dashCustSelected = [];

    el.innerHTML =
        '<div class="stats">' +
            '<div class="stat"><div class="label">Total Panels</div><div class="value">' + d.total_panels + '</div></div>' +
            '<div class="stat"><div class="label">Total Materials</div><div class="value">' + d.total_materials + '</div></div>' +
        '</div>' +
        '<div class="filter">' +
            '<input class="input" type="text" placeholder="Search all columns..." id="pt-dash-search" oninput="ptFilterDashboard()" style="max-width:320px">' +
            '<div style="min-width:180px">' + msGenerate('pt-dash-cust', custOpts, 'All Customers') + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-dash-inst-from" onchange="ptFilterDashboard()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-dash-inst-to" onchange="ptFilterDashboard()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
            '<button class="btn btn-ghost btn-sm" onclick="ptResetDashFilter()">Reset</button>' +
            '<span id="pt-dash-count" style="font-size:.82rem;color:var(--main-text3)"></span>' +
        '</div>' +
        '<div class="section-head"><h3>All Panels</h3></div>' +
        '<div id="pt-dash-table-area"></div>';

    msOnChange('pt-dash-cust', function() {
        var raw = msGetTextValues('pt-dash-cust');
        dashCustSelected = raw.filter(function(v) { return v != null && v !== ''; });
        dashCurrentPage = 1;
        ptFilterDashboard();
    });
    ptFilterDashboard();
}

function ptGetFilteredDashboard() {
    var search = (document.getElementById('pt-dash-search').value || '').toLowerCase();
    var instFrom = document.getElementById('pt-dash-inst-from').value;
    var instTo = document.getElementById('pt-dash-inst-to').value;

    return (ptDB.panelIds || []).filter(function(p) {
        if (search) {
            var haystack = [
                p.name,
                p.customer,
                p.start_date,
                p.end_date,
                p.install_date,
                formatDateDMY(p.start_date),
                formatDateDMY(p.end_date),
                formatDateDMY(p.install_date)
            ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (dashCustSelected.length > 0) {
            var pc = (p.customer || '').trim();
            if (dashCustSelected.indexOf(pc) === -1) return false;
        }
        var id = p.install_date ? p.install_date.slice(0, 10) : '';
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;
        return true;
    });
}

function ptFilterDashboard() {
    var filtered = ptGetFilteredDashboard();
    document.getElementById('pt-dash-count').textContent = filtered.length + ' panels';

    var totalPages = Math.ceil(filtered.length / dashPageSize) || 1;
    if (dashCurrentPage > totalPages) dashCurrentPage = totalPages;
    if (dashCurrentPage < 1) dashCurrentPage = 1;
    var startIdx = (dashCurrentPage - 1) * dashPageSize;
    var pageData = filtered.slice(startIdx, startIdx + dashPageSize);

    var area = document.getElementById('pt-dash-table-area');
    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty-msg">No panels found</div>';
        return;
    }
    area.innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>No</th><th>Panel ID</th><th>Customer</th><th>Start Date</th><th>End Date</th><th>Install Date</th></tr></thead><tbody>' +
        pageData.map(function(p, i) {
            return '<tr style="cursor:pointer" onclick="ptOpenDrawer(' + p.id + ')">' +
                '<td>' + (startIdx + i + 1) + '</td>' +
                '<td><strong>' + esc(p.name) + '</strong></td>' +
                '<td>' + esc(p.customer || '—') + '</td>' +
                '<td>' + formatDateDMY(p.start_date) + '</td>' +
                '<td>' + formatDateDMY(p.end_date) + '</td>' +
                '<td>' + formatDateDMY(p.install_date) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        ptPagination(filtered.length, dashCurrentPage, dashPageSize, 'goDashPage', 'changeDashPageSize');
}

function ptResetDashFilter() {
    document.getElementById('pt-dash-search').value = '';
    document.getElementById('pt-dash-inst-from').value = '';
    document.getElementById('pt-dash-inst-to').value = '';
    dashCustSelected = [];
    msClear('pt-dash-cust');
    dashCurrentPage = 1;
    ptFilterDashboard();
}

function goDashPage(page) {
    dashCurrentPage = page;
    ptFilterDashboard();
}
function changeDashPageSize(size) {
    dashPageSize = parseInt(size);
    dashCurrentPage = 1;
    ptFilterDashboard();
}

// ---------- PANELS ----------
var panelCurrentPage = 1;
var panelPageSize = 10;
var panelCustSelected = [];

function ptRenderPanel() {
    var el = document.getElementById('pt-panel-content');
    var addBtn = canEdit() ? '<button class="btn btn-green btn-sm" onclick="ptOpenAddPanel()">+ Add Panel</button>' : '';

    var customers = [];
    (ptDB.panelIds || []).forEach(function(p) {
        var c = (p.customer || '').trim();
        if (c && customers.indexOf(c) === -1) customers.push(c);
    });
    customers.sort();
    var custOpts = customers.map(function(c) { return { value: c, label: c }; });

    panelCustSelected = [];

    el.innerHTML =
        '<div class="filter">' +
            '<input class="input" type="text" placeholder="Search all columns..." id="pt-panel-search" oninput="ptFilterPanels()" style="max-width:280px">' +
            '<div style="min-width:180px">' + msGenerate('pt-panel-cust', custOpts, 'All Customers') + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Start Date</label><input type="date" class="input" id="pt-panel-start" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="var f=this.value,t=document.getElementById(\'pt-panel-end\').value;if(f){document.getElementById(\'pt-panel-end\').min=f;if(t&&t<f)document.getElementById(\'pt-panel-end\').value=this.value}ptFilterPanels()"></div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">End Date</label><input type="date" class="input" id="pt-panel-end" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="var f=document.getElementById(\'pt-panel-start\').value,t=this.value;if(f&&t&&t<f)this.value=f;ptFilterPanels()"></div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-panel-inst-from" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="var f=this.value,t=document.getElementById(\'pt-panel-inst-to\').value;if(f){document.getElementById(\'pt-panel-inst-to\').min=f;if(t&&t<f)document.getElementById(\'pt-panel-inst-to\').value=this.value}ptFilterPanels()"></div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-panel-inst-to" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="var f=document.getElementById(\'pt-panel-inst-from\').value,t=this.value;if(f&&t&&t<f)this.value=f;ptFilterPanels()"></div>' +
            '<button class="btn btn-ghost btn-sm" onclick="ptResetPanelFilter()">Reset</button>' +
            '<span id="pt-panel-count" style="font-size:.82rem;color:var(--main-text3)"></span>' +
        '</div>' +
        '<div class="section-head">' +
            '<h3>All Panels</h3>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
                '<button class="btn btn-blue btn-sm" onclick="ptExportPanelsExcel()">&#128196; Export Excel</button>' +
                addBtn +
            '</div>' +
        '</div>' +
        '<div id="pt-panel-table-area"></div>';

    msOnChange('pt-panel-cust', function() {
        var raw = msGetTextValues('pt-panel-cust');
        panelCustSelected = raw.filter(function(v) { return v != null && v !== ''; });
        panelCurrentPage = 1;
        ptFilterPanels();
    });
    ptFilterPanels();
}

function ptGetFilteredPanels() {
    var search = (document.getElementById('pt-panel-search').value || '').toLowerCase();
    var startFilter = document.getElementById('pt-panel-start').value;
    var endFilter = document.getElementById('pt-panel-end').value;
    var instFrom = document.getElementById('pt-panel-inst-from').value;
    var instTo = document.getElementById('pt-panel-inst-to').value;

    return (ptDB.panelIds || []).filter(function(p) {
        if (search) {
            var haystack = [
                p.name,
                p.customer,
                p.start_date,
                p.end_date,
                p.install_date,
                formatDateDMY(p.start_date),
                formatDateDMY(p.end_date),
                formatDateDMY(p.install_date)
            ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (panelCustSelected.length > 0) {
            var pc = (p.customer || '').trim();
            if (panelCustSelected.indexOf(pc) === -1) return false;
        }

        var sd = p.start_date ? p.start_date.slice(0, 10) : '';
        var ed = p.end_date ? p.end_date.slice(0, 10) : '';
        var id = p.install_date ? p.install_date.slice(0, 10) : '';

        if (startFilter && (!sd || sd < startFilter)) return false;
        if (endFilter && (!ed || ed > endFilter)) return false;
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;

        return true;
    });
}

function ptFilterPanels() {
    var filtered = ptGetFilteredPanels();
    document.getElementById('pt-panel-count').textContent = filtered.length + ' panels';

    var totalPages = Math.ceil(filtered.length / panelPageSize) || 1;
    if (panelCurrentPage > totalPages) panelCurrentPage = totalPages;
    if (panelCurrentPage < 1) panelCurrentPage = 1;
    var startIdx = (panelCurrentPage - 1) * panelPageSize;
    var pageData = filtered.slice(startIdx, startIdx + panelPageSize);

    var area = document.getElementById('pt-panel-table-area');
    if (filtered.length === 0) { area.innerHTML = '<div class="empty-msg">No panels found</div>'; return; }
    area.innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>No</th><th>Panel ID</th><th>Customer</th><th>Start Date</th><th>End Date</th><th>Install Date</th><th>Actions</th></tr></thead><tbody>' +
        pageData.map(function(p, i) {
            return '<tr style="cursor:pointer" onclick="ptOpenDrawer(' + p.id + ')">' +
                '<td>' + (startIdx + i + 1) + '</td>' +
                '<td><strong>' + esc(p.name) + '</strong></td>' +
                '<td>' + esc(p.customer || '—') + '</td>' +
                '<td>' + formatDateDMY(p.start_date) + '</td>' +
                '<td>' + formatDateDMY(p.end_date) + '</td>' +
                '<td>' + formatDateDMY(p.install_date) + '</td>' +
                '<td onclick="event.stopPropagation()">' + (canEdit()
                ? '<div style="display:flex;gap:4px">' +
                    '<button class="btn btn-ghost btn-sm" onclick="ptShowEditPanel(' + p.id + ')">Edit</button>' +
                    '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeletePanel(' + p.id + ')">&#10005;</button>' +
                '</div>'
                : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        ptPagination(filtered.length, panelCurrentPage, panelPageSize, 'goPanelPage', 'changePanelPageSize');
}


function ptResetPanelFilter() {
    document.getElementById('pt-panel-search').value = '';
    document.getElementById('pt-panel-start').value = '';
    document.getElementById('pt-panel-end').value = '';
    document.getElementById('pt-panel-inst-from').value = '';
    document.getElementById('pt-panel-inst-to').value = '';
    panelCustSelected = [];
    msClear('pt-panel-cust');
    panelCurrentPage = 1;
    ptFilterPanels();
}

function goPanelPage(page) {
    panelCurrentPage = page;
    ptFilterPanels();
}
function changePanelPageSize(size) {
    panelPageSize = parseInt(size);
    panelCurrentPage = 1;
    ptFilterPanels();
}

function ptExportPanelsExcel() {
    var rows = ptGetFilteredPanels().map(function(p, i) {
        return {
            No: i + 1,
            'Panel ID': p.name || '',
            Customer: p.customer || '',
            'Start Date': formatDateDMY(p.start_date),
            'End Date': formatDateDMY(p.end_date),
            'Install Date': formatDateDMY(p.install_date)
        };
    });
    ptExportRowsToExcel(rows, 'Panels', 'panels');
}


function ptOpenAddPanel() {
    document.getElementById('pt-ap-name').value = '';
    document.getElementById('pt-ap-customer').value = '';
    document.getElementById('pt-ap-start').value = '';
    document.getElementById('pt-ap-end').value = '';
    document.getElementById('pt-ap-instdate').value = '';
    document.getElementById('pt-ap-error').textContent = '';
    ptOpenModal('modal-pt-add-panel');
}

async function ptDoAddPanel() {
    var name = document.getElementById('pt-ap-name').value.trim();
    var errEl = document.getElementById('pt-ap-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter a panel ID/name'; return; }
    try {
        var scopeRes = await api('/scopes');
        var panelScope = scopeRes.find(function(s) { return s.name.toLowerCase().indexOf('panel build') !== -1; });
        if (!panelScope) { errEl.textContent = 'Panel Build scope not found'; return; }
        await api('/projects', { method: 'POST', body: {
            name: name,
            categoryId: panelScope.id,
            startDate: document.getElementById('pt-ap-start').value || null,
            endDate: document.getElementById('pt-ap-end').value || null,
            customer: document.getElementById('pt-ap-customer').value.trim(),
            installDate: document.getElementById('pt-ap-instdate').value || null
        }});
        ptCloseModal('modal-pt-add-panel');
        await ptLoadDB();
        ptRenderPanel();
    } catch (e) { errEl.textContent = e.message; }
}

function ptShowEditPanel(id) {
    var p = (ptDB.panelIds || []).find(function(x) { return x.id === id; });
    if (!p) return;
    document.getElementById('pt-ep-id').value = p.id;
    document.getElementById('pt-ep-name').value = p.name;
    document.getElementById('pt-ep-customer').value = p.customer || '';
    document.getElementById('pt-ep-start').value = p.start_date ? p.start_date.slice(0, 10) : '';
    document.getElementById('pt-ep-end').value = p.end_date ? p.end_date.slice(0, 10) : '';
    document.getElementById('pt-ep-instdate').value = p.install_date ? p.install_date.slice(0, 10) : '';
    document.getElementById('pt-ep-error').textContent = '';
    ptOpenModal('modal-pt-edit-panel');
}

async function ptDoEditPanel() {
    var id = document.getElementById('pt-ep-id').value;
    var name = document.getElementById('pt-ep-name').value.trim();
    var errEl = document.getElementById('pt-ep-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter a panel name'; return; }
    try {
        var scopeRes = await api('/scopes');
        var panelScope = scopeRes.find(function(s) { return s.name.toLowerCase().indexOf('panel build') !== -1; });
        await api('/projects/' + id, { method: 'PUT', body: {
            name: name,
            categoryId: panelScope ? panelScope.id : null,
            startDate: document.getElementById('pt-ep-start').value || null,
            endDate: document.getElementById('pt-ep-end').value || null,
            customer: document.getElementById('pt-ep-customer').value.trim(),
            installDate: document.getElementById('pt-ep-instdate').value || null
        }});
        ptCloseModal('modal-pt-edit-panel');
        await ptLoadDB();
        ptRenderPanel();
    } catch (e) { errEl.textContent = e.message; }
}

function ptDeletePanel(id) {
    var p = (ptDB.panelIds || []).find(function(x) { return x.id === id; });
    if (!p) return;
    showModal('<h3>Delete Panel</h3><p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">' + esc(p.name) + '</strong>?</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeletePanel(' + id + ')">Delete</button></div>');
}

async function ptDoDeletePanel(id) {
    hideModal();
    try {
        await api('/projects/' + id, { method: 'DELETE' });
        await ptLoadDB();
        ptRenderPanel();
    } catch (e) { alert(e.message); }
}


// ---------- DRAWER ----------
var drawerPanelMatPage = 1;
var drawerPanelMatPageSize = 5;
var drawerSiblingsPage = 1;
var drawerSiblingsPageSize = 5;
var drawerCurrentPanelId = null;
var drawerCurrentMatId = null;

function ptOpenDrawer(panelId) {
    drawerPanelMatPage = 1;
    drawerCurrentPanelId = panelId;
    drawerCurrentMatId = null;
    ptRenderDrawerPanel();
}

function ptRenderDrawerPanel() {
    var panelId = drawerCurrentPanelId;
    var panel = (ptDB.panelIds || []).find(function(p) { return p.id === panelId; });
    if (!panel) return;

    var overlay = document.getElementById('pt-drawer-overlay');
    var drawer = document.getElementById('pt-drawer');
    var title = document.getElementById('pt-drawer-title');
    var body = document.getElementById('pt-drawer-body');

    title.textContent = panel.name || 'Panel Details';

    var materials = (ptDB.materials || []).filter(function(m) {
        return m.panel_no === panel.name;
    });

    var matTotalPages = Math.ceil(materials.length / drawerPanelMatPageSize) || 1;
    if (drawerPanelMatPage > matTotalPages) drawerPanelMatPage = matTotalPages;
    if (drawerPanelMatPage < 1) drawerPanelMatPage = 1;
    var matStartIdx = (drawerPanelMatPage - 1) * drawerPanelMatPageSize;
    var matPageData = materials.slice(matStartIdx, matStartIdx + drawerPanelMatPageSize);

    var matRows = '';
    if (materials.length === 0) {
        matRows = '<div style="text-align:center;padding:24px;color:var(--main-text3);font-size:.88rem">No materials assigned</div>';
    } else {
        matRows = '<div class="table-wrap"><table><thead><tr>' +
            '<th style="width:40px">No</th><th>Part No</th><th>Brand</th><th>Description</th><th>Serial No</th><th>Vendor</th><th>Vendor PO</th><th>YOM</th><th>Unit</th><th style="text-align:right">Price</th>' +
            '</tr></thead><tbody>' +
            matPageData.map(function(m, i) {
                return '<tr style="cursor:pointer" onclick="ptCloseDrawer();setTimeout(function(){ptOpenMaterialDrawer(' + m.id + ')},220)">' +
                    '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (matStartIdx + i + 1) + '</td>' +
                    '<td><strong>' + esc(m.part_no) + '</strong></td>' +
                    '<td>' + esc(m.brand || '—') + '</td>' +
                    '<td>' + esc(m.description || '—') + '</td>' +
                    '<td style="font-family:var(--font-m)">' + esc(m.serial_no || '—') + '</td>' +
                    '<td>' + esc(m.vendor || '—') + '</td>' +
                    '<td>' + esc(m.vendor_po_no || '—') + '</td>' +
                    '<td style="font-family:var(--font-m)">' + esc(m.yom || '—') + '</td>' +
                    '<td>' + esc(m.unit || '—') + '</td>' +
                    '<td style="text-align:right;font-family:var(--font-m)">' + (m.unit_price != null && m.unit_price > 0 ? parseFloat(m.unit_price).toLocaleString('en-MY', { maximumFractionDigits: 2 }) : '—') + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +
            ptPagination(materials.length, drawerPanelMatPage, drawerPanelMatPageSize, 'goDrawerPanelMatPage', 'changeDrawerPanelMatPageSize');
    }

    var totalCost = materials.reduce(function(sum, m) {
        return sum + (parseFloat(m.unit_price) || 0) * (parseFloat(m.qty) || 1);
    }, 0);

    body.innerHTML =
        '<div class="pt-drawer-section">' +
            '<h4>Panel Information</h4>' +
            '<div class="pt-info-grid">' +
                '<div class="pt-info-item"><span class="pt-info-label">Panel ID</span><span class="pt-info-value">' + esc(panel.name) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Customer</span><span class="pt-info-value">' + esc(panel.customer || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Start Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.start_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">End Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.end_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Install Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.install_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Materials Count</span><span class="pt-info-value mono">' + materials.length + '</span></div>' +
            '</div>' +
        '</div>' +

        (totalCost > 0 ?
        '<div class="pt-drawer-section">' +
            '<h4>Cost Summary</h4>' +
            '<div class="pt-info-grid">' +
                '<div class="pt-info-item"><span class="pt-info-label">Total Material Cost</span><span class="pt-info-value" style="color:var(--accent);font-family:var(--font-m);font-size:1.1rem">RM ' + totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>' +
            '</div>' +
        '</div>' : '') +

        '<div class="pt-drawer-section">' +
            '<h4>Materials (' + materials.length + ')</h4>' +
            matRows +
        '</div>';

    overlay.classList.add('active');
    drawer.classList.add('active');
}

function goDrawerPanelMatPage(page) {
    drawerPanelMatPage = page;
    ptRenderDrawerPanel();
}

function changeDrawerPanelMatPageSize(size) {
    drawerPanelMatPageSize = parseInt(size);
    drawerPanelMatPage = 1;
    ptRenderDrawerPanel();
}

function ptCloseDrawer() {
    document.getElementById('pt-drawer-overlay').classList.remove('active');
    document.getElementById('pt-drawer').classList.remove('active');
}

function ptOpenMaterialDrawer(matId) {
    drawerSiblingsPage = 1;
    drawerCurrentMatId = matId;
    drawerCurrentPanelId = null;
    ptRenderDrawerMaterial();
}

function ptRenderDrawerMaterial() {
    var matId = drawerCurrentMatId;
    var m = ptDB.materials.find(function(x) { return x.id === matId; });
    if (!m) return;

    var overlay = document.getElementById('pt-drawer-overlay');
    var drawer = document.getElementById('pt-drawer');
    var title = document.getElementById('pt-drawer-title');
    var body = document.getElementById('pt-drawer-body');

    title.textContent = m.part_no || 'Material Details';

    var panel = m.panel_no ? (ptDB.panelIds || []).find(function(p) { return p.name === m.panel_no; }) : null;

    var siblings = m.panel_no
        ? ptDB.materials.filter(function(x) { return x.panel_no === m.panel_no; })
        : [];

    var sibTotalPages = Math.ceil(siblings.length / drawerSiblingsPageSize) || 1;
    if (drawerSiblingsPage > sibTotalPages) drawerSiblingsPage = sibTotalPages;
    if (drawerSiblingsPage < 1) drawerSiblingsPage = 1;
    var sibStartIdx = (drawerSiblingsPage - 1) * drawerSiblingsPageSize;
    var sibPageData = siblings.slice(sibStartIdx, sibStartIdx + drawerSiblingsPageSize);

    var sibRows = '';
    if (siblings.length > 0) {
        sibRows = '<div class="pt-drawer-section">' +
            '<h4>Materials in ' + esc(m.panel_no) + ' (' + siblings.length + ')</h4>' +
            '<div class="table-wrap"><table><thead><tr>' +
                '<th style="width:40px">No</th><th>Part No</th><th>Brand</th><th>Description</th><th>Serial No</th><th>Vendor</th><th>Vendor PO</th><th>YOM</th><th>Unit</th><th style="text-align:right">Price</th>' +
            '</tr></thead><tbody>' +
            sibPageData.map(function(s, i) {
                return '<tr style="cursor:pointer" onclick="ptCloseDrawer();setTimeout(function(){ptOpenMaterialDrawer(' + s.id + ')},220)">' +
                    '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (sibStartIdx + i + 1) + '</td>' +
                    '<td><strong>' + esc(s.part_no) + '</strong></td>' +
                    '<td>' + esc(s.brand || '—') + '</td>' +
                    '<td>' + esc(s.description || '—') + '</td>' +
                    '<td style="font-family:var(--font-m)">' + esc(s.serial_no || '—') + '</td>' +
                    '<td>' + esc(s.vendor || '—') + '</td>' +
                    '<td>' + esc(s.vendor_po_no || '—') + '</td>' +
                    '<td style="font-family:var(--font-m)">' + esc(s.yom || '—') + '</td>' +
                    '<td>' + esc(s.unit || '—') + '</td>' +
                    '<td style="text-align:right;font-family:var(--font-m)">' + (s.unit_price != null && s.unit_price > 0 ? parseFloat(s.unit_price).toLocaleString('en-MY', { maximumFractionDigits: 2 }) : '—') + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +
            ptPagination(siblings.length, drawerSiblingsPage, drawerSiblingsPageSize, 'goDrawerSiblingsPage', 'changeDrawerSiblingsPageSize') +
        '</div>';
    }

    body.innerHTML =
        '<div class="pt-drawer-section">' +
            '<h4>Material Information</h4>' +
            '<div class="pt-info-grid">' +
                '<div class="pt-info-item"><span class="pt-info-label">Part No</span><span class="pt-info-value">' + esc(m.part_no) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Serial No</span><span class="pt-info-value mono">' + esc(m.serial_no || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Brand</span><span class="pt-info-value">' + esc(m.brand || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Description</span><span class="pt-info-value">' + esc(m.description || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Category</span><span class="pt-info-value">' + esc(m.category || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Unit</span><span class="pt-info-value">' + esc(m.unit || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Price</span><span class="pt-info-value mono">' + (m.unit_price != null && m.unit_price > 0 ? 'RM ' + parseFloat(m.unit_price).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">YOM</span><span class="pt-info-value mono">' + esc(m.yom || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Vendor</span><span class="pt-info-value">' + esc(m.vendor || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Vendor PO No</span><span class="pt-info-value mono">' + esc(m.vendor_po_no || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Install Date</span><span class="pt-info-value mono">' + formatDateDMY(m.install_date) + '</span></div>' +
            '</div>' +
        '</div>' +

        (panel ?
        '<div class="pt-drawer-section">' +
            '<h4>Panel Information</h4>' +
            '<div class="pt-info-grid">' +
                '<div class="pt-info-item"><span class="pt-info-label">Panel ID</span><span class="pt-info-value">' + esc(panel.name) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Customer</span><span class="pt-info-value">' + esc(panel.customer || '—') + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Start Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.start_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">End Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.end_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Install Date</span><span class="pt-info-value mono">' + formatDateDMY(panel.install_date) + '</span></div>' +
                '<div class="pt-info-item"><span class="pt-info-label">Total Materials</span><span class="pt-info-value mono">' + siblings.length + '</span></div>' +
            '</div>' +
        '</div>' :
        '<div class="pt-drawer-section">' +
            '<h4>Panel Information</h4>' +
            '<div style="text-align:center;padding:24px;color:var(--main-text3);font-size:.88rem">Not assigned to any panel</div>' +
        '</div>') +

        sibRows;

    overlay.classList.add('active');
    drawer.classList.add('active');
}

function goDrawerSiblingsPage(page) {
    drawerSiblingsPage = page;
    ptRenderDrawerMaterial();
}

function changeDrawerSiblingsPageSize(size) {
    drawerSiblingsPageSize = parseInt(size);
    drawerSiblingsPage = 1;
    ptRenderDrawerMaterial();
}

// ---------- MATERIALS ----------
var matCurrentPage = 1;
var matPageSize = 10;
var matBrandSelected = [];
var matCatSelected = [];

function ptRenderMaterial() {
    var el = document.getElementById('pt-material-content');
    var addBtn = canEdit() ? '<button class="btn btn-green btn-sm" onclick="ptOpenAddMaterial()">+ Add Material</button>' : '';

    var brands = [];
    var cats = [];
    (ptDB.materials || []).forEach(function(m) {
        var b = (m.brand || '').trim();
        if (b && brands.indexOf(b) === -1) brands.push(b);
        var c = (m.category || '').trim();
        if (c && cats.indexOf(c) === -1) cats.push(c);
    });
    brands.sort();
    cats.sort();
    var brandOpts = brands.map(function(b) { return { value: b, label: b }; });
    var catOpts = cats.map(function(c) { return { value: c, label: c }; });

    matBrandSelected = [];
    matCatSelected = [];

    el.innerHTML =
        '<div class="filter">' +
            '<input class="input" type="text" placeholder="Search all columns..." id="pt-mat-search" oninput="ptFilterMaterials()" style="max-width:280px">' +
            '<div style="min-width:160px">' + msGenerate('pt-mat-brand', brandOpts, 'All Brands') + '</div>' +
            '<div style="min-width:160px">' + msGenerate('pt-mat-cat', catOpts, 'All Categories') + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-mat-inst-from" onchange="ptFilterMaterials()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +
            '<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-mat-inst-to" onchange="ptFilterMaterials()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>' +            
            '<button class="btn btn-ghost btn-sm" onclick="ptResetMatFilter()">Reset</button>' +
            '<span id="pt-mat-count" style="font-size:.82rem;color:var(--main-text3)"></span>' +
            '<div style="flex:1"></div>' +
        '</div>' +
        '<div class="section-head">' +
            '<h3>All Materials</h3>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
                '<button class="btn btn-blue btn-sm" onclick="ptExportMaterialsExcel()">&#128196; Export Excel</button>' +
                addBtn +
            '</div>' +
        '</div>' +

        '<div id="pt-mat-table-area"></div>';

    msOnChange('pt-mat-brand', function() {
        var raw = msGetTextValues('pt-mat-brand');
        matBrandSelected = raw.filter(function(v) { return v != null && v !== ''; });
        matCurrentPage = 1;
        ptFilterMaterials();
    });
    msOnChange('pt-mat-cat', function() {
        var raw = msGetTextValues('pt-mat-cat');
        matCatSelected = raw.filter(function(v) { return v != null && v !== ''; });
        matCurrentPage = 1;
        ptFilterMaterials();
    });
    ptFilterMaterials();
}

function ptGetFilteredMaterials() {
    var search = (document.getElementById('pt-mat-search').value || '').toLowerCase();
    var instFrom = document.getElementById('pt-mat-inst-from').value;
    var instTo = document.getElementById('pt-mat-inst-to').value;

    return (ptDB.materials || []).filter(function(m) {
        if (search) {
            var haystack = [
                m.part_no, m.brand, m.description, m.serial_no, m.yom,
                m.vendor, m.vendor_po_no, m.panel_no, m.install_date,
                formatDateDMY(m.install_date),
                m.category, m.unit, m.unit_price
            ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (matBrandSelected.length > 0) {
            var mb = (m.brand || '').trim();
            if (matBrandSelected.indexOf(mb) === -1) return false;
        }
        if (matCatSelected.length > 0) {
            var mc = (m.category || '').trim();
            if (matCatSelected.indexOf(mc) === -1) return false;
        }
        var id = m.install_date ? m.install_date.slice(0, 10) : '';
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;
        return true;
    });
}


function ptFilterMaterials() {
    var filtered = ptGetFilteredMaterials();

    document.getElementById('pt-mat-count').textContent = filtered.length + ' materials';

    var totalPages = Math.ceil(filtered.length / matPageSize) || 1;
    if (matCurrentPage > totalPages) matCurrentPage = totalPages;
    if (matCurrentPage < 1) matCurrentPage = 1;
    var startIdx = (matCurrentPage - 1) * matPageSize;
    var pageData = filtered.slice(startIdx, startIdx + matPageSize);

    var area = document.getElementById('pt-mat-table-area');
    if (filtered.length === 0) { area.innerHTML = '<div class="empty-msg">No materials found</div>'; return; }
    area.innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>No</th><th>Part No</th><th>Description</th><th>Brand</th><th>Serial No</th><th>Vendor PO</th><th>Vendor</th><th>Panel ID</th><th>YOM</th><th>Category</th><th>Unit</th><th>Price</th><th>Install Date</th><th>Actions</th></tr></thead><tbody>' +
        pageData.map(function(m, i) {
            return '<tr style="cursor:pointer" onclick="ptOpenMaterialDrawer(' + m.id + ')">' +
                '<td>' + (startIdx + i + 1) + '</td>' +
                '<td><strong>' + esc(m.part_no) + '</strong></td>' +
                '<td>' + esc(m.description || '—') + '</td>' +
                '<td>' + esc(m.brand) + '</td>' +
                '<td>' + esc(m.serial_no || '—') + '</td>' +
                '<td>' + esc(m.vendor_po_no || '—') + '</td>' +
                '<td>' + esc(m.vendor || '—') + '</td>' +
                '<td>' + esc(m.panel_no || '—') + '</td>' +
                '<td>' + esc(m.yom || '—') + '</td>' +
                '<td>' + esc(m.category || '—') + '</td>' +
                '<td>' + esc(m.unit || '—') + '</td>' +
                '<td>' + (m.unit_price != null ? parseFloat(m.unit_price).toLocaleString('en-MY', { maximumFractionDigits: 2 }) : '—') + '</td>' +
                '<td>' + (m.install_date ? formatDateDMY(m.install_date) : '—') + '</td>' +
                '<td onclick="event.stopPropagation()">' + (canEdit()
                ? '<div style="display:flex;gap:4px">' +
                    '<button class="btn btn-ghost btn-sm" onclick="ptShowEditMaterial(' + m.id + ')">Edit</button>' +
                    '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeleteMaterial(' + m.id + ')">&#10005;</button>' +
                '</div>'
                : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        ptPagination(filtered.length, matCurrentPage, matPageSize, 'goMatPage', 'changeMatPageSize');
}

function ptResetMatFilter() {
    document.getElementById('pt-mat-search').value = '';
    document.getElementById('pt-mat-inst-from').value = '';
    document.getElementById('pt-mat-inst-to').value = '';
    matBrandSelected = [];
    matCatSelected = [];
    msClear('pt-mat-brand');
    msClear('pt-mat-cat');
    matCurrentPage = 1;
    ptFilterMaterials();
}

function goMatPage(page) {
    matCurrentPage = page;
    ptFilterMaterials();
}
function changeMatPageSize(size) {
    matPageSize = parseInt(size);
    matCurrentPage = 1;
    ptFilterMaterials();
}

function ptExportMaterialsExcel() {
    var rows = ptGetFilteredMaterials().map(function(m, i) {
        return {
            No: i + 1,
            'Part No': m.part_no || '',
            Description: m.description || '',
            Brand: m.brand || '',
            'Serial No': m.serial_no || '',
            'Vendor PO': m.vendor_po_no || '',
            Vendor: m.vendor || '',
            'Panel ID': m.panel_no || '',
            YOM: m.yom || '',
            Category: m.category || '',
            Unit: m.unit || '',
            Price: m.unit_price != null ? Number(m.unit_price) : 0,
            'Install Date': formatDateDMY(m.install_date)
        };
    });
    ptExportRowsToExcel(rows, 'Materials', 'materials');
}

function ptOpenAddMaterial() {
    var sel = document.getElementById('pt-am-panelno');
    sel.innerHTML = '<option value="">— Select Panel ID —</option>' +
        (ptDB.panelIds || []).map(function(p) {
            return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>';
        }).join('');
    ['pt-am-partno', 'pt-am-brand', 'pt-am-serial', 'pt-am-desc', 'pt-am-yom', 'pt-am-vendor', 'pt-am-vpo', 'pt-am-price', 'pt-am-cat', 'pt-am-unit'].forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('pt-am-instdate').value = '';
    document.getElementById('pt-am-error').textContent = '';
    ptOpenModal('modal-pt-add-material');
}

function ptShowEditMaterial(id) {
    var m = ptDB.materials.find(function(x) { return x.id === id; });
    if (!m) return;
    document.getElementById('pt-em-panelno').innerHTML = '<option value="">— Select Panel ID —</option>' +
        (ptDB.panelIds || []).map(function(p) {
            var selected = (p.name === m.panel_no) ? ' selected' : '';
            return '<option value="' + esc(p.name) + '"' + selected + '>' + esc(p.name) + '</option>';
        }).join('');
    document.getElementById('pt-em-id').value = m.id;
    document.getElementById('pt-em-partno').value = m.part_no;
    document.getElementById('pt-em-brand').value = m.brand;
    document.getElementById('pt-em-desc').value = m.description || '';
    document.getElementById('pt-em-serial').value = m.serial_no || '';
    document.getElementById('pt-em-yom').value = m.yom || '';
    document.getElementById('pt-em-vendor').value = m.vendor || '';
    document.getElementById('pt-em-vpo').value = m.vendor_po_no || '';
    document.getElementById('pt-em-instdate').value = m.install_date ? m.install_date.slice(0, 10) : '';
    document.getElementById('pt-em-cat').value = m.category || '';
    document.getElementById('pt-em-unit').value = m.unit || '';
    document.getElementById('pt-em-price').value = m.unit_price || '';
    document.getElementById('pt-em-error').textContent = '';
    ptOpenModal('modal-pt-edit-material');
}

async function ptDoAddMaterial() {
    var partNo = document.getElementById('pt-am-partno').value.trim();
    var errEl = document.getElementById('pt-am-error');
    errEl.textContent = '';
    if (!partNo) { errEl.textContent = 'Enter a part number'; return; }
    try {
        await api('/m-materials', { method: 'POST', body: {
            part_no: partNo, brand: document.getElementById('pt-am-brand').value.trim(),
            serial_no: document.getElementById('pt-am-serial').value.trim(),
            description: document.getElementById('pt-am-desc').value.trim(),
            yom: document.getElementById('pt-am-yom').value.trim(),
            vendor: document.getElementById('pt-am-vendor').value.trim(),
            vendor_po_no: document.getElementById('pt-am-vpo').value.trim(),
            panel_no: document.getElementById('pt-am-panelno').value,
            install_date: document.getElementById('pt-am-instdate').value || null,
            category: document.getElementById('pt-am-cat').value.trim(),
            unit: document.getElementById('pt-am-unit').value.trim(),
            unit_price: parseFloat(document.getElementById('pt-am-price').value) || 0
        }});
        ptCloseModal('modal-pt-add-material');
        await ptLoadDB();
        ptRenderMaterial();
    } catch (e) { errEl.textContent = e.message; }
}

async function ptDoEditMaterial() {
    var id = document.getElementById('pt-em-id').value;
    var partNo = document.getElementById('pt-em-partno').value.trim();
    var errEl = document.getElementById('pt-em-error');
    errEl.textContent = '';
    if (!partNo) { errEl.textContent = 'Enter a part number'; return; }
    try {
        await api('/m-materials/' + id, { method: 'PUT', body: {
            part_no: partNo, brand: document.getElementById('pt-em-brand').value.trim(),
            serial_no: document.getElementById('pt-em-serial').value.trim(),
            description: document.getElementById('pt-em-desc').value.trim(),
            yom: document.getElementById('pt-em-yom').value.trim(),
            vendor: document.getElementById('pt-em-vendor').value.trim(),
            vendor_po_no: document.getElementById('pt-em-vpo').value.trim(),
            panel_no: document.getElementById('pt-em-panelno').value,
            install_date: document.getElementById('pt-em-instdate').value || null,
            category: document.getElementById('pt-em-cat').value.trim(),
            unit: document.getElementById('pt-em-unit').value.trim(),
            unit_price: parseFloat(document.getElementById('pt-em-price').value) || 0
        }});
        ptCloseModal('modal-pt-edit-material');
        await ptLoadDB();
        ptRenderMaterial();
    } catch (e) { errEl.textContent = e.message; }
}

function ptDeleteMaterial(id) {
    var m = ptDB.materials.find(function(x) { return x.id === id; });
    if (!m) return;
    showModal('<h3>Delete Material</h3><p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">' + esc(m.part_no) + '</strong>?</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeleteMaterial(' + id + ')">Delete</button></div>');
}

async function ptDoDeleteMaterial(id) {
    hideModal();
    try {
        await api('/m-materials/' + id, { method: 'DELETE' });
        await ptLoadDB();
        ptRenderMaterial();
    } catch (e) { alert(e.message); }
}


// ---------- IMPORT ----------
var ptImportPanelFile = null;
var ptImportMaterialFile = null;

function ptRenderImport() {
    var el = document.getElementById('pt-import-content');
    if (!canEdit()) {
        el.innerHTML = '<div class="empty-msg" style="padding:40px">Import is available for admin only.</div>';
        return;
    }
    el.innerHTML =
        '<div class="import-section">' +
            '<h3>Import Panels</h3>' +
            '<div class="section-desc">Upload an Excel file (.xlsx, .xls, .csv)</div>' +
            '<div style="margin-bottom:14px"><a class="btn btn-accent btn-sm" href="/api/m-template/panels" style="text-decoration:none">&#8681; Download Panel Template</a></div>' +
            '<div class="drop-zone" id="pt-panel-drop-zone"><div class="drop-icon">&#128196;</div><div class="drop-text">Drag & drop Panel Excel here</div><div class="drop-hint">or click to browse</div><input type="file" class="file-input" id="pt-panel-file-input" accept=".xlsx,.xls,.csv" onchange="ptHandlePanelFile(this)"></div>' +
            '<div id="pt-panel-file-info"></div><div id="pt-panel-preview"></div><div id="pt-panel-import-result"></div>' +
            '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end" id="pt-panel-import-actions"></div>' +
        '</div>' +
        '<div class="import-section">' +
            '<h3>Import Materials</h3>' +
            '<div class="section-desc">Upload an Excel file (.xlsx, .xls, .csv)</div>' +
            '<div style="margin-bottom:14px"><a class="btn btn-accent btn-sm" href="/api/m-template/materials" style="text-decoration:none">&#8681; Download Material Template</a></div>' +
            '<div class="drop-zone" id="pt-material-drop-zone"><div class="drop-icon">&#128196;</div><div class="drop-text">Drag & drop Material Excel here</div><div class="drop-hint">or click to browse</div><input type="file" class="file-input" id="pt-material-file-input" accept=".xlsx,.xls,.csv" onchange="ptHandleMaterialFile(this)"></div>' +
            '<div id="pt-material-file-info"></div><div id="pt-material-preview"></div><div id="pt-material-import-result"></div>' +
            '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end" id="pt-material-import-actions"></div>' +
        '</div>';
    ptSetupDropZone('pt-panel-drop-zone','pt-panel-file-input');
    ptSetupDropZone('pt-material-drop-zone','pt-material-file-input');
}

function ptSetupDropZone(zoneId, inputId) {
    var zone = document.getElementById(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        var input = document.getElementById(inputId);
        input.files = e.dataTransfer.files;
        if (inputId === 'pt-panel-file-input') ptHandlePanelFile(input);
        else ptHandleMaterialFile(input);
    });
}

function ptHandlePanelFile(input) {
    var file = input.files[0]; if (!file) return;
    ptImportPanelFile = file;
    ptShowFileInfo('pt-panel-file-info', file);
    ptPreviewFile(file, 'pt-panel-preview', 'pt-panel-import-actions', 'ptDoPanelImport()');
    document.getElementById('pt-panel-import-result').innerHTML = '';
}

function ptHandleMaterialFile(input) {
    var file = input.files[0]; if (!file) return;
    ptImportMaterialFile = file;
    ptShowFileInfo('pt-material-file-info', file);
    ptPreviewFile(file, 'pt-material-preview', 'pt-material-import-actions', 'ptDoMaterialImport()');
    document.getElementById('pt-material-import-result').innerHTML = '';
}

function ptShowFileInfo(containerId, file) {
    var size = file.size < 1024 ? file.size + ' B' : file.size < 1048576 ? (file.size/1024).toFixed(1) + ' KB' : (file.size/1048576).toFixed(1) + ' MB';
    document.getElementById(containerId).innerHTML = '<div class="file-ready"><div class="file-icon">&#128196;</div><div class="file-info"><div class="file-name">'+esc(file.name)+'</div><div class="file-size">'+size+'</div></div><button class="btn btn-ghost btn-sm" onclick="ptRemoveFile(\''+containerId+'\')">&#10005;</button></div>';
}

function ptRemoveFile(containerId) {
    var prefix = containerId.replace('-file-info','');
    ptImportPanelFile = null; ptImportMaterialFile = null;
    document.getElementById(prefix+'-file-input').value = '';
    document.getElementById(prefix+'-preview').innerHTML = '';
    document.getElementById(prefix+'-import-result').innerHTML = '';
    document.getElementById(prefix+'-import-actions').innerHTML = '';
    document.getElementById(containerId).innerHTML = '';
}

function ptPreviewFile(file, previewId, actionsId, onImport) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(e.target.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (data.length === 0) { document.getElementById(previewId).innerHTML = '<div class="empty-msg" style="margin-top:12px">File is empty</div>'; return; }
            var headers = Object.keys(data[0]);
            var previewRows = data.slice(0,10);
            document.getElementById(previewId).innerHTML =
                '<div style="margin-top:14px;font-size:.85rem;color:var(--main-text3)">Preview (' + data.length + ' rows)</div>' +
                '<div class="import-preview"><table><thead><tr>' + headers.map(h => '<th>'+esc(h)+'</th>').join('') + '</tr></thead><tbody>' +
                previewRows.map(row => '<tr>' + headers.map(h => '<td>'+esc(String(row[h]))+'</td>').join('') + '</tr>').join('') +
                (data.length > 10 ? '<tr><td colspan="'+headers.length+'" style="text-align:center;color:var(--main-text3)">... '+(data.length-10)+' more</td></tr>' : '') +
                '</tbody></table></div>';
            document.getElementById(actionsId).innerHTML = '<button class="btn btn-ghost btn-sm" onclick="ptRemoveFile(\''+actionsId.replace('-import-actions','-file-info')+'\')">Clear</button><button class="btn btn-accent" onclick="'+onImport+'">Import '+data.length+' Rows</button>';
        } catch(err) { document.getElementById(previewId).innerHTML = '<div class="error-msg" style="margin-top:12px">'+esc(err.message)+'</div>'; }
    };
    reader.readAsArrayBuffer(file);
}

async function ptDoPanelImport() {
    if (!ptImportPanelFile) return;
    var resultEl = document.getElementById('pt-panel-import-result');
    resultEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--main-text3)">Importing...</div>';
    try {
        var base64 = await ptFileToBase64(ptImportPanelFile);
        var resp = await api('/m-import/panels', { method: 'POST', body: { filename: ptImportPanelFile.name, data: base64 } });
        ptShowImportResult('pt-panel-import-result', resp);
        ptImportPanelFile = null;
        document.getElementById('pt-panel-file-input').value = '';
        document.getElementById('pt-panel-file-info').innerHTML = '';
        document.getElementById('pt-panel-preview').innerHTML = '';
        document.getElementById('pt-panel-import-actions').innerHTML = '';
        await ptLoadDB();
    } catch (e) { resultEl.innerHTML = '<div class="error-msg" style="margin-top:12px">' + esc(e.message) + '</div>'; }
}

async function ptDoMaterialImport() {
    if (!ptImportMaterialFile) return;
    var resultEl = document.getElementById('pt-material-import-result');
    resultEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--main-text3)">Importing...</div>';
    try {
        var base64 = await ptFileToBase64(ptImportMaterialFile);
        var resp = await api('/m-import/materials', { method: 'POST', body: { filename: ptImportMaterialFile.name, data: base64 } });
        ptShowImportResult('pt-material-import-result', resp);
        ptImportMaterialFile = null;
        document.getElementById('pt-material-file-input').value = '';
        document.getElementById('pt-material-file-info').innerHTML = '';
        document.getElementById('pt-material-preview').innerHTML = '';
        document.getElementById('pt-material-import-actions').innerHTML = '';
        await ptLoadDB();
    } catch (e) { resultEl.innerHTML = '<div class="error-msg" style="margin-top:12px">' + esc(e.message) + '</div>'; }
}

function ptFileToBase64(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function ptShowImportResult(containerId, data) {
    document.getElementById(containerId).innerHTML =
        '<div class="import-result">' +
            '<div class="result-row"><span class="label">Total Rows</span><span class="value">' + data.total + '</span></div>' +
            '<div class="result-row"><span class="label">Inserted</span><span class="value" style="color:var(--green)">' + data.inserted + '</span></div>' +
            '<div class="result-row"><span class="label">Skipped</span><span class="value" style="color:var(--yellow)">' + data.skipped + '</span></div>' +
            (data.errors && data.errors.length > 0 ? '<div class="errors-list">' + data.errors.map(function(e) { return '<div>&#8226; ' + esc(e) + '</div>'; }).join('') + '</div>' : '') +
        '</div>';
}


// ---------- USERS ----------
var usersCurrentPage = 1;
var usersPageSize = 10;

async function ptLoadAllUsers() {
    try {
        ptDB.allUsers = await api('/users');
    } catch (e) {
        console.error('Load all users error:', e);
        ptDB.allUsers = [];
    }
}

function ptRenderUsers() {
    var addBtn = canEdit() ? '<button class="btn btn-green btn-sm" onclick="ptShowAddUser()">+ Add User</button>' : '';
    var el = document.getElementById('pt-users-content');
    el.innerHTML =
        '<div class="filter">' +
            '<input class="input" type="text" placeholder="Search..." id="pt-users-search" oninput="ptFilterUsers()" style="max-width:280px">' +
            '<button class="btn btn-ghost btn-sm" onclick="ptResetUsersFilter()">Reset</button>' +
            '<span id="pt-users-count" style="font-size:.82rem;color:var(--main-text3)"></span>' +
        '</div>' +
        '<div class="section-head">' +
            '<h3>All Users</h3>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
                addBtn +
            '</div>' +
        '</div>' +
        '<div id="pt-users-table-area"></div>';
    ptFilterUsers();
}

function ptFilterUsers() {
    var search = (document.getElementById('pt-users-search').value || '').toLowerCase();
    var filtered = (ptDB.allUsers || []).filter(function(u) {
        if (!search) return true;
        var member = u.memberId ? DB.members.find(function(m) { return m.id === u.memberId; }) : null;
        var posName = member ? getPositionName(member.positionId) : '';
        var deptName = member ? getDeptName(member.departmentId) : '';
        var sal = member ? latestSalary(member) : 0;
        var haystack = [
            u.username, u.role, u.memberName,
            posName, deptName, sal
        ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');
        return haystack.indexOf(search) !== -1;
    });

    var totalPages = Math.ceil(filtered.length / usersPageSize) || 1;
    if (usersCurrentPage > totalPages) usersCurrentPage = totalPages;
    if (usersCurrentPage < 1) usersCurrentPage = 1;
    var startIdx = (usersCurrentPage - 1) * usersPageSize;
    var pageData = filtered.slice(startIdx, startIdx + usersPageSize);

    var area = document.getElementById('pt-users-table-area');
    if (filtered.length === 0) { area.innerHTML = '<div class="empty-msg">No users found</div>'; return; }
    area.innerHTML =
        '<div class="table-wrap"><table><thead><tr><th style="width:50px">No</th><th>Username</th><th>Name</th><th>Position</th><th>Department</th><th>Salary</th><th>Role</th><th style="width:100px">Actions</th></tr></thead><tbody>' +
        pageData.map(function(u, i) {
            var member = u.memberId ? DB.members.find(function(m) { return m.id === u.memberId; }) : null;
            var posName = member ? getPositionName(member.positionId) : '—';
            var deptName = member ? getDeptName(member.departmentId) : '—';
            var sal = member ? latestSalary(member) : null;
            var roleBadge = u.role === 'admin' ? '<span class="badge badge-admin">Admin</span>'
                : u.role === 'viewer' ? '<span class="badge badge-viewer">Viewer</span>'
                : '<span class="badge badge-employee">Employee</span>';
            return '<tr>' +
                '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (startIdx + i + 1) + '</td>' +
                '<td><strong>' + esc(u.username) + '</strong></td>' +
                '<td>' + esc(u.memberName || '—') + '</td>' +
                '<td>' + esc(posName) + '</td>' +
                '<td>' + esc(deptName) + '</td>' +
                '<td>' + (sal != null && sal > 0 ? '<span class="salary-val">' + fmt(sal) + '</span>' : '<span class="salary-na">Not set</span>') + '</td>' +
                '<td>' + roleBadge + '</td>' +
                '<td>' + (canEdit()
                    ? '<div style="display:flex;gap:4px">' +
                        '<button class="btn btn-ghost btn-sm" onclick="ptShowEditUser(' + u.id + ')">Edit</button>' +
                        (u.username !== 'adminMTA' ? '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeleteUser(' + u.id + ')">&#10005;</button>' : '') +
                      '</div>'
                    : '<span style="color:var(--main-text3);font-size:.82rem">View only</span>') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        ptPagination(filtered.length, usersCurrentPage, usersPageSize, 'goUsersPage', 'changeUsersPageSize');
}

function ptResetUsersFilter() {
    document.getElementById('pt-users-search').value = '';
    usersCurrentPage = 1;
    ptFilterUsers();
}
function goUsersPage(page) { usersCurrentPage = page; ptFilterUsers(); }
function changeUsersPageSize(size) { usersPageSize = parseInt(size); usersCurrentPage = 1; ptFilterUsers(); }

// ---- Add User ----
function ptShowAddUser() {
    var posOpts = DB.positions.map(function(p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var deptOpts = DB.departments.map(function(d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');

    var viewerScopesHtml = '<div id="pt-viewer-scope-fields" style="display:none">' +
        '<div class="field"><label>Work Category Access</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">';
    DB.scopes.forEach(function(s) {
        viewerScopesHtml += '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">' +
            '<input type="checkbox" class="pt-add-viewer-scope-cb" value="' + s.id + '"> ' + esc(s.name) +
        '</label>';
    });
    viewerScopesHtml += '</div></div></div>';

    showModal('<h3>Add User</h3>' +
        '<div class="field"><label>Role</label><select class="input" id="pt-adduser-role" onchange="ptToggleAddUserFields()"><option value="employee">Employee</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></div>' +
        '<div id="pt-emp-fields">' +
            '<div class="field"><label>Full Name</label><input class="input" id="pt-adduser-name" placeholder="e.g. John Smith"></div>' +
            '<div class="field"><label>Position</label><select class="input" id="pt-adduser-pos"><option value="">None</option>' + posOpts + '</select></div>' +
            '<div class="field"><label>Department</label><select class="input" id="pt-adduser-dept"><option value="">None</option>' + deptOpts + '</select></div>' +
            '<div class="field"><label>Monthly Salary</label><input class="input input-mono" id="pt-adduser-salary" type="number" placeholder="e.g. 15000.00"></div>' +
        '</div>' +
        viewerScopesHtml +
        '<div class="field"><label>Username</label><input class="input" id="pt-adduser-user" placeholder="Login username"></div>' +
        '<div class="field"><label>Password</label><input class="input" id="pt-adduser-pass" type="password" placeholder="Min. 6 characters"></div>' +
        '<p class="auth-error" id="pt-adduser-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="ptDoAddUser()">Create</button></div>');
    setTimeout(function() { var el = document.getElementById('pt-adduser-name'); if (el) el.focus(); }, 100);
}

function ptToggleAddUserFields() {
    var role = document.getElementById('pt-adduser-role').value;
    document.getElementById('pt-emp-fields').style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    document.getElementById('pt-viewer-scope-fields').style.display = role === 'viewer' ? '' : 'none';
}

async function ptDoAddUser() {
    var errEl = document.getElementById('pt-adduser-error');
    var role = document.getElementById('pt-adduser-role').value;
    var name = document.getElementById('pt-adduser-name').value.trim();
    var username = document.getElementById('pt-adduser-user').value.trim();
    var password = document.getElementById('pt-adduser-pass').value;
    var posId = document.getElementById('pt-adduser-pos').value;
    var deptId = document.getElementById('pt-adduser-dept').value;
    var salary = document.getElementById('pt-adduser-salary').value;

    if (!username) { errEl.textContent = 'Username is required'; return; }
    if (!password || password.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }

    if (role === 'admin') {
        try {
            await api('/users', { method: 'POST', body: { username: username, password: password, role: 'admin' }});
            hideModal(); await ptLoadAllUsers(); ptRenderUsers();
        } catch (e) { errEl.textContent = e.message; }
    } else {
        if (!name) { errEl.textContent = 'Full name is required'; return; }
        try {
            var memberResult = await api('/members', {
                method: 'POST',
                body: { name: name, positionId: posId ? parseInt(posId) : null, departmentId: deptId ? parseInt(deptId) : null }
            });
            var memberId = memberResult.id;
            var result = await api('/users', {
                method: 'POST',
                body: { username: username, password: password, role: role, memberId: memberId }
            });
            if (salary && parseFloat(salary) > 0) {
                var now = new Date().toISOString().slice(0, 7);
                await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: parseFloat(salary) } });
            }
            // 保存 viewer scope
            if (role === 'viewer' && result && result.id) {
                var cbs = document.querySelectorAll('.pt-add-viewer-scope-cb:checked');
                var scopeIds = [];
                cbs.forEach(function(cb) { scopeIds.push(parseInt(cb.value)); });
                if (scopeIds.length > 0) {
                    await api('/viewer-scopes/' + result.id, { method: 'PUT', body: { scopeIds: scopeIds } });
                }
            }
            hideModal(); await ptLoadAllUsers(); await loadDB(); ptRenderUsers();
        } catch (e) { errEl.textContent = e.message; }
    }
}

// ---- Edit User ----
function ptShowEditUser(userId) {
    var user = (ptDB.allUsers || []).find(function(u) { return u.id === userId; });
    if (!user) return;
    var member = user.memberId ? DB.members.find(function(m) { return m.id === user.memberId; }) : null;
    var posOpts = DB.positions.map(function(p) { var sel = member && member.positionId === p.id ? 'selected' : ''; return '<option value="' + p.id + '" ' + sel + '>' + esc(p.name) + '</option>'; }).join('');
    var deptOpts = DB.departments.map(function(d) { var sel = member && member.departmentId === d.id ? 'selected' : ''; return '<option value="' + d.id + '" ' + sel + '>' + esc(d.name) + '</option>'; }).join('');

    var html = '<h3>Edit — ' + esc(user.username) + '</h3>';

    // Member fields
    html += '<div id="pt-edit-member-fields"' + (user.role === 'admin' ? ' style="display:none"' : '') + '>';
    var curSal = member ? latestSalary(member) : 0;
    html += '<div class="field"><label>Full Name</label><input class="input" id="pt-edituser-name" value="' + (member ? esc(member.name) : '') + '"></div>' +
        '<div class="field"><label>Position</label><select class="input" id="pt-edituser-pos"><option value="">None</option>' + posOpts + '</select></div>' +
        '<div class="field"><label>Department</label><select class="input" id="pt-edituser-dept"><option value="">None</option>' + deptOpts + '</select></div>' +
        '<div class="field"><label>Monthly Salary</label><input class="input input-mono" id="pt-edituser-salary" type="number" value="' + (curSal > 0 ? curSal : '') + '" placeholder="e.g. 15000.00"></div>';
    html += '</div>';

    // Viewer scope
    var existing = (DB.viewerScopes || {})[user.id] || [];
    html += '<div id="pt-edit-viewer-scope-fields"' + (user.role !== 'viewer' ? ' style="display:none"' : '') + '>' +
        '<div class="field"><label>Work Category Access</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">';
    DB.scopes.forEach(function(s) {
        var checked = existing.indexOf(s.id) !== -1 ? ' checked' : '';
        html += '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">' +
            '<input type="checkbox" class="pt-viewer-scope-cb" value="' + s.id + '"' + checked + '> ' + esc(s.name) +
        '</label>';
    });
    html += '</div></div></div>';

    html += '<div class="field"><label>Username</label><input class="input" id="pt-edituser-user" value="' + esc(user.username) + '"></div>' +
        '<div class="field"><label>New Password (blank = keep)</label><input class="input" id="pt-edituser-pass" type="password" placeholder="Leave blank"></div>' +
        '<div class="field"><label>Role</label><select class="input" id="pt-edituser-role" onchange="ptToggleEditUserFields()">' +
            '<option value="admin" ' + (user.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
            '<option value="viewer" ' + (user.role === 'viewer' ? 'selected' : '') + '>Viewer</option>' +
            '<option value="employee" ' + (user.role === 'employee' ? 'selected' : '') + '>Employee</option>' +
        '</select></div>' +
        '<p class="auth-error" id="pt-edituser-error"></p>' +
        '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="ptDoEditUser(' + user.id + ')">Save</button></div>';

    showModal(html);
}

function ptToggleEditUserFields() {
    var role = document.getElementById('pt-edituser-role').value;
    var memberFields = document.getElementById('pt-edit-member-fields');
    var viewerFields = document.getElementById('pt-edit-viewer-scope-fields');
    if (memberFields) memberFields.style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    if (viewerFields) viewerFields.style.display = role === 'viewer' ? '' : 'none';
}

async function ptDoEditUser(userId) {
    var user = (ptDB.allUsers || []).find(function(u) { return u.id === userId; });
    if (!user) return;
    var errEl = document.getElementById('pt-edituser-error');
    var newUsername = document.getElementById('pt-edituser-user').value.trim();
    var newPass = document.getElementById('pt-edituser-pass').value;
    var newRole = document.getElementById('pt-edituser-role').value;
    if (!newUsername) { errEl.textContent = 'Username cannot be empty'; return; }
    if (newPass && newPass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    // 如果从 admin 改成 employee/viewer，需要创建 member
    var memberId = user.memberId;
    if (!memberId && (newRole === 'employee' || newRole === 'viewer')) {
        var nameEl = document.getElementById('pt-edituser-name');
        var posEl = document.getElementById('pt-edituser-pos');
        var deptEl = document.getElementById('pt-edituser-dept');
        var salEl = document.getElementById('pt-edituser-salary');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { errEl.textContent = 'Enter a name'; return; }
        var posId = posEl ? posEl.value : '';
        var deptId = deptEl ? deptEl.value : '';
        var sal = salEl ? parseFloat(salEl.value) : 0;
        var now = new Date().toISOString().slice(0, 7);

        var memberResult = await api('/members', {
            method: 'POST',
            body: {
                name: name,
                positionId: posId ? parseInt(posId) : null,
                departmentId: deptId ? parseInt(deptId) : null
            }
        });
        memberId = memberResult.id;

        if (!isNaN(sal) && sal > 0) {
            await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: sal } });
        }
    }

    // 更新 user
    await api('/users/' + userId, {
        method: 'PUT',
        body: { username: newUsername, password: newPass || null, role: newRole, memberId: memberId }
    });

    // 更新 member
    if (memberId && (newRole === 'employee' || newRole === 'viewer')) {
        var nameEl = document.getElementById('pt-edituser-name');
        var posEl = document.getElementById('pt-edituser-pos');
        var deptEl = document.getElementById('pt-edituser-dept');
        var salEl = document.getElementById('pt-edituser-salary');
        var name = nameEl ? nameEl.value.trim() : null;
        var posId = posEl ? (posEl.value ? parseInt(posEl.value) : null) : undefined;
        var deptId = deptEl ? (deptEl.value ? parseInt(deptEl.value) : null) : undefined;

        if (name || posId !== undefined || deptId !== undefined) {
            var member = DB.members.find(function(m) { return m.id === memberId; });
            await api('/members/' + memberId, {
                method: 'PUT',
                body: {
                    name: name || (member ? member.name : ''),
                    positionId: posId !== undefined ? posId : (member ? member.positionId : null),
                    departmentId: deptId !== undefined ? deptId : (member ? member.departmentId : null)
                }
            });
        }

        if (salEl) {
            var rawVal = salEl.value.trim();
            var val = parseFloat(rawVal);
            var now = new Date().toISOString().slice(0, 7);
            await api('/salaries', { method: 'PUT', body: { memberId: memberId, month: now, amount: (!isNaN(val) && val > 0) ? val : 0 } });
        }
    }

    // 保存 viewer scope
    if (newRole === 'viewer') {
        var cbs = document.querySelectorAll('.pt-viewer-scope-cb:checked');
        var scopeIds = [];
        cbs.forEach(function(cb) { scopeIds.push(parseInt(cb.value)); });
        await api('/viewer-scopes/' + userId, { method: 'PUT', body: { scopeIds: scopeIds } });
    }

    hideModal(); await ptLoadAllUsers(); await loadDB(); ptRenderUsers();
}

function ptDeleteUser(id) {
    var u = (ptDB.allUsers || []).find(function(x) { return x.id === id; });
    if (!u) return;
    showModal('<h3>Delete User</h3><p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">' + esc(u.username) + '</strong>?</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeleteUser(' + id + ')">Delete</button></div>');
}

async function ptDoDeleteUser(id) {
    hideModal();
    try {
        await api('/users/' + id, { method: 'DELETE' });
        await ptLoadAllUsers();
        await loadDB();
        ptRenderUsers();
    } catch (e) { alert(e.message); }
}

/* ==========================================================
   Role and Permission
   ========================================================== */
// async function api(path, opts) {
//     opts = opts || {};
//     var url = '/api' + path;
//     var options = {
//         method: opts.method || 'GET',
//         headers: {
//             'Content-Type': 'application/json',
//             'X-User-Role': currentUser ? currentUser.role : '',
//             'X-Member-Id': currentUser && currentUser.memberId ? String(currentUser.memberId) : ''
//         }
//     };
//     if (opts.body) options.body = JSON.stringify(opts.body);
//     var res = await fetch(url, options);
//     var data = await res.json();
//     if (!res.ok) throw new Error(data.error || 'Request failed');
//     return data;
// }

/* ==========================================================
   Pre-load data on page load
   ========================================================== */

// Pre-load data on page load
// ===== INITIALIZATION =====
(async function(){
    var saved = localStorage.getItem('multitrade_session');

    function activateNav(navId, page) {
        document.querySelectorAll('#' + navId + ' .nav-item').forEach(function(n) {
            n.classList.toggle('active', n.dataset.page === page);
        });
    }

    if (!saved) {
        document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('login-page').classList.add('active');
        return;
    }

    try {
        currentUser = JSON.parse(saved);
    } catch(e) {
        localStorage.removeItem('multitrade_session');
        document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('login-page').classList.add('active');
        return;
    }

    var savedModule = localStorage.getItem('multitrade_module') || 'attendance';
    selectedModule = savedModule;

    document.querySelectorAll('.auth-page,.app-layout').forEach(function(p) { p.classList.remove('active'); });

    if (savedModule === 'panel') {
        try {
            await ptLoadDB();
            document.getElementById('panel-layout').classList.add('active');
            document.getElementById('pt-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('pt-user-name').textContent = currentUser.username;

            var isViewer = currentUser.role === 'viewer';
            document.querySelectorAll('#pt-nav .nav-item').forEach(function(item) {
                var page = item.getAttribute('data-page');
                if (page === 'pt-import' || page === 'pt-users') {
                    item.style.display = isViewer ? 'none' : '';
                }
            });
            document.querySelectorAll('#pt-nav .nav-section').forEach(function(s) {
                var t = s.textContent.trim();
                if (t === 'Tools' || t === 'Settings') {
                    s.style.display = isViewer ? 'none' : '';
                }
            });
            var roleLabel = document.querySelector('#panel-layout .sidebar-user .user-role');
            if (roleLabel) roleLabel.textContent = isViewer ? 'Viewer' : 'Admin';

            var page = localStorage.getItem('multitrade_pt_page') || 'pt-dashboard';
            if (isViewer && (page === 'pt-import' || page === 'pt-users')) page = 'pt-dashboard';
            activateNav('pt-nav', page);
            ptNav(page);
        } catch(e) {
            console.error('Panel load error:', e);
            document.getElementById('panel-layout').classList.add('active');
            document.getElementById('pt-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('pt-user-name').textContent = currentUser.username;
            ptNav('pt-dashboard');
        }
    } else {
        try {
            await loadDB();
            if (currentUser.role === 'admin' || currentUser.role === 'viewer') {
                document.getElementById('admin-layout').classList.add('active');

                var isViewer = currentUser.role === 'viewer';
                document.querySelectorAll('#admin-nav .nav-item').forEach(function(item) {
                    var page = item.getAttribute('data-page');
                    if (page === 'users' || page === 'departments' || page === 'positions') {
                        item.style.display = isViewer ? 'none' : '';
                    }
                });
                document.querySelectorAll('#admin-nav .nav-section').forEach(function(s) {
                    if (s.textContent.trim() === 'HR') {
                        s.style.display = isViewer ? 'none' : '';
                    }
                });
                var roleLabel = document.querySelector('#admin-layout .sidebar-user .user-role');
                if (roleLabel) roleLabel.textContent = isViewer ? 'Viewer' : 'Administrator';

                var page = localStorage.getItem('multitrade_admin_page') || 'projects';
                if (isViewer && (page === 'users' || page === 'departments' || page === 'positions')) page = 'projects';
                activateNav('admin-nav', page);
                await adminNav(page);
            } else {
                document.getElementById('employee-layout').classList.add('active');
                var page = localStorage.getItem('multitrade_emp_page') || 'myprojects';
                activateNav('emp-nav', page);
                await empNav(page);
            }
            updateAvatars();
        } catch(e) {
            console.error('Attendance load error:', e);
            document.getElementById('login-page').classList.add('active');
        }
    }
})();

// ← file end, empty from here
