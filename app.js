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
        currentUser = await api('/login', { method: 'POST', body: { username: u, password: p } });
        err.textContent = '';
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

function logout() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
    currentUser = null;
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    showPage('login-page');
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
    const available = DB.members.filter(m => !assignedIds.includes(m.id));
    const memberOpts = available.map(m => {
        const sal = latestSalary(m);
        const salLabel = sal != null ? ' — ' + fmt(sal) : '';
        return `<option value="${m.id}">${esc(m.name)} (${esc(getPositionName(m.positionId))}${salLabel})</option>`;
    }).join('');

    showModal(`<h3>Assign Member to Project</h3>
    ${available.length > 0 ? `<div class="field"><label>Select Member</label><select class="input" id="assign-member-select"><option value="">-- Select --</option>${memberOpts}</select></div>
      <p style="color:var(--main-text3);font-size:.82rem;margin-top:4px;margin-bottom:16px">Salary is set per user in User Management.</p>` : '<p style="color:var(--main-text3);margin-bottom:16px">All members assigned.</p>'}
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAssignMember(${pid})">Assign</button></div>`);
}

async function doAssignMember(pid) {
    const selectEl = document.getElementById('assign-member-select');
    if (!selectEl || !selectEl.value) return;
    const memberId = parseInt(selectEl.value);
    await api('/assignments', { method: 'POST', body: { projectId: pid, memberId } });
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
   SECTION 12: EMPLOYEE — CLOCK IN / OUT
   ========================================================== */

let empClockInterval = null;
let clockCurrentTimeInt = null;

function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function renderEmployeeAttendance() {
    if (!currentUser || !currentUser.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;

    const today = todayStr();
    const todayRecord = DB.attendance.find(a => a.memberId === member.id && a.date === today);
    const isClockedIn = todayRecord && todayRecord.clockIn && !todayRecord.clockOut;

    if (empClockInterval) { clearInterval(empClockInterval); empClockInterval = null; }
    if (clockCurrentTimeInt) { clearInterval(clockCurrentTimeInt); clockCurrentTimeInt = null; }
    if (isClockedIn) startClockTimer(todayRecord.clockIn);

    let historyRows = '';
    const records = DB.attendance.filter(a => a.memberId === member.id).sort((a, b) => b.date.localeCompare(a.date));
    if (records.length === 0) {
        historyRows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No records</td></tr>';
    } else {
        historyRows = records.map(r => {
            const dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            return `<tr>
                <td style="font-family:var(--font-m)">${r.date}</td>
                <td style="font-family:var(--font-m)">${formatLocalTime(r.clockIn)}</td>
                <td>${r.clockOut ? '<span style="font-family:var(--font-m)">' + formatLocalTime(r.clockOut) + '</span>' : '<span class="badge badge-clocked-in">Working</span>'}</td>
                <td style="text-align:right;font-family:var(--font-m)">${dur}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('emp-attendance').innerHTML = `
    <div class="app-header"><h2>Attendance</h2><div class="header-sub">Clock in and out</div></div>
    <div class="app-body" style="max-width:640px">
      <div class="clock-card">
        <div class="clock-status" id="clock-status">${isClockedIn ? 'Clocked In' : 'Clocked Out'}</div>
        <div class="clock-time" id="clock-current-time">${new Date().toLocaleTimeString('en')}</div>
        <div class="clock-duration" id="clock-duration">${getDurationDisplay(todayRecord)}</div>
        ${isClockedIn
            ? '<button class="btn btn-danger btn-lg clock-btn" id="clock-action-btn" onclick="doClockOut()">Clock Out</button>'
            : '<button class="btn btn-green btn-lg clock-btn" id="clock-action-btn" onclick="doClockIn()">Clock In</button>'}
      </div>
      <div class="section-head"><h2>Attendance History</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th style="text-align:right">Duration</th></tr></thead><tbody>${historyRows}</tbody></table></div>
    </div>`;

    clockCurrentTimeInt = setInterval(() => {
        const el = document.getElementById('clock-current-time');
        if (el) el.textContent = new Date().toLocaleTimeString('en');
    }, 1000);
}

function formatLocalTime(str) {
    if (!str) return '—';
    // str is like "2026-05-08T07:30:00" — extract time part
    const parts = str.split('T');
    if (parts.length === 2) return parts[1].substring(0, 8);
    return str;
}

function getDurationDisplay(record) {
    if (!record || !record.clockIn) return '';
    if (record.clockOut) return 'Duration: ' + formatDuration(new Date(record.clockOut) - new Date(record.clockIn));
    return 'Working for ' + formatDuration(new Date() - new Date(record.clockIn)) + '...';
}

function startClockTimer(clockInStr) {
    if (empClockInterval) clearInterval(empClockInterval);
    empClockInterval = setInterval(() => {
        const el = document.getElementById('clock-duration');
        if (el) el.textContent = 'Working for ' + formatDuration(new Date() - new Date(clockInStr)) + '...';
    }, 1000);
}

async function doClockIn() {
    if (!currentUser || !currentUser.memberId) return;
    await loadDB();
    const today = todayStr();
    const existing = DB.attendance.find(a => a.memberId === currentUser.memberId && a.date === today && a.clockIn && !a.clockOut);
    if (existing) { renderEmployeeAttendance(); return; }

    try {
        await api('/attendance', {
            method: 'POST',
            body: {
                memberId: currentUser.memberId,
                date: today,
                clockIn: localISO(new Date()),
                clockOut: null
            }
        });
        await loadDB();
        renderEmployeeAttendance();
    } catch (e) {
        alert('Clock in failed: ' + e.message);
    }
}

async function doClockOut() {
    if (!currentUser || !currentUser.memberId) return;
    await loadDB();
    const today = todayStr();
    const record = DB.attendance.find(a => a.memberId === currentUser.memberId && a.date === today && a.clockIn && !a.clockOut);
    if (!record) { renderEmployeeAttendance(); return; }

    try {
        await api('/attendance/' + record.id, {
            method: 'PUT',
            body: {
                date: record.date,
                clockIn: record.clockIn,
                clockOut: localISO(new Date())
            }
        });
        if (empClockInterval) { clearInterval(empClockInterval); empClockInterval = null; }
        await loadDB();
        renderEmployeeAttendance();
    } catch (e) {
        alert('Clock out failed: ' + e.message);
    }
}



/* ==========================================================
   SECTION 13: ADMIN — ATTENDANCE (multi-employee filter, edit, export, bulk delete)
   ========================================================== */

let selectedEmployeeIds = [];
let selectedAttendanceIds = new Set();

function renderAdminAttendance() {
    const view = document.getElementById('admin-attendance');
    const today = todayStr();
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);
    selectedEmployeeIds = [];
    selectedAttendanceIds = new Set();

    const empOpts = DB.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

    view.innerHTML = `
    <div class="app-header"><h2>Attendance</h2><div class="header-sub">View, edit and export attendance records</div></div>
    <div class="app-body">
      <div class="section-head">
        <h2>Filter</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">From</label>
            <input type="date" class="input" id="att-from" value="${defaultFrom}" style="width:150px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">To</label>
            <input type="date" class="input" id="att-to" value="${today}" style="width:150px;padding:8px 10px;font-size:.82rem">
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Employee</label>
            <div id="att-emp-multiselect"></div>
          </div>
          <button class="btn btn-accent btn-sm" onclick="applyAttendanceFilter()">Search</button>
          <button class="btn btn-ghost btn-sm" onclick="resetAttendanceFilter()">Reset</button>
          <button class="btn btn-ghost btn-sm" onclick="exportAttendanceCSV()">Export CSV</button>
        </div>
      </div>
      <div id="att-bulk-bar"></div>
      <div id="att-stats-area"></div>
      <div id="att-table-area"></div>
    </div>`;

    buildEmployeeMultiSelect();
    applyAttendanceFilter();
    document.addEventListener('click', closeMultiSelectOutside);
}

function updateBulkBar() {
    const bar = document.getElementById('att-bulk-bar');
    if (!bar) return;
    if (selectedAttendanceIds.size === 0) {
        bar.innerHTML = '';
        return;
    }
    bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;margin-bottom:4px;border-bottom:1px solid var(--main-border)">
      <span style="font-size:.85rem;color:var(--main-accent);font-weight:600">${selectedAttendanceIds.size} selected</span>
      <button class="btn btn-ghost btn-sm" onclick="clearAttendanceSelection()">Clear Selection</button>
      <button class="btn btn-danger btn-sm" onclick="confirmBulkDeleteAttendance()">Delete Selected</button>
    </div>`;
}

function toggleAttendanceCheck(id, el) {
    if (el.checked) selectedAttendanceIds.add(id);
    else selectedAttendanceIds.delete(id);
    updateBulkBar();
}

function toggleSelectAllAttendance(el) {
    const checks = document.querySelectorAll('.att-row-check');
    checks.forEach(c => {
        c.checked = el.checked;
        const id = parseInt(c.dataset.id);
        if (el.checked) selectedAttendanceIds.add(id);
        else selectedAttendanceIds.delete(id);
    });
    updateBulkBar();
}

function clearAttendanceSelection() {
    selectedAttendanceIds.clear();
    document.querySelectorAll('.att-row-check').forEach(c => c.checked = false);
    const selectAll = document.getElementById('att-select-all');
    if (selectAll) selectAll.checked = false;
    updateBulkBar();
}

function confirmBulkDeleteAttendance() {
    if (selectedAttendanceIds.size === 0) return;
    const count = selectedAttendanceIds.size;
    showModal(`<h3>Delete Records</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${count} attendance record(s)</strong>?<br>This action cannot be undone.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doBulkDeleteAttendance()">Delete ${count} Record(s)</button></div>`);
}


async function doBulkDeleteAttendance() {
    const ids = Array.from(selectedAttendanceIds);
    hideModal();
    for (const id of ids) {
        await api('/attendance/' + id, { method: 'DELETE' });
    }
    selectedAttendanceIds.clear();
    await loadDB();
    applyAttendanceFilter();
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
    clearAllEmp();
    clearAttendanceSelection();
    applyAttendanceFilter();
}

function applyAttendanceFilter() {
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    if (!fromDate || !toDate) return;

    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);
    if (selectedEmployeeIds.length > 0) filtered = filtered.filter(a => selectedEmployeeIds.includes(a.memberId));
    filtered = filtered.sort((a, b) => b.date.localeCompare(a.date) || a.memberId - b.memberId);

    const totalRecords = filtered.length;
    const uniqueDays = [...new Set(filtered.map(a => a.date))].length;
    const uniqueEmployees = [...new Set(filtered.map(a => a.memberId))].length;
    const totalHours = filtered.reduce((s, r) => { if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn)); return s; }, 0);

    let empBreakdown = '';
    if (selectedEmployeeIds.length > 0) {
        const empStats = selectedEmployeeIds.map(id => {
            const member = DB.members.find(m => m.id === id);
            const mName = member ? member.name : 'Unknown';
            const empRecords = filtered.filter(a => a.memberId === id);
            const workDays = [...new Set(empRecords.filter(a => a.clockIn && a.clockOut).map(a => a.date))].length;
            const empHours = empRecords.reduce((s, r) => { if (r.clockIn && r.clockOut) return s + (new Date(r.clockOut) - new Date(r.clockIn)); return s; }, 0);
            return { name: mName, records: empRecords.length, workDays, totalHours: empHours, avgHrs: workDays > 0 ? formatDuration(empHours / workDays) : '—' };
        });
        empBreakdown = `<div class="section-head" style="margin-top:8px"><h2>Employee Breakdown</h2></div>
      <div class="table-wrap" style="margin-bottom:24px"><table>
        <thead><tr><th>Employee</th><th style="text-align:right">Records</th><th style="text-align:right">Work Days</th><th style="text-align:right">Total Hours</th><th style="text-align:right">Avg/Day</th></tr></thead>
        <tbody>${empStats.map(e => `<tr><td>${esc(e.name)}</td><td style="text-align:right;font-family:var(--font-m)">${e.records}</td><td style="text-align:right;font-family:var(--font-m)">${e.workDays}</td><td style="text-align:right;font-family:var(--font-m)">${formatDuration(e.totalHours)}</td><td style="text-align:right;font-family:var(--font-m)">${e.avgHrs}</td></tr>`).join('')}</tbody>
      </table></div>`;
    }

    document.getElementById('att-stats-area').innerHTML = `
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card"><div class="stat-label">Records</div><div class="stat-value">${totalRecords}</div></div>
      <div class="stat-card"><div class="stat-label">Days</div><div class="stat-value">${uniqueDays}</div></div>
      <div class="stat-card"><div class="stat-label">Employees</div><div class="stat-value">${uniqueEmployees}</div></div>
      <div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${formatDuration(totalHours)}</div></div>
    </div>${empBreakdown}`;

    let rows = '';
    if (filtered.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No records found</td></tr>';
    } else {
        rows = filtered.map(r => {
            const member = DB.members.find(m => m.id === r.memberId);
            const mName = member ? member.name : 'Unknown';
            const dur = r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '—';
            const status = r.clockOut ? '<span class="badge badge-clocked-out">Done</span>' : '<span class="badge badge-clocked-in">Working</span>';
            const checked = selectedAttendanceIds.has(r.id) ? 'checked' : '';
            return `<tr>
        <td style="width:40px;text-align:center"><input type="checkbox" class="att-row-check" data-id="${r.id}" ${checked} onchange="toggleAttendanceCheck(${r.id},this)"></td>
        <td style="font-family:var(--font-m)">${r.date}</td><td>${esc(mName)}</td>
        <td style="font-family:var(--font-m)">${formatTime(r.clockIn)}</td>
        <td>${r.clockOut ? '<span style="font-family:var(--font-m)">' + formatTime(r.clockOut) + '</span>' : '—'}</td>
        <td>${status}</td><td style="text-align:right;font-family:var(--font-m)">${dur}</td>
        <td><div class="actions-cell">
          <button class="btn-icon" onclick="showEditAttendance(${r.id})" title="Edit">&#9998;</button>
          <button class="btn-icon danger" onclick="confirmDeleteAttendance(${r.id})" title="Delete">&#10005;</button>
        </div></td></tr>`;
        }).join('');
    }

    const rangeLabel = selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length + ' employee(s) — ' + fromDate + ' to ' + toDate : 'All employees — ' + fromDate + ' to ' + toDate;
    document.getElementById('att-table-area').innerHTML = `
    <div class="section-head"><h2>Detail Records</h2><span style="font-size:.82rem;color:var(--main-text3)">${rangeLabel}</span></div>
    <div class="table-wrap"><table><thead><tr>
      <th style="width:40px;text-align:center"><input type="checkbox" id="att-select-all" onchange="toggleSelectAllAttendance(this)"></th>
      <th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Status</th><th style="text-align:right">Duration</th><th style="width:90px">Actions</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;

    // Restore select-all state
    const selectAll = document.getElementById('att-select-all');
    if (selectAll && filtered.length > 0) {
        const allChecked = filtered.every(r => selectedAttendanceIds.has(r.id));
        selectAll.checked = allChecked;
    }
    updateBulkBar();
}

function showEditAttendance(recordId) {
    const record = DB.attendance.find(a => a.id === recordId); if (!record) return;
    const member = DB.members.find(m => m.id === record.memberId);
    const mName = member ? member.name : 'Unknown';
    const clockInLocal = record.clockIn ? isoToLocalInput(record.clockIn) : '';
    const clockOutLocal = record.clockOut ? isoToLocalInput(record.clockOut) : '';

    showModal(`<h3>Edit Attendance — ${esc(mName)}</h3>
    <div class="field"><label>Date</label><input class="input" id="edit-att-date" type="date" value="${record.date}"></div>
    <div class="field"><label>Clock In</label><input class="input" id="edit-att-in" type="datetime-local" value="${clockInLocal}" style="font-family:var(--font-m)"></div>
    <div class="field"><label>Clock Out (blank = still working)</label><input class="input" id="edit-att-out" type="datetime-local" value="${clockOutLocal}" style="font-family:var(--font-m)"></div>
    <p class="auth-error" id="edit-att-error"></p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditAttendance(${recordId})">Save</button></div>`);
}

async function doEditAttendance(recordId) {
    const record = DB.attendance.find(a => a.id === recordId); if (!record) return;
    const errEl = document.getElementById('edit-att-error');
    const newDate = document.getElementById('edit-att-date').value;
    const newIn = document.getElementById('edit-att-in').value;
    const newOut = document.getElementById('edit-att-out').value;
    errEl.textContent = '';
    if (!newDate) { errEl.textContent = 'Date is required'; return; }
    if (!newIn) { errEl.textContent = 'Clock in time is required'; return; }
    const clockInISO = new Date(newIn).toISOString();
    let clockOutISO = null;
    if (newOut) {
        if (new Date(newOut) <= new Date(newIn)) { errEl.textContent = 'Clock out must be after clock in'; return; }
        clockOutISO = new Date(newOut).toISOString();
    }
    await api('/attendance/' + recordId, { method: 'PUT', body: { date: newDate, clockIn: clockInISO, clockOut: clockOutISO } });
    hideModal(); await loadDB(); applyAttendanceFilter();
}

function confirmDeleteAttendance(recordId) {
    const record = DB.attendance.find(a => a.id === recordId); if (!record) return;
    const member = DB.members.find(m => m.id === record.memberId);
    showModal(`<h3>Delete Record</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete attendance for <strong style="color:var(--main-text)">${member ? esc(member.name) : 'Unknown'}</strong> on <strong style="color:var(--main-text)">${record.date}</strong>?</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteAttendance(${recordId})">Delete</button></div>`);
}

async function doDeleteAttendance(recordId) {
    await api('/attendance/' + recordId, { method: 'DELETE' });
    selectedAttendanceIds.delete(recordId);
    hideModal(); await loadDB(); applyAttendanceFilter();
}

function isoToLocalInput(isoStr) {
    const d = new Date(isoStr); const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function exportAttendanceCSV() {
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);
    if (selectedEmployeeIds.length > 0) filtered = filtered.filter(a => selectedEmployeeIds.includes(a.memberId));
    filtered = filtered.sort((a, b) => a.date.localeCompare(b.date) || a.memberId - b.memberId);
    if (filtered.length === 0) { alert('No records to export.'); return; }

    const headers = ['Date', 'Employee', 'Position', 'Department', 'Clock In', 'Clock Out', 'Duration', 'Status'];
    const rows = filtered.map(r => {
        const member = DB.members.find(m => m.id === r.memberId);
        return [r.date, member ? member.name : 'Unknown', member ? getPositionName(member.positionId) : '—', member ? getDeptName(member.departmentId) : '—',
            r.clockIn ? new Date(r.clockIn).toLocaleString('en') : '', r.clockOut ? new Date(r.clockOut).toLocaleString('en') : '',
            r.clockIn && r.clockOut ? formatDuration(new Date(r.clockOut) - new Date(r.clockIn)) : '', r.clockOut ? 'Completed' : 'Working'];
    });

    let csv = headers.join(',') + '\n';
    rows.forEach(r => { csv += r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n'; });

    const empLabel = selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length + 'employees' : 'all';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance_' + empLabel + '_' + fromDate + '_to_' + toDate + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}



/* ==========================================================
   SECTION 14: INITIALIZATION
   ========================================================== */

// Pre-load data on page load
loadDB();
