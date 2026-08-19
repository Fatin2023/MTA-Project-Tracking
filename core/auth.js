/* ==========================================================
   SECTION 4: AUTHENTICATION
   ========================================================== */

let currentUser = null;
let clockInterval = null;

/* ===== 权限表 ===== */
const ROLE_PERMISSIONS = {
    admin:    ['admin', 'manager', 'all'],
    manager:  ['manager', 'all'],
    employee: ['all'],
    viewer:   ['all']
};

const getCurrentRole = () => currentUser ? currentUser.role : 'viewer';

/* ===== 应用权限到 nav ===== */
const applyNavPermissions = () => {
    const role = getCurrentRole();
    const allowed = ROLE_PERMISSIONS[role] || ['all'];

    document.querySelectorAll('.sidebar-nav').forEach(nav => {
        nav.querySelectorAll('.nav-group').forEach(group => {
            let hasVisible = false;

            group.querySelectorAll('.nav-item').forEach(item => {
                const permAttr = item.dataset.permission;

                if (!permAttr) {
                    item.style.display = '';
                    hasVisible = true;
                    return;
                }

                const perms = permAttr.split(',').map(p => p.trim());
                const canSee = perms.some(p => allowed.includes(p));

                if (canSee) {
                    item.style.display = '';
                    hasVisible = true;
                } else {
                    item.style.display = 'none';
                }
            });

            const section = group.previousElementSibling;
            if (section && section.classList.contains('nav-section')) {
                if (hasVisible) {
                    section.style.display = '';
                    group.style.display = '';
                } else {
                    section.style.display = 'none';
                    group.style.display = 'none';
                }
            }
        });
    });

    // employee: Report 只有 PIC 能看
    var reportNav = document.getElementById('emp-nav-report');
    if (reportNav) {
        reportNav.style.display = empIsPIC() ? '' : 'none';
    }
};

const _setRoleLabel = (layoutId, label) => {
    const el = document.querySelector(`#${layoutId} .sidebar-user .user-role`);
    if (el) el.textContent = label;
};

function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    if (!u || !pass) { err.textContent = 'Please enter username and password'; return; }

    (async () => {
        try {
            currentUser = await api('/login', { method: 'POST', body: { username: u, password: pass } });
            err.textContent = '';
            localStorage.setItem('multitrade_session', JSON.stringify(currentUser));

            if (window.clearSessionExpiredTimer) window.clearSessionExpiredTimer();
            if (window.restartAutoLogout) window.restartAutoLogout();

            const isViewer = currentUser.role === 'viewer';

            if (selectedModule === 'panel') {
                if (currentUser.role !== 'admin' && !isViewer) {
                    err.textContent = 'Panel Tracking is for admin only';
                    currentUser = null;
                    localStorage.removeItem('multitrade_session');
                    return;
                }
                localStorage.setItem('multitrade_module', 'panel');
                document.querySelectorAll('.auth-page,.app-layout').forEach(el => el.classList.remove('active'));
                document.getElementById('panel-layout').classList.add('active');
                document.getElementById('pt-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
                document.getElementById('pt-user-name').textContent = currentUser.username;

                _setRoleLabel('panel-layout', isViewer ? 'Viewer' : 'Admin');

                await ptLoadDB();
                ptNav('pt-dashboard');
                applyNavPermissions();
            } else {
                localStorage.setItem('multitrade_module', 'attendance');
                await loadDB();
                document.querySelectorAll('.auth-page,.app-layout').forEach(el => el.classList.remove('active'));

                if (currentUser.role === 'admin' || isViewer) {
                    document.getElementById('admin-layout').classList.add('active');
                    _setRoleLabel('admin-layout', isViewer ? 'Viewer' : 'Administrator');
                    adminNav('projects');
                } else {
                    document.getElementById('employee-layout').classList.add('active');
                    _noticesDismissed = false;  // ← 只在登录时弹一次
                    empNav('attendance');
                    renderNoticeBanners();
                }
                applyNavPermissions();
                updateAvatars();
                updateFileBadge();
            }
        } catch (ex) { err.textContent = ex.message; }
    })();
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-user').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;
    const errEl = document.getElementById('reg-error');
    const sucEl = document.getElementById('reg-success');
    errEl.textContent = '';
    sucEl.textContent = '';

    if (!name) { errEl.textContent = 'Please enter your name'; return; }
    if (!username) { errEl.textContent = 'Please enter a username'; return; }
    if (username.length < 2) { errEl.textContent = 'Username min 2 characters'; return; }
    if (pass.length < 6) { errEl.textContent = 'Password min 6 characters'; return; }
    if (pass !== pass2) { errEl.textContent = 'Passwords do not match'; return; }

    (async () => {
        try {
            await api('/register', { method: 'POST', body: { username, password: pass, name } });
            const loginResult = await api('/login', { method: 'POST', body: { username, password: pass } });
            localStorage.setItem('multitrade_session', JSON.stringify(loginResult));
            sucEl.textContent = 'Registration successful! Redirecting\u2026';
            errEl.textContent = '';
            ['reg-name', 'reg-user', 'reg-pass', 'reg-pass2'].forEach(id => { document.getElementById(id).value = ''; });
            setTimeout(() => showPage('login-page'), 1200);
        } catch (ex) { errEl.textContent = ex.message; }
    })();
}

function confirmLogout() {
    showModal(`<h3>Sign Out</h3>
        <p style="color:var(--main-text2);line-height:1.6">Are you sure you want to sign out?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doLogout()">Sign Out</button></div>`);
}

function doLogout() {
    ['multitrade_session', 'multitrade_admin_page', 'multitrade_emp_page', 'multitrade_pt_page', 'multitrade_module']
        .forEach(k => localStorage.removeItem(k));
    currentUser = null;
    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
    document.getElementById('login-page').classList.add('active');
    selectedModule = 'attendance';
    window.location.href = window.location.pathname;
    hideModal();
}