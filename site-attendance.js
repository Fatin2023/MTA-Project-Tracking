/* ==========================================================
   SITE ATTENDANCE — Independent Module
   ========================================================== */

var SA_DB = { employees: [], projects: [], scopes: [], rates: [], sites: [] };
var saEmpCurrentPage = 1, saEmpPageSize = 10, saEmpFilteredData = [];
var SA_hoursPage = 0;var SA_hoursPageSize = 20;
var saRecordsSearchTimer = null;
var saRecordsRequestId = 0;
var saNavScrollListenerAdded = false;
var _saEditRecIds = null;
var _saEditDate = '';

function saRestoreNavScroll() {
    var nav = document.getElementById('sa-nav');
    if (!nav) return;
    var saved = parseInt(sessionStorage.getItem('multitrade_sa_nav_scroll'), 10);
    if (!isNaN(saved)) nav.scrollTop = saved;
    if (!saNavScrollListenerAdded) {
        nav.addEventListener('scroll', function() {
            sessionStorage.setItem('multitrade_sa_nav_scroll', String(nav.scrollTop));
        }, { passive: true });
        saNavScrollListenerAdded = true;
    }
}

saRestoreNavScroll();

async function saLoadDB() {
    try {
        var data = await api('/site-attendance/load');
        SA_DB.employees = (data.employees || []).map(function(e) {
            return { id: e.id, name: e.name, nric: e.nric, company: e.company, phone: e.phone, status: e.status, remark: e.remark, site_id: e.site_id || 0, createdAt: e.created_at };
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

    try {
        SA_DB.rates = await api('/site-attendance/rates');
    } catch (e) {
        console.error('SA rates load failed:', e);
    }
    if (!SA_DB.rates || !SA_DB.rates.length) {
        SA_DB.rates = [
            { name: 'normal', label: 'Normal Hours', multiplier: 1.00 },
            { name: 'ot', label: 'Overtime (OT)', multiplier: 1.50 },
            { name: 'sunday', label: 'Sunday', multiplier: 2.00 },
            { name: 'public_holiday', label: 'Public Holiday', multiplier: 3.00 }
        ];
    }

    try {
        SA_DB.sites = await api('/site-attendance/sites');
    } catch (e) {
        SA_DB.sites = [];
    }
}

// ── Navigation ──
function saNav(tab, el) {
    saRestoreNavScroll();
    localStorage.setItem('multitrade_sa_page', tab);
    document.querySelectorAll('#sa-layout .sa-view').forEach(function(v) { v.style.display = 'none'; });
    var target = document.getElementById('sa-' + tab);
    if (target) target.style.display = '';

    var nav = document.getElementById('sa-nav');
    if (nav) nav.querySelectorAll('.nav-item').forEach(function(n) {
        n.classList.toggle('active', n.dataset.page === tab);
    });

    saEmpFirstRender = true;
    saPrintRenderLock = false;

    switch (tab) {
        case 'sa-employees': renderSAEmployees(); break;
        case 'sa-print': renderSAPrint(); break;
        case 'sa-records': renderSARecords(); break;
        case 'sa-rates': renderSARates(); break;
    }
    requestAnimationFrame(saRestoreNavScroll);
}

/* ==========================================================
   Helper
   ========================================================== */
function saGetSiteName(siteId) {
    if (!siteId) return '—';
    for (var i = 0; i < (SA_DB.sites || []).length; i++) {
        if (SA_DB.sites[i].id === siteId) return SA_DB.sites[i].name;
    }
    return 'Site ' + siteId;
}

function saGetSiteOptions(selectedId) {
    return (SA_DB.sites || []).map(function(s) {
        return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
}

function saGetSiteField(empSiteId) {
    var isAdmin = currentUser && currentUser.role === 'admin';
    if (isAdmin) {
        return '<div class="field"><label>Site</label><select class="input" id="sa-emp-site">'
            + '<option value="">Select Site...</option>'
            + saGetSiteOptions(empSiteId || 0)
            + '</select></div>';
    } else {
        var mySite = currentUser.siteId || 0;
        return '<div class="field"><label>Site</label>'
            + '<div style="padding:10px 12px;background:var(--main-bg);border:1px solid var(--main-border);border-radius:var(--radius);font-size:.85rem;color:var(--main-text2)">'
            + esc(saGetSiteName(mySite)) + ' <span style="font-size:.72rem;color:var(--main-text3)">(locked)</span></div>'
            + '<input type="hidden" id="sa-emp-site" value="' + mySite + '">'
            + '</div>';
    }
}


/* ==========================================================
   PRINT SHEET (with Work Hours)
   ========================================================== */
var SA_RATE_COLORS = { normal: '#3b82f6', ot: '#f59e0b', sunday: '#ef4444', public_holiday: '#8b5cf6' };
var SHORT = { normal: 'NH', ot: 'OT', sunday: 'Sun', public_holiday: 'PH' };

function saFilterEmpChecklist() {
    var searchEl = document.getElementById('sa-emp-checklist-search');
    var siteEl = document.getElementById('sa-emp-checklist-site');
    var typed = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var siteVal = siteEl ? parseInt(siteEl.value) || 0 : 0;

    document.querySelectorAll('#sa-emp-checklist .sa-emp-row').forEach(function(row) {
        var text = row.getAttribute('data-search') || '';
        var rowSite = parseInt(row.getAttribute('data-site-id')) || 0;
        var matchText = !typed || text.indexOf(typed) !== -1;
        var matchSite = !siteVal || rowSite === siteVal;
        row.style.display = (matchText && matchSite) ? 'flex' : 'none';
    });

    SA_hoursPage = 0;
    saUpdateHoursVisibility();
    saAutoPreview();
}

function saGetSelectedEmpIds() {
    var mode = 'all';
    var checked = document.querySelector('input[name="sa-print-mode"]:checked');
    if (checked) mode = checked.value;
    var ids = {};
    if (mode === 'all') {
        SA_DB.employees.filter(function(e) { return e.status === 'active'; })
            .forEach(function(e) { ids[e.id] = true; });
    } else {
        document.querySelectorAll('.sa-emp-cb:checked').forEach(function(cb) {
            ids[parseInt(cb.value)] = true;
        });
    }

    var siteFilter = document.getElementById('sa-print-site');
    var siteVal = siteFilter ? parseInt(siteFilter.value) || 0 : 0;
    if (siteVal) {
        var filtered = {};
        SA_DB.employees.forEach(function(e) {
            if (ids[e.id] && (e.site_id || 0) === siteVal) filtered[e.id] = true;
        });
        ids = filtered;
    }

    var clSiteFilter = document.getElementById('sa-emp-checklist-site');
    var clSiteVal = clSiteFilter ? parseInt(clSiteFilter.value) || 0 : 0;
    if (clSiteVal) {
        var clFiltered = {};
        SA_DB.employees.forEach(function(e) {
            if (ids[e.id] && (e.site_id || 0) === clSiteVal) clFiltered[e.id] = true;
        });
        ids = clFiltered;
    }

    return ids;
}

var saPrintRenderLock = false;
function renderSAPrint() {
    if (saPrintRenderLock) return;
    saPrintRenderLock = true;
    var el = document.getElementById('sa-sa-print');
    if (!el) { saPrintRenderLock = false; return; }

    var activeEmps = SA_DB.employees.filter(function(e) { return e.status === 'active'; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });

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

    window._saProjectList = filteredProjects;

    // Employee checklist
    var checkboxes = activeEmps.map(function(e) {
        var searchText = (e.name + ' ' + (e.company || '')).toLowerCase();
        return '<label class="sa-emp-row" data-search="' + esc(searchText) + '" data-site-id="' + (e.site_id || 0) + '" style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;border-radius:6px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'var(--main-bg)\'" onmouseout="this.style.background=\'\'">'
            + '<input type="checkbox" class="sa-emp-cb" value="' + e.id + '" style="accent-color:var(--accent)" onchange="SA_hoursPage=0;saUpdateHoursVisibility();saAutoPreview()">'
            + '<span style="font-size:.85rem">' + esc(e.name) + '</span>'
            + '<span style="font-size:.72rem;color:var(--main-text3);margin-left:auto">' + esc(e.company || '') + '</span>'
            + '</label>';
    }).join('');

    // Project options for per-row dropdown
    var projOpts = (window._saProjectList || []).map(function(p) {
        return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');

        // Work Hours rows
        var hourInputRows = activeEmps.map(function(e, idx) {
            var searchText = (e.name + ' ' + (e.nric || '') + ' ' + (e.company || '')).toLowerCase();
            var hourInputs = SA_DB.rates.map(function(r) {
                var c = SA_RATE_COLORS[r.name] || '#6b7280';
                return '<td style="padding:4px 6px;text-align:center">'
                    + '<input type="number" class="sa-hours-input" id="sa-hours-' + e.id + '-' + r.name + '" '
                    + 'placeholder="—" min="0" max="24" step="0.25" value="" '
                    + 'oninput="saCalcTotals()" '
                    + 'style="width:65px;padding:4px 6px;font-size:.82rem;text-align:center;border-color:' + c + '88;font-family:var(--font-m)">'
                    + '</td>';
            }).join('');
            return '<tr class="sa-emp-row-hr" data-search="' + esc(searchText) + '" data-emp-id="' + e.id + '">'
                + '<td style="padding:6px 8px;font-family:var(--font-m);color:var(--main-text3)">' + (idx + 1) + '</td>'
                + '<td style="padding:6px 8px;font-weight:600;font-size:.85rem">' + esc(e.name) + '</td>'
                + '<td style="padding:6px 8px;font-family:var(--font-m);font-size:.8rem;color:var(--main-text2)">' + esc(e.nric || '') + '</td>'
                + '<td style="padding:6px 8px;font-size:.82rem">' + esc(e.company || '') + '</td>'
                + '<td style="padding:6px 8px;font-size:.78rem;color:var(--main-text2)">' + esc(saGetSiteName(e.site_id || 0)) + '</td>'
                // Project dropdown
                + '<td style="padding:4px 6px"><select class="sa-row-project" id="sa-proj-' + e.id + '" '
                + 'style="width:110px;padding:3px 4px;font-size:.78rem" onchange="saAutoPreview()">'
                + '<option value="">—</option>' + projOpts + '</select></td>'
                // Clock In (friendly selects)
                + '<td style="padding:4px 6px;text-align:center">' + saTimeSelectsHtml(e.id, 'in') + '</td>'
                // Clock Out (friendly selects)
                + '<td style="padding:4px 6px;text-align:center">' + saTimeSelectsHtml(e.id, 'out') + '</td>'
                // Duration
                + '<td style="padding:6px 8px;text-align:center;font-family:var(--font-m);font-size:.82rem;font-weight:700;color:var(--main-text2)" id="sa-duration-' + e.id + '">—</td>'
                + hourInputs
                + '</tr>';
        }).join('');

    // Rate headers + totals
    var rateHeadersHtml = SA_DB.rates.map(function(r) {
        var c = SA_RATE_COLORS[r.name] || '#6b7280';
        return '<th style="background:' + c + '22;color:' + c + ';text-align:center;font-size:.78rem;min-width:80px">'
            + esc(r.label) + '<br><span style="font-size:.65rem;opacity:.7">(' + parseFloat(r.multiplier).toFixed(2) + '×)</span></th>';
    }).join('');

    var rateTotalsHtml = SA_DB.rates.map(function(r) {
        var c = SA_RATE_COLORS[r.name] || '#6b7280';
        return '<td style="padding:6px;text-align:center;font-family:var(--font-m);font-weight:700;color:' + c + '" id="sa-total-' + r.name + '">0.0</td>';
    }).join('');

    var todayDate = new Date().toISOString().slice(0, 10);

    el.innerHTML = ''
        + '<div class="app-header pt-anim-filter">'
        + '<h2>Print Attendance Sheet</h2>'
        + '<div class="header-sub">Select employees, enter work hours and generate A4 attendance sheet</div>'
        + '</div>'
        + '<div class="app-body">'

        // ── 1. Sheet Information ──
        + '<div class="pt-anim-head" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;margin-bottom:20px">'
        + '<h3 style="margin:0 0 16px;font-size:.95rem;font-family:var(--font-d)">Sheet Information (Optional)</h3>'
        + '<div class="sa-form-grid">'
        + '<div class="field"><label>Title</label><input class="input" id="sa-print-title" placeholder="e.g. Safety Toolbox Meeting" oninput="saAutoPreview()"></div>'
        + '<div class="field" style="position:relative">'
        + '<label>For Project</label>'
        + '<input class="input" id="sa-print-project-search" placeholder="Search or click to select..." autocomplete="off" '
        + 'oninput="saClearProjectIfTyping();saFilterProjectDropdown();saAutoPreview()" onfocus="saFilterProjectDropdown()">'
        + '<input type="hidden" id="sa-print-project">'
        + '<div id="sa-project-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;'
        + 'background:var(--main-surface);border:1px solid var(--main-border);border-radius:8px;'
        + 'max-height:220px;overflow-y:auto;margin-top:4px;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>'
        + '</div>'
        + '<div class="field sa-ios-date-field"><label>Date &amp; Time</label><input class="input" id="sa-print-datetime" type="date" value="' + todayDate + '" onchange="saLoadHoursForDate()"></div>'
        + '<div class="field"><label>Place</label><input class="input" id="sa-print-place" placeholder="e.g. Site Store Room" oninput="saAutoPreview()"></div>'
        + '<div class="field" style="grid-column:1/-1"><label>Conducted / Chaired by</label><input class="input" id="sa-print-conducted" placeholder="e.g. Ahmad bin Hassan" oninput="saAutoPreview()"></div>'
        + (currentUser && currentUser.role === 'admin'
            ? '<div class="field"><label>Filter by Site</label><select class="input" id="sa-print-site" onchange="saFilterBySite()">'
            + '<option value="">All Sites</option>' + saGetSiteOptions(0) + '</select></div>'
            : '')
        + '</div>'
        + '<h3 style="margin:24px 0 16px;padding-top:16px;border-top:1px solid var(--main-border);font-size:.95rem;font-family:var(--font-d)">Select Employees</h3>'
        + '<div style="display:flex;gap:20px;margin-bottom:16px">'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="sa-print-mode" value="all" checked onchange="saTogglePrintMode();SA_hoursPage=0;saUpdateHoursVisibility();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">All Employees</span></label>'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="sa-print-mode" value="selected" onchange="saTogglePrintMode();SA_hoursPage=0;saUpdateHoursVisibility();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">Selected</span></label>'
        + '</div>'
        // ← Bulk Time Section
        + '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:12px 16px;background:var(--main-bg);border:1px solid var(--main-border);border-radius:8px">'
        + '<span style="font-size:.82rem;font-weight:600;color:var(--main-text2);white-space:nowrap">Bulk Clock:</span>'
        + '<div style="display:flex;align-items:center;gap:4px"><span style="font-size:.75rem;color:var(--main-text3);font-weight:600">IN</span>' + saTimeSelectsHtml(0, 'in') + '</div>'
        + '<div style="display:flex;align-items:center;gap:4px"><span style="font-size:.75rem;color:var(--main-text3);font-weight:600">OUT</span>' + saTimeSelectsHtml(0, 'out') + '</div>'
        + '<button class="btn btn-blue" onclick="saApplyBulkTime()" style="font-size:.82rem;padding:6px 14px">⚡ Apply to Selected</button>'
        + '</div>'
        + '<div id="sa-emp-checklist" style="display:none">'
        + (currentUser && currentUser.role === 'admin'
            ? '<div style="display:flex;gap:8px;margin-bottom:8px">'
            + '<input type="text" class="input" id="sa-emp-checklist-search" placeholder="Search employee name or company..." oninput="saFilterEmpChecklist()" style="flex:1">'
            + '<select class="input" id="sa-emp-checklist-site" onchange="saFilterEmpChecklist()" style="width:160px">'
            + '<option value="">All Sites</option>' + saGetSiteOptions(0) + '</select>'
            + '</div>'
            : '<input type="text" class="input" id="sa-emp-checklist-search" placeholder="Search employee name or company..." oninput="saFilterEmpChecklist()" style="margin-bottom:8px;width:100%">')
        + '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--main-border);border-radius:8px;padding:8px">'
        + '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--main-border);margin-bottom:4px;cursor:pointer"><input type="checkbox" id="sa-select-all" onchange="saToggleSelectAll();SA_hoursPage=0;saUpdateHoursVisibility();saAutoPreview()" style="accent-color:var(--accent)"><span style="font-size:.85rem;font-weight:600">Select All</span></label>'
        + '<div id="sa-emp-checklist-items">' + checkboxes + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'

        // ── 2. Work Hours ──
        + '<div class="pt-anim-table" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px;margin-bottom:20px">'
        + '<h3 style="margin:0 0 16px;font-size:.95rem;font-family:var(--font-d)">Work Hours</h3>'
        + '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'
        + '<input type="text" class="input" id="sa-hours-search" placeholder="Search employee..." oninput="saFilterHoursRows()" style="max-width:250px">'
        + '<span id="sa-hours-summary" style="font-size:.78rem;color:var(--main-text3)">0 hours (0 people)</span>'
        + '</div>'
        + '<div style="overflow-x:auto">'
        + '<table style="width:100%;border-collapse:collapse;font-size:.85rem">'
        + '<thead><tr style="border-bottom:2px solid var(--main-border)">'
        + '<th style="padding:8px;text-align:left;width:45px">No</th>'
        + '<th style="padding:8px;text-align:left">Name</th>'
        + '<th style="padding:8px;text-align:left">NRIC/Passport</th>'
        + '<th style="padding:8px;text-align:left">Company</th>'
        + '<th style="padding:8px;text-align:left">Site</th>'
        + '<th style="padding:8px;text-align:left">Project</th>'
        + '<th style="padding:8px;text-align:center">Clock In</th>'
        + '<th style="padding:8px;text-align:center">Clock Out</th>'
        + '<th style="padding:8px;text-align:center">Duration</th>'
        + rateHeadersHtml
        + '</tr></thead>'
        + '<tbody>' + hourInputRows + '</tbody>'
        + '<tfoot><tr style="border-top:2px solid var(--main-border);font-weight:700">'
        + '<td colspan="9" style="padding:8px;text-align:right;font-size:.85rem">Total Hours &rarr;</td>'
        + rateTotalsHtml
        + '</tr></tfoot>'
        + '</table></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px">'
        + '<div id="sa-hours-pagination" class="sa-preview-pagination" style="display:none;flex:1;justify-content:center"></div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<label style="font-size:.82rem;color:var(--main-text2)">Rows per page:</label>'
        + '<select class="input" id="sa-hours-rows" onchange="saChangeHoursRows(this.value)" style="width:60px;padding:4px 8px;font-size:.82rem">'
        + '<option value="10">10</option><option value="20" selected>20</option><option value="50">50</option><option value="100">100</option><option value="all">All</option>'
        + '</select>'
        + '</div>'
        + '</div>'
        + '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">'
        + '<button class="btn btn-green" onclick="saSaveWorkRecords()">💾 Save Records</button>'
        + '</div></div>'

        // ── 3. Preview ──
        + '<div id="sa-print-area-wrapper" style="display:none">'
        + '<div style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px" class="sa-no-print">'
        + '<h3 style="margin:0;font-size:.95rem;font-family:var(--font-d)">Preview</h3>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<span style="font-size:.82rem;color:var(--main-text2)">Pages are sized automatically for printing.</span>'
        + '<button class="btn btn-blue" onclick="saDoPrint()">Print</button>'
        + '</div>'
        + '</div>'
        + '<div id="sa-print-scroll" class="sa-print-scroll">'
        + '<div id="sa-print-area"></div>'
        + '</div>'
        + '</div>'
        + '</div>'

        + '</div>';

    document.addEventListener('click', saCloseProjectDropdownOutside);

    saCalcTotals();
    saUpdateHoursVisibility();
    saLoadHoursForDate();

    setTimeout(function() {
        el.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table').forEach(function(a) {
            a.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table');
        });
    }, 550);
    setTimeout(function() { saPrintRenderLock = false; }, 550);
}
document.addEventListener('mousedown', function(e) {
    if (e.target.classList && e.target.classList.contains('sa-t3')) return;
    if (e.target.closest && e.target.closest('[id^="sa-t3-dd-"]')) return;
    saT3CloseAll();
});
function saApplyBulkTime() {
    var bInH = document.getElementById('sa-in-h-0');
    var bInM = document.getElementById('sa-in-m-0');
    var bInAP = document.getElementById('sa-in-ampm-0');
    var bOutH = document.getElementById('sa-out-h-0');
    var bOutM = document.getElementById('sa-out-m-0');
    var bOutAP = document.getElementById('sa-out-ampm-0');

    if (!bInH || !bInM || !bInAP || !bOutH || !bOutM || !bOutAP) return;

    if (!bInH.value || !bInM.value || !bInAP.value || !bOutH.value || !bOutM.value || !bOutAP.value) {
        alert('Please fill in both Clock In and Clock Out');
        return;
    }

    var visibleEmpIds = saGetSelectedEmpIds();
    var count = 0;

    document.querySelectorAll('.sa-emp-row-hr').forEach(function(row) {
        var empId = parseInt(row.getAttribute('data-emp-id'));
        if (!visibleEmpIds[empId]) return;

        var inH = document.getElementById('sa-in-h-' + empId);
        var inM = document.getElementById('sa-in-m-' + empId);
        var inAP = document.getElementById('sa-in-ampm-' + empId);
        var outH = document.getElementById('sa-out-h-' + empId);
        var outM = document.getElementById('sa-out-m-' + empId);
        var outAP = document.getElementById('sa-out-ampm-' + empId);

        if (inH) inH.value = bInH.value;
        if (inM) inM.value = bInM.value;
        if (inAP) inAP.value = bInAP.value;
        if (outH) outH.value = bOutH.value;
        if (outM) outM.value = bOutM.value;
        if (outAP) outAP.value = bOutAP.value;

        saCalcDuration(empId);
        count++;
    });

    saCalcTotals();
    saAutoPreview();

    if (count > 0) {
        var summaryEl = document.getElementById('sa-hours-summary');
        if (summaryEl) summaryEl.textContent = 'Applied to ' + count + ' employee(s)';
    }
}

// ── Work Hours helpers ──

function saChangeHoursRows(val) {
    SA_hoursPageSize = (val === 'all') ? 99999 : parseInt(val);
    SA_hoursPage = 0;
    saUpdateHoursVisibility();
}

function saFilterHoursRows() {
    SA_hoursPage = 0;
    saUpdateHoursVisibility();
}

function saUpdateHoursVisibility() {
    var visibleEmpIds = saGetSelectedEmpIds();

    var searchEl = document.getElementById('sa-hours-search');
    var typed = searchEl ? searchEl.value.trim().toLowerCase() : '';

    var allRows = Array.from(document.querySelectorAll('.sa-emp-row-hr'));

    var matchedRows = allRows.filter(function(row) {
        var empId = parseInt(row.getAttribute('data-emp-id'));
        if (!visibleEmpIds[empId]) return false;
        var text = row.getAttribute('data-search') || '';
        return !typed || text.indexOf(typed) !== -1;
    });

    var totalPages = Math.ceil(matchedRows.length / SA_hoursPageSize) || 1;
    if (SA_hoursPage >= totalPages) SA_hoursPage = totalPages - 1;
    if (SA_hoursPage < 0) SA_hoursPage = 0;

    var start = SA_hoursPage * SA_hoursPageSize;
    var end = start + SA_hoursPageSize;

    allRows.forEach(function(row) { row.style.display = 'none'; });

    matchedRows.forEach(function(row, i) {
        if (i >= start && i < end) row.style.display = '';
    });

    saRenderHoursPagination(SA_hoursPage, totalPages);
    saCalcTotals();
}

function saRenderHoursPagination(pageIndex, totalPages) {
    var pagEl = document.getElementById('sa-hours-pagination');
    if (!pagEl) return;

    if (totalPages <= 1) {
        pagEl.style.display = 'none';
        pagEl.innerHTML = '';
        return;
    }

    pagEl.style.display = 'flex';
    pagEl.style.alignItems = 'center';
    pagEl.style.justifyContent = 'center';
    pagEl.style.gap = '6px';

    var firstDisabled = pageIndex === 0;
    var prevDisabled = pageIndex === 0;
    var nextDisabled = pageIndex === totalPages - 1;
    var lastDisabled = pageIndex === totalPages - 1;

    var baseStyle = 'padding:6px 12px;white-space:nowrap;font-size:.82rem;border:1px solid #60a5fa;border-radius:6px;color:#fff;transition:letter-spacing .15s,background .15s;';

    function btnStyle(disabled) {
        return baseStyle + (disabled
            ? 'background:linear-gradient(135deg,#94a3b8,#cbd5e1);border-color:#cbd5e1;opacity:.6;cursor:not-allowed'
            : 'background:linear-gradient(135deg,#1d4ed8,#2563eb);cursor:pointer');
    }

    function btnHover(disabled) {
        return disabled ? ''
            : ' onmouseover="this.style.background=\'linear-gradient(135deg,#2563eb,#3b82f6)\';this.style.letterSpacing=\'.04em\'"'
            + ' onmouseout="this.style.background=\'linear-gradient(135deg,#1d4ed8,#2563eb)\';this.style.letterSpacing=\'normal\'"';
    }

    pagEl.innerHTML = ''
        + '<button style="' + btnStyle(firstDisabled) + '"' + btnHover(firstDisabled) + ' onclick="saGoToHoursPage(0)" ' + (firstDisabled ? 'disabled' : '') + '>«</button>'
        + '<button style="' + btnStyle(prevDisabled) + '"' + btnHover(prevDisabled) + ' onclick="saChangeHoursPage(-1)" ' + (prevDisabled ? 'disabled' : '') + '>← Prev</button>'
        + '<span style="font-size:.82rem;color:var(--main-text2);white-space:nowrap">Page ' + (pageIndex + 1) + ' / ' + totalPages + '</span>'
        + '<button style="' + btnStyle(nextDisabled) + '"' + btnHover(nextDisabled) + ' onclick="saChangeHoursPage(1)" ' + (nextDisabled ? 'disabled' : '') + '>Next →</button>'
        + '<button style="' + btnStyle(lastDisabled) + '"' + btnHover(lastDisabled) + ' onclick="saGoToHoursPage(' + (totalPages - 1) + ')" ' + (lastDisabled ? 'disabled' : '') + '>»</button>';
}

function saGoToHoursPage(pageIndex) {
    SA_hoursPage = pageIndex;
    saUpdateHoursVisibility();
}

function saChangeHoursPage(delta) {
    SA_hoursPage += delta;
    saUpdateHoursVisibility();
}

function saCalcTotals() {
    var visibleEmpIds = saGetSelectedEmpIds();
    var totals = {};
    var totalAll = 0, count = 0;
    SA_DB.rates.forEach(function(r) { totals[r.name] = 0; });

    document.querySelectorAll('.sa-emp-row-hr').forEach(function(row) {
        var empId = parseInt(row.getAttribute('data-emp-id'));
        if (!visibleEmpIds[empId]) return;
        var hasHours = false;
        SA_DB.rates.forEach(function(r) {
            var input = row.querySelector('#sa-hours-' + empId + '-' + r.name);
            var v = input ? (parseFloat(input.value) || 0) : 0;
            if (v > 0) { totals[r.name] += v; totalAll += v; hasHours = true; }
        });
        if (hasHours) count++;
    });

    SA_DB.rates.forEach(function(r) {
        var el = document.getElementById('sa-total-' + r.name);
        if (el) el.textContent = totals[r.name].toFixed(1);
    });

    var summaryEl = document.getElementById('sa-hours-summary');
    if (summaryEl) summaryEl.textContent = totalAll.toFixed(1) + ' hours (' + count + ' people)';
}

// ── NEW: Auto-calculate duration and distribute ──
function saCalcDuration(empId) {
    if (empId === 0) return; 
    var inH = document.getElementById('sa-in-h-' + empId);
    var inM = document.getElementById('sa-in-m-' + empId);
    var inAP = document.getElementById('sa-in-ampm-' + empId);
    var outH = document.getElementById('sa-out-h-' + empId);
    var outM = document.getElementById('sa-out-m-' + empId);
    var outAP = document.getElementById('sa-out-ampm-' + empId);
    var durEl = document.getElementById('sa-duration-' + empId);

    SA_DB.rates.forEach(function(r) {
        var input = document.getElementById('sa-hours-' + empId + '-' + r.name);
        if (input) input.value = '';
    });

    if (!inH || !inM || !inAP || !outH || !outM || !outAP) return;

    if (!inH.value || !inM.value || !inAP.value || !outH.value || !outM.value || !outAP.value) {
        if (durEl) durEl.textContent = '—';
        saCalcTotals();
        return;
    }

    function toMin(h, m, ap) {
        h = parseInt(h);
        m = parseInt(m);
        if (ap.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }

    var inMin = toMin(inH.value, inM.value, inAP.value);
    var outMin = toMin(outH.value, outM.value, outAP.value);

    if (outMin <= inMin) outMin += 24 * 60;

    var dur = (outMin - inMin) / 60;
    dur = Math.round(dur * 4) / 4;

    if (durEl) durEl.textContent = dur.toFixed(1) + 'h';

    var dateEl = document.getElementById('sa-print-datetime');
    var dateVal = dateEl ? dateEl.value : '';
    var dow = -1;
    if (dateVal) dow = new Date(dateVal + 'T00:00:00').getDay();

    if (dow === 0) {
        var sun = document.getElementById('sa-hours-' + empId + '-sunday');
        if (sun) sun.value = dur.toFixed(2);
    } else if (dow >= 1 && dow <= 6) {
        if (dur <= 8) {
            var nh = document.getElementById('sa-hours-' + empId + '-normal');
            if (nh) nh.value = dur.toFixed(2);
        } else {
            var nh = document.getElementById('sa-hours-' + empId + '-normal');
            if (nh) nh.value = '8.00';
            var ot = document.getElementById('sa-hours-' + empId + '-ot');
            if (ot) ot.value = (dur - 8).toFixed(2);
        }
    }

    saCalcTotals();
}

// ── NEW: Apply Sheet Info project to all rows ──
function saApplyProjectToAll() {
    var projId = document.getElementById('sa-print-project') ? document.getElementById('sa-print-project').value : '';
    if (!projId) return;
    document.querySelectorAll('.sa-emp-row-hr').forEach(function(row) {
        var sel = row.querySelector('.sa-row-project');
        if (sel) sel.value = projId;
    });
}

function saSaveWorkRecords() {
    var dateEl = document.getElementById('sa-print-datetime');
    var date = dateEl ? dateEl.value : '';
    if (!date) {
        showModal('<h3>No Date</h3><p style="color:var(--main-text2);line-height:1.6">Please select a date first.</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">OK</button></div>');
        return;
    }

    var records = [];
    document.querySelectorAll('.sa-emp-row-hr').forEach(function(row) {
        var empId = parseInt(row.getAttribute('data-emp-id'));

        // ← 从 SA_DB.employees 找 site_id
        var empSiteId = 0;
        for (var i = 0; i < SA_DB.employees.length; i++) {
            if (SA_DB.employees[i].id === empId) {
                empSiteId = SA_DB.employees[i].site_id || 0;
                break;
            }
        }

        var projSel = row.querySelector('.sa-row-project');
        var rowProjId = projSel ? parseInt(projSel.value) || 0 : 0;

        var inH = document.getElementById('sa-in-h-' + empId);
        var inM = document.getElementById('sa-in-m-' + empId);
        var inAP = document.getElementById('sa-in-ampm-' + empId);
        var outH = document.getElementById('sa-out-h-' + empId);
        var outM = document.getElementById('sa-out-m-' + empId);
        var outAP = document.getElementById('sa-out-ampm-' + empId);

        var clockIn = '';
        if (inH && inH.value && inM && inM.value && inAP && inAP.value) {
            clockIn = inH.value + ':' + inM.value + ' ' + inAP.value;
        }
        var clockOut = '';
        if (outH && outH.value && outM && outM.value && outAP && outAP.value) {
            clockOut = outH.value + ':' + outM.value + ' ' + outAP.value;
        }

        var durEl = document.getElementById('sa-duration-' + empId);
        var durationText = durEl ? durEl.textContent : '';
        var duration = parseFloat(durationText) || 0;

        SA_DB.rates.forEach(function(r) {
            var input = row.querySelector('#sa-hours-' + empId + '-' + r.name);
            var hours = input ? (parseFloat(input.value) || 0) : 0;
            if (hours > 0) {
                records.push({
                    employeeId: empId,
                    // ← 传 siteId
                    siteId: empSiteId,
                    date: date,
                    hours: hours,
                    rateType: r.name,
                    multiplier: r.multiplier,
                    projectId: rowProjId,
                    clockIn: clockIn,
                    clockOut: clockOut,
                    duration: duration
                });
            }
        });
    });

    if (!records.length) {
        showModal('<h3>No Records</h3><p style="color:var(--main-text2);line-height:1.6">No hours entered to save.</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">OK</button></div>');
        return;
    }

    api('/site-attendance/work-records', {
        method: 'POST', body: { records: records }
    }).then(function() {
        var totalH = 0;
        records.forEach(function(r) { totalH += r.hours; });
        showModal(
            '<h3>✅ Records Saved</h3>'
            + '<p style="color:var(--main-text2);line-height:1.6">'
            + records.length + ' records saved<br>'
            + 'Total: <strong>' + totalH.toFixed(1) + ' hours</strong><br>'
            + 'Date: <strong>' + esc(date) + '</strong>'
            + '</p>'
            + '<div class="btns"><button class="btn btn-accent" onclick="hideModal()">OK</button></div>'
        );
        saPreviewPrint();
    }).catch(function(e) {
        showModal('<h3>❌ Save Failed</h3><p style="color:var(--danger);line-height:1.6">' + esc(e.message) + '</p><div class="btns"><button class="btn btn-ghost" onclick="hideModal()">OK</button></div>');
    });
}

function saLoadHoursForDate() {
    var dateEl = document.getElementById('sa-print-datetime');
    var date = dateEl ? dateEl.value : '';
    if (!date) { saAutoPreview(); return; }

    // Clear all inputs
    document.querySelectorAll('.sa-hours-input').forEach(function(input) { input.value = ''; });
    document.querySelectorAll('[id^="sa-in-h-"]').forEach(function(s) { s.value = ''; });
    document.querySelectorAll('[id^="sa-in-m-"]').forEach(function(s) { s.value = ''; });
    document.querySelectorAll('[id^="sa-out-h-"]').forEach(function(s) { s.value = ''; });
    document.querySelectorAll('[id^="sa-out-m-"]').forEach(function(s) { s.value = ''; });
    document.querySelectorAll('.sa-row-project').forEach(function(sel) { sel.value = ''; });
    document.querySelectorAll('[id^="sa-duration-"]').forEach(function(el) {
        if (el.tagName === 'TD') el.textContent = '—';
    });

    api('/site-attendance/work-records?from=' + date + '&to=' + date).then(function(data) {
        data = data || [];
        var loadedEmps = {};
        data.forEach(function(rec) {
            var input = document.getElementById('sa-hours-' + rec.employeeId + '-' + rec.rateType);
            if (input) input.value = rec.hours;

            if (!loadedEmps[rec.employeeId]) {
                loadedEmps[rec.employeeId] = true;

                // Fill clock in/out
                if (rec.clockIn) {
                    var p = rec.clockIn.trim().split(/\s+/);
                    if (p.length === 2) {
                        var hm = p[0].split(':');
                        var ih = document.getElementById('sa-in-h-' + rec.employeeId);
                        var im = document.getElementById('sa-in-m-' + rec.employeeId);
                        var ia = document.getElementById('sa-in-ampm-' + rec.employeeId);
                        if (ih) ih.value = hm[0] || '';
                        if (im) im.value = hm[1] || '';
                        if (ia) ia.value = p[1].toUpperCase();
                    }
                }
                if (rec.clockOut) {
                    var p = rec.clockOut.trim().split(/\s+/);
                    if (p.length === 2) {
                        var hm = p[0].split(':');
                        var oh = document.getElementById('sa-out-h-' + rec.employeeId);
                        var om = document.getElementById('sa-out-m-' + rec.employeeId);
                        var oa = document.getElementById('sa-out-ampm-' + rec.employeeId);
                        if (oh) oh.value = hm[0] || '';
                        if (om) om.value = hm[1] || '';
                        if (oa) oa.value = p[1].toUpperCase();
                    }
                }

                // Fill project
                var projSel = document.getElementById('sa-proj-' + rec.employeeId);
                if (projSel && rec.projectId) projSel.value = rec.projectId;

                // Fill duration
                var durEl = document.getElementById('sa-duration-' + rec.employeeId);
                if (durEl && rec.duration) durEl.textContent = parseFloat(rec.duration).toFixed(1) + 'h';
            }
        });
        saCalcTotals();
        saAutoPreview();
    }).catch(function() {
        saCalcTotals();
        saAutoPreview();
    });
}

function saFilterBySite() {
    SA_hoursPage = 0;
    saUpdateHoursVisibility();
    saAutoPreview();
}

// ── Project dropdown ──
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

function saSelectProject(id, name) {
    var searchEl = document.getElementById('sa-print-project-search');
    var hiddenEl = document.getElementById('sa-print-project');
    var dropdownEl = document.getElementById('sa-project-dropdown');
    if (searchEl) searchEl.value = name;
    if (hiddenEl) hiddenEl.value = id;
    if (dropdownEl) dropdownEl.style.display = 'none';
    saApplyProjectToAll();
    saAutoPreview();
}

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
    document.querySelectorAll('.sa-emp-cb').forEach(function(cb) { cb.checked = allCb.checked; });
}

var _saAutoPreviewTimer = null;
function saAutoPreview() {
    clearTimeout(_saAutoPreviewTimer);
    _saAutoPreviewTimer = setTimeout(function() { saPreviewPrint(); }, 200);
}

function saClearProjectIfTyping() {
    var searchEl = document.getElementById('sa-print-project-search');
    var hiddenEl = document.getElementById('sa-print-project');
    if (!searchEl || !hiddenEl) return;
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

// ── 3-Part Time Input: Hour : Minute AM/PM (type + dropdown) ──
function saTimeSelectsHtml(empId, prefix) {
    var bs = 'appearance:none;-webkit-appearance:none;border:1px solid var(--main-border);border-radius:8px;'
        + 'background:var(--main-bg);color:var(--main-text);font-family:var(--font-m);font-size:.82rem;'
        + 'padding:4px 3px;text-align:center;outline:none;cursor:pointer;transition:border .15s;';

    var blur = 'this.style.borderColor=\'var(--main-border)\';saT3CheckCalc(' + empId + ')';

    return '<div style="display:inline-flex;align-items:center;gap:1px;position:relative">'
        + '<input id="sa-' + prefix + '-h-' + empId + '" class="sa-t3" '
        + 'placeholder="--" autocomplete="off" '
        + 'style="' + bs + 'width:36px;font-weight:700" '
        + 'onfocus="this.style.borderColor=\'var(--accent)\';saT3Open(this,\'h\',' + empId + ',\'' + prefix + '\')" '
        + 'oninput="saT3Filter(this,\'h\',' + empId + ',\'' + prefix + '\')" '
        + 'onblur="' + blur + '" '
        + 'onkeydown="if(event.key===\'Enter\'){this.blur()}">'
        + '<span style="font-size:1rem;font-weight:800;color:var(--main-text3);padding:0 1px">:</span>'
        + '<input id="sa-' + prefix + '-m-' + empId + '" class="sa-t3" '
        + 'placeholder="--" autocomplete="off" '
        + 'style="' + bs + 'width:36px;font-weight:700" '
        + 'onfocus="this.style.borderColor=\'var(--accent)\';saT3Open(this,\'m\',' + empId + ',\'' + prefix + '\')" '
        + 'oninput="saT3Filter(this,\'m\',' + empId + ',\'' + prefix + '\')" '
        + 'onblur="' + blur + '" '
        + 'onkeydown="if(event.key===\'Enter\'){this.blur()}">'
        + '<input id="sa-' + prefix + '-ampm-' + empId + '" class="sa-t3" '
        + 'placeholder="--" autocomplete="off" '
        + 'style="' + bs + 'width:38px;font-weight:700;font-size:.72rem;letter-spacing:.04em" '
        + 'onfocus="this.style.borderColor=\'var(--accent)\';saT3Open(this,\'ap\',' + empId + ',\'' + prefix + '\')" '
        + 'oninput="saT3Filter(this,\'ap\',' + empId + ',\'' + prefix + '\')" '
        + 'onblur="' + blur + '" '
        + 'onkeydown="if(event.key===\'Enter\'){this.blur()}">'
        + '<div id="sa-t3-dd-' + prefix + '-' + empId + '" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:60;'
        + 'background:var(--main-surface);border:1px solid var(--main-border);border-radius:8px;'
        + 'max-height:160px;overflow-y:auto;margin-top:3px;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>'
        + '</div>';
}

// ── Check if all 6 fields filled → auto calculate ──
function saT3CheckCalc(empId) {
    // Bulk picker: auto-apply when all 6 filled
    if (empId === 0) {
        var bulkFields = ['sa-in-h-0', 'sa-in-m-0', 'sa-in-ampm-0', 'sa-out-h-0', 'sa-out-m-0', 'sa-out-ampm-0'];
        var bulkAll = true;
        bulkFields.forEach(function(f) {
            var el = document.getElementById(f);
            if (!el || !el.value.trim()) bulkAll = false;
        });
        if (bulkAll) {
            saT3CloseAll();
            saApplyBulkTime();
        }
        return;
    }

    var fields = ['sa-in-h-', 'sa-in-m-', 'sa-in-ampm-', 'sa-out-h-', 'sa-out-m-', 'sa-out-ampm-'];
    var allFilled = true;
    fields.forEach(function(f) {
        var el = document.getElementById(f + empId);
        if (!el || !el.value.trim()) allFilled = false;
    });
    if (allFilled) {
        saT3CloseAll();
        saCalcDuration(empId);
    }
}

function saT3Options(type) {
    var list = [];
    if (type === 'h') {
        for (var h = 1; h <= 12; h++) list.push(('0' + h).slice(-2));
    } else if (type === 'm') {
        for (var m = 0; m < 60; m++) list.push(('0' + m).slice(-2));
    } else {
        list.push('AM', 'PM');
    }
    return list;
}

function saT3Open(inputEl, type, empId, prefix) {
    saT3CloseAll();

    // ← 只给最后 3 行加 padding 腾出空间
    var row = inputEl.closest('tr');
    if (row) {
        var tbody = row.parentElement;
        if (tbody) {
            var allRows = Array.from(tbody.querySelectorAll('tr'));
            var last3 = allRows.slice(-3);
            if (last3.indexOf(row) !== -1) {
                var container = row.closest('div[style*="overflow"]');
                if (container) {
                    container.style.paddingBottom = '100px';
                    container._saTempPad = true;
                    // ← 腾出空间后自动滚到底部
                    setTimeout(function() {
                        container.scrollTop = container.scrollHeight;
                    }, 30);
                }
            }
        }
    }

    var dd = document.getElementById('sa-t3-dd-' + prefix + '-' + empId);
    if (!dd) return;

    var options = saT3Options(type);
    var html = options.map(function(o) {
        return '<div style="padding:5px 8px;font-size:.82rem;font-family:var(--font-m);font-weight:600;cursor:pointer;text-align:center" '
            + 'onmouseover="this.style.background=\'var(--main-bg)\'" '
            + 'onmouseout="this.style.background=\'\'" '
            + 'onmousedown="event.preventDefault();saT3Select(\'' + prefix + '\',' + empId + ',\'' + type + '\',\'' + o + '\')">'
            + o + '</div>';
    }).join('');

    dd.innerHTML = html;
    dd.style.display = '';

    // ← 确保 dropdown 可见
    setTimeout(function() {
        dd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
}

function saT3Filter(inputEl, type, empId, prefix) {
    var dd = document.getElementById('sa-t3-dd-' + prefix + '-' + empId);
    if (!dd) return;

    var typed = inputEl.value.trim().toLowerCase();
    var options = saT3Options(type);
    var matches = typed
        ? options.filter(function(o) { return o.toLowerCase().indexOf(typed) !== -1; })
        : options;

    var html = matches.map(function(o) {
        return '<div style="padding:5px 8px;font-size:.82rem;font-family:var(--font-m);font-weight:600;cursor:pointer;text-align:center" '
            + 'onmouseover="this.style.background=\'var(--main-bg)\'" '
            + 'onmouseout="this.style.background=\'\'" '
            + 'onmousedown="event.preventDefault();saT3Select(\'' + prefix + '\',' + empId + ',\'' + type + '\',\'' + o + '\')">'
            + o + '</div>';
    }).join('');

    dd.innerHTML = html || '<div style="padding:6px;font-size:.78rem;color:var(--main-text3);text-align:center">No match</div>';
    dd.style.display = '';
}

function saT3Select(prefix, empId, type, val) {
    var inputId = 'sa-' + prefix + '-' + (type === 'ap' ? 'ampm' : type) + '-' + empId;
    var input = document.getElementById(inputId);
    if (input) input.value = val;

    // Auto-advance: hour → minute → am/pm（保留）
    if (type === 'h') {
        var mInput = document.getElementById('sa-' + prefix + '-m-' + empId);
        if (mInput) {
            setTimeout(function() {
                mInput.focus();
                saT3Open(mInput, 'm', empId, prefix);
            }, 50);
        }
    } else if (type === 'm') {
        var apInput = document.getElementById('sa-' + prefix + '-ampm-' + empId);
        if (apInput) {
            setTimeout(function() {
                apInput.focus();
                saT3Open(apInput, 'ap', empId, prefix);
            }, 50);
        }
    }

    // ← 6 个全填好就算（新增）
    function allFilled() {
        return document.getElementById('sa-in-h-' + empId) && document.getElementById('sa-in-h-' + empId).value
            && document.getElementById('sa-in-m-' + empId) && document.getElementById('sa-in-m-' + empId).value
            && document.getElementById('sa-in-ampm-' + empId) && document.getElementById('sa-in-ampm-' + empId).value
            && document.getElementById('sa-out-h-' + empId) && document.getElementById('sa-out-h-' + empId).value
            && document.getElementById('sa-out-m-' + empId) && document.getElementById('sa-out-m-' + empId).value
            && document.getElementById('sa-out-ampm-' + empId) && document.getElementById('sa-out-ampm-' + empId).value;
    }

    if (allFilled()) {
        saT3CloseAll();
        saCalcDuration(empId);
    }
}

function saT3CloseAll() {
    document.querySelectorAll('[id^="sa-t3-dd-"]').forEach(function(dd) {
        dd.style.display = 'none';
    });
    document.querySelectorAll('div[style*="padding-bottom: 100px"]').forEach(function(el) {
        if (el._saTempPad) {
            el.style.paddingBottom = '';
            el._saTempPad = false;
        }
    });
}

// ── Generate all time options (every 15 min) ──
var _saTimeOptions = (function() {
    var list = [];
    for (var h = 0; h < 24; h++) {
        for (var m = 0; m < 60; m++) {
            var h12 = h % 12; if (h12 === 0) h12 = 12;
            var ap = h < 12 ? 'AM' : 'PM';
            list.push(h12 + ':' + ('0' + m).slice(-2) + ' ' + ap);
        }
    }
    return list;
})();

document.addEventListener('mousedown', function(e) {
    if (e.target.classList && e.target.classList.contains('sa-time-input')) return;
    if (e.target.closest && e.target.closest('[id^="sa-time-dd-"]')) return;
    document.querySelectorAll('[id^="sa-time-dd-"]').forEach(function(dd) { dd.style.display = 'none'; });
});

function saTimeDropdown(prefix, empId) {
    saTimeFilterDropdown(prefix, empId);
    var dd = document.getElementById('sa-time-dd-' + prefix + '-' + empId);
    if (dd) dd.style.display = '';
}

function saTimeFilterDropdown(prefix, empId) {
    var input = document.getElementById('sa-time-' + prefix + '-' + empId);
    var dd = document.getElementById('sa-time-dd-' + prefix + '-' + empId);
    if (!input || !dd) return;

    var typed = input.value.trim().toLowerCase();
    var matches = _saTimeOptions.filter(function(t) {
        return !typed || t.toLowerCase().indexOf(typed) !== -1;
    }).slice(0, 50);

    var html = matches.map(function(t) {
        return '<div style="padding:5px 12px;font-size:.82rem;font-family:var(--font-m);cursor:pointer;text-align:center" '
            + 'onmouseover="this.style.background=\'var(--main-bg)\'" '
            + 'onmouseout="this.style.background=\'\'" '
            + 'onmousedown="event.preventDefault();saTimeSelect(\'' + prefix + '\',' + empId + ',\'' + t + '\')">'
            + t + '</div>';
    }).join('');

    if (!matches.length) {
        html = '<div style="padding:8px 12px;font-size:.78rem;color:var(--main-text3);text-align:center">Press Enter to use typed time</div>';
    }

    dd.innerHTML = html;
    dd.style.display = '';
}

function saTimeSelect(prefix, empId, timeStr) {
    var input = document.getElementById('sa-time-' + prefix + '-' + empId);
    var dd = document.getElementById('sa-time-dd-' + prefix + '-' + empId);
    if (input) input.value = timeStr;
    if (dd) dd.style.display = 'none';
    saCalcDuration(empId);
}

// ── Smart time parser: "8", "8am", "8:30pm", "14:00" → "8:00 AM" ──
function saFormatTime(inputEl) {
    if (!inputEl) return;
    var raw = inputEl.value.trim();
    if (!raw) return;

    raw = raw.toLowerCase().replace(/\s+/g, '');

    var hours = 0, minutes = 0;
    var isPM = false;

    // Detect am/pm
    if (raw.indexOf('pm') !== -1) { isPM = true; raw = raw.replace('pm', ''); }
    else if (raw.indexOf('am') !== -1) { isPM = false; raw = raw.replace('am', ''); }
    else {
        // 24hr input like "14:00" or "14"
        // Determine from value later
    }

    // Split h:m
    var parts = raw.split(':');
    hours = parseInt(parts[0]) || 0;
    minutes = parts.length > 1 ? (parseInt(parts[1]) || 0) : 0;

    // Validate
    if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
        inputEl.value = '';
        return;
    }

    // If no am/pm suffix and hours >= 13 → treat as 24hr
    var hadAmPm = raw.indexOf('am') === -1 && raw.indexOf('pm') === -1
        && inputEl.value.toLowerCase().indexOf('am') === -1
        && inputEl.value.toLowerCase().indexOf('pm') === -1;

    if (hadAmPm && hours >= 13) {
        isPM = true;
        hours -= 12;
    } else if (hadAmPm && hours === 12) {
        isPM = true;
    } else if (hadAmPm && hours === 0) {
        hours = 12;
        isPM = false;
    } else if (!hadAmPm && isPM && hours !== 12) {
        // already PM from suffix
    } else if (!hadAmPm && !isPM && hours === 12) {
        hours = 12; // 12am = midnight
    }

    // Ensure hours 1-12 for display
    if (hours === 0) hours = 12;
    if (hours > 12) { hours -= 12; isPM = true; }

    inputEl.value = hours + ':' + ('0' + minutes).slice(-2) + (isPM ? ' PM' : ' AM');
}

// ── Parse formatted time string back to minutes ──
function saTimeToMinutes(val) {
    if (!val) return -1;
    var raw = val.trim().toUpperCase();
    var isPM = raw.indexOf('PM') !== -1;
    var isAM = raw.indexOf('AM') !== -1;
    raw = raw.replace(/AM|PM/gi, '').trim();

    var parts = raw.split(':');
    var h = parseInt(parts[0]) || 0;
    var m = parts.length > 1 ? (parseInt(parts[1]) || 0) : 0;

    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    // No suffix + h >= 13 → already 24hr
    if (!isPM && !isAM && h >= 13) { /* already 24hr */ }

    return h * 60 + m;
}

// ── Preview ──
function saPreviewPrint() {
    var visibleEmpIds = saGetSelectedEmpIds();
    var selectedEmps = SA_DB.employees.filter(function(e) { return visibleEmpIds[e.id]; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });

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

    var empsWithHours = selectedEmps.map(function(emp) {
        var hours = {};
        SA_DB.rates.forEach(function(r) {
            var input = document.querySelector('#sa-hours-' + emp.id + '-' + r.name);
            var v = input ? (parseFloat(input.value) || 0) : 0;
            hours[r.name] = v;
        });
        return { emp: emp, hours: hours };
    });

    window._saAllEmps = empsWithHours;
    window._saPrintMeta = {
        title: title, project: project, datetime: datetime,
        place: place, conducted: conducted
    };
    window._saCurrentPage = 0;

    saBuildPreviewPages();
    saRenderPreviewPage(0);

    var wrapper = document.getElementById('sa-print-area-wrapper');
    if (wrapper) wrapper.style.display = '';
}

function saBuildPreviewPages() {
    var allEmps = window._saAllEmps || [];
    window._saPrintPages = [{ isFirst: true, emps: allEmps }];
}

function saChangeRowsPerPage() {
    saBuildPreviewPages();
    saRenderPreviewPage(0);
}

function saChangePreviewPage(delta) {
    saRenderPreviewPage((window._saCurrentPage || 0) + delta);
}

function saRenderPreviewPage(pageIndex) {
    var pages = window._saPrintPages || [];
    var meta = window._saPrintMeta || {};
    if (!pages.length) return;

    pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    window._saCurrentPage = pageIndex;

    var page = pages[pageIndex];
    var rates = SA_DB.rates;
    var tableHtml = '';

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
    tableHtml += '<col style="width:9%">';
    tableHtml += '<col style="width:25%">';
    tableHtml += '<col style="width:17%">';
    tableHtml += '<col style="width:12%">';
    var rateColW = (100 - 9 - 25 - 17 - 12) / (rates.length + 1);
    rates.forEach(function() { tableHtml += '<col style="width:' + rateColW + '%">'; });
    tableHtml += '<col style="width:' + rateColW + '%">';
    tableHtml += '</colgroup>';

    tableHtml += '<thead><tr>';
    tableHtml += '<th class="sa-pt-no">S/No</th>';
    tableHtml += '<th class="sa-pt-name">Name</th>';
    tableHtml += '<th class="sa-pt-nric">NRIC/<br>Passport</th>';
    tableHtml += '<th class="sa-pt-company">Company</th>';
    rates.forEach(function(r) {
        var short = SHORT[r.name] || r.label;
        tableHtml += '<th class="sa-pt-hours">' + esc(short) + '<br>x' + parseFloat(r.multiplier).toFixed(1) + '</th>';
    });
    tableHtml += '<th class="sa-pt-sig">Sign</th>';
    tableHtml += '</tr></thead><tbody>';

    var startNo = 1;
    for (var p = 0; p < pageIndex; p++) {
        startNo += pages[p].emps.length;
    }

    var displayRows = page.emps.length;

    for (var i = 0; i < displayRows; i++) {
        var item = page.emps[i];
        tableHtml += '<tr>';
        tableHtml += '<td class="sa-pt-no">' + (startNo + i) + '</td>';
        tableHtml += '<td class="sa-pt-name">' + (item ? esc(item.emp.name) : '&nbsp;') + '</td>';
        tableHtml += '<td class="sa-pt-nric">' + (item ? esc(item.emp.nric || '') : '&nbsp;') + '</td>';
        tableHtml += '<td class="sa-pt-company">' + (item ? esc(item.emp.company || '') : '&nbsp;') + '</td>';
        rates.forEach(function(r) {
            var v = (item && item.hours && item.hours[r.name]) ? item.hours[r.name].toFixed(1) : '';
            tableHtml += '<td class="sa-pt-hours">' + (v ? v : '&nbsp;') + '</td>';
        });
        tableHtml += '<td class="sa-pt-sig">&nbsp;</td>';
        tableHtml += '</tr>';
    }

    tableHtml += '</tbody></table>';

    document.getElementById('sa-print-area').innerHTML = tableHtml;
}

// ── Print ──
function saDoPrint() {
    clearTimeout(_saAutoPreviewTimer);
    saPreviewPrint();

    var allEmps = window._saAllEmps || [];
    var meta = window._saPrintMeta || {};
    var rates = SA_DB.rates;

    if (!allEmps.length && !window._saPrintPages) {
        window.print();
        return;
    }

    var printPages = [{ isFirst: true, emps: allEmps }];

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
        tableHtml += '<col style="width:9%">';
        tableHtml += '<col style="width:25%">';
        tableHtml += '<col style="width:17%">';
        tableHtml += '<col style="width:12%">';
        var rateColW = (100 - 9 - 25 - 17 - 12) / (rates.length + 1);
        rates.forEach(function() { tableHtml += '<col style="width:' + rateColW + '%">'; });
        tableHtml += '<col style="width:' + rateColW + '%">';
        tableHtml += '</colgroup>';

        tableHtml += '<thead><tr><th class="sa-pt-no">S/No</th><th class="sa-pt-name">Name</th><th class="sa-pt-nric">NRIC/<br>Passport</th><th class="sa-pt-company">Company</th>';
        rates.forEach(function(r) {
            var short = SHORT[r.name] || r.label;
            tableHtml += '<th class="sa-pt-hours">' + esc(short) + '<br>x' + parseFloat(r.multiplier).toFixed(1) + '</th>';
        });
        tableHtml += '<th class="sa-pt-sig">Sign</th></tr></thead><tbody>';

        var startNo = 1;
        for (var p = 0; p < pageIndex; p++) {
            startNo += printPages[p].emps.length;
        }

        var displayRows = page.emps.length;

        for (var i = 0; i < displayRows; i++) {
            var item = page.emps[i];
            tableHtml += '<tr>';
            tableHtml += '<td class="sa-pt-no">' + (startNo + i) + '</td>';
            tableHtml += '<td class="sa-pt-name">' + (item ? esc(item.emp.name) : '&nbsp;') + '</td>';
            tableHtml += '<td class="sa-pt-nric">' + (item ? esc(item.emp.nric || '') : '&nbsp;') + '</td>';
            tableHtml += '<td class="sa-pt-company">' + (item ? esc(item.emp.company || '') : '&nbsp;') + '</td>';
            rates.forEach(function(r) {
                var v = (item && item.hours && item.hours[r.name]) ? item.hours[r.name].toFixed(1) : '';
                tableHtml += '<td class="sa-pt-hours">' + (v ? v : '&nbsp;') + '</td>';
            });
            tableHtml += '<td class="sa-pt-sig">&nbsp;</td>';
            tableHtml += '</tr>';
        }

        tableHtml += '</tbody></table></div>';
    });

    document.getElementById('sa-print-area').innerHTML = tableHtml;

    setTimeout(function() {
        window.print();
        saRenderPreviewPage(window._saCurrentPage || 0);
    }, 100);
}

/* ==========================================================
   WORK RECORDS PAGE (Multi-Select Searchable Dropdowns)
   ========================================================== */

var saRecFilteredData = [];
var saRecCurrentPage = 1;
var saRecPageSize = 25;
var saRecDisplayData = [];
var saRecDropdownState = {
    emp: { data: [], selected: [], open: false },
    rate: { data: [], selected: [], open: false },
    site: { data: [], selected: [], open: false }
};


// ── Multi-Select Searchable Dropdown ──

function saRecDropdownHtml(type, label) {
    return '<div class="sa-rec-filter-item" style="position:relative">'
        + '<label>' + label + '</label>'
        + '<input class="input" id="sa-rec-' + type + '-search" placeholder="All" autocomplete="off" '
        + 'oninput="saRecFilterDropdown(\'' + type + '\')" '
        + 'onfocus="saRecOpenDropdown(\'' + type + '\')" '
        + 'onkeydown="if(event.key===\'Escape\'){saRecCloseAllDropdowns()}" '
        + 'style="cursor:pointer">'
        + '<div id="sa-rec-' + type + '-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;'
        + 'background:var(--main-surface);border:1px solid var(--main-border);border-radius:8px;'
        + 'max-height:240px;overflow-y:auto;margin-top:4px;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>'
        + '</div>';
}

function saRecBuildMultiDropdown(type, options) {
    saRecDropdownState[type].data = options;
    saRecDropdownState[type].selected = [];
    saRecUpdateDisplay(type);
}

function saRecOpenDropdown(type) {
    // Close others first
    ['emp', 'rate', 'site'].forEach(function(t) {
        if (t !== type) {
            var el = document.getElementById('sa-rec-' + t + '-dropdown');
            if (el) el.style.display = 'none';
            saRecDropdownState[t].open = false;
        }
    });
    saRecFilterDropdown(type);
    saRecDropdownState[type].open = true;
}

function saRecFilterDropdown(type) {
    var searchEl = document.getElementById('sa-rec-' + type + '-search');
    var dropdownEl = document.getElementById('sa-rec-' + type + '-dropdown');
    if (!searchEl || !dropdownEl) return;

    var typed = searchEl.value.trim().toLowerCase();
    var state = saRecDropdownState[type];
    var matches = typed
        ? state.data.filter(function(o) { return o.label.toLowerCase().indexOf(typed) !== -1; })
        : state.data;

    var allChecked = state.selected.length === 0;

    var html = '';

    // Clear / All row
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--main-border);cursor:pointer" '
        + 'onmouseover="this.style.background=\'var(--main-bg)\'" onmouseout="this.style.background=\'\'" '
        + 'onclick="event.stopPropagation();saRecClearAll(\'' + type + '\')">'
        + '<input type="checkbox" ' + (allChecked ? 'checked' : '') + ' style="accent-color:var(--accent);pointer-events:none">'
        + '<span style="font-size:.85rem;font-weight:600">All</span>'
        + '</div>';

    if (!matches.length) {
        html += '<div style="padding:10px 12px;font-size:.82rem;color:var(--main-text3)">No matches</div>';
    } else {
        matches.forEach(function(o) {
            var checked = state.selected.indexOf(String(o.value)) !== -1;
            html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer" '
                + 'onmouseover="this.style.background=\'var(--main-bg)\'" onmouseout="this.style.background=\'\'" '
                + 'onclick="event.stopPropagation();saRecToggleOption(\'' + type + '\',\'' + esc(String(o.value)) + '\')">'
                + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="accent-color:var(--accent);pointer-events:none">'
                + '<span style="font-size:.85rem">' + esc(o.label) + '</span>'
                + '</div>';
        });
    }

    dropdownEl.innerHTML = html;
    dropdownEl.style.display = '';
}

function saRecToggleOption(type, value) {
    var state = saRecDropdownState[type];
    var idx = state.selected.indexOf(value);
    if (idx !== -1) {
        state.selected.splice(idx, 1);
    } else {
        state.selected.push(value);
    }
    // ← 不改 search 文字，只刷新 checkbox
    saRecFilterDropdown(type);
    saRecOnDropdownChange(type);
}

function saRecClearAll(type) {
    saRecDropdownState[type].selected = [];
    saRecFilterDropdown(type);
    saRecOnDropdownChange(type);
}

function saRecCloseAllDropdowns() {
    ['emp', 'rate', 'site'].forEach(function(type) {
        var el = document.getElementById('sa-rec-' + type + '-dropdown');
        if (el) el.style.display = 'none';
        saRecDropdownState[type].open = false;
        // ← 关掉时才更新 display 文字
        saRecUpdateDisplay(type);
    });
}

function saRecCloseDropdownsOutside(e) {
    ['emp', 'rate', 'site'].forEach(function(type) {
        var dropdownEl = document.getElementById('sa-rec-' + type + '-dropdown');
        var searchEl = document.getElementById('sa-rec-' + type + '-search');
        if (!dropdownEl || !searchEl) return;
        if (e.target === searchEl || dropdownEl.contains(e.target)) return;
        dropdownEl.style.display = 'none';
        saRecDropdownState[type].open = false;
        // ← 关掉时才更新 display 文字
        saRecUpdateDisplay(type);
    });
}

// saRecUpdateDisplay 不变，但只在 dropdown 关闭时被调用
function saRecUpdateDisplay(type) {
    var state = saRecDropdownState[type];
    var searchEl = document.getElementById('sa-rec-' + type + '-search');
    if (!searchEl) return;

    if (state.selected.length === 0) {
        searchEl.value = '';
        searchEl.placeholder = 'All';
    } else if (state.selected.length === 1) {
        var found = state.data.find(function(o) { return String(o.value) === state.selected[0]; });
        searchEl.value = found ? found.label : state.selected[0];
    } else {
        searchEl.value = state.selected.length + ' selected';
    }
}

function saRecOnDropdownChange(type) {
    if (type === 'emp' || type === 'rate') {
        saLoadRecords();
    } else {
        saRenderRecordsTable();
    }
}

function saRecCloseAllDropdowns() {
    ['emp', 'rate', 'site'].forEach(function(type) {
        var el = document.getElementById('sa-rec-' + type + '-dropdown');
        if (el) el.style.display = 'none';
        saRecDropdownState[type].open = false;
    });
}

function saRecCloseDropdownsOutside(e) {
    ['emp', 'rate', 'site'].forEach(function(type) {
        var dropdownEl = document.getElementById('sa-rec-' + type + '-dropdown');
        var searchEl = document.getElementById('sa-rec-' + type + '-search');
        if (!dropdownEl || !searchEl) return;
        if (e.target === searchEl || dropdownEl.contains(e.target)) return;
        dropdownEl.style.display = 'none';
        saRecDropdownState[type].open = false;
    });
}


// ── Page Render ──

function renderSARecords() {
    var el = document.getElementById('sa-sa-records');
    if (!el) return;

    var todayDate = new Date().toISOString().slice(0, 10);
    var isAdmin = currentUser && currentUser.role === 'admin';

    // site-admin 的 site 信息
    var mySiteId = currentUser ? currentUser.siteId || 0 : 0;
    var mySiteName = isAdmin ? '' : saGetSiteName(mySiteId);

    el.innerHTML = ''
    + '<div class="app-header pt-anim-filter"><h2>Work Records</h2><div class="header-sub">'
    + (isAdmin ? 'View and manage work hour records' : 'View work hour records — ' + esc(mySiteName))
    + '</div></div>'
    + '<div class="app-body">'
    + '<div class="pt-anim-head" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:16px 20px;margin-bottom:16px">'
    + '<h3 style="margin:0 0 14px;font-size:.9rem;font-family:var(--font-d)">Filter</h3>'
    + '<div class="sa-rec-filter-grid">'
    + '<div class="sa-rec-filter-item" style="flex:0 1 300px"><label>Search</label><input class="input" id="sa-rec-search" placeholder="Search name, company, site..." oninput="saQueueRecordsTable()"></div>'
    + '<div class="sa-rec-filter-item sa-ios-date-field"><label>From</label><input class="input" id="sa-rec-from" type="date" value="" onchange="saLoadRecords()"></div>'
    + '<div class="sa-rec-filter-item sa-ios-date-field"><label>To</label><input class="input" id="sa-rec-to" type="date" value="" onchange="saLoadRecords()"></div>'
    + saRecDropdownHtml('emp', 'Employee')
    + saRecDropdownHtml('rate', 'Rate Type')
    // admin → dropdown，site_admin → 锁定 label
    + (isAdmin
        ? saRecDropdownHtml('site', 'Site')
        : '')
    + '<div class="sa-rec-filter-item sa-rec-filter-item--btns">'
    + '<button class="btn btn-ghost" onclick="saResetRecordsFilter()">Reset</button>'
    + '<button class="btn btn-blue" onclick="saExportRecords()">Export</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div id="sa-records-table-area" class="pt-anim-table"><div style="padding:30px;text-align:center;color:var(--main-text3)">Loading records…</div></div>'
    + '</div>';

    // Fill dropdown data
    var empOpts = SA_DB.employees.slice().sort(function(a, b) { return a.name.localeCompare(b.name); })
        .map(function(e) { return { value: e.id, label: e.name }; });
    var rateOpts = SA_DB.rates.map(function(r) { return { value: r.name, label: r.label }; });
    var siteOpts = (SA_DB.sites || []).map(function(s) { return { value: s.id, label: s.name }; });

    saRecBuildMultiDropdown('emp', empOpts);
    saRecBuildMultiDropdown('rate', rateOpts);
    if (isAdmin) saRecBuildMultiDropdown('site', siteOpts);

    document.addEventListener('click', saRecCloseDropdownsOutside);
    saLoadRecords();

    setTimeout(function() {
        el.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table').forEach(function(a) {
            a.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table');
        });
    }, 550);
}


// ── Load & Filter ──

function saLoadRecords() {
    var from = document.getElementById('sa-rec-from') ? document.getElementById('sa-rec-from').value : '';
    var to = document.getElementById('sa-rec-to') ? document.getElementById('sa-rec-to').value : '';

    var empIds = saRecDropdownState.emp.selected.join(',');
    var rateTypes = saRecDropdownState.rate.selected.join(',');

    var params = [];
    if (from) params.push('from=' + from);
    if (to) params.push('to=' + to);
    if (empIds) params.push('employeeId=' + empIds);
    if (rateTypes) params.push('rateType=' + rateTypes);
    var qs = params.length ? '?' + params.join('&') : '';

    var requestId = ++saRecordsRequestId;
    api('/site-attendance/work-records' + qs).then(function(data) {
        if (requestId !== saRecordsRequestId) return;
        saRecFilteredData = data || [];
        saRenderRecordsTable();
    }).catch(function(e) {
        if (requestId !== saRecordsRequestId) return;
        var container = document.getElementById('sa-records-table-area');
        if (container) container.innerHTML = '<div style="color:var(--danger);padding:20px;text-align:center">Load failed: ' + esc(e.message) + '</div>';
    });
}

function saQueueRecordsTable() {
    clearTimeout(saRecordsSearchTimer);
    saRecordsSearchTimer = setTimeout(saRenderRecordsTable, 120);
}

function saResetRecordsFilter() {
    document.getElementById('sa-rec-from').value = '';
    document.getElementById('sa-rec-to').value = '';
    document.getElementById('sa-rec-search').value = '';
    ['emp', 'rate', 'site'].forEach(function(type) {
        saRecDropdownState[type].selected = [];
        saRecUpdateDisplay(type);
    });
    saRecCurrentPage = 1;
    saLoadRecords();
}

function saRenderRecordsTable() {
    var container = document.getElementById('sa-records-table-area');
    if (!container) return;

    var searchEl = document.getElementById('sa-rec-search');
    var typed = searchEl ? searchEl.value.trim().toLowerCase() : '';

    var isAdmin = currentUser && currentUser.role === 'admin';

    var selectedSites = [];
    if (isAdmin) {
        selectedSites = saRecDropdownState.site.selected.map(function(v) { return parseInt(v); });
    } else {
        selectedSites = [currentUser ? currentUser.siteId || 0 : 0];
    }

    function getProjectName(pid) {
        if (!pid) return '—';
        for (var i = 0; i < SA_DB.projects.length; i++) {
            if (SA_DB.projects[i].id === pid) return SA_DB.projects[i].name;
        }
        return 'Proj ' + pid;
    }

    var groups = {};
    saRecFilteredData.forEach(function(r) {
        var key = r.employeeId + '_' + r.date;
        if (!groups[key]) {
            groups[key] = {
                employeeId: r.employeeId, employeeName: r.employeeName,
                siteId: r.siteId, date: r.date, projectId: r.projectId,
                clockIn: r.clockIn || '', clockOut: r.clockOut || '',
                hours: {}, totalHours: 0, totalAmount: 0,
                recordIds: {}, remark: r.remark || ''
            };
        }
        groups[key].hours[r.rateType] = parseFloat(r.hours) || 0;
        groups[key].totalHours += parseFloat(r.hours) || 0;
        groups[key].totalAmount += (parseFloat(r.hours) || 0) * (parseFloat(r.multiplier) || 1);
        groups[key].recordIds[r.rateType] = r.id;
    });

    var allGroups = Object.keys(groups).map(function(k) { return groups[k]; });

    var data = allGroups.filter(function(g) {
        var projName = getProjectName(g.projectId || 0);
        var searchText = ((g.employeeName || '') + ' ' + saGetSiteName(g.siteId || 0) + ' ' + projName + ' ' + (g.remark || '') + ' ' + (g.clockIn || '') + ' ' + (g.clockOut || '') + ' ' + g.date + ' ' + g.totalHours.toFixed(1) + ' ' + g.totalAmount.toFixed(2)).toLowerCase();
        var matchText = !typed || searchText.indexOf(typed) !== -1;
        var matchSite = selectedSites.length === 0 || selectedSites.indexOf(g.siteId || 0) !== -1;
        return matchText && matchSite;
    });

    data.sort(function(a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.employeeName.localeCompare(b.employeeName);
    });

    saRecDisplayData = data;

    if (!data.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--main-text3);padding:30px">No records found</div>';
        return;
    }

    // ── Pagination ──
    var totalPages = Math.ceil(data.length / saRecPageSize) || 1;
    if (saRecCurrentPage > totalPages) saRecCurrentPage = totalPages;
    if (saRecCurrentPage < 1) saRecCurrentPage = 1;
    var start = (saRecCurrentPage - 1) * saRecPageSize;
    var page = data.slice(start, start + saRecPageSize);

    // Grand totals for ALL data (not just page)
    var grandHours = 0, grandAmount = 0;
    data.forEach(function(g) {
        grandHours += g.totalHours;
        grandAmount += g.totalAmount;
    });

    var rows = page.map(function(g, i) {
        var rateCells = SA_DB.rates.map(function(r) {
            var c = SA_RATE_COLORS[r.name] || '#6b7280';
            var v = g.hours[r.name] || 0;
            return '<td style="text-align:right;font-family:var(--font-m);color:' + (v > 0 ? c : 'var(--main-text3)') + '">' + (v > 0 ? v.toFixed(1) : '—') + '</td>';
        }).join('');

        var recIds = JSON.stringify(g.recordIds).replace(/"/g, '&quot;');

        return '<tr>'
            + '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (start + i + 1) + '</td>'
            + '<td style="font-family:var(--font-m)">' + esc(g.date) + '</td>'
            + '<td style="font-weight:600">' + esc(g.employeeName) + '</td>'
            + '<td style="font-size:.82rem">' + esc(saGetSiteName(g.siteId || 0)) + '</td>'
            + '<td style="font-size:.82rem">' + esc(getProjectName(g.projectId || 0)) + '</td>'
            + '<td style="font-family:var(--font-m);font-size:.82rem;text-align:center">' + esc(g.clockIn || '—') + '</td>'
            + '<td style="font-family:var(--font-m);font-size:.82rem;text-align:center">' + esc(g.clockOut || '—') + '</td>'
            + rateCells
            + '<td style="text-align:right;font-family:var(--font-m);font-weight:700">' + g.totalHours.toFixed(1) + '</td>'
            + '<td style="text-align:right;font-family:var(--font-m);font-weight:700">' + g.totalAmount.toFixed(2) + '</td>'
            + '<td style="font-size:.82rem;color:var(--main-text2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(g.remark) + '">' + esc(g.remark || '—') + '</td>'
            + '<td><div class="actions-cell">'
            + '<button class="btn-icon" onclick="saEditRecordGroup(\'' + recIds + '\')" title="Edit">&#9998;</button> '
            + '<button class="btn-icon danger" onclick="saDeleteRecordGroup(\'' + recIds + '\')" title="Delete">&#10005;</button>'
            + '</div></td></tr>';
    }).join('');

    var rateHeaders = SA_DB.rates.map(function(r) {
        var c = SA_RATE_COLORS[r.name] || '#6b7280';
        return '<th style="text-align:right;background:' + c + '15">'
            + esc(SHORT[r.name] || r.label)
            + '<br><span style="font-size:.65rem;opacity:.7">x' + parseFloat(r.multiplier).toFixed(1) + '</span></th>';
    }).join('');

    var rateTotals = SA_DB.rates.map(function(r) {
        var sum = 0;
        data.forEach(function(g) { sum += g.hours[r.name] || 0; });
        var c = SA_RATE_COLORS[r.name] || '#6b7280';
        return '<td style="text-align:right;font-family:var(--font-m);font-weight:700;color:' + c + '">' + sum.toFixed(1) + '</td>';
    }).join('');

    // ── Pagination HTML ──
    var pagHtml = '';
    if (typeof buildPagination === 'function') {
        pagHtml = buildPagination(data.length, saRecCurrentPage, saRecPageSize,
            'goSARecPage', 'changeSARecPageSize', { label: 'records', sizes: [10, 25, 50, 100] });
    }

    container.innerHTML = ''
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        + '<span style="font-size:.82rem;color:var(--main-text3)">' + data.length + ' entries</span>'
        + '<span style="font-size:.82rem;color:var(--main-text2);font-weight:600">Total: ' + grandHours.toFixed(1) + ' hours / ' + grandAmount.toFixed(2) + ' units</span>'
        + '</div>'
        + '<div class="table-wrap"><table><thead><tr>'
        + '<th style="width:50px">No</th><th>Date</th><th>Employee</th><th>Site</th><th>Project</th>'
        + '<th style="text-align:center">Clock In</th><th style="text-align:center">Clock Out</th>'
        + rateHeaders
        + '<th style="text-align:right">Total Hrs</th><th style="text-align:right">Amount</th><th style="width:120px">Remark</th><th style="width:90px">Actions</th>'
        + '</tr></thead>'
        + '<tfoot><tr style="border-top:2px solid var(--main-border);font-weight:700">'
        + '<td colspan="7" style="padding:8px;text-align:right;font-size:.85rem">Total &rarr;</td>'
        + rateTotals
        + '<td style="text-align:right;font-family:var(--font-m);font-weight:700">' + grandHours.toFixed(1) + '</td>'
        + '<td style="text-align:right;font-family:var(--font-m);font-weight:700">' + grandAmount.toFixed(2) + '</td>'
        + '<td colspan="2"></td></tr></tfoot>'
        + '<tbody>' + rows + '</tbody></table></div>'
        + pagHtml;
}

function goSARecPage(page) {
    var totalPages = Math.ceil(saRecDisplayData.length / saRecPageSize) || 1;
    saRecCurrentPage = Math.max(1, Math.min(page, totalPages));
    saRenderRecordsTable();
}

function changeSARecPageSize(size) {
    saRecPageSize = parseInt(size);
    saRecCurrentPage = 1;
    saRenderRecordsTable();
}


// ── Edit / Delete / Export (unchanged) ──
function saEditRecordGroup(recIdsJson) {
    var recIds = JSON.parse(recIdsJson.replace(/&quot;/g, '"'));
    _saEditRecIds = recIds;

    var g = null;
    saRecFilteredData.forEach(function(r) {
        if (!g && recIds[r.rateType] === r.id) {
            g = {
                employeeId: r.employeeId, employeeName: r.employeeName,
                date: r.date, siteId: r.siteId || 0, projectId: r.projectId || 0,
                clockIn: r.clockIn || '', clockOut: r.clockOut || '',
                remark: r.remark || ''
            };
        }
    });
    if (!g) return;

    _saEditDate = g.date;

    // ── Project dropdown (same filter as print sheet) ──
    var projList = window._saProjectList || [];
    if (!projList.length && SA_DB.projects && SA_DB.scopes) {
        var targetNames = ['panel build', 'project'];
        var allowedCategoryIds = (SA_DB.scopes || [])
            .filter(function(s) {
                var n = (s.name || '').trim().toLowerCase();
                return targetNames.indexOf(n) !== -1;
            })
            .map(function(s) { return s.id; });
        var seenOther = false;
        projList = SA_DB.projects
            .filter(function(p) { return allowedCategoryIds.indexOf(p.categoryId) !== -1; })
            .filter(function(p) {
                if (p.name.trim().toLowerCase() === 'other') {
                    if (seenOther) return false;
                    seenOther = true;
                }
                return true;
            })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });
    }
    var projOpts = '<option value="">—</option>';
    projList.forEach(function(p) {
        projOpts += '<option value="' + p.id + '"' + (p.id === g.projectId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    var projField = '<div class="field"><label>Project</label><select class="input" id="sa-edit-project">' + projOpts + '</select></div>';

    var rateInputs = SA_DB.rates.map(function(r) {
        var recId = recIds[r.name];
        var rec = null;
        saRecFilteredData.forEach(function(x) {
            if (x.id === recId) rec = x;
        });
        var val = rec ? rec.hours : '';
        var c = SA_RATE_COLORS[r.name] || '#6b7280';
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
            + '<span style="width:80px;font-size:.82rem;font-weight:600;color:' + c + '">' + esc(SHORT[r.name] || r.label) + '</span>'
            + '<input class="input" id="sa-edit-h-' + r.name + '" type="number" step="0.25" min="0" value="' + val + '" style="width:80px;text-align:center;font-family:var(--font-m)">'
            + '<span style="font-size:.75rem;color:var(--main-text3)">×' + parseFloat(r.multiplier).toFixed(1) + '</span>'
            + '</div>';
    }).join('');

    function parse12(str) {
        if (!str) return { h: '', m: '', ap: '' };
        var p = str.trim().split(/\s+/);
        if (p.length === 2) {
            var hm = p[0].split(':');
            return { h: hm[0] || '', m: hm[1] || '', ap: p[1].toUpperCase() };
        }
        return { h: '', m: '', ap: '' };
    }

    var ci = parse12(g.clockIn);
    var co = parse12(g.clockOut);

    function timeHtml(prefix, h, m, ap) {
        var hours = '<option value=""></option>';
        for (var i = 1; i <= 12; i++) {
            var v = ('0' + i).slice(-2);
            hours += '<option value="' + v + '"' + (h === v ? ' selected' : '') + '>' + v + '</option>';
        }
        var minutes = '<option value=""></option>';
        for (var i = 0; i < 60; i++) {
            var v = ('0' + i).slice(-2);
            minutes += '<option value="' + v + '"' + (m === v ? ' selected' : '') + '>' + v + '</option>';
        }
        var apmp = '<option value=""></option><option value="AM"' + (ap === 'AM' ? ' selected' : '') + '>AM</option><option value="PM"' + (ap === 'PM' ? ' selected' : '') + '>PM</option>';
        var s = 'appearance:none;-webkit-appearance:none;border:1px solid var(--main-border);border-radius:6px;background:var(--main-bg);color:var(--main-text);font-family:var(--font-m);font-size:.82rem;padding:3px;text-align:center;outline:none;cursor:pointer;';
        return '<div style="display:inline-flex;align-items:center;gap:2px">'
            + '<select id="sa-edit-' + prefix + '-h" style="' + s + 'width:44px" onchange="saEditCalcDuration()">' + hours + '</select>'
            + '<span style="font-weight:700">:</span>'
            + '<select id="sa-edit-' + prefix + '-m" style="' + s + 'width:44px" onchange="saEditCalcDuration()">' + minutes + '</select>'
            + '<select id="sa-edit-' + prefix + '-ap" style="' + s + 'width:50px" onchange="saEditCalcDuration()">' + apmp + '</select>'
            + '</div>';
    }

    showModal(
        '<h3>Edit Record</h3>'
        + '<p style="font-size:.85rem;color:var(--main-text2);margin-bottom:16px">' + esc(g.employeeName) + ' — ' + esc(g.date) + '</p>'
        // ← Project only (site follows employee)
        + '<div style="margin-bottom:16px">' + projField + '</div>'
        + '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">'
        + '<div><label style="font-size:.75rem;color:var(--main-text3);display:block;margin-bottom:4px">Clock In</label>' + timeHtml('in', ci.h, ci.m, ci.ap) + '</div>'
        + '<div><label style="font-size:.75rem;color:var(--main-text3);display:block;margin-bottom:4px">Clock Out</label>' + timeHtml('out', co.h, co.m, co.ap) + '</div>'
        + '</div>'
        + '<h4 style="margin:0 0 10px;font-size:.85rem;font-family:var(--font-d)">Hours</h4>'
        + rateInputs
        + '<div class="field"><label>Remark</label><textarea class="input" id="sa-rec-edit-remark" rows="2">' + esc(g.remark || '') + '</textarea></div>'
        + '<p class="auth-error" id="sa-rec-edit-error"></p>'
        + '<div class="btns">'
        + '<button class="btn btn-ghost" onclick="hideModal()">Cancel</button>'
        + '<button class="btn btn-accent" onclick="saSaveRecordGroup()">Save</button></div>'
    );
}

function saEditCalcDuration() {
    var inH = document.getElementById('sa-edit-in-h');
    var inM = document.getElementById('sa-edit-in-m');
    var inAP = document.getElementById('sa-edit-in-ap');
    var outH = document.getElementById('sa-edit-out-h');
    var outM = document.getElementById('sa-edit-out-m');
    var outAP = document.getElementById('sa-edit-out-ap');

    if (!inH || !inM || !inAP || !outH || !outM || !outAP) return;

    // ← 不清空，等算好再填
    if (!inH.value || !inM.value || !inAP.value || !outH.value || !outM.value || !outAP.value) return;

    function toMin(h, m, ap) {
        h = parseInt(h);
        m = parseInt(m);
        if (ap.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }

    var inMin = toMin(inH.value, inM.value, inAP.value);
    var outMin = toMin(outH.value, outM.value, outAP.value);
    if (outMin <= inMin) outMin += 24 * 60;

    var dur = (outMin - inMin) / 60;
    dur = Math.round(dur * 4) / 4;

    // ← 拿日期判断星期，fallback 用 recIds 里的日期
    var dateStr = _saEditDate || '';
    if (!dateStr && _saEditRecIds) {
        // Try to find date from saRecFilteredData
        var someId = Object.keys(_saEditRecIds).map(function(k) { return _saEditRecIds[k]; })[0];
        saRecFilteredData.forEach(function(r) {
            if (r.id === someId) dateStr = r.date;
        });
    }

    var dow = -1;
    if (dateStr) {
        dow = new Date(dateStr + 'T00:00:00').getDay();
    }

    // 先清空所有 rate inputs
    SA_DB.rates.forEach(function(r) {
        var input = document.getElementById('sa-edit-h-' + r.name);
        if (input) input.value = '';
    });

    if (dow === 0) {
        // Sunday → 全部填 Sun
        var sun = document.getElementById('sa-edit-h-sunday');
        if (sun) sun.value = dur.toFixed(2);
    } else if (dow >= 1 && dow <= 6) {
        // Mon–Sat → ≤8h 填 NH，>8h NH=8 + OT=多出
        if (dur <= 8) {
            var nh = document.getElementById('sa-edit-h-normal');
            if (nh) nh.value = dur.toFixed(2);
        } else {
            var nh = document.getElementById('sa-edit-h-normal');
            if (nh) nh.value = '8.00';
            var ot = document.getElementById('sa-edit-h-ot');
            if (ot) ot.value = (dur - 8).toFixed(2);
        }
    }
    // PH → 不自动，手动
}

function saSaveRecordGroup() {
    var recIds = _saEditRecIds;
    if (!recIds) return;
    var errEl = document.getElementById('sa-rec-edit-error');
    var remark = document.getElementById('sa-rec-edit-remark').value.trim();

    // ← Project only
    var projEl = document.getElementById('sa-edit-project');
    var projectId = projEl ? parseInt(projEl.value) || 0 : 0;

    var inH = document.getElementById('sa-edit-in-h');
    var inM = document.getElementById('sa-edit-in-m');
    var inAP = document.getElementById('sa-edit-in-ap');
    var outH = document.getElementById('sa-edit-out-h');
    var outM = document.getElementById('sa-edit-out-m');
    var outAP = document.getElementById('sa-edit-out-ap');

    var clockIn = '';
    if (inH && inH.value && inM && inM.value && inAP && inAP.value) {
        clockIn = inH.value + ':' + inM.value + ' ' + inAP.value;
    }
    var clockOut = '';
    if (outH && outH.value && outM && outM.value && outAP && outAP.value) {
        clockOut = outH.value + ':' + outM.value + ' ' + outAP.value;
    }

    var promises = [];
    SA_DB.rates.forEach(function(r) {
        var input = document.getElementById('sa-edit-h-' + r.name);
        if (!input) return;
        var hours = parseFloat(input.value) || 0;
        var recId = recIds[r.name];
        if (!recId) return;

        promises.push(
            api('/site-attendance/work-records/' + recId, {
                method: 'PUT',
                body: {
                    hours: hours, multiplier: r.multiplier,
                    remark: remark,
                    clockIn: clockIn, clockOut: clockOut,
                    projectId: projectId
                }
            })
        );
    });

    Promise.all(promises).then(function() {
        hideModal();
        saLoadRecords();
    }).catch(function(e) {
        if (errEl) errEl.textContent = 'Failed: ' + e.message;
    });
}

function saDeleteRecordGroup(recIdsJson) {
    var recIds = JSON.parse(recIdsJson.replace(/&quot;/g, '"'));
    _saEditRecIds = recIds;

    var count = Object.keys(recIds).filter(function(k) { return recIds[k]; }).length;
    showModal(
        '<h3>Delete Record</h3>'
        + '<p style="color:var(--main-text2);line-height:1.6">Delete ' + count + ' record(s) for this employee on this date?</p>'
        + '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button>'
        + '<button class="btn btn-danger" onclick="saDoDeleteRecordGroup()">Delete</button></div>'
    );
}

function saDoDeleteRecordGroup() {
    var recIds = _saEditRecIds;
    if (!recIds) { hideModal(); return; }

    var ids = Object.keys(recIds).map(function(k) { return recIds[k]; }).filter(function(id) { return id; });

    if (!ids.length) { hideModal(); return; }

    var deleted = 0, failed = 0;
    var total = ids.length;

    ids.forEach(function(id) {
        api('/site-attendance/work-records/' + id, { method: 'DELETE' })
            .then(function() { deleted++; })
            .catch(function(e) { console.error('Delete fail:', e); failed++; })
            .then(function() {
                if (deleted + failed === total) {
                    hideModal();
                    if (failed) alert(failed + ' delete(s) failed');
                    saLoadRecords();
                }
            });
    });
}

function saDoDeleteRecord(id) {
    api('/site-attendance/work-records/' + id, { method: 'DELETE' })
        .then(function() { hideModal(); saLoadRecords(); })
        .catch(function(e) { alert('Delete failed: ' + e.message); });
}

function saExportRecords() {
    if (!saRecDisplayData || !saRecDisplayData.length) { alert('No data to export'); return; }
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded'); return; }

    function getProjectName(pid) {
        if (!pid) return '';
        for (var i = 0; i < SA_DB.projects.length; i++) {
            if (SA_DB.projects[i].id === pid) return SA_DB.projects[i].name;
        }
        return '';
    }

    var rows = saRecDisplayData.map(function(g) {
        var row = {
            'Date': g.date,
            'Employee': g.employeeName,
            'Site': saGetSiteName(g.siteId || 0),
            'Project': getProjectName(g.projectId || 0),
            'Clock In': g.clockIn || '',
            'Clock Out': g.clockOut || ''
        };
        SA_DB.rates.forEach(function(r) {
            row[SHORT[r.name] || r.label] = g.hours[r.name] || 0;
        });
        row['Total Hours'] = g.totalHours.toFixed(1);
        row['Amount'] = g.totalAmount.toFixed(2);
        row['Remark'] = g.remark || '';
        return row;
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Work Records');
    XLSX.writeFile(wb, 'work_records_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/* ==========================================================
   RATE SETTINGS PAGE
   ========================================================== */

function renderSARates() {
    var el = document.getElementById('sa-sa-rates');
    if (!el) return;
    var isAdmin = currentUser && currentUser.role === 'admin';

    var rateRows = SA_DB.rates.map(function(r, i) {
        return '<tr>'
            + '<td style="font-family:var(--font-m);color:var(--main-text3)">' + (i + 1) + '</td>'
            + '<td style="font-weight:600">' + esc(r.label) + '</td>'
            + '<td><input class="input" id="sa-rate-' + r.name + '" type="number" step="0.05" min="0" value="' + r.multiplier + '" '
            + (isAdmin ? '' : 'disabled') + ' style="width:80px;text-align:center;font-family:var(--font-m);padding:4px 8px"></td>'
            + '<td style="font-family:var(--font-m);font-size:.8rem;color:var(--main-text3)">1 hour = ' + r.multiplier.toFixed(2) + ' units</td>'
            + '</tr>';
    }).join('');

    el.innerHTML = ''
        + '<div class="app-header pt-anim-filter"><h2>Rate Settings</h2><div class="header-sub">' + (isAdmin ? 'Configure work hour rate multipliers' : 'View only (read only)') + '</div></div>'
        + '<div class="app-body">'
        + '<div class="pt-anim-head" style="background:var(--main-surface);border:1px solid var(--main-border);border-radius:var(--radius);padding:20px">'
        + '<h3 style="margin:0 0 16px;font-size:.95rem;font-family:var(--font-d)">Rate Multipliers</h3>'
        + '<div class="pt-anim-table"><div class="table-wrap"><table><thead><tr>'
        + '<th style="width:50px">No</th><th>Rate Type</th><th style="width:120px">Multiplier</th><th>Description</th>'
        + '</tr></thead><tbody>' + rateRows + '</tbody></table></div></div>'
        + (isAdmin ? '<div style="margin-top:16px"><button class="btn btn-accent" onclick="saSaveRates()">Save Rates</button></div>'
                   : '<div style="margin-top:12px;font-size:.8rem;color:var(--main-text3)">&#9888; Only Admin can edit rates.</div>')
        + '</div></div>';

    setTimeout(function() {
        el.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table').forEach(function(a) {
            a.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table');
        });
    }, 550);
}

function saSaveRates() {
    if (!currentUser || currentUser.role !== 'admin') {
        showModal(
            '<h3>⛔ Access Denied</h3>'
            + '<p style="color:var(--main-text2);line-height:1.6">Only Admin can edit rates.</p>'
            + '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">OK</button></div>'
        );
        return;
    }
    var rates = [];
    SA_DB.rates.forEach(function(r) {
        var input = document.getElementById('sa-rate-' + r.name);
        var val = input ? (parseFloat(input.value) || r.multiplier) : r.multiplier;
        rates.push({ name: r.name, multiplier: val });
        // ← 只更新本地数据，不重新渲染
        r.multiplier = val;
    });
    api('/site-attendance/rates', { method: 'PUT', body: { rates: rates } })
        .then(function() {
            showModal(
                '<h3>✅ Rates Saved</h3>'
                + '<p style="color:var(--main-text2);line-height:1.6">All rate multipliers have been updated.</p>'
                + '<div class="btns"><button class="btn btn-accent" onclick="hideModal()">OK</button></div>'
            );
        })
        .catch(function(e) {
            showModal(
                '<h3>❌ Save Failed</h3>'
                + '<p style="color:var(--danger);line-height:1.6">' + esc(e.message) + '</p>'
                + '<div class="btns"><button class="btn btn-ghost" onclick="hideModal()">OK</button></div>'
            );
        });
}

/* ==========================================================
   EMPLOYEE LIST (CRUD) — 保持原有不变
   ========================================================== */

var saEmpFirstRender = true;
function renderSAEmployees() {
    var el = document.getElementById('sa-sa-employees');
    if (!el) return;

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
        rows = '<tr><td colspan="9" style="text-align:center;color:var(--main-text3);padding:30px">No employees found</td></tr>';
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
                + '<td style="font-size:.82rem">' + esc(saGetSiteName(e.site_id || 0)) + '</td>'
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

    var animF = saEmpFirstRender ? ' pt-anim-filter' : '';
    var animH = saEmpFirstRender ? ' pt-anim-head' : '';
    var animT = saEmpFirstRender ? ' pt-anim-table' : '';

    el.innerHTML = ''
        + '<div class="app-header' + animF + '">'
        + '<h2 style="margin:0">Employees</h2><div class="header-sub">Manage site attendance employees</div>'
        + '</div>'
        + '<div class="app-body">'
        + '<div class="' + animH.trim() + '" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">'
        + '<input type="text" class="input" id="sa-emp-search" placeholder="Search name, NRIC, company, phone, remark..." value="' + esc(searchVal) + '" oninput="saEmpCurrentPage=1;renderSAEmployees()" style="max-width:300px">'
        + '<select class="input" id="sa-emp-status-filter" onchange="saEmpCurrentPage=1;renderSAEmployees()" style="width:130px">'
        + '<option value="all"' + (statusVal === 'all' ? ' selected' : '') + '>All Status</option>'
        + '<option value="active"' + (statusVal === 'active' ? ' selected' : '') + '>Active</option>'
        + '<option value="inactive"' + (statusVal === 'inactive' ? ' selected' : '') + '>Inactive</option>'
        + '</select>'
        + '<span style="font-size:.78rem;color:var(--main-text3)">' + list.length + ' employees</span>'
        + '<button class="btn btn-green" onclick="showSAAddEmployee()" style="margin-left:auto">+ Add Employee</button>'
        + '</div>'
        + '<div class="' + animT.trim() + '"><div class="table-wrap"><table><thead><tr>'
        + '<th style="width:50px">No</th><th>Name</th><th>NRIC/Passport</th><th>Company</th><th>Site</th><th>Phone</th><th>Remark</th><th style="width:80px">Status</th><th style="width:90px">Actions</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        + pagHtml
        + '</div>'
        + '</div>';

    if (focusedId === 'sa-emp-search') {
        var input = document.getElementById('sa-emp-search');
        if (input) {
            input.focus();
            input.setSelectionRange(selStart, selEnd);
        }
    }

    if (saEmpFirstRender) {
        setTimeout(function() {
            el.querySelectorAll('.pt-anim-filter, .pt-anim-head, .pt-anim-table').forEach(function(a) {
                a.classList.remove('pt-anim-filter', 'pt-anim-head', 'pt-anim-table');
            });
            saEmpFirstRender = false;
        }, 550);
    }
}

function showSAAddEmployee() {
    if (typeof showModal !== 'function') return;
    showModal(
        '<h3>Add Employee</h3>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="field" style="grid-column:1/-1"><label>Name *</label><input class="input" id="sa-emp-name"></div>'
        + '<div class="field"><label>NRIC / Passport</label><input class="input" id="sa-emp-nric"></div>'
        + '<div class="field"><label>Company</label><input class="input" id="sa-emp-company"></div>'
        + '<div style="grid-column:1/-1">' + saGetSiteField(0) + '</div>'
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

    var siteId = 0;
    var siteEl = document.getElementById('sa-emp-site');
    if (siteEl) {
        siteId = parseInt(siteEl.value) || 0;
    }
    // admin → 必须选
    if (currentUser && currentUser.role === 'admin' && !siteId) {
        errEl.textContent = 'Please select a Site'; return;
    }
    // site_admin → 自动填自己的 site
    if (currentUser && currentUser.role === 'site_admin') {
        siteId = currentUser.siteId || 0;
    }

    var dup = saCheckDuplicate(name, nric, phone, null);
    if (dup) { errEl.textContent = dup; return; }
    try {
        await api('/site-attendance/employees', {
            method: 'POST',
            body: {
                name: name,
                nric: nric,
                company: document.getElementById('sa-emp-company').value.trim(),
                phone: phone,
                status: document.getElementById('sa-emp-status').value,
                remark: document.getElementById('sa-emp-remark').value.trim(),
                // ↓↓↓ 新增 ↓↓↓
                site_id: siteId
                // ↑↑↑ 结束 ↑↑↑
            }
        });
        hideModal();
        await saLoadDB();
        renderSAEmployees();
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
}

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
        + '<div style="grid-column:1/-1">' + saGetSiteField(emp.site_id || 0) + '</div>'
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

    var siteId = 0;
    var siteEl = document.getElementById('sa-emp-site');
    if (siteEl) {
        siteId = parseInt(siteEl.value) || 0;
    }
    // admin → 必须选
    if (currentUser && currentUser.role === 'admin' && !siteId) {
        errEl.textContent = 'Please select a Site'; return;
    }
    // site_admin → 自动填自己的 site
    if (currentUser && currentUser.role === 'site_admin') {
        siteId = currentUser.siteId || 0;
    }

    var dup = saCheckDuplicate(name, nric, phone, id);
    if (dup) { errEl.textContent = dup; return; }
    try {
        await api('/site-attendance/employees/' + id, {
            method: 'PUT',
            body: {
                name: name,
                nric: nric,
                company: document.getElementById('sa-emp-company').value.trim(),
                phone: phone,
                status: document.getElementById('sa-emp-status').value,
                remark: document.getElementById('sa-emp-remark').value.trim(),
                // ↓↓↓ 新增 ↓↓↓
                site_id: siteId
                // ↑↑↑ 结束 ↑↑↑
            }
        });
        hideModal();
        await saLoadDB();
        renderSAEmployees();
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
}

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
