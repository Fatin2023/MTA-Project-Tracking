/* ==========================================================
   MULTITRADE — Project Salary Management (PostgreSQL version)
   ========================================================== */

//const API = 'http://localhost:3000/api';
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
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
    projectAssignments: [],
    attendance: []
};

async function loadDB() {
    try {
        const [projects, members, users, positions, departments, assignments, attendance] = await Promise.all([
            api('/projects'),
            api('/members'),
            api('/users'),
            api('/positions'),
            api('/departments'),
            api('/assignments'),
            api('/attendance')
        ]);
        DB.projects = projects;
        DB.members = members;
        DB.users = users;
        DB.positions = positions;
        DB.departments = departments;
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
    showModal(`
        <h3>Sign Out</h3>
        <p style="color:var(--main-text2);line-height:1.6">Are you sure you want to sign out?</p>
        <div class="btns">
            <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
            <button class="btn btn-danger" onclick="doLogout()">Sign Out</button>
        </div>
    `);
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
    const nav = document.getElementById('admin-nav');
    if (nav) nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('#admin-layout .admin-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('admin-' + tab);
    if (target) target.style.display = '';
    if (el) el.classList.add('active');
    else { const items = nav ? nav.querySelectorAll('.nav-item') : []; items.forEach(i => { if (i.textContent.trim().toLowerCase().includes(tab)) i.classList.add('active'); }); }
    await loadDB();
    switch (tab) {
        case 'projects': renderDashboard(); break;
        case 'users': renderUsersList(); break;
        case 'positions': renderPositionsList(); break;
        case 'departments': renderDepartmentsList(); break;
        case 'attendance': renderAdminAttendance(); break;
    }
}

async function empNav(tab, el) {
    const nav = document.getElementById('emp-nav');
    if (nav) nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('#employee-layout .emp-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('emp-' + tab);
    if (target) target.style.display = '';
    if (el) el.classList.add('active');
    else { const items = nav ? nav.querySelectorAll('.nav-item') : []; items.forEach(i => { if (i.textContent.trim().toLowerCase().includes(tab)) i.classList.add('active'); }); }
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
    const sidebar = document.querySelector('.app-layout.active .sidebar');
    const overlay = document.querySelector('.app-layout.active .mobile-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function closeMobileMenu() {
    document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.mobile-overlay').forEach(o => o.classList.remove('active'));
}

// Close mobile menu when nav item clicked
document.addEventListener('click', e => {
    if (e.target.closest('.nav-item')) closeMobileMenu();
});



/* ==========================================================
   SECTION 6: ADMIN — PROJECTS DASHBOARD
   ========================================================== */

function renderDashboard() {
    const totalProjects = DB.projects.length;
    const totalMembers = DB.members.length;
    const totalCost = DB.projects.reduce((s, p) => s + getProjectCost(p.id), 0);

    const view = document.getElementById('admin-projects');
    view.innerHTML = `
    <div class="app-header"><h2>Projects</h2><div class="header-sub">Manage projects and team members</div></div>
    <div class="app-body">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Projects</div><div class="stat-value">${totalProjects}</div></div>
        <div class="stat-card"><div class="stat-label">Total Members</div><div class="stat-value">${totalMembers}</div></div>
        <div class="stat-card"><div class="stat-label">Monthly Cost</div><div class="stat-value">${fmt(totalCost)}</div></div>
      </div>
      <div class="section-head"><h2>All Projects</h2><button class="btn btn-accent" onclick="showAddProject()">+ New Project</button></div>
      <div id="project-grid" class="project-grid"></div>
    </div>`;

    const grid = document.getElementById('project-grid');
    if (DB.projects.length === 0) { grid.innerHTML = '<div class="empty"><div class="icon">&#128193;</div><p>No projects yet.</p></div>'; return; }
    grid.innerHTML = DB.projects.map(p => {
        const mc = getProjectMembers(p.id).length;
        const cost = getProjectCost(p.id);
        return `<div class="card project-card" onclick="openProject(${p.id})">
      <div class="pc-top">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="showRenameProject(${p.id})" title="Edit">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeleteProject(${p.id})" title="Delete">&#10005;</button>
        </div>
      </div>
      <div class="pc-meta">
        <div class="pc-meta-item">&#128101; <span class="val">${mc}</span> members</div>
        <div class="pc-meta-item">&#128176; <span class="val">${fmt(cost)}</span>/mo</div>
      </div>
    </div>`;
    }).join('');
}

function showAddProject() {
    showModal(`<h3>New Project</h3>
    <div class="field"><label>Project Name</label><input class="input" id="inp-proj-name" placeholder="e.g. Marketing Campaign"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddProject()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-proj-name')?.focus(), 100);
}

async function doAddProject() {
    const name = document.getElementById('inp-proj-name').value.trim();
    if (!name) return;
    await api('/projects', { method: 'POST', body: { name } });
    hideModal(); await loadDB(); renderDashboard();
}

function showRenameProject(pid) {
    const proj = DB.projects.find(p => p.id === pid); if (!proj) return;
    showModal(`<h3>Edit Project Name</h3>
    <div class="field"><label>Project Name</label><input class="input" id="inp-rename" value="${esc(proj.name)}"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doRenameProject(${pid})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-rename'); el.focus(); el.select(); }, 100);
}

async function doRenameProject(pid) {
    const name = document.getElementById('inp-rename').value.trim(); if (!name) return;
    await api('/projects/' + pid, { method: 'PUT', body: { name } });
    hideModal(); await loadDB();
    if (document.getElementById('detail-layout').classList.contains('active')) renderProjectDetail();
    else renderDashboard();
}

function confirmDeleteProject(pid) {
    const p = DB.projects.find(x => x.id === pid); if (!p) return;
    const mc = getProjectMembers(pid).length;
    showModal(`<h3>Delete Project</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(p.name)}</strong>?<br>${mc} assignment(s) removed. Members kept.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteProject(${pid})">Delete</button></div>`);
}

async function doDeleteProject(pid) {
    await api('/projects/' + pid, { method: 'DELETE' });
    hideModal(); showPage('admin-layout');
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
      <div class="section-head"><h2>All Users</h2><button class="btn btn-accent" onclick="showAddUser()">+ Add User</button></div>
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
        rows = DB.positions.map(p => {
            const count = DB.members.filter(m => m.positionId === p.id).length;
            return `<tr><td style="font-family:var(--font-m)">${p.id}</td><td>${esc(p.name)}</td><td>${count}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditPosition(${p.id})">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeletePosition(${p.id})">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }
    view.innerHTML = `
    <div class="app-header"><h2>Positions</h2><div class="header-sub">Manage job positions</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Positions</h2><button class="btn btn-accent" onclick="showAddPosition()">+ New Position</button></div>
      <div class="table-wrap"><table><thead><tr><th style="width:60px">ID</th><th>Position Name</th><th style="width:100px">Members</th><th style="width:100px">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
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
        rows = DB.departments.map(d => {
            const count = DB.members.filter(m => m.departmentId === d.id).length;
            return `<tr><td style="font-family:var(--font-m)">${d.id}</td><td>${esc(d.name)}</td><td>${count}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditDepartment(${d.id})">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeleteDepartment(${d.id})">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }
    view.innerHTML = `
    <div class="app-header"><h2>Departments</h2><div class="header-sub">Manage departments</div></div>
    <div class="app-body">
      <div class="section-head"><h2>All Departments</h2><button class="btn btn-accent" onclick="showAddDepartment()">+ New Department</button></div>
      <div class="table-wrap"><table><thead><tr><th style="width:60px">ID</th><th>Department Name</th><th style="width:100px">Members</th><th style="width:100px">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
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
   SECTION 10: PROJECT DETAIL
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

    document.getElementById('project-detail-content').innerHTML = `
    <div class="app-header"><div class="detail-top">
      <h2>${esc(proj.name)}</h2>
      <button class="btn btn-ghost btn-sm" onclick="showRenameProject(${pid})">Edit Name</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeleteProject(${pid})">Delete</button>
    </div></div>
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
   SECTION 11: EMPLOYEE — MY PROJECTS
   ========================================================== */

function renderEmployeeProjects() {
    if (!currentUser || !currentUser.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId); if (!member) return;
    const projs = getMemberProjects(member.id);

    let projectRows = '';
    if (projs.length === 0) {
        projectRows = '<tr><td colspan="3" style="text-align:center;color:var(--main-text3);padding:30px">Not assigned to any project</td></tr>';
    } else {
        projectRows = projs.map(p => {
            const mc = getProjectMembers(p.id).length;
            return `<tr>
        <td style="font-family:var(--font-d);font-size:1rem">${esc(p.name)}</td>
        <td>${mc} member(s)</td>
        <td><span class="badge badge-employee">Active</span></td>
      </tr>`;
        }).join('');
    }

    document.getElementById('emp-myprojects').innerHTML = `
    <div class="app-header"><h2>My Projects</h2><div class="header-sub">Projects you are involved in</div></div>
    <div class="app-body" style="max-width:640px">
      <div class="emp-card">
        <div class="emp-name">${esc(member.name)}</div>
        <div class="emp-project">Position: ${esc(getPositionName(member.positionId))} &nbsp;|&nbsp; Dept: ${esc(getDeptName(member.departmentId))}</div>
        <div class="emp-project" style="margin-bottom:8px">Assigned Projects: <strong>${projs.length}</strong></div>
      </div>
      <div class="section-head"><h2>Project List</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Project Name</th><th>Team Size</th><th>Status</th></tr></thead><tbody>${projectRows}</tbody></table></div>
    </div>`;
}


/* ==========================================================
   SECTION 12: EMPLOYEE — TIME ENTRIES
   ========================================================== */

function renderEmployeeAttendance() {
    if (!currentUser || !currentUser.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;

    const today = todayStr();
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

    const allEntries = [...myEntries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    let rows = '';
    if (allEntries.length === 0) {
        rows = '<tr><td colspan="7" style="text-align:center;color:var(--main-text3);padding:30px">No time entries yet</td></tr>';
    } else {
        rows = allEntries.map(r => {
            const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
            const dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            const startParts = r.clockIn ? r.clockIn.split('T') : [];
            const endParts = r.clockOut ? r.clockOut.split('T') : [];
            const startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '—';
            const endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '—';
            return `<tr>
                <td style="font-family:var(--font-m)">${r.date}</td>
                <td>${proj ? esc(proj.name) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td style="font-family:var(--font-m)">${startTime}</td>
                <td style="font-family:var(--font-m)">${endTime}</td>
                <td style="text-align:right;font-family:var(--font-m)">${dur}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.description || '')}">${r.description ? esc(r.description) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditTimeEntry(${r.id})" title="Edit">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeleteTimeEntry(${r.id})" title="Delete">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('emp-attendance').innerHTML = `
    <div class="app-header"><h2>My Attendance</h2><div class="header-sub">Log and track your work hours</div></div>
    <div class="app-body" style="max-width:960px">
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="stat-card"><div class="stat-label">Today Hours</div><div class="stat-value">${formatDuration(todayMs)}</div></div>
        <div class="stat-card"><div class="stat-label">Today Cost</div><div class="stat-value">${fmtCost(todayCost)}</div></div>
        <div class="stat-card"><div class="stat-label">This Week</div><div class="stat-value">${formatDuration(weekMs)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Entries</div><div class="stat-value">${myEntries.length}</div></div>
        <div class="stat-card"><div class="stat-label">Hourly Rate</div><div class="stat-value" style="font-size:1.1rem">${fmtHourlyRate(member)}</div></div>
      </div>
      <div class="section-head"><h2>Time Entries</h2><button class="btn btn-accent" onclick="showAddTimeEntry()">+ Add Time Entry</button></div>
      <div class="table-wrap"><table><thead><tr>
        <th>Date</th><th>Project</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th>Description</th><th style="width:90px">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

function showAddTimeEntry() {
    const projectOpts = DB.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const today = todayStr();

    showModal(`<h3>Add Time Entry</h3>
        <div class="field"><label>Date</label>
            <input class="input" id="entry-date" type="date" value="${today}"></div>
        <div class="field"><label>Project</label>
            <select class="input" id="entry-project"><option value="">-- Select Project --</option>${projectOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label>Start Time</label>
                <input class="input" id="entry-start" type="time" value="09:00"></div>
            <div class="field"><label>End Time</label>
                <input class="input" id="entry-end" type="time" value="17:00"></div>
        </div>
        <div class="field"><label>Description</label>
            <textarea class="input" id="entry-desc" rows="3" placeholder="What did you work on?" style="resize:vertical"></textarea></div>
        <p class="auth-error" id="entry-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddTimeEntry()">Save</button></div>`);
    setTimeout(() => document.getElementById('entry-project')?.focus(), 100);
}

async function doAddTimeEntry() {
    const errEl = document.getElementById('entry-error');
    const date = document.getElementById('entry-date').value;
    const projectId = document.getElementById('entry-project').value;
    const start = document.getElementById('entry-start').value;
    const end = document.getElementById('entry-end').value;
    const desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select a project'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    try {
        await api('/attendance', {
            method: 'POST',
            body: {
                memberId: currentUser.memberId,
                date: date,
                clockIn: date + 'T' + start + ':00',
                clockOut: date + 'T' + end + ':00',
                projectId: parseInt(projectId),
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function showEditTimeEntry(entryId) {
    const entry = DB.attendance.find(a => a.id === entryId); if (!entry) return;
    const projectOpts = DB.projects.map(p => { const sel = entry.projectId === p.id ? 'selected' : ''; return `<option value="${p.id}" ${sel}>${esc(p.name)}</option>`; }).join('');
    const startParts = entry.clockIn ? entry.clockIn.split('T') : [];
    const endParts = entry.clockOut ? entry.clockOut.split('T') : [];
    const startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
    const endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';

    showModal(`<h3>Edit Time Entry</h3>
        <div class="field"><label>Date</label>
            <input class="input" id="entry-date" type="date" value="${entry.date}"></div>
        <div class="field"><label>Project</label>
            <select class="input" id="entry-project"><option value="">-- Select Project --</option>${projectOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label>Start Time</label>
                <input class="input" id="entry-start" type="time" value="${startTime}"></div>
            <div class="field"><label>End Time</label>
                <input class="input" id="entry-end" type="time" value="${endTime}"></div>
        </div>
        <div class="field"><label>Description</label>
            <textarea class="input" id="entry-desc" rows="3" style="resize:vertical">${esc(entry.description || '')}</textarea></div>
        <p class="auth-error" id="entry-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditTimeEntry(${entryId})">Save</button></div>`);
}

async function doEditTimeEntry(entryId) {
    const errEl = document.getElementById('entry-error');
    const date = document.getElementById('entry-date').value;
    const projectId = document.getElementById('entry-project').value;
    const start = document.getElementById('entry-start').value;
    const end = document.getElementById('entry-end').value;
    const desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!projectId) { errEl.textContent = 'Please select a project'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    try {
        await api('/attendance/' + entryId, {
            method: 'PUT',
            body: {
                date: date,
                clockIn: date + 'T' + start + ':00',
                clockOut: date + 'T' + end + ':00',
                projectId: parseInt(projectId),
                description: desc
            }
        });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteTimeEntry(entryId) {
    showModal(`<h3>Delete Time Entry</h3>
        <p style="color:var(--main-text2);line-height:1.6">Delete this time entry?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteTimeEntry(${entryId})">Delete</button></div>`);
}

async function doDeleteTimeEntry(entryId) {
    try {
        await api('/attendance/' + entryId, { method: 'DELETE' });
        hideModal(); await loadDB(); renderEmployeeAttendance();
    } catch (e) { alert('Failed: ' + e.message); }
}


/* ==========================================================
   SECTION 13: ADMIN — ATTENDANCE (filter, pagination, project cost)
   ========================================================== */

let selectedEmployeeIds = [];
let attCurrentPage = 1;
let attPageSize = 10;
let attFilteredData = [];

function renderAdminAttendance() {
    const view = document.getElementById('admin-attendance');
    const today = todayStr();
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);
    selectedEmployeeIds = [];
    attCurrentPage = 1;
    attPageSize = 10;

    const projOpts = DB.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

    view.innerHTML = `
    <div class="app-header"><h2>Attendance</h2><div class="header-sub">View time entries, cost and export</div></div>
    <div class="app-body">
      <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px 24px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
          <span style="font-size:1.15rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label>
            <input type="date" class="input" id="att-from" value="${defaultFrom}" style="width:145px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label>
            <input type="date" class="input" id="att-to" value="${today}" style="width:145px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label>
            <div id="att-emp-multiselect"></div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Project</label>
            <select class="input" id="att-project" style="width:160px;padding:8px 10px;font-size:.82rem">
              <option value="">All Projects</option>
              ${projOpts}
            </select>
          </div>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="btn btn-accent btn-sm" onclick="applyAttendanceFilter()">Search</button>
            <button class="btn btn-ghost btn-sm" onclick="resetAttendanceFilter()">Reset</button>
            <button class="btn btn-ghost btn-sm" onclick="exportAttendanceCSV()">Export CSV</button>
          </div>
        </div>
      </div>
      <div id="att-stats-area"></div>
      <div id="att-project-summary"></div>
      <div id="att-table-area"></div>
    </div>`;

    buildEmployeeMultiSelect();
    applyAttendanceFilter();
    document.addEventListener('click', closeMultiSelectOutside);
}

function buildEmployeeMultiSelect() {
    const container = document.getElementById('att-emp-multiselect');
    const items = DB.members.map(m =>
        `<label class="multi-select-item"><input type="checkbox" value="${m.id}" onchange="onEmpCheckChange()"> ${esc(m.name)}</label>`
    ).join('');
    container.innerHTML = `
    <div class="multi-select" id="emp-multiselect">
      <div class="multi-select-trigger" onclick="toggleMultiSelect()">
        <span id="emp-ms-label">All Employees</span>
        <span class="arrow">&#9662;</span>
      </div>
      <div class="multi-select-dropdown">
        <div class="multi-select-actions">
          <button onclick="selectAllEmp()">Select All</button>
          <button onclick="clearAllEmp()">Clear All</button>
        </div>
        ${items}
      </div>
    </div>`;
}

function toggleMultiSelect() { document.getElementById('emp-multiselect').classList.toggle('open'); }
function closeMultiSelectOutside(e) { const el = document.getElementById('emp-multiselect'); if (el && !el.contains(e.target)) el.classList.remove('open'); }

function onEmpCheckChange() {
    const checks = document.querySelectorAll('#emp-multiselect .multi-select-item input');
    selectedEmployeeIds = [];
    checks.forEach(c => { if (c.checked) selectedEmployeeIds.push(parseInt(c.value)); });
    updateEmpMsLabel();
}

function updateEmpMsLabel() {
    const label = document.getElementById('emp-ms-label');
    if (!label) return;
    if (selectedEmployeeIds.length === 0) { label.innerHTML = 'All Employees'; }
    else if (selectedEmployeeIds.length <= 3) {
        const names = selectedEmployeeIds.map(id => { const m = DB.members.find(x => x.id === id); return m ? m.name : '?'; }).join(', ');
        label.innerHTML = esc(names) + ' <span class="multi-select-count">' + selectedEmployeeIds.length + '</span>';
    } else {
        label.innerHTML = 'Selected <span class="multi-select-count">' + selectedEmployeeIds.length + '</span>';
    }
}

function selectAllEmp() { document.querySelectorAll('#emp-multiselect .multi-select-item input').forEach(c => c.checked = true); onEmpCheckChange(); }
function clearAllEmp() { document.querySelectorAll('#emp-multiselect .multi-select-item input').forEach(c => c.checked = false); selectedEmployeeIds = []; updateEmpMsLabel(); }

function resetAttendanceFilter() {
    const today = todayStr(); const d = new Date(); d.setDate(d.getDate() - 30);
    document.getElementById('att-from').value = d.toISOString().slice(0, 10);
    document.getElementById('att-to').value = today;
    document.getElementById('att-project').value = '';
    clearAllEmp(); attCurrentPage = 1; applyAttendanceFilter();
}

function applyAttendanceFilter() {
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    const projId = document.getElementById('att-project').value;
    if (!fromDate || !toDate) return;

    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);
    if (selectedEmployeeIds.length > 0) filtered = filtered.filter(a => selectedEmployeeIds.includes(a.memberId));
    if (projId) filtered = filtered.filter(a => a.projectId === parseInt(projId));
    filtered = filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    attFilteredData = filtered;

    // Stats
    const totalRecords = filtered.length;
    const uniqueDays = [...new Set(filtered.map(a => a.date))].length;
    const uniqueEmployees = [...new Set(filtered.map(a => a.memberId))].length;
    const totalMs = filtered.reduce((s, r) => { if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn)); return s; }, 0);
    const totalCost = filtered.reduce((s, r) => {
        if (r.clockIn && r.clockOut) { const c = getEntryCost(r.memberId, new Date(r.clockOut) - new Date(r.clockIn)); return s + (c || 0); }
        return s;
    }, 0);

    document.getElementById('att-stats-area').innerHTML = `
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="stat-label">Records</div><div class="stat-value">${totalRecords}</div></div>
      <div class="stat-card"><div class="stat-label">Days</div><div class="stat-value">${uniqueDays}</div></div>
      <div class="stat-card"><div class="stat-label">Employees</div><div class="stat-value">${uniqueEmployees}</div></div>
      <div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${formatDuration(totalMs)}</div></div>
      <div class="stat-card"><div class="stat-label">Total Cost</div><div class="stat-value">${fmtCost(totalCost)}</div></div>
    </div>`;

    // Project summary
    const projectGroups = {};
    filtered.forEach(r => {
        if (!r.clockIn || !r.clockOut) return;
        const pid = r.projectId || 0;
        if (!projectGroups[pid]) projectGroups[pid] = { ms: 0, cost: 0, entries: 0 };
        const ms = new Date(r.clockOut) - new Date(r.clockIn);
        projectGroups[pid].ms += ms;
        projectGroups[pid].cost += (getEntryCost(r.memberId, ms) || 0);
        projectGroups[pid].entries++;
    });

    const hasProjects = Object.keys(projectGroups).length > 0;
    let projectSummaryRows = '';
    if (hasProjects) {
        projectSummaryRows = Object.entries(projectGroups).map(([pid, data]) => {
            const proj = pid === '0' ? null : DB.projects.find(p => p.id === parseInt(pid));
            return `<tr>
                <td>${proj ? esc(proj.name) : '<span style="color:var(--main-text3)">Unassigned</span>'}</td>
                <td style="text-align:right;font-family:var(--font-m)">${data.entries}</td>
                <td style="text-align:right;font-family:var(--font-m)">${formatDuration(data.ms)}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtCost(data.cost)}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('att-project-summary').innerHTML = hasProjects ? `
    <div class="section-head" style="margin-top:8px"><h2>Project Summary</h2></div>
    <div class="table-wrap" style="margin-bottom:24px"><table>
        <thead><tr><th>Project</th><th style="text-align:right">Entries</th><th style="text-align:right">Total Hours</th><th style="text-align:right">Total Cost</th></tr></thead>
        <tbody>${projectSummaryRows}</tbody>
    </table></div>` : '';

    // Clamp page
    const totalPages = Math.ceil(filtered.length / attPageSize) || 1;
    if (attCurrentPage > totalPages) attCurrentPage = totalPages;
    if (attCurrentPage < 1) attCurrentPage = 1;

    renderAttendancePage();
}

function renderAttendancePage() {
    const filtered = attFilteredData;
    const totalPages = Math.ceil(filtered.length / attPageSize) || 1;
    const startIdx = (attCurrentPage - 1) * attPageSize;
    const endIdx = startIdx + attPageSize;
    const pageData = filtered.slice(startIdx, endIdx);

    // Table rows
    let rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="9" style="text-align:center;color:var(--main-text3);padding:30px">No records found</td></tr>';
    } else {
        rows = pageData.map(r => {
            const member = DB.members.find(m => m.id === r.memberId);
            const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
            const startParts = r.clockIn ? r.clockIn.split('T') : [];
            const endParts = r.clockOut ? r.clockOut.split('T') : [];
            const startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '—';
            const endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '—';
            const durMs = r.clockIn && r.clockOut ? new Date(r.clockOut) - new Date(r.clockIn) : 0;
            const dur = durMs > 0 ? formatDuration(durMs) : '—';
            const cost = durMs > 0 ? fmtCost(getEntryCost(r.memberId, durMs)) : '—';
            return `<tr>
                <td style="font-family:var(--font-m)">${r.date}</td>
                <td>${member ? esc(member.name) : 'Unknown'}</td>
                <td>${proj ? esc(proj.name) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td style="font-family:var(--font-m)">${startTime}</td>
                <td style="font-family:var(--font-m)">${endTime}</td>
                <td style="text-align:right;font-family:var(--font-m)">${dur}</td>
                <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.description || '')}">${r.description ? esc(r.description) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td style="text-align:right"><span class="salary-val">${cost}</span></td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditAttendance(${r.id})" title="Edit">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeleteAttendance(${r.id})" title="Delete">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    // Pagination controls
    let paginationHtml = '';
    if (filtered.length > 0) {
        const showFrom = startIdx + 1;
        const showTo = Math.min(endIdx, filtered.length);

        // Page numbers
        let pageButtons = '';
        const maxVisible = 5;
        let startPage = Math.max(1, attCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

        pageButtons += `<button onclick="goAttPage(1)" ${attCurrentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
        pageButtons += `<button onclick="goAttPage(${attCurrentPage - 1})" ${attCurrentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;
        for (let p = startPage; p <= endPage; p++) {
            pageButtons += `<button onclick="goAttPage(${p})" class="${p === attCurrentPage ? 'active' : ''}">${p}</button>`;
        }
        pageButtons += `<button onclick="goAttPage(${attCurrentPage + 1})" ${attCurrentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>`;
        pageButtons += `<button onclick="goAttPage(${totalPages})" ${attCurrentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;

        paginationHtml = `
        <div class="pagination">
          <div class="pagination-info">Showing ${showFrom} to ${showTo} of ${filtered.length} entries</div>
          <div style="display:flex;align-items:center;gap:20px">
            <div class="pagination-size">
              <label>Show</label>
              <select onchange="changeAttPageSize(this.value)">
                <option value="5" ${attPageSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${attPageSize === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${attPageSize === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${attPageSize === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${attPageSize === 100 ? 'selected' : ''}>100</option>
              </select>
            </div>
            <div class="pagination-controls">${pageButtons}</div>
          </div>
        </div>`;
    }

    const projId = document.getElementById('att-project').value;
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    const rangeLabel = (selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length + ' employee(s)' : 'All employees') +
        (projId ? ', ' + (DB.projects.find(p => p.id === parseInt(projId))?.name || '') : '') +
        ' — ' + fromDate + ' to ' + toDate;

    const tableWrap = document.getElementById('att-table-area');
    tableWrap.innerHTML = `
    <div class="section-head"><h2>Detail Records</h2><span style="font-size:.82rem;color:var(--main-text3)">${rangeLabel}</span></div>
    <div class="table-wrap">
      <table><thead><tr>
        <th>Date</th><th>Employee</th><th>Project</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th>Description</th><th style="text-align:right">Cost</th><th style="width:90px">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>
      ${paginationHtml}
    </div>`;
}

function goAttPage(page) {
    const totalPages = Math.ceil(attFilteredData.length / attPageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    attCurrentPage = page;
    renderAttendancePage();
}

function changeAttPageSize(size) {
    attPageSize = parseInt(size);
    attCurrentPage = 1;
    renderAttendancePage();
}

function showEditAttendance(recordId) {
    const record = DB.attendance.find(a => a.id === recordId); if (!record) return;
    const member = DB.members.find(m => m.id === record.memberId);
    const mName = member ? member.name : 'Unknown';
    const projectOpts = DB.projects.map(p => { const sel = record.projectId === p.id ? 'selected' : ''; return `<option value="${p.id}" ${sel}>${esc(p.name)}</option>`; }).join('');
    const startParts = record.clockIn ? record.clockIn.split('T') : [];
    const endParts = record.clockOut ? record.clockOut.split('T') : [];
    const startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
    const endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';

    showModal(`<h3>Edit Entry — ${esc(mName)}</h3>
        <div class="field"><label>Date</label>
            <input class="input" id="edit-att-date" type="date" value="${record.date}"></div>
        <div class="field"><label>Project</label>
            <select class="input" id="edit-att-project"><option value="">-- Select Project --</option>${projectOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label>Start Time</label>
                <input class="input" id="edit-att-start" type="time" value="${startTime}"></div>
            <div class="field"><label>End Time</label>
                <input class="input" id="edit-att-end" type="time" value="${endTime}"></div>
        </div>
        <div class="field"><label>Description</label>
            <textarea class="input" id="edit-att-desc" rows="3" style="resize:vertical">${esc(record.description || '')}</textarea></div>
        <p class="auth-error" id="edit-att-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditAttendance(${recordId})">Save</button></div>`);
}

async function doEditAttendance(recordId) {
    const errEl = document.getElementById('edit-att-error');
    const date = document.getElementById('edit-att-date').value;
    const projectId = document.getElementById('edit-att-project').value;
    const start = document.getElementById('edit-att-start').value;
    const end = document.getElementById('edit-att-end').value;
    const desc = document.getElementById('edit-att-desc').value.trim();
    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date is required'; return; }
    if (!start) { errEl.textContent = 'Start time is required'; return; }
    if (!end) { errEl.textContent = 'End time is required'; return; }
    if (start >= end) { errEl.textContent = 'End time must be after start time'; return; }

    try {
        await api('/attendance/' + recordId, {
            method: 'PUT',
            body: { date, clockIn: date + 'T' + start + ':00', clockOut: date + 'T' + end + ':00', projectId: projectId ? parseInt(projectId) : null, description: desc }
        });
        hideModal(); await loadDB(); applyAttendanceFilter();
    } catch (e) { errEl.textContent = 'Failed: ' + e.message; }
}

function confirmDeleteAttendance(recordId) {
    const record = DB.attendance.find(a => a.id === recordId); if (!record) return;
    const member = DB.members.find(m => m.id === record.memberId);
    showModal(`<h3>Delete Record</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete entry for <strong style="color:var(--main-text)">${member ? esc(member.name) : 'Unknown'}</strong> on <strong style="color:var(--main-text)">${record.date}</strong>?</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteAttendance(${recordId})">Delete</button></div>`);
}

async function doDeleteAttendance(recordId) {
    await api('/attendance/' + recordId, { method: 'DELETE' });
    hideModal(); await loadDB(); applyAttendanceFilter();
}

function exportAttendanceCSV() {
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    const projId = document.getElementById('att-project').value;
    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);
    if (selectedEmployeeIds.length > 0) filtered = filtered.filter(a => selectedEmployeeIds.includes(a.memberId));
    if (projId) filtered = filtered.filter(a => a.projectId === parseInt(projId));
    filtered = filtered.sort((a, b) => a.date.localeCompare(b.date) || a.memberId - b.memberId);
    if (filtered.length === 0) { alert('No records to export.'); return; }

    const headers = ['Date', 'Employee', 'Position', 'Department', 'Project', 'Start', 'End', 'Duration', 'Description', 'Hourly Rate', 'Cost'];
    const rows = filtered.map(r => {
        const member = DB.members.find(m => m.id === r.memberId);
        const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        const startParts = r.clockIn ? r.clockIn.split('T') : [];
        const endParts = r.clockOut ? r.clockOut.split('T') : [];
        const startTime = startParts.length === 2 ? startParts[1].substring(0, 5) : '';
        const endTime = endParts.length === 2 ? endParts[1].substring(0, 5) : '';
        const durMs = r.clockIn && r.clockOut ? new Date(r.clockOut) - new Date(r.clockIn) : 0;
        const dur = durMs > 0 ? formatDuration(durMs) : '';
        const rate = member ? getHourlyRate(member) : null;
        const cost = durMs > 0 ? getEntryCost(r.memberId, durMs) : null;
        return [r.date, member ? member.name : 'Unknown', member ? getPositionName(member.positionId) : '', member ? getDeptName(member.departmentId) : '',
            proj ? proj.name : '', startTime, endTime, dur, r.description || '', rate ? rate.toFixed(2) : '', cost ? cost.toFixed(2) : ''];
    });

    let csv = headers.join(',') + '\n';
    rows.forEach(r => { csv += r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n'; });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = 'attendance_' + fromDate + '_to_' + toDate + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}


/* ==========================================================
   SECTION 14: INITIALIZATION
   ========================================================== */

// Pre-load data on page load
(async function(){
    const saved = localStorage.getItem('multitrade_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            await loadDB();
            document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
            const target = currentUser.role === 'admin' ? 'admin-layout' : 'employee-layout';
            document.getElementById(target).classList.add('active');
            if (currentUser.role === 'admin') { adminNav('projects'); }
            else { empNav('myprojects'); }
            updateAvatars();
            return;
        } catch (e) {
            localStorage.removeItem('multitrade_session');
            currentUser = null;
        }
    }
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('login-page').classList.add('active');
})();


