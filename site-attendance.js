/* ==========================================================
   SITE ATTENDANCE — Independent Module
   ========================================================== */

var SA_DB = { employees: [], projects: [], scopes: [] };
var saEmpCurrentPage = 1, saEmpPageSize = 10, saEmpFilteredData = [];

async function saLoadDB() {
    try {
        var data = await api('/site-attendance/load');
        SA_DB.employees = (data.employees || []).map(function(e) {
            return { id: e.id, name: e.name, nric: e.nric, company: e.company, phone: e.phone, status: e.status, remark: e.remark, createdAt: e.created_at };
        });
        SA_DB.projects = (data.projects || []).map(function(p) {
            return { id: p.id, name: p.name, categoryId: p.category_id };
        });
        SA_DB.scopes = (data.scopes || []).map(function(s) {
            return { id: s.id, name: s.name };
        });
    } catch (e) {
        console.error('SA load failed:', e);
    }
}


// ── Navigation ──
function saNav(tab, el) {
    localStorage.setItem('multitrade_sa_page', tab);
    document.querySelectorAll('#sa-layout .sa-view').forEach(function(v) { v.style.display = 'none'; });
    var target = document.getElementById('sa-' + tab);
    if (target) target.style.display = '';

    var nav = document.getElementById('sa-nav');
    if (nav) nav.querySelectorAll('.nav-item').forEach(function(n) {
        n.classList.toggle('active', n.dataset.page === tab);
    });

    switch (tab) {
        case 'sa-employees': renderSAEmployees(); break;
        case 'sa-print': renderSAPrint(); break;
    }
}

/* ==========================================================
   PRINT SHEET
   ========================================================== */
//search employee function
function saFilterEmpChecklist() {
    var searchEl = document.getElementById('sa-emp-checklist-search');
    if (!searchEl) return;
    var typed = searchEl.value.trim().toLowerCase();

    document.querySelectorAll('#sa-emp-checklist .sa-emp-row').forEach(function(row) {
        var text = row.getAttribute('data-search') || '';
        var isMatch = !typed || text.indexOf(typed) !== -1;
        row.style.display = isMatch ? 'flex' : 'none';
    });
}

function renderSAPrint() {
    var el = document.getElementById('sa-sa-print');
    if (!el) return;

    var activeEmps = SA_DB.employees.filter(function(e) { return e.status === 'active'; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });

    // Resolve category IDs by name (Panel Build / Project), then dedupe "Other"
    var targetNames = ['panel build', 'project'];
    var allowedCategoryIds = (SA_DB.scopes || [])
        .filter(function(s) {
            var n = (s.name || '').trim().toLowerCase();
            return targetNames.indexOf(n) !== -1;
        })
        .map(function(s) { return s.id; });

    var seenOther = false;
    var filteredProjects = SA_DB.projects
        .filter(function(p) { return allowedCategoryIds.indexOf(p.categoryId) !== -1; })
        .filter(function(p) {
            if (p.name.trim().toLowerCase() === 'other') {
                if (seenOther) return false;
                seenOther = true;
            }
            return true;
        })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });

    // Store globally so the dropdown filter function can access it without rebuilding HTML
    window._saProjectList = filteredProjects;

    var checkboxes = activeEmps.map(function(e) {
        var searchText = (e.name + ' ' + (e.company || '')).toLowerCase();
        return '<label class="sa-emp-row" data-search="' + esc(searchText) + '" style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-radius:6px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'var(--main-bg)\'" onmouseout="this.style.background=\'\'">'
            + '<input type="checkbox" class="sa-emp-cb" value="' + e.id + '" style="accent-color:var(--accent)" onchange="saAutoPreview()">'
            + '<span style="font-size:.85rem">' + esc(e.name) + '</span>'
            + '<span style="font-size:.72rem;color:var(--main-text3);margin-left:auto">' + esc(e.company || '') + '</span>'
            + '</label>';
    }).join('');

    el.innerHTML = ''
        + '<div class="app-header">'
        + '<h2>Print Attendance Sheet</h2>'
        + '<div class="header-sub">Select employees and generate A4 attendance sheet</div>'
        + '</div>'
        + '<div class="app-body">'

        // Sheet Information
        + '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;margin-bottom:20px">'
        + '<h3 style="margin:0 0 16px;font-size:.95rem;font-family:var(--font-d)">Sheet Information (Optional)</h3>'
        + '<div class="sa-form-grid">'
        + '<div class="field"><label>Title</label><input class="input" id="sa-print-title" placeholder="e.g. Safety Toolbox Meeting" oninput="saAutoPreview()"></div>'
        + '<div class="field" style="position:relative">'
        + '<label>For Project</label>'
        + '<input class="input" id="sa-print-project-search" placeholder="Search or click to select..." autocomplete="off" '
        +   'oninput="saClearProjectIfTyping();saFilterProjectDropdown();saAutoPreview()" onfocus="saFilterProjectDropdown()">'
        + '<input type="hidden" id="sa-print-project">'
        + '<div id="sa-project-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;'
        +   'background:var(--main-surface);border:1px solid var(--main-border);border-radius:8px;'
        +   'max-height:220px;overflow-y:auto;margin-top:4px;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>'
        + '</div>'
        + '<div class="field"><label>Date &amp; Time</label><input class="input" id="sa-print-datetime" type="date" onchange="saAutoPreview()"></div>'
        + '<div class="field"><label>Place</label><input class="input" id="sa-print-place" placeholder="e.g. Site Store Room" oninput="saAutoPreview()"></div>'
        + '<div class="field" style="grid-column:1/-1"><label>Conducted / Chaired by</label><input class="input" id="sa-print-conducted" placeholder="e.g. Ahmad bin Hassan" oninput="saAutoPreview()"></div>'
        + '</div>'
        // Employee Selection
        + '<h3 style="margin:24px 0 16px;padding-top:16px;border-top:1px solid var(--main-border);font-size:.95rem;font-family:var(--font-d)">Select Employees</h3>'
        + '<div style="display:flex;gap:20px;margin-bottom:16px">'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="sa-print-mode" value="all" checked onchange="saTogglePrintMode();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">All Employees</span></label>'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="sa-print-mode" value="selected" onchange="saTogglePrintMode();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">Selected</span></label>'
        + '</div>'
        + '<div id="sa-emp-checklist" style="display:none">'
        + '<input type="text" class="input" id="sa-emp-checklist-search" placeholder="Search employee name or company..." oninput="saFilterEmpChecklist()" style="margin-bottom:8px;width:100%">'
        + '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--main-border);border-radius:8px;padding:8px">'
        + '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--main-border);margin-bottom:4px;cursor:pointer"><input type="checkbox" id="sa-select-all" onchange="saToggleSelectAll();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">Select All</span></label>'
        + '<div id="sa-emp-checklist-items">' + checkboxes + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'

        // Print Preview Area (now INSIDE app-body, same width as boxes above)
        + '<div id="sa-print-area-wrapper" style="display:none">'
        + '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px" class="sa-no-print">'
        + '<h3 style="margin:0;font-size:.95rem;font-family:var(--font-d)">Preview</h3>'
        + '<div id="sa-preview-pagination" class="sa-preview-pagination" style="display:none;flex:1;justify-content:center"></div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<label style="font-size:.82rem;color:var(--main-text2)">Rows per page:</label>'
        + '<select id="sa-rows-per-page" class="input" style="width:60px;padding:4px 8px;font-size:.82rem" onchange="saChangeRowsPerPage()">'
        + '<option value="20">20</option>'
        + '<option value="50">50</option>'
        + '<option value="100">100</option>'
        + '<option value="all">All</option>'
        + '</select>'
        + '<button class="btn btn-blue" onclick="saDoPrint()">Print</button>'
        + '</div>'
        + '</div>'
        + '<div id="sa-print-scroll" class="sa-print-scroll">'
        + '<div id="sa-print-area"></div>'
        + '</div>'
        + '</div>'
        + '</div>'

    + '</div>'; // closes app-body

    // Close dropdown when clicking outside of it
    document.addEventListener('click', saCloseProjectDropdownOutside);

    // Show an initial preview automatically (all employees by default)
    saAutoPreview();
}

// Filters and renders the dropdown list below the search input
function saFilterProjectDropdown() {
    var searchEl = document.getElementById('sa-print-project-search');
    var dropdownEl = document.getElementById('sa-project-dropdown');
    if (!searchEl || !dropdownEl) return;

    var typed = searchEl.value.trim().toLowerCase();
    var list = window._saProjectList || [];

    var matches = typed
        ? list.filter(function(p) { return p.name.toLowerCase().indexOf(typed) !== -1; })
        : list;

    if (!matches.length) {
        dropdownEl.innerHTML = '<div style="padding:10px 12px;font-size:.82rem;color:var(--main-text3)">No matches</div>';
    } else {
        dropdownEl.innerHTML = matches.map(function(p) {
            return '<div class="sa-project-option" style="padding:8px 12px;font-size:.85rem;cursor:pointer" '
                + 'onmouseover="this.style.background=\'var(--main-bg)\'" onmouseout="this.style.background=\'\'" '
                + 'onmousedown="event.preventDefault();saSelectProject(' + p.id + ', \'' + esc(p.name).replace(/'/g, "\\'") + '\')">'
                + esc(p.name) + '</div>';
        }).join('');
    }

    dropdownEl.style.display = '';
}

// Called when a dropdown item is clicked
function saSelectProject(id, name) {
    var searchEl = document.getElementById('sa-print-project-search');
    var hiddenEl = document.getElementById('sa-print-project');
    var dropdownEl = document.getElementById('sa-project-dropdown');
    if (searchEl) searchEl.value = name;
    if (hiddenEl) hiddenEl.value = id;
    if (dropdownEl) dropdownEl.style.display = 'none';
    saAutoPreview();
}

// Closes the dropdown if the user clicks anywhere outside it
function saCloseProjectDropdownOutside(e) {
    var dropdownEl = document.getElementById('sa-project-dropdown');
    var searchEl = document.getElementById('sa-print-project-search');
    if (!dropdownEl || !searchEl) return;
    if (e.target === searchEl || dropdownEl.contains(e.target)) return;
    dropdownEl.style.display = 'none';
}

function saTogglePrintMode() {
    var mode = 'all';
    var checked = document.querySelector('input[name="sa-print-mode"]:checked');
    if (checked) mode = checked.value;
    var cl = document.getElementById('sa-emp-checklist');
    if (cl) cl.style.display = mode === 'selected' ? '' : 'none';
}

function saToggleSelectAll() {
    var allCb = document.getElementById('sa-select-all');
    if (!allCb) return;
    var checked = allCb.checked;
    document.querySelectorAll('.sa-emp-cb').forEach(function(cb) { cb.checked = checked; });
}

var _saAutoPreviewTimer = null;
function saAutoPreview() {
    clearTimeout(_saAutoPreviewTimer);
    _saAutoPreviewTimer = setTimeout(function() {
        saPreviewPrint();
    }, 200);
}

function saPreviewPrint() {
    var mode = 'all';
    var checked = document.querySelector('input[name="sa-print-mode"]:checked');
    if (checked) mode = checked.value;
    var selectedEmps;

    if (mode === 'all') {
        selectedEmps = SA_DB.employees.filter(function(e) { return e.status === 'active'; })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });
    } else {
        var checkedIds = [];
        document.querySelectorAll('.sa-emp-cb:checked').forEach(function(cb) { checkedIds.push(parseInt(cb.value)); });
        selectedEmps = SA_DB.employees.filter(function(e) { return checkedIds.indexOf(e.id) !== -1; })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });
    }

    var title = '';
    var tEl = document.getElementById('sa-print-title');
    if (tEl) title = tEl.value;

    var project = '';
    var projId = '';
    var hiddenEl = document.getElementById('sa-print-project');
    var searchEl = document.getElementById('sa-print-project-search');
    if (hiddenEl) projId = hiddenEl.value;
    if (projId) {
        for (var i = 0; i < SA_DB.projects.length; i++) {
            if (SA_DB.projects[i].id === parseInt(projId)) { project = SA_DB.projects[i].name; break; }
        }
    }
    // 如果没有选中 ID 但搜索框有文字，直接用搜索框文字
    if (!project && searchEl && searchEl.value.trim()) {
        project = searchEl.value.trim();
    }

    var dtRaw = '';
    var dtEl = document.getElementById('sa-print-datetime');
    if (dtEl) dtRaw = dtEl.value;
    var datetime = '';
    if (dtRaw) {
        var d = new Date(dtRaw + 'T00:00:00');
        datetime = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    }

    var place = '';
    var plEl = document.getElementById('sa-print-place');
    if (plEl) place = plEl.value;

    var conducted = '';
    var cEl = document.getElementById('sa-print-conducted');
    if (cEl) conducted = cEl.value;

    window._saAllEmps = selectedEmps;
    window._saPrintMeta = {
        title: title,
        project: project,
        datetime: datetime,
        place: place,
        conducted: conducted
    };
    window._saCurrentPage = 0;

    saBuildPreviewPages();
    saRenderPreviewPage(0);

    var wrapper = document.getElementById('sa-print-area-wrapper');
    wrapper.style.display = '';
}

function saBuildPreviewPages() {
    var selectedEmps = window._saAllEmps || [];
    var rowsSelect = document.getElementById('sa-rows-per-page');
    var rowsPerPage = rowsSelect ? rowsSelect.value : '20';

    var pages = [];

    if (rowsPerPage === 'all') {
        // 全部放在一页
        pages.push({ isFirst: true, emps: selectedEmps });
    } else {
        var size = parseInt(rowsPerPage) || 20;
        var remaining = selectedEmps.slice();

        // 第一页
        var firstBatch = remaining.splice(0, size);
        pages.push({ isFirst: true, emps: firstBatch });

        // 后续页
        while (remaining.length > 0) {
            var batch = remaining.splice(0, size);
            pages.push({ isFirst: false, emps: batch });
        }
    }

    if (pages.length === 0) {
        pages.push({ isFirst: true, emps: [] });
    }

    window._saPrintPages = pages;
}

function saChangeRowsPerPage() {
    // 换每页行数时，重新分页并回到第一页
    saBuildPreviewPages();
    saRenderPreviewPage(0);
}

function saRenderPreviewPage(pageIndex) {
    var pages = window._saPrintPages || [];
    var meta = window._saPrintMeta || {};
    if (!pages.length) return;

    pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    window._saCurrentPage = pageIndex;

    var page = pages[pageIndex];
    var tableHtml = '';

    // Header 只在第一页显示
    if (page.isFirst) {
        tableHtml += '<table class="sa-print-info">';
        tableHtml += '<tr><th colspan="2" class="sa-pt-title">ATTENDANCE NAME LIST</th></tr>';
        tableHtml += '<tr><td class="sa-pt-label">Title</td><td class="sa-pt-value">' + esc(meta.title || '') + '</td></tr>';
        tableHtml += '<tr><td class="sa-pt-label">For Project</td><td class="sa-pt-value">' + esc(meta.project || '') + '</td></tr>';
        tableHtml += '<tr><td class="sa-pt-label">Date &amp; Time</td><td class="sa-pt-value">' + esc(meta.datetime || '') + '</td></tr>';
        tableHtml += '<tr><td class="sa-pt-label">Place</td><td class="sa-pt-value">' + esc(meta.place || '') + '</td></tr>';
        tableHtml += '<tr><td class="sa-pt-label">Conducted/Chaired by</td><td class="sa-pt-value">' + esc(meta.conducted || '') + '</td></tr>';
        tableHtml += '</table>';
    }

    // 员工表格
    tableHtml += '<table class="sa-print-table"' + (page.isFirst ? ' style="margin-top:-1px"' : '') + '>';
    tableHtml += '<colgroup>';
    tableHtml += '<col style="width:6%"><col style="width:32%"><col style="width:18%"><col style="width:24%"><col style="width:20%">';
    tableHtml += '</colgroup>';

    tableHtml += '<tr>';
    tableHtml += '<th class="sa-pt-no">S/No.</th>';
    tableHtml += '<th class="sa-pt-name">Name</th>';
    tableHtml += '<th class="sa-pt-nric">NRIC/Passport</th>';
    tableHtml += '<th class="sa-pt-company">Company</th>';
    tableHtml += '<th class="sa-pt-sig">Signature</th>';
    tableHtml += '</tr>';

    // 连续编号
    var startNo = 1;
    for (var p = 0; p < pageIndex; p++) {
        startNo += pages[p].emps.length;
    }

    var displayRows = page.emps.length;
    if (pageIndex === pages.length - 1) {
        displayRows = Math.max(page.emps.length, 10);
    }

    for (var i = 0; i < displayRows; i++) {
        var emp = page.emps[i];
        var isLastRow = (i === displayRows - 1);
        tableHtml += '<tr' + (isLastRow ? ' class="sa-pt-lastrow"' : '') + '>';
        tableHtml += '<td class="sa-pt-no">' + (startNo + i) + '</td>';
        tableHtml += '<td class="sa-pt-name">' + (emp ? esc(emp.name) : '&nbsp;') + '</td>';
        tableHtml += '<td class="sa-pt-nric">' + (emp ? esc(emp.nric || '') : '&nbsp;') + '</td>';
        tableHtml += '<td class="sa-pt-company">' + (emp ? esc(emp.company || '') : '&nbsp;') + '</td>';
        tableHtml += '<td class="sa-pt-sig">&nbsp;</td>';
        tableHtml += '</tr>';
    }

    tableHtml += '</table>';

    document.getElementById('sa-print-area').innerHTML = tableHtml;

    // 分页控件 — 放到上面 header，不再放在表格下方
    var pagEl = document.getElementById('sa-preview-pagination');
    if (pagEl) {
        if (pages.length > 1) {
            pagEl.style.display = 'flex';
            pagEl.style.alignItems = 'center';
            pagEl.style.justifyContent = 'center';
            pagEl.style.gap = '10px';

            var prevDisabled = pageIndex === 0;
            var nextDisabled = pageIndex === pages.length - 1;

            var baseStyle = 'padding:6px 16px;white-space:nowrap;font-size:.82rem;border:1px solid #60a5fa;border-radius:6px;color:#fff;transition:letter-spacing .15s,background .15s;';

            var prevStyle = baseStyle
                + (prevDisabled
                    ? 'background:linear-gradient(135deg,#94a3b8,#cbd5e1);border-color:#cbd5e1;opacity:.6;cursor:not-allowed'
                    : 'background:linear-gradient(135deg,#1d4ed8,#2563eb);cursor:pointer');

            var nextStyle = baseStyle
                + (nextDisabled
                    ? 'background:linear-gradient(135deg,#94a3b8,#cbd5e1);border-color:#cbd5e1;opacity:.6;cursor:not-allowed'
                    : 'background:linear-gradient(135deg,#1d4ed8,#2563eb);cursor:pointer');

            var prevHover = prevDisabled ? '' :
                ' onmouseover="this.style.background=\'linear-gradient(135deg,#2563eb,#3b82f6)\';this.style.letterSpacing=\'.04em\'"'
                + ' onmouseout="this.style.background=\'linear-gradient(135deg,#1d4ed8,#2563eb)\';this.style.letterSpacing=\'normal\'"';

            var nextHover = nextDisabled ? '' :
                ' onmouseover="this.style.background=\'linear-gradient(135deg,#2563eb,#3b82f6)\';this.style.letterSpacing=\'.04em\'"'
                + ' onmouseout="this.style.background=\'linear-gradient(135deg,#1d4ed8,#2563eb)\';this.style.letterSpacing=\'normal\'"';

            pagEl.innerHTML = ''
                + '<button style="' + prevStyle + '"' + prevHover + ' onclick="saChangePreviewPage(-1)" ' + (prevDisabled ? 'disabled' : '') + '>← Previous</button>'
                + '<span class="sa-page-info" style="font-size:.82rem;color:var(--main-text2);white-space:nowrap">Page ' + (pageIndex + 1) + ' / ' + pages.length + '</span>'
                + '<button style="' + nextStyle + '"' + nextHover + ' onclick="saChangePreviewPage(1)" ' + (nextDisabled ? 'disabled' : '') + '>Next →</button>';
        } else {
            pagEl.style.display = 'none';
            pagEl.innerHTML = '';
        }
    }
}

function saChangePreviewPage(delta) {
    var newPage = (window._saCurrentPage || 0) + delta;
    saRenderPreviewPage(newPage);
}

function saClearProjectIfTyping() {
    var searchEl = document.getElementById('sa-print-project-search');
    var hiddenEl = document.getElementById('sa-print-project');
    if (!searchEl || !hiddenEl) return;

    // 如果搜索框是空的，或者跟已选的项目名不一样，就清除选中
    if (!searchEl.value.trim()) {
        hiddenEl.value = '';
    } else {
        var selectedId = hiddenEl.value;
        if (selectedId) {
            var proj = null;
            for (var i = 0; i < SA_DB.projects.length; i++) {
                if (SA_DB.projects[i].id === parseInt(selectedId)) { proj = SA_DB.projects[i]; break; }
            }
            if (!proj || proj.name.toLowerCase().indexOf(searchEl.value.trim().toLowerCase()) === -1) {
                hiddenEl.value = '';
            }
        }
    }
}

function saDoPrint() {
    // Cancel any pending debounce and force an immediate refresh first,
    // so print always uses the latest selection/filters — not stale data
    clearTimeout(_saAutoPreviewTimer);
    saPreviewPrint();

    var allEmps = window._saAllEmps || [];
    var meta = window._saPrintMeta || {};

    if (!allEmps.length && !window._saPrintPages) {
        window.print();
        return;
    }

    // 打印用的固定分页容量，跟预览的 "Rows per page" 下拉无关
    var PRINT_ROWS_FIRST_PAGE = 20;   // 第一页有表头资料，位置较少
    var PRINT_ROWS_OTHER_PAGE = 25;   // 后续页

    var printPages = [];
    var remaining = allEmps.slice();

    var firstBatch = remaining.splice(0, PRINT_ROWS_FIRST_PAGE);
    printPages.push({ isFirst: true, emps: firstBatch });

    while (remaining.length > 0) {
        var batch = remaining.splice(0, PRINT_ROWS_OTHER_PAGE);
        printPages.push({ isFirst: false, emps: batch });
    }

    if (printPages.length === 0) {
        printPages.push({ isFirst: true, emps: [] });
    }

    var tableHtml = '';

    printPages.forEach(function(page, pageIndex) {
        tableHtml += '<div class="sa-print-page">';

        if (page.isFirst) {
            tableHtml += '<table class="sa-print-info">';
            tableHtml += '<tr><th colspan="2" class="sa-pt-title">ATTENDANCE NAME LIST</th></tr>';
            tableHtml += '<tr><td class="sa-pt-label">Title</td><td class="sa-pt-value">' + esc(meta.title || '') + '</td></tr>';
            tableHtml += '<tr><td class="sa-pt-label">For Project</td><td class="sa-pt-value">' + esc(meta.project || '') + '</td></tr>';
            tableHtml += '<tr><td class="sa-pt-label">Date &amp; Time</td><td class="sa-pt-value">' + esc(meta.datetime || '') + '</td></tr>';
            tableHtml += '<tr><td class="sa-pt-label">Place</td><td class="sa-pt-value">' + esc(meta.place || '') + '</td></tr>';
            tableHtml += '<tr><td class="sa-pt-label">Conducted/Chaired by</td><td class="sa-pt-value">' + esc(meta.conducted || '') + '</td></tr>';
            tableHtml += '</table>';
        }

        tableHtml += '<table class="sa-print-table"' + (page.isFirst ? ' style="margin-top:-1px"' : '') + '>';
        tableHtml += '<colgroup>';
        tableHtml += '<col style="width:8%"><col style="width:32%"><col style="width:18%"><col style="width:22%"><col style="width:20%">';
        tableHtml += '</colgroup>';

        tableHtml += '<tr>';
        tableHtml += '<th class="sa-pt-no">S/No.</th>';
        tableHtml += '<th class="sa-pt-name">Name</th>';
        tableHtml += '<th class="sa-pt-nric">NRIC/Passport</th>';
        tableHtml += '<th class="sa-pt-company">Company</th>';
        tableHtml += '<th class="sa-pt-sig">Signature</th>';
        tableHtml += '</tr>';

        var startNo = 1;
        for (var p = 0; p < pageIndex; p++) {
            startNo += printPages[p].emps.length;
        }

        var displayRows = page.isFirst ? PRINT_ROWS_FIRST_PAGE : PRINT_ROWS_OTHER_PAGE;
        if (pageIndex === printPages.length - 1) {
            displayRows = Math.max(page.emps.length, 10);
        }

        for (var i = 0; i < displayRows; i++) {
            var emp = page.emps[i];
            var isLastRow = (i === displayRows - 1);
            tableHtml += '<tr' + (isLastRow ? ' class="sa-pt-lastrow"' : '') + '>';
            tableHtml += '<td class="sa-pt-no">' + (startNo + i) + '</td>';
            tableHtml += '<td class="sa-pt-name">' + (emp ? esc(emp.name) : '&nbsp;') + '</td>';
            tableHtml += '<td class="sa-pt-nric">' + (emp ? esc(emp.nric || '') : '&nbsp;') + '</td>';
            tableHtml += '<td class="sa-pt-company">' + (emp ? esc(emp.company || '') : '&nbsp;') + '</td>';
            tableHtml += '<td class="sa-pt-sig">&nbsp;</td>';
            tableHtml += '</tr>';
        }

        tableHtml += '</table>';
        tableHtml += '</div>';
    });

    document.getElementById('sa-print-area').innerHTML = tableHtml;

    setTimeout(function() {
        window.print();
        saRenderPreviewPage(window._saCurrentPage || 0);
    }, 100);
}

/* ==========================================================
   EMPLOYEE LIST (CRUD)
   ========================================================== */

function renderSAEmployees() {
    var el = document.getElementById('sa-sa-employees');
    if (!el) return;

    // Preserve focus + cursor position across re-render (fixes losing focus after 1 keystroke)
    var focusedId = document.activeElement ? document.activeElement.id : null;
    var selStart = null, selEnd = null;
    if (focusedId === 'sa-emp-search') {
        selStart = document.activeElement.selectionStart;
        selEnd = document.activeElement.selectionEnd;
    }

    var searchVal = '';
    var searchEl = document.getElementById('sa-emp-search');
    if (searchEl) searchVal = searchEl.value.toLowerCase();

    var statusVal = 'all';
    var statusEl = document.getElementById('sa-emp-status-filter');
    if (statusEl) statusVal = statusEl.value;

    var list = SA_DB.employees;
    if (searchVal) {
        list = list.filter(function(e) {
            return (e.name || '').toLowerCase().indexOf(searchVal) !== -1
                || (e.nric || '').toLowerCase().indexOf(searchVal) !== -1
                || (e.company || '').toLowerCase().indexOf(searchVal) !== -1
                || (e.phone || '').toLowerCase().indexOf(searchVal) !== -1
                || (e.remark || '').toLowerCase().indexOf(searchVal) !== -1;
        });
    }
    if (statusVal !== 'all') {
        list = list.filter(function(e) { return e.status === statusVal; });
    }

    saEmpFilteredData = list;
    var totalPages = Math.ceil(list.length / saEmpPageSize) || 1;
    if (saEmpCurrentPage > totalPages) saEmpCurrentPage = totalPages;
    if (saEmpCurrentPage < 1) saEmpCurrentPage = 1;
    var start = (saEmpCurrentPage - 1) * saEmpPageSize;
    var page = list.slice(start, start + saEmpPageSize);

    var rows = '';
    if (list.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;color:var(--main-text3);padding:30px">No employees found</td></tr>';
    } else {
        rows = page.map(function(e, i) {
            var statusHtml = e.status === 'active'
                ? '<span style="color:var(--ok);font-weight:600">Active</span>'
                : '<span style="color:var(--main-text3)">Inactive</span>';
            return '<tr>'
                + '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (start + i + 1) + '</td>'
                + '<td style="font-weight:600">' + esc(e.name) + '</td>'
                + '<td style="font-family:var(--font-m)">' + esc(e.nric || '\u2014') + '</td>'
                + '<td>' + esc(e.company || '\u2014') + '</td>'
                + '<td style="font-family:var(--font-m)">' + esc(e.phone || '\u2014') + '</td>'
                + '<td style="font-size:.82rem;color:var(--main-text2)">' + esc(e.remark || '\u2014') + '</td>'
                + '<td>' + statusHtml + '</td>'
                + '<td><div class="actions-cell">'
                + '<button class="btn-icon" onclick="showSAEditEmployee(' + e.id + ')" title="Edit">&#9998;</button> '
                + '<button class="btn-icon danger" onclick="confirmDeleteSAEmployee(' + e.id + ')" title="Delete">&#10005;</button>'
                + '</div></td></tr>';
        }).join('');
    }

    var pagHtml = '';
    if (typeof buildPagination === 'function' && list.length > 0) {
        pagHtml = buildPagination(list.length, saEmpCurrentPage, saEmpPageSize,
            'goSAEmpPage', 'changeSAEmpPageSize', { label: 'employees', sizes: [10, 25, 50] });
    }

    el.innerHTML = ''
        + '<div class="app-header">'
        + '<h2 style="margin:0">Employees</h2><div class="header-sub">Manage site attendance employees</div>'
        + '</div>'
        + '<div class="app-body">'
        + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">'
        + '<input type="text" class="input" id="sa-emp-search" placeholder="Search name, NRIC, company..." value="' + esc(searchVal) + '" oninput="saEmpCurrentPage=1;renderSAEmployees()" style="max-width:300px">'
        + '<select class="input" id="sa-emp-status-filter" onchange="saEmpCurrentPage=1;renderSAEmployees()" style="width:130px">'
        + '<option value="all"' + (statusVal === 'all' ? ' selected' : '') + '>All Status</option>'
        + '<option value="active"' + (statusVal === 'active' ? ' selected' : '') + '>Active</option>'
        + '<option value="inactive"' + (statusVal === 'inactive' ? ' selected' : '') + '>Inactive</option>'
        + '</select>'
        + '<span style="font-size:.78rem;color:var(--main-text3)">' + list.length + ' employees</span>'
        + '<button class="btn btn-green" onclick="showSAAddEmployee()" style="margin-left:auto">+ Add Employee</button>'
        + '</div>'
        + '<div class="table-wrap"><table><thead><tr>'
        + '<th style="width:50px">No</th><th>Name</th><th>NRIC/Passport</th><th>Company</th><th>Phone</th><th>Remark</th><th style="width:80px">Status</th><th style="width:90px">Actions</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        + pagHtml
        + '</div>';

    // Restore focus + cursor position after re-render
    if (focusedId === 'sa-emp-search') {
        var input = document.getElementById('sa-emp-search');
        if (input) {
            input.focus();
            input.setSelectionRange(selStart, selEnd);
        }
    }
}

// ── Add Employee ──
function showSAAddEmployee() {
    if (typeof showModal !== 'function') return;
    showModal(
        '<h3>Add Employee</h3>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="field" style="grid-column:1/-1"><label>Name *</label><input class="input" id="sa-emp-name"></div>'
        + '<div class="field"><label>NRIC / Passport</label><input class="input" id="sa-emp-nric"></div>'
        + '<div class="field"><label>Company</label><input class="input" id="sa-emp-company"></div>'
        + '<div class="field"><label>Phone</label><input class="input" id="sa-emp-phone"></div>'
        + '<div class="field"><label>Status</label><select class="input" id="sa-emp-status">'
        + '<option value="active">Active</option><option value="inactive">Inactive</option>'
        + '</select></div>'
        + '<div class="field" style="grid-column:1/-1"><label>Remark</label><textarea class="input" id="sa-emp-remark" rows="2"></textarea></div>'
        + '</div>'
        + '<p class="auth-error" id="sa-emp-error"></p>'
        + '<div class="btns" style="margin-top:16px">'
        + '<button class="btn btn-ghost" onclick="hideModal()">Cancel</button> '
        + '<button class="btn btn-accent" onclick="doSAAddEmployee()">Save</button>'
        + '</div>'
    );
}

async function doSAAddEmployee() {
    var errEl = document.getElementById('sa-emp-error');
    var name = document.getElementById('sa-emp-name').value.trim();
    var nric = document.getElementById('sa-emp-nric').value.trim();
    var phone = document.getElementById('sa-emp-phone').value.trim();
    if (!name) { errEl.textContent = 'Name required'; return; }

    var dup = saCheckDuplicate(name, nric, phone, null);   // add 不排除任何人
    if (dup) { errEl.textContent = dup; return; }
    try {
        await api('/site-attendance/employees', {
            method: 'POST',
            body: {
                name: name,
                nric: document.getElementById('sa-emp-nric').value.trim(),
                company: document.getElementById('sa-emp-company').value.trim(),
                phone: document.getElementById('sa-emp-phone').value.trim(),
                status: document.getElementById('sa-emp-status').value,
                remark: document.getElementById('sa-emp-remark').value.trim()
            }
        });
        hideModal();
        await saLoadDB();
        renderSAEmployees();
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
}

// ── Edit Employee ──
function showSAEditEmployee(id) {
    var emp = null;
    for (var i = 0; i < SA_DB.employees.length; i++) {
        if (SA_DB.employees[i].id === id) { emp = SA_DB.employees[i]; break; }
    }
    if (!emp) return;
    if (typeof showModal !== 'function') return;
    showModal(
        '<h3>Edit Employee</h3>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="field" style="grid-column:1/-1"><label>Name *</label><input class="input" id="sa-emp-name" value="' + esc(emp.name) + '"></div>'
        + '<div class="field"><label>NRIC / Passport</label><input class="input" id="sa-emp-nric" value="' + esc(emp.nric || '') + '"></div>'
        + '<div class="field"><label>Company</label><input class="input" id="sa-emp-company" value="' + esc(emp.company || '') + '"></div>'
        + '<div class="field"><label>Phone</label><input class="input" id="sa-emp-phone" value="' + esc(emp.phone || '') + '"></div>'
        + '<div class="field"><label>Status</label><select class="input" id="sa-emp-status">'
        + '<option value="active"' + (emp.status === 'active' ? ' selected' : '') + '>Active</option>'
        + '<option value="inactive"' + (emp.status === 'inactive' ? ' selected' : '') + '>Inactive</option>'
        + '</select></div>'
        + '<div class="field" style="grid-column:1/-1"><label>Remark</label><textarea class="input" id="sa-emp-remark" rows="2">' + esc(emp.remark || '') + '</textarea></div>'
        + '</div>'
        + '<p class="auth-error" id="sa-emp-error"></p>'
        + '<div class="btns" style="margin-top:16px">'
        + '<button class="btn btn-ghost" onclick="hideModal()">Cancel</button> '
        + '<button class="btn btn-accent" onclick="doSAEditEmployee(' + id + ')">Save</button>'
        + '</div>'
    );
}

async function doSAEditEmployee(id) {
    var errEl = document.getElementById('sa-emp-error');
    var name = document.getElementById('sa-emp-name').value.trim();
    var nric = document.getElementById('sa-emp-nric').value.trim();
    var phone = document.getElementById('sa-emp-phone').value.trim();
    if (!name) { errEl.textContent = 'Name required'; return; }

    var dup = saCheckDuplicate(name, nric, phone, id);     // edit 排除自己
    if (dup) { errEl.textContent = dup; return; }
    try {
        await api('/site-attendance/employees/' + id, {
            method: 'PUT',
            body: {
                name: name,
                nric: document.getElementById('sa-emp-nric').value.trim(),
                company: document.getElementById('sa-emp-company').value.trim(),
                phone: document.getElementById('sa-emp-phone').value.trim(),
                status: document.getElementById('sa-emp-status').value,
                remark: document.getElementById('sa-emp-remark').value.trim()
            }
        });
        hideModal();
        await saLoadDB();
        renderSAEmployees();
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
}

// 前端即时查重（add 和 edit 共用逻辑，edit 要排除自己）
function saCheckDuplicate(name, nric, phone, excludeId) {
    var n = name.trim().toLowerCase();
    var ic = nric.trim().toLowerCase();
    var ph = phone.trim().toLowerCase();
    for (var i = 0; i < SA_DB.employees.length; i++) {
        var e = SA_DB.employees[i];
        if (excludeId && e.id === excludeId) continue;
        if (e.name.trim().toLowerCase() === n) return 'Name already exists: ' + e.name;
        if (ic && (e.nric || '').trim().toLowerCase() === ic) return 'NRIC/Passport already exists: ' + e.name;
        if (ph && (e.phone || '').trim().toLowerCase() === ph) return 'Phone already exists: ' + e.name;
    }
    return null;
}

// ── Delete Employee ──
function confirmDeleteSAEmployee(id) {
    var emp = null;
    for (var i = 0; i < SA_DB.employees.length; i++) {
        if (SA_DB.employees[i].id === id) { emp = SA_DB.employees[i]; break; }
    }
    if (!emp) return;
    if (typeof showModal !== 'function') return;
    showModal(
        '<h3>Delete Employee</h3>'
        + '<p style="color:var(--main-text2);line-height:1.6">Delete <strong>' + esc(emp.name) + '</strong>?</p>'
        + '<div class="btns">'
        + '<button class="btn btn-ghost" onclick="hideModal()">Cancel</button> '
        + '<button class="btn btn-danger" onclick="doDeleteSAEmployee(' + id + ')">Delete</button>'
        + '</div>'
    );
}

async function doDeleteSAEmployee(id) {
    try {
        await api('/site-attendance/employees/' + id, { method: 'DELETE' });
        hideModal();
        await saLoadDB();
        renderSAEmployees();
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

// ── Pagination ──
function goSAEmpPage(page) {
    var totalPages = Math.ceil(saEmpFilteredData.length / saEmpPageSize) || 1;
    saEmpCurrentPage = Math.max(1, Math.min(page, totalPages));
    renderSAEmployees();
}

function changeSAEmpPageSize(size) {
    saEmpPageSize = parseInt(size);
    saEmpCurrentPage = 1;
    renderSAEmployees();
}
