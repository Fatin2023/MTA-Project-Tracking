// ==========================================================
//   FILE NOTICE FLOATING BUTTON + MODAL (Employee)
// ==========================================================

let _noticesDismissed = true;

const renderNoticeBanners = () => {
    const btn = document.getElementById('notice-float-btn');
    if (!btn) return;

    // Don't show if modal is open
    const overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.classList.contains('active')) {
        btn.style.display = 'none';
        return;
    }

    if (!currentUser || currentUser.role !== 'employee') {
        btn.style.display = 'none';
        return;
    }

    const allItems = getCombinedNotices();
    const totalCount = allItems.length;
    const unreadCount = allItems.filter(n => !n.isRead).length;

    if (totalCount === 0) {
        btn.style.display = 'none';
        return;
    }

    const badgeCount = unreadCount > 0 ? unreadCount : totalCount;

    if (_noticesDismissed) {
        btn.style.display = 'block';
        btn.innerHTML = `
        <div onclick="_noticesDismissed=false;renderNoticeBanners()" style="width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;position:relative" onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.3)'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.2)'">
            <span style="font-size:1.4rem;color:var(--bg)">&#128227;</span>
            <span style="position:absolute;top:-4px;right:-4px;background:${unreadCount > 0 ? '#ef4444' : 'var(--accent)'};color:#fff;font-size:.65rem;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)">${badgeCount}</span>
        </div>`;
        return;
    }

    btn.style.display = 'block';
    btn.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:14px 18px;box-shadow:0 8px 32px rgba(0,0,0,.15);max-width:320px;width:320px;animation:slideInRight .3s ease">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:1rem">&#128227;</span>
                    <span style="font-size:.88rem;font-weight:600;color:var(--main-text)">Notifications</span>
                    <span style="font-size:.7rem;color:var(--main-text3);background:var(--main-border);padding:1px 7px;border-radius:10px">${totalCount}</span>
                    ${unreadCount > 0 ? `<span style="font-size:.65rem;color:#fff;background:#ef4444;padding:1px 7px;border-radius:10px;font-weight:600">${unreadCount} new</span>` : ''}
                </div>
                <button onclick="event.stopPropagation();_noticesDismissed=true;renderNoticeBanners()" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--main-text3);padding:2px 6px;border-radius:4px;transition:all .15s" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--main-text3)'" title="Close">&#10005;</button>
            </div>
            ${allItems.slice(0, 3).map(n => `
                <div style="padding:8px 0;border-top:1px solid var(--main-border);cursor:pointer;${!n.isRead ? 'background:rgba(245,158,11,.04);margin:0 -18px;padding-left:18px;padding-right:18px;' : ''}" onclick="event.stopPropagation();${n.source === 'task' && !n.isRead ? 'markNotifRead(' + n.notifId + ')' : ''};_noticesDismissed=true;showNoticeModal()">
                    <div style="display:flex;align-items:center;gap:6px">
                        ${!n.isRead ? '<span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>' : ''}
                        <span style="font-weight:600;font-size:.84rem;color:var(--main-text)">${esc(n.title)}</span>
                    </div>
                    ${n.message ? `<div style="font-size:.8rem;color:var(--main-text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.message)}</div>` : ''}
                    <div style="font-size:.7rem;color:var(--main-text3);margin-top:4px">${n.source === 'task' ? '📋 File Task' : '📢 Announcement'} · ${formatDateTimeDMY(n.dateTime)}</div>
                </div>`).join('')}
            ${totalCount > 3 ? `<div style="font-size:.78rem;color:var(--accent);text-align:center;padding-top:8px;cursor:pointer" onclick="event.stopPropagation();_noticesDismissed=true;showNoticeModal()">View all ${totalCount} notifications →</div>` : ''}
        </div>
        <div onclick="_noticesDismissed=true;showNoticeModal()" style="width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;position:relative" onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.3)'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.2)'">
            <span style="font-size:1.4rem;color:var(--bg)">&#128227;</span>
            <span style="position:absolute;top:-4px;right:-4px;background:${unreadCount > 0 ? '#ef4444' : 'var(--accent)'};color:#fff;font-size:.65rem;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)">${badgeCount}</span>
        </div>
    </div>`;

    clearTimeout(window._noticeAutoCollapse);
    window._noticeAutoCollapse = setTimeout(() => {
        _noticesDismissed = true;
        renderNoticeBanners();
    }, 8000);

    updateFileBadge();
};

// Shared function to build combined notice list
const getCombinedNotices = () => {
    const fileNotices = (DB.fileNotices || []).filter(n => n.isActive);
    const taskNotifs = (DB.notifications || []).filter(n => n.type === 'file_task' || n.type === 'file_task_reminder');

    const fileTasks = DB.fileTasks || [];
    const myMemberId = currentUser ? currentUser.memberId : null;
    const submittedTaskIds = new Set();
    if (myMemberId) {
        fileTasks.forEach(t => {
            const mySub = (t.submissions || []).find(s => s.memberId === myMemberId);
            if (mySub) submittedTaskIds.add(t.id);
        });
    }

    const filteredTaskNotifs = taskNotifs.filter(n => {
        const task = fileTasks.find(t => t.id === n.relatedId);  // camelCase
        if (!task || !task.isActive) return false;
        if (submittedTaskIds.has(n.relatedId)) return false;     // camelCase
        return true;
    });

    const allItems = [
        ...fileNotices.map(n => ({
            id: 'fn-' + n.id,
            notifId: null,
            title: n.title,
            message: n.message || '',
            date: n.createdAt ? n.createdAt.slice(0, 10) : null,
            dateTime: n.createdAt || null,
            isRead: true,
            isPersonal: n.targetType === 'multiple',
            source: 'notice'
        })),
        ...filteredTaskNotifs.map(n => ({
            id: 'tn-' + n.id,
            notifId: n.id,
            title: n.title,
            message: n.message || '',
            date: n.createdAt ? n.createdAt.slice(0, 10) : null,   // camelCase
            dateTime: n.createdAt || null,                           // camelCase
            isRead: n.isRead,                                        // camelCase
            source: 'task',
            relatedId: n.relatedId                                   // camelCase
        }))
    ];

    allItems.sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
    return allItems;
};

const formatDateTimeDMY = (dt) => {
    if (!dt) return '—';
    var d = new Date(dt);
    var day = String(d.getDate()).padStart(2, '0');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var month = months[d.getMonth()];
    var year = d.getFullYear();
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var hour = h % 12 || 12;
    var min = String(d.getMinutes()).padStart(2, '0');
    return day + ' ' + month + ' ' + year + ', ' + hour + ':' + min + ' ' + ampm;
};

const markNotifRead = async (notifId) => {
    try {
        await api('/notifications/' + notifId + '/read', { method: 'PUT' });
        const n = (DB.notifications || []).find(x => x.id === notifId);
        if (n) n.isRead = true;  // camelCase
        renderNoticeBanners();
    } catch (e) { /* ignore */ }
};

let _empNoticeModalPage = 1, _empNoticeModalPageSize = 5;

const showNoticeModal = (page) => {
    if (page !== undefined) _empNoticeModalPage = page;

    const allItems = getCombinedNotices();
    const totalCount = allItems.length;
    const unreadCount = allItems.filter(n => !n.isRead).length;

    const totalPages = Math.ceil(totalCount / _empNoticeModalPageSize) || 1;
    if (_empNoticeModalPage > totalPages) _empNoticeModalPage = totalPages;
    if (_empNoticeModalPage < 1) _empNoticeModalPage = 1;
    const start = (_empNoticeModalPage - 1) * _empNoticeModalPageSize;
    const pageItems = allItems.slice(start, start + _empNoticeModalPageSize);

    const cards = pageItems.map(n => {
        const borderColor = n.source === 'task' ? '#f59e0b' : 'var(--accent)';
        const bgOpacity = !n.isRead ? '.08' : '.03';
        const icon = n.source === 'task' ? '&#128203;' : '&#128227;';
        const sourceLabel = n.source === 'task' ? 'File Task' : 'Announcement';
        const readDot = !n.isRead ? '<span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>' : '';
        const onclick = n.source === 'task' && !n.isRead && n.notifId ? `onclick="markNotifRead(${n.notifId})"` : '';

        // ✅ X 按钮
        const deleteBtn = n.notifId && n.source !== 'task'
            ? `<button onclick="event.stopPropagation();deleteNotification(${n.notifId})" style="background:none;border:none;color:var(--main-text3);cursor:pointer;font-size:1rem;padding:4px;border-radius:4px;flex-shrink:0;transition:color .2s" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--main-text3)'">&times;</button>`
            : '';

        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:rgba(245,158,11,${bgOpacity});border-left:3px solid ${borderColor};border-radius:var(--radius)" ${onclick}>
            <span style="font-size:1.2rem;flex-shrink:0;margin-top:1px">${icon}</span>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px">
                    ${readDot}
                    <div style="font-weight:600;font-size:.9rem;color:var(--main-text)">${esc(n.title)}</div>
                </div>
                ${n.message ? `<div style="font-size:.84rem;color:var(--main-text2);margin-top:6px;line-height:1.6">${esc(n.message)}</div>` : ''}
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                    <span style="font-size:.72rem;color:var(--main-text3)">${sourceLabel}</span>
                    ${n.isPersonal ? '<span style="font-size:.72rem;color:var(--main-text3)">· Personal</span>' : ''}
                    <span style="font-size:.72rem;color:var(--main-text3)">· ${formatDateTimeDMY(n.dateTime)}</span>
                </div>
            </div>
            ${deleteBtn}
        </div>`;
    }).join('');

    const pagHtml = buildPagination(totalCount, _empNoticeModalPage, _empNoticeModalPageSize,
        'goEmpNoticeModalPage', 'changeEmpNoticeModalPageSize',
        { label: 'notifications', sizes: [3, 5, 10, 25] });

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.2rem">&#128227;</span>
                <h3 style="margin:0">Notifications</h3>
                <span style="font-size:.72rem;color:var(--main-text3);background:var(--main-border);padding:1px 8px;border-radius:10px">${totalCount}</span>
                ${unreadCount > 0 ? `<span style="font-size:.65rem;color:#fff;background:#ef4444;padding:1px 8px;border-radius:10px;font-weight:600">${unreadCount} unread</span>` : ''}
            </div>
            ${totalCount > 0 ? `<button onclick="clearAllNotifications()" style="background:none;border:1px solid #ef4444;color:#ef4444;cursor:pointer;font-size:.75rem;padding:4px 12px;border-radius:var(--radius);transition:all .2s" onmouseover="this.style.background='#ef4444';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='#ef4444'">Clear All</button>` : ''}
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            ${totalCount === 0
        ? '<div style="text-align:center;padding:40px 0;color:var(--main-text3)">No notifications</div>'
        : `<div style="display:flex;flex-direction:column;gap:12px">${cards}</div>`
    }
            ${pagHtml}
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns">
            <button class="btn btn-ghost" onclick="_noticesDismissed=true;renderNoticeBanners();hideModal()">Close</button>
        </div>
    </div>`);
};

const deleteNotification = async (notifId) => {
    try {
        await api('/notifications/' + notifId, { method: 'DELETE' });
        // ✅ new reload from server
        DB.notifications = await api('/notifications');
        showNoticeModal(_empNoticeModalPage);
        renderNoticeBanners();
    } catch (err) {
        console.error('Delete notification failed:', err);
    }
};

const clearAllNotifications = async () => {
    if (!confirm('Clear all notifications?')) return;
    try {
        await api('/notifications/member/me', { method: 'DELETE' });
        DB.notifications = await api('/notifications');

        const activeNotices = (DB.fileNotices || []).filter(n => n.isActive);
        if (activeNotices.length > 0) {
            alert('Active announcements cannot be cleared.');
        }

        showNoticeModal(1);
        renderNoticeBanners();
    } catch (err) {
        console.error('Clear notifications failed:', err);
    }
};

const goEmpNoticeModalPage = page => {
    const allItems = getCombinedNotices();
    const totalPages = Math.ceil(allItems.length / _empNoticeModalPageSize) || 1;
    _empNoticeModalPage = Math.max(1, Math.min(page, totalPages));
    showNoticeModal(_empNoticeModalPage);
};

const changeEmpNoticeModalPageSize = size => {
    _empNoticeModalPageSize = parseInt(size);
    _empNoticeModalPage = 1;
    showNoticeModal(1);
};