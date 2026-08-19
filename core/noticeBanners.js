// ==========================================================
//   FILE NOTICE FLOATING BUTTON + MODAL (Employee)
// ==========================================================

let _noticesDismissed = true;

const renderNoticeBanners = () => {
    const btn = document.getElementById('notice-float-btn');
    if (!btn) return;

    // Admin 或未登录不显示
    if (!currentUser || currentUser.role !== 'employee') {
        btn.style.display = 'none';
        return;
    }

    const notices = (DB.fileNotices || []).filter(n => n.isActive);

    if (notices.length === 0) {
        btn.style.display = 'none';
        return;
    }

    if (_noticesDismissed) {
        btn.style.display = 'block';
        btn.innerHTML = `
        <div onclick="_noticesDismissed=false;renderNoticeBanners()" style="width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;position:relative" onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.3)'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.2)'">
            <span style="font-size:1.4rem;color:var(--bg)">&#128227;</span>
            <span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:.65rem;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)">${notices.length}</span>
        </div>`;
        return;
    }

    // Not dismissed yet — show small popup preview + button
    btn.style.display = 'block';
    btn.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <!-- Preview card -->
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:14px 18px;box-shadow:0 8px 32px rgba(0,0,0,.15);max-width:320px;width:320px;animation:slideInRight .3s ease">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:1rem">&#128227;</span>
                    <span style="font-size:.88rem;font-weight:600;color:var(--main-text)">Announces</span>
                    <span style="font-size:.7rem;color:var(--main-text3);background:var(--main-border);padding:1px 7px;border-radius:10px">${notices.length}</span>
                </div>
                <button onclick="event.stopPropagation();_noticesDismissed=true;renderNoticeBanners()" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--main-text3);padding:2px 6px;border-radius:4px;transition:all .15s" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--main-text3)'" title="Close">&#10005;</button>
            </div>
            ${notices.slice(0, 2).map(n => `
                <div style="padding:8px 0;border-top:1px solid var(--main-border);cursor:pointer" onclick="event.stopPropagation();showNoticeModal()">
                    <div style="font-weight:600;font-size:.84rem;color:var(--main-text)">${esc(n.title)}</div>
                    ${n.message ? `<div style="font-size:.8rem;color:var(--main-text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.message)}</div>` : ''}
                    <div style="font-size:.7rem;color:var(--main-text3);margin-top:4px">${formatDateDMY(n.createdAt ? n.createdAt.slice(0,10) : null)}</div>
                </div>`).join('')}
            ${notices.length > 2 ? `<div style="font-size:.78rem;color:var(--accent);text-align:center;padding-top:8px;cursor:pointer" onclick="event.stopPropagation();showNoticeModal()">View all ${notices.length} announces →</div>` : ''}
        </div>
        <!-- Circle button -->
        <div onclick="showNoticeModal()" style="width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;position:relative" onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.3)'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 16px rgba(0,0,0,.2)'">
            <span style="font-size:1.4rem;color:var(--bg)">&#128227;</span>
            <span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:.65rem;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)">${notices.length}</span>
        </div>
    </div>`;

    // Auto collapse after 8 seconds
    clearTimeout(window._noticeAutoCollapse);
    window._noticeAutoCollapse = setTimeout(() => {
        _noticesDismissed = true;
        renderNoticeBanners();
    }, 8000);

    updateFileBadge();
};

//modal
let _empNoticeModalPage = 1, _empNoticeModalPageSize = 5;

const showNoticeModal = (page) => {
    if (page !== undefined) _empNoticeModalPage = page;
    const allNotices = (DB.fileNotices || []).filter(n => n.isActive);

    const totalPages = Math.ceil(allNotices.length / _empNoticeModalPageSize) || 1;
    if (_empNoticeModalPage > totalPages) _empNoticeModalPage = totalPages;
    if (_empNoticeModalPage < 1) _empNoticeModalPage = 1;
    const start = (_empNoticeModalPage - 1) * _empNoticeModalPageSize;
    const notices = allNotices.slice(start, start + _empNoticeModalPageSize);

    const cards = notices.map(n => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:rgba(245,158,11,.06);border-left:3px solid #f59e0b;border-radius:var(--radius)">
            <span style="font-size:1.2rem;flex-shrink:0;margin-top:1px">&#128227;</span>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.9rem;color:var(--main-text)">${esc(n.title)}</div>
                ${n.message ? `<div style="font-size:.84rem;color:var(--main-text2);margin-top:6px;line-height:1.6">${esc(n.message)}</div>` : ''}
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                    ${n.targetType === 'multiple' ? '<span style="font-size:.72rem;color:var(--main-text3)">Personal Announces</span>' : ''}
                    <span style="font-size:.72rem;color:var(--main-text3)">${formatDateDMY(n.createdAt ? n.createdAt.slice(0,10) : null)}</span>
                </div>
            </div>
        </div>`).join('');

    const pagHtml = buildPagination(allNotices.length, _empNoticeModalPage, _empNoticeModalPageSize,
        'goEmpNoticeModalPage', 'changeEmpNoticeModalPageSize',
        { label: 'notices', sizes: [3, 5, 10, 25] });

    showModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.2rem">&#128227;</span>
            <h3 style="margin:0">Announces</h3>
            <span style="font-size:.72rem;color:var(--main-text3);background:var(--main-border);padding:1px 8px;border-radius:10px">${allNotices.length}</span>
        </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
        ${cards}
    </div>
    ${pagHtml}
    <div class="btns" style="margin-top:16px">
        <button class="btn btn-ghost" onclick="_noticesDismissed=true;renderNoticeBanners();hideModal()">Close</button>
    </div>`);
};

const goEmpNoticeModalPage = page => {
    const total = (DB.fileNotices || []).filter(n => n.isActive).length;
    const totalPages = Math.ceil(total / _empNoticeModalPageSize) || 1;
    _empNoticeModalPage = Math.max(1, Math.min(page, totalPages));
    showNoticeModal(_empNoticeModalPage);
};

const changeEmpNoticeModalPageSize = size => {
    _empNoticeModalPageSize = parseInt(size);
    _empNoticeModalPage = 1;
    showNoticeModal(1);
};