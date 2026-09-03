/* ==========================================================
   SECTION 2: UTILITIES
   ========================================================== */

const fmt = (n) => n == null ? '\u2014' : 'RM' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

const getPositionName = (pid) => DB.positions.find(x => x.id === pid)?.name || '\u2014';
const getDeptName = (did) => DB.departments.find(x => x.id === did)?.name || '\u2014';
const getSubScopeName = (id) => id ? (DB.subScopes.find(x => x.id === id)?.name || '\u2014') : '\u2014';
const getDetailName = (id) => id ? (DB.details.find(x => x.id === id)?.name || '\u2014') : '\u2014';
const getScopeName = (id) => id ? (DB.scopes.find(x => x.id === id)?.name || '\u2014') : '\u2014';

const latestSalary = (member) => {
    if (!member.salaries) return null;
    const keys = Object.keys(member.salaries).sort().reverse();
    return keys.length ? member.salaries[keys[0]] : null;
};

const getMemberProjects = (memberId) =>
    DB.projectAssignments.filter(pa => pa.memberId === memberId)
        .map(pa => DB.projects.find(p => p.id === pa.projectId)).filter(Boolean);

const getProjectMembers = (projectId) =>
    DB.projectAssignments.filter(pa => pa.projectId === projectId)
        .map(pa => DB.members.find(m => m.id === pa.memberId)).filter(Boolean);

const getProjectCost = (projectId) =>
    getProjectMembers(projectId).reduce((s, m) => s + (latestSalary(m) || 0), 0);

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0h';
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    let parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    if (s > 0) parts.push(s + 's');
    return parts.length ? parts.join(' ') : '0h';
};

const formatDateDMY = (dateStr) => {
    if (!dateStr) return '\u2014';
    const parts = dateStr.slice(0, 10).split('-');
    return parts.length !== 3 ? dateStr : `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const toLocalDisplay = (utcStr) => {
    if (!utcStr) return '—';
    const d = new Date(utcStr);
    const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const timeStr = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return formatDateDMY(dateStr) + ' ' + timeStr;
};

const toLocalInput = (utcStr) => {
    if (!utcStr) return '';
    const d = new Date(utcStr);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
};

const formatTime = (isoStr) =>
    isoStr ? new Date(isoStr).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '\u2014';

const getHourlyRate = (member) => {
    const salary = latestSalary(member);
    return (!salary || salary <= 0) ? null : salary / 176;
};

const getEntryCost = (memberId, durationMs) => {
    const member = DB.members.find(m => m.id === memberId);
    if (!member) return null;
    const hourlyRate = getHourlyRate(member);
    return hourlyRate ? hourlyRate * (durationMs / 3600000) : null;
};

const fmtCost = (val) => val == null ? '\u2014' : 'RM ' + Number(val).toFixed(2);

const fmtHourlyRate = (member) => {
    const rate = getHourlyRate(member);
    return rate ? 'RM ' + Number(rate).toFixed(2) + '/hr' : '\u2014';
};

const fmtStdHours = (h) => {
    if (!h || h <= 0) return '\u2014';
    return (h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)) + 'h';
};

const _optsHtml = (list, selectedId, noneLabel) =>
    `<option value="">-- ${noneLabel} --</option>` +
    list.map(i => `<option value="${i.id}"${i.id === selectedId ? ' selected' : ''}>${esc(i.name)}</option>`).join('');

const subScopeOpts = (selectedId) => _optsHtml(DB.subScopes, selectedId, 'None');
const detailOpts = (selectedId) => _optsHtml(DB.details, selectedId, 'None');
const scopeOpts = (selectedId) => _optsHtml(DB.scopes, selectedId, 'None');

const animCrud = (...ids) => {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('crud-anim'); void el.offsetWidth; el.classList.add('crud-anim'); }
    });
};

// ── Time calculation helpers ──
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getStandardHours = (memberId, dateStr) => {
    const member = DB.members.find(m => m.id === memberId);
    const dept = member ? DB.departments.find(d => d.id === member.departmentId) : null;
    const dayNum = new Date(dateStr).getDay();
    if (dayNum === 0) return 0;
    if (dayNum === 6) return dept ? (dept.saturdayHours ?? 0) : 0;
    return dept ? (dept.normalDayHours ?? 9) : 9;
};

const calcOT = (clockIn, clockOut, memberId, dateStr) => {
    if (!clockIn || !clockOut) return { hours: 0, standardHours: 0, ot: 0, otMs: 0 };
    const ms = new Date(clockOut) - new Date(clockIn);
    const hours = ms / 3600000;
    const stdHrs = getStandardHours(memberId, dateStr);
    const ot = Math.max(0, hours - stdHrs);
    return { hours, standardHours: stdHrs, ot, otMs: ot * 3600000, ms };
};

//Upload File
const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
};

// side bar nav collapse
const toggleNavGroup = (sectionEl) => {
    // sidebar collapsed 时不响应
    const sidebar = sectionEl.closest('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) return;

    const group = sectionEl.nextElementSibling;
    if (!group || !group.classList.contains('nav-group')) return;

    const isCollapsed = group.classList.contains('collapsed');

    // toggle
    group.classList.toggle('collapsed');
    sectionEl.classList.toggle('collapsed');

    // 保存状态
    const groupId = group.dataset.group;
    if (groupId) {
        const state = JSON.parse(localStorage.getItem('nav_collapsed') || '{}');
        state[groupId] = !isCollapsed;
        localStorage.setItem('nav_collapsed', JSON.stringify(state));
    }
};

// 页面加载时恢复状态
const restoreNavState = () => {
    const state = JSON.parse(localStorage.getItem('nav_collapsed') || '{}');
    document.querySelectorAll('.nav-group[data-group]').forEach(group => {
        if (state[group.dataset.group]) {
            group.classList.add('collapsed');
            const section = group.previousElementSibling;
            if (section && section.classList.contains('nav-section')) {
                section.classList.add('collapsed');
            }
        }
    });
};

// 登录成功后调用一次
restoreNavState();

// ===== file checking for security =====
const BLOCKED_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.msi', '.pif',
    '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf',
    '.ps1', '.psm1', '.psd1', '.reg', '.dll', '.sys',
    '.scr', '.hta', '.cpl', '.inf', '.lnk', '.sh',
    '.php', '.asp', '.aspx', '.jsp', '.cgi', '.py', '.rb', '.pl'
];
const isFileSafe = (file) => {
    const name = file.name.toLowerCase();
    for (const ext of BLOCKED_EXTENSIONS) {
        if (name.endsWith(ext)) return false;
    }
    if (name.includes('../') || name.includes('..\\') || name.includes('/') || name.includes('\\')) return false;
    if (file.size > 20 * 1024 * 1024) return false;
    return true;
};
const safeFileName = (name) => {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.\./g, '_').substring(0, 200);
};

// ===== file notify on sidebar =====
const updateFileBadge = () => {
    const badge = document.getElementById('emp-nav-file-badge');
    if (!badge) return;

    if (!currentUser || currentUser.role !== 'employee') {
        badge.style.display = 'none';
        return;
    }

    const notices = (DB.fileNotices || []).filter(n => n.isActive);
    if (notices.length > 0) {
        badge.textContent = notices.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
};
const updateNotificationBadge = () => {
    const unread = (DB.notifications || []).filter(n => !n.isRead).length;
    // 找导航栏里的通知图标更新数字，按你的导航结构来
    const badge = document.getElementById('notif-badge');
    if (badge) {
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }
};

// pagination
const buildPagination = (totalItems, currentPage, pageSize, goFn, changeFn, opts = {}) => {
    if (totalItems <= 0) return '';
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const start = (currentPage - 1) * pageSize;
    const showTo = Math.min(start + pageSize, totalItems);
    const label = opts.label || 'entries';
    const sizes = opts.sizes || [5, 10, 25];

    const maxV = 5, stP = Math.max(1, currentPage - Math.floor(maxV/2)), enP = Math.min(totalPages, stP + maxV - 1);
    const adjSt = enP - stP < maxV - 1 ? Math.max(1, enP - maxV + 1) : stP;

    let btns = `<button onclick="${goFn}(1)" ${currentPage===1?'disabled':''}>&laquo;</button>
                <button onclick="${goFn}(${currentPage-1})" ${currentPage===1?'disabled':''}>&lsaquo;</button>`;
    for (let p = adjSt; p <= enP; p++) btns += `<button onclick="${goFn}(${p})" class="${p===currentPage?'active':''}">${p}</button>`;
    btns += `<button onclick="${goFn}(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>&rsaquo;</button>
             <button onclick="${goFn}(${totalPages})" ${currentPage===totalPages?'disabled':''}>&raquo;</button>`;

    const sizeOpts = sizes.map(s => `<option value="${s}"${pageSize===s?' selected':''}>${s}</option>`).join('');

    return `<div class="pagination">
        <div class="pagination-info">Showing ${start+1} to ${showTo} of ${totalItems} ${label}</div>
        <div style="display:flex;align-items:center;gap:20px">
            <div class="pagination-size"><label>Show</label>
                <select onchange="${changeFn}(this.value)">${sizeOpts}</select></div>
            <div class="pagination-controls">${btns}</div>
        </div></div>`;
};