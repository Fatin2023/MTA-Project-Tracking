/* ==========================================================
   SECTION 6: Work Category/MAIN SCOPE
   ========================================================== */
let activeCategoryId = null, itemSearchQuery = '', itemCurrentPage = 1, itemPageSize = 10, itemStatusSelected = [];

const getProjectCountdown = p => {
    if (!p.endDate) return null;
    const t = new Date(); t.setHours(0,0,0,0);
    const e = new Date(p.endDate); e.setHours(0,0,0,0);
    return Math.ceil((e - t) / 86400000);
};

const buildCheckboxes = (list, selIds, showExtra) => list.map(i => {
    const chk = selIds.includes(i.id) ? 'checked' : '';
    const extra = showExtra ? ` <span style="color:var(--main-text3);font-size:.76rem">(${esc(getPositionName(i.positionId))} · ${esc(getDeptName(i.departmentId))})</span>` : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)"><input type="checkbox" value="${i.id}" ${chk} style="accent-color:var(--accent);width:15px;height:15px">${esc(i.name)}${extra}</label>`;
}).join('');

const toggleCatMenu = () => { const d = document.getElementById('cat-dropdown'); if(d) d.style.display = d.style.display==='flex'?'none':'flex'; };
const closeCatMenu = () => { const d = document.getElementById('cat-dropdown'); if(d) d.style.display='none'; };
document.addEventListener('mousedown', e => { if(!e.target.closest('.cat-dropdown') && !e.target.closest('.tab-more-btn')) closeCatMenu(); });

// ── 只更新 tabs 栏（无动画） ──
const renderScopeTabs = () => {
    const tabsBar = document.querySelector('#admin-projects .tabs-bar');
    if (!tabsBar) return;
    const vScopeIds = getViewerVisibleScopeIds();
    const visibleScopes = vScopeIds ? DB.scopes.filter(s => vScopeIds.includes(s.id)) : DB.scopes;
    const allProjects = vScopeIds ? DB.projects.filter(p => p.categoryId && vScopeIds.includes(p.categoryId)) : DB.projects;
    const catCounts = allProjects.reduce((acc, p) => { const c = p.categoryId || '__none__'; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const allCount = allProjects.length;
    const allTab = `<div class="tab-item${!activeCategoryId ? ' active' : ''}" onclick="switchScopeTab(null)">All <span class="tab-count">${allCount}</span></div>`;
    const tabs = visibleScopes.map(s => `<div class="tab-item${activeCategoryId === s.id ? ' active' : ''}" onclick="switchScopeTab(${s.id})">${esc(s.name)} <span class="tab-count">${catCounts[s.id] || 0}</span></div>`).join('');
    const activeScope = activeCategoryId ? visibleScopes.find(s => s.id === activeCategoryId) : null;
    let dotsHtml = '';
    if (activeScope && canEdit()) {
        dotsHtml = `<div style="position:relative;display:inline-flex;align-items:center">
            <button class="tab-more-btn" onclick="event.stopPropagation();toggleCatMenu()">&#8942;</button>
            <div id="cat-dropdown" class="cat-dropdown">
                <div class="cat-dropdown-item" onclick="closeCatMenu();showEditCategory(${activeScope.id})">&#9998; Edit</div>
                <div class="cat-dropdown-item danger" onclick="closeCatMenu();confirmDeleteCategory(${activeScope.id})">&#10005; Delete</div>
            </div>
        </div>`;
    }
    tabsBar.innerHTML = `${allTab}${tabs}${dotsHtml}${canEdit() ? '<button class="btn btn-accent" onclick="showAddCategory()">+ Add Category</button>' : ''}`;

    // 更新 label
    const labelEl = document.querySelector('#admin-projects .section-head h2');
    if (labelEl) labelEl.textContent = activeScope ? activeScope.name : 'All';

    // 更新右侧按钮
    const btnArea = document.querySelector('#admin-projects .action-btns-area');
    if (btnArea) {
        const importBtn = activeCategoryId && canEdit() ? `<a class="btn btn-accent btn-sm" href="/api/template/projects/${activeCategoryId}" style="text-decoration:none">Template</a><label class="btn btn-blue btn-sm" style="cursor:pointer">Import Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="adminHandleItemImport(this)"></label>` : '';
        const addBtn = canEdit() ? '<button class="btn btn-green" onclick="showAddItem()">+ Add Item</button>' : '';
        btnArea.innerHTML = `${importBtn}${addBtn}`;
    }
    window._viewerVisibleProjectIds = vScopeIds ? allProjects.map(p => p.id) : null;
};

// ── 首次进入页面（有动画） ──
let scopeRenderLock = false;
const renderMainScope = () => {
    if (scopeRenderLock) return;
    scopeRenderLock = true;

    const view = document.getElementById('admin-projects');
    const vScopeIds = getViewerVisibleScopeIds();
    const visibleScopes = vScopeIds ? DB.scopes.filter(s => vScopeIds.includes(s.id)) : DB.scopes;
    const allProjects = vScopeIds ? DB.projects.filter(p => p.categoryId && vScopeIds.includes(p.categoryId)) : DB.projects;

    const catCounts = allProjects.reduce((acc, p) => {
        const c = p.categoryId || '__none__';
        acc[c] = (acc[c] || 0) + 1;
        return acc;
    }, {});
    const allCount = allProjects.length;
    const allTab = `<div class="tab-item${!activeCategoryId ? ' active' : ''}" onclick="switchScopeTab(null)">All <span class="tab-count">${allCount}</span></div>`;
    const tabs = visibleScopes.map(s => `<div class="tab-item${activeCategoryId === s.id ? ' active' : ''}" onclick="switchScopeTab(${s.id})">${esc(s.name)} <span class="tab-count">${catCounts[s.id] || 0}</span></div>`).join('');

    const activeScope = activeCategoryId ? visibleScopes.find(s => s.id === activeCategoryId) : null;
    let dotsHtml = '';
    if (activeScope && canEdit()) {
        dotsHtml = `<div style="position:relative;display:inline-flex;align-items:center">
            <button class="tab-more-btn" onclick="event.stopPropagation();toggleCatMenu()">&#8942;</button>
            <div id="cat-dropdown" class="cat-dropdown">
                <div class="cat-dropdown-item" onclick="closeCatMenu();showEditCategory(${activeScope.id})">&#9998; Edit</div>
                <div class="cat-dropdown-item danger" onclick="closeCatMenu();confirmDeleteCategory(${activeScope.id})">&#10005; Delete</div>
            </div>
        </div>`;
    }

    const activeLabel = activeScope ? esc(activeScope.name) : 'All';

    window._viewerVisibleProjectIds = vScopeIds ? allProjects.map(p => p.id) : null;

    view.innerHTML = `
    <div class="app-header">
        <div><h2>Work Category</h2><div class="header-sub">Manage work categories and items</div></div>
    </div>
    <div class="app-body">
        <div class="pt-anim-filter tabs-wrapper">
            <div class="tabs-bar">
                ${allTab}${tabs}${dotsHtml}
                ${canEdit() ? '<button class="btn btn-accent" onclick="showAddCategory()">+ Add Category</button>' : ''}
            </div>
        </div>

        <div class="pt-anim-filter filter">
            <input class="input" id="item-search" placeholder="Search all columns..." value="${esc(itemSearchQuery)}" oninput="itemSearchChanged()" style="max-width:320px">
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Start</label><input type="date" class="input" id="item-filter-start" onchange="itemDateChanged()" style="width:130px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">End</label><input type="date" class="input" id="item-filter-end" onchange="itemDateChanged()" style="width:130px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Inst From</label><input type="date" class="input" id="item-filter-inst-from" onchange="itemInstDateChanged()" style="width:130px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="item-filter-inst-to" onchange="itemInstDateChanged()" style="width:130px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="min-width:140px">${msGenerate('item-filter-status', STATUS_OPTS, 'All Status')}</div>
            <button class="btn btn-ghost btn-sm" onclick="resetItemFilters()">Reset</button>
            <span id="item-count" style="font-size:.82rem;color:var(--main-text3)"></span>
        </div>

        <div class="pt-anim-head section-head">
            <h2>${activeLabel}</h2>
            <div class="action-btns-area" style="display:flex;gap:6px;flex-wrap:wrap">
                ${activeCategoryId && canEdit() ?
                    `<a class="btn btn-accent btn-sm" href="/api/template/projects/${activeCategoryId}" style="text-decoration:none">Template</a>
                    <label class="btn btn-blue btn-sm" style="cursor:pointer">Import Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="adminHandleItemImport(this)"></label>`
                    : ''}
                ${canEdit() ? '<button class="btn btn-green" onclick="showAddItem()">+ Add Item</button>' : ''}
            </div>
        </div>

        <div class="pt-anim-table">
            <div id="items-table-area"></div>
        </div>
    </div>`;

    msOnChange('item-filter-status', () => {
        itemStatusSelected = msGetTextValues('item-filter-status').filter(v => v != null && v !== '');
        itemCurrentPage = 1;
        renderItemsTable();
    });

    setTimeout(() => {
        renderItemsTable();
    }, 250);

    setTimeout(() => {
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 550);

    setTimeout(() => { scopeRenderLock = false; }, 550);
};

// ── 切 tab（无动画，只刷 tabs + 表格） ──
const switchScopeTab = (catId) => { activeCategoryId = catId; itemSearchQuery = ''; itemCurrentPage = 1; renderScopeTabs(); renderItemsTable(); };

// ── 筛选/翻页（无动画） ──
const itemDateChanged = () => {
    const f = document.getElementById('item-filter-start').value, t = document.getElementById('item-filter-end').value;
    if(f) document.getElementById('item-filter-end').min = f;
    if(f && t && t<f) document.getElementById('item-filter-end').value = f;
    itemCurrentPage = 1; renderItemsTable();
};
const itemInstDateChanged = () => {
    const f = document.getElementById('item-filter-inst-from').value, t = document.getElementById('item-filter-inst-to').value;
    if(f) document.getElementById('item-filter-inst-to').min = f;
    if(f && t && t<f) document.getElementById('item-filter-inst-to').value = f;
    itemCurrentPage = 1; renderItemsTable();
};
const resetItemFilters = () => {
    itemSearchQuery = '';
    document.getElementById('item-search').value = '';
    document.getElementById('item-filter-start').value = '';
    document.getElementById('item-filter-end').value = '';
    document.getElementById('item-filter-inst-from').value = '';
    document.getElementById('item-filter-inst-to').value = '';
    itemStatusSelected = [];
    msClear('item-filter-status');
    itemCurrentPage = 1; renderItemsTable();
};
const itemSearchChanged = () => { itemSearchQuery = document.getElementById('item-search').value.trim().toLowerCase(); itemCurrentPage = 1; renderItemsTable(); };

const getFilteredItems = () => {
    let items = window._viewerVisibleProjectIds ? DB.projects.filter(p => window._viewerVisibleProjectIds.includes(p.id)) : DB.projects;
    if (activeCategoryId) items = items.filter(p => p.categoryId === activeCategoryId);

    if (itemSearchQuery) {
        const q = itemSearchQuery;
        items = items.filter(p => {
            const cat = p.categoryId ? DB.scopes.find(s => s.id === p.categoryId) : null;
            return [p.name, p.customer, cat?.name||'', p.startDate||'', p.endDate||'', p.installDate||'',
                formatDateDMY(p.startDate), formatDateDMY(p.endDate), formatDateDMY(p.installDate), p.status||'']
                .map(v => String(v).toLowerCase()).join(' ').includes(q);
        });
    }

    const f1 = document.getElementById('item-filter-start')?.value, f2 = document.getElementById('item-filter-end')?.value;
    if (f1 || f2) items = items.filter(p => { const d = p.startDate?.slice(0,10); return d && (!f1 || d>=f1) && (!f2 || d<=f2); });
    const i1 = document.getElementById('item-filter-inst-from')?.value, i2 = document.getElementById('item-filter-inst-to')?.value;
    if (i1 || i2) items = items.filter(p => { const d = p.installDate?.slice(0,10); return d && (!i1 || d>=i1) && (!i2 || d<=i2); });
    if (itemStatusSelected.length) items = items.filter(p => itemStatusSelected.includes((p.status||'pending').toLowerCase()));

    return items;
};

// ── 只刷新表格（无动画） ──
const renderItemsTable = () => {
    const allItems = getFilteredItems();
    const totalPages = Math.ceil(allItems.length / itemPageSize) || 1;
    if (itemCurrentPage > totalPages) itemCurrentPage = totalPages;
    if (itemCurrentPage < 1) itemCurrentPage = 1;
    const start = (itemCurrentPage-1)*itemPageSize, end = start+itemPageSize, page = allItems.slice(start, end);
    const countEl = document.getElementById('item-count'); if(countEl) countEl.textContent = `${allItems.length} item${allItems.length!==1?'s':''}`;

    const rows = allItems.length === 0
        ? '<tr><td colspan="12" style="text-align:center;color:var(--main-text3);padding:30px">No items found</td></tr>'
        : page.map((p, idx) => {
            const cat = p.categoryId ? DB.scopes.find(s => s.id===p.categoryId) : null;
            const mems = getProjectMembers(p.id), mc = mems.length, cost = getProjectCost(p.id), cd = getProjectCountdown(p);
            let cdHtml = '\u2014';
            if (cd !== null) {
                if (cd > 30) cdHtml = `<span style="color:var(--ok);font-weight:600">${cd}d left</span>`;
                else if (cd > 7) cdHtml = `<span style="color:var(--warning);font-weight:600">${cd}d left</span>`;
                else if (cd > 0) cdHtml = `<span style="color:var(--danger);font-weight:600">${cd}d left</span>`;
                else if (cd === 0) cdHtml = `<span style="color:var(--warning);font-weight:600">Today!</span>`;
                else cdHtml = `<span style="color:var(--danger);font-weight:600">${Math.abs(cd)}d overdue</span>`;
            }
            let memHtml = '';
            if (mc > 0) {
                const show = mems.slice(0,4);
                memHtml = show.map(m => `<span class="badge badge-employee" style="font-size:.72rem;padding:2px 6px">${esc(m.name.split(' ')[0])}</span>`).join(' ');
                if (mc > 4) memHtml += ` <span style="font-size:.75rem;color:var(--main-text3)">+${mc-4}</span>`;
            } else memHtml = '<span style="font-size:.8rem;color:var(--main-text3)">None</span>';

            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3);width:50px">${start+idx+1}</td>
                <td><div style="font-weight:600;cursor:pointer" onclick="showEditItem(${p.id})">${esc(p.name)}</div></td>
                <td>${esc(p.customer||'\u2014')}</td>
                <td>${cat ? `<span class="badge badge-scope">${esc(cat.name)}</span>` : '<span style="color:var(--main-text3)">\u2014</span>'}</td>
                <td style="font-family:var(--font-m);font-size:.82rem">${formatDateDMY(p.startDate)}</td>
                <td style="font-family:var(--font-m);font-size:.82rem">${formatDateDMY(p.endDate)}</td>
                <td style="font-family:var(--font-m);font-size:.82rem">${formatDateDMY(p.installDate)}</td>
                <td>${statusBadge(p.status)}</td>
                <td>${cdHtml}</td>
                <td>${memHtml}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtCost(cost)}</td>
                <td>${canEdit() ? `<div class="actions-cell"><button class="btn-icon" onclick="showEditItem(${p.id})" title="Edit">&#9998;</button><button class="btn-icon danger" onclick="confirmDeleteItem(${p.id})" title="Delete">&#10005;</button></div>` : ''}</td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(allItems.length, itemCurrentPage, itemPageSize,
    'goItemPage', 'changeItemPageSize',
    { label: 'items', sizes: [5, 10, 25, 50, 100] });

    document.getElementById('items-table-area').innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th style="width:50px">No</th><th>ID / Name</th><th>Customer</th><th style="width:130px">Category</th><th style="width:100px">Start</th><th style="width:100px">End</th><th style="width:100px">Install</th><th style="width:110px">Status</th><th style="width:100px">Countdown</th><th>Members</th><th style="width:100px;text-align:right">Cost</th><th style="width:90px">Actions</th></tr></thead>
        <tbody>${rows}</tbody></table></div>${pagHtml}`;
};

const goItemPage = p => { const tp = Math.ceil(getFilteredItems().length/itemPageSize)||1; itemCurrentPage = p<1?1:p>tp?tp:p; renderItemsTable(); };
const changeItemPageSize = s => { itemPageSize = parseInt(s); itemCurrentPage = 1; renderItemsTable(); };

// ── Import ──
let adminImportBase64 = null, adminImportFilename = '';
const adminHandleItemImport = input => {
    const file = input.files[0]; if (!file) return;
    const catId = activeCategoryId || 0, catName = activeCategoryId ? (DB.scopes.find(s => s.id===activeCategoryId)||{}).name : 'All';
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type:'array'});
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
            if (!rows.length) { alert('File is empty'); input.value=''; return; }
            const headers = Object.keys(rows[0]), previewRows = rows.slice(0,5);
            const previewHtml = `<div style="margin-top:10px;font-size:.85rem;color:var(--main-text3)">Preview (${rows.length} rows) — Category: <strong>${esc(catName)}</strong></div>
                <div class="import-preview"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
                ${previewRows.map(r => `<tr>${headers.map(h => `<td>${esc(String(r[h]))}</td>`).join('')}</tr>`).join('')}
                ${rows.length>5 ? `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--main-text3)">... ${rows.length-5} more</td></tr>` : ''}
                </tbody></table></div>`;
            adminImportBase64 = btoa(String.fromCharCode.apply(null, data));
            adminImportFilename = file.name;
            showModal(`<h3>Import Items</h3>${previewHtml}
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
                    <button class="btn btn-ghost" onclick="hideModal();adminImportBase64=null">Cancel</button>
                    <button class="btn btn-accent" onclick="adminDoItemImport()">Import ${rows.length} Rows</button>
                </div>`);
        } catch(err) { alert('Error reading file: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
};

const adminDoItemImport = async () => {
    if (!adminImportBase64) return;
    try {
        const res = await api('/import/projects', { method:'POST', body:{ filename:adminImportFilename, data:adminImportBase64, categoryId:activeCategoryId||0 } });
        hideModal(); adminImportBase64 = null;
        let msg = `Imported: ${res.inserted}, Skipped: ${res.skipped}`;
        if (res.errors?.length) msg += '\n\n' + res.errors.join('\n');
        alert(msg);
        await loadDB(); renderScopeTabs(); renderItemsTable();
    } catch(e) { alert('Import failed: ' + e.message); }
};

// ── Category CRUD（只刷 tabs + 表格，无动画） ──
const showAddCategory = () => {
    const picHtml = buildCheckboxes(DB.members, [], true);
    const deptHtml = buildCheckboxes(DB.departments, [], false);
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>New Category</h3>
            <div class="field"><label>Name</label><input class="input" id="inp-cat-name" placeholder="e.g. Electrical, Mechanical"></div>
            <div style="margin-top:8px"><label style="font-size:.85rem;display:block;margin-bottom:6px">PIC (Can update details)</label>
                <div style="display:flex;gap:6px;margin-bottom:6px">
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#pic-list-add input').forEach(c=>c.checked=true)">All</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#pic-list-add input').forEach(c=>c.checked=false)">Clear</button>
                </div>
                <div id="pic-list-add" style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">${picHtml}</div>
            </div>
            <div style="margin-top:12px"><label style="font-size:.85rem;display:block;margin-bottom:6px">Attendance Access <span style="font-size:.76rem;color:var(--main-text3);font-weight:normal">— Departments that can see this category</span></label>
                <div style="display:flex;gap:6px;margin-bottom:6px">
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#dept-list-add input').forEach(c=>c.checked=true)">All</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#dept-list-add input').forEach(c=>c.checked=false)">Clear</button>
                </div>
                <div id="dept-list-add" style="max-height:150px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">${deptHtml}</div>
                <div style="font-size:.76rem;color:var(--main-text3);margin-top:5px">Clear = all departments can view.</div>
            </div>
            <p class="auth-error" id="cat-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddCategory()">Create</button></div>
    </div>`);
    setTimeout(() => document.getElementById('inp-cat-name').focus(), 100);
};

const doAddCategory = async () => {
    const err = document.getElementById('cat-error');
    const name = document.getElementById('inp-cat-name').value.trim();
    if (!name) { err.textContent = 'Name required'; return; }
    const pics = [...document.querySelectorAll('#pic-list-add input:checked')].map(c => parseInt(c.value));
    const depts = [...document.querySelectorAll('#dept-list-add input:checked')].map(c => parseInt(c.value));
    try { await api('/scopes', { method:'POST', body:{ name, picMemberIds:pics, departmentIds:depts } }); hideModal(); await loadDB(); renderScopeTabs(); renderItemsTable(); }
    catch(e) { err.textContent = 'Failed: ' + e.message; }
};

const showEditCategory = sid => {
    const scope = DB.scopes.find(s => s.id===sid); if (!scope) return;
    const pics = scope.picMemberIds || [], depts = scope.departmentIds || [];
    const picHtml = buildCheckboxes(DB.members, pics, true);
    const deptHtml = buildCheckboxes(DB.departments, depts, false);
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Edit Category</h3>
            <div class="field"><label>Name</label><input class="input" id="inp-cat-edit" value="${esc(scope.name)}"></div>
            <div style="margin-top:8px"><label style="font-size:.85rem;display:block;margin-bottom:6px">PIC (Can update details)</label>
                <div style="display:flex;gap:6px;margin-bottom:6px">
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#pic-list-edit input').forEach(c=>c.checked=true)">All</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#pic-list-edit input').forEach(c=>c.checked=false)">Clear</button>
                </div>
                <div id="pic-list-edit" style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">${picHtml}</div>
            </div>
            <div style="margin-top:12px"><label style="font-size:.85rem;display:block;margin-bottom:6px">Attendance Access <span style="font-size:.76rem;color:var(--main-text3);font-weight:normal">— Departments that can see <strong>${esc(scope.name)}</strong></span></label>
                <div style="display:flex;gap:6px;margin-bottom:6px">
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#dept-list-edit input').forEach(c=>c.checked=true)">All</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#dept-list-edit input').forEach(c=>c.checked=false)">Clear</button>
                </div>
                <div id="dept-list-edit" style="max-height:150px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:4px">${deptHtml}</div>
                <div style="font-size:.76rem;color:var(--main-text3);margin-top:5px">Clear = all departments can view.</div>
            </div>
            <p class="auth-error" id="cat-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditCategory(${sid})">Save</button></div>
    </div>`);
    setTimeout(() => { const el = document.getElementById('inp-cat-edit'); el.focus(); el.select(); }, 100);
};

const doEditCategory = async sid => {
    const err = document.getElementById('cat-error');
    const name = document.getElementById('inp-cat-edit').value.trim();
    if (!name) { err.textContent = 'Name required'; return; }
    const pics = [...document.querySelectorAll('#pic-list-edit input:checked')].map(c => parseInt(c.value));
    const depts = [...document.querySelectorAll('#dept-list-edit input:checked')].map(c => parseInt(c.value));
    try { await api('/scopes/'+sid, { method:'PUT', body:{ name, picMemberIds:pics, departmentIds:depts } }); hideModal(); await loadDB(); renderScopeTabs(); renderItemsTable(); }
    catch(e) { err.textContent = 'Failed: ' + e.message; }
};

const confirmDeleteCategory = sid => {
    const scope = DB.scopes.find(s => s.id===sid); if (!scope) return;
    const cnt = DB.projects.filter(p => p.categoryId===sid).length;
    showModal(`<h3>Delete Category</h3><p style="color:var(--main-text2)">Delete <strong>${esc(scope.name)}</strong>?<br>${cnt} item(s) become uncategorized.</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteCategory(${sid})">Delete</button></div>`);
};
const doDeleteCategory = async sid => { await api('/scopes/'+sid, { method:'DELETE' }); hideModal(); await loadDB(); renderScopeTabs(); renderItemsTable(); };

// ── Item CRUD（只刷表格，无动画） ──
const showAddItem = () => {
    const catOpts = DB.scopes.map(s => `<option value="${s.id}" ${activeCategoryId===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Add Item</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>ID / Name</label><input class="input" id="inp-item-name" placeholder="e.g. PLC-001"></div>
                <div class="field"><label>Customer</label><input class="input" id="inp-item-customer" placeholder="e.g. Petronas"></div>
                <div class="field"><label>Category</label><select class="input" id="inp-item-cat"><option value="">-- None --</option>${catOpts}</select></div>
                <div class="field"><label>Start</label><input class="input" id="inp-item-start" type="date"></div>
                <div class="field"><label>End</label><input class="input" id="inp-item-end" type="date"></div>
                <div class="field"><label>Install</label><input class="input" id="inp-item-install" type="date"></div>
                <div class="field"><label>Status</label><select class="input" id="inp-item-status"><option value="pending">Pending</option><option value="in progress">In Progress</option><option value="completed">Completed</option></select></div>
            </div>
            <p class="auth-error" id="item-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddItem()">Create</button></div>
    </div>`);
    setTimeout(() => document.getElementById('inp-item-name').focus(), 100);
};

const doAddItem = async () => {
    const err = document.getElementById('item-error');
    const name = document.getElementById('inp-item-name').value.trim();
    if (!name) { err.textContent = 'Name required'; return; }
    try {
        await api('/projects', { method:'POST', body: {
            name, categoryId: document.getElementById('inp-item-cat').value ? parseInt(document.getElementById('inp-item-cat').value) : null,
            startDate: document.getElementById('inp-item-start').value || null,
            endDate: document.getElementById('inp-item-end').value || null,
            customer: document.getElementById('inp-item-customer').value.trim() || '',
            installDate: document.getElementById('inp-item-install').value || null
        }});
        hideModal(); await loadDB(); renderItemsTable();
    } catch(e) { err.textContent = 'Failed: ' + e.message; }
};

const showEditItem = pid => {
    const proj = DB.projects.find(p => p.id===pid); if (!proj) return;
    const catOpts = DB.scopes.map(s => `<option value="${s.id}" ${(proj.categoryId||0)===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
    const assigned = getProjectMembers(pid), assignedIds = assigned.map(m => m.id);
    const avail = DB.members.filter(m => !assignedIds.includes(m.id) && !new Set(assignedIds).has(m.id));
    const assignedHtml = assigned.length === 0 ? '<div style="color:var(--main-text3);text-align:center;padding:16px">No members</div>'
        : assigned.map(m => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--main-border)">
            <div><span style="font-weight:500">${esc(m.name)}</span><span style="font-size:.75rem;color:var(--main-text3);margin-left:6px">${esc(getPositionName(m.positionId))}</span>${latestSalary(m)!=null?`<span style="font-size:.75rem;color:var(--main-text3);margin-left:6px">${fmt(latestSalary(m))}</span>`:''}</div>
            <button class="btn-icon danger" onclick="doRemoveFromEdit(${pid},${m.id})">&#10005;</button></div>`).join('');
    const availHtml = avail.length === 0 ? '<div style="color:var(--main-text3);text-align:center;padding:16px">All members assigned</div>'
        : `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius-sm);padding:6px">
            <div style="display:flex;gap:8px;margin-bottom:6px">
                <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-new-list input').forEach(c=>c.checked=true)">All</button>
                <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#assign-new-list input').forEach(c=>c.checked=false)">Clear</button>
            </div>
            <div id="assign-new-list">${avail.map(m => `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;font-size:.84rem;border-bottom:1px solid var(--main-border)"><input type="checkbox" value="${m.id}" style="accent-color:var(--accent);width:15px;height:15px">${esc(m.name)} <span style="color:var(--main-text3);font-size:.76rem">(${esc(getPositionName(m.positionId))}${latestSalary(m)?' — '+fmt(latestSalary(m)):''})</span></label>`).join('')}</div></div>`;
    const cd = getProjectCountdown(proj), cost = getProjectCost(pid);
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>${esc(proj.name)}</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>Name</label><input class="input" id="inp-item-edit" value="${esc(proj.name)}"></div>
                <div class="field"><label>Customer</label><input class="input" id="inp-item-customer-edit" value="${esc(proj.customer||'')}"></div>
                <div class="field"><label>Category</label><select class="input" id="inp-item-cat-edit"><option value="">-- None --</option>${catOpts}</select></div>
                <div class="field"><label>Start</label><input class="input" id="inp-item-start-edit" type="date" value="${proj.startDate||''}"></div>
                <div class="field"><label>End</label><input class="input" id="inp-item-end-edit" type="date" value="${proj.endDate||''}"></div>
                <div class="field"><label>Install</label><input class="input" id="inp-item-install-edit" type="date" value="${proj.installDate||''}"></div>
                <div class="field"><label>Status</label><select class="input" id="inp-item-status-edit"><option value="pending">Pending</option><option value="in progress">In Progress</option><option value="completed">Completed</option></select></div>
            </div>
            <div style="display:flex;gap:24px;margin:14px 0 8px;padding:10px 0;border-top:1px solid var(--main-border);border-bottom:1px solid var(--main-border)">
                <div><span style="font-size:.72rem;color:var(--main-text3)">Countdown</span><div>${cd!==null?(cd>30?`<span style="color:var(--ok)">${cd}d</span>`:cd>7?`<span style="color:var(--warning)">${cd}d</span>`:cd>0?`<span style="color:var(--danger)">${cd}d</span>`:cd===0?`<span style="color:var(--warning)">Today</span>`:`<span style="color:var(--danger)">${Math.abs(cd)}d overdue</span>`):'—'}</div></div>
                <div><span style="font-size:.72rem;color:var(--main-text3)">Members</span><div>${assigned.length}</div></div>
                <div><span style="font-size:.72rem;color:var(--main-text3)">Monthly Cost</span><div>${fmt(cost)}</div></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px">
                <div><div style="font-weight:600;margin-bottom:8px">Assigned</div><div style="border:1px solid var(--main-border);border-radius:var(--radius-sm);max-height:220px;overflow-y:auto" id="edit-assigned-area">${assignedHtml}</div></div>
                <div><div style="font-weight:600;margin-bottom:8px">Add Members</div>${availHtml}</div>
            </div>
            <p class="auth-error" id="item-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditItemFull(${pid})">Save</button></div>
    </div>`);
    setTimeout(() => { const el = document.getElementById('inp-item-edit'); el.focus(); el.select(); document.getElementById('inp-item-status-edit').value = proj.status||'pending'; }, 100);
};

const doEditItemFull = async pid => {
    const err = document.getElementById('item-error');
    const name = document.getElementById('inp-item-edit').value.trim();
    if (!name) { err.textContent = 'Name required'; return; }
    try {
        await api('/projects/'+pid, { method:'PUT', body: {
            name, categoryId: document.getElementById('inp-item-cat-edit').value ? parseInt(document.getElementById('inp-item-cat-edit').value) : null,
            startDate: document.getElementById('inp-item-start-edit').value || null,
            endDate: document.getElementById('inp-item-end-edit').value || null,
            customer: document.getElementById('inp-item-customer-edit').value.trim() || '',
            installDate: document.getElementById('inp-item-install-edit').value || null,
            status: document.getElementById('inp-item-status-edit').value || 'pending'
        }});
        const checks = [...document.querySelectorAll('#assign-new-list input:checked')];
        for (const c of checks) {
            const mid = parseInt(c.value);
            if (!DB.projectAssignments.some(a => a.projectId===pid && a.memberId===mid))
                await api('/assignments', { method:'POST', body:{ projectId:pid, memberId:mid } });
        }
        hideModal(); await loadDB(); renderItemsTable();
    } catch(e) { err.textContent = 'Failed: ' + e.message; }
};
const doRemoveFromEdit = async (pid, mid) => { await api('/assignments', { method:'DELETE', body:{ projectId:pid, memberId:mid } }); await loadDB(); showEditItem(pid); };

const confirmDeleteItem = pid => {
    const p = DB.projects.find(x => x.id===pid); if (!p) return;
    showModal(`<h3>Delete Item</h3><p>Delete <strong>${esc(p.name)}</strong>?<br>${getProjectMembers(pid).length} assignment(s) removed.</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteItem(${pid})">Delete</button></div>`);
};
const doDeleteItem = async pid => { await api('/projects/'+pid, { method:'DELETE' }); hideModal(); await loadDB(); renderItemsTable(); };

/* ==========================================================
   SECTION 10: Project Detail
   ========================================================== */
const renderProjectDetail = () => {
    const pid = activeProjectId;
    const proj = DB.projects.find(p => p.id===pid); if (!proj) { showPage('admin-layout'); return; }
    const members = getProjectMembers(pid), cost = getProjectCost(pid), avg = members.length ? Math.round(cost/members.length) : 0;
    const rows = members.length ? members.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(getPositionName(m.positionId))}</td><td>${esc(getDeptName(m.departmentId))}</td><td>${latestSalary(m)!=null?fmt(latestSalary(m)):'<span class="salary-na">Not set</span>'}</td>
        <td><div class="actions-cell"><button class="btn-icon" onclick="showEditItem(${pid})">&#9998;</button><button class="btn-icon danger" onclick="confirmRemoveFromProject(${pid},${m.id})">&#10005;</button></div></td></tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--main-text3);padding:30px">No members assigned</td></tr>';
    document.getElementById('project-detail-content').innerHTML = `<div class="app-header"><button class="btn btn-ghost btn-sm" onclick="showPage('admin-layout')">&larr; Back</button></div>
    <div class="app-body">
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-label">Members</div><div class="stat-value">${members.length}</div></div>
            <div class="stat-card"><div class="stat-label">Monthly Cost</div><div class="stat-value">${fmt(cost)}</div></div>
            <div class="stat-card"><div class="stat-label">Avg Salary</div><div class="stat-value">${fmt(avg)}</div></div>
        </div>
        <div class="section-head"><h2>Assigned Members</h2><button class="btn btn-accent" onclick="showEditItem(${pid})">+ Manage Members</button></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Cost</th><th style="width:100px">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
};
const confirmRemoveFromProject = (pid, mid) => {
    const m = DB.members.find(x => x.id===mid); if (!m) return;
    showModal(`<h3>Remove from Project</h3><p>Remove <strong>${esc(m.name)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doRemoveFromProject(${pid},${mid})">Remove</button></div>`);
};
const doRemoveFromProject = async (pid, mid) => { await api('/assignments', { method:'DELETE', body:{ projectId:pid, memberId:mid } }); hideModal(); await loadDB(); renderProjectDetail(); };

/* ==========================================================
   SECTION 19: Work List (optimized)
   ========================================================== */
let wlCurrentPage = 1, wlPageSize = 10;

const getScopeOptions = (selectedId) =>
    '<option value="">-- None --</option>' +
    DB.scopes.map(s => `<option value="${s.id}" ${s.id===selectedId?'selected':''}>${esc(s.name)}</option>`).join('');

// ── CRUD 后只刷表格（无动画） ──
const renderWorklistTable = () => {
    const filterScopeId = document.getElementById('worklist-filter')?.value || '';
    const vScopeIds = getViewerVisibleScopeIds();
    let baseList = vScopeIds ? DB.worklist.filter(w => w.scopeId && vScopeIds.includes(w.scopeId)) : DB.worklist;
    if (filterScopeId) baseList = baseList.filter(w => w.scopeId === parseInt(filterScopeId));
    const totalPages = Math.ceil(baseList.length / wlPageSize) || 1;
    if (wlCurrentPage > totalPages) wlCurrentPage = totalPages;
    if (wlCurrentPage < 1) wlCurrentPage = 1;
    const startIdx = (wlCurrentPage - 1) * wlPageSize;
    const pageData = baseList.slice(startIdx, startIdx + wlPageSize);

    const rows = baseList.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No work items found</td></tr>'
        : pageData.map((w, idx) => {
            const scope = w.scopeId ? DB.scopes.find(s => s.id === w.scopeId) : null;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx + idx + 1}</td>
                <td>${scope ? `<span class="badge badge-scope">${esc(scope.name)}</span>` : '<span style="color:var(--main-text3)">\u2014</span>'}</td>
                <td style="font-weight:500">${esc(w.title)}</td>
                <td>${canEdit() ? `<div class="actions-cell"><button class="btn-icon" onclick="showEditWorklist(${w.id})" title="Edit">&#9998;</button><button class="btn-icon danger" onclick="confirmDeleteWorklist(${w.id})" title="Delete">&#10005;</button></div>` : ''}</td>            </tr>`;
        }).join('');

    const pagHtml = buildPagination(baseList.length, wlCurrentPage, wlPageSize,
    'goWlPage', 'changeWlPageSize',
    { label: 'items', sizes: [5, 10, 25, 50, 100] });

    document.getElementById('worklist-table-area').innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th style="width:50px">No</th><th style="width:160px">Category</th><th>Title</th><th style="width:90px">Actions</th></tr></thead>
        <tbody>${rows}</tbody></table></div>${pagHtml}`;
};

// ── 筛选/翻页（无动画） ──
const wlFilterChanged = () => { wlCurrentPage = 1; renderWorklistTable(); };

const goWlPage = page => {
    const filterScopeId = document.getElementById('worklist-filter')?.value || '';
    const vScopeIds = getViewerVisibleScopeIds();
    let base = vScopeIds ? DB.worklist.filter(w => w.scopeId && vScopeIds.includes(w.scopeId)) : DB.worklist;
    if (filterScopeId) base = base.filter(w => w.scopeId === parseInt(filterScopeId));
    const totalPages = Math.ceil(base.length / wlPageSize) || 1;
    wlCurrentPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderWorklistTable();
};

const changeWlPageSize = size => { wlPageSize = parseInt(size); wlCurrentPage = 1; renderWorklistTable(); };

// ── 首次进入页面（有动画） ──
let wlRenderLock = false;
const renderWorkList = () => {
    if (wlRenderLock) return;
    wlRenderLock = true;

    const view = document.getElementById('admin-worklist');
    const vScopeIds = getViewerVisibleScopeIds();
    const visibleScopes = vScopeIds ? DB.scopes.filter(s => vScopeIds.includes(s.id)) : DB.scopes;
    const scopeFilterOpts = '<option value="">All Categories</option>' + visibleScopes.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    view.innerHTML = `<div class="app-header"><h2>Work List</h2><div class="header-sub">Manage work items for attendance tracking</div></div>
        <div class="app-body">
            <div class="pt-anim-filter" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:10px">
                    <label style="font-size:.82rem;color:var(--main-text3)">Filter by Category:</label>
                    <select class="input" id="worklist-filter" onchange="wlFilterChanged()" style="width:180px;padding:8px 10px;font-size:.82rem">${scopeFilterOpts}</select>
                </div>
                ${canEdit() ? '<button class="btn btn-green" onclick="showAddWorklist()">+ Add Work List</button>' : ''}
            </div>
            <div class="pt-anim-table">
                <div id="worklist-table-area"></div>
            </div>
        </div>`;

    setTimeout(() => {
        wlCurrentPage = 1;
        renderWorklistTable();
    }, 250);

    setTimeout(() => {
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 500);

    setTimeout(() => { wlRenderLock = false; }, 850);
};

// ── CRUD（只刷表格，无动画） ──
const showAddWorklist = () => {
    showModal(`<h3>Add Work List</h3>
        <div class="field"><label>Category</label><select class="input" id="wl-scope">${getScopeOptions(null)}</select></div>
        <div class="field"><label>Work List</label><input class="input" id="wl-title" placeholder="e.g. Wiring Installation"></div>
        <p class="auth-error" id="wl-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-green" onclick="doAddWorklist()">Create</button></div>`);
    setTimeout(() => document.getElementById('wl-title').focus(), 100);
};

const doAddWorklist = async () => {
    const title = document.getElementById('wl-title').value.trim();
    const scopeId = document.getElementById('wl-scope').value;
    const errEl = document.getElementById('wl-error'); errEl.textContent = '';
    if (!title) { errEl.textContent = 'Title is required'; return; }
    try { await api('/worklist', { method:'POST', body:{ title, scopeId: scopeId ? parseInt(scopeId) : null } }); }
    catch(ex) { errEl.textContent = ex.message; return; }
    hideModal(); await loadDB(); renderWorklistTable();
};

const showEditWorklist = id => {
    const w = DB.worklist.find(x => x.id === id); if (!w) return;
    showModal(`<h3>Edit — ${esc(w.title)}</h3>
        <div class="field"><label>Category</label><select class="input" id="wl-scope">${getScopeOptions(w.scopeId)}</select></div>
        <div class="field"><label>Work List</label><input class="input" id="wl-title" value="${esc(w.title)}"></div>
        <p class="auth-error" id="wl-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-green" onclick="doEditWorklist(${id})">Save</button></div>`);
};

const doEditWorklist = async id => {
    const title = document.getElementById('wl-title').value.trim();
    const scopeId = document.getElementById('wl-scope').value;
    const errEl = document.getElementById('wl-error'); errEl.textContent = '';
    if (!title) { errEl.textContent = 'Title is required'; return; }
    try { await api('/worklist/'+id, { method:'PUT', body:{ title, scopeId: scopeId ? parseInt(scopeId) : null } }); }
    catch(ex) { errEl.textContent = ex.message; return; }
    hideModal(); await loadDB(); renderWorklistTable();
};

const confirmDeleteWorklist = id => {
    const w = DB.worklist.find(x => x.id === id); if (!w) return;
    showModal(`<h3>Delete Work Item</h3><p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(w.title)}</strong>?<br>Attendance records using this will be set to empty.</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteWorklist(${id})">Delete</button></div>`);
};

const doDeleteWorklist = async id => {
    await api('/worklist/'+id, { method:'DELETE' });
    hideModal(); await loadDB(); renderWorklistTable();
};

/* ==========================================================
   SECTION 7: ADMIN — USERS (optimized)
   ========================================================== */
let usrCurrentPage = 1, usrPageSize = 10, usrSearchQuery = '';

// Reusable scope checkboxes
const scopeCheckboxes = (selectedIds, cls = 'viewer-scope-cb') =>
    DB.scopes.map(s => `<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">
        <input type="checkbox" class="${cls}" value="${s.id}" ${selectedIds.includes(s.id)?'checked':''}> ${esc(s.name)}</label>`).join('');

const selectOptions = (list, selectedId, noneLabel = 'None') =>
    `<option value="">${noneLabel}</option>` + list.map(i => `<option value="${i.id}" ${i.id===selectedId?'selected':''}>${esc(i.name)}</option>`).join('');

// Pagination helper (reusable)
const paginationHtml = (total, page, pageSize, goFunc, changeFunc) => {
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const start = (page - 1) * pageSize, end = Math.min(start + pageSize, total);
    let btns = `<button onclick="${goFunc}(1)" ${page===1?'disabled':''}>&laquo;</button>
                <button onclick="${goFunc}(${page-1})" ${page===1?'disabled':''}>&lsaquo;</button>`;
    const maxV = 5, st = Math.max(1, page - Math.floor(maxV/2)), en = Math.min(totalPages, st + maxV - 1);
    const adjSt = en - st < maxV - 1 ? Math.max(1, en - maxV + 1) : st;
    for (let p = adjSt; p <= en; p++) btns += `<button onclick="${goFunc}(${p})" class="${p===page?'active':''}">${p}</button>`;
    btns += `<button onclick="${goFunc}(${page+1})" ${page===totalPages?'disabled':''}>&rsaquo;</button>
             <button onclick="${goFunc}(${totalPages})" ${page===totalPages?'disabled':''}>&raquo;</button>`;
    return `<div class="pagination">
        <div class="pagination-info">Showing ${start+1} to ${end} of ${total} users</div>
        <div style="display:flex;align-items:center;gap:20px">
            <div class="pagination-size"><label>Show</label>
                <select onchange="${changeFunc}(this.value)">
                    <option value="5"${pageSize===5?' selected':''}>5</option>
                    <option value="10"${pageSize===10?' selected':''}>10</option>
                    <option value="25"${pageSize===25?' selected':''}>25</option>
                    <option value="50"${pageSize===50?' selected':''}>50</option>
                    <option value="100"${pageSize===100?' selected':''}>100</option>
                </select></div>
            <div class="pagination-controls">${btns}</div>
        </div></div>`;
};

// ── 筛选/翻页（无动画） ──
const usrSearchChanged = () => {
    usrSearchQuery = document.getElementById('usr-search').value.trim().toLowerCase();
    usrCurrentPage = 1; renderUsersTable();
};

const resetUsrFilter = () => {
    usrSearchQuery = '';
    document.getElementById('usr-search').value = '';
    msClear('usr-ms-pos'); msClear('usr-ms-dept');
    usrCurrentPage = 1; renderUsersTable();
};

const getFilteredUsers = () => {
    const posIds = (msGetValues('usr-ms-pos') || []).map(String);
    const deptIds = (msGetValues('usr-ms-dept') || []).map(String);
    return DB.users.filter(u => {
        const member = u.memberId ? DB.members.find(m => m.id === u.memberId) : null;
        if (posIds.length && (!member || !posIds.includes(String(member.positionId)))) return false;
        if (deptIds.length && (!member || !deptIds.includes(String(member.departmentId)))) return false;
        if (usrSearchQuery) {
            const haystack = [u.username, member?.name||'', u.role,
                member?.positionId ? getPositionName(member.positionId) : '',
                member?.departmentId ? getDeptName(member.departmentId) : ''
            ].join(' ').toLowerCase();
            if (!haystack.includes(usrSearchQuery)) return false;
        }
        return true;
    });
};

// ── 只刷表格（无动画） ──
const renderUsersTable = () => {
    const filtered = getFilteredUsers();
    const total = filtered.length;
    const totalPages = Math.ceil(total / usrPageSize) || 1;
    if (usrCurrentPage > totalPages) usrCurrentPage = totalPages;
    if (usrCurrentPage < 1) usrCurrentPage = 1;
    const start = (usrCurrentPage - 1) * usrPageSize;
    const page = filtered.slice(start, start + usrPageSize);

    const rows = total === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No users found</td></tr>'
        : page.map((u, idx) => {
            const member = u.memberId ? DB.members.find(m => m.id === u.memberId) : null;
            const mName = member ? member.name : '—';
            const mEmail = member?.email ? esc(member.email) : '<span style="color:var(--main-text3)">—</span>';
            const pos = member?.positionId ? getPositionName(member.positionId) : '—';
            const dept = member?.departmentId ? getDeptName(member.departmentId) : '—';
            const sal = member ? latestSalary(member) : null;
            const projs = member ? getMemberProjects(member.id) : [];
            const projHtml = projs.length ? projs.map(p => `<span class="badge badge-employee" style="margin:1px">${esc(p.name)}</span>`).join(' ') : '<span style="color:var(--main-text3)">None</span>';
            const roleClass = u.role === 'admin' ? 'badge-admin' : u.role === 'viewer' ? 'badge-viewer' : 'badge-employee';
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start + idx + 1}</td>
                <td style="font-family:var(--font-m)">${esc(u.username)}</td>
                <td>${esc(mName)}</td>
                <td style="font-size:.82rem">${mEmail}</td>
                <td><span class="badge ${roleClass}">${u.role}</span></td>
                <td>${esc(pos)}</td>
                <td>${esc(dept)}</td>
                <td>${sal != null && sal > 0 ? `<span class="salary-val">${fmt(sal)}</span>` : '<span class="salary-na">Not set</span>'}</td>
                <td>${projHtml}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditUser(${u.id})" title="Edit">&#9998;</button>
                    ${u.username !== 'admin' ? `<button class="btn-icon danger" onclick="confirmDeleteUser(${u.id})" title="Delete">&#10005;</button>` : ''}
                </div></td></tr>`;
        }).join('');

    document.getElementById('users-table-area').innerHTML =
        `<div class="table-wrap"><table><thead><tr>
            <th style="width:50px">No</th><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Position</th><th>Department</th><th>Salary</th><th>Projects</th><th style="width:90px">Actions</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
        ${total > 0 ? paginationHtml(total, usrCurrentPage, usrPageSize, 'goUsrPage', 'changeUsrPageSize') : ''}`;
};

const goUsrPage = page => {
    const total = getFilteredUsers().length;
    const totalPages = Math.ceil(total / usrPageSize) || 1;
    usrCurrentPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderUsersTable();
};

const changeUsrPageSize = size => { usrPageSize = parseInt(size); usrCurrentPage = 1; renderUsersTable(); };

// ── 首次进入页面（有动画） ──
let usrListRenderLock = false;
const renderUsersList = () => {
    if (usrListRenderLock) return;
    usrListRenderLock = true;

    const view = document.getElementById('admin-users');
    const posOpts = DB.positions.map(p => ({value:p.id, label:p.name}));
    const deptOpts = DB.departments.map(d => ({value:d.id, label:d.name}));
    view.innerHTML = `<div class="app-header"><h2>Users</h2><div class="header-sub">Manage accounts, salaries, positions and departments</div></div>
    <div class="app-body">
        <div class="pt-anim-filter" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Search</label><input class="input" id="usr-search" placeholder="Name, username, position..." value="${esc(usrSearchQuery)}" oninput="usrSearchChanged()" style="max-width:220px;padding:8px 10px;font-size:.82rem"></div>
                <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Position</label><div style="min-width:140px">${msGenerate('usr-ms-pos', posOpts, 'All Positions')}</div></div>
                <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px">${msGenerate('usr-ms-dept', deptOpts, 'All Departments')}</div></div>
                <div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="resetUsrFilter()">Reset</button></div>
            </div>
        </div>
        <div class="pt-anim-head section-head"><h2>All Users</h2><button class="btn btn-green" onclick="showAddUser()">+ Add User</button></div>
        <div class="pt-anim-table"><div id="users-table-area"></div></div>
    </div>`;

    setTimeout(() => {
        msOnChange('usr-ms-pos', () => { usrCurrentPage = 1; renderUsersTable(); });
        msOnChange('usr-ms-dept', () => { usrCurrentPage = 1; renderUsersTable(); });
        usrCurrentPage = 1;
        renderUsersTable();
    }, 250);

    setTimeout(() => {
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 650);

    setTimeout(() => { usrListRenderLock = false; }, 850);
};

const showAddUser = () => {
    const posOpts = selectOptions(DB.positions, null);
    const deptOpts = selectOptions(DB.departments, null);
    const viewerHtml = `<div id="viewer-scope-fields" style="display:none">
        <div class="field"><label>Work Category Access</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${scopeCheckboxes([], 'add-viewer-scope-cb')}</div></div></div>`;
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Add User</h3>
            <div class="field"><label>Role</label><select class="input" id="adduser-role" onchange="toggleAddUserFields()">
                <option value="employee">Employee</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></div>
            <div id="emp-fields">
                <div class="field"><label>Full Name</label><input class="input" id="adduser-name" placeholder="e.g. John Smith"></div>
                <div class="field"><label>Email <span style="font-size:.72rem;color:var(--main-text3)">(for notifications)</span></label><input class="input" id="adduser-email" type="email" placeholder="e.g. john@gmail.com"></div>
                <div class="field"><label>Position</label><select class="input" id="adduser-pos">${posOpts}</select></div>
                <div class="field"><label>Department</label><select class="input" id="adduser-dept">${deptOpts}</select></div>
                <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="adduser-salary" type="number" placeholder="e.g. 15000.00"></div>
            </div>
            ${viewerHtml}
            <div class="field"><label>Username</label><input class="input" id="adduser-user" placeholder="Login username"></div>
            <div class="field"><label>Password</label><input class="input" id="adduser-pass" type="password" placeholder="Min. 6 characters"></div>
            <p class="auth-error" id="adduser-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddUser()">Create</button></div>
    </div>`);
    setTimeout(() => document.getElementById('adduser-name')?.focus(), 100);
};

const toggleAddUserFields = () => {
    const role = document.getElementById('adduser-role').value;
    document.getElementById('emp-fields').style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    document.getElementById('viewer-scope-fields').style.display = role === 'viewer' ? '' : 'none';
};

const doAddUser = async () => {
    const role = document.getElementById('adduser-role').value;
    const username = document.getElementById('adduser-user').value.trim();
    const pass = document.getElementById('adduser-pass').value;
    const errEl = document.getElementById('adduser-error'); errEl.textContent = '';
    if (!username || username.length < 2) { errEl.textContent = 'Username: min 2 characters'; return; }
    if (pass.length < 6) { errEl.textContent = 'Password: min 6 characters'; return; }

    let memberId = null;
    if (role === 'employee' || role === 'viewer') {
        const name = document.getElementById('adduser-name').value.trim();
        if (!name) { errEl.textContent = 'Enter a name'; return; }
        const posId = document.getElementById('adduser-pos').value;
        const deptId = document.getElementById('adduser-dept').value;
        const sal = parseFloat(document.getElementById('adduser-salary').value);
        const now = new Date().toISOString().slice(0,7);
        const email = document.getElementById('adduser-email')?.value.trim() || '';
        const memberRes = await api('/members', { method:'POST', body:{ name, positionId: posId?parseInt(posId):null, departmentId: deptId?parseInt(deptId):null, email: email || null } });
        memberId = memberRes.id;
        if (!isNaN(sal) && sal > 0) await api('/salaries', { method:'PUT', body:{ memberId, month:now, amount:sal } });
    }

    try {
        const result = await api('/users', { method:'POST', body:{ username, password:pass, role, memberId } });
        if (role === 'viewer' && result?.id) {
            const scopeIds = [...document.querySelectorAll('.add-viewer-scope-cb:checked')].map(c => parseInt(c.value));
            if (scopeIds.length) await api('/viewer-scopes/'+result.id, { method:'PUT', body:{ scopeIds } });
        }
    } catch(ex) { errEl.textContent = ex.message; return; }
    hideModal(); await loadDB(); renderUsersTable();
};

const showEditUser = userId => {
    const user = DB.users.find(u => u.id === userId); if (!user) return;
    const member = user.memberId ? DB.members.find(m => m.id === user.memberId) : null;
    const posOpts = selectOptions(DB.positions, member?.positionId);
    const deptOpts = selectOptions(DB.departments, member?.departmentId);
    const curSal = member ? latestSalary(member) : 0;
    const existing = (DB.viewerScopes || {})[user.id] || [];

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Edit — ${esc(user.username)}</h3>
            <div id="edit-member-fields">
                <div class="field"><label>Full Name</label><input class="input" id="edituser-name" value="${member?esc(member.name):''}"></div>
                <div class="field"><label>Email <span style="font-size:.72rem;color:var(--main-text3)">(for notifications)</span></label><input class="input" id="edituser-email" type="email" value="${member&&member.email?esc(member.email):''}" placeholder="e.g. john@gmail.com"></div>
                <div class="field"><label>Position</label><select class="input" id="edituser-pos">${posOpts}</select></div>
                <div class="field"><label>Department</label><select class="input" id="edituser-dept">${deptOpts}</select></div>
                <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="edituser-salary" type="number" value="${curSal>0?curSal:''}" placeholder="e.g. 15000.00"></div>
            </div>
            <div id="edit-viewer-scope-fields"${user.role!=='viewer'?' style="display:none"':''}>
                <div class="field"><label>Work Category Access</label>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${scopeCheckboxes(existing)}</div></div>
            </div>
            <div class="field"><label>Username</label><input class="input" id="edituser-user" value="${esc(user.username)}"></div>
            <div class="field"><label>New Password (blank = keep)</label><input class="input" id="edituser-pass" type="password" placeholder="Leave blank"></div>
            <div class="field"><label>Role</label><select class="input" id="edituser-role" onchange="toggleEditUserFields()">
                <option value="admin"${user.role==='admin'?' selected':''}>Admin</option>
                <option value="viewer"${user.role==='viewer'?' selected':''}>Viewer</option>
                <option value="employee"${user.role==='employee'?' selected':''}>Employee</option>
            </select></div>
            <p class="auth-error" id="edituser-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditUser(${userId})">Save</button></div>
    </div>`);
};

const toggleEditUserFields = () => {
    const role = document.getElementById('edituser-role').value;
    const mf = document.getElementById('edit-member-fields');
    const vf = document.getElementById('edit-viewer-scope-fields');
    if (mf) mf.style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    if (vf) vf.style.display = role === 'viewer' ? '' : 'none';
};

const doEditUser = async userId => {
    const user = DB.users.find(u => u.id === userId); if (!user) return;
    const errEl = document.getElementById('edituser-error');
    const newUsername = document.getElementById('edituser-user').value.trim();
    const newPass = document.getElementById('edituser-pass').value;
    const newRole = document.getElementById('edituser-role').value;
    if (!newUsername) { errEl.textContent = 'Username cannot be empty'; return; }
    if (newPass && newPass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    let memberId = user.memberId;

    // 如果没有 member，先建一个
    if (!memberId) {
        const name = document.getElementById('edituser-name')?.value.trim();
        if (name) {
            const posId = document.getElementById('edituser-pos')?.value;
            const deptId = document.getElementById('edituser-dept')?.value;
            const sal = parseFloat(document.getElementById('edituser-salary')?.value);
            const now = new Date().toISOString().slice(0,7);
            const email = document.getElementById('edituser-email')?.value.trim() || '';
            const memberRes = await api('/members', { method:'POST', body:{ name, positionId: posId?parseInt(posId):null, departmentId: deptId?parseInt(deptId):null, email: email || null } });
            memberId = memberRes.id;
            if (!isNaN(sal) && sal > 0) await api('/salaries', { method:'PUT', body:{ memberId, month:now, amount:sal } });
        }
    }

    await api('/users/'+userId, { method:'PUT', body:{ username:newUsername, password:newPass || null, role:newRole, memberId } });

    if (memberId) {
        const nameEl = document.getElementById('edituser-name');
        const posEl = document.getElementById('edituser-pos');
        const deptEl = document.getElementById('edituser-dept');
        const salEl = document.getElementById('edituser-salary');
        const member = DB.members.find(m => m.id === memberId);
                const emailEl = document.getElementById('edituser-email');
        await api('/members/'+memberId, { method:'PUT', body: {
            name: nameEl?.value.trim() || member?.name || '',
            email: emailEl?.value.trim() || null,
            positionId: posEl?.value ? parseInt(posEl.value) : (member?.positionId || null),
            departmentId: deptEl?.value ? parseInt(deptEl.value) : (member?.departmentId || null)
        }});
        if (salEl) {
            const val = parseFloat(salEl.value);
            const now = new Date().toISOString().slice(0,7);
            await api('/salaries', { method:'PUT', body:{ memberId, month:now, amount: (!isNaN(val) && val > 0) ? val : 0 } });
        }
    }

    if (newRole === 'viewer') {
        const scopeIds = [...document.querySelectorAll('.viewer-scope-cb:checked')].map(c => parseInt(c.value));
        await api('/viewer-scopes/'+userId, { method:'PUT', body:{ scopeIds } });
    }

    hideModal(); await loadDB(); renderUsersTable();
};

const confirmDeleteUser = userId => {
    const user = DB.users.find(u => u.id === userId); if (!user || user.username === 'admin') return;
    showModal(`<h3>Delete User</h3><p style="color:var(--main-text2)">Delete <strong>${esc(user.username)}</strong>?${user.memberId?'<br>Member profile, salary and attendance will be deleted.':''}</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteUser(${userId})">Delete</button></div>`);
};

const doDeleteUser = async userId => {
    await api('/users/'+userId, { method:'DELETE' });
    hideModal(); await loadDB(); renderUsersTable();
};

/* ==========================================================
   SECTION 8: ADMIN — POSITIONS (optimized)
   ========================================================== */
let posCurrentPage = 1, posPageSize = 10;

// ── 只刷表格（无动画） ──
const renderPositionsTable = () => {
    const total = DB.positions.length;
    const totalPages = Math.ceil(total / posPageSize) || 1;
    if (posCurrentPage > totalPages) posCurrentPage = totalPages;
    if (posCurrentPage < 1) posCurrentPage = 1;
    const start = (posCurrentPage - 1) * posPageSize;
    const page = DB.positions.slice(start, start + posPageSize);

    const memberCounts = DB.members.reduce((acc, m) => {
        if (m.positionId != null) acc[m.positionId] = (acc[m.positionId] || 0) + 1;
        return acc;
    }, {});

    const rows = total === 0
        ? '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:30px">No positions defined</td></tr>'
        : page.map((p, idx) => {
            const count = memberCounts[p.id] || 0;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start + idx + 1}</td>
                <td style="font-weight:500">${esc(p.name)}</td>
                <td style="text-align:center;font-family:var(--font-m)">${count}</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditPosition(${p.id})">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeletePosition(${p.id})">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(DB.positions.length, posCurrentPage, posPageSize,
    'goPosPage', 'changePosPageSize',
    { label: 'positions', sizes: [5, 10, 25, 50] });

    document.getElementById('positions-table-area').innerHTML =
        `<div class="table-wrap"><table><thead><tr>
            <th style="width:50px">No</th><th>Position Name</th><th style="width:100px">Members</th><th style="width:90px">Actions</th>
        </tr></thead><tbody>${rows}</tbody></table></div>${pagHtml}`;
};

const goPosPage = page => {
    const totalPages = Math.ceil(DB.positions.length / posPageSize) || 1;
    posCurrentPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderPositionsTable();
};

const changePosPageSize = size => { posPageSize = parseInt(size); posCurrentPage = 1; renderPositionsTable(); };

// ── 首次进入页面（有动画） ──
let posListRenderLock = false;
const renderPositionsList = () => {
    if (posListRenderLock) return;
    posListRenderLock = true;

    const view = document.getElementById('admin-positions');
    view.innerHTML = `
    <div class="app-header"><h2>Positions</h2><div class="header-sub">Manage job positions</div></div>
    <div class="app-body">
      <div class="pt-anim-head section-head"><h2>All Positions</h2><button class="btn btn-green" onclick="showAddPosition()">+ New Position</button></div>
      <div class="pt-anim-table"><div id="positions-table-area"></div></div>
    </div>`;

    setTimeout(() => {
        posCurrentPage = 1;
        renderPositionsTable();
    }, 250);

    setTimeout(() => {
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 500);

    setTimeout(() => { posListRenderLock = false; }, 850);
};

// ── CRUD（只刷表格，无动画） ──
const showAddPosition = () => {
    showModal(`<h3>New Position</h3>
    <div class="field"><label>Position Name</label><input class="input" id="inp-pos-name" placeholder="e.g. Software Engineer"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddPosition()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-pos-name')?.focus(), 100);
};

const doAddPosition = async () => {
    const name = document.getElementById('inp-pos-name').value.trim();
    if (!name) return;
    await api('/positions', { method: 'POST', body: { name } });
    hideModal(); await loadDB(); renderPositionsTable();
};

const showEditPosition = id => {
    const pos = DB.positions.find(p => p.id === id); if (!pos) return;
    showModal(`<h3>Edit Position</h3>
    <div class="field"><label>Position Name</label><input class="input" id="inp-pos-name" value="${esc(pos.name)}"></div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditPosition(${id})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-pos-name'); el.focus(); el.select(); }, 100);
};

const doEditPosition = async id => {
    const name = document.getElementById('inp-pos-name').value.trim();
    if (!name) return;
    await api('/positions/' + id, { method: 'PUT', body: { name } });
    hideModal(); await loadDB(); renderPositionsTable();
};

const confirmDeletePosition = id => {
    const pos = DB.positions.find(p => p.id === id); if (!pos) return;
    const count = DB.members.filter(m => m.positionId === id).length;
    showModal(`<h3>Delete Position</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(pos.name)}</strong>?<br>${count} member(s) will have position cleared.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeletePosition(${id})">Delete</button></div>`);
};

const doDeletePosition = async id => {
    await api('/positions/' + id, { method: 'DELETE' });
    hideModal(); await loadDB(); renderPositionsTable();
};


/* ==========================================================
   SECTION 9: ADMIN — DEPARTMENTS (optimized + work hours)
   ========================================================== */
let deptCurrentPage = 1, deptPageSize = 10;

// ── 只刷表格（无动画） ──
const renderDepartmentsTable = () => {
    const total = DB.departments.length;
    const totalPages = Math.ceil(total / deptPageSize) || 1;
    if (deptCurrentPage > totalPages) deptCurrentPage = totalPages;
    if (deptCurrentPage < 1) deptCurrentPage = 1;
    const start = (deptCurrentPage - 1) * deptPageSize;
    const page = DB.departments.slice(start, start + deptPageSize);

    const memberCounts = DB.members.reduce((acc, m) => {
        if (m.departmentId != null) acc[m.departmentId] = (acc[m.departmentId] || 0) + 1;
        return acc;
    }, {});

    const rows = total === 0
        ? '<tr><td colspan="7" style="text-align:center;color:var(--main-text3);padding:30px">No departments defined</td></tr>'
        : page.map((d, idx) => {
            const count = memberCounts[d.id] || 0;
            const days = d.workDaysPerWeek ?? 6;
            const normal = d.normalDayHours ?? 9;
            const sat = d.saturdayHours ?? 9;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start + idx + 1}</td>
                <td style="font-weight:500">${esc(d.name)}</td>
                <td style="text-align:center;font-family:var(--font-m)">${count}</td>
                <td style="text-align:center;font-family:var(--font-m)">${days}</td>
                <td style="text-align:center;font-family:var(--font-m)">${normal}h</td>
                <td style="text-align:center;font-family:var(--font-m)">${sat}h</td>
                <td><div class="actions-cell">
                    <button class="btn-icon" onclick="showEditDepartment(${d.id})">&#9998;</button>
                    <button class="btn-icon danger" onclick="confirmDeleteDepartment(${d.id})">&#10005;</button>
                </div></td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(DB.departments.length, deptCurrentPage, deptPageSize,
        'goDeptPage', 'changeDeptPageSize',
        { label: 'departments', sizes: [5, 10, 25, 50] });

    document.getElementById('departments-table-area').innerHTML =
        `<div class="table-wrap"><table><thead><tr>
            <th style="width:50px">No</th><th>Department Name</th><th style="width:80px">Members</th><th style="width:80px">Days/Wk</th><th style="width:90px">Normal Hr</th><th style="width:90px">Sat Hr</th><th style="width:90px">Actions</th>
        </tr></thead><tbody>${rows}</tbody></table></div>${pagHtml}`;
};

const goDeptPage = page => {
    const totalPages = Math.ceil(DB.departments.length / deptPageSize) || 1;
    deptCurrentPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderDepartmentsTable();
};

const changeDeptPageSize = size => { deptPageSize = parseInt(size); deptCurrentPage = 1; renderDepartmentsTable(); };

// ── 首次进入页面（有动画） ──
let deptListRenderLock = false;
const renderDepartmentsList = () => {
    if (deptListRenderLock) return;
    deptListRenderLock = true;

    const view = document.getElementById('admin-departments');
    view.innerHTML = `
    <div class="app-header"><h2>Departments</h2><div class="header-sub">Manage departments</div></div>
    <div class="app-body">
      <div class="pt-anim-head section-head"><h2>All Departments</h2><button class="btn btn-green" onclick="showAddDepartment()">+ New Department</button></div>
      <div class="pt-anim-table"><div id="departments-table-area"></div></div>
    </div>`;

    setTimeout(() => {
        deptCurrentPage = 1;
        renderDepartmentsTable();
    }, 250);

    setTimeout(() => {
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 500);

    setTimeout(() => { deptListRenderLock = false; }, 850);
};

// ── CRUD ──
const showAddDepartment = () => {
    showModal(`<h3>New Department</h3>
    <div class="field"><label>Department Name</label><input class="input" id="inp-dept-name" placeholder="e.g. Engineering"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="field"><label>Days Per Week</label><input class="input" type="number" id="inp-dept-days" value="6" min="1" max="7"></div>
        <div class="field"><label>Normal Day Hours</label><input class="input" type="number" id="inp-dept-normal" value="9" min="0" max="24" step="0.5"></div>
        <div class="field"><label>Saturday Hours</label><input class="input" type="number" id="inp-dept-sat" value="9" min="0" max="24" step="0.5"></div>
    </div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAddDepartment()">Create</button></div>`);
    setTimeout(() => document.getElementById('inp-dept-name')?.focus(), 100);
};

const doAddDepartment = async () => {
    const name = document.getElementById('inp-dept-name').value.trim();
    if (!name) return;
    const work_days_per_week = parseInt(document.getElementById('inp-dept-days').value) ?? 6;
    const normal_day_hours = parseFloat(document.getElementById('inp-dept-normal').value) ?? 9;
    const saturday_hours = parseFloat(document.getElementById('inp-dept-sat').value) ?? 5;
    await api('/departments', { method: 'POST', body: { name, work_days_per_week, normal_day_hours, saturday_hours } });
    hideModal(); await loadDB(); renderDepartmentsTable();
};

const showEditDepartment = id => {
    const dept = DB.departments.find(d => d.id === id); if (!dept) return;
    showModal(`<h3>Edit Department</h3>
    <div class="field"><label>Department Name</label><input class="input" id="inp-dept-name" value="${esc(dept.name)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="field"><label>Days Per Week</label><input class="input" type="number" id="inp-dept-days" value="${dept.workDaysPerWeek ?? 6}" min="1" max="7"></div>
        <div class="field"><label>Normal Day Hours</label><input class="input" type="number" id="inp-dept-normal" value="${dept.normalDayHours ?? 9}" min="0" max="24" step="0.5"></div>
        <div class="field"><label>Saturday Hours</label><input class="input" type="number" id="inp-dept-sat" value="${dept.saturdayHours ?? 5}" min="0" max="24" step="0.5"><div style="font-size:.72rem;color:var(--main-text3);margin-top:2px">Set 0 if Saturday off</div></div>
    </div>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doEditDepartment(${id})">Save</button></div>`);
    setTimeout(() => { const el = document.getElementById('inp-dept-name'); el.focus(); el.select(); }, 100);
};

const doEditDepartment = async id => {
    const name = document.getElementById('inp-dept-name').value.trim();
    if (!name) return;
    const work_days_per_week = parseInt(document.getElementById('inp-dept-days').value) ?? 6;
    const normal_day_hours = parseFloat(document.getElementById('inp-dept-normal').value) ?? 9;
    const saturday_hours = parseFloat(document.getElementById('inp-dept-sat').value) ?? 5;
    await api('/departments/' + id, { method: 'PUT', body: { name, work_days_per_week, normal_day_hours, saturday_hours } });
    hideModal(); await loadDB(); renderDepartmentsTable();
};

const confirmDeleteDepartment = id => {
    const dept = DB.departments.find(d => d.id === id); if (!dept) return;
    const count = DB.members.filter(m => m.departmentId === id).length;
    showModal(`<h3>Delete Department</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete <strong style="color:var(--main-text)">${esc(dept.name)}</strong>?<br>${count} member(s) will have department cleared.</p>
    <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteDepartment(${id})">Delete</button></div>`);
};

const doDeleteDepartment = async id => {
    await api('/departments/' + id, { method: 'DELETE' });
    hideModal(); await loadDB(); renderDepartmentsTable();
};


/* ==========================================================
   SECTION 11: EMPLOYEE — MY ITEMS/MY WORK CATEGORY (optimized)
   ========================================================== */

// ---------- helper ----------
const empCdBadge = cd => {
    if (cd === null) return '\u2014';
    const map = [
        [30, 'var(--ok)', 'days left'],
        [7, 'var(--warning)', 'days left'],
        [0, 'var(--danger)', 'days left'],
        [-Infinity, 'var(--warning)', 'Due today!']
    ];
    const [, color, suffix] = map.find(([d]) => cd > d) || [];
    if (cd === 0) return `<span style="color:${color};font-weight:600">Due today!</span>`;
    return `<span style="color:${color};font-weight:600">${cd > 0 ? cd : Math.abs(cd)} ${cd > 0 ? suffix : 'days overdue'}</span>`;
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

// ---------- globals ----------
let empItemSummaryPage = 1, empItemSummaryPageSize = 10;
const empItemSummaryData = [];
const empScopePages = {};
const empScopeSearch = {};

// ---------- collapse ----------
const toggleCollapse = sectionId => {
    const content = document.getElementById(sectionId + '-content');
    const arrow = document.getElementById(sectionId + '-arrow');
    if (!content || !arrow) return;
    const isOpen = content.style.display === 'block';
    content.style.display = isOpen ? 'none' : 'block';
    arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
};

// ---------- core render (shared) ----------
const _doRenderEmpProjects = (member, animate) => {
    const assignedProjs = getMemberProjects(member.id);

    const groups = {};
    DB.scopes.forEach(s => {
        const isPic = s.picMemberIds && s.picMemberIds.includes(member.id);
        const items = isPic
            ? DB.projects.filter(p => p.categoryId === s.id)
            : assignedProjs.filter(p => p.categoryId === s.id);
        if (items.length) groups[s.id] = { scope: s, items, isPic };
    });

    const uncatItems = assignedProjs.filter(p => !p.categoryId);
    if (uncatItems.length) groups[0] = { scope: { id: 0, name: 'Uncategorized', picMemberIds: [] }, items: uncatItems, isPic: false };

    Object.keys(empScopePages).forEach(k => delete empScopePages[k]);
    let scopeSections = Object.keys(groups).length === 0
        ? '<div class="empty"><div class="icon">&#128193;</div><p>Not assigned to any</p></div>'
        : Object.values(groups).map(g => {
            const { scope, items, isPic } = g;
            const itemsData = items.map(p => ({
                id: p.id,
                name: esc(p.name),
                customer: esc(p.customer || '\u2014'),
                startDateFmt: formatDateDMY(p.startDate),
                endDateFmt: formatDateDMY(p.endDate),
                installDateFmt: formatDateDMY(p.installDate),
                startDateRaw: p.startDate?.slice(0,10) || '',
                endDateRaw: p.endDate?.slice(0,10) || '',
                installDateRaw: p.installDate?.slice(0,10) || '',
                status: p.status || 'pending',
                team: `${getProjectMembers(p.id).length} member${getProjectMembers(p.id).length !== 1 ? 's' : ''}`,
                cdHtml: empCdBadge(getProjectCountdown(p))
            }));
            empScopePages[scope.id] = { page: 1, pageSize: 5, data: itemsData, isPic, scopeId: scope.id };
            const picBadge = isPic ? '<span class="badge badge-scope" style="font-size:.68rem;padding:2px 6px;vertical-align:middle">(You Are PIC)</span>' : '';
            return `<div class="collapse-section" style="margin-bottom:12px">
                <div class="collapse-header" onclick="toggleCollapse('scope-${scope.id}')">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span class="collapse-arrow" id="scope-${scope.id}-arrow">&#9654;</span>
                        <span style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">${esc(scope.name)}</span>
                        ${picBadge}
                        <span style="font-size:.82rem;color:var(--main-text3)">${items.length} item${items.length!==1?'s':''}</span>
                    </div>
                </div>
                <div class="collapse-content" id="scope-${scope.id}-content" style="display:none;padding-top:8px">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
                        <input class="input" id="scope-search-${scope.id}" placeholder="Search all columns..." value="${esc(empScopeSearch[scope.id]||'')}" oninput="scopeSearchChanged(${scope.id})" style="max-width:260px;padding:7px 10px;font-size:.82rem;margin-right:auto">
                        ${isPic ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
                            <a class="btn btn-accent btn-sm" href="/api/template/projects/${scope.id}" style="text-decoration:none">Template</a>
                            <label class="btn btn-blue btn-sm" style="cursor:pointer">Import<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="empHandleScopeImport(${scope.id},this)"></label>
                            <button class="btn btn-green btn-sm" onclick="empShowAddItem(${scope.id})">+ Add Item</button>
                        </div>` : ''}
                    </div>
                    <div id="scope-items-table-${scope.id}"></div>
                </div>
            </div>`;
        }).join('');

    buildEmpItemSummaryData(member.id);
    const summaryHtml = empItemSummaryData.length ? '<div id="emp-item-summary-area"></div>' : '';

    const af = animate ? ' pt-anim-filter' : '';
    const ah = animate ? ' pt-anim-head' : '';
    const at = animate ? ' pt-anim-table' : '';

    const view = document.getElementById('emp-myprojects');
    view.innerHTML = `
        <div class="app-header"><h2>My Work Category Details</h2><div class="header-sub">Items you are involved in</div></div>
        <div class="app-body" style="max-width:none">
            <div class="emp-card${af}">
                <div class="emp-name">${esc(member.name)}</div>
                <div class="emp-project">Position: ${esc(getPositionName(member.positionId))} &nbsp;|&nbsp; Department: ${esc(getDeptName(member.departmentId))}</div>
                <div class="emp-project" style="margin-bottom:8px">Work Assigned: <strong>${assignedProjs.length}</strong></div>
            </div>
            <div class="${ah}" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">
                <div style="padding:12px 20px;border-bottom:1px solid var(--main-border)"><h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Attendance Summary</h2></div>
                <div style="padding:20px">${summaryHtml}</div>
            </div>
            <div class="${at}" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden">
                <div style="padding:12px 20px;border-bottom:1px solid var(--main-border)"><h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Work Contributed</h2></div>
                <div style="padding:20px">${scopeSections}</div>
            </div>
        </div>`;

        if (animate) {
            setTimeout(() => {
                // 填充内部内容（在动画播放时同步进行）
                if (empItemSummaryData.length) { empItemSummaryPage = 1; renderEmpItemSummaryTable(); }
                Object.keys(empScopePages).forEach(sid => renderScopeItemsTable(parseInt(sid)));
            }, 250);
            // 等所有动画结束再移除 class + 解锁
            setTimeout(() => {
                const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
                animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
                empProjRenderLock = false;
            }, 900);
        } else {
            if (empItemSummaryData.length) { empItemSummaryPage = 1; renderEmpItemSummaryTable(); }
            Object.keys(empScopePages).forEach(sid => renderScopeItemsTable(parseInt(sid)));
        }
};

// ---------- 首次进入页面（有动画） ----------
let empProjRenderLock = false;
const renderEmployeeProjects = () => {
    if (empProjRenderLock) return;
    if (!currentUser?.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;
    empProjRenderLock = true;
    _doRenderEmpProjects(member, true);
};

// ---------- CRUD 后刷新（无动画） ----------
const refreshEmpProjectData = () => {
    if (!currentUser?.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;

    // 记住哪些 scope 是展开的
    const openScopes = [];
    Object.keys(empScopePages).forEach(sid => {
        const content = document.getElementById(`scope-${sid}-content`);
        if (content && content.style.display === 'block') openScopes.push(parseInt(sid));
    });

    const assignedProjs = getMemberProjects(member.id);

    // 重建 groups 数据
    const groups = {};
    DB.scopes.forEach(s => {
        const isPic = s.picMemberIds && s.picMemberIds.includes(member.id);
        const items = isPic
            ? DB.projects.filter(p => p.categoryId === s.id)
            : assignedProjs.filter(p => p.categoryId === s.id);
        if (items.length) groups[s.id] = { scope: s, items, isPic };
    });
    const uncatItems = assignedProjs.filter(p => !p.categoryId);
    if (uncatItems.length) groups[0] = { scope: { id: 0, name: 'Uncategorized', picMemberIds: [] }, items: uncatItems, isPic: false };

    // 更新 empScopePages 数据
    Object.keys(empScopePages).forEach(k => delete empScopePages[k]);
    Object.values(groups).forEach(g => {
        const { scope, items, isPic } = g;
        const itemsData = items.map(p => ({
            id: p.id,
            name: esc(p.name),
            customer: esc(p.customer || '\u2014'),
            startDateFmt: formatDateDMY(p.startDate),
            endDateFmt: formatDateDMY(p.endDate),
            installDateFmt: formatDateDMY(p.installDate),
            startDateRaw: p.startDate?.slice(0,10) || '',
            endDateRaw: p.endDate?.slice(0,10) || '',
            installDateRaw: p.installDate?.slice(0,10) || '',
            status: p.status || 'pending',
            team: `${getProjectMembers(p.id).length} member${getProjectMembers(p.id).length !== 1 ? 's' : ''}`,
            cdHtml: empCdBadge(getProjectCountdown(p))
        }));
        empScopePages[scope.id] = { page: 1, pageSize: 5, data: itemsData, isPic, scopeId: scope.id };
    });

    // 只刷新 table 内容 + 恢复展开状态
    Object.keys(empScopePages).forEach(sid => {
        const numSid = parseInt(sid);
        renderScopeItemsTable(numSid);
        // 恢复展开状态
        if (openScopes.includes(numSid)) {
            const content = document.getElementById(`scope-${numSid}-content`);
            const arrow = document.getElementById(`scope-${numSid}-arrow`);
            if (content) content.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(90deg)';
        }
    });

    // 刷新 summary
    buildEmpItemSummaryData(member.id);
    if (empItemSummaryData.length) renderEmpItemSummaryTable();
};

// ---------- search ----------
const scopeSearchChanged = scopeId => {
    empScopeSearch[scopeId] = document.getElementById(`scope-search-${scopeId}`).value.trim().toLowerCase();
    const sp = empScopePages[scopeId];
    if (sp) sp.page = 1;
    renderScopeItemsTable(scopeId);
};

// ---------- import ----------
let empImportBase64 = null, empImportFilename = '';

const empHandleScopeImport = (scopeId, input) => {
    const file = input.files[0];
    if (!file) return;
    const scope = DB.scopes.find(s => s.id === scopeId);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            if (!rows.length) { alert('File is empty'); input.value = ''; return; }
            const headers = Object.keys(rows[0]);
            const previewHtml = `<div style="margin-top:10px;font-size:.85rem;color:var(--main-text3)">Preview (${rows.length} rows)</div>
                <div class="import-preview"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
                ${rows.slice(0,5).map(r => `<tr>${headers.map(h => `<td>${esc(String(r[h]))}</td>`).join('')}</tr>`).join('')}
                ${rows.length>5 ? `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--main-text3)">... ${rows.length-5} more</td></tr>` : ''}
                </tbody></table></div>`;
            empImportBase64 = btoa(String.fromCharCode.apply(null, data));
            empImportFilename = file.name;
            showModal(`<h3>Import to ${esc(scope?.name||'')}</h3>${previewHtml}
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
                    <button class="btn btn-ghost" onclick="hideModal();empImportBase64=null">Cancel</button>
                    <button class="btn btn-accent" onclick="empDoScopeImport(${scopeId})">Import ${rows.length} Rows</button>
                </div>`);
        } catch(err) { alert('Error reading file: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
};

const empDoScopeImport = (scopeId) => {
    if (!empImportBase64) return;
    api('/import/projects', { method: 'POST', body: { filename: empImportFilename, data: empImportBase64, categoryId: scopeId } })
        .then(result => {
            hideModal(); empImportBase64 = null;
            alert(`Imported: ${result.inserted}, Skipped: ${result.skipped}${result.errors?.length ? '\n\n' + result.errors.join('\n') : ''}`);
            return loadDB();
        })
        .then(() => refreshEmpProjectData())
        .catch(e => { alert('Import failed: ' + e.message); });
};

// ---------- PIC item CRUD ----------
const empShowAddItem = scopeId => {
    const scope = DB.scopes.find(s => s.id === scopeId);
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Add Item to ${esc(scope?.name||'')}</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>ID/Name</label><input class="input" id="emp-inp-item-name" placeholder="e.g. PLC-001 Panel"></div>
                <div class="field"><label>Customer</label><input class="input" id="emp-inp-customer" placeholder="e.g. Petronas"></div>
                <div class="field"><label>Start Date</label><input class="input" id="emp-inp-item-start" type="date"></div>
                <div class="field"><label>End Date</label><input class="input" id="emp-inp-item-end" type="date"></div>
                <div class="field"><label>Install Date</label><input class="input" id="emp-inp-item-install" type="date"></div>
                <div class="field"><label>Status</label><select class="input" id="emp-inp-item-status"><option value="pending">Pending</option><option value="in progress">In Progress</option><option value="completed">Completed</option></select></div>
            </div>
            <p class="auth-error" id="emp-item-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="empDoAddItem(${scopeId})">Create</button></div>
    </div>`);
    setTimeout(() => document.getElementById('emp-inp-item-name')?.focus(), 100);
};

const empDoAddItem = (scopeId) => {
    const errEl = document.getElementById('emp-item-error');
    const name = document.getElementById('emp-inp-item-name').value.trim();
    if (!name) { errEl.textContent = 'ID/Name required'; return; }
    api('/projects', { method: 'POST', body: {
        name, categoryId: scopeId,
        startDate: document.getElementById('emp-inp-item-start').value || null,
        endDate: document.getElementById('emp-inp-item-end').value || null,
        installDate: document.getElementById('emp-inp-item-install').value || null,
        customer: document.getElementById('emp-inp-customer').value.trim() || null,
        status: document.getElementById('emp-inp-item-status').value || 'pending'
    }})
    .then(() => { hideModal(); return loadDB(); })
    .then(() => refreshEmpProjectData())
    .catch(e => { errEl.textContent = 'Failed: ' + e.message; });
};

const empShowEditItem = pid => {
    const proj = DB.projects.find(p => p.id === pid);
    if (!proj) return;
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Edit Item</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>ID/Name</label><input class="input" id="emp-inp-item-edit" value="${esc(proj.name)}"></div>
                <div class="field"><label>Customer</label><input class="input" id="emp-inp-customer-edit" value="${esc(proj.customer||'')}"></div>
                <div class="field"><label>Start Date</label><input class="input" id="emp-inp-item-start-edit" type="date" value="${proj.startDate||''}"></div>
                <div class="field"><label>End Date</label><input class="input" id="emp-inp-item-end-edit" type="date" value="${proj.endDate||''}"></div>
                <div class="field"><label>Install Date</label><input class="input" id="emp-inp-item-install-edit" type="date" value="${proj.installDate||''}"></div>
                <div class="field"><label>Status</label><select class="input" id="emp-inp-item-status-edit"><option value="pending">Pending</option><option value="in progress">In Progress</option><option value="completed">Completed</option></select></div>
                <div style="display:flex;align-items:center;gap:8px"><span style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase">Countdown</span><span style="font-size:.9rem">${empCdBadge(getProjectCountdown(proj))}</span></div>
            </div>
            <p class="auth-error" id="emp-item-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="empDoEditItem(${pid})">Save</button></div>
    </div>`);
    setTimeout(() => {
        const el = document.getElementById('emp-inp-item-edit');
        el.focus(); el.select();
        document.getElementById('emp-inp-item-status-edit').value = proj.status || 'pending';
    }, 100);
};

const empDoEditItem = (pid) => {
    const errEl = document.getElementById('emp-item-error');
    const name = document.getElementById('emp-inp-item-edit').value.trim();
    if (!name) { errEl.textContent = 'ID/Name required'; return; }
    const proj = DB.projects.find(p => p.id === pid);
    api('/projects/'+pid, { method: 'PUT', body: {
        name, categoryId: proj?.categoryId ?? null,
        startDate: document.getElementById('emp-inp-item-start-edit').value || null,
        endDate: document.getElementById('emp-inp-item-end-edit').value || null,
        installDate: document.getElementById('emp-inp-item-install-edit').value || null,
        customer: document.getElementById('emp-inp-customer-edit').value.trim() || null,
        status: document.getElementById('emp-inp-item-status-edit').value || 'pending'
    }})
    .then(() => { hideModal(); return loadDB(); })
    .then(() => refreshEmpProjectData())
    .catch(e => { errEl.textContent = 'Failed: ' + e.message; });
};

const empConfirmDeleteItem = pid => {
    const p = DB.projects.find(x => x.id === pid);
    if (!p) return;
    showModal(`<h3>Delete Item</h3><p style="color:var(--main-text2)">Delete <strong>${esc(p.name)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="empDoDeleteItem(${pid})">Delete</button></div>`);
};

const empDoDeleteItem = (pid) => {
    api('/projects/'+pid, { method:'DELETE' })
        .then(() => { hideModal(); return loadDB(); })
        .then(() => refreshEmpProjectData())
        .catch(e => { alert('Failed: ' + e.message); });
};

// ---------- Summary table ----------
function buildEmpItemSummaryData(memberId) {
    const myEntries = DB.attendance.filter(a => a.memberId === memberId && a.clockIn && a.clockOut);
    empItemSummaryData.length = 0;
    if (!myEntries.length) return;

    const itemGroups = {};
    myEntries.forEach(r => {
        const pid = r.projectId || 0;
        if (!itemGroups[pid]) itemGroups[pid] = { ms: 0, cost: 0, entries: 0 };
        const ms = new Date(r.clockOut) - new Date(r.clockIn);
        itemGroups[pid].ms += ms;
        itemGroups[pid].cost += (getEntryCost(r.memberId, ms) || 0);
        itemGroups[pid].entries++;
    });

    Object.entries(itemGroups).forEach(([pid, data]) => {
        const proj = pid === '0' ? null : DB.projects.find(p => p.id === parseInt(pid));
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const label = proj ? (scope ? `${esc(scope.name)} &rarr; ${esc(proj.name)}` : esc(proj.name)) : '<span style="color:var(--main-text3)">Unassigned</span>';
        empItemSummaryData.push({ label, entries: data.entries, hours: data.ms, cost: data.cost });
    });
}

const renderEmpItemSummaryTable = () => {
    const data = empItemSummaryData;
    const totalPages = Math.ceil(data.length / empItemSummaryPageSize) || 1;
    if (empItemSummaryPage > totalPages) empItemSummaryPage = totalPages;
    if (empItemSummaryPage < 1) empItemSummaryPage = 1;
    const startIdx = (empItemSummaryPage - 1) * empItemSummaryPageSize;
    const page = data.slice(startIdx, startIdx + empItemSummaryPageSize);

    const rows = data.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map((r, idx) => `<tr>
            <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx+idx+1}</td>
            <td>${r.label}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.entries}</td>
            <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.hours)}</td>
            <td style="text-align:right;font-family:var(--font-m)">${fmtCost(r.cost)}</td>
        </tr>`).join('');

    const pagHtml = data.length > 0 ? buildPagination(data.length, empItemSummaryPage, empItemSummaryPageSize,
    'goEmpItemSummaryPage', 'changeEmpItemSummaryPageSize',
    { label: 'items', sizes: [5,10,25,50,100] }) : '';

    document.getElementById('emp-item-summary-area').innerHTML = `
        <div class="collapse-section" style="margin-bottom:16px">
            <div class="collapse-header" onclick="toggleCollapse('emp-summary')">
                <div style="display:flex;align-items:center;gap:10px">
                    <span class="collapse-arrow" id="emp-summary-arrow" style="transform:rotate(90deg)">&#9654;</span>
                    <span style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text)">Attendance Overview</span>
                    <span style="font-size:.82rem;color:var(--main-text3)">${data.length} items</span>
                </div>
            </div>
            <div class="collapse-content" id="emp-summary-content" style="display:block;padding-top:8px">
                <div class="table-wrap"><table>
                    <thead><tr><th style="width:50px">No</th><th>Work Category → ID/Name</th><th style="text-align:right">Records</th><th style="text-align:right">Hours</th><th style="text-align:right">Cost</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>
                ${pagHtml}
            </div>
        </div>`;
};

const goEmpItemSummaryPage = page => {
    const totalPages = Math.ceil(empItemSummaryData.length / empItemSummaryPageSize) || 1;
    empItemSummaryPage = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderEmpItemSummaryTable();
};
const changeEmpItemSummaryPageSize = size => { empItemSummaryPageSize = parseInt(size); empItemSummaryPage = 1; renderEmpItemSummaryTable(); };

// ---------- scope items table ----------
const renderScopeItemsTable = scopeId => {
    const sp = empScopePages[scopeId];
    if (!sp) return;
    const query = (empScopeSearch[scopeId] || '').toLowerCase();
    let data = sp.data;
    if (query) {
        data = data.filter(r => [r.name, r.customer, r.startDateRaw, r.endDateRaw, r.installDateRaw,
            r.startDateFmt, r.endDateFmt, r.installDateFmt, r.team, r.status]
            .map(v => String(v||'').toLowerCase()).join(' ').includes(query));
    }

    const total = data.length;
    const totalPages = Math.ceil(total / sp.pageSize) || 1;
    if (sp.page > totalPages) sp.page = totalPages;
    if (sp.page < 1) sp.page = 1;
    const startIdx = (sp.page - 1) * sp.pageSize;
    const pageData = data.slice(startIdx, startIdx + sp.pageSize);

    const colCount = sp.isPic ? 10 : 9;
    const rows = total === 0
        ? `<tr><td colspan="${colCount}" style="text-align:center;color:var(--main-text3);padding:30px">${
            query ? `No items matching "${esc(query)}"` : (sp.isPic ? 'No items. Click "+ Add Item" to create.' : 'No items.')
        }</td></tr>`
        : pageData.map((r, idx) => {
            const actionCell = sp.isPic ? `<td><div class="actions-cell">
                <button class="btn-icon" onclick="empShowEditItem(${r.id})">&#9998;</button>
                <button class="btn-icon danger" onclick="empConfirmDeleteItem(${r.id})">&#10005;</button>
            </div></td>` : '';
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx+idx+1}</td>
                <td style="font-family:var(--font-d);font-size:1rem">${r.name}</td>
                <td>${r.customer}</td>
                <td style="font-family:var(--font-m);font-size:.85rem">${r.startDateFmt||'\u2014'}</td>
                <td style="font-family:var(--font-m);font-size:.85rem">${r.endDateFmt||'\u2014'}</td>
                <td style="font-family:var(--font-m);font-size:.85rem">${r.installDateFmt||'\u2014'}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.cdHtml}</td>
                <td style="font-size:.85rem">${r.team}</td>
                ${actionCell}</tr>`;
        }).join('');

    const goFnName = `goScopePage_${scopeId}`;
    const sizeFnName = `chgScopeSize_${scopeId}`;
    window[goFnName] = p => goScopeItemsPage(scopeId, p);
    window[sizeFnName] = s => changeScopeItemsPageSize(scopeId, s);

    const pagHtml = total > 0 ? buildPagination(total, sp.page, sp.pageSize,
        goFnName, sizeFnName,
        { label: 'items', sizes: [5,10,25] }) : '';

    document.getElementById(`scope-items-table-${scopeId}`).innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr>
                <th style="width:50px">No</th><th>ID/Name</th><th>Customer</th>
                <th style="width:100px">Start</th><th style="width:100px">End</th><th style="width:100px">Install</th>
                <th style="width:110px">Status</th><th>Countdown</th><th>Team</th>
                ${sp.isPic ? '<th style="width:80px">Actions</th>' : ''}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>${pagHtml}`;
};

// 通用分页生成
const genericPagination = (total, page, pageSize, goFnPattern, changeFnPattern, sizeOpts) => {
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const showFrom = (page-1)*pageSize + 1;
    const showTo = Math.min(page*pageSize, total);
    const maxV = 5, stP = Math.max(1, page-Math.floor(maxV/2)), enP = Math.min(totalPages, stP+maxV-1);
    const adjSt = enP - stP < maxV - 1 ? Math.max(1, enP-maxV+1) : stP;
    let btns = `<button onclick="${goFnPattern.replace('__PAGE__', 1)}" ${page===1?'disabled':''}>&laquo;</button>
                <button onclick="${goFnPattern.replace('__PAGE__', page-1)}" ${page===1?'disabled':''}>&lsaquo;</button>`;
    for (let p = adjSt; p <= enP; p++) btns += `<button onclick="${goFnPattern.replace('__PAGE__', p)}" class="${p===page?'active':''}">${p}</button>`;
    btns += `<button onclick="${goFnPattern.replace('__PAGE__', page+1)}" ${page===totalPages?'disabled':''}>&rsaquo;</button>
             <button onclick="${goFnPattern.replace('__PAGE__', totalPages)}" ${page===totalPages?'disabled':''}>&raquo;</button>`;
    return `<div class="pagination">
        <div class="pagination-info">Showing ${showFrom} to ${showTo} of ${total}</div>
        <div style="display:flex;align-items:center;gap:20px">
            <div class="pagination-size"><label>Show</label>
                <select onchange="${changeFnPattern.replace('__SIZE__', 'this.value')}">
                    ${sizeOpts.map(s => `<option value="${s}"${pageSize===s?' selected':''}>${s}</option>`).join('')}
                </select></div>
            <div class="pagination-controls">${btns}</div>
        </div></div>`;
};

const goScopeItemsPage = (scopeId, page) => {
    const sp = empScopePages[scopeId];
    if (!sp) return;
    const totalPages = Math.ceil(sp.data.length / sp.pageSize) || 1;
    sp.page = page < 1 ? 1 : page > totalPages ? totalPages : page;
    renderScopeItemsTable(scopeId);
};

const changeScopeItemsPageSize = (scopeId, size) => {
    const sp = empScopePages[scopeId];
    if (!sp) return;
    sp.pageSize = parseInt(size);
    sp.page = 1;
    renderScopeItemsTable(scopeId);
};



/* ==========================================================
   SECTION 12: EMPLOYEE — ATTENDANCE TIME ENTRIES (final)
   ========================================================== */
let empAttCurrentPage = 1, empAttPageSize = 10;
let empAttFilteredData = [];
let empAttSelectedMemberIds = [];
let _empModalMember = null, _empModalExtraProjectId = null;
var _empAttInitialLoad = false;
let _empOtPerEntry = new Map();

// ---------- Helpers ----------
const getEmployeeProjects = memberId =>
    DB.projectAssignments
        .filter(pa => pa.memberId === memberId)
        .map(pa => DB.projects.find(p => p.id === pa.projectId))
        .filter(Boolean);

const canMemberViewScope = (member, scope) => {
    if (!scope) return true;
    const deptIds = scope.departmentIds || [];
    return !deptIds.length || (!!member && !!member.departmentId && deptIds.includes(member.departmentId));
};

const getEmployeeVisibleScopes = (member, extraScopeId) =>
    DB.scopes.filter(s => s.id === extraScopeId || canMemberViewScope(member, s));

const getEmployeeVisibleProjects = (member, extraProjectId) => {
    const visibleScopeIds = getEmployeeVisibleScopes(member).map(s => s.id);
    return DB.projects.filter(p => p.id === extraProjectId || !p.categoryId || visibleScopeIds.includes(p.categoryId));
};

const sortProjects = list => {
    list.sort((a, b) => (a.name.toLowerCase() === 'other' ? 1 : 0) - (b.name.toLowerCase() === 'other' ? 1 : 0) || a.name.localeCompare(b.name));
    return list;
};

const buildProjectOptions = projects => {
    const opts = [];
    let seenOther = false;
    for (const p of projects) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; opts.push({ value: 0, label: 'Other' }); }
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    }
    return opts;
};

const getProjectsByScope = (scopeId, extraProjectId = null) => {
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return [];
    const vis = getEmployeeVisibleProjects(member, extraProjectId);
    const filtered = scopeId ? vis.filter(p => p.categoryId === scopeId) : vis;
    return sortProjects(filtered);
};

const updateScopeAndProjectSelects = (scopeEl, itemEl, workplanEl, workdoneEl, extraProjectId) => {
    const scopeId = scopeEl ? parseInt(scopeEl.value) || null : null;
    const projects = getProjectsByScope(scopeId, extraProjectId);
    ssUpdate(itemEl, buildProjectOptions(projects), false);
    const wl = scopeId ? DB.worklist.filter(w => w.scopeId === scopeId) : DB.worklist;
    const wlOpts = wl.map(w => ({ value: w.id, label: w.title }));
    ssUpdate(workplanEl, wlOpts, false);
    ssUpdate(workdoneEl, wlOpts, false);

    // Hide/show Work Plan and Work Done fields
    const wpEl = document.getElementById(workplanEl);
    const wdEl = document.getElementById(workdoneEl);
    if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
    if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
};

const updateScopeAndProjectSelectsFromValue = (scopeId, itemEl, workplanEl, workdoneEl, extraProjectId) => {
    if (!scopeId) {
        ssUpdate(itemEl, [], false);
        ssUpdate(workplanEl, [], false);
        ssUpdate(workdoneEl, [], false);
        return;
    }
    const projects = getProjectsByScope(scopeId, extraProjectId);
    ssUpdate(itemEl, buildProjectOptions(projects), false);
    const wl = DB.worklist.filter(w => w.scopeId === scopeId);
    const wlOpts = wl.map(w => ({ value: w.id, label: w.title }));
    ssUpdate(workplanEl, wlOpts, false);
    ssUpdate(workdoneEl, wlOpts, false);

    const wpEl = document.getElementById(workplanEl);
    const wdEl = document.getElementById(workdoneEl);
    if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
    if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
};

const empBuildTimeEntryModal = (title, entry, extraProjectId) => {
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return '';

    const isNew = !entry;
    const defaultStart = isNew ? '09:00' : (entry.clockIn ? entry.clockIn.split('T')[1].substring(0,5) : '');
    const defaultEnd   = isNew ? '18:00' : (entry.clockOut ? entry.clockOut.split('T')[1].substring(0,5) : '');

    return `<h3>${title}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label>Date</label><input class="input" id="entry-date" type="date" value="${entry ? entry.date : todayStr()}"></div><br>
            <div class="field"><label>Category</label><div id="ss-entry-scope"></div></div>
            <div class="field"><label>ID/Name</label><div id="ss-entry-item"></div></div>
            <div style="display:none"><select class="input" id="entry-detail">${detailOpts(entry ? entry.detailId : null)}</select></div>
            <div class="field"><label>Work Plan</label><div id="ss-entry-workplan"></div></div>
            <div class="field"><label>Work Done</label><div id="ss-entry-workdone"></div></div>
            <div class="field"><label>Start Time</label><input class="input" id="entry-start" type="time" value="${defaultStart}"></div>
            <div class="field"><label>End Time</label><input class="input" id="entry-end" type="time" value="${defaultEnd}"></div>
        </div>
        <div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="entry-desc" rows="2" style="resize:vertical">${esc(entry?.description || '')}</textarea></div>
        <p class="auth-error" id="entry-error"></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" id="entry-save-btn">Save</button></div>`;
};

const showAddTimeEntry = () => {
    try {
        showModal('<div style="max-height:85vh;overflow-y:auto;padding-right:4px">' + empBuildTimeEntryModal('Add Time Entry', null, null) + '</div>');
        setTimeout(() => {
            const member = DB.members.find(m => m.id === currentUser.memberId);
            _empModalMember = member;
            const visibleScopes = getEmployeeVisibleScopes(member, null);

            ssCreate('ss-entry-scope', visibleScopes.map(s => ({ value: s.id, label: s.name })), '-- Select Category --', function(val) {
                updateScopeAndProjectSelectsFromValue(val ? parseInt(val) : null, 'ss-entry-item', 'ss-entry-workplan', 'ss-entry-workdone', null);
            });

            ssCreate('ss-entry-item', [], '-- Select Category First --');
            const wlOpts = DB.worklist.map(w => ({ value: w.id, label: w.title }));
            ssCreate('ss-entry-workplan', wlOpts, '-- None --');
            ssCreate('ss-entry-workdone', wlOpts, '-- None --');

            const wpEl = document.getElementById('ss-entry-workplan');
            const wdEl = document.getElementById('ss-entry-workdone');
            if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
            if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';

            document.getElementById('entry-save-btn').onclick = doAddTimeEntry;
        }, 50);
    } catch (e) { alert('Error: ' + e.message); }
};

const showEditTimeEntry = entryId => {
    const entry = DB.attendance.find(a => a.id === entryId);
    if (!entry) return;
    const extraProjectId = entry.projectId || null;
    showModal('<div style="max-height:85vh;overflow-y:auto;padding-right:4px">' + empBuildTimeEntryModal('Edit Time Entry', entry, extraProjectId) + '</div>');
    setTimeout(() => {
        const member = DB.members.find(m => m.id === currentUser.memberId);
        _empModalMember = member;
        _empModalExtraProjectId = extraProjectId;
        const curScopeId = entry.projectId ? DB.projects.find(p => p.id === entry.projectId)?.categoryId : null;
        const visibleScopes = getEmployeeVisibleScopes(member, extraProjectId);

        ssCreate('ss-entry-scope', visibleScopes.map(s => ({ value: s.id, label: s.name })), '-- Select Category --', function(val) {
            updateScopeAndProjectSelectsFromValue(val ? parseInt(val) : null, 'ss-entry-item', 'ss-entry-workplan', 'ss-entry-workdone', extraProjectId);
        });
        if (curScopeId) ssSetValue('ss-entry-scope', curScopeId);

        const projects = getProjectsByScope(curScopeId, extraProjectId);
        ssCreate('ss-entry-item', buildProjectOptions(projects), '-- Select ID/Name --');
        if (entry.projectId) ssSetValue('ss-entry-item', entry.projectId);

        const wl = curScopeId ? DB.worklist.filter(w => w.scopeId === curScopeId) : DB.worklist;
        const wlOpts = wl.map(w => ({ value: w.id, label: w.title }));
        ssCreate('ss-entry-workplan', wlOpts, '-- None --');
        if (entry.work_plan_id) ssSetValue('ss-entry-workplan', entry.work_plan_id);
        ssCreate('ss-entry-workdone', wlOpts, '-- None --');
        if (entry.work_done_id) ssSetValue('ss-entry-workdone', entry.work_done_id);

        const wpEl = document.getElementById('ss-entry-workplan');
        const wdEl = document.getElementById('ss-entry-workdone');
        if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
        if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';

        document.getElementById('entry-save-btn').onclick = () => doEditTimeEntry(entryId);
    }, 50);
};

const doAddTimeEntry = async () => saveTimeEntry(null);
const doEditTimeEntry = async entryId => saveTimeEntry(entryId);

const saveTimeEntry = (entryId) => {
    const errEl = document.getElementById('entry-error');
    const date = document.getElementById('entry-date').value;
    const projectIdRaw = ssGetValue('ss-entry-item');
    const detailId = document.getElementById('entry-detail')?.value || '';
    const wpId = ssGetValue('ss-entry-workplan');
    const wdId = ssGetValue('ss-entry-workdone');
    const start = document.getElementById('entry-start').value;
    const end = document.getElementById('entry-end').value;
    const desc = document.getElementById('entry-desc').value.trim();

    errEl.textContent = '';
    if (!date || !projectIdRaw || !start || !end) {
        errEl.textContent = !date ? 'Date required' : !projectIdRaw ? 'Select item' : !start ? 'Start required' : 'End required';
        return;
    }
    if (start >= end) { errEl.textContent = 'End time must be after start'; return; }

    // 把 "Other" (value=0) 转成真实的 project ID
    let projectId = parseInt(projectIdRaw);
    if (projectId === 0) {
        const scopeVal = ssGetValue('ss-entry-scope');
        const scopeId = scopeVal ? parseInt(scopeVal) : null;
        const otherProj = DB.projects.find(p =>
            p.name.toLowerCase() === 'other' && (!scopeId || p.categoryId === scopeId)
        );
        if (otherProj) projectId = otherProj.id;
    }

    const newStart = `${date}T${start}:00`;
    const newEnd = `${date}T${end}:00`;

    const overlap = checkOverlap(currentUser.memberId, date, newStart, newEnd, entryId);
    if (overlap) { errEl.textContent = overlap; return; }

    const body = {
        memberId: currentUser.memberId,
        date,
        clockIn: newStart,
        clockOut: newEnd,
        projectId: projectId,
        detailId: detailId ? parseInt(detailId) : null,
        work_plan_id: wpId ? parseInt(wpId) : null,
        work_done_id: wdId ? parseInt(wdId) : null,
        description: desc
    };

    const request = entryId
        ? api('/attendance/' + entryId, { method: 'PUT', body })
        : api('/attendance', { method: 'POST', body });

    request
        .then(() => { hideModal(); return loadDB(); })
        .then(() => refreshEmpAttendanceData())
        .catch(e => { errEl.textContent = 'Failed: ' + e.message; });
};

const checkOverlap = (memberId, date, newStart, newEnd, excludeId) => {
    const entries = DB.attendance.filter(a => a.memberId === memberId && a.date === date && a.clockIn && a.clockOut && a.id !== excludeId);
    for (const e of entries) {
        if (newStart < e.clockOut && newEnd > e.clockIn) {
            const os = e.clockIn.split('T')[1].substring(0,5);
            const oe = e.clockOut.split('T')[1].substring(0,5);
            const proj = e.projectId ? DB.projects.find(p => p.id === e.projectId) : null;
            const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
            const label = scope ? `${scope.name} → ${proj.name}` : (proj ? proj.name : '');
            return `Overlaps with ${os}-${oe}${label ? ' (' + label + ')' : ''}`;
        }
    }
    return null;
};

const confirmDeleteTimeEntry = entryId => {
    const entry = DB.attendance.find(a => a.id === entryId);
    if (!entry) return;
    const proj = entry.projectId ? DB.projects.find(p => p.id === entry.projectId) : null;
    const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
    const label = proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : '—';
    showModal(`<h3>Delete Time Entry</h3>
        <p style="color:var(--main-text2);line-height:1.6">Delete this entry?<br>
        Date: <strong style="color:var(--main-text)">${formatDateDMY(entry.date)}</strong><br>
        Item: <strong style="color:var(--main-text)">${esc(label)}</strong></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
        <button class="btn btn-danger" onclick="doDeleteTimeEntry(${entryId})">Delete</button></div>`);
};

const doDeleteTimeEntry = (entryId) => {
    api('/attendance/' + entryId, { method: 'DELETE' })
        .then(() => { hideModal(); return loadDB(); })
        .then(() => { refreshEmpAttendanceData(); showToast('Time entry deleted successfully'); })
        .catch(e => { alert('Failed: ' + e.message); });
};

// ---------- Core render logic (shared) ----------
const _doRenderEmpAttendance = (member, animate) => {
    empAttCurrentPage = 1; empAttPageSize = 10;
    const isPIC = empIsPIC();
    if (!empAttSelectedMemberIds.length) empAttSelectedMemberIds = [member.id];

    const viewMemberIds = empAttSelectedMemberIds.length ? empAttSelectedMemberIds : [member.id];
    const myEntries = DB.attendance.filter(a => viewMemberIds.includes(a.memberId));
    const myProjectIds = [...new Set(myEntries.filter(a => a.projectId).map(a => a.projectId))];
    const myProjects = DB.projects.filter(p => myProjectIds.includes(p.id));
    const myScopeIds = [...new Set(myProjects.filter(p => p.categoryId).map(p => p.categoryId))];
    const myScopes = DB.scopes.filter(s => myScopeIds.includes(s.id));

    let picEmpOpts = [];
    if (isPIC) {
        const picScopeIds = getPICScopeIds();
        const picMemberIds = new Set([member.id]);
        DB.projectAssignments.forEach(pa => {
            const proj = DB.projects.find(p => p.id === pa.projectId);
            if (proj && picScopeIds.includes(proj.categoryId)) picMemberIds.add(pa.memberId);
        });
        DB.attendance.forEach(a => {
            if (!a.projectId) return;
            const proj = DB.projects.find(p => p.id === a.projectId);
            if (proj && picScopeIds.includes(proj.categoryId)) picMemberIds.add(a.memberId);
        });
        const viewerIds = getViewerMemberIds();
        picEmpOpts = [...picMemberIds].filter(mid => !viewerIds.includes(mid))
            .map(mid => DB.members.find(m => m.id === mid)).filter(Boolean)
            .sort((a,b) => a.name.localeCompare(b.name))
            .map(m => ({ value: m.id, label: m.name + (m.id === member.id ? ' (You)' : '') }));
    }

    const today = todayStr();
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const defaultFrom = d30.toISOString().slice(0,10);

    const af = animate ? ' pt-anim-filter' : '';
    const ah = animate ? ' pt-anim-head' : '';
    const at = animate ? ' pt-anim-table' : '';

    const view = document.getElementById('emp-attendance');
    view.innerHTML = `
        <div class="app-header"><h2>My Attendance</h2><div class="header-sub">Log and track your work hours</div></div>
        <div class="app-body" style="max-width:none">
            <div class="${af} filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                    <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
                    <button class="btn btn-blue btn-sm" onclick="exportEmpAttendanceExcel()">&#128196; Export Excel</button>
                </div>
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="emp-att-from" value="${defaultFrom}" onchange="applyEmpAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="emp-att-to" value="${today}" onchange="applyEmpAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-emp-scope"></div></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-emp-item"></div></div>
                    ${isPIC ? `<div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:180px" id="ssm-pic-emp"></div></div>` : ''}
                    <div style="display:flex;gap:8px;margin-left:auto">
                        <button class="btn btn-ghost btn-sm" onclick="resetEmpAttendanceFilter()">Reset</button>
                    </div>
                </div>
            </div>
            <div class="${ah}" id="emp-att-stats-area"></div>
            <div class="${at}">
                <div class="section-head time-entry-head"><h2>Time Entries</h2><button class="btn btn-green" onclick="showAddTimeEntry()">+ Add Attendance</button></div>
                <div id="emp-att-table-area"></div>
            </div>
        </div>`;

    const setupDelay = animate ? 250 : 50;

    setTimeout(() => {
        ssmCreate('ssm-emp-scope', myScopes.map(s => ({ value: s.id, label: s.name })), 'All Categories');
        ssmCreate('ssm-emp-item', buildProjectOptions(sortProjects(myProjects)), 'All ID/Name');
        if (isPIC) {
            ssmCreate('ssm-pic-emp', picEmpOpts, 'All Employees');
            ssmToggleOption('ssm-pic-emp', String(member.id), true);
            ssmOnChange('ssm-pic-emp', () => {
                empAttSelectedMemberIds = ssmGetValues('ssm-pic-emp').map(Number) || [member.id];
                _updateEmpAttScopeAndItem();
                applyEmpAttendanceFilter();
            });
        }
        ssmOnChange('ssm-emp-scope', selected => {
            const numIds = selected.map(Number);
            const filtered = numIds.length ? myProjects.filter(p => numIds.includes(p.categoryId)) : myProjects;
            ssmUpdate('ssm-emp-item', buildProjectOptions(sortProjects(filtered)), true);
            applyEmpAttendanceFilter();
        });
        ssmOnChange('ssm-emp-item', () => applyEmpAttendanceFilter());
        _empAttInitialLoad = true;
        applyEmpAttendanceFilter();
        _empAttInitialLoad = false;

        // 等所有动画结束后再移除 class（filter 0.45s + head 0.7s + table 0.95s）
        if (animate) {
            setTimeout(() => {
                const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
                animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
                empAttRenderLock = false;
            }, 1000);
        }
    }, setupDelay);

    if (animate) {
        setTimeout(() => { empAttRenderLock = false; }, 850);
    } else {
        animCrud('emp-att-stats-area', 'emp-att-table-area');
    }
};

// ---------- 首次进入页面（有动画） ----------
let empAttRenderLock = false;
const renderEmployeeAttendance = () => {
    if (empAttRenderLock) return;
    if (!currentUser?.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;
    empAttRenderLock = true;
    _doRenderEmpAttendance(member, true);
};

// ---------- CRUD 后刷新（无动画） ----------
const refreshEmpAttendanceData = () => {
    if (!currentUser?.memberId) return;
    // filter DOM 未动，只需重新应用筛选刷新 stats + table
    applyEmpAttendanceFilter();
};

const _updateEmpAttScopeAndItem = () => {
    const viewMemberIds = empAttSelectedMemberIds.length ? empAttSelectedMemberIds : [currentUser.memberId];
    const myEntries = DB.attendance.filter(a => viewMemberIds.includes(a.memberId));
    const myProjectIds = [...new Set(myEntries.filter(a => a.projectId).map(a => a.projectId))];
    const myProjects = DB.projects.filter(p => myProjectIds.includes(p.id));
    const myScopeIds = [...new Set(myProjects.filter(p => p.categoryId).map(p => p.categoryId))];
    ssmUpdate('ssm-emp-scope', DB.scopes.filter(s => myScopeIds.includes(s.id)).map(s => ({ value: s.id, label: s.name })), false);
    ssmUpdate('ssm-emp-item', buildProjectOptions(sortProjects(myProjects)), false);
};

const resetEmpAttendanceFilter = () => {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    document.getElementById('emp-att-from').value = d30.toISOString().slice(0,10);
    document.getElementById('emp-att-to').value = todayStr();
    empAttSelectedMemberIds = [currentUser.memberId];
    ssmClear('ssm-emp-scope'); ssmClear('ssm-emp-item');
    if (document.getElementById('ssm-pic-emp')) ssmClear('ssm-pic-emp');
    _updateEmpAttScopeAndItem();
    empAttCurrentPage = 1;
    applyEmpAttendanceFilter();
};

const applyEmpAttendanceFilter = () => {
    if (!currentUser?.memberId) return;
    const viewMemberIds = empAttSelectedMemberIds.length ? empAttSelectedMemberIds : [currentUser.memberId];
    const fromDate = document.getElementById('emp-att-from')?.value;
    const toDate = document.getElementById('emp-att-to')?.value;
    if (!fromDate || !toDate) return;

    const scopeIds = ssmGetValues('ssm-emp-scope').map(Number);
    const itemIds = ssmGetValues('ssm-emp-item').map(Number);

    let filtered = DB.attendance.filter(a => viewMemberIds.includes(a.memberId) && a.date >= fromDate && a.date <= toDate);
    if (scopeIds.length) {
        const sids = DB.projects.filter(p => scopeIds.includes(p.categoryId)).map(p => p.id);
        filtered = filtered.filter(a => sids.includes(a.projectId));
    }
    if (itemIds.length) {
        const expanded = expandOtherItemIds(itemIds);
        filtered = filtered.filter(a => expanded.includes(a.projectId));
    }

    filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    empAttFilteredData = filtered;

        // Group by member+date for daily OT
    const dayMap = new Map();
    filtered.forEach(r => {
        const key = r.memberId + '_' + r.date;
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key).push(r);
    });

    _empOtPerEntry = new Map();
    let totalMs = 0, totalCost = 0, totalOtMs = 0;

    dayMap.forEach((dayEntries) => {
        const memberId = dayEntries[0].memberId;
        const date = dayEntries[0].date;

        // Sort by clockIn time to track cumulative correctly
        dayEntries.sort((a, b) => (a.clockIn || '').localeCompare(b.clockIn || ''));

        const anyWithClock = dayEntries.find(r => r.clockIn && r.clockOut);
        if (!anyWithClock) return;
        const stdResult = calcOT(anyWithClock.clockIn, anyWithClock.clockOut, memberId, date);
        const standardMs = stdResult.standardHours * 3600000;

        let cumulativeMs = 0;
        let dayOtMs = 0;

        dayEntries.forEach(r => {
            const result = calcOT(r.clockIn, r.clockOut, memberId, r.date);
            const entryMs = result.ms || 0;
            const prevCumulative = cumulativeMs;
            cumulativeMs += entryMs;
            totalMs += entryMs;
            totalCost += getEntryCost(memberId, entryMs) || 0;

            // OT only for the portion that crosses standard
            let entryOtMs = 0;
            if (prevCumulative < standardMs) {
                if (cumulativeMs > standardMs) {
                    entryOtMs = cumulativeMs - standardMs;
                }
            } else {
                entryOtMs = entryMs;
            }

            _empOtPerEntry.set(r.id, entryOtMs);
            dayOtMs += entryOtMs;
        });

        totalOtMs += dayOtMs;
    });

    const ac = _empAttInitialLoad ? ' stat-anim' : '';
    document.getElementById('emp-att-stats-area').innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px">
            <div class="stat-card${ac}"><div class="stat-label">Entries</div><div class="stat-value" style="font-size:1.2rem">${filtered.length}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Hours</div><div class="stat-value" style="font-size:1.2rem">${formatDuration(totalMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">OT</div><div class="stat-value" style="font-size:1.2rem;color:var(--warning)">${formatDuration(totalOtMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Cost</div><div class="stat-value" style="font-size:1.2rem">${fmtCost(totalCost)}</div></div>
        </div>`;

    const totalPages = Math.ceil(filtered.length / empAttPageSize) || 1;
    if (empAttCurrentPage > totalPages) empAttCurrentPage = totalPages;
    if (empAttCurrentPage < 1) empAttCurrentPage = 1;
    renderEmpAttendancePage();
};

// Table + pagination
const renderEmpAttendancePage = () => {
    const filtered = empAttFilteredData;
    const totalPages = Math.ceil(filtered.length / empAttPageSize) || 1;
    const start = (empAttCurrentPage - 1) * empAttPageSize;
    const page = filtered.slice(start, start + empAttPageSize);
    const showEmpCol = empAttSelectedMemberIds.length > 1 || (empAttSelectedMemberIds.length && empAttSelectedMemberIds[0] !== currentUser.memberId);

    const thead = `<tr>
        <th style="width:50px">No</th><th>Date</th><th>Day</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th>${showEmpCol ? '<th>Employee</th>' : ''}<th>Category → ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th style="width:90px">Actions</th></tr>`;

    const rows = filtered.length === 0
        ? `<tr><td colspan="${showEmpCol ? 13 : 12}" style="text-align:center;color:var(--main-text3);padding:30px">No time entries found</td></tr>`
        : page.map((r, idx) => {
            const emp = r.memberId ? DB.members.find(m => m.id === r.memberId) : null;
            const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
            const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
            const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
            const dur = result.ms ? formatDuration(result.ms) : '\u2014';
            const entryOtMs = _empOtPerEntry.get(r.id) || 0;
            const otDisp = entryOtMs > 0 ? formatDuration(entryOtMs) : '\u2014';
            const otColor = entryOtMs > 0 ? 'color:var(--warning)' : 'color:var(--main-text3)';
            const sTime = r.clockIn ? formatTime(r.clockIn) : '\u2014';
            const eTime = r.clockOut ? formatTime(r.clockOut) : '\u2014';
            const itemDisp = proj ? (scope ? `${esc(scope.name)} → ${esc(proj.name)}` : esc(proj.name)) : '\u2014';
            const wp = r.work_plan_id ? DB.worklist.find(w => w.id === r.work_plan_id) : null;
            const wd = r.work_done_id ? DB.worklist.find(w => w.id === r.work_done_id) : null;
            const isOwn = r.memberId === currentUser.memberId;
            const dayNum = new Date(r.date).getDay();
            const dayName = DAY_NAMES[dayNum];
            const dayColor = dayName === 'Sun' ? 'var(--danger)' : dayName === 'Sat' ? 'var(--warning)' : 'var(--main-text)';
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start + idx + 1}</td>
                <td style="font-family:var(--font-m)">${formatDateDMY(r.date)}</td>
                <td style="color:${dayColor};font-weight:600">${dayName}</td>
                <td style="font-family:var(--font-m)">${sTime}</td>
                <td style="font-family:var(--font-m)">${eTime}</td>
                <td style="text-align:right;font-family:var(--font-m)">${dur}</td>
                <td style="text-align:right;font-family:var(--font-m);${otColor}">${otDisp}</td>
                ${showEmpCol ? `<td>${emp ? esc(emp.name) : '?'}</td>` : ''}
                <td>${itemDisp}</td>
                <td>${wp ? esc(wp.title) : '<span style="color:var(--main-text3)">\u2014</span>'}</td>
                <td>${wd ? esc(wd.title) : '<span style="color:var(--main-text3)">\u2014</span>'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.description||'')}">${r.description ? esc(r.description) : '<span style="color:var(--main-text3)">\u2014</span>'}</td>
                <td>${isOwn ? `<div class="actions-cell"><button class="btn-icon" onclick="showEditTimeEntry(${r.id})">&#9998;</button><button class="btn-icon danger" onclick="confirmDeleteTimeEntry(${r.id})">&#10005;</button></div>` : ''}</td>
            </tr>`;
        }).join('');

        const pagHtml = buildPagination(filtered.length, empAttCurrentPage, empAttPageSize,
            'goEmpAttPage', 'changeEmpAttPageSize',
            { label: 'entries', sizes: [5, 10, 25, 50, 100] });

    document.getElementById('emp-att-table-area').innerHTML = `<div class="table-wrap"><table><thead>${thead}</thead><tbody>${rows}</tbody></table></div>${pagHtml}`;
};

const goEmpAttPage = page => {
    const totalPages = Math.ceil(empAttFilteredData.length / empAttPageSize) || 1;
    empAttCurrentPage = Math.max(1, Math.min(page, totalPages));
    renderEmpAttendancePage();
};
const changeEmpAttPageSize = size => { empAttPageSize = parseInt(size); empAttCurrentPage = 1; renderEmpAttendancePage(); };

// CSV export
const exportEmpAttendanceExcel = () => {
    const data = empAttFilteredData;
    if (!data.length) { alert('No data to export'); return; }

    const showEmpCol = empAttSelectedMemberIds.length > 1 || (empAttSelectedMemberIds.length && empAttSelectedMemberIds[0] !== currentUser.memberId);

    const headers = showEmpCol
        ? ['No', 'Date', 'Day', 'Start', 'End', 'Duration', 'OT', 'Employee', 'Category', 'ID/Name', 'Work Plan', 'Work Done', 'Remark']
        : ['No', 'Date', 'Day', 'Start', 'End', 'Duration', 'OT', 'Category', 'ID/Name', 'Work Plan', 'Work Done', 'Remark'];

    const rows = data.map((r, idx) => {
        const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const emp = DB.members.find(m => m.id === r.memberId);
        const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
        const dur = result.ms ? formatDuration(result.ms) : '';
        const entryOtMs = _empOtPerEntry.get(r.id) || 0;
        const ot = entryOtMs > 0 ? formatDuration(entryOtMs) : '';
        const sT = r.clockIn ? formatTime(r.clockIn) : '';
        const eT = r.clockOut ? formatTime(r.clockOut) : '';
        const wp = r.work_plan_id ? DB.worklist.find(w => w.id === r.work_plan_id) : null;
        const wd = r.work_done_id ? DB.worklist.find(w => w.id === r.work_done_id) : null;
        const dayNum = new Date(r.date).getDay();
        const dayName = DAY_NAMES[dayNum];
        const base = [idx + 1, r.date, dayName, sT, eT, dur, ot];
        if (showEmpCol) base.push(emp ? emp.name : '');
        base.push(scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', r.description || '');
        return base;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = showEmpCol
        ? [{wch:6},{wch:12},{wch:6},{wch:8},{wch:8},{wch:12},{wch:12},{wch:18},{wch:15},{wch:25},{wch:20},{wch:20},{wch:30}]
        : [{wch:6},{wch:12},{wch:6},{wch:8},{wch:8},{wch:12},{wch:12},{wch:15},{wch:25},{wch:20},{wch:20},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    XLSX.writeFile(wb, 'my_attendance_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};

// Toast
const showToast = message => {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
};

/* ==========================================================
   SECTION: EMPLOYEE — REPORT (PIC only) - Optimized
   ========================================================== */
let empRptItemPage = 1, empRptItemPageSize = 10, empRptItemData_cache = [];
let empRptEmpPage = 1, empRptEmpPageSize = 10, empRptEmpData_cache = [];
let empRptTimePage = 1, empRptTimePageSize = 10, empRptTimeData_cache = [];
var _empRptInitialLoad = false;

// ---------- helpers ----------
const getPICScopeIds = () => {
    if (!currentUser?.memberId) return [];
    return DB.scopes.filter(s => s.picMemberIds?.includes(currentUser.memberId)).map(s => s.id);
};

const getPICMemberIds = () => {
    const picScopeIds = getPICScopeIds();
    if (!picScopeIds.length) return [];
    const picProjectIds = DB.projects.filter(p => p.categoryId && picScopeIds.includes(p.categoryId)).map(p => p.id);
    const memberIds = new Set();
    DB.projectAssignments.forEach(pa => {
        const proj = DB.projects.find(p => p.id === pa.projectId);
        if (proj && picScopeIds.includes(proj.categoryId)) memberIds.add(pa.memberId);
    });
    DB.attendance.forEach(a => {
        if (a.projectId && picProjectIds.includes(a.projectId)) memberIds.add(a.memberId);
    });
    const viewerIds = getViewerMemberIds();
    return [...memberIds].filter(mid => !viewerIds.includes(mid));
};

const buildProjectOpts = (projects) => {
    let seenOther = false;
    const opts = [];
    for (const p of projects) {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; opts.push({ value: 0, label: 'Other' }); }
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    }
    return opts;
};

const buildEmpRptEmpOpts = (scopeIds, itemIds) => {
    const memberIds = getPICMemberIds();
    if ((scopeIds && scopeIds.length) || (itemIds && itemIds.length)) {
        let filterProjectIds = DB.projects.map(p => p.id);
        if (scopeIds && scopeIds.length) {
            filterProjectIds = DB.projects.filter(p => p.categoryId && scopeIds.includes(p.categoryId)).map(p => p.id);
        }
        if (itemIds && itemIds.length) {
            const expanded = expandOtherItemIds(itemIds);
            filterProjectIds = filterProjectIds.filter(id => expanded.includes(id));
        }
        const attendanceMemberIds = new Set(
            DB.attendance.filter(a => a.projectId && filterProjectIds.includes(a.projectId)).map(a => a.memberId)
        );
        return memberIds
            .filter(mid => attendanceMemberIds.has(mid))
            .map(mid => DB.members.find(m => m.id === mid))
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => ({ value: m.id, label: m.name }));
    }
    return memberIds
        .map(mid => DB.members.find(m => m.id === mid))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(m => ({ value: m.id, label: m.name }));
};

// ---------- Main Render ----------
let empRptRenderLock = false;
const renderEmpReport = () => {
    if (empRptRenderLock) return;
    empRptRenderLock = true;

    const today = todayStr();
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const defaultFrom = d30.toISOString().slice(0, 10);

    const picScopeIds = getPICScopeIds();
    const allScopeIds = picScopeIds.slice();
    const picMemberIds = getPICMemberIds();
    DB.attendance.forEach(a => {
        if (picMemberIds.includes(a.memberId) && a.projectId) {
            const proj = DB.projects.find(p => p.id === a.projectId);
            if (proj?.categoryId && !allScopeIds.includes(proj.categoryId)) {
                allScopeIds.push(proj.categoryId);
            }
        }
    });

    const scopeList = DB.scopes.filter(s => allScopeIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name));
    const deptList = DB.departments.slice().sort((a, b) => a.name.localeCompare(b.name));
    const picProjects = sortProjects(DB.projects.filter(p => p.categoryId && allScopeIds.includes(p.categoryId)));

    const scopeOpts = scopeList.map(s => ({ value: s.id, label: s.name }));
    const deptOpts = deptList.map(d => ({ value: d.id, label: d.name }));
    const itemOpts = buildProjectOpts(picProjects);
    const empOpts = buildEmpRptEmpOpts([], []);

    document.getElementById('emp-report').innerHTML = `
        <div class="app-header"><h2>Report</h2><div class="header-sub">PIC summary and analytics</div></div>
        <div class="app-body" style="max-width:none">
            <div class="pt-anim-filter filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                    <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
                    <button class="btn btn-blue btn-sm" onclick="exportEmpReportExcel()">&#128196; Export Excel</button>
                </div>
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="emp-rpt-from" value="${defaultFrom}" onchange="generateEmpReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="emp-rpt-to" value="${today}" onchange="generateEmpReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-emp-rpt-dept"></div></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-emp-rpt-scope"></div></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-emp-rpt-item"></div></div>
                    <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:160px" id="ssm-emp-rpt-emp"></div></div>
                    <div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="resetEmpReport()">Reset</button></div>
                </div>
            </div>
            <div class="pt-anim-head" id="emp-rpt-stats"></div>
            <div class="pt-anim-table" id="emp-rpt-charts-row1" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px"></div>
            <div id="emp-rpt-charts-row2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px"></div>
            <div id="emp-rpt-tables"></div>
        </div>`;

    setTimeout(() => {
        ssmCreate('ssm-emp-rpt-dept', deptOpts, 'All Departments');
        ssmCreate('ssm-emp-rpt-scope', scopeOpts, 'All Categories');
        ssmCreate('ssm-emp-rpt-item', itemOpts, 'All ID/Names');
        ssmCreate('ssm-emp-rpt-emp', empOpts, 'All Employees');

        ssmOnChange('ssm-emp-rpt-scope', (selectedScopeIds) => {
            const numIds = selectedScopeIds.map(Number);
            const filtered = numIds.length ? picProjects.filter(p => numIds.includes(p.categoryId)) : picProjects;
            ssmUpdate('ssm-emp-rpt-item', buildProjectOpts(filtered), true);
            const itemIds = ssmGetValues('ssm-emp-rpt-item').map(Number);
            const deptIds = ssmGetValues('ssm-emp-rpt-dept').map(Number);
            let empOpts = buildEmpRptEmpOpts(numIds, itemIds);
            if (deptIds.length) {
                const deptMids = DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id);
                empOpts = empOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-emp-rpt-emp', empOpts, true);
            generateEmpReport();
        });

        ssmOnChange('ssm-emp-rpt-dept', (selectedDeptIds) => {
            const numIds = selectedDeptIds.map(Number);
            const scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(Number);
            const itemIds = ssmGetValues('ssm-emp-rpt-item').map(Number);
            let empOpts = buildEmpRptEmpOpts(scopeIds, itemIds);
            if (numIds.length) {
                const deptMids = DB.members.filter(m => numIds.includes(m.departmentId)).map(m => m.id);
                empOpts = empOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-emp-rpt-emp', empOpts, true);
            generateEmpReport();
        });

        ssmOnChange('ssm-emp-rpt-item', (selectedItemIds) => {
            const scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(Number);
            const itemIds = selectedItemIds.map(Number);
            const deptIds = ssmGetValues('ssm-emp-rpt-dept').map(Number);
            let empOpts = buildEmpRptEmpOpts(scopeIds, itemIds);
            if (deptIds.length) {
                const deptMids = DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id);
                empOpts = empOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-emp-rpt-emp', empOpts, true);
            generateEmpReport();
        });

        ssmOnChange('ssm-emp-rpt-emp', () => generateEmpReport());

        _empRptInitialLoad = true;
        generateEmpReport();
        _empRptInitialLoad = false;

        setTimeout(() => {
            const view = document.getElementById('emp-report');
            const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
            animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
            empRptRenderLock = false;
        }, 700);
    }, 150);

    setTimeout(() => { empRptRenderLock = false; }, 500);
};

const resetEmpReport = () => {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    document.getElementById('emp-rpt-from').value = d30.toISOString().slice(0, 10);
    document.getElementById('emp-rpt-to').value = todayStr();
    ssmClear('ssm-emp-rpt-scope');
    ssmClear('ssm-emp-rpt-dept');
    const picProjects = sortProjects(DB.projects.filter(p => p.categoryId && getPICScopeIds().includes(p.categoryId)));
    ssmUpdate('ssm-emp-rpt-item', buildProjectOpts(picProjects), false);
    ssmUpdate('ssm-emp-rpt-emp', buildEmpRptEmpOpts([], []), false);
    generateEmpReport();
};

// ---------- Generate Report ----------
const generateEmpReport = () => {
    const fromDate = document.getElementById('emp-rpt-from').value;
    const toDate = document.getElementById('emp-rpt-to').value;
    const scopeIds = ssmGetValues('ssm-emp-rpt-scope').map(Number);
    const itemIds = ssmGetValues('ssm-emp-rpt-item').map(Number);
    const deptIds = ssmGetValues('ssm-emp-rpt-dept').map(Number);
    const empIds = ssmGetValues('ssm-emp-rpt-emp').map(Number);
    if (!fromDate || !toDate) return;

    const picMemberIds = getPICMemberIds();
    if (!picMemberIds.length) return;

    let filtered = DB.attendance.filter(a =>
        a.date >= fromDate && a.date <= toDate && picMemberIds.includes(a.memberId)
    );

    if (scopeIds.length) {
        const sids = DB.projects.filter(p => scopeIds.includes(p.categoryId)).map(p => p.id);
        filtered = filtered.filter(a => sids.includes(a.projectId));
    }
    if (itemIds.length) {
        const expanded = expandOtherItemIds(itemIds);
        filtered = filtered.filter(a => expanded.includes(a.projectId));
    }
    if (deptIds.length) {
        const deptMids = DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id);
        filtered = filtered.filter(a => deptMids.includes(a.memberId));
    }
    if (empIds.length) {
        filtered = filtered.filter(a => empIds.includes(a.memberId));
    }

    // Aggregate with OT (daily-based)
    let totalMs = 0, totalCost = 0, totalOtMs = 0, totalStandardMs = 0;
    const itemMap = new Map();
    const scopeMap = new Map();
    const empMap = new Map();
    const monthlyMap = new Map();
    const timeDetails = [];
    const entryByDay = new Map();
    const countedDays = new Set();
    const empCountedDays = new Set();

    filtered.forEach(r => {
        const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
        if (!result.ms) return;
        const { hours, standardHours: stdHrs, ms } = result;
        const cost = getEntryCost(r.memberId, ms) || 0;
        const standardMs = stdHrs * 3600000;
        const dayKey = r.memberId + '_' + r.date;

        totalMs += ms;
        totalCost += cost;

        // Overall standard: once per member+day
        if (!countedDays.has(dayKey)) {
            countedDays.add(dayKey);
            totalStandardMs += standardMs;
        }

        // Item map
        const pid = r.projectId || 0;
        if (!itemMap.has(pid)) itemMap.set(pid, { cost: 0, ms: 0, otMs: 0, standardMs: 0, entries: 0, members: new Set(), days: new Set(), _countedDays: new Set() });
        const is = itemMap.get(pid);
        is.cost += cost; is.ms += ms; is.entries++; is.members.add(r.memberId); is.days.add(r.date);
        // Item standard: once per member+day per item
        if (!is._countedDays.has(dayKey)) {
            is._countedDays.add(dayKey);
            is.standardMs += standardMs;
        }

        // Scope map
        const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        const sid = proj?.categoryId || 0;
        if (!scopeMap.has(sid)) scopeMap.set(sid, { cost: 0 });
        scopeMap.get(sid).cost += cost;

        // Emp map
        if (!empMap.has(r.memberId)) empMap.set(r.memberId, { cost: 0, ms: 0, otMs: 0, standardMs: 0, entries: 0, days: new Set() });
        const es = empMap.get(r.memberId);
        es.cost += cost; es.ms += ms; es.entries++; es.days.add(r.date);
        // Emp standard: once per day per employee
        if (!empCountedDays.has(dayKey)) {
            empCountedDays.add(dayKey);
            es.standardMs += standardMs;
        }

        // Monthly map
        const month = r.date.substring(0, 7);
        if (!monthlyMap.has(month)) monthlyMap.set(month, { ms: 0, otMs: 0, cost: 0 });
        const mStats = monthlyMap.get(month);
        mStats.ms += ms; mStats.cost += cost;

        // Group for daily OT
        if (!entryByDay.has(dayKey)) entryByDay.set(dayKey, { entries: [], standardMs });
        entryByDay.get(dayKey).entries.push(r);

        // Time detail
        const member = DB.members.find(m => m.id === r.memberId);
        const dayNum = new Date(r.date).getDay();
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const projectLabel = proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : '\u2014';
        timeDetails.push({
            date: r.date,
            dayOfWeek: DAY_NAMES[dayNum],
            memberId: r.memberId,
            name: member ? member.name : 'Unknown',
            dept: member ? getDeptName(member.departmentId) : '\u2014',
            clockIn: r.clockIn,
            clockOut: r.clockOut,
            hours,
            standardHours: stdHrs,
            ot: 0,
            entryId: r.id,
            project: projectLabel
        });
    });

    // Step 2: Calculate daily OT and assign per-entry
    const rptOtPerEntry = new Map();
    entryByDay.forEach(({ entries, standardMs }) => {
        entries.sort((a, b) => (a.clockIn || '').localeCompare(b.clockIn || ''));
        let cumulativeMs = 0;
        entries.forEach(r => {
            const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
            const entryMs = result.ms || 0;
            const prevCumulative = cumulativeMs;
            cumulativeMs += entryMs;

            let entryOtMs = 0;
            if (prevCumulative < standardMs && cumulativeMs > standardMs) {
                entryOtMs = cumulativeMs - standardMs;
            } else if (prevCumulative >= standardMs) {
                entryOtMs = entryMs;
            }

            rptOtPerEntry.set(r.id, entryOtMs);
            totalOtMs += entryOtMs;

            const pid = r.projectId || 0;
            if (itemMap.has(pid)) itemMap.get(pid).otMs += entryOtMs;
            if (empMap.has(r.memberId)) empMap.get(r.memberId).otMs += entryOtMs;
            const month = r.date.substring(0, 7);
            if (monthlyMap.has(month)) monthlyMap.get(month).otMs += entryOtMs;
        });
    });

    // Step 3: Fill OT in time details
    timeDetails.forEach(t => {
        const otMs = rptOtPerEntry.get(t.entryId) || 0;
        t.ot = otMs / 3600000;
    });

    timeDetails.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    empRptTimeData_cache = timeDetails;

    const totalHours = totalMs / 3600000;
    const totalOtHours = totalOtMs / 3600000;
    const avgUtil = totalStandardMs > 0 ? (totalMs / totalStandardMs * 100) : 0;

    const ac = _empRptInitialLoad ? ' stat-anim' : '';
    document.getElementById('emp-rpt-stats').innerHTML = `
        <div class="stats-grid" style="margin-bottom:24px">
            <div class="stat-card${ac}"><div class="stat-label">Total Records</div><div class="stat-value">${filtered.length}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total Hours</div><div class="stat-value">${formatDuration(totalMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total OT</div><div class="stat-value" style="color:var(--warning)">${formatDuration(totalOtMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Utilization</div><div class="stat-value" style="color:${avgUtil >= 100 ? 'var(--green)' : avgUtil >= 80 ? 'var(--warning)' : 'var(--danger)'}">${avgUtil.toFixed(1)}%</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total Cost</div><div class="stat-value">${fmtCost(totalCost)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active Employees</div><div class="stat-value">${empMap.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active Categories</div><div class="stat-value">${scopeMap.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active ID/Name</div><div class="stat-value">${itemMap.size}</div></div>
        </div>`;

    // Chart data
    const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

    const itemLabels = [], itemData = [], itemColors = [];
    const sortedItems = [...itemMap.entries()].sort((a, b) => b[1].cost - a[1].cost);
    sortedItems.forEach(([pid, stats], i) => {
        const proj = pid ? DB.projects.find(p => p.id === pid) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        itemLabels.push(proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : 'Unassigned');
        itemData.push(Math.round(stats.cost * 100) / 100);
        itemColors.push(palette[i % palette.length]);
    });

    const scopeLabels = [], scopeData = [], scopeColors = [];
    const sortedScopes = [...scopeMap.entries()].sort((a, b) => b[1].cost - a[1].cost);
    sortedScopes.forEach(([sid, stats], i) => {
        const scope = sid ? DB.scopes.find(s => s.id === sid) : null;
        scopeLabels.push(scope ? scope.name : 'Uncategorized');
        scopeData.push(Math.round(stats.cost * 100) / 100);
        scopeColors.push(palette[i % palette.length]);
    });

    document.getElementById('emp-rpt-charts-row1').innerHTML = `
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Cost by Category → ID/Name</h3>
            <div style="min-width:600px;height:280px"><canvas id="emp-chart-item-cost"></canvas></div>
        </div>
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Cost by Category</h3>
            <div style="min-width:600px;height:280px"><canvas id="emp-chart-scope-cost"></canvas></div>
        </div>`;

    const monthLabels = [...monthlyMap.keys()].sort();
    const monthHoursData = monthLabels.map(m => Math.round(monthlyMap.get(m).ms / 3600000 * 10) / 10);
    const monthOtData = monthLabels.map(m => Math.round(monthlyMap.get(m).otMs / 3600000 * 10) / 10);
    const monthCostData = monthLabels.map(m => Math.round(monthlyMap.get(m).cost * 100) / 100);
    const prettyMonths = monthLabels.map(m => {
        const [y, mo] = m.split('-');
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)-1] + ' ' + y.slice(2);
    });

    const empSorted = [...empMap.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);
    const empLabels = empSorted.map(([mid]) => {
        const m = DB.members.find(x => x.id === mid);
        return m ? m.name : 'Unknown';
    });
    const empData = empSorted.map(([, stats]) => Math.round(stats.ms / 3600000 * 10) / 10);

    document.getElementById('emp-rpt-charts-row2').innerHTML = `
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Monthly Trend</h3>
            <div style="min-width:600px;height:280px"><canvas id="emp-chart-monthly"></canvas></div>
        </div>
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Top Employees by Hours</h3>
            <div style="min-width:600px;height:280px"><canvas id="emp-chart-emp-hours"></canvas></div>
        </div>`;

    // Cache for tables
    empRptItemData_cache = sortedItems.map(([pid, stats]) => {
        const proj = pid ? DB.projects.find(p => p.id === pid) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const label = proj ? (scope ? `${esc(scope.name)} → ${esc(proj.name)}` : esc(proj.name)) : '<span style="color:var(--main-text3)">Unassigned</span>';
        const cd = proj ? getProjectCountdown(proj) : null;
        let cdHtml = '\u2014';
        if (cd !== null) {
            if (cd > 30) cdHtml = `<span style="color:var(--ok);font-weight:600">${cd}d left</span>`;
            else if (cd > 7) cdHtml = `<span style="color:var(--warning);font-weight:600">${cd}d left</span>`;
            else if (cd > 0) cdHtml = `<span style="color:var(--danger);font-weight:600">${cd}d left</span>`;
            else if (cd === 0) cdHtml = `<span style="color:var(--warning);font-weight:600">Today!</span>`;
            else cdHtml = `<span style="color:var(--danger);font-weight:600">${Math.abs(cd)}d overdue</span>`;
        }
        return { label, cdHtml, days: stats.days.size, members: stats.members.size, entries: stats.entries, hours: stats.ms, otMs: stats.otMs, cost: stats.cost };
    });

    empRptEmpData_cache = empSorted.map(([mid, stats]) => {
        const member = DB.members.find(m => m.id === mid);
        const util = stats.standardMs > 0 ? (stats.ms / stats.standardMs * 100) : 0;
        return {
            name: member ? esc(member.name) : 'Unknown',
            pos: member ? esc(getPositionName(member.positionId)) : '\u2014',
            dept: member ? esc(getDeptName(member.departmentId)) : '\u2014',
            entries: stats.entries,
            days: stats.days.size,
            ms: stats.ms,
            otMs: stats.otMs,
            util,
            cost: stats.cost,
            rate: fmtHourlyRate(member)
        };
    });

    document.getElementById('emp-rpt-tables').innerHTML = `
        <div class="section-head" style="margin-top:8px"><h2>Category Summary</h2></div>
        <div id="emp-rpt-item-table-area"></div>
        <div class="section-head" style="margin-top:24px"><h2>Employee Summary</h2></div>
        <div id="emp-rpt-emp-table-area"></div>
        <div class="section-head" style="margin-top:24px"><h2>Time Detail</h2></div>
        <div id="emp-rpt-time-table-area"></div>`;

    empRptItemPage = 1; empRptEmpPage = 1; empRptTimePage = 1;
    renderEmpRptItemTable(empRptItemData_cache);
    renderEmpRptEmpTable(empRptEmpData_cache);
    renderEmpRptTimeTable(empRptTimeData_cache);

    // Render charts
    const chartTextColor = '#7a7570', chartGridColor = 'rgba(122,117,112,0.15)';
    new Chart(document.getElementById('emp-chart-item-cost'), {
        type: 'bar',
        data: { labels: itemLabels, datasets: [{ label: 'Cost (RM)', data: itemData, backgroundColor: itemColors, borderRadius: 6, maxBarThickness: 50 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { color: chartTextColor, callback: v => 'RM' + v }, grid: { color: chartGridColor } }, x: { ticks: { color: chartTextColor, maxRotation: 45, font: { size: 10 } }, grid: { display: false } } }
        }
    });

    new Chart(document.getElementById('emp-chart-scope-cost'), {
        type: 'doughnut',
        data: { labels: scopeLabels, datasets: [{ data: scopeData, backgroundColor: scopeColors, borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: chartTextColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => ctx.label + ': RM' + ctx.parsed.toFixed(2) } } } }
    });

    new Chart(document.getElementById('emp-chart-monthly'), {
        type: 'bar',
        data: { labels: prettyMonths, datasets: [
            { label: 'Hours', data: monthHoursData, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'OT', data: monthOtData, backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'Cost (RM)', data: monthCostData, type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 4, pointBackgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y1', fill: true }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartTextColor, usePointStyle: true, padding: 16 } } },
            scales: { y: { beginAtZero: true, position: 'left', ticks: { color: chartTextColor, callback: v => v + 'h' }, grid: { color: chartGridColor } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#ef4444', callback: v => 'RM' + v }, grid: { drawOnChartArea: false } }, x: { ticks: { color: chartTextColor }, grid: { display: false } } }
        }
    });

    new Chart(document.getElementById('emp-chart-emp-hours'), {
        type: 'bar',
        data: { labels: empLabels, datasets: [{ label: 'Hours', data: empData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, maxBarThickness: 30 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { color: chartTextColor, callback: v => v + 'h' }, grid: { color: chartGridColor } }, y: { ticks: { color: chartTextColor, font: { size: 11 } }, grid: { display: false } } }
        }
    });
};

// ---------- Category Summary Table ----------
const renderEmpRptItemTable = (data) => {
    const totalPages = Math.ceil(data.length / empRptItemPageSize) || 1;
    if (empRptItemPage > totalPages) empRptItemPage = totalPages;
    if (empRptItemPage < 1) empRptItemPage = 1;
    const start = (empRptItemPage - 1) * empRptItemPageSize;
    const page = data.slice(start, start + empRptItemPageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => `<tr>
            <td>${r.label}</td>
            <td>${r.cdHtml}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.days}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.members}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.entries}</td>
            <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.hours)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:var(--warning)">${formatDuration(r.otMs)}</td>
            <td style="text-align:right;font-family:var(--font-m)">${fmtCost(r.cost)}</td>
        </tr>`).join('');
    document.getElementById('emp-rpt-item-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Category → ID/Name</th><th>Countdown</th><th style="text-align:right">Days</th><th style="text-align:right">Members</th><th style="text-align:right">Entries</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th><th style="text-align:right">Cost</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, empRptItemPage, empRptItemPageSize, 'goEmpRptItemPage', 'changeEmpRptItemPageSize')}`;
};

// ---------- Employee Summary Table ----------
const renderEmpRptEmpTable = (data) => {
    const totalPages = Math.ceil(data.length / empRptEmpPageSize) || 1;
    if (empRptEmpPage > totalPages) empRptEmpPage = totalPages;
    if (empRptEmpPage < 1) empRptEmpPage = 1;
    const start = (empRptEmpPage - 1) * empRptEmpPageSize;
    const page = data.slice(start, start + empRptEmpPageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => `<tr>
            <td>${r.name}</td>
            <td>${r.pos}</td>
            <td>${r.dept}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.entries}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.days}</td>
            <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.ms)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:var(--warning)">${formatDuration(r.otMs)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:${r.util >= 100 ? 'var(--green)' : r.util >= 80 ? 'var(--warning)' : 'var(--danger)'}">${r.util.toFixed(1)}%</td>
            <td style="text-align:right;font-family:var(--font-m)">${fmtCost(r.cost)}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.rate}</td>
        </tr>`).join('');
    document.getElementById('emp-rpt-emp-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Employee</th><th>Position</th><th>Department</th><th style="text-align:right">Entries</th><th style="text-align:right">Days</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th><th style="text-align:right">Util%</th><th style="text-align:right">Cost</th><th style="text-align:right">Rate</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, empRptEmpPage, empRptEmpPageSize, 'goEmpRptEmpPage', 'changeEmpRptEmpPageSize')}`;
};

// ---------- Time Detail Table ----------
const renderEmpRptTimeTable = data => {
    const totalPages = Math.ceil(data.length / empRptTimePageSize) || 1;
    if (empRptTimePage > totalPages) empRptTimePage = totalPages;
    if (empRptTimePage < 1) empRptTimePage = 1;
    const start = (empRptTimePage - 1) * empRptTimePageSize;
    const page = data.slice(start, start + empRptTimePageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => {
            const clockInStr = r.clockIn ? formatTime(r.clockIn) : '\u2014';
            const clockOutStr = r.clockOut ? formatTime(r.clockOut) : '\u2014';
            const dayColor = r.dayOfWeek === 'Sun' ? 'var(--danger)' : r.dayOfWeek === 'Sat' ? 'var(--warning)' : 'var(--main-text)';
            return `<tr>
                <td style="font-family:var(--font-m)">${formatDateDMY(r.date)}</td>
                <td style="color:${dayColor};font-weight:600">${r.dayOfWeek}</td>
                <td>${esc(r.name)}</td>
                <td>${esc(r.dept)}</td>
                <td>${r.project}</td>
                <td style="font-family:var(--font-m)">${clockInStr}</td>
                <td style="font-family:var(--font-m)">${clockOutStr}</td>
                <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.hours * 3600000)}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtStdHours(r.standardHours)}</td>
                <td style="text-align:right;font-family:var(--font-m);color:${r.ot > 0 ? 'var(--warning)' : 'var(--main-text3)'}">${r.ot > 0 ? formatDuration(r.ot * 3600000) : '\u2014'}</td>
            </tr>`;
        }).join('');
    document.getElementById('emp-rpt-time-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Day</th><th>Employee</th><th>Department</th><th>Category → ID/Name</th><th>Clock In</th><th>Clock Out</th><th style="text-align:right">Duration</th><th style="text-align:right">Standard</th><th style="text-align:right">OT</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, empRptTimePage, empRptTimePageSize, 'goEmpRptTimePage', 'changeEmpRptTimePageSize')}`;
};

// ---------- Export Excel ----------
const exportEmpReportExcel = () => {
    if (!empRptItemData_cache.length && !empRptEmpData_cache.length && !empRptTimeData_cache.length) {
        alert('No data to export');
        return;
    }

    const strip = s => {
        if (!s) return '';
        return String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '\u2014').trim();
    };

    const fromDate = document.getElementById('emp-rpt-from')?.value || '';
    const toDate = document.getElementById('emp-rpt-to')?.value || '';
    const rows = [];

    rows.push(['Report: ' + fromDate + ' to ' + toDate]);
    rows.push([]);

    // Section 1: Category Summary (no Util%)
    rows.push(['CATEGORY SUMMARY']);
    rows.push(['Category \u2192 ID/Name', 'Countdown', 'Days', 'Members', 'Entries', 'Duration', 'OT', 'Cost']);
    if (empRptItemData_cache.length) {
        empRptItemData_cache.forEach(r => {
            rows.push([strip(r.label), strip(r.cdHtml), r.days, r.members, r.entries, formatDuration(r.hours), formatDuration(r.otMs), r.cost.toFixed(2)]);
        });
    } else { rows.push(['No data']); }

    rows.push([]);
    rows.push([]);

    // Section 2: Employee Summary (Util% stays — it's accurate per-employee)
    rows.push(['EMPLOYEE SUMMARY']);
    rows.push(['Employee', 'Position', 'Department', 'Entries', 'Days', 'Duration', 'OT', 'Util%', 'Cost', 'Rate']);
    if (empRptEmpData_cache.length) {
        empRptEmpData_cache.forEach(r => {
            rows.push([strip(r.name), strip(r.pos), strip(r.dept), r.entries, r.days, formatDuration(r.ms), formatDuration(r.otMs), r.util.toFixed(1) + '%', r.cost.toFixed(2), r.rate]);
        });
    } else { rows.push(['No data']); }

    rows.push([]);
    rows.push([]);

    // Section 3: Time Detail
    rows.push(['TIME DETAIL']);
    rows.push(['Date', 'Day', 'Employee', 'Department', 'Category \u2192 ID/Name', 'Clock In', 'Clock Out', 'Duration', 'Standard', 'OT']);
    if (empRptTimeData_cache.length) {
        empRptTimeData_cache.forEach(r => {
            rows.push([
                r.date,
                r.dayOfWeek,
                r.name,
                r.dept,
                r.project,
                r.clockIn ? formatTime(r.clockIn) : '\u2014',
                r.clockOut ? formatTime(r.clockOut) : '\u2014',
                formatDuration(r.hours * 3600000),
                r.standardHours > 0 ? r.standardHours.toFixed(1) + 'h' : '\u2014',
                r.ot > 0 ? formatDuration(r.ot * 3600000) : '\u2014'
            ]);
        });
    } else { rows.push(['No data']); }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:35},{wch:18},{wch:18},{wch:10},{wch:10},{wch:30},{wch:10},{wch:10},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    XLSX.writeFile(wb, 'emp_report_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};

// ---------- Pagination ----------
const goEmpRptItemPage = page => {
    const totalPages = Math.ceil(empRptItemData_cache.length / empRptItemPageSize) || 1;
    empRptItemPage = Math.max(1, Math.min(page, totalPages));
    renderEmpRptItemTable(empRptItemData_cache);
};
const changeEmpRptItemPageSize = size => {
    empRptItemPageSize = parseInt(size);
    empRptItemPage = 1;
    renderEmpRptItemTable(empRptItemData_cache);
};
const goEmpRptEmpPage = page => {
    const totalPages = Math.ceil(empRptEmpData_cache.length / empRptEmpPageSize) || 1;
    empRptEmpPage = Math.max(1, Math.min(page, totalPages));
    renderEmpRptEmpTable(empRptEmpData_cache);
};
const changeEmpRptEmpPageSize = size => {
    empRptEmpPageSize = parseInt(size);
    empRptEmpPage = 1;
    renderEmpRptEmpTable(empRptEmpData_cache);
};
const goEmpRptTimePage = page => {
    const totalPages = Math.ceil(empRptTimeData_cache.length / empRptTimePageSize) || 1;
    empRptTimePage = Math.max(1, Math.min(page, totalPages));
    renderEmpRptTimeTable(empRptTimeData_cache);
};
const changeEmpRptTimePageSize = size => {
    empRptTimePageSize = parseInt(size);
    empRptTimePage = 1;
    renderEmpRptTimeTable(empRptTimeData_cache);
};


/* ==========================================================
   EMPLOYEE — FILES
   ========================================================== */
let empFileCurrentPage = 1, empFilePageSize = 10, empFileFilteredData = [];
let empSelectedFiles = [];
let _empEditFileReplaceSelected = null;
let _pendingTaskPage = 1, _pendingTaskPageSize = 5;

const renderEmployeeFiles = () => {
    empFileCurrentPage = 1; empFilePageSize = 10;
    empNoticeCurrentPage = 1; empNoticePageSize = 5;

    const driveOpts = (DB.driveSettings||[]).map(d => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('');

    // ========== Announces ==========
    const notices = DB.fileNotices || [];
    let reminderBar = '';
    if (notices.length > 0) {
        const preview = notices.length === 1
            ? esc(notices[0].title)
            : esc(notices[0].title) + (notices.length > 1 ? ' +' + (notices.length - 1) + ' more' : '');

        reminderBar = '<div id="emp-file-reminder-bar" style="margin-bottom:16px;border-radius:var(--radius);overflow:hidden;border:1px solid rgba(245,158,11,.25)">'
            + '<div onclick="toggleFileReminderBar()" style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(245,158,11,.1);cursor:pointer;transition:background .15s">'
            + '<span id="reminder-bar-arrow" style="font-size:.7rem;color:var(--main-text3);transition:transform .2s">&#9660;</span>'
            + '<span style="font-size:.95rem">&#128227;</span>'
            + '<span style="font-size:.84rem;font-weight:600;color:var(--main-text)">Announces</span>'
            + '<span style="font-size:.7rem;color:#fff;background:#ef4444;padding:1px 7px;border-radius:10px;font-weight:600">' + notices.length + '</span>'
            + '<span style="font-size:.8rem;color:var(--main-text3);margin-left:8px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + preview + '</span>'
            + '</div>'
            + '<div id="reminder-bar-content" style="display:none;background:var(--main-surface)">'
            + renderNoticeCards(notices)
            + '</div></div>';
    }

    // ========== Pending Tasks ==========
    let pendingTasksBar = '';
    var fileTasks = DB.fileTasks || [];
    var myPendingTasks = fileTasks.filter(function(t) {
        if (!t.isActive) return false;
        var mySub = (t.submissions || []).find(function(s) { return s.memberId === currentUser.memberId; });
        return !mySub;
    });

    if (myPendingTasks.length > 0) {
        var now = new Date();
        var overdueTasks = myPendingTasks.filter(function(t) { return new Date(t.deadline.replace('Z','')) < now; });
        var totalTasks = myPendingTasks.length;
        var overdueCount = overdueTasks.length;
        var headerColor = overdueCount > 0 ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.25)';
        var headerBg = overdueCount > 0 ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.1)';
        var badgeColor = overdueCount > 0 ? '#ef4444' : '#f59e0b';
        var headerIcon = overdueCount > 0 ? '&#128338;' : '&#128203;';
        var headerText = overdueCount > 0
            ? '<span style="color:var(--danger)">' + overdueCount + ' overdue</span> · ' + totalTasks + ' pending'
            : totalTasks + ' pending';

        pendingTasksBar = '<div id="emp-pending-tasks-bar" style="margin-bottom:16px;border-radius:var(--radius);overflow:hidden;border:1px solid ' + headerColor + '">'
            + '<div onclick="togglePendingTasksBar()" style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:' + headerBg + ';cursor:pointer;transition:background .15s">'
            + '<span id="pending-tasks-arrow" style="font-size:.7rem;color:var(--main-text3);transition:transform .2s">&#9660;</span>'
            + '<span style="font-size:.95rem">' + headerIcon + '</span>'
            + '<span style="font-size:.84rem;font-weight:600;color:var(--main-text)">Pending Submission</span>'
            + '<span style="font-size:.7rem;color:#fff;background:' + badgeColor + ';padding:1px 7px;border-radius:10px;font-weight:600">' + totalTasks + '</span>'
            + '<span style="font-size:.8rem;color:var(--main-text3);margin-left:8px">' + headerText + '</span>'
            + '</div>'
            + '<div id="pending-tasks-content" style="display:none;background:var(--main-surface)">'
            + renderPendingTaskCards()
            + '</div></div>';
    }

    // ========== Main HTML ==========
    document.getElementById('emp-files').innerHTML = ''
        + '<div class="app-header"><h2>Files</h2><div class="header-sub">View and download files from Google Drive</div></div>'
        + '<div class="app-body">'
        + reminderBar
        + pendingTasksBar
        + '<div class="pt-anim-filter filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span></div>'
        + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
        + '<input class="input" type="text" placeholder="Search files..." id="emp-file-search" oninput="applyEmpFileFilter()" style="max-width:250px">'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Drive Folder</label>'
        + '<select class="input" id="emp-file-drive-filter" onchange="applyEmpFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">'
        + '<option value="">All Folders</option>'
        + driveOpts
        + '</select></div>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label>'
        + '<input class="input" type="date" id="emp-file-date-from" onchange="applyEmpFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label>'
        + '<input class="input" type="date" id="emp-file-date-to" onchange="applyEmpFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">'
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-left:auto">'
        + '<button class="btn btn-ghost btn-sm" onclick="resetEmpFileFilter()">Reset</button>'
        + '<button class="btn btn-green" onclick="showEmpUploadFile()">+ Upload File</button>'
        + '</div></div></div>'
        + '<div id="emp-file-table-area" class="pt-anim-table"></div>'
        + '</div>';

    setTimeout(function() { applyEmpFileFilter(); }, 100);
};

// ========== Notice Cards (Announces pagination) ==========
const renderNoticeCards = (notices) => {
    const totalPages = Math.ceil(notices.length / empNoticePageSize) || 1;
    if (empNoticeCurrentPage > totalPages) empNoticeCurrentPage = totalPages;
    if (empNoticeCurrentPage < 1) empNoticeCurrentPage = 1;
    const start = (empNoticeCurrentPage - 1) * empNoticePageSize;
    const page = notices.slice(start, start + empNoticePageSize);

    const cards = page.map(n => `
        <div style="padding:10px 14px;border-bottom:1px solid var(--main-border)">
            <div style="font-weight:600;font-size:.84rem;color:var(--main-text)">${esc(n.title)}</div>
            ${n.message ? `<div style="font-size:.8rem;color:var(--main-text3);margin-top:3px;line-height:1.5">${esc(n.message)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                ${n.targetType === 'multiple' ? '<span style="font-size:.7rem;color:var(--main-text3)">Personal</span>' : ''}
                <span style="font-size:.7rem;color:var(--main-text3)">${formatDateTimeDMY(n.createdAt)}</span>
            </div>
        </div>`).join('');

    const pagHtml = buildPagination(notices.length, empNoticeCurrentPage, empNoticePageSize,
        'goNoticePage', 'changeNoticePageSize',
        { label: 'announces', sizes: [5, 10, 25] });

    return cards + pagHtml;
};

const goNoticePage = page => {
    const notices = DB.fileNotices || [];
    const totalPages = Math.ceil(notices.length / empNoticePageSize) || 1;
    empNoticeCurrentPage = Math.max(1, Math.min(page, totalPages));
    const el = document.getElementById('reminder-bar-content');
    if (el) el.innerHTML = renderNoticeCards(notices);
};

const changeNoticePageSize = size => {
    empNoticePageSize = parseInt(size);
    empNoticeCurrentPage = 1;
    const notices = DB.fileNotices || [];
    const el = document.getElementById('reminder-bar-content');
    if (el) el.innerHTML = renderNoticeCards(notices);
};

const toggleFileReminderBar = () => {
    const content = document.getElementById('reminder-bar-content');
    const arrow = document.getElementById('reminder-bar-arrow');
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// ========== Pending Task Cards (pagination) ==========
const renderPendingTaskCards = () => {
    var fileTasks = DB.fileTasks || [];
    var myPendingTasks = fileTasks.filter(function(t) {
        if (!t.isActive) return false;
        var mySub = (t.submissions || []).find(function(s) { return s.memberId === currentUser.memberId; });
        return !mySub;
    });

    if (myPendingTasks.length === 0) return '<div style="padding:20px;text-align:center;color:var(--main-text3)">No pending tasks</div>';

    var now = new Date();
    var overdueTasks = myPendingTasks.filter(function(t) { return new Date(t.deadline.replace('Z','')) < now; });
    var upcomingTasks = myPendingTasks.filter(function(t) { return new Date(t.deadline.replace('Z','')) >= now; });
    var allSorted = overdueTasks.concat(upcomingTasks);
    var totalTasks = allSorted.length;
    var totalPages = Math.ceil(totalTasks / _pendingTaskPageSize) || 1;
    if (_pendingTaskPage > totalPages) _pendingTaskPage = totalPages;
    if (_pendingTaskPage < 1) _pendingTaskPage = 1;
    var start = (_pendingTaskPage - 1) * _pendingTaskPageSize;
    var pageItems = allSorted.slice(start, start + _pendingTaskPageSize);

    var notifTimeMap = {};
    var taskNotifs = (DB.notifications || []).filter(function(n) { return n.type === 'file_task' || n.type === 'file_task_reminder'; });
    for (var ni = 0; ni < taskNotifs.length; ni++) {
        var n = taskNotifs[ni];
        var tid = n.relatedId;  // camelCase
        if (!tid) continue;
        var existing = notifTimeMap[tid];
        var nTime = n.createdAt || null;  // camelCase
        if (!existing || (nTime && nTime > existing)) {
            notifTimeMap[tid] = nTime;
        }
    }

    var taskCards = '';
    for (var i = 0; i < pageItems.length; i++) {
        var t = pageItems[i];
        var dl = new Date(t.deadline.replace('Z',''));
        var isOver = dl < now;
        var notifTime = notifTimeMap[t.id] || null;
        var notifHtml = notifTime ? '<div style="font-size:.72rem;color:var(--main-text3);margin-top:2px">Received: ' + formatDateTimeDMY(notifTime) + '</div>' : '';
        var deadlineStr = formatDateDMY(t.deadline ? t.deadline.replace('Z','').slice(0,10) : null) + ' ' + (t.deadline ? t.deadline.replace('Z','').slice(11,16) : '');

        if (isOver) {
            var daysOver = Math.ceil((now - dl) / 86400000);
            taskCards += '<div style="padding:12px 16px;border-bottom:1px solid var(--main-border);border-left:3px solid var(--danger)">'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
                + '<span style="color:var(--danger);font-size:.78rem;font-weight:600"> ' + daysOver + ' day' + (daysOver > 1 ? 's' : '') + ' overdue</span>'
                + '<span style="font-size:.76rem;color:var(--danger)">(' + deadlineStr + ')</span>'
                + '</div>'
                + '<div style="font-weight:600;font-size:.88rem;color:var(--main-text)">' + esc(t.title) + '</div>'
                + (t.description ? '<div style="font-size:.82rem;color:var(--main-text3);margin-top:3px">' + esc(t.description) + '</div>' : '')
                + notifHtml
                + '<button class="btn btn-green btn-sm" style="margin-top:8px" onclick="showEmpSubmitTask(' + t.id + ')">Submit Now</button>'
                + '</div>';
        } else {
            var daysLeft = Math.ceil((dl - now) / 86400000);
            var deadlineColor = daysLeft <= 1 ? 'var(--danger)' : daysLeft <= 3 ? 'var(--warning)' : daysLeft <= 7 ? 'var(--accent)' : 'var(--main-text3)';
            taskCards += '<div style="padding:12px 16px;border-bottom:1px solid var(--main-border);border-left:3px solid var(--accent)">'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
                + '<span style="color:var(--accent);font-size:.78rem;font-weight:600">' + daysLeft + ' day' + (daysLeft > 1 ? 's' : '') + ' left</span>'
                + '<span style="font-size:.76rem;color:' + deadlineColor + '">(' + deadlineStr + ')</span>'
                + '</div>'
                + '<div style="font-weight:600;font-size:.88rem;color:var(--main-text)">' + esc(t.title) + '</div>'
                + (t.description ? '<div style="font-size:.82rem;color:var(--main-text3);margin-top:3px">' + esc(t.description) + '</div>' : '')
                + notifHtml
                + '<button class="btn btn-accent btn-sm" style="margin-top:8px" onclick="showEmpSubmitTask(' + t.id + ')">Submit</button>'
                + '</div>';
        }
    }

    var pagHtml = buildPagination(totalTasks, _pendingTaskPage, _pendingTaskPageSize,
        'goPendingTaskPage', 'changePendingTaskPageSize',
        { label: 'tasks', sizes: [5, 10, 25] });

    return taskCards + pagHtml;
};

const goPendingTaskPage = page => {
    var fileTasks = DB.fileTasks || [];
    var myPendingTasks = fileTasks.filter(function(t) {
        if (!t.isActive) return false;
        var mySub = (t.submissions || []).find(function(s) { return s.memberId === currentUser.memberId; });
        return !mySub;
    });
    var totalPages = Math.ceil(myPendingTasks.length / _pendingTaskPageSize) || 1;
    _pendingTaskPage = Math.max(1, Math.min(page, totalPages));
    var el = document.getElementById('pending-tasks-content');
    if (el) el.innerHTML = renderPendingTaskCards();
};

const changePendingTaskPageSize = size => {
    _pendingTaskPageSize = parseInt(size);
    _pendingTaskPage = 1;
    var el = document.getElementById('pending-tasks-content');
    if (el) el.innerHTML = renderPendingTaskCards();
};

const togglePendingTasksBar = () => {
    const content = document.getElementById('pending-tasks-content');
    const arrow = document.getElementById('pending-tasks-arrow');
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

// ========== File Filter & Table ==========
const resetEmpFileFilter = () => {
    document.getElementById('emp-file-search').value = '';
    document.getElementById('emp-file-drive-filter').value = '';
    document.getElementById('emp-file-date-from').value = '';
    document.getElementById('emp-file-date-to').value = '';
    empFileCurrentPage = 1;
    applyEmpFileFilter();
};

const applyEmpFileFilter = () => {
    const search = (document.getElementById('emp-file-search')?.value || '').toLowerCase();
    const driveFilter = document.getElementById('emp-file-drive-filter')?.value || '';
    const dateFrom = document.getElementById('emp-file-date-from')?.value || '';
    const dateTo = document.getElementById('emp-file-date-to')?.value || '';
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name.toLowerCase(); });

    let filtered = (DB.files || []).filter(f => {
        if (driveFilter && String(f.driveSettingId) !== driveFilter) return false;
        if (dateFrom || dateTo) {
            const fileDate = f.createdAt ? f.createdAt.slice(0, 10) : '';
            if (!fileDate) return false;
            if (dateFrom && fileDate < dateFrom) return false;
            if (dateTo && fileDate > dateTo) return false;
        }
        if (search) {
            const driveName = f.driveSettingId ? (driveNameMap[f.driveSettingId] || '') : '';
            const dateFormatted = f.createdAt ? formatDateDMY(f.createdAt.slice(0,10)).toLowerCase() : '';
            const dateISO = f.createdAt ? f.createdAt.slice(0,10) : '';
            const haystack = [f.title, f.name, f.uploaderName, f.type, f.remark, driveName, dateFormatted, dateISO].map(v => (v||'').toLowerCase()).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        return true;
    });

    empFileFilteredData = filtered;
    empFileCurrentPage = 1;
    renderEmpFileTable();
};

const renderEmpFileTable = () => {
    const filtered = empFileFilteredData;
    const totalPages = Math.ceil(filtered.length / empFilePageSize) || 1;
    if (empFileCurrentPage > totalPages) empFileCurrentPage = totalPages;
    if (empFileCurrentPage < 1) empFileCurrentPage = 1;
    const start = (empFileCurrentPage - 1) * empFilePageSize;
    const page = filtered.slice(start, start + empFilePageSize);
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name; });

    const myMemberId = currentUser.memberId || null;

    const rows = filtered.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No files found</td></tr>'
        : page.map((f, idx) => {
            const driveName = f.driveSettingId ? (driveNameMap[f.driveSettingId] || '—') : '—';
            const canEdit = myMemberId && f.uploadedBy === myMemberId;
            const canDelete = myMemberId && f.uploadedBy === myMemberId;
            const displayTitle = f.title ? esc(f.title) : '<span style="color:var(--main-text3)">—</span>';
            const actions = `<div class="actions-cell">
                <button class="btn-icon" title="Preview" onclick="empPreviewFile(${f.id})">&#128065;</button>
                <button class="btn-icon" title="Open in Drive" onclick="window.open('${esc(f.url)}','_blank')">&#8599;</button>
                ${canEdit ? `<button class="btn-icon" title="Edit" onclick="showEmpEditFileModal(${f.id})">&#9998;</button>` : ''}
                ${canDelete ? `<button class="btn-icon danger" title="Delete" onclick="empConfirmDeleteFile(${f.id})">&#10005;</button>` : ''}
            </div>`;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start+idx+1}</td>
                <td title="${esc(f.title||'')}">${displayTitle}</td>
                <td>${getFileTypeIcon(f.name)} <strong>${esc(f.name)}</strong></td>
                <td>${getFileTypeBadge(f.type)}</td>
                <td style="text-align:right;font-family:var(--font-m)">${formatFileSize(f.size)}</td>
                <td><span style="font-size:.82rem">${esc(driveName)}</span></td>
                <td>${esc(f.remark||'—')}</td>
                <td>${esc(f.uploaderName||'—')}</td>
                <td style="font-family:var(--font-m)">${formatDateDMY(f.createdAt?f.createdAt.slice(0,10):null)}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(filtered.length, empFileCurrentPage, empFilePageSize,
        'goEmpFilePage', 'changeEmpFilePageSize',
        { label: 'files', sizes: [10, 25, 50] });

    document.getElementById('emp-file-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th style="width:50px">No</th><th>Title</th><th>File Name</th><th style="width:80px">Type</th><th style="width:90px;text-align:right">Size</th><th>Drive Folder</th><th>Remark</th><th>Uploaded By</th><th>Date</th><th style="width:150px">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>${pagHtml}`;
};

const goEmpFilePage = p => { const tp=Math.ceil(empFileFilteredData.length/empFilePageSize)||1; empFileCurrentPage=Math.max(1,Math.min(p,tp)); renderEmpFileTable(); };
const changeEmpFilePageSize = s => { empFilePageSize=parseInt(s); empFileCurrentPage=1; renderEmpFileTable(); };

// ---------- Employee Multiple Upload ----------
const showEmpUploadFile = () => {
    const drives = DB.driveSettings || [];
    const config = DB.appConfig || {};
    if (!drives.length) {
        showModal(`<h3>No Drive Configured</h3>
            <p style="color:var(--main-text2)">No drive folders available.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>`);
        return;
    }
    if (!config.drive_script_url) {
        showModal(`<h3>Drive Not Configured</h3>
            <p style="color:var(--main-text2)">Upload not available.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>`);
        return;
    }
    const defaultDrive = drives.find(d => d.isDefault) || drives[0];
    const driveOpts = drives.map(d => `<option value="${d.id}" ${d.id===defaultDrive.id?'selected':''}>${esc(d.name)}</option>`).join('');

    empSelectedFiles = [];

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Upload File</h3>
            <div class="field">
                <label>Title <span style="font-size:.72rem;color:var(--main-text3)">(Display name, optional, applied to all)</span></label>
                <input class="input" id="upload-title" placeholder="e.g. Project Report">
            </div>
            <div class="field">
                <label>Select File <span style="font-size:.72rem;color:var(--main-text3)">(Max 20MB each · Multiple allowed)</span></label>
                <div id="upload-drop-zone" style="border:2px dashed var(--main-border);border-radius:var(--radius);padding:30px;text-align:center;cursor:pointer;transition:border-color .2s">
                    <div id="upload-file-info" style="color:var(--main-text3)">Click or drag files here</div>
                    <input type="file" id="upload-file-input" style="display:none" multiple onchange="handleEmpFilesSelect(this)">
                </div>
            </div>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div id="upload-file-list" style="margin-top:8px;margin-bottom:12px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>Drive Folder</label><select class="input" id="upload-drive">${driveOpts}</select></div>
                <div class="field"><label>Remark <span style="font-size:.72rem;color:var(--main-text3)">(Applied to all)</span></label><input class="input" id="upload-remark" placeholder="Optional remark"></div>
            </div>
            <div id="upload-progress" style="display:none;margin-top:12px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span id="upload-file-counter" style="font-size:.82rem;color:var(--main-text3)"></span>
                </div>
                <div style="background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                    <div id="upload-progress-bar" style="height:100%;background:var(--accent);width:0%;transition:width .3s ease;border-radius:4px"></div>
                </div>
                <div id="upload-progress-text" style="font-size:.78rem;color:var(--main-text3);margin-top:4px;text-align:center">Uploading...</div>
            </div>
            <p class="auth-error" id="upload-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns"><button class="btn btn-ghost" onclick="empSelectedFiles=[];hideModal()">Cancel</button><button class="btn btn-accent" id="upload-btn" onclick="doEmpUploadFiles()">Upload</button></div>
    </div>`);

    setTimeout(() => {
        const dz = document.getElementById('upload-drop-zone');
        const fi = document.getElementById('upload-file-input');
        dz.onclick = () => fi.click();
        dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
        dz.ondragleave = () => { dz.style.borderColor = 'var(--main-border)'; };
        dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = 'var(--main-border)'; if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;handleEmpFilesSelect(fi);} };
    }, 100);
};

const handleEmpFilesSelect = input => {
    const files = Array.from(input.files);
    const errEl = document.getElementById('upload-error');
    errEl.textContent = '';

    for (const f of files) {
        if (f.size > 20 * 1024 * 1024) {
            errEl.textContent = `${f.name} too large (max 20MB)`;
            continue;
        }
        if (!isFileSafe(f)) {
            errEl.textContent = `${f.name}: type not allowed`;
            continue;
        }
        const duplicate = empSelectedFiles.some(e => e.name === f.name && e.size === f.size);
        if (!duplicate) {
            empSelectedFiles.push(f);
        }
    }

    input.value = '';
    renderEmpSelectedFileList();
};

const renderEmpSelectedFileList = () => {
    const el = document.getElementById('upload-file-list');
    if (!el) return;
    if (empSelectedFiles.length === 0) {
        el.innerHTML = '';
        document.getElementById('upload-file-info').innerHTML = '<span style="color:var(--main-text3)">Click or drag files here</span>';
        return;
    }
    document.getElementById('upload-file-info').innerHTML =
        `<span style="color:var(--accent);font-weight:600">${empSelectedFiles.length} file${empSelectedFiles.length>1?'s':''} selected</span>
         <span style="font-size:.78rem;color:var(--main-text3);margin-left:6px">— click or drag to add more</span>`;
    el.innerHTML = empSelectedFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);margin-bottom:4px">
        ${getFileTypeIcon(f.name)}
        <div style="flex:1;min-width:0">
            <div style="font-size:.84rem;font-weight:500;color:var(--main-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
            <div style="font-size:.75rem;color:var(--main-text3)">${formatFileSize(f.size)}</div>
        </div>
        <button onclick="empSelectedFiles.splice(${i},1);renderEmpSelectedFileList()" style="background:none;border:none;cursor:pointer;color:var(--main-text3);font-size:.9rem;padding:2px 6px" title="Remove">&#10005;</button>
    </div>`).join('');
};

const doEmpUploadFiles = async () => {
    const errEl = document.getElementById('upload-error');
    if (empSelectedFiles.length === 0) { errEl.textContent = 'Select at least one file'; return; }

    const driveId = parseInt(document.getElementById('upload-drive').value);
    const drive = (DB.driveSettings||[]).find(d => d.id === driveId);
    if (!drive) { errEl.textContent = 'Select a drive folder'; return; }

    const title = (document.getElementById('upload-title')?.value || '').trim();
    const remark = document.getElementById('upload-remark').value.trim();
    const btn = document.getElementById('upload-btn');
    const progress = document.getElementById('upload-progress');
    const bar = document.getElementById('upload-progress-bar');
    const txt = document.getElementById('upload-progress-text');
    const counter = document.getElementById('upload-file-counter');

    btn.disabled = true; btn.textContent = 'Uploading...';
    progress.style.display = 'block'; errEl.textContent = '';

    const total = empSelectedFiles.length;
    let completed = 0;
    const failedFiles = [];
    const successFiles = [];

    for (let i = 0; i < total; i++) {
        const file = empSelectedFiles[i];
        counter.textContent = `File ${i+1} of ${total}`;
        bar.style.width = Math.round((i/total)*100) + '%';
        txt.textContent = `Uploading: ${file.name}`;

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const safeNameResult = safeFileName(file.name);
            const result = await api('/upload-to-drive', {
                method: 'POST',
                body: { fileBase64: base64, fileName: safeNameResult, mimeType: file.type || 'application/octet-stream', folderId: drive.folderId }
            });
            if (result.error) throw new Error(result.error);

            await api('/files', {
                method: 'POST',
                body: { title, name: safeNameResult, type: file.type || 'application/octet-stream', size: file.size, url: result.fileUrl, driveFileId: result.fileId, driveSettingId: driveId, remark }
            });
            completed++;
            successFiles.push(file.name);
        } catch (e) {
            failedFiles.push({ name: file.name, reason: e.message });
        }
    }
    bar.style.width = '100%';

    if (failedFiles.length === 0) {
        txt.innerHTML = '<div style="font-weight:600;margin-bottom:4px">All uploaded successfully!</div>' +
            successFiles.map(n => `<div style="font-size:.82rem;padding:2px 0;color:#16a34a">✓ ${esc(n)}</div>`).join('');
        empSelectedFiles = [];
        await loadDB();
        setTimeout(() => { hideModal(); applyEmpFileFilter(); }, 1500);
    } else if (completed === 0) {
        txt.innerHTML = '';
        errEl.innerHTML = `<div style="margin-bottom:6px;font-weight:600">All ${total} file${total>1?'s':''} failed:</div>` +
            failedFiles.map(f => `<div style="font-size:.82rem;padding:2px 0">✕ <strong>${esc(f.name)}</strong>: ${esc(f.reason)}</div>`).join('');
        btn.disabled = false; btn.textContent = 'Retry';
        btn.onclick = () => { errEl.textContent = ''; doEmpUploadFiles(); };
    } else {
        let resultHtml = '';
        if (successFiles.length > 0) {
            resultHtml += `<div style="font-weight:600;margin-bottom:4px;color:#16a34a">✓ ${successFiles.length} uploaded:</div>` +
                successFiles.map(n => `<div style="font-size:.82rem;padding:2px 0;color:#16a34a">✓ ${esc(n)}</div>`).join('');
        }
        if (failedFiles.length > 0) {
            resultHtml += `<div style="font-weight:600;margin-top:8px;margin-bottom:4px;color:var(--danger)">✕ ${failedFiles.length} failed:</div>` +
                failedFiles.map(f => `<div style="font-size:.82rem;padding:2px 0">✕ <strong>${esc(f.name)}</strong>: ${esc(f.reason)}</div>`).join('');
        }
        errEl.innerHTML = resultHtml;
        txt.textContent = `${completed} uploaded, ${failedFiles.length} failed`;
        empSelectedFiles = empSelectedFiles.filter(f => failedFiles.some(ff => ff.name === f.name));
        btn.disabled = false; btn.textContent = 'Retry Failed';
        btn.onclick = () => { errEl.textContent = ''; doEmpUploadFiles(); };
        await loadDB();
        setTimeout(() => applyEmpFileFilter(), 500);
    }
};

// ---------- Employee Edit File ----------
const showEmpEditFileModal = id => {
    const f = (DB.files||[]).find(x => x.id === id);
    if (!f) return;

    const drives = DB.driveSettings || [];
    const driveOpts = drives.map(d => `<option value="${d.id}" ${d.id === f.driveSettingId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');

    _empEditFileReplaceSelected = null;

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Edit File</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                <div class="field"><label>Title</label><input class="input" id="emp-edit-file-title" value="${esc(f.title || '')}" placeholder="Display name"></div>
                <div class="field"><label>Remark</label><input class="input" id="emp-edit-file-remark" value="${esc(f.remark || '')}" placeholder="Optional remark"></div>
            </div>
            <div class="field" style="margin-bottom:12px">
                <label>Drive Folder</label>
                <select class="input" id="emp-edit-file-drive">${driveOpts}</select>
            </div>
            <div style="background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px">
                <div style="font-size:.82rem;color:var(--main-text3);margin-bottom:2px">Current File</div>
                <div style="display:flex;align-items:center;gap:8px">
                    ${getFileTypeIcon(f.name)} <strong style="color:var(--main-text)">${esc(f.name)}</strong>
                    <span style="font-size:.82rem;color:var(--main-text3)">${formatFileSize(f.size)}</span>
                </div>
            </div>
            <div class="field">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="emp-edit-file-replace-toggle" onchange="document.getElementById('emp-edit-file-replace-zone').style.display=this.checked?'block':'none'"> Replace file
                </label>
            </div>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div id="emp-edit-file-replace-zone" style="display:none;margin-top:8px;margin-bottom:16px">
                <div id="emp-edit-file-drop-zone" style="border:2px dashed var(--main-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:border-color .2s">
                    <div id="emp-edit-file-info" style="color:var(--main-text3)">Click or drag new file here</div>
                    <input type="file" id="emp-edit-file-input" style="display:none" onchange="handleEmpEditFileSelect(this)">
                </div>
            </div>
            <div id="emp-edit-file-progress" style="display:none;margin-bottom:12px">
                <div style="background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                    <div id="emp-edit-file-bar" style="height:100%;background:var(--accent);width:0%;transition:width .3s;border-radius:4px"></div>
                </div>
                <div id="emp-edit-file-txt" style="font-size:.78rem;color:var(--main-text3);margin-top:4px;text-align:center">Saving...</div>
            </div>
            <p class="auth-error" id="emp-edit-file-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns">
            <button class="btn btn-ghost" onclick="_empEditFileReplaceSelected=null;hideModal()">Cancel</button>
            <button class="btn btn-accent" id="emp-edit-file-btn" onclick="doEmpEditFile(${id})">Save</button>
        </div>
    </div>`);

    setTimeout(() => {
        const dz = document.getElementById('emp-edit-file-drop-zone');
        const fi = document.getElementById('emp-edit-file-input');
        if (dz && fi) {
            dz.onclick = () => fi.click();
            dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
            dz.ondragleave = () => { dz.style.borderColor = 'var(--main-border)'; };
            dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = 'var(--main-border)'; if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;handleEmpEditFileSelect(fi);} };
        }
    }, 100);
};

const handleEmpEditFileSelect = input => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        document.getElementById('emp-edit-file-error').textContent = 'File too large. Max 20MB.';
        input.value = '';
        _empEditFileReplaceSelected = null;
        document.getElementById('emp-edit-file-info').innerHTML = '<span style="color:var(--main-text3)">Click or drag new file here</span>';
        return;
    }
    document.getElementById('emp-edit-file-error').textContent = '';
    _empEditFileReplaceSelected = file;
    document.getElementById('emp-edit-file-info').innerHTML =
        `<div style="font-size:1rem;font-weight:600;color:var(--main-text)">${getFileTypeIcon(file.name)} ${esc(file.name)}</div>
         <div style="font-size:.82rem;color:var(--main-text3);margin-top:4px">${formatFileSize(file.size)} · ${file.type||'Unknown'}</div>`;
};

const doEmpEditFile = async id => {
    const title = document.getElementById('emp-edit-file-title').value.trim();
    const remark = document.getElementById('emp-edit-file-remark').value.trim();
    const isReplacing = document.getElementById('emp-edit-file-replace-toggle').checked;
    const errEl = document.getElementById('emp-edit-file-error');
    const btn = document.getElementById('emp-edit-file-btn');

    if (isReplacing && _empEditFileReplaceSelected) {
        if (!isFileSafe(_empEditFileReplaceSelected)) { errEl.textContent = 'File type not allowed.'; return; }

        const driveId = parseInt(document.getElementById('emp-edit-file-drive').value);
        const drive = (DB.driveSettings||[]).find(d => d.id === driveId);
        if (!drive) { errEl.textContent = 'Select a drive folder'; return; }

        btn.disabled = true; btn.textContent = 'Saving...';
        const progress = document.getElementById('emp-edit-file-progress');
        const bar = document.getElementById('emp-edit-file-bar');
        const txt = document.getElementById('emp-edit-file-txt');
        progress.style.display = 'block'; bar.style.width = '30%'; txt.textContent = 'Reading file...';
        errEl.textContent = '';

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(_empEditFileReplaceSelected);
            });
            bar.style.width = '50%'; txt.textContent = 'Uploading to Drive...';
            const safeName = safeFileName(_empEditFileReplaceSelected.name);
            const result = await api('/upload-to-drive', {
                method: 'POST',
                body: { fileBase64: base64, fileName: safeName, mimeType: _empEditFileReplaceSelected.type || 'application/octet-stream', folderId: drive.folderId }
            });
            if (result.error) throw new Error(result.error);
            bar.style.width = '80%'; txt.textContent = 'Saving record...';
            await api('/files/' + id, {
                method: 'PUT',
                body: {
                    title, remark, replaceFile: true,
                    newName: safeName, newType: _empEditFileReplaceSelected.type,
                    newSize: _empEditFileReplaceSelected.size, newUrl: result.fileUrl,
                    newDriveFileId: result.fileId, newDriveSettingId: driveId
                }
            });
            bar.style.width = '100%'; txt.textContent = 'Done!';
            _empEditFileReplaceSelected = null;
            await loadDB();
            setTimeout(() => { hideModal(); applyEmpFileFilter(); }, 600);
        } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            btn.disabled = false; btn.textContent = 'Save';
            progress.style.display = 'none';
        }
    } else {
        btn.disabled = true; btn.textContent = 'Saving...';
        try {
            const driveId = parseInt(document.getElementById('emp-edit-file-drive')?.value) || null;
            const safeTitle = (title || '').replace(/<[^>]*>/g, '').substring(0, 300);
            const safeRemark = (remark || '').replace(/<[^>]*>/g, '').substring(0, 500);
            await api('/files/' + id, { method: 'PUT', body: { title: safeTitle, remark: safeRemark, replaceFile: false, newDriveSettingId: driveId } });
            await loadDB();
            hideModal();
            applyEmpFileFilter();
        } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            btn.disabled = false; btn.textContent = 'Save';
        }
    }
};

// ---------- Employee Preview ----------
const empPreviewFile = id => {
    const file = (DB.files||[]).find(f => f.id === id);
    if (!file || !file.driveFileId) return;
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name; });
    const previewUrl = `https://drive.google.com/file/d/${file.driveFileId}/preview`;
    const displayLabel = file.title ? esc(file.title) : esc(file.name);
    showModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">${getFileTypeIcon(file.name)} ${displayLabel}</h3>
        <button class="btn btn-ghost btn-sm" onclick="window.open('${esc(file.url)}','_blank')">&#8599; Open in Drive</button>
    </div>
    ${file.title ? `<div style="font-size:.82rem;color:var(--main-text3);margin-bottom:8px">File: ${esc(file.name)}</div>` : ''}
    <iframe src="${previewUrl}" style="width:100%;height:65vh;border:none;border-radius:var(--radius)"></iframe>
    <div style="margin-top:8px;display:flex;gap:16px;font-size:.78rem;color:var(--main-text3)">
        <span>Size: ${formatFileSize(file.size)}</span>
        <span>Drive Folder: ${esc(driveNameMap[file.driveSettingId] || '—')}</span>
        <span>Remark: ${esc(file.remark || '—')}</span>
        <span>By: ${esc(file.uploaderName||'—')}</span>
        <span>Date: ${formatDateDMY(file.createdAt?file.createdAt.slice(0,10):null)}</span>
    </div>`);
};

// ---------- Employee Delete (only own files) ----------
const empConfirmDeleteFile = id => {
    const file = (DB.files||[]).find(f => f.id === id);
    if (!file) return;
    showModal(`<h3>Delete File</h3>
        <p style="color:var(--main-text2);line-height:1.6">Delete <strong>${esc(file.name)}</strong>?<br>
        <span style="font-size:.82rem;color:var(--main-text3)">File will also be deleted from Google Drive.</span></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteEmpFile(${id})">Delete</button></div>`);
};

const doDeleteEmpFile = id => {
    const file = (DB.files||[]).find(f => f.id === id);
    if (!file) return;

    const drive = (DB.driveSettings||[]).find(d => d.id === file.driveSettingId);
    const deletePromise = (drive && file.driveFileId)
        ? api('/delete-drive-file', { method: 'POST', body: { fileId: file.driveFileId } }).catch(() => {})
        : Promise.resolve();

    deletePromise
        .then(() => api('/files/' + id, { method: 'DELETE' }))
        .then(() => { hideModal(); return loadDB(); })
        .then(() => { applyEmpFileFilter(); showToast('File deleted successfully'); })
        .catch(e => { alert('Delete failed: ' + e.message); });
};

// ---------- Employee Submit Task ----------
const showEmpSubmitTask = taskId => {
    const drives = DB.driveSettings || [];
    if (!drives.length) {
        showModal(`<h3>No Drive Configured</h3><p style="color:var(--main-text2)">Cannot submit files.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>`);
        return;
    }
    const defaultDrive = drives.find(d => d.isDefault) || drives[0];
    const driveOpts = drives.map(d => `<option value="${d.id}" ${d.id===defaultDrive.id?'selected':''}>${esc(d.name)}</option>`).join('');

    const task = (DB.fileTasks || []).find(t => t.id === taskId);
    if (!task) return;

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Submit: ${esc(task.title)}</h3>
            ${task.description ? `<p style="color:var(--main-text2);margin-bottom:12px">${esc(task.description)}</p>` : ''}
            <div style="font-size:.85rem;color:var(--main-text3);margin-bottom:16px">
                Deadline: ${formatDateDMY(task.deadline?.slice(0,10))} ${task.deadline?.slice(11,16)}
            </div>
            <div class="field">
                <label>Select File</label>
                <div id="submit-task-drop-zone" style="border:2px dashed var(--main-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:border-color .2s">
                    <div id="submit-task-file-info" style="color:var(--main-text3)">Click or drag file here</div>
                    <input type="file" id="submit-task-file-input" style="display:none" onchange="handleTaskFileSelect(this)">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>Drive Folder</label><select class="input" id="submit-task-drive">${driveOpts}</select></div>
                <div class="field"><label>Remark <span style="font-size:.72rem;color:var(--main-text3)">(optional)</span></label><input class="input" id="submit-task-remark" placeholder="Optional remark"></div>
            </div>
            <div id="submit-task-progress" style="display:none;margin-top:12px">
                <div style="background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                    <div id="submit-task-bar" style="height:100%;background:var(--accent);width:0%;transition:width .3s;border-radius:4px"></div>
                </div>
                <div id="submit-task-txt" style="font-size:.78rem;color:var(--main-text3);margin-top:4px;text-align:center">Uploading...</div>
            </div>
            <p class="auth-error" id="submit-task-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns">
            <button class="btn btn-ghost" onclick="hideModal()">Cancel</button>
            <button class="btn btn-green" id="submit-task-btn" onclick="doSubmitTaskFile(${taskId})">Submit</button>
        </div>
    </div>`);

    setTimeout(() => {
        const dz = document.getElementById('submit-task-drop-zone');
        const fi = document.getElementById('submit-task-file-input');
        if (dz && fi) {
            dz.onclick = () => fi.click();
            dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
            dz.ondragleave = () => { dz.style.borderColor = 'var(--main-border)'; };
            dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = 'var(--main-border)'; if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;handleTaskFileSelect(fi);} };
        }
    }, 100);
};

let _taskSubmitFile = null;

const handleTaskFileSelect = input => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        document.getElementById('submit-task-error').textContent = 'File too large. Max 20MB.';
        input.value = '';
        _taskSubmitFile = null;
        return;
    }
    if (!isFileSafe(file)) {
        document.getElementById('submit-task-error').textContent = 'File type not allowed.';
        input.value = '';
        _taskSubmitFile = null;
        return;
    }
    document.getElementById('submit-task-error').textContent = '';
    _taskSubmitFile = file;
    document.getElementById('submit-task-file-info').innerHTML =
        `<div style="font-size:1rem;font-weight:600;color:var(--main-text)">${getFileTypeIcon(file.name)} ${esc(file.name)}</div>
         <div style="font-size:.82rem;color:var(--main-text3);margin-top:4px">${formatFileSize(file.size)}</div>`;
};

const doSubmitTaskFile = async taskId => {
    const errEl = document.getElementById('submit-task-error');
    if (!_taskSubmitFile) { errEl.textContent = 'Select a file'; return; }

    const task = (DB.fileTasks || []).find(t => t.id === taskId);

    const driveId = parseInt(document.getElementById('submit-task-drive').value);
    const drive = (DB.driveSettings || []).find(d => d.id === driveId);
    if (!drive) { errEl.textContent = 'Select a drive folder'; return; }

    const remark = (document.getElementById('submit-task-remark')?.value || '').trim();

    const btn = document.getElementById('submit-task-btn');
    const progress = document.getElementById('submit-task-progress');
    const bar = document.getElementById('submit-task-bar');
    const txt = document.getElementById('submit-task-txt');

    btn.disabled = true; btn.textContent = 'Submitting...';
    progress.style.display = 'block'; bar.style.width = '20%'; txt.textContent = 'Reading file...';
    errEl.textContent = '';

    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(_taskSubmitFile);
        });

        bar.style.width = '40%'; txt.textContent = 'Uploading to Drive...';
        const safeName = safeFileName(_taskSubmitFile.name);
        const result = await api('/upload-to-drive', {
            method: 'POST',
            body: { fileBase64: base64, fileName: safeName, mimeType: _taskSubmitFile.type || 'application/octet-stream', folderId: drive.folderId }
        });
        if (result.error) throw new Error(result.error);

        bar.style.width = '70%'; txt.textContent = 'Recording submission...';
        await api('/file-tasks/' + taskId + '/submit', {
            method: 'POST',
            body: {
                fileName: safeName,
                fileUrl: result.fileUrl,
                driveFileId: result.fileId,
                fileSize: _taskSubmitFile.size,
                fileType: _taskSubmitFile.type,
                driveSettingId: driveId,
                remark: remark
            }
        });

        bar.style.width = '100%'; txt.textContent = 'Submitted successfully!';
        _taskSubmitFile = null;
        await loadDB();
        setTimeout(() => { hideModal(); renderEmployeeFiles(); }, 1200);
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
        btn.disabled = false; btn.textContent = 'Submit';
        progress.style.display = 'none';
    }
};

/* ==========================================================
   SECTION: EMPLOYEE — SETTINGS (optimized)
   ========================================================== */

let empSettingsRenderLock = false;
const renderEmpSettings = () => {
    if (empSettingsRenderLock) return;
    if (!currentUser?.memberId) return;
    const member = DB.members.find(m => m.id === currentUser.memberId);
    if (!member) return;
    empSettingsRenderLock = true;

    const posName = getPositionName(member.positionId);
    const deptName = getDeptName(member.departmentId);

    document.getElementById('emp-settings').innerHTML = `
    <div class="app-header"><h2>Settings</h2><div class="header-sub">Your profile and preferences</div></div>
    <div class="app-body" style="max-width:640px">
        <div class="pt-anim-filter" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">
            <div style="padding:12px 20px;border-bottom:1px solid var(--main-border)">
                <h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Profile Information</h2>
            </div>
            <div style="padding:20px">
                <div style="display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:center">
                    <span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Username</span>
                    <span style="font-weight:500;color:var(--main-text)">${esc(currentUser.username || '—')}</span>
                    <span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Name</span>
                    <span style="font-weight:500;color:var(--main-text)">${esc(member.name)}</span>
                    <span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Position</span>
                    <span style="font-weight:500;color:var(--main-text)">${esc(posName)}</span>
                    <span style="font-size:.82rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em">Department</span>
                    <span style="font-weight:500;color:var(--main-text)">${esc(deptName)}</span>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--main-border)">
                    <button class="btn btn-accent" id="pw-toggle-btn" onclick="togglePasswordSection()">Change Password</button>
                </div>
            </div>
        </div>

        <div id="password-section" style="display:none;opacity:0;transform:translateY(12px);transition:opacity 0.3s ease,transform 0.3s ease;background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px">
            <div style="padding:12px 20px;border-bottom:1px solid var(--main-border)">
                <h2 style="font-size:1.05rem;font-family:var(--font-d);font-weight:700;color:var(--main-text);margin:0">Change Password</h2>
            </div>
            <div style="padding:20px">
                <div style="display:flex;flex-direction:column;gap:14px;max-width:380px">
                    <div class="field">
                        <label>New Password</label>
                        <input class="input" id="settings-new-pw" type="password" placeholder="Enter new password">
                    </div>
                    <div class="field">
                        <label>Confirm New Password</label>
                        <input class="input" id="settings-confirm-pw" type="password" placeholder="Re-enter new password">
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-accent" onclick="doChangePassword()" style="min-width:140px">Update Password</button>
                        <button class="btn btn-ghost" onclick="cancelChangePassword()">Cancel</button>
                    </div>
                    <p class="auth-error" id="settings-error" style="margin:0"></p>
                    <p id="settings-success" style="margin:0;font-size:.85rem;color:var(--ok);display:none"></p>
                </div>
            </div>
        </div>
    </div>`;

    setTimeout(() => {
        const view = document.getElementById('emp-settings');
        const animatedEls = view.querySelectorAll('.pt-anim-filter');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter'));
        empSettingsRenderLock = false;
    }, 400);

    setTimeout(() => { empSettingsRenderLock = false; }, 500);
};

// Helper to reset password form state
const resetPasswordForm = () => {
    document.getElementById('settings-new-pw').value = '';
    document.getElementById('settings-confirm-pw').value = '';
    document.getElementById('settings-error').textContent = '';
    const success = document.getElementById('settings-success');
    success.textContent = '';
    success.style.display = 'none';
};

const togglePasswordSection = () => {
    const section = document.getElementById('password-section');
    const btn = document.getElementById('pw-toggle-btn');
    if (section.style.display === 'none' || !section.style.display) {
        section.style.display = 'block';
        btn.textContent = 'Change Password ▲';
        // 触发 transition：先 display:block，下一帧设 opacity/transform
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                section.style.opacity = '1';
                section.style.transform = 'translateY(0)';
            });
        });
    } else {
        section.style.opacity = '0';
        section.style.transform = 'translateY(12px)';
        setTimeout(() => {
            section.style.display = 'none';
            btn.textContent = 'Change Password';
            resetPasswordForm();
        }, 300);
    }
};

const cancelChangePassword = () => {
    const section = document.getElementById('password-section');
    section.style.opacity = '0';
    section.style.transform = 'translateY(12px)';
    setTimeout(() => {
        section.style.display = 'none';
        document.getElementById('pw-toggle-btn').textContent = 'Change Password';
        resetPasswordForm();
    }, 300);
};

const doChangePassword = async () => {
    const errEl = document.getElementById('settings-error');
    const sucEl = document.getElementById('settings-success');
    const newPw = document.getElementById('settings-new-pw').value;
    const confirmPw = document.getElementById('settings-confirm-pw').value;

    errEl.textContent = '';
    sucEl.style.display = 'none';

    if (!newPw) { errEl.textContent = 'New password is required'; return; }
    if (newPw.length < 4) { errEl.textContent = 'Minimum 4 characters'; return; }
    if (newPw !== confirmPw) { errEl.textContent = 'Passwords do not match'; return; }

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
};


/* ==========================================================
   SECTION 10: ADMIN — ATTENDANCE (optimized)
   ========================================================== */
let adminAttCurrentPage = 1, adminAttPageSize = 10, adminAttFilteredData = [];
var _adminAttInitialLoad = false;
let _adminOtPerEntry = new Map();

// ---------- reusable helpers ----------
const expandOtherItemIds = itemIds => {
    const ids = new Set(itemIds.map(Number).filter(n => !isNaN(n) && n !== 0));
    if (itemIds.includes('0') || itemIds.includes(0)) {
        DB.projects.forEach(p => { if (p.name.toLowerCase() === 'other') ids.add(p.id); });
    }
    return [...ids];
};

const sortedProjects = scopeId => {
    const list = scopeId
        ? DB.projects.filter(p => p.categoryId === scopeId)
        : [...DB.projects];
    list.sort((a, b) => (a.name.toLowerCase() === 'other' ? 1 : 0) - (b.name.toLowerCase() === 'other' ? 1 : 0) || a.name.localeCompare(b.name));
    return list;
};

const buildFilterItemOpts = scopeId => {
    const seenOther = false;
    const opts = [];
    sortedProjects(scopeId).forEach(p => {
        if (p.name.toLowerCase() === 'other') {
            if (!opts.some(o => o.value === 0)) opts.push({ value: 0, label: 'Other' });
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    });
    return opts;
};

const buildAttEmpOpts = (scopeIds, itemIds) => {
    if ((!scopeIds || !scopeIds.length) && (!itemIds || !itemIds.length)) {
        return getNonViewerMembers()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => ({ value: m.id, label: m.name }));
    }
    let projectIds = DB.projects.map(p => p.id);
    if (scopeIds?.length) {
        projectIds = DB.projects.filter(p => p.categoryId && scopeIds.includes(p.categoryId)).map(p => p.id);
    }
    if (itemIds?.length) {
        const expanded = expandOtherItemIds(itemIds);
        projectIds = projectIds.filter(id => expanded.includes(id));
    }
    const memberIds = new Set();
    DB.attendance.forEach(a => {
        if (a.projectId && projectIds.includes(a.projectId)) memberIds.add(a.memberId);
    });
    const viewerIds = getViewerMemberIds();
    return [...memberIds]
        .filter(mid => !viewerIds.includes(mid))
        .map(mid => DB.members.find(m => m.id === mid))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(m => ({ value: m.id, label: m.name }));
};

// Scope change handler (shared between add/edit)
const adminAttScopeChanged = (scopeId) => {
    if (!scopeId) {
        ssUpdate('ss-att-item', [], false);
        ssUpdate('ss-att-workplan', [], false);
        ssUpdate('ss-att-workdone', [], false);
        const subSel = document.getElementById('att-subscope');
        if (subSel) subSel.innerHTML = '<option value="">-- None --</option>';
        return;
    }
    const projects = sortedProjects(scopeId);
    ssUpdate('ss-att-item', projects.map(p => ({ value: p.id, label: p.name })), false);

    const subSel = document.getElementById('att-subscope');
    if (subSel) {
        const filtered = DB.subScopes.filter(s => s.scopeId === scopeId);
        subSel.innerHTML = '<option value="">-- None --</option>' +
            filtered.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    }

    const wl = DB.worklist.filter(w => w.scopeId === scopeId);
    const wlOpts = wl.map(w => ({ value: w.id, label: w.title }));
    ssUpdate('ss-att-workplan', wlOpts, false);
    ssUpdate('ss-att-workdone', wlOpts, false);

    const wpEl = document.getElementById('ss-att-workplan');
    const wdEl = document.getElementById('ss-att-workdone');
    if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
    if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
};

// ---------- main render ----------
let adminAttRenderLock = false;
const renderAdminAttendance = () => {
    if (adminAttRenderLock) return;
    adminAttRenderLock = true;

    adminAttCurrentPage = 1; adminAttPageSize = 10;

    const today = todayStr();
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const defaultFrom = d30.toISOString().slice(0, 10);

    const viewerScopeIds = getViewerVisibleScopeIds();
    const scopeList = (viewerScopeIds !== null
        ? DB.scopes.filter(s => viewerScopeIds.includes(s.id))
        : [...DB.scopes]).sort((a, b) => a.name.localeCompare(b.name));

    const deptList = [...DB.departments].sort((a, b) => a.name.localeCompare(b.name));
    const scopeOpts = scopeList.map(s => ({ value: s.id, label: s.name }));
    const deptOpts = deptList.map(d => ({ value: d.id, label: d.name }));
    const empOpts = buildAttEmpOpts([], []);

    document.getElementById('admin-attendance').innerHTML = `
    <div class="app-header"><h2>Attendance</h2><div class="header-sub">Track all employee attendance</div></div>
    <div class="app-body">
      <div class="pt-anim-filter filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
            <button class="btn btn-blue btn-sm" onclick="exportAttendanceCSV()">&#128196; Export CSV</button>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="att-from" value="${defaultFrom}" onchange="applyAdminAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="att-to" value="${today}" onchange="applyAdminAttendanceFilter()" style="width:145px;padding:8px 10px;font-size:.82rem"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-att-dept"></div></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-att-scope"></div></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-att-item"></div></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:150px" id="ssm-att-emp"></div></div>
            <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="resetAdminAttendanceFilter()">Reset</button>
            </div>
        </div>
      </div>
        <div class="pt-anim-head"><div class="stats-grid" id="att-stats" style="margin:0"></div></div>
        <div class="pt-anim-table">
            <div class="section-head time-entry-head">
            <h2 style="margin:0">Time Entries</h2>
          <div style="display:flex;gap:8px">
            ${currentUser.role !== 'viewer' ? '<button class="btn btn-green" onclick="showAdminAddAttendance()">+ Add Attendance</button>' : ''}
          </div>
        </div>
        <div id="admin-att-table-area"></div>
      </div>
    </div>`;

    setTimeout(() => {
        ssmCreate('ssm-att-dept', deptOpts, 'All Departments');
        ssmCreate('ssm-att-scope', scopeOpts, 'All Categories');
        ssmCreate('ssm-att-item', buildFilterItemOpts(), 'All ID/Names');
        ssmCreate('ssm-att-emp', empOpts, 'All Employees');

        ssmOnChange('ssm-att-scope', selectedIds => {
            const numIds = selectedIds.map(Number);
            const filtered = numIds.length ? sortedProjects().filter(p => numIds.includes(p.categoryId)) : sortedProjects();
            ssmUpdate('ssm-att-item', buildFilterItemOptsFromArray(filtered), true);
            const itemIds = ssmGetValues('ssm-att-item').map(Number);
            const deptIds = ssmGetValues('ssm-att-dept').map(Number);
            let newEmpOpts = buildAttEmpOpts(numIds, itemIds);
            if (deptIds.length) {
                const deptMids = DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id);
                newEmpOpts = newEmpOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-att-emp', newEmpOpts, true);
            applyAdminAttendanceFilter();
        });

        ssmOnChange('ssm-att-dept', selectedIds => {
            const numIds = selectedIds.map(Number);
            const scopeIds = ssmGetValues('ssm-att-scope').map(Number);
            const itemIds = ssmGetValues('ssm-att-item').map(Number);
            let newEmpOpts = buildAttEmpOpts(scopeIds, itemIds);
            if (numIds.length) {
                const deptMids = DB.members.filter(m => numIds.includes(m.departmentId)).map(m => m.id);
                newEmpOpts = newEmpOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-att-emp', newEmpOpts, true);
            applyAdminAttendanceFilter();
        });

        ssmOnChange('ssm-att-item', selectedIds => {
            const scopeIds = ssmGetValues('ssm-att-scope').map(Number);
            const itemIds = selectedIds.map(Number);
            const deptIds = ssmGetValues('ssm-att-dept').map(Number);
            let newEmpOpts = buildAttEmpOpts(scopeIds, itemIds);
            if (deptIds.length) {
                const deptMids = DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id);
                newEmpOpts = newEmpOpts.filter(o => deptMids.includes(parseInt(o.value)));
            }
            ssmUpdate('ssm-att-emp', newEmpOpts, true);
            applyAdminAttendanceFilter();
        });

        ssmOnChange('ssm-att-emp', () => applyAdminAttendanceFilter());
        _adminAttInitialLoad = true; 
        applyAdminAttendanceFilter();
        _adminAttInitialLoad = false;
    }, 250);

    setTimeout(() => {
        const view = document.getElementById('admin-attendance');
        const animatedEls = view.querySelectorAll('.pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-head', 'pt-anim-table'));
    }, 650);

    setTimeout(() => { adminAttRenderLock = false; }, 850);
};

// small helper for building filter options from array
function buildFilterItemOptsFromArray(projects) {
    const seenOther = false;
    const opts = [];
    projects.forEach(p => {
        if (p.name.toLowerCase() === 'other') {
            if (!opts.some(o => o.value === 0)) opts.push({ value: 0, label: 'Other' });
        } else {
            opts.push({ value: p.id, label: p.name });
        }
    });
    return opts;
}

const resetAdminAttendanceFilter = () => {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    document.getElementById('att-from').value = d30.toISOString().slice(0, 10);
    document.getElementById('att-to').value = todayStr();
    ssmClear('ssm-att-scope');
    ssmClear('ssm-att-dept');
    ssmUpdate('ssm-att-item', buildFilterItemOpts(), false);
    ssmUpdate('ssm-att-emp', buildAttEmpOpts([], []), false);
    adminAttCurrentPage = 1;
    applyAdminAttendanceFilter();
};

const applyAdminAttendanceFilter = () => {
    const fromDate = document.getElementById('att-from').value;
    const toDate = document.getElementById('att-to').value;
    const scopeIds = ssmGetValues('ssm-att-scope').map(Number);
    const itemIds = ssmGetValues('ssm-att-item').map(Number);
    const deptIds = ssmGetValues('ssm-att-dept').map(Number);
    const empIds = ssmGetValues('ssm-att-emp').map(Number);
    if (!fromDate || !toDate) return;

    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);

    const viewerMemberIds = new Set(getViewerMemberIds());
    filtered = filtered.filter(a => !viewerMemberIds.has(a.memberId));

    const viewerScopeIds = getViewerVisibleScopeIds();
    if (viewerScopeIds !== null) {
        const vpIds = new Set(DB.projects.filter(p => p.categoryId && viewerScopeIds.includes(p.categoryId)).map(p => p.id));
        filtered = filtered.filter(a => vpIds.has(a.projectId));
    }

    if (scopeIds.length) {
        const sids = new Set(DB.projects.filter(p => scopeIds.includes(p.categoryId)).map(p => p.id));
        filtered = filtered.filter(a => sids.has(a.projectId));
    }
    if (itemIds.length) {
        const expanded = expandOtherItemIds(itemIds);
        filtered = filtered.filter(a => expanded.includes(a.projectId));
    }
    if (deptIds.length) {
        const deptMids = new Set(DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id));
        filtered = filtered.filter(a => deptMids.has(a.memberId));
    }
    if (empIds.length) {
        const empSet = new Set(empIds);
        filtered = filtered.filter(a => empSet.has(a.memberId));
    }

    filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    adminAttFilteredData = filtered;

    // Group by member+date for daily OT
    const dayMap = new Map();
    filtered.forEach(r => {
        const key = r.memberId + '_' + r.date;
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key).push(r);
    });

    _adminOtPerEntry = new Map();
    let totalMs = 0, totalCost = 0, totalOtMs = 0;

    dayMap.forEach((dayEntries) => {
        const memberId = dayEntries[0].memberId;
        const date = dayEntries[0].date;

        dayEntries.sort((a, b) => (a.clockIn || '').localeCompare(b.clockIn || ''));

        const anyWithClock = dayEntries.find(r => r.clockIn && r.clockOut);
        if (!anyWithClock) return;
        const stdResult = calcOT(anyWithClock.clockIn, anyWithClock.clockOut, memberId, date);
        const standardMs = stdResult.standardHours * 3600000;

        let cumulativeMs = 0;
        dayEntries.forEach(r => {
            const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
            const entryMs = result.ms || 0;
            const prevCumulative = cumulativeMs;
            cumulativeMs += entryMs;
            totalMs += entryMs;
            totalCost += getEntryCost(r.memberId, entryMs) || 0;

            let entryOtMs = 0;
            if (prevCumulative < standardMs && cumulativeMs > standardMs) {
                entryOtMs = cumulativeMs - standardMs;
            } else if (prevCumulative >= standardMs) {
                entryOtMs = entryMs;
            }

            _adminOtPerEntry.set(r.id, entryOtMs);
            totalOtMs += entryOtMs;
        });
    });

    const empSet = new Set();
    const projSet = new Set();
    filtered.forEach(r => {
        empSet.add(r.memberId);
        if (r.projectId) projSet.add(r.projectId);
    });

    const ac = _adminAttInitialLoad ? ' stat-anim' : '';
    document.getElementById('att-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card${ac}"><div class="stat-label">Entries</div><div class="stat-value">${filtered.length}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Employees</div><div class="stat-value">${empSet.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Items</div><div class="stat-value">${projSet.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Hours</div><div class="stat-value">${formatDuration(totalMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">OT</div><div class="stat-value" style="color:var(--warning)">${formatDuration(totalOtMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Cost</div><div class="stat-value">${fmtCost(totalCost)}</div></div>
        </div>`;

    const totalPages = Math.ceil(filtered.length / adminAttPageSize) || 1;
    if (adminAttCurrentPage > totalPages) adminAttCurrentPage = totalPages;
    if (adminAttCurrentPage < 1) adminAttCurrentPage = 1;

    renderAdminAttPage();
};

const renderAdminAttPage = () => {
    const filtered = adminAttFilteredData;
    const totalPages = Math.ceil(filtered.length / adminAttPageSize) || 1;
    const start = (adminAttCurrentPage - 1) * adminAttPageSize;
    const page = filtered.slice(start, start + adminAttPageSize);

    const rows = filtered.length === 0
        ? `<tr><td colspan="14" style="text-align:center;color:var(--main-text3);padding:30px">No attendance records found</td></tr>`
        : page.map((r, idx) => {
            const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
            const dur = result.ms ? formatDuration(result.ms) : '—';
            const entryOtMs = _adminOtPerEntry.get(r.id) || 0;
            const otDisp = entryOtMs > 0 ? formatDuration(entryOtMs) : '—';
            const otColor = entryOtMs > 0 ? 'color:var(--warning)' : 'color:var(--main-text3)';
            const sTime = r.clockIn ? formatTime(r.clockIn) : '\u2014';
            const eTime = r.clockOut ? formatTime(r.clockOut) : '\u2014';
            const emp = DB.members.find(m => m.id === r.memberId);
            const dept = emp?.departmentId ? getDeptName(emp.departmentId) : '';
            const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
            const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
            const itemDisp = proj ? (scope ? `${esc(scope.name)} → ${esc(proj.name)}` : esc(proj.name)) : '—';
            const wp = r.work_plan_id ? DB.worklist.find(w => w.id === r.work_plan_id) : null;
            const wd = r.work_done_id ? DB.worklist.find(w => w.id === r.work_done_id) : null;
            const dayNum = new Date(r.date).getDay();
            const dayName = DAY_NAMES[dayNum];
            const dayColor = dayName === 'Sun' ? 'var(--danger)' : dayName === 'Sat' ? 'var(--warning)' : 'var(--main-text)';
            const actions = currentUser.role !== 'viewer'
                ? `<div class="actions-cell"><button class="btn-icon" onclick="showAdminEditAttendance(${r.id})">&#9998;</button><button class="btn-icon danger" onclick="confirmDeleteAttendance(${r.id})">&#10005;</button></div>`
                : '';
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start + idx + 1}</td>
                <td style="font-family:var(--font-m)">${formatDateDMY(r.date)}</td>
                <td style="color:${dayColor};font-weight:600">${dayName}</td>
                <td style="font-family:var(--font-m)">${sTime}</td>
                <td style="font-family:var(--font-m)">${eTime}</td>
                <td style="text-align:right;font-family:var(--font-m)">${dur}</td>
                <td style="text-align:right;font-family:var(--font-m);${otColor}">${otDisp}</td>
                <td>${dept ? esc(dept) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td>${emp ? esc(emp.name) : '?'}</td>
                <td>${itemDisp}</td>
                <td>${wp ? esc(wp.title) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td>${wd ? esc(wd.title) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.description||'')}">${r.description ? esc(r.description) : '<span style="color:var(--main-text3)">—</span>'}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(filtered.length, adminAttCurrentPage, adminAttPageSize,
        'goAdminAttPage', 'changeAdminAttPageSize',
        { label: 'entries', sizes: [10, 25, 50, 100] });

    document.getElementById('admin-att-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th style="width:50px">No</th><th>Date</th><th>Day</th><th>Start</th><th>End</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th><th>Department</th><th>Employee</th><th>Category → ID/Name</th><th>Work Plan</th><th>Work Done</th><th>Remark</th><th style="width:90px">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>${pagHtml}`;
};


const goAdminAttPage = page => {
    const totalPages = Math.ceil(adminAttFilteredData.length / adminAttPageSize) || 1;
    adminAttCurrentPage = Math.max(1, Math.min(page, totalPages));
    renderAdminAttPage();
};
const changeAdminAttPageSize = size => { adminAttPageSize = parseInt(size); adminAttCurrentPage = 1; renderAdminAttPage(); };

// ---------- Add / Edit ----------
const showAdminAddAttendance = () => {
    const scopeList = [...DB.scopes].sort((a, b) => a.name.localeCompare(b.name));

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Add Attendance</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>Employee</label><div id="ss-att-member"></div></div>
                <div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="${todayStr()}"></div>
                <div class="field"><label>Category</label><div id="ss-att-scope"></div></div>
                <div class="field"><label>ID/Name</label><div id="ss-att-item"></div></div>
                <div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- None --</option></select></div>
                <div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">${detailOpts(null)}</select></div>
                <div class="field"><label>Work Plan</label><div id="ss-att-workplan"></div></div>
                <div class="field"><label>Work Done</label><div id="ss-att-workdone"></div></div>
                <div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="09:00"></div>
                <div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="18:00"></div>
            </div>
            <div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" placeholder="For Other Selected" style="resize:vertical"></textarea></div>
            <p class="auth-error" id="att-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminAddAttendance()">Save</button></div>
    </div>`);

    setTimeout(() => {
        const memberOpts = getNonViewerMembers().map(m => ({ value: m.id, label: m.name }));
        ssCreate('ss-att-member', memberOpts, '-- Select Employee --');

        const scopeOpts = scopeList.map(s => ({ value: s.id, label: s.name }));
        ssCreate('ss-att-scope', scopeOpts, '-- Select Category --', function(val) {
            adminAttScopeChanged(val ? parseInt(val) : null);
        });

        ssCreate('ss-att-item', [], '-- Select Category First --');
        const wlOpts = DB.worklist.map(w => ({ value: w.id, label: w.title }));
        ssCreate('ss-att-workplan', wlOpts, '-- None --');
        ssCreate('ss-att-workdone', wlOpts, '-- None --');
    }, 50);
};

const doAdminAddAttendance = () => {
    const errEl = document.getElementById('att-error');
    const memberId = ssGetValue('ss-att-member');
    const date = document.getElementById('att-date').value;
    const itemId = ssGetValue('ss-att-item');
    const subScopeId = document.getElementById('att-subscope').value;
    const detailId = document.getElementById('att-detail').value;
    const workPlanId = ssGetValue('ss-att-workplan');
    const workDoneId = ssGetValue('ss-att-workdone');
    const start = document.getElementById('att-start').value;
    const end = document.getElementById('att-end').value;
    const desc = document.getElementById('att-desc').value.trim();

    errEl.textContent = '';
    if (!memberId) { errEl.textContent = 'Select employee'; return; }
    if (!date) { errEl.textContent = 'Date required'; return; }
    if (!itemId) { errEl.textContent = 'Select item'; return; }
    if (!start || !end) { errEl.textContent = 'Start/end required'; return; }
    if (start >= end) { errEl.textContent = 'End must be after start'; return; }

    api('/attendance', { method: 'POST', body: {
        memberId: parseInt(memberId),
        date,
        clockIn: `${date}T${start}:00`,
        clockOut: `${date}T${end}:00`,
        projectId: parseInt(itemId),
        subScopeId: subScopeId ? parseInt(subScopeId) : null,
        detailId: detailId ? parseInt(detailId) : null,
        work_plan_id: workPlanId ? parseInt(workPlanId) : null,
        work_done_id: workDoneId ? parseInt(workDoneId) : null,
        description: desc
    }})
    .then(() => { hideModal(); return loadDB(); })
    .then(() => applyAdminAttendanceFilter())
    .catch(e => { errEl.textContent = 'Failed: ' + e.message; });
};

const showAdminEditAttendance = id => {
    const entry = DB.attendance.find(a => a.id === id);
    if (!entry) return;

    const proj = entry.projectId ? DB.projects.find(p => p.id === entry.projectId) : null;
    const currentScopeId = proj?.categoryId || null;
    const scopeList = [...DB.scopes].sort((a, b) => a.name.localeCompare(b.name));

    const sTime = entry.clockIn ? entry.clockIn.split('T')[1].substring(0,5) : '';
    const eTime = entry.clockOut ? entry.clockOut.split('T')[1].substring(0,5) : '';

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Edit Attendance</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="field"><label>Date</label><input class="input" id="att-date" type="date" value="${entry.date}"></div><br>
                <div class="field"><label>Category</label><div id="ss-att-scope"></div></div>
                <div class="field"><label>ID/Name</label><div id="ss-att-item"></div></div>
                <div class="field" style="display:none"><label>Sub Scope</label><select class="input" id="att-subscope"><option value="">-- None --</option></select></div>
                <div class="field" style="display:none"><label>Detail</label><select class="input" id="att-detail">${detailOpts(entry.detailId)}</select></div>
                <div class="field"><label>Work Plan</label><div id="ss-att-workplan"></div></div>
                <div class="field"><label>Work Done</label><div id="ss-att-workdone"></div></div>
                <div class="field"><label>Start Time</label><input class="input" id="att-start" type="time" value="${sTime}"></div>
                <div class="field"><label>End Time</label><input class="input" id="att-end" type="time" value="${eTime}"></div>
            </div>
            <div class="field" style="margin-top:4px"><label>Remark</label><textarea class="input" id="att-desc" rows="2" style="resize:vertical">${esc(entry.description||'')}</textarea></div>
            <p class="auth-error" id="att-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="doAdminEditAttendance(${id})">Save</button></div>
    </div>`);

    setTimeout(() => {
        const scopeOpts = scopeList.map(s => ({ value: s.id, label: s.name }));
        ssCreate('ss-att-scope', scopeOpts, '-- Select Category --', function(val) {
            adminAttScopeChanged(val ? parseInt(val) : null);
        });
        if (currentScopeId) ssSetValue('ss-att-scope', currentScopeId);

        const projects = sortedProjects(currentScopeId);
        ssCreate('ss-att-item', projects.map(p => ({ value: p.id, label: p.name })), '-- Select ID/Name --');
        if (entry.projectId) ssSetValue('ss-att-item', entry.projectId);

        const wl = currentScopeId ? DB.worklist.filter(w => w.scopeId === currentScopeId) : DB.worklist;
        const wlOpts = wl.map(w => ({ value: w.id, label: w.title }));
        ssCreate('ss-att-workplan', wlOpts, '-- None --');
        if (entry.work_plan_id) ssSetValue('ss-att-workplan', entry.work_plan_id);
        ssCreate('ss-att-workdone', wlOpts, '-- None --');
        if (entry.work_done_id) ssSetValue('ss-att-workdone', entry.work_done_id);

        const wpEl = document.getElementById('ss-att-workplan');
        const wdEl = document.getElementById('ss-att-workdone');
        if (wpEl) wpEl.closest('.field').style.display = wlOpts.length ? '' : 'none';
        if (wdEl) wdEl.closest('.field').style.display = wlOpts.length ? '' : 'none';

        const subSel = document.getElementById('att-subscope');
        if (subSel) {
            const filtered = currentScopeId ? DB.subScopes.filter(s => s.scopeId === currentScopeId) : DB.subScopes;
            subSel.innerHTML = '<option value="">-- None --</option>' +
                filtered.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
            if (entry.subScopeId) subSel.value = entry.subScopeId;
        }
    }, 50);
};

const doAdminEditAttendance = (id) => {
    const errEl = document.getElementById('att-error');
    const date = document.getElementById('att-date').value;
    const itemId = ssGetValue('ss-att-item');
    const subScopeId = document.getElementById('att-subscope').value;
    const detailId = document.getElementById('att-detail').value;
    const workPlanId = ssGetValue('ss-att-workplan');
    const workDoneId = ssGetValue('ss-att-workdone');
    const start = document.getElementById('att-start').value;
    const end = document.getElementById('att-end').value;
    const desc = document.getElementById('att-desc').value.trim();

    errEl.textContent = '';
    if (!date) { errEl.textContent = 'Date required'; return; }
    if (!itemId) { errEl.textContent = 'Select item'; return; }
    if (!start || !end) { errEl.textContent = 'Start/end required'; return; }
    if (start >= end) { errEl.textContent = 'End must be after start'; return; }

    api('/attendance/' + id, { method: 'PUT', body: {
        date,
        clockIn: `${date}T${start}:00`,
        clockOut: `${date}T${end}:00`,
        projectId: parseInt(itemId),
        subScopeId: subScopeId ? parseInt(subScopeId) : null,
        detailId: detailId ? parseInt(detailId) : null,
        work_plan_id: workPlanId ? parseInt(workPlanId) : null,
        work_done_id: workDoneId ? parseInt(workDoneId) : null,
        description: desc
    }})
    .then(() => { hideModal(); return loadDB(); })
    .then(() => applyAdminAttendanceFilter())
    .catch(e => { errEl.textContent = 'Failed: ' + e.message; });
};

// Delete
const confirmDeleteAttendance = id => {
    const entry = DB.attendance.find(a => a.id === id);
    if (!entry) return;
    const emp = DB.members.find(m => m.id === entry.memberId);
    const proj = entry.projectId ? DB.projects.find(p => p.id === entry.projectId) : null;
    const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
    const label = proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : '—';
    showModal(`<h3>Delete Attendance</h3>
        <p style="color:var(--main-text2);line-height:1.6">Delete entry for <strong>${esc(emp?.name||'?')}</strong> on <strong>${entry.date}</strong>?<br>Item: ${esc(label)}</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteAttendance(${id})">Delete</button></div>`);
};

const doDeleteAttendance = (id) => {
    api('/attendance/' + id, { method: 'DELETE' })
        .then(() => { hideModal(); return loadDB(); })
        .then(() => applyAdminAttendanceFilter())
        .catch(e => { alert('Failed: ' + e.message); });
};

// CSV Export
const exportAttendanceCSV = () => {
    const data = adminAttFilteredData;
    if (!data.length) { alert('No data to export'); return; }
    const headers = ['No','Date','Day','Department','Employee','Category','ID/Name','Work Plan','Work Done','Start','End','Duration','OT','Remark'];
    const rows = data.map((r, idx) => {
        const emp = DB.members.find(m => m.id === r.memberId);
        const dept = emp?.departmentId ? getDeptName(emp.departmentId) : '';
        const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
        const dur = result.ms ? formatDuration(result.ms) : '';
        const entryOtMs = _adminOtPerEntry.get(r.id) || 0;
        const ot = entryOtMs > 0 ? formatDuration(entryOtMs) : '';
        const sT = r.clockIn ? r.clockIn.split('T')[1].substring(0,5) : '';
        const eT = r.clockOut ? r.clockOut.split('T')[1].substring(0,5) : '';
        const wp = r.work_plan_id ? DB.worklist.find(w => w.id === r.work_plan_id) : null;
        const wd = r.work_done_id ? DB.worklist.find(w => w.id === r.work_done_id) : null;
        const dayNum = new Date(r.date).getDay();
        const dayName = DAY_NAMES[dayNum];
        return [idx + 1, formatDateDMY(r.date), dayName, dept, emp ? emp.name : '', scope ? scope.name : '', proj ? proj.name : '', wp ? wp.title : '', wd ? wd.title : '', sT, eT, dur, ot, r.description||''];
    });
    const csv = [headers.join(',')].concat(rows.map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
};


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
   SECTION 18: ADMIN — Report (using calcOT from Utilities)
   ========================================================== */
let rptItemPage = 1, rptItemPageSize = 10, rptItemData_cache = [];
let rptEmpPage = 1, rptEmpPageSize = 10, rptEmpData_cache = [];
let rptTimePage = 1, rptTimePageSize = 10, rptTimeData_cache = [];
var _adminRptInitialLoad = false;

// ---------- helpers (same as before) ----------
const buildAdminRptEmpOpts = (scopeIds, itemIds) => {
    if ((!scopeIds || !scopeIds.length) && (!itemIds || !itemIds.length)) {
        return getNonViewerMembers()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => ({ value: m.id, label: m.name }));
    }
    let projectIds = DB.projects.map(p => p.id);
    if (scopeIds && scopeIds.length) {
        projectIds = DB.projects.filter(p => p.categoryId && scopeIds.includes(p.categoryId)).map(p => p.id);
    }
    if (itemIds && itemIds.length) {
        const expanded = expandOtherItemIds(itemIds);
        projectIds = projectIds.filter(id => expanded.includes(id));
    }
    const memberIds = new Set();
    DB.attendance.forEach(a => {
        if (a.projectId && projectIds.includes(a.projectId)) memberIds.add(a.memberId);
    });
    const viewerIds = getViewerMemberIds();
    return [...memberIds]
        .filter(mid => !viewerIds.includes(mid))
        .map(mid => DB.members.find(m => m.id === mid))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(m => ({ value: m.id, label: m.name }));
};

const rptUpdateItemsAndEmployees = (scopeIds, itemIds, deptIds) => {
    const filteredProjects = (scopeIds && scopeIds.length)
        ? sortedProjects().filter(p => scopeIds.includes(p.categoryId))
        : sortedProjects();
    const itemOpts = [];
    let seenOther = false;
    filteredProjects.forEach(p => {
        if (p.name.toLowerCase() === 'other') {
            if (!seenOther) { seenOther = true; itemOpts.push({ value: 0, label: 'Other' }); }
        } else {
            itemOpts.push({ value: p.id, label: p.name });
        }
    });
    ssmUpdate('ssm-rpt-item', itemOpts, true);
    let empOpts = buildAdminRptEmpOpts(scopeIds, itemIds);
    if (deptIds && deptIds.length) {
        const deptMemberIds = new Set(DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id));
        empOpts = empOpts.filter(o => deptMemberIds.has(parseInt(o.value)));
    }
    ssmUpdate('ssm-rpt-emp', empOpts, true);
    generateReport();
};

// ---------- main render ----------
let adminRptRenderLock = false;
const renderAdminReport = () => {
    if (adminRptRenderLock) return;
    adminRptRenderLock = true;

    const today = todayStr();
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const defaultFrom = d30.toISOString().slice(0, 10);

    const viewerScopeIds = getViewerVisibleScopeIds();
    const scopeList = (viewerScopeIds !== null
        ? DB.scopes.filter(s => viewerScopeIds.includes(s.id))
        : [...DB.scopes]).sort((a, b) => a.name.localeCompare(b.name));
    const deptList = [...DB.departments].sort((a, b) => a.name.localeCompare(b.name));
    const scopeOpts = scopeList.map(s => ({ value: s.id, label: s.name }));
    const deptOpts = deptList.map(d => ({ value: d.id, label: d.name }));
    const empOpts = buildAdminRptEmpOpts([], []);

    document.getElementById('admin-report').innerHTML = `
    <div class="app-header"><h2>Report</h2><div class="header-sub">Summary and analytics</div></div>
    <div class="app-body">
        <div class="pt-anim-filter filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
            <button class="btn btn-blue btn-sm" onclick="exportReportExcel()">&#128196; Export CSV</button>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label><input type="date" class="input" id="rpt-from" value="${defaultFrom}" onchange="generateReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="rpt-to" value="${today}" onchange="generateReport()" style="width:155px;padding:8px 10px;font-size:.82rem"></div>
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Department</label><div style="min-width:140px" id="ssm-rpt-dept"></div></div>
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Category</label><div style="min-width:140px" id="ssm-rpt-scope"></div></div>
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">ID/Name</label><div style="min-width:160px" id="ssm-rpt-item"></div></div>
          <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Employee</label><div style="min-width:160px" id="ssm-rpt-emp"></div></div>
          <div style="display:flex;gap:8px;margin-left:auto"><button class="btn btn-ghost btn-sm" onclick="resetReport()">Reset</button></div>
        </div>
      </div>
      <div class="pt-anim-head" id="rpt-stats"></div>
      <div class="pt-anim-table" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px" id="rpt-charts-row1"></div>
      <div id="rpt-charts-row2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px"></div>
      <div id="rpt-tables"></div>
    </div>`;

    setTimeout(() => {
        ssmCreate('ssm-rpt-dept', deptOpts, 'All Departments');
        ssmCreate('ssm-rpt-scope', scopeOpts, 'All Categories');
        ssmCreate('ssm-rpt-item', buildFilterItemOpts(), 'All ID/Names');
        ssmCreate('ssm-rpt-emp', empOpts, 'All Employees');

        ssmOnChange('ssm-rpt-scope', selected => {
            const scopeIds = selected.map(Number);
            const itemIds = ssmGetValues('ssm-rpt-item').map(Number);
            const deptIds = ssmGetValues('ssm-rpt-dept').map(Number);
            rptUpdateItemsAndEmployees(scopeIds, itemIds, deptIds);
        });
        ssmOnChange('ssm-rpt-dept', selected => {
            const deptIds = selected.map(Number);
            const scopeIds = ssmGetValues('ssm-rpt-scope').map(Number);
            const itemIds = ssmGetValues('ssm-rpt-item').map(Number);
            rptUpdateItemsAndEmployees(scopeIds, itemIds, deptIds);
        });
        ssmOnChange('ssm-rpt-item', selected => {
            const itemIds = selected.map(Number);
            const scopeIds = ssmGetValues('ssm-rpt-scope').map(Number);
            const deptIds = ssmGetValues('ssm-rpt-dept').map(Number);
            rptUpdateItemsAndEmployees(scopeIds, itemIds, deptIds);
        });
        ssmOnChange('ssm-rpt-emp', () => generateReport());
        _adminRptInitialLoad = true;
        generateReport();
        _adminRptInitialLoad = false;
    }, 250);

    setTimeout(() => {
        const view = document.getElementById('admin-report');
        const animatedEls = view.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table');
        animatedEls.forEach(el => el.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table'));
    }, 650);

    setTimeout(() => { adminRptRenderLock = false; }, 850);
};

const resetReport = () => {
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    document.getElementById('rpt-from').value = d30.toISOString().slice(0, 10);
    document.getElementById('rpt-to').value = todayStr();
    ssmClear('ssm-rpt-scope');
    ssmClear('ssm-rpt-dept');
    ssmUpdate('ssm-rpt-item', buildFilterItemOpts(), false);
    ssmUpdate('ssm-rpt-emp', buildAdminRptEmpOpts([], []), false);
    generateReport();
};

// ---------- Generate Report ----------
const generateReport = () => {
    const fromDate = document.getElementById('rpt-from')?.value;
    const toDate = document.getElementById('rpt-to')?.value;
    const scopeIds = ssmGetValues('ssm-rpt-scope').map(Number);
    const itemIds = ssmGetValues('ssm-rpt-item').map(Number);
    const deptIds = ssmGetValues('ssm-rpt-dept').map(Number);
    const empIds = ssmGetValues('ssm-rpt-emp').map(Number);
    if (!fromDate || !toDate) return;

    let filtered = DB.attendance.filter(a => a.date >= fromDate && a.date <= toDate);

    const viewerMemberIds = new Set(getViewerMemberIds());
    filtered = filtered.filter(a => !viewerMemberIds.has(a.memberId));

    const viewerScopeIds = getViewerVisibleScopeIds();
    if (viewerScopeIds !== null) {
        const vpIds = new Set(DB.projects.filter(p => p.categoryId && viewerScopeIds.includes(p.categoryId)).map(p => p.id));
        filtered = filtered.filter(a => vpIds.has(a.projectId));
    }
    if (scopeIds.length) {
        const sids = new Set(DB.projects.filter(p => scopeIds.includes(p.categoryId)).map(p => p.id));
        filtered = filtered.filter(a => sids.has(a.projectId));
    }
    if (itemIds.length) {
        const expanded = expandOtherItemIds(itemIds);
        filtered = filtered.filter(a => expanded.includes(a.projectId));
    }
    if (deptIds.length) {
        const deptMids = new Set(DB.members.filter(m => deptIds.includes(m.departmentId)).map(m => m.id));
        filtered = filtered.filter(a => deptMids.has(a.memberId));
    }
    if (empIds.length) {
        const empSet = new Set(empIds);
        filtered = filtered.filter(a => empSet.has(a.memberId));
    }

    // Aggregate with OT (daily-based)
    let totalMs = 0, totalCost = 0, totalOtMs = 0, totalStandardMs = 0;
    const itemMap = new Map();
    const scopeMap = new Map();
    const empMap = new Map();
    const monthlyMap = new Map();
    const timeDetails = [];
    const entryByDay = new Map();
    const countedDays = new Set();
    const empCountedDays = new Set();

    filtered.forEach(r => {
        const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
        if (!result.ms) return;
        const { hours, standardHours: stdHrs, ms } = result;
        const cost = getEntryCost(r.memberId, ms) || 0;
        const standardMs = stdHrs * 3600000;
        const dayKey = r.memberId + '_' + r.date;

        totalMs += ms;
        totalCost += cost;

        // Overall standard: once per member+day
        if (!countedDays.has(dayKey)) {
            countedDays.add(dayKey);
            totalStandardMs += standardMs;
        }

        // Item map
        const pid = r.projectId || 0;
        if (!itemMap.has(pid)) itemMap.set(pid, { cost: 0, ms: 0, otMs: 0, standardMs: 0, entries: 0, members: new Set(), days: new Set(), _countedDays: new Set() });
        const is = itemMap.get(pid);
        is.cost += cost; is.ms += ms; is.entries++; is.members.add(r.memberId); is.days.add(r.date);
        if (!is._countedDays.has(dayKey)) {
            is._countedDays.add(dayKey);
            is.standardMs += standardMs;
        }

        // Scope map
        const proj = r.projectId ? DB.projects.find(p => p.id === r.projectId) : null;
        const sid = proj?.categoryId || 0;
        if (!scopeMap.has(sid)) scopeMap.set(sid, { cost: 0 });
        scopeMap.get(sid).cost += cost;

        // Emp map
        if (!empMap.has(r.memberId)) empMap.set(r.memberId, { cost: 0, ms: 0, otMs: 0, standardMs: 0, entries: 0, days: new Set() });
        const es = empMap.get(r.memberId);
        es.cost += cost; es.ms += ms; es.entries++; es.days.add(r.date);
        if (!empCountedDays.has(dayKey)) {
            empCountedDays.add(dayKey);
            es.standardMs += standardMs;
        }

        // Monthly map
        const month = r.date.substring(0, 7);
        if (!monthlyMap.has(month)) monthlyMap.set(month, { ms: 0, otMs: 0, cost: 0 });
        const mStats = monthlyMap.get(month);
        mStats.ms += ms; mStats.cost += cost;

        // Group for daily OT
        if (!entryByDay.has(dayKey)) entryByDay.set(dayKey, { entries: [], standardMs });
        entryByDay.get(dayKey).entries.push(r);

        // Time detail (OT placeholder)
        const member = DB.members.find(m => m.id === r.memberId);
        const dayNum = new Date(r.date).getDay();
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const projectLabel = proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : '\u2014';
        timeDetails.push({
            date: r.date,
            dayOfWeek: DAY_NAMES[dayNum],
            memberId: r.memberId,
            name: member ? member.name : 'Unknown',
            dept: member ? getDeptName(member.departmentId) : '\u2014',
            clockIn: r.clockIn,
            clockOut: r.clockOut,
            hours,
            standardHours: stdHrs,
            ot: 0,
            entryId: r.id,
            project: projectLabel
        });
    });

    // Step 2: Calculate daily OT and assign per-entry
    const rptOtPerEntry = new Map();
    entryByDay.forEach(({ entries, standardMs }) => {
        entries.sort((a, b) => (a.clockIn || '').localeCompare(b.clockIn || ''));
        let cumulativeMs = 0;
        entries.forEach(r => {
            const result = calcOT(r.clockIn, r.clockOut, r.memberId, r.date);
            const entryMs = result.ms || 0;
            const prevCumulative = cumulativeMs;
            cumulativeMs += entryMs;

            let entryOtMs = 0;
            if (prevCumulative < standardMs && cumulativeMs > standardMs) {
                entryOtMs = cumulativeMs - standardMs;
            } else if (prevCumulative >= standardMs) {
                entryOtMs = entryMs;
            }

            rptOtPerEntry.set(r.id, entryOtMs);
            totalOtMs += entryOtMs;

            const pid = r.projectId || 0;
            if (itemMap.has(pid)) itemMap.get(pid).otMs += entryOtMs;
            if (empMap.has(r.memberId)) empMap.get(r.memberId).otMs += entryOtMs;
            const month = r.date.substring(0, 7);
            if (monthlyMap.has(month)) monthlyMap.get(month).otMs += entryOtMs;
        });
    });

    // Step 3: Fill OT in time details
    timeDetails.forEach(t => {
        const otMs = rptOtPerEntry.get(t.entryId) || 0;
        t.ot = otMs / 3600000;
    });

    timeDetails.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    rptTimeData_cache = timeDetails;

    const totalHours = totalMs / 3600000;
    const totalOtHours = totalOtMs / 3600000;
    const avgUtil = totalStandardMs > 0 ? (totalMs / totalStandardMs * 100) : 0;

    const ac = _adminRptInitialLoad ? ' stat-anim' : '';
    document.getElementById('rpt-stats').innerHTML = `
        <div class="stats-grid" style="margin-bottom:24px">
            <div class="stat-card${ac}"><div class="stat-label">Total Records</div><div class="stat-value">${filtered.length}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total Hours</div><div class="stat-value">${formatDuration(totalMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total OT</div><div class="stat-value" style="color:var(--warning)">${formatDuration(totalOtMs)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Utilization</div><div class="stat-value" style="color:${avgUtil >= 100 ? 'var(--green)' : avgUtil >= 80 ? 'var(--warning)' : 'var(--danger)'}">${avgUtil.toFixed(1)}%</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total Cost</div><div class="stat-value">${fmtCost(totalCost)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active Employees</div><div class="stat-value">${empMap.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active Categories</div><div class="stat-value">${scopeMap.size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Active ID/Name</div><div class="stat-value">${itemMap.size}</div></div>
        </div>`;

    // Charts
    const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

    const sortedItems = [...itemMap.entries()].sort((a, b) => b[1].cost - a[1].cost);
    const itemLabels = [], itemData = [], itemColors = [];
    sortedItems.forEach(([pid, stats], i) => {
        const proj = pid ? DB.projects.find(p => p.id === pid) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        itemLabels.push(proj ? (scope ? `${scope.name} → ${proj.name}` : proj.name) : 'Unassigned');
        itemData.push(Math.round(stats.cost * 100) / 100);
        itemColors.push(palette[i % palette.length]);
    });

    const sortedScopes = [...scopeMap.entries()].sort((a, b) => b[1].cost - a[1].cost);
    const scopeLabels = [], scopeData = [], scopeColors = [];
    sortedScopes.forEach(([sid, stats], i) => {
        const scope = sid ? DB.scopes.find(s => s.id === sid) : null;
        scopeLabels.push(scope ? scope.name : 'Uncategorized');
        scopeData.push(Math.round(stats.cost * 100) / 100);
        scopeColors.push(palette[i % palette.length]);
    });

    document.getElementById('rpt-charts-row1').innerHTML = `
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Cost by Category → ID/Name</h3>
            <div style="min-width:600px;height:280px"><canvas id="chart-item-cost"></canvas></div>
        </div>
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Cost by Category</h3>
            <div style="min-width:600px;height:280px"><canvas id="chart-scope-cost"></canvas></div>
        </div>`;

    const monthLabels = [...monthlyMap.keys()].sort();
    const monthHoursData = monthLabels.map(m => Math.round(monthlyMap.get(m).ms / 3600000 * 10) / 10);
    const monthOtData = monthLabels.map(m => Math.round(monthlyMap.get(m).otMs / 3600000 * 10) / 10);
    const monthCostData = monthLabels.map(m => Math.round(monthlyMap.get(m).cost * 100) / 100);
    const prettyMonths = monthLabels.map(m => {
        const [y, mo] = m.split('-');
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)-1] + ' ' + y.slice(2);
    });

    const empSorted = [...empMap.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);
    const empLabels = empSorted.map(([mid]) => {
        const m = DB.members.find(x => x.id === mid);
        return m ? m.name : 'Unknown';
    });
    const empData = empSorted.map(([, stats]) => Math.round(stats.ms / 3600000 * 10) / 10);

    document.getElementById('rpt-charts-row2').innerHTML = `
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Monthly Trend</h3>
            <div style="min-width:600px;height:280px"><canvas id="chart-monthly"></canvas></div>
        </div>
        <div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;overflow-x:auto">
            <h3 style="margin-bottom:16px;font-size:1rem">Top Employees by Hours</h3>
            <div style="min-width:600px;height:280px"><canvas id="chart-emp-hours"></canvas></div>
        </div>`;

    // Item Summary cache (no Util)
    rptItemData_cache = sortedItems.map(([pid, stats]) => {
        const proj = pid ? DB.projects.find(p => p.id === pid) : null;
        const scope = proj?.categoryId ? DB.scopes.find(s => s.id === proj.categoryId) : null;
        const label = proj ? (scope ? `${esc(scope.name)} → ${esc(proj.name)}` : esc(proj.name)) : '<span style="color:var(--main-text3)">Unassigned</span>';
        const cd = proj ? getProjectCountdown(proj) : null;
        let cdHtml = '\u2014';
        if (cd !== null) {
            if (cd > 30) cdHtml = `<span style="color:var(--ok);font-weight:600">${cd}d left</span>`;
            else if (cd > 7) cdHtml = `<span style="color:var(--warning);font-weight:600">${cd}d left</span>`;
            else if (cd > 0) cdHtml = `<span style="color:var(--danger);font-weight:600">${cd}d left</span>`;
            else if (cd === 0) cdHtml = `<span style="color:var(--warning);font-weight:600">Today!</span>`;
            else cdHtml = `<span style="color:var(--danger);font-weight:600">${Math.abs(cd)}d overdue</span>`;
        }
        return { label, cdHtml, days: stats.days.size, members: stats.members.size, entries: stats.entries, hours: stats.ms, otMs: stats.otMs, cost: stats.cost };
    });

    // Employee Summary cache (with Util — accurate per employee)
    rptEmpData_cache = empSorted.map(([mid, stats]) => {
        const member = DB.members.find(m => m.id === mid);
        const util = stats.standardMs > 0 ? (stats.ms / stats.standardMs * 100) : 0;
        return {
            name: member ? esc(member.name) : 'Unknown',
            pos: member ? esc(getPositionName(member.positionId)) : '\u2014',
            dept: member ? esc(getDeptName(member.departmentId)) : '\u2014',
            entries: stats.entries,
            days: stats.days.size,
            ms: stats.ms,
            otMs: stats.otMs,
            util,
            cost: stats.cost,
            rate: fmtHourlyRate(member)
        };
    });

    document.getElementById('rpt-tables').innerHTML = `
        <div class="section-head" style="margin-top:8px"><h2>Category Summary</h2></div>
        <div id="rpt-item-table-area"></div>
        <div class="section-head" style="margin-top:24px"><h2>Employee Summary</h2></div>
        <div id="rpt-emp-table-area"></div>
        <div class="section-head" style="margin-top:24px"><h2>Time Detail</h2></div>
        <div id="rpt-time-table-area"></div>`;

    rptItemPage = 1; rptEmpPage = 1; rptTimePage = 1;
    renderRptItemTable(rptItemData_cache);
    renderRptEmpTable(rptEmpData_cache);
    renderRptTimeTable(rptTimeData_cache);

    // Chart.js
    const chartTextColor = '#7a7570', chartGridColor = 'rgba(122,117,112,0.15)';
    new Chart(document.getElementById('chart-item-cost'), {
        type: 'bar',
        data: { labels: itemLabels, datasets: [{ label: 'Cost (RM)', data: itemData, backgroundColor: itemColors, borderRadius: 6, maxBarThickness: 50 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { color: chartTextColor, callback: v => 'RM' + v }, grid: { color: chartGridColor } }, x: { ticks: { color: chartTextColor, maxRotation: 45, font: { size: 10 } }, grid: { display: false } } } }
    });
    new Chart(document.getElementById('chart-scope-cost'), {
        type: 'doughnut',
        data: { labels: scopeLabels, datasets: [{ data: scopeData, backgroundColor: scopeColors, borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: chartTextColor, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => ctx.label + ': RM' + ctx.parsed.toFixed(2) } } } }
    });
    new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: { labels: prettyMonths, datasets: [
            { label: 'Hours', data: monthHoursData, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'OT', data: monthOtData, backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 6, yAxisID: 'y', maxBarThickness: 40 },
            { label: 'Cost (RM)', data: monthCostData, type: 'line', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 4, pointBackgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y1', fill: true }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartTextColor, usePointStyle: true, padding: 16 } } },
            scales: { y: { beginAtZero: true, position: 'left', ticks: { color: chartTextColor, callback: v => v + 'h' }, grid: { color: chartGridColor } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#ef4444', callback: v => 'RM' + v }, grid: { drawOnChartArea: false } }, x: { ticks: { color: chartTextColor }, grid: { display: false } } } }
    });
    new Chart(document.getElementById('chart-emp-hours'), {
        type: 'bar',
        data: { labels: empLabels, datasets: [{ label: 'Hours', data: empData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, maxBarThickness: 30 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { color: chartTextColor, callback: v => v + 'h' }, grid: { color: chartGridColor } }, y: { ticks: { color: chartTextColor, font: { size: 11 } }, grid: { display: false } } } }
    });
};

// ---------- Item Summary Table ----------
const renderRptItemTable = data => {
    const totalPages = Math.ceil(data.length / rptItemPageSize) || 1;
    if (rptItemPage > totalPages) rptItemPage = totalPages;
    if (rptItemPage < 1) rptItemPage = 1;
    const start = (rptItemPage - 1) * rptItemPageSize;
    const page = data.slice(start, start + rptItemPageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => `<tr>
            <td>${r.label}</td>
            <td>${r.cdHtml}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.days}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.members}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.entries}</td>
            <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.hours)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:var(--warning)">${formatDuration(r.otMs)}</td>
            <td style="text-align:right;font-family:var(--font-m)">${fmtCost(r.cost)}</td>
        </tr>`).join('');
    document.getElementById('rpt-item-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Category → ID/Name</th><th>Countdown</th><th style="text-align:right">Days</th><th style="text-align:right">Members</th><th style="text-align:right">Entries</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th><th style="text-align:right">Cost</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, rptItemPage, rptItemPageSize, 'goRptItemPage', 'changeRptItemPageSize')}`;
};

// ---------- Employee Summary Table ----------
const renderRptEmpTable = data => {
    const totalPages = Math.ceil(data.length / rptEmpPageSize) || 1;
    if (rptEmpPage > totalPages) rptEmpPage = totalPages;
    if (rptEmpPage < 1) rptEmpPage = 1;
    const start = (rptEmpPage - 1) * rptEmpPageSize;
    const page = data.slice(start, start + rptEmpPageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => `<tr>
            <td>${r.name}</td>
            <td>${r.pos}</td>
            <td>${r.dept}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.entries}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.days}</td>
            <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.ms)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:var(--warning)">${formatDuration(r.otMs)}</td>
            <td style="text-align:right;font-family:var(--font-m);color:${r.util >= 100 ? 'var(--green)' : r.util >= 80 ? 'var(--warning)' : 'var(--danger)'}">${r.util.toFixed(1)}%</td>
            <td style="text-align:right;font-family:var(--font-m)">${fmtCost(r.cost)}</td>
            <td style="text-align:right;font-family:var(--font-m)">${r.rate}</td>
        </tr>`).join('');
    document.getElementById('rpt-emp-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Employee</th><th>Position</th><th>Department</th><th style="text-align:right">Entries</th><th style="text-align:right">Days</th><th style="text-align:right">Duration</th><th style="text-align:right">OT</th><th style="text-align:right">Util%</th><th style="text-align:right">Cost</th><th style="text-align:right">Rate</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, rptEmpPage, rptEmpPageSize, 'goRptEmpPage', 'changeRptEmpPageSize')}`;
};

// ---------- Time Detail Table ----------
const renderRptTimeTable = data => {
    const totalPages = Math.ceil(data.length / rptTimePageSize) || 1;
    if (rptTimePage > totalPages) rptTimePage = totalPages;
    if (rptTimePage < 1) rptTimePage = 1;
    const start = (rptTimePage - 1) * rptTimePageSize;
    const page = data.slice(start, start + rptTimePageSize);
    const rows = data.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No data</td></tr>'
        : page.map(r => {
            const clockInStr = r.clockIn ? formatTime(r.clockIn) : '\u2014';
            const clockOutStr = r.clockOut ? formatTime(r.clockOut) : '\u2014';
            const dayColor = r.dayOfWeek === 'Sun' ? 'var(--danger)' : r.dayOfWeek === 'Sat' ? 'var(--warning)' : 'var(--main-text)';
            return `<tr>
                <td style="font-family:var(--font-m)">${formatDateDMY(r.date)}</td>
                <td style="color:${dayColor};font-weight:600">${r.dayOfWeek}</td>
                <td>${esc(r.name)}</td>
                <td>${esc(r.dept)}</td>
                <td>${r.project}</td>
                <td style="font-family:var(--font-m)">${clockInStr}</td>
                <td style="font-family:var(--font-m)">${clockOutStr}</td>
                <td style="text-align:right;font-family:var(--font-m)">${formatDuration(r.hours * 3600000)}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtStdHours(r.standardHours)}</td>
                <td style="text-align:right;font-family:var(--font-m);color:${r.ot > 0 ? 'var(--warning)' : 'var(--main-text3)'}">${r.ot > 0 ? formatDuration(r.ot * 3600000) : '\u2014'}</td>
            </tr>`;
        }).join('');
    document.getElementById('rpt-time-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Day</th><th>Employee</th><th>Department</th><th>Category → ID/Name</th><th>Clock In</th><th>Clock Out</th><th style="text-align:right">Duration</th><th style="text-align:right">Standard</th><th style="text-align:right">OT</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${buildRptPagination(data.length, rptTimePage, rptTimePageSize, 'goRptTimePage', 'changeRptTimePageSize')}`;
};

// ---------- Pagination ----------
function buildRptPagination(totalItems, currentPage, pageSize, goFunc, changeFunc) {
    if (totalItems <= 0) return '';
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIdx = (currentPage - 1) * pageSize;
    const showFrom = startIdx + 1;
    const showTo = Math.min(startIdx + pageSize, totalItems);
    let pageButtons = '';
    const maxVisible = 5;
    let startP = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endP = Math.min(totalPages, startP + maxVisible - 1);
    if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);
    pageButtons += `<button onclick="${goFunc}(1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    pageButtons += `<button onclick="${goFunc}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;
    for (let p = startP; p <= endP; p++) {
        pageButtons += `<button onclick="${goFunc}(${p})" class="${p === currentPage ? 'active' : ''}">${p}</button>`;
    }
    pageButtons += `<button onclick="${goFunc}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>`;
    pageButtons += `<button onclick="${goFunc}(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    return `<div class="pagination">
        <div class="pagination-info">Showing ${showFrom} to ${showTo} of ${totalItems}</div>
        <div style="display:flex;align-items:center;gap:20px">
            <div class="pagination-size"><label>Show</label>
                <select onchange="${changeFunc}(this.value)">
                    <option value="5"${pageSize === 5 ? ' selected' : ''}>5</option>
                    <option value="10"${pageSize === 10 ? ' selected' : ''}>10</option>
                    <option value="25"${pageSize === 25 ? ' selected' : ''}>25</option>
                    <option value="50"${pageSize === 50 ? ' selected' : ''}>50</option>
                </select></div>
            <div class="pagination-controls">${pageButtons}</div>
        </div></div>`;
}

const goRptItemPage = page => {
    const totalPages = Math.ceil(rptItemData_cache.length / rptItemPageSize) || 1;
    rptItemPage = Math.max(1, Math.min(page, totalPages));
    renderRptItemTable(rptItemData_cache);
};
const changeRptItemPageSize = size => { rptItemPageSize = parseInt(size); rptItemPage = 1; renderRptItemTable(rptItemData_cache); };
const goRptEmpPage = page => {
    const totalPages = Math.ceil(rptEmpData_cache.length / rptEmpPageSize) || 1;
    rptEmpPage = Math.max(1, Math.min(page, totalPages));
    renderRptEmpTable(rptEmpData_cache);
};
const changeRptEmpPageSize = size => { rptEmpPageSize = parseInt(size); rptEmpPage = 1; renderRptEmpTable(rptEmpData_cache); };
const goRptTimePage = page => {
    const totalPages = Math.ceil(rptTimeData_cache.length / rptTimePageSize) || 1;
    rptTimePage = Math.max(1, Math.min(page, totalPages));
    renderRptTimeTable(rptTimeData_cache);
};
const changeRptTimePageSize = size => { rptTimePageSize = parseInt(size); rptTimePage = 1; renderRptTimeTable(rptTimeData_cache); };

const exportReportExcel = () => {
    if (!rptItemData_cache.length && !rptEmpData_cache.length && !rptTimeData_cache.length) {
        alert('No data to export');
        return;
    }

    const strip = s => {
        if (!s) return '';
        return String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '\u2014').replace(/&laquo;/g, '\u00ab').replace(/&raquo;/g, '\u00bb').trim();
    };

    const rows = [];
    const fromDate = document.getElementById('rpt-from')?.value || '';
    const toDate = document.getElementById('rpt-to')?.value || '';
    rows.push(['Report: ' + fromDate + ' to ' + toDate]);
    rows.push([]);

    // Section 1: Category Summary (no Util%)
    rows.push(['CATEGORY SUMMARY']);
    rows.push(['Category \u2192 ID/Name', 'Countdown', 'Days', 'Members', 'Entries', 'Duration', 'OT', 'Cost']);
    if (rptItemData_cache.length) {
        rptItemData_cache.forEach(r => {
            rows.push([strip(r.label), strip(r.cdHtml), r.days, r.members, r.entries, formatDuration(r.hours), formatDuration(r.otMs), r.cost.toFixed(2)]);
        });
    } else { rows.push(['No data']); }

    rows.push([]);
    rows.push([]);

    // Section 2: Employee Summary (with Util%)
    rows.push(['EMPLOYEE SUMMARY']);
    rows.push(['Employee', 'Position', 'Department', 'Entries', 'Days', 'Duration', 'OT', 'Util%', 'Cost', 'Rate']);
    if (rptEmpData_cache.length) {
        rptEmpData_cache.forEach(r => {
            rows.push([strip(r.name), strip(r.pos), strip(r.dept), r.entries, r.days, formatDuration(r.ms), formatDuration(r.otMs), r.util.toFixed(1) + '%', r.cost.toFixed(2), r.rate]);
        });
    } else { rows.push(['No data']); }

    rows.push([]);
    rows.push([]);

    // Section 3: Time Detail
    rows.push(['TIME DETAIL']);
    rows.push(['Date', 'Day', 'Employee', 'Department', 'Category \u2192 ID/Name', 'Clock In', 'Clock Out', 'Duration', 'Standard', 'OT']);
    if (rptTimeData_cache.length) {
        rptTimeData_cache.forEach(r => {
            rows.push([
                r.date,
                r.dayOfWeek,
                r.name,
                r.dept,
                r.project,
                r.clockIn ? formatTime(r.clockIn) : '\u2014',
                r.clockOut ? formatTime(r.clockOut) : '\u2014',
                formatDuration(r.hours * 3600000),
                r.standardHours > 0 ? r.standardHours.toFixed(1) + 'h' : '\u2014',
                r.ot > 0 ? formatDuration(r.ot * 3600000) : '\u2014'
            ]);
        });
    } else { rows.push(['No data']); }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:35},{wch:18},{wch:18},{wch:10},{wch:10},{wch:30},{wch:10},{wch:10},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, 'report_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};


/* ==========================================================
   SECTION: ADMIN — FILES (Google Drive Upload)
   ========================================================== */
let fileCurrentPage = 1, filePageSize = 10, fileFilteredData = [];
var _adminFileInitialLoad = false;
let _selectedFiles = [];
let _editFileReplaceSelected = null;

const FILE_CATEGORIES = ['General', 'Report', 'Invoice', 'Drawing', 'Photo', 'Document'];

const getFileTypeIcon = (filename) => {
    if (!filename) return '📄';
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📕';
    if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return '🖼️';
    if (['doc','docx'].includes(ext)) return '📘';
    if (['xls','xlsx','csv'].includes(ext)) return '📗';
    if (['ppt','pptx'].includes(ext)) return '📙';
    if (['mp4','avi','mov','wmv'].includes(ext)) return '🎬';
    if (['zip','rar','7z'].includes(ext)) return '📦';
    return '📄';
};

const getFileTypeBadge = (type) => {
    if (!type) return '';
    const t = type.toLowerCase();
    let color = 'var(--main-text3)', bg = 'var(--main-border)', label = 'FILE';
    if (t.includes('pdf')) { color = '#dc2626'; bg = 'rgba(220,38,38,.1)'; label = 'PDF'; }
    else if (t.includes('image')) { color = '#2563eb'; bg = 'rgba(37,99,235,.1)'; label = 'IMG'; }
    else if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) { color = '#16a34a'; bg = 'rgba(22,163,74,.1)'; label = 'XLS'; }
    else if (t.includes('word') || t.includes('document')) { color = '#2563eb'; bg = 'rgba(37,99,235,.1)'; label = 'DOC'; }
    else if (t.includes('presentation') || t.includes('powerpoint')) { color = '#ea580c'; bg = 'rgba(234,88,12,.1)'; label = 'PPT'; }
    else if (t.includes('zip') || t.includes('rar') || t.includes('7z')) { color = '#8b5cf6'; bg = 'rgba(139,92,246,.1)'; label = 'ZIP'; }
    else if (t.includes('text') || t.includes('plain')) { color = 'var(--main-text3)'; bg = 'var(--main-border)'; label = 'TXT'; }
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600;color:${color};background:${bg}">${label}</span>`;
};

// ---------- main render ----------
let adminFileRenderLock = false;
const renderAdminFiles = () => {
    if (adminFileRenderLock) return;
    adminFileRenderLock = true;
    fileCurrentPage = 1; filePageSize = 10;

    const driveOpts = (DB.driveSettings||[]).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

    document.getElementById('admin-files').innerHTML = `
    <div class="app-header"><h2>Files</h2><div class="header-sub">Upload and manage files on Google Drive</div></div>
    <div class="app-body">
        <div class="pt-anim-filter filter-sticky" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
            <span style="font-size:1rem;font-family:var(--font-d);font-weight:600;color:var(--main-text)">Filter</span>
            <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
                ${currentUser.role === 'admin' ? '<button class="btn btn-blue btn-sm" onclick="showDriveSettings()">⚙ Drive Settings</button>' : ''}
            </div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <input class="input" type="text" placeholder="Search files..." id="file-search" oninput="applyFileFilter()" style="max-width:250px">
            <div style="display:flex;align-items:center;gap:6px">
                <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Drive Folder</label>
                <select class="input" id="file-drive-filter" onchange="applyFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">
                <option value="">All Folders</option>
                ${driveOpts}
                </select>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
                <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">From</label>
                <input class="input" type="date" id="file-date-from" onchange="applyFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">
            </div>
            <div style="display:flex;align-items:center;gap:6px">
                <label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label>
                <input class="input" type="date" id="file-date-to" onchange="applyFileFilter()" style="width:150px;padding:8px 10px;font-size:.82rem">
            </div>
            <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="resetFileFilter()">Reset</button>
                ${currentUser.role !== 'viewer' ? '<button class="btn btn-green" onclick="showUploadFile()">+ Upload File</button>' : ''}
                ${currentUser.role === 'admin' ? '<button class="btn btn-accent" onclick="showFileNoticesModal()">📋 Announces</button>' : ''}
                ${currentUser.role === 'admin' ? '<button class="btn btn-purple" onclick="showFileTasksModal()" style="background:#8b5cf6;color:#fff;border:none">📋 File Request</button>' : ''}
            </div>
            </div>
        </div>
        <div class="pt-anim-head"><div class="stats-grid" id="file-stats" style="margin:0"></div></div>
        <div class="pt-anim-table">
            <div class="section-head"><h2>All Files</h2></div>
            <div id="files-table-area"></div>
        </div>
    </div>`;

    setTimeout(() => { _adminFileInitialLoad = true; applyFileFilter(); _adminFileInitialLoad = false; }, 250);
    setTimeout(() => {
        const view = document.getElementById('admin-files');
        view.querySelectorAll('.pt-anim-filter,.pt-anim-head,.pt-anim-table').forEach(el => el.classList.remove('pt-anim-filter','pt-anim-head','pt-anim-table'));
    }, 650);
    setTimeout(() => { adminFileRenderLock = false; }, 850);
};

// ==========================================================
//   FILE NOTICES MODAL
// ==========================================================

let _editingNoticeId = null;
let _noticeFormListenersBound = false;

const showFileNoticesModal = () => {
    _editingNoticeId = null;
    renderNoticesModalContent();
};

const renderNoticesModalContent = () => {
    const notices = DB.fileNotices || [];
    const members = (DB.members || []).filter(m => m.role === 'employee');
    _modalNoticePage = 1;

    const memberCheckboxes = members.map(m =>
        `<label class="nm-member-label" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:.82rem;transition:background .15s" onmouseover="this.style.background='var(--main-border)'" onmouseout="this.style.background='transparent'" data-name="${esc(m.name.toLowerCase())}">
            <input type="checkbox" class="nm-cb" value="${m.id}"> ${esc(m.name)}
        </label>`
    ).join('');

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <!-- Header -->
        <div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <h3 style="margin:0">&#128227; File Announces</h3>
            <span style="font-size:.82rem;color:var(--main-text3)">${notices.length} total</span>
        </div>

        <!-- Scrollable area: form + search + list -->
        <div style="flex:1;min-height:0;overflow-y:auto">

            <!-- Form -->
            <div style="background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px;margin-bottom:16px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                    <input class="input" id="nm-title" placeholder="Title (required)">
                    <div style="display:flex;align-items:center;gap:10px">
                        <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer;white-space:nowrap">
                            <input type="checkbox" id="nm-active" checked> Active
                        </label>
                    </div>
                </div>
                <textarea class="input" id="nm-message" rows="2" placeholder="Message (optional)" style="margin-bottom:10px"></textarea>
                <div style="margin-bottom:10px">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                            <input type="radio" name="nm-target" value="all" checked onchange="document.getElementById('nm-members').style.display='none'"> All Employees
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                            <input type="radio" name="nm-target" value="multiple" onchange="document.getElementById('nm-members').style.display='block'"> Select Employees
                        </label>
                    </div>
                    <div id="nm-members" style="display:none">
                        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
                            <input class="input" id="nm-member-search" placeholder="Search employee..." oninput="filterNmMembers()" style="flex:1;min-width:200px;max-width:300px;font-size:.82rem;padding:8px 12px">
                            <button class="btn btn-ghost btn-sm" onclick="nmSelectVisible()">Select Visible</button>
                            <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.nm-cb').forEach(c=>c.checked=false);updateNmCount()">Deselect All</button>
                            <span id="nm-count" style="font-size:.78rem;color:var(--main-text3)">0 selected</span>
                        </div>
                        <div style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius);padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px" id="nm-member-list">
                            ${memberCheckboxes}
                        </div>
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                    <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer">
                        <input type="checkbox" id="nm-send-email"> Also send email notification
                    </label>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-ghost btn-sm" onclick="clearNmForm()">Clear</button>
                        <button class="btn btn-green btn-sm" id="nm-save-btn" onclick="saveNoticeFromModal()">+ Add</button>
                    </div>
                </div>
            </div>

            <!-- Notice Search -->
            <div style="margin-bottom:10px">
                <input class="input" id="nm-search" placeholder="Search reminders..." oninput="filterNoticeList()" style="width:100%">
            </div>

            <!-- Notice List -->
            <div id="nm-list">
                ${renderPaginatedNoticeList(notices)}
            </div>

        </div>

        <!-- Footer -->
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>
    </div>`);

    setTimeout(() => {
        document.querySelectorAll('.nm-cb').forEach(cb => {
            cb.addEventListener('change', updateNmCount);
        });
    }, 100);
};

const renderPaginatedNoticeList = (list) => {
    if (list.length === 0) {
        return '<div style="text-align:center;color:var(--main-text3);padding:30px 0;font-size:.85rem">No reminders found.</div>';
    }

    const totalPages = Math.ceil(list.length / _modalNoticePageSize) || 1;
    if (_modalNoticePage > totalPages) _modalNoticePage = totalPages;
    if (_modalNoticePage < 1) _modalNoticePage = 1;
    const start = (_modalNoticePage - 1) * _modalNoticePageSize;
    const page = list.slice(start, start + _modalNoticePageSize);

    const cards = page.map(n => {
        const targetLabel = n.targetType === 'all'
            ? '<span style="color:var(--accent);font-size:.78rem;font-weight:600">All Employees</span>'
            : n.targetMemberNames && n.targetMemberNames.length > 0
                ? `<span style="font-size:.78rem;color:var(--main-text2)">${n.targetMemberNames.map(esc).join(', ')}</span>`
                : '<span style="font-size:.78rem;color:var(--main-text3)">No one</span>';
        const statusDot = n.isActive
            ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a"></span>'
            : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--main-text3)"></span>';
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--main-bg);border-radius:var(--radius);border:1px solid var(--main-border);margin-bottom:6px">
            ${statusDot}
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.88rem;color:var(--main-text)">${esc(n.title)}</div>
                ${n.message ? `<div style="font-size:.82rem;color:var(--main-text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.message)}</div>` : ''}
            </div>
            <div style="white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">${targetLabel}</div>
            <div style="display:flex;gap:4px">
                <button class="btn-icon" title="Edit" onclick="editNoticeInModal(${n.id})">&#9998;</button>
                <button class="btn-icon danger" title="Delete" onclick="deleteNoticeInModal(${n.id})">&#10005;</button>
            </div>
        </div>`;
    }).join('');

    const pagHtml = buildPagination(list.length, _modalNoticePage, _modalNoticePageSize,
        'goModalNoticePage', 'changeModalNoticePageSize',
        { label: 'notices', sizes: [3, 5, 10, 25] });

    return cards + pagHtml;
};

const filterNoticeList = () => {
    _modalNoticePage = 1;
    const search = (document.getElementById('nm-search')?.value || '').toLowerCase();
    const notices = DB.fileNotices || [];

    if (!search) {
        document.getElementById('nm-list').innerHTML = renderPaginatedNoticeList(notices);
        return;
    }

    const filtered = notices.filter(n => {
        const names = (n.targetMemberNames || []).join(' ').toLowerCase();
        const haystack = [n.title, n.message, n.targetType, names].map(v => (v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    });

    document.getElementById('nm-list').innerHTML = renderPaginatedNoticeList(filtered);
};

const filterNmMembers = () => {
    const search = (document.getElementById('nm-member-search')?.value || '').toLowerCase();
    const labels = document.querySelectorAll('.nm-member-label');
    labels.forEach(label => {
        const name = label.getAttribute('data-name') || '';
        label.style.display = (!search || name.indexOf(search) !== -1) ? 'flex' : 'none';
    });
};

const nmSelectVisible = () => {
    document.querySelectorAll('.nm-member-label').forEach(label => {
        if (label.style.display !== 'none') {
            const cb = label.querySelector('.nm-cb');
            if (cb) cb.checked = true;
        }
    });
    updateNmCount();
};

let _modalNoticePage = 1, _modalNoticePageSize = 5;

const goModalNoticePage = page => {
    const search = (document.getElementById('nm-search')?.value || '').toLowerCase();
    const notices = DB.fileNotices || [];
    const list = search ? notices.filter(n => {
        const names = (n.targetMemberNames || []).join(' ').toLowerCase();
        const haystack = [n.title, n.message, n.targetType, names].map(v => (v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    }) : notices;
    const totalPages = Math.ceil(list.length / _modalNoticePageSize) || 1;
    _modalNoticePage = Math.max(1, Math.min(page, totalPages));
    document.getElementById('nm-list').innerHTML = renderPaginatedNoticeList(list);
};

const changeModalNoticePageSize = size => {
    _modalNoticePageSize = parseInt(size);
    _modalNoticePage = 1;
    const search = (document.getElementById('nm-search')?.value || '').toLowerCase();
    const notices = DB.fileNotices || [];
    const list = search ? notices.filter(n => {
        const names = (n.targetMemberNames || []).join(' ').toLowerCase();
        const haystack = [n.title, n.message, n.targetType, names].map(v => (v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    }) : notices;
    document.getElementById('nm-list').innerHTML = renderPaginatedNoticeList(list);
};

const updateNmCount = () => {
    const count = document.querySelectorAll('.nm-cb:checked').length;
    const el = document.getElementById('nm-count');
    if (el) el.textContent = count + ' selected';
};

const clearNmForm = () => {
    document.getElementById('nm-title').value = '';
    document.getElementById('nm-message').value = '';
    document.querySelector('input[name="nm-target"][value="all"]').checked = true;
    document.getElementById('nm-members').style.display = 'none';
    document.getElementById('nm-active').checked = true;
    document.querySelectorAll('.nm-cb').forEach(cb => cb.checked = false);
    updateNmCount();
    _editingNoticeId = null;
    document.getElementById('nm-save-btn').textContent = '+ Add';
};

const saveNoticeFromModal = async () => {
    const title = document.getElementById('nm-title').value.trim();
    const message = document.getElementById('nm-message').value.trim();
    const targetType = document.querySelector('input[name="nm-target"]:checked').value;
    const targetMemberIds = targetType === 'multiple'
        ? Array.from(document.querySelectorAll('.nm-cb:checked')).map(cb => parseInt(cb.value))
        : [];
    const isActive = document.getElementById('nm-active').checked;
    const sendEmail = document.getElementById('nm-send-email')?.checked || false;

    if (!title) { alert('Title is required'); return; }
    if (targetType === 'multiple' && targetMemberIds.length === 0) { alert('Select at least one employee'); return; }

    const saveBtn = document.getElementById('nm-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    const body = { title, message, targetType, targetMemberIds, isActive };

    try {
        if (_editingNoticeId) {
            await api('/file-notices/' + _editingNoticeId, { method: 'PUT', body });
            _editingNoticeId = null;
        } else {
            await api('/file-notices', { method: 'POST', body });
        }
    } catch (e) {
        alert('Failed to save notice: ' + e.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = _editingNoticeId ? 'Update' : '+ Add'; }
        return;
    }

    // --- Send Email ---
    let emailResult = null;
    if (sendEmail) {
        const members = (DB.members || []).filter(m => m.role === 'employee');
        let targetEmails = [];

        if (targetType === 'all') {
            targetEmails = members.filter(m => m.role === 'employee').map(m => m.email).filter(Boolean);
        } else {
            targetEmails = members
                .filter(m => targetMemberIds.includes(m.id) && m.email)
                .map(m => m.email);
        }

        if (targetEmails.length === 0) {
            emailResult = { success: false, message: 'No email addresses found for selected employees. Check that members have email set.' };
        } else {
            const htmlBody = `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
                    <div style="background:#f59e0b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
                        <h2 style="margin:0;font-size:1.2rem">${esc(title)}</h2>
                    </div>
                    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                        ${message ? `<p style="color:#374151;line-height:1.6">${esc(message)}</p>` : ''}
                        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
                        <p style="color:#9ca3af;font-size:.82rem">This is notification from Multitrade Management System.</p>
                    </div>
                </div>`;

            console.log('[Email] Attempting to send to:', targetEmails);

            try {
                const emailResponse = await api('/send-email', {
                    method: 'POST',
                    body: {
                        to: targetEmails,
                        subject: `[Multitrade] ${title}`,
                        htmlBody: htmlBody
                    }
                });
                console.log('[Email] Response:', emailResponse);
                emailResult = { success: true, message: `Email sent to ${targetEmails.length} recipient(s): ${targetEmails.join(', ')}` };
            } catch (e) {
                console.error('[Email] Send failed:', e);
                emailResult = { success: false, message: `Email failed: ${e.message}` };
            }
        }
    }

    await loadDB();
    renderNoticesModalContent();

    // --- Show result to user ---
    if (sendEmail) {
        setTimeout(() => {
            const color = emailResult.success ? '#16a34a' : 'var(--danger)';
            const icon = emailResult.success ? '✓' : '✕';
            const resultDiv = document.createElement('div');
            resultDiv.style.cssText = `position:fixed;top:20px;right:20px;z-index:10000;background:var(--main-surface);border:1px solid ${color};border-radius:var(--radius);padding:14px 20px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:400px;font-size:.85rem;color:${color}`;
            resultDiv.innerHTML = `<strong>${icon}</strong> ${esc(emailResult.message)}`;
            document.body.appendChild(resultDiv);
            setTimeout(() => resultDiv.remove(), 6000);
        }, 300);
    }
};

const editNoticeInModal = id => {
    const n = (DB.fileNotices || []).find(x => x.id === id);
    if (!n) return;

    _editingNoticeId = id;
    document.getElementById('nm-title').value = n.title;
    document.getElementById('nm-message').value = n.message;
    document.getElementById('nm-active').checked = n.isActive;

    if (n.targetType === 'multiple') {
        document.querySelector('input[name="nm-target"][value="multiple"]').checked = true;
        document.getElementById('nm-members').style.display = 'block';
        document.querySelectorAll('.nm-cb').forEach(cb => {
            cb.checked = n.targetMemberIds.includes(parseInt(cb.value));
        });
    } else {
        document.querySelector('input[name="nm-target"][value="all"]').checked = true;
        document.getElementById('nm-members').style.display = 'none';
        document.querySelectorAll('.nm-cb').forEach(cb => cb.checked = false);
    }

    updateNmCount();
    document.getElementById('nm-save-btn').textContent = 'Update';
    document.getElementById('nm-title').focus();
};

const deleteNoticeInModal = async id => {
    const n = (DB.fileNotices || []).find(x => x.id === id);
    if (!n) return;

    const modalBox = document.getElementById('modal-box');
    modalBox.innerHTML = `
    <h3>Delete Reminder</h3>
    <p style="color:var(--main-text2);line-height:1.6;margin-bottom:12px">
        Are you sure you want to delete this reminder?
    </p>
    <div style="background:var(--main-bg);border:1px solid var(--main-border);border-left:3px solid var(--danger);border-radius:var(--radius);padding:14px 18px;margin-bottom:20px">
        <div style="font-weight:600;font-size:.9rem;color:var(--main-text);margin-bottom:${n.message ? '6px' : '0'}">${esc(n.title)}</div>
        ${n.message ? `<div style="font-size:.84rem;color:var(--main-text3);line-height:1.6">${esc(n.message)}</div>` : ''}
    </div>
    <div class="btns">
        <button class="btn btn-ghost" onclick="renderNoticesModalContent()">Cancel</button>
        <button class="btn btn-danger" onclick="doDeleteNoticeFromModal(${id})">Delete</button>
    </div>`;
};

const restoreNoticesModal = () => {
    renderNoticesModalContent();
};

const doDeleteNoticeFromModal = async id => {
    await api('/file-notices/' + id, { method: 'DELETE' });
    await loadDB();
    renderNoticesModalContent();
};


const resetFileFilter = () => {
    document.getElementById('file-search').value = '';
    document.getElementById('file-drive-filter').value = '';
    document.getElementById('file-date-from').value = '';
    document.getElementById('file-date-to').value = '';
    fileCurrentPage = 1;
    applyFileFilter();
};

const applyFileFilter = () => {
    const search = (document.getElementById('file-search')?.value || '').toLowerCase();
    const driveFilter = document.getElementById('file-drive-filter')?.value || '';
    const dateFrom = document.getElementById('file-date-from')?.value || '';
    const dateTo = document.getElementById('file-date-to')?.value || '';
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name.toLowerCase(); });

    let filtered = (DB.files || []).filter(f => {
        if (driveFilter && String(f.driveSettingId) !== driveFilter) return false;
        if (dateFrom || dateTo) {
            const fileDate = f.createdAt ? f.createdAt.slice(0, 10) : '';
            if (!fileDate) return false;
            if (dateFrom && fileDate < dateFrom) return false;
            if (dateTo && fileDate > dateTo) return false;
        }
        if (search) {
            const driveName = f.driveSettingId ? (driveNameMap[f.driveSettingId] || '') : '';
            const dateFormatted = f.createdAt ? formatDateDMY(f.createdAt.slice(0,10)).toLowerCase() : '';
            const dateISO = f.createdAt ? f.createdAt.slice(0,10) : '';
            const haystack = [f.title, f.name, f.uploaderName, f.type, f.remark, driveName, dateFormatted, dateISO].map(v => (v||'').toLowerCase()).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        return true;
    });
    fileFilteredData = filtered;

    const totalSize = filtered.reduce((s, f) => s + (f.size || 0), 0);
    const ac = _adminFileInitialLoad ? ' stat-anim' : '';
    document.getElementById('file-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card${ac}"><div class="stat-label">Total Files</div><div class="stat-value">${filtered.length}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Total Size</div><div class="stat-value">${formatFileSize(totalSize)}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Uploaders</div><div class="stat-value">${new Set(filtered.map(f=>f.uploadedBy).filter(Boolean)).size}</div></div>
            <div class="stat-card${ac}"><div class="stat-label">Drive Folders</div><div class="stat-value">${new Set(filtered.map(f=>f.driveSettingId).filter(Boolean)).size}</div></div>
        </div>`;
    fileCurrentPage = 1;
    renderFileTable();
};

const renderFileTable = () => {
    const filtered = fileFilteredData;
    const totalPages = Math.ceil(filtered.length / filePageSize) || 1;
    if (fileCurrentPage > totalPages) fileCurrentPage = totalPages;
    if (fileCurrentPage < 1) fileCurrentPage = 1;
    const start = (fileCurrentPage - 1) * filePageSize;
    const page = filtered.slice(start, start + filePageSize);
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name; });

    const rows = filtered.length === 0
        ? '<tr><td colspan="10" style="text-align:center;color:var(--main-text3);padding:30px">No files found</td></tr>'
        : page.map((f, idx) => {
            const canEdit = currentUser.role !== 'viewer';
            const canDelete = currentUser.role !== 'viewer';
            const driveName = f.driveSettingId ? (driveNameMap[f.driveSettingId] || '—') : '—';
            const displayTitle = f.title ? esc(f.title) : '<span style="color:var(--main-text3)">—</span>';
            const actions = `<div class="actions-cell">
                <button class="btn-icon" title="Preview" onclick="previewFile(${f.id})">&#128065;</button>
                <button class="btn-icon" title="Open in Drive" onclick="window.open('${esc(f.url)}','_blank')">&#8599;</button>
                ${canEdit ? `<button class="btn-icon" title="Edit" onclick="showEditFileModal(${f.id})">&#9998;</button>` : ''}
                ${canDelete ? `<button class="btn-icon danger" title="Delete" onclick="confirmDeleteFile(${f.id})">&#10005;</button>` : ''}
            </div>`;
            return `<tr>
                <td style="font-family:var(--font-m);color:var(--main-text3)">${start+idx+1}</td>
                <td title="${esc(f.title||'')}">${displayTitle}</td>
                <td>${getFileTypeIcon(f.name)} <strong>${esc(f.name)}</strong></td>
                <td>${getFileTypeBadge(f.type)}</td>
                <td style="text-align:right;font-family:var(--font-m)">${formatFileSize(f.size)}</td>
                <td><span style="font-size:.82rem">${esc(driveName)}</span></td>
                <td>${esc(f.remark||'—')}</td>
                <td>${esc(f.uploaderName||'—')}</td>
                <td style="font-family:var(--font-m)">${formatDateDMY(f.createdAt?f.createdAt.slice(0,10):null)}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');

    const pagHtml = buildPagination(filtered.length, fileCurrentPage, filePageSize,
        'goFilePage', 'changeFilePageSize',
        { label: 'files', sizes: [10, 25, 50] });
        
    document.getElementById('files-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th style="width:50px">No</th><th>Title</th><th>File Name</th><th style="width:80px">Type</th><th style="width:90px;text-align:right">Size</th><th>Drive Folder</th><th>Remark</th><th>Uploaded By</th><th>Date</th><th style="width:150px">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>${pagHtml}`;
};

const goFilePage = p => { const tp=Math.ceil(fileFilteredData.length/filePageSize)||1; fileCurrentPage=Math.max(1,Math.min(p,tp)); renderFileTable(); };
const changeFilePageSize = s => { filePageSize=parseInt(s); fileCurrentPage=1; renderFileTable(); };

// ---------- Admin Multiple Upload ----------
const showUploadFile = () => {
    const drives = DB.driveSettings || [];
    const config = DB.appConfig || {};
    if (!drives.length) {
        showModal(`<h3>No Drive Configured</h3>
            <p style="color:var(--main-text2);line-height:1.6">Please set up a Google Drive folder first.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button>
            ${currentUser.role==='admin'?'<button class="btn btn-accent" onclick="hideModal();showDriveSettings()">Go to Settings</button>':''}</div>`);
        return;
    }
    if (!config.drive_script_url) {
        showModal(`<h3>Drive Not Configured</h3>
            <p style="color:var(--main-text2)">Google Drive script URL not set. Configure in Drive Settings.</p>
            <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button>
            ${currentUser.role==='admin'?'<button class="btn btn-accent" onclick="hideModal();showDriveSettings()">Go to Settings</button>':''}</div>`);
        return;
    }
    const defaultDrive = drives.find(d => d.isDefault) || drives[0];
    const driveOpts = drives.map(d => `<option value="${d.id}" ${d.id===defaultDrive.id?'selected':''}>${esc(d.name)}</option>`).join('');

    _selectedFiles = [];

    showModal(`
        <div style="max-height:85vh;display:flex;flex-direction:column">
            <div style="flex-shrink:0">
                <h3>Upload File</h3>
                <div class="field">
                    <label>Title <span style="font-size:.72rem;color:var(--main-text3)">(Display name, optional, applied to all)</span></label>
                    <input class="input" id="upload-title" placeholder="e.g. Project Report">
                </div>
                <div class="field">
                    <label>Select File <span style="font-size:.72rem;color:var(--main-text3)">(Max 20MB each · Multiple allowed)</span></label>
                    <div id="upload-drop-zone" style="border:2px dashed var(--main-border);border-radius:var(--radius);padding:30px;text-align:center;cursor:pointer;transition:border-color .2s">
                        <div id="upload-file-info" style="color:var(--main-text3)">Click or drag files here</div>
                        <input type="file" id="upload-file-input" style="display:none" multiple onchange="handleFilesSelect(this)">
                    </div>
                </div>
            </div>
            <div style="flex:1;min-height:0;overflow-y:auto">
                <div id="upload-file-list" style="margin-top:8px;margin-bottom:12px"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="field"><label>Save to Drive Folder</label><select class="input" id="upload-drive">${driveOpts}</select></div>
                    <div class="field"><label>Remark <span style="font-size:.72rem;color:var(--main-text3)">(Applied to all)</span></label><input class="input" id="upload-remark" placeholder="Optional remark"></div>
                </div>
                <div id="upload-progress" style="display:none;margin-top:12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                        <span id="upload-file-counter" style="font-size:.82rem;color:var(--main-text3)"></span>
                    </div>
                    <div style="background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                        <div id="upload-progress-bar" style="height:100%;background:var(--accent);width:0%;transition:width .3s ease;border-radius:4px"></div>
                    </div>
                    <div id="upload-progress-text" style="font-size:.78rem;color:var(--main-text3);margin-top:4px;text-align:center">Uploading...</div>
                </div>
                <p class="auth-error" id="upload-error"></p>
            </div>
            <div style="flex-shrink:0;margin-top:12px" class="btns"><button class="btn btn-ghost" onclick="_selectedFiles=[];hideModal()">Cancel</button><button class="btn btn-accent" id="upload-btn" onclick="doUploadFiles()">Upload</button></div>
        </div>`);

    setTimeout(() => {
        const dz = document.getElementById('upload-drop-zone');
        const fi = document.getElementById('upload-file-input');
        dz.onclick = () => fi.click();
        dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
        dz.ondragleave = () => { dz.style.borderColor = 'var(--main-border)'; };
        dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = 'var(--main-border)'; if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;handleFilesSelect(fi);} };
    }, 100);
};

const handleFilesSelect = input => {
    const files = Array.from(input.files);
    const errEl = document.getElementById('upload-error');
    errEl.textContent = '';

    for (const f of files) {
        if (f.size > 20 * 1024 * 1024) {
            errEl.textContent = `${f.name} too large (max 20MB)`;
            continue;
        }
        if (!isFileSafe(f)) {
            errEl.textContent = `${f.name}: type not allowed`;
            continue;
        }
        const duplicate = _selectedFiles.some(e => e.name === f.name && e.size === f.size);
        if (!duplicate) {
            _selectedFiles.push(f);
        }
    }

    input.value = '';
    renderSelectedFileList();
};


const renderSelectedFileList = () => {
    const el = document.getElementById('upload-file-list');
    if (!el) return;
    if (_selectedFiles.length === 0) {
        el.innerHTML = '';
        document.getElementById('upload-file-info').innerHTML = '<span style="color:var(--main-text3)">Click or drag files here</span>';
        return;
    }
    document.getElementById('upload-file-info').innerHTML =
        `<span style="color:var(--accent);font-weight:600">${_selectedFiles.length} file${_selectedFiles.length>1?'s':''} selected</span>
         <span style="font-size:.78rem;color:var(--main-text3);margin-left:6px">— click or drag to add more</span>`;
    el.innerHTML = _selectedFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);margin-bottom:4px">
        ${getFileTypeIcon(f.name)}
        <div style="flex:1;min-width:0">
            <div style="font-size:.84rem;font-weight:500;color:var(--main-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
            <div style="font-size:.75rem;color:var(--main-text3)">${formatFileSize(f.size)}</div>
        </div>
        <button onclick="_selectedFiles.splice(${i},1);renderSelectedFileList()" style="background:none;border:none;cursor:pointer;color:var(--main-text3);font-size:.9rem;padding:2px 6px" title="Remove">&#10005;</button>
    </div>`).join('');
};

const doUploadFiles = async () => {
    const errEl = document.getElementById('upload-error');
    if (_selectedFiles.length === 0) { errEl.textContent = 'Select at least one file'; return; }

    const driveId = parseInt(document.getElementById('upload-drive').value);
    const drive = (DB.driveSettings||[]).find(d => d.id === driveId);
    if (!drive) { errEl.textContent = 'Select a drive folder'; return; }

    const title = (document.getElementById('upload-title')?.value || '').trim();
    const remark = document.getElementById('upload-remark').value.trim();
    const btn = document.getElementById('upload-btn');
    const progress = document.getElementById('upload-progress');
    const bar = document.getElementById('upload-progress-bar');
    const txt = document.getElementById('upload-progress-text');
    const counter = document.getElementById('upload-file-counter');

    btn.disabled = true; btn.textContent = 'Uploading...';
    progress.style.display = 'block'; errEl.textContent = '';

    const total = _selectedFiles.length;
    let completed = 0;
    const failedFiles = [];
    const successFiles = [];

    for (let i = 0; i < total; i++) {
        const file = _selectedFiles[i];
        counter.textContent = `File ${i+1} of ${total}`;
        bar.style.width = Math.round((i/total)*100) + '%';
        txt.textContent = `Uploading: ${file.name}`;

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const safeNameResult = safeFileName(file.name);
            const result = await api('/upload-to-drive', {
                method: 'POST',
                body: { fileBase64: base64, fileName: safeNameResult, mimeType: file.type || 'application/octet-stream', folderId: drive.folderId }
            });
            if (result.error) throw new Error(result.error);

            await api('/files', {
                method: 'POST',
                body: { title, name: safeNameResult, type: file.type || 'application/octet-stream', size: file.size, url: result.fileUrl, driveFileId: result.fileId, driveSettingId: driveId, remark }
            });
            completed++;
            successFiles.push(file.name);
        } catch (e) {
            failedFiles.push({ name: file.name, reason: e.message });
        }
    }

    bar.style.width = '100%';

    if (failedFiles.length === 0) {
        txt.innerHTML = '<div style="font-weight:600;margin-bottom:4px">All uploaded successfully!</div>' +
            successFiles.map(n => `<div style="font-size:.82rem;padding:2px 0;color:#16a34a">✓ ${esc(n)}</div>`).join('');
        _selectedFiles = [];
        await loadDB();
        setTimeout(() => { hideModal(); applyFileFilter(); }, 1500);
    } else if (completed === 0) {
        txt.innerHTML = '';
        errEl.innerHTML = `<div style="margin-bottom:6px;font-weight:600">All ${total} file${total>1?'s':''} failed:</div>` +
            failedFiles.map(f => `<div style="font-size:.82rem;padding:2px 0">✕ <strong>${esc(f.name)}</strong>: ${esc(f.reason)}</div>`).join('');
        btn.disabled = false; btn.textContent = 'Retry';
        btn.onclick = () => { errEl.textContent = ''; doUploadFiles(); };
    } else {
        let resultHtml = '';
        if (successFiles.length > 0) {
            resultHtml += `<div style="font-weight:600;margin-bottom:4px;color:#16a34a">✓ ${successFiles.length} uploaded:</div>` +
                successFiles.map(n => `<div style="font-size:.82rem;padding:2px 0;color:#16a34a">✓ ${esc(n)}</div>`).join('');
        }
        if (failedFiles.length > 0) {
            resultHtml += `<div style="font-weight:600;margin-top:8px;margin-bottom:4px;color:var(--danger)">✕ ${failedFiles.length} failed:</div>` +
                failedFiles.map(f => `<div style="font-size:.82rem;padding:2px 0">✕ <strong>${esc(f.name)}</strong>: ${esc(f.reason)}</div>`).join('');
        }
        errEl.innerHTML = resultHtml;
        txt.textContent = `${completed} uploaded, ${failedFiles.length} failed`;
        _selectedFiles = _selectedFiles.filter(f => failedFiles.some(ff => ff.name === f.name));
        btn.disabled = false; btn.textContent = 'Retry Failed';
        btn.onclick = () => { errEl.textContent = ''; doUploadFiles(); };
        await loadDB();
        setTimeout(() => applyFileFilter(), 500);
    }
};

// ---------- Admin Edit File ----------
const showEditFileModal = id => {
    const f = (DB.files||[]).find(x => x.id === id);
    if (!f) return;

    const drives = DB.driveSettings || [];
    const driveOpts = drives.map(d => `<option value="${d.id}" ${d.id === f.driveSettingId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');

    _editFileReplaceSelected = null;

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Edit File</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                <div class="field"><label>Title</label><input class="input" id="edit-file-title" value="${esc(f.title || '')}" placeholder="Display name"></div>
                <div class="field"><label>Remark</label><input class="input" id="edit-file-remark" value="${esc(f.remark || '')}" placeholder="Optional remark"></div>
            </div>
            <div class="field" style="margin-bottom:12px">
                <label>Drive Folder</label>
                <select class="input" id="edit-file-drive">${driveOpts}</select>
            </div>
            <div style="background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px">
                <div style="font-size:.82rem;color:var(--main-text3);margin-bottom:2px">Current File</div>
                <div style="display:flex;align-items:center;gap:8px">
                    ${getFileTypeIcon(f.name)} <strong style="color:var(--main-text)">${esc(f.name)}</strong>
                    <span style="font-size:.82rem;color:var(--main-text3)">${formatFileSize(f.size)}</span>
                </div>
            </div>
            <div class="field">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="edit-file-replace-toggle" onchange="document.getElementById('edit-file-replace-zone').style.display=this.checked?'block':'none'"> Replace file
                </label>
            </div>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div id="edit-file-replace-zone" style="display:none;margin-top:8px;margin-bottom:16px">
                <div id="edit-file-drop-zone" style="border:2px dashed var(--main-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:border-color .2s">
                    <div id="edit-file-info" style="color:var(--main-text3)">Click or drag new file here</div>
                    <input type="file" id="edit-file-input" style="display:none" onchange="handleEditFileSelect(this)">
                </div>
            </div>
            <div id="edit-file-progress" style="display:none;margin-bottom:12px">
                <div style="background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                    <div id="edit-file-bar" style="height:100%;background:var(--accent);width:0%;transition:width .3s;border-radius:4px"></div>
                </div>
                <div id="edit-file-txt" style="font-size:.78rem;color:var(--main-text3);margin-top:4px;text-align:center">Saving...</div>
            </div>
            <p class="auth-error" id="edit-file-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns">
            <button class="btn btn-ghost" onclick="_editFileReplaceSelected=null;hideModal()">Cancel</button>
            <button class="btn btn-accent" id="edit-file-btn" onclick="doEditFile(${id})">Save</button>
        </div>
    </div>`);

    setTimeout(() => {
        const dz = document.getElementById('edit-file-drop-zone');
        const fi = document.getElementById('edit-file-input');
        if (dz && fi) {
            dz.onclick = () => fi.click();
            dz.ondragover = e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
            dz.ondragleave = () => { dz.style.borderColor = 'var(--main-border)'; };
            dz.ondrop = e => { e.preventDefault(); dz.style.borderColor = 'var(--main-border)'; if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;handleEditFileSelect(fi);} };
        }
    }, 100);
};

const handleEditFileSelect = input => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        document.getElementById('edit-file-error').textContent = 'File too large. Max 20MB.';
        input.value = '';
        _editFileReplaceSelected = null;
        document.getElementById('edit-file-info').innerHTML = '<span style="color:var(--main-text3)">Click or drag new file here</span>';
        return;
    }
    document.getElementById('edit-file-error').textContent = '';
    _editFileReplaceSelected = file;
    document.getElementById('edit-file-info').innerHTML =
        `<div style="font-size:1rem;font-weight:600;color:var(--main-text)">${getFileTypeIcon(file.name)} ${esc(file.name)}</div>
         <div style="font-size:.82rem;color:var(--main-text3);margin-top:4px">${formatFileSize(file.size)} · ${file.type||'Unknown'}</div>`;
};

const doEditFile = async id => {
    const title = document.getElementById('edit-file-title').value.trim();
    const remark = document.getElementById('edit-file-remark').value.trim();
    const isReplacing = document.getElementById('edit-file-replace-toggle').checked;
    const errEl = document.getElementById('edit-file-error');
    const btn = document.getElementById('edit-file-btn');

    if (isReplacing && _editFileReplaceSelected) {
        if (!isFileSafe(_editFileReplaceSelected)) { errEl.textContent = 'File type not allowed.'; return; }

        const driveId = parseInt(document.getElementById('edit-file-drive').value);
        const drive = (DB.driveSettings||[]).find(d => d.id === driveId);
        if (!drive) { errEl.textContent = 'Select a drive folder'; return; }

        btn.disabled = true; btn.textContent = 'Saving...';
        const progress = document.getElementById('edit-file-progress');
        const bar = document.getElementById('edit-file-bar');
        const txt = document.getElementById('edit-file-txt');
        progress.style.display = 'block'; bar.style.width = '30%'; txt.textContent = 'Reading file...';
        errEl.textContent = '';

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(_editFileReplaceSelected);
            });
            bar.style.width = '50%'; txt.textContent = 'Uploading to Drive...';
            const safeName = safeFileName(_editFileReplaceSelected.name);
            const result = await api('/upload-to-drive', {
                method: 'POST',
                body: { fileBase64: base64, fileName: safeName, mimeType: _editFileReplaceSelected.type || 'application/octet-stream', folderId: drive.folderId }
            });
            if (result.error) throw new Error(result.error);
            bar.style.width = '80%'; txt.textContent = 'Saving record...';
            await api('/files/' + id, {
                method: 'PUT',
                body: {
                    title, remark, replaceFile: true,
                    newName: safeName, newType: _editFileReplaceSelected.type,
                    newSize: _editFileReplaceSelected.size, newUrl: result.fileUrl,
                    newDriveFileId: result.fileId, newDriveSettingId: driveId
                }
            });
            bar.style.width = '100%'; txt.textContent = 'Done!';
            _editFileReplaceSelected = null;
            await loadDB();
            setTimeout(() => { hideModal(); applyFileFilter(); }, 600);
        } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            btn.disabled = false; btn.textContent = 'Save';
            progress.style.display = 'none';
        }
    } else {
        btn.disabled = true; btn.textContent = 'Saving...';
        try {
            const driveId = parseInt(document.getElementById('edit-file-drive')?.value) || null;
            const safeTitle = (title || '').replace(/<[^>]*>/g, '').substring(0, 300);
            const safeRemark = (remark || '').replace(/<[^>]*>/g, '').substring(0, 500);
            await api('/files/' + id, { method: 'PUT', body: { title: safeTitle, remark: safeRemark, replaceFile: false, newDriveSettingId: driveId } });
            await loadDB();
            hideModal();
            applyFileFilter();
        } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            btn.disabled = false; btn.textContent = 'Save';
        }
    }
};

// ---------- Preview ----------
const previewFile = id => {
    const file = (DB.files||[]).find(f => f.id === id);
    if (!file || !file.driveFileId) return;
    const driveNameMap = {};
    (DB.driveSettings||[]).forEach(d => { driveNameMap[d.id] = d.name; });
    const previewUrl = `https://drive.google.com/file/d/${file.driveFileId}/preview`;
    const displayLabel = file.title ? esc(file.title) : esc(file.name);
    showModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">${getFileTypeIcon(file.name)} ${displayLabel}</h3>
        <button class="btn btn-ghost btn-sm" onclick="window.open('${esc(file.url)}','_blank')">&#8599; Open in Drive</button>
    </div>
    ${file.title ? `<div style="font-size:.82rem;color:var(--main-text3);margin-bottom:8px">File: ${esc(file.name)}</div>` : ''}
    <iframe src="${previewUrl}" style="width:100%;height:65vh;border:none;border-radius:var(--radius)"></iframe>
    <div style="margin-top:8px;display:flex;gap:16px;font-size:.78rem;color:var(--main-text3)">
        <span>Size: ${formatFileSize(file.size)}</span>
        <span>Drive Folder: ${esc(driveNameMap[file.driveSettingId] || '—')}</span>
        <span>Remark: ${esc(file.remark || '—')}</span>
        <span>By: ${esc(file.uploaderName||'—')}</span>
        <span>Date: ${formatDateDMY(file.createdAt?file.createdAt.slice(0,10):null)}</span>
    </div>`);
};

// ---------- Delete ----------
const confirmDeleteFile = id => {
    const file = (DB.files||[]).find(f => f.id === id);
    if (!file) return;
    showModal(`<h3>Delete File</h3>
        <p style="color:var(--main-text2);line-height:1.6">Delete <strong>${esc(file.name)}</strong>?<br>
        <span style="font-size:.82rem;color:var(--main-text3)">File will also be deleted from Google Drive.</span></p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDeleteFile(${id})">Delete</button></div>`);
};

const doDeleteFile = async id => {
    await api('/files/'+id, {method:'DELETE'});
    hideModal(); await loadDB(); applyFileFilter();
};

// ---------- Drive Settings ----------
let _drivePage = 1, _drivePageSize = 5;
let _pendingDriveConfig = null;

const capturePendingDriveConfig = () => {
    const urlEl = document.getElementById('cfg-script-url');
    const tokenEl = document.getElementById('cfg-token');
    if (urlEl || tokenEl) {
        _pendingDriveConfig = {
            scriptUrl: urlEl?.value || '',
            token: tokenEl?.value || ''
        };
    }
};

const showDriveSettings = () => {
    const drives = DB.driveSettings || [];
    const config = DB.appConfig || {};

    const scriptUrl = _pendingDriveConfig ? _pendingDriveConfig.scriptUrl : (config.drive_script_url || '');
    const token = _pendingDriveConfig ? _pendingDriveConfig.token : (config.drive_token || '');
    _pendingDriveConfig = null;

    const driveOpts = (DB.driveSettings||[]).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Drive Settings</h3>
            <div class="field" style="margin-bottom:12px">
                <label>Apps Script URL</label>
                <input class="input" id="cfg-script-url" value="${esc(scriptUrl)}" placeholder="https://script.google.com/macros/s/.../exec">
            </div>
            <div class="field" style="margin-bottom:8px">
                <label>Secret Token</label>
                <input class="input" id="cfg-token" value="${esc(token)}" placeholder="Your secret token">
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
                <button class="btn btn-accent btn-sm" onclick="saveDriveConfig()">Save Config</button>
                <span id="cfg-save-status" style="font-size:.8rem;color:var(--main-text3)"></span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h4 style="margin:0">Drive Folders</h4>
                <button class="btn btn-green btn-sm" onclick="showAddDriveSetting()">+ Add Folder</button>
            </div>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div id="drive-table-area"></div>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>
    </div>`);

    renderDriveTable();
};

const renderDriveTable = () => {
    const drives = DB.driveSettings || [];
    const totalPages = Math.ceil(drives.length / _drivePageSize) || 1;
    if (_drivePage > totalPages) _drivePage = totalPages;
    if (_drivePage < 1) _drivePage = 1;
    const start = (_drivePage - 1) * _drivePageSize;
    const page = drives.slice(start, start + _drivePageSize);

    let rows = '';
    if (drives.length === 0) {
        rows = '<tr><td colspan="4" style="text-align:center;color:var(--main-text3);padding:20px">No drives configured</td></tr>';
    } else {
        rows = page.map(d => `<tr>
            <td style="font-weight:500">${esc(d.name)}</td>
            <td style="font-family:var(--font-m);font-size:.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.folderId)}">${esc(d.folderId)}</td>
            <td>${d.isDefault ? '<span style="color:var(--green);font-weight:600">Default</span>' : ''}</td>
            <td><div class="actions-cell">
                <button class="btn-icon" onclick="showEditDriveSetting(${d.id})">&#9998;</button>
                <button class="btn-icon danger" onclick="confirmDeleteDriveSetting(${d.id})">&#10005;</button>
            </div></td>
        </tr>`).join('');
    }

    const pagHtml = drives.length > 0
        ? buildPagination(drives.length, _drivePage, _drivePageSize,
            'goDrivePage', 'changeDrivePageSize',
            { label: 'drives', sizes: [3, 5, 10, 25] })
        : '';

    document.getElementById('drive-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Folder ID</th><th style="width:80px">Default</th><th style="width:80px">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${pagHtml}`;
};

const goDrivePage = page => {
    const totalPages = Math.ceil((DB.driveSettings||[]).length / _drivePageSize) || 1;
    _drivePage = Math.max(1, Math.min(page, totalPages));
    renderDriveTable();
};

const changeDrivePageSize = size => {
    _drivePageSize = parseInt(size);
    _drivePage = 1;
    renderDriveTable();
};

const saveDriveConfig = async () => {
    const statusEl = document.getElementById('cfg-save-status');
    try {
        await api('/app-config', { method: 'PUT', body: {
            drive_script_url: document.getElementById('cfg-script-url').value.trim(),
            drive_token: document.getElementById('cfg-token').value.trim()
        }});
        await loadDB();
        _pendingDriveConfig = null;
        if (statusEl) {
            statusEl.textContent = 'Saved!';
            statusEl.style.color = 'var(--green)';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = 'Failed: ' + e.message;
            statusEl.style.color = 'var(--danger)';
        }
    }
};

const showAddDriveSetting = () => {
    capturePendingDriveConfig();
    hideModal();
    setTimeout(() => showModal(`
        <h3>Add Drive Folder</h3>
        <div class="field"><label>Name</label><input class="input" id="drive-name" placeholder="e.g. Main Drive"></div>
        <div class="field"><label>Google Drive Folder ID</label><input class="input" id="drive-folder-id" placeholder="Paste folder ID here"></div>
        <div class="field"><label><input type="checkbox" id="drive-default"> Set as default</label></div>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal();setTimeout(showDriveSettings,200)">Cancel</button><button class="btn btn-accent" onclick="doAddDriveSetting()">Add</button></div>`), 200);
};

const doAddDriveSetting = async () => {
    const name = document.getElementById('drive-name').value.trim();
    const folderId = document.getElementById('drive-folder-id').value.trim();
    const isDefault = document.getElementById('drive-default').checked;
    if (!name || !folderId) return;
    await api('/drive-settings', { method: 'POST', body: { name, folderId, isDefault } });
    await loadDB();
    hideModal();
    setTimeout(() => showDriveSettings(), 200);
};

const showEditDriveSetting = id => {
    const d = (DB.driveSettings||[]).find(x => x.id === id);
    if (!d) return;
    capturePendingDriveConfig();
    hideModal();
    setTimeout(() => showModal(`
        <h3>Edit Drive Folder</h3>
        <div class="field"><label>Name</label><input class="input" id="drive-name" value="${esc(d.name)}"></div>
        <div class="field"><label>Google Drive Folder ID</label><input class="input" id="drive-folder-id" value="${esc(d.folderId)}"></div>
        <div class="field"><label><input type="checkbox" id="drive-default" ${d.isDefault?'checked':''}> Set as default</label></div>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal();setTimeout(showDriveSettings,200)">Cancel</button><button class="btn btn-accent" onclick="doEditDriveSetting(${id})">Save</button></div>`), 200);
};

const doEditDriveSetting = async id => {
    const name = document.getElementById('drive-name').value.trim();
    const folderId = document.getElementById('drive-folder-id').value.trim();
    const isDefault = document.getElementById('drive-default').checked;
    if (!name || !folderId) return;
    await api('/drive-settings/' + id, { method: 'PUT', body: { name, folderId, isDefault } });
    await loadDB();
    hideModal();
    setTimeout(() => showDriveSettings(), 200);
};

const confirmDeleteDriveSetting = id => {
    const d = (DB.driveSettings||[]).find(x => x.id === id);
    if (!d) return;
    capturePendingDriveConfig();
    hideModal();
    setTimeout(() => showModal(`<h3>Delete Drive Folder</h3>
        <p style="color:var(--main-text2)">Delete <strong>${esc(d.name)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal();setTimeout(showDriveSettings,200)">Cancel</button><button class="btn btn-danger" onclick="doDeleteDriveSetting(${id})">Delete</button></div>`), 200);
};

const doDeleteDriveSetting = async id => {
    await api('/drive-settings/' + id, { method: 'DELETE' });
    await loadDB();
    hideModal();
    setTimeout(() => showDriveSettings(), 200);
};
// ==========================================================
//   FILE NOTICES MANAGEMENT (Admin)
// ==========================================================

const showFileNotices = () => {
    const notices = DB.fileNotices || [];
    const activeCount = notices.filter(n => n.isActive).length;

    showModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
            <h3 style="margin:0">File Notices</h3>
            <div style="font-size:.82rem;color:var(--main-text3);margin-top:4px">${notices.length} total · ${activeCount} active</div>
        </div>
        <button class="btn btn-green btn-sm" onclick="showAddFileNotice()">+ Add Notice</button>
    </div>
    <div id="file-notices-table-area"></div>
    <div class="btns" style="margin-top:16px"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>`);

    renderFileNoticesList();
};

const renderFileNoticesList = () => {
    const allNotices = DB.fileNotices || [];

    if (allNotices.length === 0) {
        document.getElementById('file-notices-table-area').innerHTML =
            '<div style="text-align:center;color:var(--main-text3);padding:40px 0">No notices yet.<br><span style="font-size:.82rem">Click "+ Add Notice" to create one.</span></div>';
        return;
    }

    const totalPages = Math.ceil(allNotices.length / _noticePageSize) || 1;
    if (_noticePage > totalPages) _noticePage = totalPages;
    if (_noticePage < 1) _noticePage = 1;
    const start = (_noticePage - 1) * _noticePageSize;
    const notices = allNotices.slice(start, start + _noticePageSize);

    const rows = notices.map(n => {
        const targetLabel = n.targetType === 'all'
            ? '<span style="color:var(--accent);font-weight:500">All Employees</span>'
            : `<span style="color:var(--main-text)">${esc(n.targetMemberName)}</span>`;
        const statusBadge = n.isActive
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600;color:#16a34a;background:rgba(22,163,74,.1)">Active</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600;color:var(--main-text3);background:var(--main-border)">Inactive</span>';

        return `<tr>
            <td style="font-family:var(--font-m);color:var(--main-text3)">${n.id}</td>
            <td><strong>${esc(n.title)}</strong>${n.message ? `<div style="font-size:.82rem;color:var(--main-text3);margin-top:2px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.message)}</div>` : ''}</td>
            <td>${targetLabel}</td>
            <td>${statusBadge}</td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Edit" onclick="showEditFileNotice(${n.id})">&#9998;</button>
                <button class="btn-icon danger" title="Delete" onclick="confirmDeleteFileNotice(${n.id})">&#10005;</button>
            </div></td>
        </tr>`;
    }).join('');

    const pagHtml = buildPagination(allNotices.length, _noticePage, _noticePageSize,
        'goNoticePage', 'changeNoticePageSize',
        { label: 'notices', sizes: [5, 10, 25, 50] });

    document.getElementById('file-notices-table-area').innerHTML = `
        <div class="table-wrap"><table>
            <thead><tr><th style="width:50px">ID</th><th>Notice</th><th style="width:140px">Target</th><th style="width:80px">Status</th><th style="width:80px">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${pagHtml}`;
};

const showAddFileNotice = () => {
    const members = (DB.members || []).filter(m => m.role === 'employee');
    const memberOpts = members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

    hideModal();
    setTimeout(() => showModal(`
    <h3>Add File Notice</h3>
    <div class="field">
        <label>Title <span style="color:var(--danger)">*</span></label>
        <input class="input" id="notice-title" placeholder="e.g. Submit Monthly Report">
    </div>
    <div class="field">
        <label>Message</label>
        <textarea class="input" id="notice-message" rows="3" placeholder="e.g. Please submit the June 2025 expense report by end of this week."></textarea>
    </div>
    <div class="field">
        <label>Send To</label>
        <div style="display:flex;gap:16px;margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="notice-target" value="all" checked onchange="document.getElementById('notice-member-select').style.display='none'">
                <span>All Employees</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="notice-target" value="specific" onchange="document.getElementById('notice-member-select').style.display='block'">
                <span>Specific Employee</span>
            </label>
        </div>
        <div id="notice-member-select" style="display:none">
            <select class="input" id="notice-member-id">
                <option value="">-- Select Employee --</option>
                ${memberOpts}
            </select>
        </div>
    </div>
    <div class="field">
        <label><input type="checkbox" id="notice-active" checked> Active (visible to employees)</label>
    </div>
    <p class="auth-error" id="notice-error"></p>
    <div class="btns">
        <button class="btn btn-ghost" onclick="hideModal();setTimeout(showFileNotices,200)">Cancel</button>
        <button class="btn btn-accent" onclick="doAddFileNotice()">Add</button>
    </div>`), 200);
};

const doAddFileNotice = async () => {
    const title = document.getElementById('notice-title').value.trim();
    const message = document.getElementById('notice-message').value.trim();
    const targetType = document.querySelector('input[name="notice-target"]:checked').value;
    const targetMemberId = targetType === 'specific' ? parseInt(document.getElementById('notice-member-id').value) : null;
    const isActive = document.getElementById('notice-active').checked;
    const errEl = document.getElementById('notice-error');

    if (!title) { errEl.textContent = 'Title is required'; return; }
    if (targetType === 'specific' && !targetMemberId) { errEl.textContent = 'Select an employee'; return; }

    errEl.textContent = '';
    await api('/file-notices', {
        method: 'POST',
        body: { title, message, targetType, targetMemberId, isActive }
    });
    await loadDB();
    hideModal();
    setTimeout(() => showFileNotices(), 200);
};

const showEditFileNotice = id => {
    const n = (DB.fileNotices || []).find(x => x.id === id);
    if (!n) return;
    const members = (DB.members || []).filter(m => m.role === 'employee');
    const memberOpts = members.map(m => `<option value="${m.id}" ${m.id === n.targetMemberId ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

    hideModal();
    setTimeout(() => showModal(`
    <h3>Edit File Notice</h3>
    <div class="field">
        <label>Title <span style="color:var(--danger)">*</span></label>
        <input class="input" id="notice-title" value="${esc(n.title)}">
    </div>
    <div class="field">
        <label>Message</label>
        <textarea class="input" id="notice-message" rows="3">${esc(n.message)}</textarea>
    </div>
    <div class="field">
        <label>Send To</label>
        <div style="display:flex;gap:16px;margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="notice-target" value="all" ${n.targetType === 'all' ? 'checked' : ''} onchange="document.getElementById('notice-member-select').style.display='none'">
                <span>All Employees</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="notice-target" value="specific" ${n.targetType === 'specific' ? 'checked' : ''} onchange="document.getElementById('notice-member-select').style.display='block'">
                <span>Specific Employee</span>
            </label>
        </div>
        <div id="notice-member-select" style="display:${n.targetType === 'specific' ? 'block' : 'none'}">
            <select class="input" id="notice-member-id">
                <option value="">-- Select Employee --</option>
                ${memberOpts}
            </select>
        </div>
    </div>
    <div class="field">
        <label><input type="checkbox" id="notice-active" ${n.isActive ? 'checked' : ''}> Active (visible to employees)</label>
    </div>
    <p class="auth-error" id="notice-error"></p>
    <div class="btns">
        <button class="btn btn-ghost" onclick="hideModal();setTimeout(showFileNotices,200)">Cancel</button>
        <button class="btn btn-accent" onclick="doEditFileNotice(${id})">Save</button>
    </div>`), 200);
};

const doEditFileNotice = async id => {
    const title = document.getElementById('notice-title').value.trim();
    const message = document.getElementById('notice-message').value.trim();
    const targetType = document.querySelector('input[name="notice-target"]:checked').value;
    const targetMemberId = targetType === 'specific' ? parseInt(document.getElementById('notice-member-id').value) : null;
    const isActive = document.getElementById('notice-active').checked;
    const errEl = document.getElementById('notice-error');

    if (!title) { errEl.textContent = 'Title is required'; return; }
    if (targetType === 'specific' && !targetMemberId) { errEl.textContent = 'Select an employee'; return; }

    errEl.textContent = '';
    await api('/file-notices/' + id, {
        method: 'PUT',
        body: { title, message, targetType, targetMemberId, isActive }
    });
    await loadDB();
    hideModal();
    setTimeout(() => showFileNotices(), 200);
};

const confirmDeleteFileNotice = id => {
    const n = (DB.fileNotices || []).find(x => x.id === id);
    if (!n) return;
    hideModal();
    setTimeout(() => showModal(`
    <h3>Delete Notice</h3>
    <p style="color:var(--main-text2);line-height:1.6">Delete notice <strong>"${esc(n.title)}"</strong>?</p>
    <div class="btns">
        <button class="btn btn-ghost" onclick="hideModal();setTimeout(showFileNotices,200)">Cancel</button>
        <button class="btn btn-danger" onclick="doDeleteFileNotice(${id})">Delete</button>
    </div>`), 200);
};

const doDeleteFileNotice = async id => {
    await api('/file-notices/' + id, { method: 'DELETE' });
    await loadDB();
    hideModal();
    setTimeout(() => showFileNotices(), 200);
};

// ==========================================================
//   FILE TASKS MODAL (Admin)
// ==========================================================

let _editingFileTaskId = null;
let _fileTasksPage = 1, _fileTasksPageSize = 5, _fileTasksSearch = '';

const INTERVAL_OPTS = [
    { value: 1, label: 'Every 1 min' },
    { value: 60, label: 'Every 1 hour' },
    { value: 360, label: 'Every 6 hours' },
    { value: 720, label: 'Every 12 hours' },
    { value: 1440, label: 'Every 24 hours' }
];

const showFileTasksModal = async () => {
    _editingFileTaskId = null;
    DB.fileTasks = await api('/file-tasks');
    renderFileTasksContent();
};

const renderFileTasksContent = () => {
    _fileTasksPage = 1;
    _fileTasksSearch = '';

    const tasks = DB.fileTasks || [];
    const activeCount = tasks.filter(t => t.isActive).length;

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div>
                <h3 style="margin:0">📋 File Request (Tasks)</h3>
                <div id="file-tasks-count" style="font-size:.82rem;color:var(--main-text3);margin-top:4px">${tasks.length} total · ${activeCount} active</div>
            </div>
            <button class="btn btn-green btn-sm" onclick="showAddFileTask()">+ Add Request</button>
        </div>
        <div style="flex-shrink:0;margin-bottom:12px">
            <input class="input" id="file-tasks-search" type="text" placeholder="Search tasks..." oninput="_fileTasksSearch=this.value;_fileTasksPage=1;renderFileTasksList()" style="max-width:300px">
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto" id="file-tasks-list-area"></div>
        <div style="flex-shrink:0;margin-top:8px" id="file-tasks-pag-area"></div>
        <div style="flex-shrink:0;margin-top:12px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Close</button></div>
    </div>`);

    renderFileTasksList();
};

const renderFileTasksList = () => {
    const tasks = DB.fileTasks || [];
    const now = new Date();
    const activeCount = tasks.filter(t => t.isActive).length;

    // Search filter
    const search = _fileTasksSearch.toLowerCase();
    const filtered = search ? tasks.filter(t => {
        const deadlineStr = t.deadline ? formatDateDMY(t.deadline.replace('Z','').slice(0,10)) + ' ' + t.deadline.replace('Z','').slice(11,16) : '';
        const intervalLabel = (INTERVAL_OPTS.find(o => o.value === t.checkIntervalMinutes)?.label || t.checkIntervalMinutes + ' min');
        const statusText = (t.submittedCount >= t.targetCount && t.targetCount > 0) ? 'completed'
            : (new Date(t.deadline.replace('Z','')) < now) ? 'overdue'
            : (t.submittedCount > 0) ? 'in progress'
            : 'active';
        const targetText = t.targetType === 'all' ? 'all employees' : (t.targetMemberIds || []).length + ' employees';
        const notifyText = t.notifyType === 'both' ? 'in-app + email' : t.notifyType === 'email' ? 'email only' : 'in-app only';
        const progressText = (t.submittedCount || 0) + '/' + (t.targetCount || 0) + ' submitted';
        const haystack = [t.title, t.description, deadlineStr, intervalLabel, statusText, targetText, notifyText, progressText]
            .map(v => (v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    }) : tasks;

    // Pagination
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / _fileTasksPageSize) || 1;
    if (_fileTasksPage > totalPages) _fileTasksPage = totalPages;
    if (_fileTasksPage < 1) _fileTasksPage = 1;
    const startIdx = (_fileTasksPage - 1) * _fileTasksPageSize;
    const pageTasks = filtered.slice(startIdx, startIdx + _fileTasksPageSize);

    // Update count
    const countEl = document.getElementById('file-tasks-count');
    if (countEl) countEl.textContent = tasks.length + ' total · ' + activeCount + ' active' + (search ? ' · ' + totalFiltered + ' matched' : '');

    let tasksHtml = '';
    if (filtered.length === 0) {
        tasksHtml = '<div style="text-align:center;color:var(--main-text3);padding:40px 0;font-size:.88rem">'
            + (search ? 'No tasks match your search.' : 'No file tasks yet.<br><span style="font-size:.82rem">Click "+ Add Task" to create one.</span>')
            + '</div>';
    } else {
        tasksHtml = pageTasks.map(t => {
            const deadline = new Date(t.deadline);
            const isOverdue = deadline < now && t.isActive;
            const progressPct = t.targetCount > 0 ? Math.round((t.submittedCount / t.targetCount) * 100) : 0;
            const deadlineColor = isOverdue ? 'var(--danger)' : 'var(--main-text)';
            const statusBadge = (t.submittedCount >= t.targetCount && t.targetCount > 0)
                    ? '<span style="color:#fff;background:#6366f1;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600">COMPLETED</span>'
                    : isOverdue
                        ? '<span style="color:#fff;background:var(--danger);padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600">OVERDUE</span>'
                        : (t.submittedCount > 0)
                            ? '<span style="color:#fff;background:#f59e0b;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600">IN PROGRESS</span>'
                            : '<span style="color:#fff;background:#16a34a;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600">ACTIVE</span>';

            const intervalLabel = INTERVAL_OPTS.find(o => o.value === t.checkIntervalMinutes)?.label || `${t.checkIntervalMinutes} min`;

            return `<div style="background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);padding:14px 18px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    ${statusBadge}
                    <strong style="font-size:.92rem;color:var(--main-text);flex:1">${esc(t.title)}</strong>
                    <span style="font-size:.78rem;color:var(--main-text3)">${intervalLabel}</span>
                </div>
                ${t.description ? `<div style="font-size:.82rem;color:var(--main-text3);margin-bottom:8px">${esc(t.description)}</div>` : ''}
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;font-size:.82rem">
                    <span style="color:${deadlineColor}"> Deadline: ${toLocalDisplay(t.deadline)}</span>
                    <span>Target: ${t.targetType === 'all' ? 'All Employees' : `${t.targetMemberIds.length} employees`}</span>
                    <span>Notify: ${t.notifyType === 'both' ? 'In-app + Email' : t.notifyType === 'email' ? 'Email only' : 'In-app only'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                    <div style="flex:1;background:var(--main-border);border-radius:4px;height:6px;overflow:hidden">
                        <div style="height:100%;width:${progressPct}%;background:${progressPct===100?'#16a34a':isOverdue?'var(--danger)':'var(--accent)'};border-radius:4px;transition:width .3s"></div>
                    </div>
                    <span style="font-size:.82rem;color:var(--main-text2);white-space:nowrap">${t.submittedCount}/${t.targetCount} submitted</span>
                </div>
                <div style="display:flex;gap:6px;justify-content:flex-end">
                    <button class="btn btn-ghost btn-sm" onclick="showTaskSubmissions(${t.id})"> Submissions</button>
                    <button class="btn btn-ghost btn-sm" onclick="editFileTask(${t.id})"> Edit</button>
                    <button class="btn-icon danger" onclick="deleteFileTask(${t.id})" title="Delete">&#10005;</button>
                </div>
            </div>`;
        }).join('');
    }

    const listEl = document.getElementById('file-tasks-list-area');
    if (listEl) listEl.innerHTML = tasksHtml;

    const pagHtml = buildPagination(totalFiltered, _fileTasksPage, _fileTasksPageSize,
        'goFileTasksPage', 'changeFileTasksPageSize',
        { label: 'tasks', sizes: [5, 10, 25] });
    const pagEl = document.getElementById('file-tasks-pag-area');
    if (pagEl) pagEl.innerHTML = pagHtml;
};

const goFileTasksPage = page => {
    const tasks = DB.fileTasks || [];
    const search = _fileTasksSearch.toLowerCase();
    const filtered = search ? tasks.filter(t => {
        const haystack = [t.title, t.description, t.deadline].map(v => (v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    }) : tasks;
    const totalPages = Math.ceil(filtered.length / _fileTasksPageSize) || 1;
    _fileTasksPage = Math.max(1, Math.min(page, totalPages));
    renderFileTasksList();
};

const changeFileTasksPageSize = size => {
    _fileTasksPageSize = parseInt(size);
    _fileTasksPage = 1;
    renderFileTasksList();
};

const toggleSendNow = () => {
    const notifyType = document.getElementById('ft-notify')?.value;
    const field = document.getElementById('ft-send-now-field');
    if (field) {
        field.style.display = notifyType === 'inapp' ? 'none' : '';
    }
};

const showAddFileTask = () => {
    _editingFileTaskId = null;
    const members = (DB.members || []).filter(m => m.role === 'employee');
    const memberCheckboxes = members.map(m =>
        `<div style="width:100%">
            <label class="ft-member-label" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font-size:.85rem;transition:background .15s;width:100%;box-sizing:border-box" onmouseover="this.style.background='var(--main-border)'" onmouseout="this.style.background='transparent'" data-name="${esc(m.name.toLowerCase())}">
                <input type="checkbox" class="ft-cb" value="${m.id}" style="flex-shrink:0"> ${esc(m.name)}
            </label>
        </div>`
    ).join('');

    const intervalOpts = INTERVAL_OPTS.map(o =>
        `<option value="${o.value}" ${o.value===1440?'selected':''}>${o.label}</option>`
    ).join('');

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Add File Request</h3>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
                <div class="field" style="grid-column:1/-1"><label>Title <span style="color:var(--danger)">*</span></label>
                    <input class="input" id="ft-title" placeholder="e.g. Submit Monthly Safety Report"></div>
                <div class="field" style="grid-column:1/-1"><label>Description</label>
                    <textarea class="input" id="ft-desc" rows="2" placeholder="Optional description"></textarea></div>
                <div class="field"><label>Deadline <span style="color:var(--danger)">*</span></label>
                    <input class="input" id="ft-deadline" type="datetime-local"></div>
                <div class="field"><label>Check Interval</label>
                    <select class="input" id="ft-interval">${intervalOpts}</select></div>
                <div class="field"><label>Notification</label>
                    <select class="input" id="ft-notify" onchange="toggleSendNow()">
                        <option value="both">In-app + Email</option>
                        <option value="inapp">In-app only</option>
                        <option value="email">Email only</option>
                    </select></div>
                <div class="field"><label><input type="checkbox" id="ft-active" checked> Active</label></div>
                <div class="field" style="grid-column:1/-1" id="ft-send-now-field"><label><input type="checkbox" id="ft-send-now" checked> Send notification immediately (Uncheck to send after the deadline)</label></div>
            </div>
            <div style="margin-top:8px">
                <label>Assign To</label>
                <div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                        <input type="radio" name="ft-target" value="all" checked onchange="document.getElementById('ft-members').style.display='none'"> All Employees
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                        <input type="radio" name="ft-target" value="specific" onchange="document.getElementById('ft-members').style.display='block'"> Select Employees
                    </label>
                </div>
                <div id="ft-members" style="display:none">
                    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
                        <input class="input" id="ft-member-search" placeholder="Search employee..." oninput="filterFtMembers()" style="flex:1;min-width:150px;font-size:.82rem;padding:8px 12px">
                        <button class="btn btn-ghost btn-sm" onclick="ftSelectVisible()">Select Visible</button>
                        <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.ft-cb').forEach(c=>c.checked=false)">Deselect All</button>
                    </div>
                    <div style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius);width:100%;box-sizing:border-box">
                        ${memberCheckboxes}
                    </div>
                </div>
            </div>
            <p class="auth-error" id="ft-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns">
            <button class="btn btn-ghost" onclick="renderFileTasksContent()">Cancel</button>
            <button class="btn btn-green" onclick="saveFileTask()">Create</button>
        </div>
    </div>`);
};

const filterFtMembers = () => {
    const q = (document.getElementById('ft-member-search')?.value || '').toLowerCase();
    document.querySelectorAll('.ft-member-label').forEach(l => {
        l.style.display = (!q || (l.dataset.name||'').includes(q)) ? 'flex' : 'none';
    });
};

const ftSelectVisible = () => {
    document.querySelectorAll('.ft-member-label').forEach(l => {
        if (l.style.display !== 'none') l.querySelector('.ft-cb').checked = true;
    });
};

const saveFileTask = async () => {
    const errEl = document.getElementById('ft-error');
    const title = document.getElementById('ft-title').value.trim();
    const description = document.getElementById('ft-desc').value.trim();
    const deadline = document.getElementById('ft-deadline').value;
    const targetType = document.querySelector('input[name="ft-target"]:checked').value;
    const targetMemberIds = targetType === 'specific'
        ? Array.from(document.querySelectorAll('.ft-cb:checked')).map(c => parseInt(c.value))
        : [];
    const notifyType = document.getElementById('ft-notify').value;
    const checkIntervalMinutes = parseInt(document.getElementById('ft-interval').value);
    const isActive = document.getElementById('ft-active').checked;

    if (!title) { errEl.textContent = 'Title required'; return; }
    if (!deadline) { errEl.textContent = 'Deadline required'; return; }
    if (targetType === 'specific' && targetMemberIds.length === 0) { errEl.textContent = 'Select at least one employee'; return; }

    errEl.textContent = '';
    const sendNow = document.getElementById('ft-send-now')?.checked || false;
    const body = { title, description, deadline, targetType, targetMemberIds, notifyType, checkIntervalMinutes, isActive, sendNow };

    if (_editingFileTaskId) {
        await api('/file-tasks/' + _editingFileTaskId, { method: 'PUT', body });
    } else {
        await api('/file-tasks', { method: 'POST', body });
    }
    _editingFileTaskId = null;
    await loadDB();
    renderFileTasksContent();
};

const editFileTask = id => {
    const t = (DB.fileTasks || []).find(x => x.id === id);
    if (!t) return;
    _editingFileTaskId = id;

    const members = (DB.members || []).filter(m => m.role === 'employee');
    const memberCheckboxes = members.map(m =>
        `<div style="width:100%">
            <label class="ft-member-label" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font-size:.85rem;transition:background .15s;width:100%;box-sizing:border-box" onmouseover="this.style.background='var(--main-border)'" onmouseout="this.style.background='transparent'" data-name="${esc(m.name.toLowerCase())}">
                <input type="checkbox" class="ft-cb" value="${m.id}" ${(t.targetMemberIds||[]).includes(m.id)?'checked':''} style="flex-shrink:0"> ${esc(m.name)}
            </label>
        </div>`
    ).join('');

    const intervalOpts = INTERVAL_OPTS.map(o =>
        `<option value="${o.value}" ${o.value===t.checkIntervalMinutes?'selected':''}>${o.label}</option>`
    ).join('');

    const dl = toLocalInput(t.deadline);
    
    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex-shrink:0">
            <h3>Edit File Request</h3>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
                <div class="field" style="grid-column:1/-1"><label>Title <span style="color:var(--danger)">*</span></label>
                    <input class="input" id="ft-title" value="${esc(t.title)}"></div>
                <div class="field" style="grid-column:1/-1"><label>Description</label>
                    <textarea class="input" id="ft-desc" rows="2">${esc(t.description||'')}</textarea></div>
                <div class="field"><label>Deadline <span style="color:var(--danger)">*</span></label>
                    <input class="input" id="ft-deadline" type="datetime-local" value="${dl}"></div>
                <div class="field"><label>Check Interval</label>
                    <select class="input" id="ft-interval">${intervalOpts}</select></div>
                <div class="field"><label>Notification</label>
                    <select class="input" id="ft-notify" onchange="toggleSendNow()">
                        <option value="both" ${t.notifyType==='both'?'selected':''}>In-app + Email</option>
                        <option value="inapp" ${t.notifyType==='inapp'?'selected':''}>In-app only</option>
                        <option value="email" ${t.notifyType==='email'?'selected':''}>Email only</option>
                    </select></div>
                <div class="field"><label><input type="checkbox" id="ft-active" ${t.isActive?'checked':''}> Active</label></div>
                <div class="field" style="grid-column:1/-1" id="ft-send-now-field"><label><input type="checkbox" id="ft-send-now"> Send notification now</label></div>
            </div>
            <div style="margin-top:8px">
                <label>Assign To</label>
                <div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                        <input type="radio" name="ft-target" value="all" ${t.targetType==='all'?'checked':''} onchange="document.getElementById('ft-members').style.display='none'"> All Employees
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem">
                        <input type="radio" name="ft-target" value="specific" ${t.targetType==='specific'?'checked':''} onchange="document.getElementById('ft-members').style.display='block'"> Select Employees
                    </label>
                </div>
                <div id="ft-members" style="display:${t.targetType==='specific'?'block':'none'}">
                    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
                        <input class="input" id="ft-member-search" placeholder="Search employee..." oninput="filterFtMembers()" style="flex:1;min-width:150px;font-size:.82rem;padding:8px 12px">
                        <button class="btn btn-ghost btn-sm" onclick="ftSelectVisible()">Select Visible</button>
                        <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.ft-cb').forEach(c=>c.checked=false)">Deselect All</button>
                    </div>
                    <div style="max-height:180px;overflow-y:auto;border:1px solid var(--main-border);border-radius:var(--radius);width:100%;box-sizing:border-box">
                        ${memberCheckboxes}
                    </div>
                </div>
            </div>
            <p class="auth-error" id="ft-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:12px" class="btns">
            <button class="btn btn-ghost" onclick="renderFileTasksContent()">Cancel</button>
            <button class="btn btn-accent" onclick="saveFileTask()">Save</button>
        </div>
    </div>`);

    // ✅ 初始化时检查一次
    setTimeout(() => toggleSendNow(), 0);
};

const deleteFileTask = async id => {
    if (!confirm('Delete this file task?')) return;
    await api('/file-tasks/' + id, { method: 'DELETE' });
    await loadDB();
    renderFileTasksContent();
};

const showTaskSubmissions = async id => {
    const task = (DB.fileTasks || []).find(t => t.id === id);
    if (!task) return;

    let pending;
    try {
        pending = await api('/file-tasks/' + id + '/pending');
    } catch (e) {
        pending = [];
    }

    const rows = pending.map(m => {
        const statusHtml = m.submitted
            ? '<span style="color:#16a34a;font-weight:600">✓ Submitted</span>'
            : '<span style="color:var(--danger);font-weight:600">✕ Pending</span>';
        return `<tr>
            <td>${esc(m.name)}</td>
            <td style="font-size:.82rem">${esc(m.email || '—')}</td>
            <td>${statusHtml}</td>
        </tr>`;
    }).join('');

    const submittedCount = pending.filter(m => m.submitted).length;
    const totalCount = pending.length;

    showModal(`
    <h3>Submissions: ${esc(task.title)}</h3>
    <div style="font-size:.85rem;color:var(--main-text3);margin-bottom:12px">
        ${submittedCount} of ${totalCount} submitted · Deadline: ${toLocalDisplay(task.deadline)}
    </div>
    <div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Email</th><th style="width:120px">Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:var(--main-text3);padding:20px">No employees</td></tr>'}</tbody>
    </table></div>
    <div class="btns" style="margin-top:16px">
        <button class="btn btn-ghost" onclick="renderFileTasksContent()">Back</button>
    </div>`);
};


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
    document.getElementById('login-subtitle').textContent = 'Project Tracking Management';
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
    else if (tab === 'pt-users') {
        if (ptDB.allUsers && ptDB.allUsers.length) {
            ptRenderUsers();
        } else {
            loadDB().then(function() { ptRenderUsers(); });
        }
    }
    else if (tab === 'pt-import') ptRenderImport();
    window.scrollTo(0, 0);
    _initPTRDebounce();
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

//------------Status Helper --------------
var STATUS_OPTS = [
    { value: 'pending', label: 'Pending' },
    { value: 'in progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' }
];

function statusBadge(status) {
    if (!status) return '<span style="color:var(--main-text3)">—</span>';
    var s = status.toLowerCase();
    if (s === 'completed') return '<span style="background:rgba(22,163,74,.1);color:#16a34a;padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:600;text-transform:uppercase">Completed</span>';
    if (s === 'in progress') return '<span style="background:rgba(217,119,6,.1);color:#d97706;padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:600;text-transform:uppercase">In Progress</span>';
    return '<span style="background:rgba(136,136,136,.1);color:#888;padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:600;text-transform:uppercase">Pending</span>';
}

// ============================================================
// 共用：Status Toggle Buttons
// ============================================================
const STATUS_BUTTONS = [
    { value: 'pending',     label: 'Pending',     color: 'var(--main-text3)', lightBg: 'rgba(122,117,112,0.1)', lightBorder: 'rgba(122,117,112,0.25)' },
    { value: 'in progress', label: 'In Progress', color: 'var(--warning)',    lightBg: 'rgba(234,179,8,0.08)',  lightBorder: 'rgba(234,179,8,0.25)' },
    { value: 'completed',   label: 'Completed',   color: 'var(--green)',      lightBg: 'rgba(34,197,94,0.08)',  lightBorder: 'rgba(34,197,94,0.25)' }
];

const _statusBtnHandlers = {
    'pt-dash-status-btns': {
        setArr: (v) => { dashStatusSelected = v; },
        applyFilter: () => { dashCurrentPage = 1; ptFilterDashboard(); }
    },
    'pt-panel-status-btns': {
        setArr: (v) => { panelStatusSelected = v; },
        applyFilter: () => { panelCurrentPage = 1; ptFilterPanels(); }
    }
};

const _buildStatusButtons = (containerId) => {
    const wrap = document.getElementById(containerId);
    wrap.innerHTML = STATUS_BUTTONS.map(s =>
        `<button type="button" class="status-filter-btn" data-status="${s.value}"
            onclick="toggleStatusBtn(this)" style="
                padding:5px 14px;border:1px solid ${s.lightBorder};border-radius:var(--radius-sm);
                background:${s.lightBg};color:var(--main-text2);font-size:.8rem;cursor:pointer;
                transition:all .15s ease">${s.label}</button>`
    ).join('');
};

const toggleStatusBtn = (btn) => {
    btn.classList.toggle('active');
    const isActive = btn.classList.contains('active');
    const btnDef = STATUS_BUTTONS.find(s => s.value === btn.dataset.status);
    const containerId = btn.parentElement.id;

    if (isActive) {
        btn.style.background = btnDef.color;
        btn.style.color = '#fff';
        btn.style.borderColor = btnDef.color;
    } else {
        btn.style.background = btnDef.lightBg;
        btn.style.color = 'var(--main-text2)';
        btn.style.borderColor = btnDef.lightBorder;
    }

    const handler = _statusBtnHandlers[containerId];
    if (handler) {
        handler.setArr([...document.querySelectorAll(`#${containerId} .status-filter-btn.active`)].map(b => b.dataset.status));
        handler.applyFilter();
    }
};

const _resetStatusButtons = (containerId) => {
    const handler = _statusBtnHandlers[containerId];
    if (handler) handler.setArr([]);
    document.querySelectorAll(`#${containerId} .status-filter-btn`).forEach(btn => {
        btn.classList.remove('active');
        const btnDef = STATUS_BUTTONS.find(s => s.value === btn.dataset.status);
        btn.style.background = btnDef.lightBg;
        btn.style.color = 'var(--main-text2)';
        btn.style.borderColor = btnDef.lightBorder;
    });
};

// ============================================================
// DASHBOARD
// ============================================================
let dashCurrentPage = 1;
let dashPageSize = 10;
let dashCustSelected = [];
let dashStatusSelected = [];

const ptRenderDashStats = (panels, d, animate, materialCount) => {
    const statusCounts = { total: 0, pending: 0, 'in progress': 0, completed: 0 };
    panels.forEach(p => {
        statusCounts.total++;
        const s = (p.status || 'pending').toLowerCase();
        if (statusCounts[s] !== undefined) statusCounts[s]++;
    });

    const completionRate = statusCounts.total > 0
        ? Math.round((statusCounts.completed / statusCounts.total) * 100)
        : 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const upcomingInstalls = panels.filter(p => {
        if (!p.install_date) return false;
        const dd = new Date(p.install_date);
        return dd >= sevenDaysAgo && dd <= new Date(now.getTime() + 30 * 86400000);
    }).length;

    const statsEl = document.getElementById('pt-dash-stats');
    if (!statsEl) return;

    if (animate) {
        statsEl.innerHTML =
            `<div class="dash-stat stat-card" style="display:flex;align-items:center;gap:14px;padding:16px">
                <div class="dash-ring-wrap">
                    <svg viewBox="0 0 64 64" width="64" height="64">
                        <circle class="dash-ring-bg" cx="32" cy="32" r="26"/>
                        <circle class="dash-ring-fill" id="dash-ring" cx="32" cy="32" r="26"/>
                    </svg>
                    <div class="dash-ring-text">${completionRate}%</div>
                </div>
                <div>
                    <div class="stat-label">Completion</div>
                    <div class="stat-sub">${statusCounts.completed} of ${statusCounts.total} done</div>
                </div>
            </div>

            <div class="dash-stat stat-card" style="padding:16px">
                <div class="stat-label">Pending</div>
                <div class="stat-value" style="color:var(--main-text3)">${statusCounts.pending}</div>
                <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${statusCounts.total ? Math.round(statusCounts.pending/statusCounts.total*100) : 0}%;background:var(--main-text3)"></div></div>
            </div>

            <div class="dash-stat stat-card" style="padding:16px">
                <div class="stat-label">In Progress</div>
                <div class="stat-value" style="color:var(--warning)">${statusCounts['in progress']}</div>
                <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${statusCounts.total ? Math.round(statusCounts['in progress']/statusCounts.total*100) : 0}%;background:var(--warning)"></div></div>
            </div>

            <div class="dash-stat stat-card" style="padding:16px">
                <div class="stat-label">Completed</div>
                <div class="stat-value" style="color:var(--green)">${statusCounts.completed}</div>
                <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${statusCounts.total ? Math.round(statusCounts.completed/statusCounts.total*100) : 0}%;background:var(--green)"></div></div>
            </div>

            <div class="dash-stat stat-card" style="padding:16px">
                <div class="stat-label">Total Panels</div>
                <div class="stat-value">${statusCounts.total}</div>
            </div>

            <div class="dash-stat stat-card" style="padding:16px">
                <div class="stat-label">Total Materials</div>
                <div class="stat-value">${materialCount}</div>
            </div>`;

        setTimeout(() => {
            const ring = document.getElementById('dash-ring');
            if (ring) {
                const circumference = 2 * Math.PI * 26;
                ring.style.strokeDashoffset = circumference - (completionRate / 100) * circumference;
            }
        }, 100);
    } else {
        const children = statsEl.children;
        if (children.length < 6) return;

        children[0].querySelector('.dash-ring-text').textContent = completionRate + '%';
        children[0].querySelector('.stat-sub').textContent = statusCounts.completed + ' of ' + statusCounts.total + ' done';
        const ring = document.getElementById('dash-ring');
        if (ring) {
            const circumference = 2 * Math.PI * 26;
            ring.style.transition = 'stroke-dashoffset 0.5s ease';
            ring.style.strokeDashoffset = circumference - (completionRate / 100) * circumference;
        }

        children[1].querySelector('.stat-value').textContent = statusCounts.pending;
        children[1].querySelector('.dash-progress-fill').style.width = (statusCounts.total ? Math.round(statusCounts.pending / statusCounts.total * 100) : 0) + '%';

        children[2].querySelector('.stat-value').textContent = statusCounts['in progress'];
        children[2].querySelector('.dash-progress-fill').style.width = (statusCounts.total ? Math.round(statusCounts['in progress'] / statusCounts.total * 100) : 0) + '%';

        children[3].querySelector('.stat-value').textContent = statusCounts.completed;
        children[3].querySelector('.dash-progress-fill').style.width = (statusCounts.total ? Math.round(statusCounts.completed / statusCounts.total * 100) : 0) + '%';

        children[4].querySelector('.stat-value').textContent = statusCounts.total;

        children[5].querySelector('.stat-value').textContent = materialCount;
    }
};

const ptRenderDashboard = () => {
    const d = ptDB.dashboard;
    const el = document.getElementById('pt-dashboard-content');
    const allPanels = ptDB.panelIds || [];

    dashCustSelected = [];
    dashStatusSelected = [];
    dashCurrentPage = 1;

    const customers = [];
    allPanels.forEach(p => {
        const c = (p.customer || '').trim();
        if (c && customers.indexOf(c) === -1) customers.push(c);
    });
    customers.sort();
    const custOpts = customers.map(c => ({ value: c, label: c }));
    dashCustSelected = [];

    el.innerHTML =
        `<style>
            @keyframes dashFadeUp {
                from { opacity: 0; transform: translateY(18px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes dashProgress {
                from { width: 0%; }
            }
            @keyframes dashCount {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .dash-stat {
                opacity: 0; animation: dashFadeUp .5s ease forwards;
                transition: transform .2s ease, box-shadow .2s ease;
            }
            .dash-stat:hover {
                transform: translateY(-3px);
                box-shadow: 0 6px 20px rgba(0,0,0,.08);
            }
            .dash-stat:nth-child(1) { animation-delay: .05s; }
            .dash-stat:nth-child(2) { animation-delay: .10s; }
            .dash-stat:nth-child(3) { animation-delay: .15s; }
            .dash-stat:nth-child(4) { animation-delay: .20s; }
            .dash-stat:nth-child(5) { animation-delay: .25s; }
            .dash-stat:nth-child(6) { animation-delay: .30s; }
            .dash-progress-bar {
                height: 6px; border-radius: 3px; background: var(--main-border);
                overflow: hidden; margin-top: 8px;
            }
            .dash-progress-fill {
                height: 100%; border-radius: 3px;
                background: linear-gradient(90deg, var(--green), #34d399);
                animation: dashProgress 1s ease .5s forwards;
                transition: width .6s ease;
            }
            .dash-stat .stat-value { animation: dashCount .4s ease forwards; }
            .dash-stat .stat-label { font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--main-text3);font-weight:500 }
            .dash-stat .stat-value { font-size:1.5rem;font-weight:700;font-family:var(--font-m);color:var(--main-text);line-height:1.2 }
            .dash-stat .stat-sub   { font-size:.72rem;color:var(--main-text3);margin-top:2px }
            .dash-ring-wrap {
                width:64px;height:64px;position:relative;flex-shrink:0;
            }
            .dash-ring-wrap svg { transform: rotate(-90deg); }
            .dash-ring-bg { fill:none;stroke:var(--main-border);stroke-width:5; }
            .dash-ring-fill {
                fill:none;stroke:var(--green);stroke-width:5;stroke-linecap:round;
                stroke-dasharray: ${2 * Math.PI * 26};
                stroke-dashoffset: ${2 * Math.PI * 26};
                transition: stroke-dashoffset 1.2s ease .4s;
            }
            .dash-ring-text {
                position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                font-family:var(--font-m);font-size:.78rem;font-weight:700;color:var(--main-text);
            }
        </style>

        <div id="pt-dash-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:20px"></div>

        <div class="pt-anim-filter filter">
            <input class="input" type="text" placeholder="Search all columns..." id="pt-dash-search" oninput="ptFilterDashboard()" style="max-width:320px">
            <div style="min-width:180px">${msGenerate('pt-dash-cust', custOpts, 'All Customers')}</div>
            <div id="pt-dash-status-btns" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-dash-inst-from" onchange="ptFilterDashboard()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-dash-inst-to" onchange="ptFilterDashboard()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <button class="btn btn-ghost btn-sm" onclick="ptResetDashFilter()">Reset</button>
            <span id="pt-dash-count" style="font-size:.82rem;color:var(--main-text3)"></span>
        </div>

        <div class="pt-anim-table">
            <div class="section-head"><h3>All Panels</h3></div>
            <div id="pt-dash-table-area"></div>
        </div>`;

    ptRenderDashStats(allPanels, d, true, d.total_materials);

    _buildStatusButtons('pt-dash-status-btns');

    msOnChange('pt-dash-cust', () => {
        dashCustSelected = msGetTextValues('pt-dash-cust').filter(v => v != null && v !== '');
        dashCurrentPage = 1;
        ptFilterDashboard();
    });
    ptFilterDashboard();
};

const ptGetFilteredDashboard = () => {
    const search = (document.getElementById('pt-dash-search').value || '').toLowerCase();
    const instFrom = document.getElementById('pt-dash-inst-from').value;
    const instTo = document.getElementById('pt-dash-inst-to').value;

    return (ptDB.panelIds || []).filter(p => {
        if (search) {
            const haystack = [
                p.name, p.customer,
                p.start_date, p.end_date, p.install_date,
                formatDateDMY(p.start_date), formatDateDMY(p.end_date), formatDateDMY(p.install_date),
                p.status
            ].map(v => String(v || '').toLowerCase()).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (dashCustSelected.length > 0 && dashCustSelected.indexOf((p.customer || '').trim()) === -1) return false;
        if (dashStatusSelected.length > 0 && dashStatusSelected.indexOf((p.status || '').toLowerCase()) === -1) return false;
        const id = p.install_date ? p.install_date.slice(0, 10) : '';
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;
        return true;
    });
};

const ptFilterDashboard = () => {
    const filtered = ptGetFilteredDashboard();
    document.getElementById('pt-dash-count').textContent = filtered.length + ' panels';

    const filteredPanelIds = filtered.map(p => p.id);
    const filteredPanelNames = filtered.map(p => p.name);
    const filteredMatCount = (ptDB.materials || []).filter(m => m.panel_no && filteredPanelNames.indexOf(m.panel_no) !== -1).length;

    ptRenderDashStats(filtered, ptDB.dashboard, false, filteredMatCount);

    const totalPages = Math.ceil(filtered.length / dashPageSize) || 1;
    if (dashCurrentPage > totalPages) dashCurrentPage = totalPages;
    if (dashCurrentPage < 1) dashCurrentPage = 1;
    const startIdx = (dashCurrentPage - 1) * dashPageSize;
    const pageData = filtered.slice(startIdx, startIdx + dashPageSize);

    const area = document.getElementById('pt-dash-table-area');
    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty-msg">No panels found</div>';
        return;
    }
    area.innerHTML =
        `<div class="table-wrap"><table>
            <thead><tr><th>No</th><th>Panel ID</th><th>Customer</th><th>Start Date</th><th>End Date</th><th>Install Date</th><th>Status</th></tr></thead>
            <tbody>${pageData.map((p, i) =>
                `<tr style="cursor:pointer" onclick="ptOpenDrawer(${p.id})">
                    <td>${startIdx + i + 1}</td>
                    <td><strong>${esc(p.name)}</strong></td>
                    <td>${esc(p.customer || '\u2014')}</td>
                    <td>${formatDateDMY(p.start_date)}</td>
                    <td>${formatDateDMY(p.end_date)}</td>
                    <td>${formatDateDMY(p.install_date)}</td>
                    <td>${statusBadge(p.status)}</td>
                </tr>`
            ).join('')}</tbody></table></div>` +
        ptPagination(filtered.length, dashCurrentPage, dashPageSize, 'goDashPage', 'changeDashPageSize');
};

const ptResetDashFilter = () => {
    document.getElementById('pt-dash-search').value = '';
    document.getElementById('pt-dash-inst-from').value = '';
    document.getElementById('pt-dash-inst-to').value = '';
    dashCustSelected = [];
    msClear('pt-dash-cust');
    _resetStatusButtons('pt-dash-status-btns');
    dashCurrentPage = 1;
    ptFilterDashboard();
};

const goDashPage = (page) => { dashCurrentPage = page; ptFilterDashboard(); };
const changeDashPageSize = (size) => { dashPageSize = parseInt(size); dashCurrentPage = 1; ptFilterDashboard(); };

// ============================================================
// PANELS
// ============================================================
let panelCurrentPage = 1;
let panelPageSize = 10;
let panelCustSelected = [];
let panelStatusSelected = [];

const ptClampDatePair = (fromId, toId) => {
    const f = document.getElementById(fromId).value;
    const t = document.getElementById(toId).value;
    if (f) document.getElementById(toId).min = f;
    if (f && t && t < f) document.getElementById(toId).value = f;
};

const ptRenderPanel = () => {
    const el = document.getElementById('pt-panel-content');
    const addBtn = canEdit() ? '<button class="btn btn-green btn" onclick="ptOpenAddPanel()">+ Add Panel</button>' : '';

    const customers = [];
    (ptDB.panelIds || []).forEach(p => {
        const c = (p.customer || '').trim();
        if (c && customers.indexOf(c) === -1) customers.push(c);
    });
    customers.sort();
    const custOpts = customers.map(c => ({ value: c, label: c }));
    panelCustSelected = [];

    el.innerHTML =
        `<div class="pt-anim-filter filter">
            <input class="input" type="text" placeholder="Search all columns..." id="pt-panel-search" oninput="ptFilterPanels()" style="max-width:280px">
            <div style="min-width:180px">${msGenerate('pt-panel-cust', custOpts, 'All Customers')}</div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Start Date</label><input type="date" class="input" id="pt-panel-start" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="ptClampDatePair('pt-panel-start','pt-panel-end');ptFilterPanels()"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">End Date</label><input type="date" class="input" id="pt-panel-end" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="ptClampDatePair('pt-panel-start','pt-panel-end');ptFilterPanels()"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-panel-inst-from" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="ptClampDatePair('pt-panel-inst-from','pt-panel-inst-to');ptFilterPanels()"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-panel-inst-to" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)" onchange="ptClampDatePair('pt-panel-inst-from','pt-panel-inst-to');ptFilterPanels()"></div>
            <div id="pt-panel-status-btns" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            <button class="btn btn-ghost btn-sm" onclick="ptResetPanelFilter()">Reset</button>
            <span id="pt-panel-count" style="font-size:.82rem;color:var(--main-text3)"></span>
        </div>

        <div class="pt-anim-head section-head">
            <h3>All Panels</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-blue btn" onclick="ptExportPanelsExcel()">&#128196; Export Excel</button>
                ${addBtn}
            </div>
        </div>

        <div class="pt-anim-table">
            <div id="pt-panel-table-area"></div>
        </div>`;

    _buildStatusButtons('pt-panel-status-btns');

    msOnChange('pt-panel-cust', () => {
        panelCustSelected = msGetTextValues('pt-panel-cust').filter(v => v != null && v !== '');
        panelCurrentPage = 1;
        ptFilterPanels();
    });
    ptFilterPanels();
};

const ptGetFilteredPanels = () => {
    const search = (document.getElementById('pt-panel-search').value || '').toLowerCase();
    const startFilter = document.getElementById('pt-panel-start').value;
    const endFilter = document.getElementById('pt-panel-end').value;
    const instFrom = document.getElementById('pt-panel-inst-from').value;
    const instTo = document.getElementById('pt-panel-inst-to').value;

    return (ptDB.panelIds || []).filter(p => {
        if (search) {
            const haystack = [
                p.name, p.customer,
                p.start_date, p.end_date, p.install_date,
                formatDateDMY(p.start_date), formatDateDMY(p.end_date), formatDateDMY(p.install_date),
                p.status
            ].map(v => String(v || '').toLowerCase()).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (panelCustSelected.length > 0 && panelCustSelected.indexOf((p.customer || '').trim()) === -1) return false;
        if (panelStatusSelected.length > 0 && panelStatusSelected.indexOf((p.status || '').toLowerCase()) === -1) return false;
        const sd = p.start_date ? p.start_date.slice(0, 10) : '';
        const ed = p.end_date ? p.end_date.slice(0, 10) : '';
        const id = p.install_date ? p.install_date.slice(0, 10) : '';
        if (startFilter && (!sd || sd < startFilter)) return false;
        if (endFilter && (!ed || ed > endFilter)) return false;
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;
        return true;
    });
};

const ptFilterPanels = () => {
    const filtered = ptGetFilteredPanels();
    document.getElementById('pt-panel-count').textContent = filtered.length + ' panels';

    const totalPages = Math.ceil(filtered.length / panelPageSize) || 1;
    if (panelCurrentPage > totalPages) panelCurrentPage = totalPages;
    if (panelCurrentPage < 1) panelCurrentPage = 1;
    const startIdx = (panelCurrentPage - 1) * panelPageSize;
    const pageData = filtered.slice(startIdx, startIdx + panelPageSize);

    const area = document.getElementById('pt-panel-table-area');
    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty-msg">No panels found</div>';
        return;
    }
    area.innerHTML =
        `<div class="table-wrap"><table>
            <thead><tr><th>No</th><th>Panel ID</th><th>Customer</th><th>Start Date</th><th>End Date</th><th>Install Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${pageData.map((p, i) =>
                `<tr style="cursor:pointer" onclick="ptOpenDrawer(${p.id})">
                    <td>${startIdx + i + 1}</td>
                    <td><strong>${esc(p.name)}</strong></td>
                    <td>${esc(p.customer || '\u2014')}</td>
                    <td>${formatDateDMY(p.start_date)}</td>
                    <td>${formatDateDMY(p.end_date)}</td>
                    <td>${formatDateDMY(p.install_date)}</td>
                    <td>${statusBadge(p.status)}</td>
                    <td onclick="event.stopPropagation()">${canEdit()
                        ? `<div style="display:flex;gap:4px">
                            <button class="btn btn-ghost btn-sm" onclick="ptShowEditPanel(${p.id})">&#9998;</button>
                            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeletePanel(${p.id})">&#10005;</button>
                          </div>`
                        : ''}</td>
                </tr>`
            ).join('')}</tbody></table></div>` +
        ptPagination(filtered.length, panelCurrentPage, panelPageSize, 'goPanelPage', 'changePanelPageSize');
};

const ptResetPanelFilter = () => {
    document.getElementById('pt-panel-search').value = '';
    document.getElementById('pt-panel-start').value = '';
    document.getElementById('pt-panel-end').value = '';
    document.getElementById('pt-panel-inst-from').value = '';
    document.getElementById('pt-panel-inst-to').value = '';
    panelCustSelected = [];
    msClear('pt-panel-cust');
    _resetStatusButtons('pt-panel-status-btns');
    panelCurrentPage = 1;
    ptFilterPanels();
};

const goPanelPage = (page) => { panelCurrentPage = page; ptFilterPanels(); };
const changePanelPageSize = (size) => { panelPageSize = parseInt(size); panelCurrentPage = 1; ptFilterPanels(); };

const ptExportPanelsExcel = () => {
    const rows = ptGetFilteredPanels().map((p, i) => ({
        No: i + 1,
        'Panel ID': p.name || '',
        Customer: p.customer || '',
        'Start Date': formatDateDMY(p.start_date),
        'End Date': formatDateDMY(p.end_date),
        'Install Date': formatDateDMY(p.install_date),
        Status: p.status || 'pending'
    }));
    ptExportRowsToExcel(rows, 'Panels', 'panels');
};

const ptOpenAddPanel = () => {
    document.getElementById('pt-ap-name').value = '';
    document.getElementById('pt-ap-customer').value = '';
    document.getElementById('pt-ap-start').value = '';
    document.getElementById('pt-ap-end').value = '';
    document.getElementById('pt-ap-instdate').value = '';
    document.getElementById('pt-ap-error').textContent = '';
    ptOpenModal('modal-pt-add-panel');
};

const ptDoAddPanel = async () => {
    const name = document.getElementById('pt-ap-name').value.trim();
    const errEl = document.getElementById('pt-ap-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter a panel ID/name'; return; }
    try {
        const scopeRes = await api('/scopes');
        const panelScope = scopeRes.find(s => s.name.toLowerCase().indexOf('panel build') !== -1);
        if (!panelScope) { errEl.textContent = 'Panel Build scope not found'; return; }
        await api('/projects', { method: 'POST', body: {
            name,
            categoryId: panelScope.id,
            startDate: document.getElementById('pt-ap-start').value || null,
            endDate: document.getElementById('pt-ap-end').value || null,
            customer: document.getElementById('pt-ap-customer').value.trim(),
            installDate: document.getElementById('pt-ap-instdate').value || null,
            status: document.getElementById('pt-ap-status').value || 'pending'
        }});
        ptCloseModal('modal-pt-add-panel');
        await ptLoadDB();
        ptFilterPanels();
    } catch (e) { errEl.textContent = e.message; }
};

const ptShowEditPanel = (id) => {
    const p = (ptDB.panelIds || []).find(x => x.id === id);
    if (!p) return;
    document.getElementById('pt-ep-id').value = p.id;
    document.getElementById('pt-ep-name').value = p.name;
    document.getElementById('pt-ep-customer').value = p.customer || '';
    document.getElementById('pt-ep-start').value = p.start_date ? p.start_date.slice(0, 10) : '';
    document.getElementById('pt-ep-end').value = p.end_date ? p.end_date.slice(0, 10) : '';
    document.getElementById('pt-ep-instdate').value = p.install_date ? p.install_date.slice(0, 10) : '';
    document.getElementById('pt-ep-status').value = p.status || 'pending';
    document.getElementById('pt-ep-error').textContent = '';
    ptOpenModal('modal-pt-edit-panel');
};

const ptDoEditPanel = async () => {
    const id = document.getElementById('pt-ep-id').value;
    const name = document.getElementById('pt-ep-name').value.trim();
    const errEl = document.getElementById('pt-ep-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter a panel name'; return; }
    try {
        const scopeRes = await api('/scopes');
        const panelScope = scopeRes.find(s => s.name.toLowerCase().indexOf('panel build') !== -1);
        await api('/projects/' + id, { method: 'PUT', body: {
            name,
            categoryId: panelScope ? panelScope.id : null,
            startDate: document.getElementById('pt-ep-start').value || null,
            endDate: document.getElementById('pt-ep-end').value || null,
            customer: document.getElementById('pt-ep-customer').value.trim(),
            installDate: document.getElementById('pt-ep-instdate').value || null,
            status: document.getElementById('pt-ep-status').value || 'pending'
        }});
        ptCloseModal('modal-pt-edit-panel');
        await ptLoadDB();
        ptFilterPanels();
    } catch (e) { errEl.textContent = e.message; }
};

const ptDeletePanel = (id) => {
    const p = (ptDB.panelIds || []).find(x => x.id === id);
    if (!p) return;
    showModal(`<h3>Delete Panel</h3>
        <p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">${esc(p.name)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeletePanel(${id})">Delete</button></div>`);
};

const ptDoDeletePanel = async (id) => {
    hideModal();
    try {
        await api('/projects/' + id, { method: 'DELETE' });
        await ptLoadDB();
        ptFilterPanels();
    } catch (e) { alert(e.message); }
};

// ---------- DRAWER ----------
let drawerPanelMatPage = 1;
let drawerPanelMatPageSize = 5;
let drawerSiblingsPage = 1;
let drawerSiblingsPageSize = 5;
let drawerCurrentPanelId = null;
let drawerCurrentMatId = null;

const fmtPrice = (v) => {
    if (v == null || parseFloat(v) <= 0) return '\u2014';
    return parseFloat(v).toLocaleString('en-MY', { maximumFractionDigits: 2 });
};

const fmtPriceRM = (v) => {
    if (v == null || parseFloat(v) <= 0) return '\u2014';
    return 'RM ' + parseFloat(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ptOpenDrawer = (panelId) => {
    drawerPanelMatPage = 1;
    drawerCurrentPanelId = panelId;
    drawerCurrentMatId = null;
    ptRenderDrawerPanel();
};

const buildMatTable = (materials, startIdx, pageSize) => {
    if (materials.length === 0) return '<div style="text-align:center;padding:24px;color:var(--main-text3);font-size:.88rem">No materials assigned</div>';

    const pageData = materials.slice(startIdx, startIdx + pageSize);
    return `<div class="table-wrap"><table>
        <thead><tr>
            <th style="width:40px">No</th><th>Part No</th><th>Brand</th><th>Description</th>
            <th>Serial No</th><th>Vendor</th><th>Vendor PO</th><th>YOM</th><th>Unit</th><th style="text-align:right">Price</th>
        </tr></thead>
        <tbody>${pageData.map((m, i) =>
            `<tr style="cursor:pointer" onclick="ptCloseDrawer();setTimeout(()=>ptOpenMaterialDrawer(${m.id}),220)">
                <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx + i + 1}</td>
                <td><strong>${esc(m.part_no)}</strong></td>
                <td>${esc(m.brand || '\u2014')}</td>
                <td>${esc(m.description || '\u2014')}</td>
                <td style="font-family:var(--font-m)">${esc(m.serial_no || '\u2014')}</td>
                <td>${esc(m.vendor || '\u2014')}</td>
                <td>${esc(m.vendor_po_no || '\u2014')}</td>
                <td style="font-family:var(--font-m)">${esc(m.yom || '\u2014')}</td>
                <td>${esc(m.unit || '\u2014')}</td>
                <td style="text-align:right;font-family:var(--font-m)">${fmtPrice(m.unit_price)}</td>
            </tr>`
        ).join('')}</tbody></table></div>`;
};

const buildInfoGrid = (items) =>
    `<div class="pt-info-grid">${items.map(([label, value]) =>
        `<div class="pt-info-item"><span class="pt-info-label">${label}</span><span class="pt-info-value">${value}</span></div>`
    ).join('')}</div>`;

const ptRenderDrawerPanel = () => {
    const panelId = drawerCurrentPanelId;
    const panel = (ptDB.panelIds || []).find(p => p.id === panelId);
    if (!panel) return;

    const overlay = document.getElementById('pt-drawer-overlay');
    const drawer = document.getElementById('pt-drawer');
    const title = document.getElementById('pt-drawer-title');
    const body = document.getElementById('pt-drawer-body');

    title.textContent = panel.name || 'Panel Details';

    const materials = (ptDB.materials || []).filter(m => m.panel_no === panel.name);

    const matTotalPages = Math.ceil(materials.length / drawerPanelMatPageSize) || 1;
    if (drawerPanelMatPage > matTotalPages) drawerPanelMatPage = matTotalPages;
    if (drawerPanelMatPage < 1) drawerPanelMatPage = 1;
    const matStartIdx = (drawerPanelMatPage - 1) * drawerPanelMatPageSize;

    const matRows = buildMatTable(materials, matStartIdx, drawerPanelMatPageSize) +
        (materials.length > 0 ? ptPagination(materials.length, drawerPanelMatPage, drawerPanelMatPageSize, 'goDrawerPanelMatPage', 'changeDrawerPanelMatPageSize') : '');

    const totalCost = materials.reduce((sum, m) =>
        sum + (parseFloat(m.unit_price) || 0) * (parseFloat(m.qty) || 1), 0);

    body.innerHTML =
        `<div class="pt-drawer-section">
            <h4>Panel Information</h4>
            ${buildInfoGrid([
                ['Panel ID', esc(panel.name)],
                ['Customer', esc(panel.customer || '\u2014')],
                ['Start Date', `<span class="mono">${formatDateDMY(panel.start_date)}</span>`],
                ['End Date', `<span class="mono">${formatDateDMY(panel.end_date)}</span>`],
                ['Install Date', `<span class="mono">${formatDateDMY(panel.install_date)}</span>`],
                ['Materials Count', `<span class="mono">${materials.length}</span>`],
                ['Status', statusBadge(panel.status)]
            ])}
        </div>` +

        (totalCost > 0
            ? `<div class="pt-drawer-section">
                <h4>Cost Summary</h4>
                ${buildInfoGrid([
                    ['Total Material Cost', `<span style="color:var(--accent);font-family:var(--font-m);font-size:1.1rem">${fmtPriceRM(totalCost)}</span>`]
                ])}
              </div>`
            : '') +

        `<div class="pt-drawer-section">
            <h4>Materials (${materials.length})</h4>
            ${matRows}
        </div>`;

    overlay.classList.add('active');
    drawer.classList.add('active');
};

const goDrawerPanelMatPage = (page) => {
    drawerPanelMatPage = page;
    ptRenderDrawerPanel();
};

const changeDrawerPanelMatPageSize = (size) => {
    drawerPanelMatPageSize = parseInt(size);
    drawerPanelMatPage = 1;
    ptRenderDrawerPanel();
};

const ptCloseDrawer = () => {
    document.getElementById('pt-drawer-overlay').classList.remove('active');
    document.getElementById('pt-drawer').classList.remove('active');
};

const ptOpenMaterialDrawer = (matId) => {
    drawerSiblingsPage = 1;
    drawerCurrentMatId = matId;
    drawerCurrentPanelId = null;
    ptRenderDrawerMaterial();
};

const ptRenderDrawerMaterial = () => {
    const matId = drawerCurrentMatId;
    const m = ptDB.materials.find(x => x.id === matId);
    if (!m) return;

    const overlay = document.getElementById('pt-drawer-overlay');
    const drawer = document.getElementById('pt-drawer');
    const title = document.getElementById('pt-drawer-title');
    const body = document.getElementById('pt-drawer-body');

    title.textContent = m.part_no || 'Material Details';

    const panel = m.panel_no ? (ptDB.panelIds || []).find(p => p.name === m.panel_no) : null;

    const siblings = m.panel_no
        ? ptDB.materials.filter(x => x.panel_no === m.panel_no)
        : [];

    const sibTotalPages = Math.ceil(siblings.length / drawerSiblingsPageSize) || 1;
    if (drawerSiblingsPage > sibTotalPages) drawerSiblingsPage = sibTotalPages;
    if (drawerSiblingsPage < 1) drawerSiblingsPage = 1;
    const sibStartIdx = (drawerSiblingsPage - 1) * drawerSiblingsPageSize;

    const sibRows = siblings.length > 0
        ? `<div class="pt-drawer-section">
            <h4>Materials in ${esc(m.panel_no)} (${siblings.length})</h4>
            ${buildMatTable(siblings, sibStartIdx, drawerSiblingsPageSize)}
            ${ptPagination(siblings.length, drawerSiblingsPage, drawerSiblingsPageSize, 'goDrawerSiblingsPage', 'changeDrawerSiblingsPageSize')}
          </div>`
        : '';

    body.innerHTML =
        `<div class="pt-drawer-section">
            <h4>Material Information</h4>
            ${buildInfoGrid([
                ['Part No', esc(m.part_no)],
                ['Serial No', `<span class="mono">${esc(m.serial_no || '\u2014')}</span>`],
                ['Brand', esc(m.brand || '\u2014')],
                ['Description', esc(m.description || '\u2014')],
                ['Category', esc(m.category || '\u2014')],
                ['Unit', esc(m.unit || '\u2014')],
                ['Price', `<span class="mono">${fmtPriceRM(m.unit_price)}</span>`],
                ['YOM', `<span class="mono">${esc(m.yom || '\u2014')}</span>`],
                ['Vendor', esc(m.vendor || '\u2014')],
                ['Vendor PO No', `<span class="mono">${esc(m.vendor_po_no || '\u2014')}</span>`],
                ['Install Date', `<span class="mono">${formatDateDMY(m.install_date)}</span>`]
            ])}
        </div>` +

        (panel
            ? `<div class="pt-drawer-section">
                <h4>Panel Information</h4>
                ${buildInfoGrid([
                    ['Panel ID', esc(panel.name)],
                    ['Customer', esc(panel.customer || '\u2014')],
                    ['Start Date', `<span class="mono">${formatDateDMY(panel.start_date)}</span>`],
                    ['End Date', `<span class="mono">${formatDateDMY(panel.end_date)}</span>`],
                    ['Install Date', `<span class="mono">${formatDateDMY(panel.install_date)}</span>`],
                    ['Total Materials', `<span class="mono">${siblings.length}</span>`],
                    ['Status', statusBadge(panel.status)]
                ])}
              </div>`
            : `<div class="pt-drawer-section">
                <h4>Panel Information</h4>
                <div style="text-align:center;padding:24px;color:var(--main-text3);font-size:.88rem">Not assigned to any panel</div>
              </div>`) +

        sibRows;

    overlay.classList.add('active');
    drawer.classList.add('active');
};

const goDrawerSiblingsPage = (page) => {
    drawerSiblingsPage = page;
    ptRenderDrawerMaterial();
};

const changeDrawerSiblingsPageSize = (size) => {
    drawerSiblingsPageSize = parseInt(size);
    drawerSiblingsPage = 1;
    ptRenderDrawerMaterial();
};

// ---------- MATERIALS ----------
let matCurrentPage = 1;
let matPageSize = 10;
let matBrandSelected = [];
let matCatSelected = [];

const ptRenderMaterial = () => {
    const el = document.getElementById('pt-material-content');
    const addBtn = canEdit() ? '<button class="btn btn-green btn" onclick="ptOpenAddMaterial()">+ Add Material</button>' : '';

    const brands = [];
    const cats = [];
    (ptDB.materials || []).forEach(m => {
        const b = (m.brand || '').trim();
        if (b && brands.indexOf(b) === -1) brands.push(b);
        const c = (m.category || '').trim();
        if (c && cats.indexOf(c) === -1) cats.push(c);
    });
    brands.sort();
    cats.sort();
    const brandOpts = brands.map(b => ({ value: b, label: b }));
    const catOpts = cats.map(c => ({ value: c, label: c }));
    matBrandSelected = [];
    matCatSelected = [];

    el.innerHTML =
        `<div class="pt-anim-filter filter">
            <input class="input" type="text" placeholder="Search all columns..." id="pt-mat-search" oninput="ptFilterMaterials()" style="max-width:280px">
            <div style="min-width:160px">${msGenerate('pt-mat-brand', brandOpts, 'All Brands')}</div>
            <div style="min-width:160px">${msGenerate('pt-mat-cat', catOpts, 'All Categories')}</div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Install From</label><input type="date" class="input" id="pt-mat-inst-from" onchange="ptClampDatePair('pt-mat-inst-from','pt-mat-inst-to');ptFilterMaterials()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:.78rem;color:var(--main-text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">To</label><input type="date" class="input" id="pt-mat-inst-to" onchange="ptClampDatePair('pt-mat-inst-from','pt-mat-inst-to');ptFilterMaterials()" style="width:155px;padding:8px 10px;font-size:.82rem;background:var(--main-surface)"></div>
            <button class="btn btn-ghost btn-sm" onclick="ptResetMatFilter()">Reset</button>
            <span id="pt-mat-count" style="font-size:.82rem;color:var(--main-text3)"></span>
            <div style="flex:1"></div>
        </div>

        <div class="pt-anim-head section-head">
            <h3>All Materials</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-blue btn" onclick="ptExportMaterialsExcel()">&#128196; Export Excel</button>
                ${addBtn}
            </div>
        </div>

        <div class="pt-anim-table">
            <div id="pt-mat-table-area"></div>
        </div>`;

    msOnChange('pt-mat-brand', () => {
        matBrandSelected = msGetTextValues('pt-mat-brand').filter(v => v != null && v !== '');
        matCurrentPage = 1;
        ptFilterMaterials();
    });
    msOnChange('pt-mat-cat', () => {
        matCatSelected = msGetTextValues('pt-mat-cat').filter(v => v != null && v !== '');
        matCurrentPage = 1;
        ptFilterMaterials();
    });
    ptFilterMaterials();
};

const ptGetFilteredMaterials = () => {
    const search = (document.getElementById('pt-mat-search').value || '').toLowerCase();
    const instFrom = document.getElementById('pt-mat-inst-from').value;
    const instTo = document.getElementById('pt-mat-inst-to').value;

    return (ptDB.materials || []).filter(m => {
        if (search) {
            const haystack = [
                m.part_no, m.brand, m.description, m.serial_no, m.yom,
                m.vendor, m.vendor_po_no, m.panel_no, m.install_date,
                formatDateDMY(m.install_date),
                m.category, m.unit, m.unit_price
            ].map(v => String(v || '').toLowerCase()).join(' ');
            if (haystack.indexOf(search) === -1) return false;
        }
        if (matBrandSelected.length > 0 && matBrandSelected.indexOf((m.brand || '').trim()) === -1) return false;
        if (matCatSelected.length > 0 && matCatSelected.indexOf((m.category || '').trim()) === -1) return false;
        const id = m.install_date ? m.install_date.slice(0, 10) : '';
        if (instFrom && (!id || id < instFrom)) return false;
        if (instTo && (!id || id > instTo)) return false;
        return true;
    });
};

const ptFilterMaterials = () => {
    const filtered = ptGetFilteredMaterials();
    document.getElementById('pt-mat-count').textContent = filtered.length + ' materials';

    const totalPages = Math.ceil(filtered.length / matPageSize) || 1;
    if (matCurrentPage > totalPages) matCurrentPage = totalPages;
    if (matCurrentPage < 1) matCurrentPage = 1;
    const startIdx = (matCurrentPage - 1) * matPageSize;
    const pageData = filtered.slice(startIdx, startIdx + matPageSize);

    const area = document.getElementById('pt-mat-table-area');
    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty-msg">No materials found</div>';
        return;
    }
    area.innerHTML =
        `<div class="table-wrap"><table>
            <thead><tr><th>No</th><th>Part No</th><th>Description</th><th>Brand</th><th>Serial No</th><th>Vendor PO</th><th>Vendor</th><th>Panel ID</th><th>YOM</th><th>Category</th><th>Unit</th><th>Price</th><th>Install Date</th><th>Actions</th></tr></thead>
            <tbody>${pageData.map((m, i) =>
                `<tr style="cursor:pointer" onclick="ptOpenMaterialDrawer(${m.id})">
                    <td>${startIdx + i + 1}</td>
                    <td><strong>${esc(m.part_no)}</strong></td>
                    <td>${esc(m.description || '\u2014')}</td>
                    <td>${esc(m.brand)}</td>
                    <td>${esc(m.serial_no || '\u2014')}</td>
                    <td>${esc(m.vendor_po_no || '\u2014')}</td>
                    <td>${esc(m.vendor || '\u2014')}</td>
                    <td>${esc(m.panel_no || '\u2014')}</td>
                    <td>${esc(m.yom || '\u2014')}</td>
                    <td>${esc(m.category || '\u2014')}</td>
                    <td>${esc(m.unit || '\u2014')}</td>
                    <td>${m.unit_price != null ? parseFloat(m.unit_price).toLocaleString('en-MY', { maximumFractionDigits: 2 }) : '\u2014'}</td>
                    <td>${m.install_date ? formatDateDMY(m.install_date) : '\u2014'}</td>
                    <td onclick="event.stopPropagation()">${canEdit()
                        ? `<div style="display:flex;gap:4px">
                            <button class="btn btn-ghost btn-sm" onclick="ptShowEditMaterial(${m.id})">&#9998;</button>
                            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeleteMaterial(${m.id})">&#10005;</button>
                          </div>`
                        : ''}</td>
                </tr>`
            ).join('')}</tbody></table></div>` +
        ptPagination(filtered.length, matCurrentPage, matPageSize, 'goMatPage', 'changeMatPageSize');
};

const ptResetMatFilter = () => {
    document.getElementById('pt-mat-search').value = '';
    document.getElementById('pt-mat-inst-from').value = '';
    document.getElementById('pt-mat-inst-to').value = '';
    matBrandSelected = [];
    matCatSelected = [];
    msClear('pt-mat-brand');
    msClear('pt-mat-cat');
    matCurrentPage = 1;
    ptFilterMaterials();
};

const goMatPage = (page) => {
    matCurrentPage = page;
    ptFilterMaterials();
};

const changeMatPageSize = (size) => {
    matPageSize = parseInt(size);
    matCurrentPage = 1;
    ptFilterMaterials();
};

const ptExportMaterialsExcel = () => {
    const rows = ptGetFilteredMaterials().map((m, i) => ({
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
    }));
    ptExportRowsToExcel(rows, 'Materials', 'materials');
};

const _getPanelOptions = (selected) =>
    (ptDB.panelIds || []).map(p => {
        const sel = p.name === selected ? ' selected' : '';
        return `<option value="${esc(p.name)}"${sel}>${esc(p.name)}</option>`;
    }).join('');

const _clearMaterialFields = (ids) => ids.forEach(id => { document.getElementById(id).value = ''; });

const ptOpenAddMaterial = () => {
    document.getElementById('pt-am-panelno').innerHTML =
        '<option value="">\u2014 Select Panel ID \u2014</option>' + _getPanelOptions('');
    _clearMaterialFields(['pt-am-partno', 'pt-am-brand', 'pt-am-serial', 'pt-am-desc', 'pt-am-yom', 'pt-am-vendor', 'pt-am-vpo', 'pt-am-price', 'pt-am-cat', 'pt-am-unit']);
    document.getElementById('pt-am-instdate').value = '';
    document.getElementById('pt-am-error').textContent = '';
    ptOpenModal('modal-pt-add-material');
};

const ptShowEditMaterial = (id) => {
    const m = ptDB.materials.find(x => x.id === id);
    if (!m) return;
    document.getElementById('pt-em-panelno').innerHTML =
        '<option value="">\u2014 Select Panel ID \u2014</option>' + _getPanelOptions(m.panel_no);
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
};

const _collectMaterialBody = (prefix) => ({
    part_no: document.getElementById(`${prefix}-partno`).value.trim(),
    brand: document.getElementById(`${prefix}-brand`).value.trim(),
    serial_no: document.getElementById(`${prefix}-serial`).value.trim(),
    description: document.getElementById(`${prefix}-desc`).value.trim(),
    yom: document.getElementById(`${prefix}-yom`).value.trim(),
    vendor: document.getElementById(`${prefix}-vendor`).value.trim(),
    vendor_po_no: document.getElementById(`${prefix}-vpo`).value.trim(),
    panel_no: document.getElementById(`${prefix}-panelno`).value,
    install_date: document.getElementById(`${prefix}-instdate`).value || null,
    category: document.getElementById(`${prefix}-cat`).value.trim(),
    unit: document.getElementById(`${prefix}-unit`).value.trim(),
    unit_price: parseFloat(document.getElementById(`${prefix}-price`).value) || 0
});

const ptDoAddMaterial = () => {
    const errEl = document.getElementById('pt-am-error');
    errEl.textContent = '';
    if (!document.getElementById('pt-am-partno').value.trim()) { errEl.textContent = 'Enter a part number'; return; }
    api('/m-materials', { method: 'POST', body: _collectMaterialBody('pt-am') })
        .then(() => {
            ptCloseModal('modal-pt-add-material');
            return ptLoadDB();
        })
        .then(() => ptFilterMaterials())
        .catch(e => { errEl.textContent = e.message; });
};

const ptDoEditMaterial = () => {
    const id = document.getElementById('pt-em-id').value;
    const errEl = document.getElementById('pt-em-error');
    errEl.textContent = '';
    if (!document.getElementById('pt-em-partno').value.trim()) { errEl.textContent = 'Enter a part number'; return; }
    api('/m-materials/' + id, { method: 'PUT', body: _collectMaterialBody('pt-em') })
        .then(() => {
            ptCloseModal('modal-pt-edit-material');
            return ptLoadDB();
        })
        .then(() => ptFilterMaterials())
        .catch(e => { errEl.textContent = e.message; });
};

const ptDeleteMaterial = (id) => {
    const m = ptDB.materials.find(x => x.id === id);
    if (!m) return;
    showModal(`<h3>Delete Material</h3>
        <p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">${esc(m.part_no)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeleteMaterial(${id})">Delete</button></div>`);
};

const ptDoDeleteMaterial = (id) => {
    hideModal();
    api('/m-materials/' + id, { method: 'DELETE' })
        .then(() => ptLoadDB())
        .then(() => ptFilterMaterials())
        .catch(e => { alert(e.message); });
};


// ---------- IMPORT ----------
let ptImportPanelFile = null;
let ptImportMaterialFile = null;

const ptRenderImport = () => {
    const el = document.getElementById('pt-import-content');
    if (!canEdit()) {
        el.innerHTML = '<div class="empty-msg" style="padding:40px">Import is available for admin only.</div>';
        return;
    }

    const buildImportSection = (type, label, animClass) =>
        `<div class="import-section ${animClass}">
            <h3>Import ${label}</h3>
            <div class="section-desc">Upload an Excel file (.xlsx, .xls, .csv)</div>
            <div style="margin-bottom:14px"><a class="btn btn-accent btn-sm" href="/api/m-template/${type}" style="text-decoration:none">&#8681; Download ${label} Template</a></div>
            <div class="drop-zone" id="pt-${type}-drop-zone">
                <div class="drop-icon">&#128196;</div>
                <div class="drop-text">Drag & drop ${label} Excel here</div>
                <div class="drop-hint">or click to browse</div>
                <input type="file" class="file-input" id="pt-${type}-file-input" accept=".xlsx,.xls,.csv" onchange="ptHandleImportFile('${type}',this)">
            </div>
            <div id="pt-${type}-file-info"></div>
            <div id="pt-${type}-preview"></div>
            <div id="pt-${type}-import-result"></div>
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end" id="pt-${type}-import-actions"></div>
        </div>`;

    el.innerHTML = buildImportSection('panels', 'Panel', 'pt-anim-filter') + buildImportSection('materials', 'Material', 'pt-anim-table');
    ptSetupDropZone('pt-panels-drop-zone', 'pt-panels-file-input', 'panels');
    ptSetupDropZone('pt-materials-drop-zone', 'pt-materials-file-input', 'materials');
};

const ptSetupDropZone = (zoneId, inputId, type) => {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const input = document.getElementById(inputId);
        input.files = e.dataTransfer.files;
        ptHandleImportFile(type, input);
    });
};

const ptHandleImportFile = (type, input) => {
    const file = input.files[0];
    if (!file) return;
    if (type === 'panels') ptImportPanelFile = file;
    else ptImportMaterialFile = file;
    ptShowFileInfo(`pt-${type}-file-info`, file);
    ptPreviewFile(file, `pt-${type}-preview`, `pt-${type}-import-actions`, type);
    document.getElementById(`pt-${type}-import-result`).innerHTML = '';
};

const ptShowFileInfo = (containerId, file) => {
    const size = file.size < 1024 ? file.size + ' B'
        : file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / 1048576).toFixed(1) + ' MB';
    document.getElementById(containerId).innerHTML =
        `<div class="file-ready">
            <div class="file-icon">&#128196;</div>
            <div class="file-info">
                <div class="file-name">${esc(file.name)}</div>
                <div class="file-size">${size}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="ptRemoveFile('${containerId}')">&#10005;</button>
        </div>`;
};

const ptRemoveFile = (containerId) => {
    const prefix = containerId.replace('-file-info', '');
    ptImportPanelFile = null;
    ptImportMaterialFile = null;
    document.getElementById(`${prefix}-file-input`).value = '';
    document.getElementById(`${prefix}-preview`).innerHTML = '';
    document.getElementById(`${prefix}-import-result`).innerHTML = '';
    document.getElementById(`${prefix}-import-actions`).innerHTML = '';
    document.getElementById(containerId).innerHTML = '';
};

const ptPreviewFile = (file, previewId, actionsId, type) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (data.length === 0) {
                document.getElementById(previewId).innerHTML = '<div class="empty-msg" style="margin-top:12px">File is empty</div>';
                return;
            }
            const headers = Object.keys(data[0]);
            const previewRows = data.slice(0, 10);
            const fileInfoId = actionsId.replace('-import-actions', '-file-info');

            document.getElementById(previewId).innerHTML =
                `<div style="margin-top:14px;font-size:.85rem;color:var(--main-text3)">Preview (${data.length} rows)</div>
                <div class="import-preview"><table>
                    <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
                    <tbody>${previewRows.map(row =>
                        `<tr>${headers.map(h => `<td>${esc(String(row[h]))}</td>`).join('')}</tr>`
                    ).join('')}${data.length > 10
                        ? `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--main-text3)">... ${data.length - 10} more</td></tr>`
                        : ''}</tbody></table></div>`;

            document.getElementById(actionsId).innerHTML =
                `<button class="btn btn-ghost btn-sm" onclick="ptRemoveFile('${fileInfoId}')">Clear</button>
                 <button class="btn btn-accent" onclick="ptDoImport('${type}')">Import ${data.length} Rows</button>`;
        } catch (err) {
            document.getElementById(previewId).innerHTML = `<div class="error-msg" style="margin-top:12px">${esc(err.message)}</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
};

const ptFileToBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const ptShowImportResult = (containerId, data) => {
    document.getElementById(containerId).innerHTML =
        `<div class="import-result">
            <div class="result-row"><span class="label">Total Rows</span><span class="value">${data.total}</span></div>
            <div class="result-row"><span class="label">Inserted</span><span class="value" style="color:var(--green)">${data.inserted}</span></div>
            <div class="result-row"><span class="label">Skipped</span><span class="value" style="color:var(--yellow)">${data.skipped}</span></div>
            ${data.errors?.length ? `<div class="errors-list">${data.errors.map(e => `<div>&#8226; ${esc(e)}</div>`).join('')}</div>` : ''}
        </div>`;
};

const ptDoImport = async (type) => {
    const file = type === 'panels' ? ptImportPanelFile : ptImportMaterialFile;
    if (!file) return;
    const resultEl = document.getElementById(`pt-${type}-import-result`);
    resultEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--main-text3)">Importing...</div>';
    try {
        const base64 = await ptFileToBase64(file);
        const resp = await api(`/m-import/${type}`, { method: 'POST', body: { filename: file.name, data: base64 } });
        ptShowImportResult(`pt-${type}-import-result`, resp);
        if (type === 'panels') ptImportPanelFile = null;
        else ptImportMaterialFile = null;
        document.getElementById(`pt-${type}-file-input`).value = '';
        document.getElementById(`pt-${type}-file-info`).innerHTML = '';
        document.getElementById(`pt-${type}-preview`).innerHTML = '';
        document.getElementById(`pt-${type}-import-actions`).innerHTML = '';
        await ptLoadDB();
    } catch (e) {
        resultEl.innerHTML = `<div class="error-msg" style="margin-top:12px">${esc(e.message)}</div>`;
    }
};


// ---------- USERS ----------
let usersCurrentPage = 1;
let usersPageSize = 10;

const ptLoadAllUsers = async () => {
    try {
        ptDB.allUsers = await api('/users');
    } catch (e) {
        console.error('Load all users error:', e);
        ptDB.allUsers = [];
    }
};

const ptRenderUsers = () => {
    const addBtn = canEdit() ? '<button class="btn btn-green btn" onclick="ptShowAddUser()">+ Add User</button>' : '';
    const el = document.getElementById('pt-users-content');
    el.innerHTML =
        `<div class="pt-anim-filter filter">
            <input class="input" type="text" placeholder="Search..." id="pt-users-search" oninput="ptFilterUsers()" style="max-width:280px">
            <button class="btn btn-ghost btn-sm" onclick="ptResetUsersFilter()">Reset</button>
            <span id="pt-users-count" style="font-size:.82rem;color:var(--main-text3)"></span>
        </div>
        <div class="pt-anim-head section-head">
            <h3>All Users</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${addBtn}</div>
        </div>
        <div class="pt-anim-table">
            <div id="pt-users-table-area"></div>
        </div>`;
    ptFilterUsers();
};

const _getUserMemberInfo = (u) => {
    const member = u.memberId ? DB.members.find(m => m.id === u.memberId) : null;
    return {
        member,
        posName: member ? getPositionName(member.positionId) : '',
        deptName: member ? getDeptName(member.departmentId) : '',
        sal: member ? latestSalary(member) : 0
    };
};

const _roleBadge = (role) => {
    if (role === 'admin') return '<span class="badge badge-admin">Admin</span>';
    if (role === 'viewer') return '<span class="badge badge-viewer">Viewer</span>';
    return '<span class="badge badge-employee">Employee</span>';
};

const ptFilterUsers = () => {
    const search = (document.getElementById('pt-users-search').value || '').toLowerCase();
    const filtered = (ptDB.allUsers || []).filter(u => {
        if (!search) return true;
        const { posName, deptName, sal } = _getUserMemberInfo(u);
        const haystack = [u.username, u.role, u.memberName, posName, deptName, sal]
            .map(v => String(v || '').toLowerCase()).join(' ');
        return haystack.indexOf(search) !== -1;
    });

    const totalPages = Math.ceil(filtered.length / usersPageSize) || 1;
    if (usersCurrentPage > totalPages) usersCurrentPage = totalPages;
    if (usersCurrentPage < 1) usersCurrentPage = 1;
    const startIdx = (usersCurrentPage - 1) * usersPageSize;
    const pageData = filtered.slice(startIdx, startIdx + usersPageSize);

    const area = document.getElementById('pt-users-table-area');
    if (filtered.length === 0) {
        area.innerHTML = '<div class="empty-msg">No users found</div>';
        return;
    }
    area.innerHTML =
        `<div class="table-wrap"><table>
            <thead><tr><th style="width:50px">No</th><th>Username</th><th>Name</th><th>Position</th><th>Department</th><th>Salary</th><th>Role</th><th style="width:100px">Actions</th></tr></thead>
            <tbody>${pageData.map((u, i) => {
                const { member, posName, deptName, sal } = _getUserMemberInfo(u);
                return `<tr>
                    <td style="font-family:var(--font-m);color:var(--main-text3)">${startIdx + i + 1}</td>
                    <td><strong>${esc(u.username)}</strong></td>
                    <td>${esc(u.memberName || '\u2014')}</td>
                    <td>${esc(posName || '\u2014')}</td>
                    <td>${esc(deptName || '\u2014')}</td>
                    <td>${sal != null && sal > 0 ? `<span class="salary-val">${fmt(sal)}</span>` : '<span class="salary-na">Not set</span>'}</td>
                    <td>${_roleBadge(u.role)}</td>
                    <td>${canEdit()
                        ? `<div style="display:flex;gap:4px">
                            <button class="btn btn-ghost btn-sm" onclick="ptShowEditUser(${u.id})">&#9998;</button>
                            ${u.username !== 'adminMTA' ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ptDeleteUser(${u.id})">&#10005;</button>` : ''}
                          </div>`
                        : '<span style="color:var(--main-text3);font-size:.82rem">View only</span>'}</td>
                </tr>`;
            }).join('')}</tbody></table></div>` +
        ptPagination(filtered.length, usersCurrentPage, usersPageSize, 'goUsersPage', 'changeUsersPageSize');
};

const ptResetUsersFilter = () => {
    document.getElementById('pt-users-search').value = '';
    usersCurrentPage = 1;
    ptFilterUsers();
};

const goUsersPage = (page) => { usersCurrentPage = page; ptFilterUsers(); };
const changeUsersPageSize = (size) => { usersPageSize = parseInt(size); usersCurrentPage = 1; ptFilterUsers(); };

// ---- Scope checkbox helpers ----
const _buildScopeCheckboxes = (className, selectedIds = []) =>
    DB.scopes.map(s => {
        const checked = selectedIds.includes(s.id) ? ' checked' : '';
        return `<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;padding:4px 8px;border:1px solid var(--main-border);border-radius:var(--radius);cursor:pointer">
            <input type="checkbox" class="${className}" value="${s.id}"${checked}> ${esc(s.name)}
        </label>`;
    }).join('');

const _getCheckedScopeIds = (className) =>
    [...document.querySelectorAll(`.${className}:checked`)].map(cb => parseInt(cb.value));

// ---- Add User ----
const ptShowAddUser = () => {
    const posOpts = DB.positions.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const deptOpts = DB.departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Add User</h3>
            <div class="field"><label>Role</label><select class="input" id="pt-adduser-role" onchange="ptToggleAddUserFields()"><option value="employee">Employee</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></div>
            <div id="pt-emp-fields">
                <div class="field"><label>Full Name</label><input class="input" id="pt-adduser-name" placeholder="e.g. John Smith"></div>
                <div class="field"><label>Position</label><select class="input" id="pt-adduser-pos"><option value="">None</option>${posOpts}</select></div>
                <div class="field"><label>Department</label><select class="input" id="pt-adduser-dept"><option value="">None</option>${deptOpts}</select></div>
                <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="pt-adduser-salary" type="number" placeholder="e.g. 15000.00"></div>
            </div>
            <div id="pt-viewer-scope-fields" style="display:none">
                <div class="field"><label>Work Category Access</label>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${_buildScopeCheckboxes('pt-add-viewer-scope-cb')}</div>
                </div>
            </div>
            <div class="field"><label>Username</label><input class="input" id="pt-adduser-user" placeholder="Login username"></div>
            <div class="field"><label>Password</label><input class="input" id="pt-adduser-pass" type="password" placeholder="Min. 6 characters"></div>
            <p class="auth-error" id="pt-adduser-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="ptDoAddUser()">Create</button></div>
    </div>`);
    setTimeout(() => { const el = document.getElementById('pt-adduser-name'); if (el) el.focus(); }, 100);
};

const ptToggleAddUserFields = () => {
    const role = document.getElementById('pt-adduser-role').value;
    document.getElementById('pt-emp-fields').style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    document.getElementById('pt-viewer-scope-fields').style.display = role === 'viewer' ? '' : 'none';
};

const ptDoAddUser = async () => {
    const errEl = document.getElementById('pt-adduser-error');
    const role = document.getElementById('pt-adduser-role').value;
    const name = document.getElementById('pt-adduser-name').value.trim();
    const username = document.getElementById('pt-adduser-user').value.trim();
    const password = document.getElementById('pt-adduser-pass').value;
    const posId = document.getElementById('pt-adduser-pos').value;
    const deptId = document.getElementById('pt-adduser-dept').value;
    const salary = document.getElementById('pt-adduser-salary').value;

    if (!username) { errEl.textContent = 'Username is required'; return; }
    if (!password || password.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }

    try {
        if (role === 'admin') {
            await api('/users', { method: 'POST', body: { username, password, role: 'admin' } });
        } else {
            if (!name) { errEl.textContent = 'Full name is required'; return; }
            const memberResult = await api('/members', {
                method: 'POST',
                body: { name, positionId: posId ? parseInt(posId) : null, departmentId: deptId ? parseInt(deptId) : null }
            });
            const memberId = memberResult.id;
            const userResult = await api('/users', { method: 'POST', body: { username, password, role, memberId } });

            if (salary && parseFloat(salary) > 0) {
                const now = new Date().toISOString().slice(0, 7);
                await api('/salaries', { method: 'PUT', body: { memberId, month: now, amount: parseFloat(salary) } });
            }
            if (role === 'viewer' && userResult?.id) {
                const scopeIds = _getCheckedScopeIds('pt-add-viewer-scope-cb');
                if (scopeIds.length > 0) {
                    await api('/viewer-scopes/' + userResult.id, { method: 'PUT', body: { scopeIds } });
                }
            }
        }
        hideModal();
        ptLoadAllUsers().then(() => loadDB()).then(() => ptFilterUsers());
    } catch (e) { errEl.textContent = e.message; }
};

// ---- Edit User ----
const ptShowEditUser = (userId) => {
    const user = (ptDB.allUsers || []).find(u => u.id === userId);
    if (!user) return;
    const member = user.memberId ? DB.members.find(m => m.id === user.memberId) : null;

    const posOpts = DB.positions.map(p => {
        const sel = member && member.positionId === p.id ? ' selected' : '';
        return `<option value="${p.id}"${sel}>${esc(p.name)}</option>`;
    }).join('');
    const deptOpts = DB.departments.map(d => {
        const sel = member && member.departmentId === d.id ? ' selected' : '';
        return `<option value="${d.id}"${sel}>${esc(d.name)}</option>`;
    }).join('');
    const curSal = member ? latestSalary(member) : 0;
    const existing = (DB.viewerScopes || {})[user.id] || [];

    showModal(`
    <div style="max-height:85vh;display:flex;flex-direction:column">
        <div style="flex:1;min-height:0;overflow-y:auto">
            <h3>Edit — ${esc(user.username)}</h3>
            <div id="pt-edit-member-fields" ${user.role === 'admin' ? 'style="display:none"' : ''}>
                <div class="field"><label>Full Name</label><input class="input" id="pt-edituser-name" value="${member ? esc(member.name) : ''}"></div>
                <div class="field"><label>Position</label><select class="input" id="pt-edituser-pos"><option value="">None</option>${posOpts}</select></div>
                <div class="field"><label>Department</label><select class="input" id="pt-edituser-dept"><option value="">None</option>${deptOpts}</select></div>
                <div class="field"><label>Monthly Salary</label><input class="input input-mono" id="pt-edituser-salary" type="number" value="${curSal > 0 ? curSal : ''}" placeholder="e.g. 15000.00"></div>
            </div>
            <div id="pt-edit-viewer-scope-fields" ${user.role !== 'viewer' ? 'style="display:none"' : ''}>
                <div class="field"><label>Work Category Access</label>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${_buildScopeCheckboxes('pt-viewer-scope-cb', existing)}</div>
                </div>
            </div>
            <div class="field"><label>Username</label><input class="input" id="pt-edituser-user" value="${esc(user.username)}"></div>
            <div class="field"><label>New Password (blank = keep)</label><input class="input" id="pt-edituser-pass" type="password" placeholder="Leave blank"></div>
            <div class="field"><label>Role</label><select class="input" id="pt-edituser-role" onchange="ptToggleEditUserFields()">
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee</option>
            </select></div>
            <p class="auth-error" id="pt-edituser-error"></p>
        </div>
        <div style="flex-shrink:0;margin-top:16px" class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-accent" onclick="ptDoEditUser(${user.id})">Save</button></div>
    </div>`);
};

const ptToggleEditUserFields = () => {
    const role = document.getElementById('pt-edituser-role').value;
    const memberFields = document.getElementById('pt-edit-member-fields');
    const viewerFields = document.getElementById('pt-edit-viewer-scope-fields');
    if (memberFields) memberFields.style.display = (role === 'employee' || role === 'viewer') ? '' : 'none';
    if (viewerFields) viewerFields.style.display = role === 'viewer' ? '' : 'none';
};

const ptDoEditUser = async (userId) => {
    const user = (ptDB.allUsers || []).find(u => u.id === userId);
    if (!user) return;
    const errEl = document.getElementById('pt-edituser-error');
    const newUsername = document.getElementById('pt-edituser-user').value.trim();
    const newPass = document.getElementById('pt-edituser-pass').value;
    const newRole = document.getElementById('pt-edituser-role').value;
    if (!newUsername) { errEl.textContent = 'Username cannot be empty'; return; }
    if (newPass && newPass.length < 6) { errEl.textContent = 'Min 6 characters'; return; }

    try {
        // Create member if converting admin → employee/viewer
        let memberId = user.memberId;
        if (!memberId && (newRole === 'employee' || newRole === 'viewer')) {
            const name = document.getElementById('pt-edituser-name')?.value.trim();
            if (!name) { errEl.textContent = 'Enter a name'; return; }
            const posId = document.getElementById('pt-edituser-pos')?.value;
            const deptId = document.getElementById('pt-edituser-dept')?.value;
            const sal = parseFloat(document.getElementById('pt-edituser-salary')?.value) || 0;

            const memberResult = await api('/members', {
                method: 'POST',
                body: { name, positionId: posId ? parseInt(posId) : null, departmentId: deptId ? parseInt(deptId) : null }
            });
            memberId = memberResult.id;

            if (sal > 0) {
                const now = new Date().toISOString().slice(0, 7);
                await api('/salaries', { method: 'PUT', body: { memberId, month: now, amount: sal } });
            }
        }

        // Update user
        await api('/users/' + userId, {
            method: 'PUT',
            body: { username: newUsername, password: newPass || null, role: newRole, memberId }
        });

        // Update member
        if (memberId && (newRole === 'employee' || newRole === 'viewer')) {
            const name = document.getElementById('pt-edituser-name')?.value.trim() || null;
            const posId = document.getElementById('pt-edituser-pos')?.value;
            const deptId = document.getElementById('pt-edituser-dept')?.value;

            if (name || posId !== undefined || deptId !== undefined) {
                const member = DB.members.find(m => m.id === memberId);
                await api('/members/' + memberId, {
                    method: 'PUT',
                    body: {
                        name: name || (member ? member.name : ''),
                        positionId: posId ? parseInt(posId) : (member ? member.positionId : null),
                        departmentId: deptId ? parseInt(deptId) : (member ? member.departmentId : null)
                    }
                });
            }

            const salEl = document.getElementById('pt-edituser-salary');
            if (salEl) {
                const val = parseFloat(salEl.value);
                const now = new Date().toISOString().slice(0, 7);
                await api('/salaries', { method: 'PUT', body: { memberId, month: now, amount: (!isNaN(val) && val > 0) ? val : 0 } });
            }
        }

        // Save viewer scopes
        if (newRole === 'viewer') {
            const scopeIds = _getCheckedScopeIds('pt-viewer-scope-cb');
            await api('/viewer-scopes/' + userId, { method: 'PUT', body: { scopeIds } });
        }

        hideModal();
        ptLoadAllUsers().then(() => loadDB()).then(() => ptFilterUsers());
    } catch (e) { errEl.textContent = e.message; }
};

const ptDeleteUser = (id) => {
    const u = (ptDB.allUsers || []).find(x => x.id === id);
    if (!u) return;
    showModal(`<h3>Delete User</h3>
        <p style="color:var(--main-text2);line-height:1.6">Are you sure you want to delete <strong style="color:var(--main-text)">${esc(u.username)}</strong>?</p>
        <div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="ptDoDeleteUser(${id})">Delete</button></div>`);
};

const ptDoDeleteUser = (id) => {
    hideModal();
    api('/users/' + id, { method: 'DELETE' })
        .then(() => ptLoadAllUsers())
        .then(() => loadDB())
        .then(() => ptFilterUsers())
        .catch(e => alert(e.message));
};

/* ==========================================================
   Mouse hover table show description
   ========================================================== */
// 自动给 table td 加 tooltip（桌面 hover + 手机 tap）
document.addEventListener('mouseover', (e) => {
    const td = e.target.closest('table tbody td');
    if (!td || td.title) return;
    if (td.querySelector('button, .actions-cell, .btn-icon, input, select')) return;
    const text = td.textContent.trim();
    if (text && text !== '—') td.title = text;
});

// 手机 tap 显示完整内容
let _mobileTooltip = null;
const _hideMobileTooltip = () => {
    if (_mobileTooltip) { _mobileTooltip.remove(); _mobileTooltip = null; }
};

document.addEventListener('touchstart', (e) => {
    const td = e.target.closest('table tbody td');
    if (!td) { _hideMobileTooltip(); return; }
    if (td.querySelector('button, .actions-cell, .btn-icon, input, select')) return;

    const text = td.textContent.trim();
    if (!text || text === '—') return;

    // 检查是否被截断
    if (td.scrollWidth <= td.offsetWidth + 2) return;

    _hideMobileTooltip();

    const tip = document.createElement('div');
    tip.textContent = text;
    tip.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,.85);
        color: #fff;
        padding: 10px 18px;
        border-radius: 10px;
        font-size: .82rem;
        max-width: 85vw;
        word-break: break-word;
        text-align: center;
        z-index: 10001;
        box-shadow: 0 4px 16px rgba(0,0,0,.3);
        animation: toastIn .2s ease;
        pointer-events: none;
    `;
    document.body.appendChild(tip);
    _mobileTooltip = tip;

    setTimeout(_hideMobileTooltip, 2500);
}, { passive: true });

// 点别的地方关闭
document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('table')) _hideMobileTooltip();
}, { passive: true });

/* ==========================================================
   Pre-load data on page load
   ========================================================== */

// ===== INITIALIZATION =====
(async () => {
    const saved = localStorage.getItem('multitrade_session');

    const activateNav = (navId, page) => {
        document.querySelectorAll(`#${navId} .nav-item`).forEach(n => {
            n.classList.remove('active');
            const handler = n.getAttribute('onclick') || '';
            if (handler.includes("'" + page + "'")) n.classList.add('active');
        });
    };

    if (!saved) {
        document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
        document.getElementById('login-page').classList.add('active');
        return;
    }

    try {
        currentUser = JSON.parse(saved);
    } catch (e) {
        localStorage.removeItem('multitrade_session');
        document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));
        document.getElementById('login-page').classList.add('active');
        return;
    }

    const savedModule = localStorage.getItem('multitrade_module') || 'attendance';
    selectedModule = savedModule;

    document.querySelectorAll('.auth-page,.app-layout').forEach(p => p.classList.remove('active'));

    if (savedModule === 'panel') {
        try {
            await ptLoadDB();
            document.getElementById('panel-layout').classList.add('active');
            document.getElementById('pt-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('pt-user-name').textContent = currentUser.username;

            const isViewer = currentUser.role === 'viewer';
            _setRoleLabel('panel-layout', isViewer ? 'Viewer' : 'Admin');

            let page = localStorage.getItem('multitrade_pt_page') || 'pt-dashboard';
            if (isViewer && (page === 'pt-import' || page === 'pt-users')) page = 'pt-dashboard';
            activateNav('pt-nav', page);
            ptNav(page);
            applyNavPermissions();
        } catch (e) {
            console.error('Panel load error:', e);
            document.getElementById('panel-layout').classList.add('active');
            document.getElementById('pt-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('pt-user-name').textContent = currentUser.username;
            ptNav('pt-dashboard');
            applyNavPermissions();
        }
    } else {
        try {
            await loadDB();
            if (currentUser.role === 'admin' || currentUser.role === 'viewer') {
                document.getElementById('admin-layout').classList.add('active');

                const isViewer = currentUser.role === 'viewer';
                _setRoleLabel('admin-layout', isViewer ? 'Viewer' : 'Administrator');

                let page = localStorage.getItem('multitrade_admin_page') || 'projects';
                if (isViewer && ['users', 'departments', 'positions'].includes(page)) page = 'projects';
                activateNav('admin-nav', page);
                await adminNav(page);
            } else {
                document.getElementById('employee-layout').classList.add('active');
                const page = localStorage.getItem('multitrade_emp_page') || 'myprojects';
                activateNav('emp-nav', page);
                await empNav(page);
            }
            applyNavPermissions();
            updateAvatars();
        } catch (e) {
            console.error('Attendance load error:', e);
            document.getElementById('login-page').classList.add('active');
        }
    }
})();

// ← file end, empty from here
