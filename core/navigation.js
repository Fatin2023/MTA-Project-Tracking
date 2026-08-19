/* ==========================================================
   Side Bar Colapsed
   ========================================================== */
function toggleSidebar() {
    const sidebars = document.querySelectorAll('.sidebar');
    const isCollapsed = sidebars[0]?.classList.contains('collapsed');
    sidebars.forEach(s => s.classList.toggle('collapsed'));
    localStorage.setItem('multitrade_sidebar_collapsed', !isCollapsed);
}

function restoreSidebarState() {
    if (localStorage.getItem('multitrade_sidebar_collapsed') === 'true') {
        document.querySelectorAll('.sidebar').forEach(s => {
            s.classList.add('collapsed');
            // 不改 innerHTML，CSS 自动处理三条线/箭头
        });
    }
}

// 在初始化代码末尾加
restoreSidebarState();

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
        case 'files': renderAdminFiles(); break;
    }
    _initPTRDebounce();
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
        nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        if (el) {
            el.classList.add('active');
        } else {
            nav.querySelectorAll('.nav-item').forEach(n => {
                const handler = n.getAttribute('onclick') || '';
                if (handler.includes("'" + tab + "'")) n.classList.add('active');
            });
        }
    }

    switch (tab) {
        case 'myprojects': renderEmployeeProjects(); break;
        case 'attendance': renderEmployeeAttendance(); break;
        case 'report': renderEmpReport(); break;
        case 'settings': renderEmpSettings(); break;
        case 'files': renderEmployeeFiles(); break;
    }
    _initPTRDebounce();
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