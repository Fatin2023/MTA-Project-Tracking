/* ==========================================================
   MULTI-SELECT COMPONENT HELPERS
   ========================================================== */
var _msState = {};
var _msCallbacks = {};
var _msIds = new Set();

function msGenerate(id, options, placeholder) {
    _msIds.add(id);
    _msState[id] = new Set();
    _msState[id + '_opts'] = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    _msState[id + '_ph'] = placeholder || 'Select...';

    var itemsHtml = _msState[id + '_opts'].length > 0
        ? _msState[id + '_opts'].map(function(o) {
            return '<label class="multi-select-item" onclick="event.stopPropagation()">' +
                '<input type="checkbox" value="' + o.value + '" ' +
                'onchange="msOnCheck(\'' + id + '\', this.value, this.checked)">' +
                '<span>' + esc(o.label) + '</span></label>';
        }).join('')
        : '<div style="padding:14px;text-align:center;color:var(--main-text3);font-size:.82rem">No options</div>';

    return '<div class="multi-select" id="' + id + '-wrap">' +
        '<div class="multi-select-trigger" onclick="msToggle(\'' + id + '\')">' +
            '<span class="ms-display" id="' + id + '-disp">' + esc(placeholder || 'Select...') + '</span>' +
            '<span class="arrow">&#9662;</span>' +
        '</div>' +
        '<div class="multi-select-dropdown">' +
            '<div class="multi-select-actions">' +
                '<button type="button" onclick="msSelectAll(\'' + id + '\');event.stopPropagation()">Select All</button>' +
                '<button type="button" onclick="msClear(\'' + id + '\');event.stopPropagation()">Clear</button>' +
            '</div>' +
            itemsHtml +
        '</div>' +
    '</div>';
}

function msToggle(id) {
    _msIds.forEach(function(k) {
        if (k !== id) {
            var wrap = document.getElementById(k + '-wrap');
            if (wrap) wrap.classList.remove('open');
        }
    });
    var wrap = document.getElementById(id + '-wrap');
    if (wrap) wrap.classList.toggle('open');
}

function msOnCheck(id, value, checked) {
    if (!_msState[id]) return;
    if (checked) _msState[id].add(String(value));
    else _msState[id].delete(String(value));
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msSelectAll(id) {
    var opts = _msState[id + '_opts'] || [];
    _msState[id] = new Set(opts.map(function(o) { return String(o.value); }));
    msSyncCheckboxes(id);
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msClear(id) {
    if (_msState[id]) _msState[id].clear();
    msSyncCheckboxes(id);
    msUpdateDisplay(id);
    if (_msCallbacks[id]) _msCallbacks[id](msGetValues(id));
}

function msSyncCheckboxes(id) {
    var wrap = document.getElementById(id + '-wrap');
    if (!wrap) return;
    var cbs = wrap.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = _msState[id] ? _msState[id].has(String(cbs[i].value)) : false;
    }
}

function msUpdateDisplay(id) {
    var el = document.getElementById(id + '-disp');
    if (!el) return;
    var sel = _msState[id];
    var ph = _msState[id + '_ph'] || 'Select...';
    if (!sel || sel.size === 0) {
        el.textContent = ph;
        el.style.color = '';
        return;
    }
    var opts = _msState[id + '_opts'] || [];
    var matches = opts.filter(function(o) { return sel.has(String(o.value)); });
    if (matches.length === 1) {
        el.textContent = matches[0].label;
        el.style.color = 'var(--main-text)';
    } else {
        el.innerHTML = '<span class="multi-select-count">' + matches.length + ' selected</span>';
    }
}

function msGetValues(id) {
    if (!_msState[id]) return [];
    return Array.from(_msState[id]).map(Number);
}

function msRebuild(id, options, keepSelection) {
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });

    var prev = keepSelection && _msState[id] ? new Set(_msState[id]) : new Set();
    _msState[id + '_opts'] = sorted;
    var validSet = new Set(sorted.map(function(o) { return String(o.value); }));
    _msState[id] = new Set(Array.from(prev).filter(function(v) { return validSet.has(v); }));

    var wrap = document.getElementById(id + '-wrap');
    if (!wrap) return;
    var dd = wrap.querySelector('.multi-select-dropdown');
    if (!dd) return;

    var actionsHtml = '<div class="multi-select-actions">' +
        '<button type="button" onclick="msSelectAll(\'' + id + '\');event.stopPropagation()">Select All</button>' +
        '<button type="button" onclick="msClear(\'' + id + '\');event.stopPropagation()">Clear</button>' +
    '</div>';

    var itemsHtml = sorted.length > 0
        ? sorted.map(function(o) {
            var chk = _msState[id].has(String(o.value)) ? 'checked ' : '';
            return '<label class="multi-select-item" onclick="event.stopPropagation()">' +
                '<input type="checkbox" value="' + o.value + '" ' + chk +
                'onchange="msOnCheck(\'' + id + '\', this.value, this.checked)">' +
                '<span>' + esc(o.label) + '</span></label>';
        }).join('')
        : '<div style="padding:14px;text-align:center;color:var(--main-text3);font-size:.82rem">No options</div>';

    dd.innerHTML = actionsHtml + itemsHtml;
    msUpdateDisplay(id);
}

function msOnChange(id, fn) {
    _msCallbacks[id] = fn;
}

/* Close dropdowns on outside click */
document.addEventListener('click', function(e) {
    _msIds.forEach(function(id) {
        var wrap = document.getElementById(id + '-wrap');
        if (wrap && !wrap.contains(e.target)) {
            wrap.classList.remove('open');
        }
    });
});

/* ==========================================================
   Searchable Select Component (Single - for modals)
   ========================================================== */
var _ssInstances = {};

function ssCreate(containerId, options, placeholder, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    _ssInstances[containerId] = {
        options: options.slice(),
        selected: '',
        placeholder: placeholder || '-- Select --',
        onChange: onChange || null,
        filter: '',
        open: false
    };
    _ssRender(containerId);
}

function ssUpdate(containerId, options, keepSelected) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.options = options.slice();
    inst.filter = '';
    if (!keepSelected) inst.selected = '';
    if (keepSelected && inst.selected) {
        var found = options.find(function(o) { return String(o.value) === String(inst.selected); });
        if (!found) inst.selected = '';
    }
    _ssRender(containerId);
}

function ssGetValue(containerId) {
    var inst = _ssInstances[containerId];
    return inst ? inst.selected : '';
}

function ssSetValue(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = String(val);
    _ssRender(containerId);
}

function ssClear(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = '';
    inst.filter = '';
    _ssRender(containerId);
}

function ssGetFiltered(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return [];
    var f = inst.filter.toLowerCase();
    if (!f) return inst.options;
    return inst.options.filter(function(o) { return o.label.toLowerCase().indexOf(f) !== -1; });
}

function _ssRender(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    var container = document.getElementById(containerId);
    if (!container) return;

    var selectedLabel = inst.placeholder;
    if (inst.selected) {
        var found = inst.options.find(function(o) { return String(o.value) === String(inst.selected); });
        if (found) selectedLabel = found.label;
    }

    var filtered = ssGetFiltered(containerId);
    var displayFilter = inst.open ? inst.filter : '';

    var html =
        '<div class="ss-wrapper" style="position:relative">' +
            '<div class="ss-display input" onclick="ssToggle(\'' + containerId + '\')" ' +
                'style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none">' +
                '<span style="' + (!inst.selected ? 'color:var(--main-text3)' : 'color:var(--main-text)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' +
                    esc(selectedLabel) +
                '</span>' +
                '<span style="margin-left:8px;color:var(--main-text3);font-size:.7rem;flex-shrink:0">' +
                    (inst.open ? '&#9650;' : '&#9660;') +
                '</span>' +
            '</div>' +
            (inst.open
                ? '<div class="ss-dropdown" style="position:absolute;top:100%;left:0;right:0;z-index:9999;' +
                    'background:var(--main-surface);border:1px solid var(--main-border);border-top:none;' +
                    'border-radius:0 0 var(--radius,6px) var(--radius,6px);max-height:260px;overflow:hidden;' +
                    'box-shadow:0 4px 12px rgba(0,0,0,.15)">' +
                    '<div style="padding:6px 8px;border-bottom:1px solid var(--main-border)">' +
                        '<input class="input ss-search" type="text" placeholder="Search..." ' +
                            'value="' + esc(displayFilter) + '" ' +
                            'oninput="ssOnFilter(\'' + containerId + '\', this.value)" ' +
                            'onclick="event.stopPropagation()" ' +
                            'style="width:100%;padding:6px 8px;font-size:.82rem;border:1px solid var(--main-border);' +
                            'border-radius:4px;outline:none;background:var(--main-input-bg);color:var(--main-text)">' +
                    '</div>' +
                    '<div class="ss-options" style="overflow-y:auto;max-height:210px">' +
                        (filtered.length === 0
                            ? '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results found</div>'
                            : '<div class="ss-option" data-value="" onclick="ssSelect(\'' + containerId + '\',\'\')" ' +
                                'style="padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--main-text3);' +
                                'border-bottom:1px solid var(--main-border);font-style:italic">' +
                                esc(inst.placeholder) +
                              '</div>' +
                              filtered.map(function(o) {
                                  var isSelected = String(o.value) === String(inst.selected);
                                  return '<div class="ss-option" data-value="' + o.value + '" ' +
                                      'onclick="ssSelect(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\')" ' +
                                      'onmouseover="this.style.background=\'#2563eb\';this.style.color=\'#fff\'" ' +
                                      'onmouseout="this.style.background=\'' + (isSelected ? '#2563eb' : 'transparent') + '\';this.style.color=\'' + (isSelected ? '#fff' : 'var(--main-text)') + '\'" ' +
                                      'style="padding:8px 12px;cursor:pointer;font-size:.82rem;' +
                                      (isSelected
                                          ? 'background:#2563eb;color:#fff;font-weight:600'
                                          : 'background:transparent;color:var(--main-text)') +
                                      ';border-bottom:1px solid var(--main-border)">' +
                                      esc(o.label) +
                                      '</div>';
                              }).join('')
                        ) +
                    '</div>' +
                '</div>'
                : ''
            ) +
        '</div>';

    container.innerHTML = html;

    if (inst.open) {
        setTimeout(function() {
            var searchEl = container.querySelector('.ss-search');
            if (searchEl) searchEl.focus();
        }, 10);
    }
}

function ssToggle(containerId) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    Object.keys(_ssInstances).forEach(function(id) {
        if (id !== containerId && _ssInstances[id].open) {
            _ssInstances[id].open = false;
            _ssInstances[id].filter = '';
            _ssRender(id);
        }
    });
    if (typeof _ssmInstances !== 'undefined') {
        Object.keys(_ssmInstances).forEach(function(id) {
            if (_ssmInstances[id].open) {
                _ssmInstances[id].open = false;
                _ssmInstances[id].filter = '';
                _ssmRender(id);
            }
        });
    }
    inst.open = !inst.open;
    inst.filter = '';
    _ssRender(containerId);
}

function ssOnFilter(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.filter = val;
    var container = document.getElementById(containerId);
    if (!container) return;
    var optionsDiv = container.querySelector('.ss-options');
    if (!optionsDiv) return;
    var filtered = ssGetFiltered(containerId);
    optionsDiv.innerHTML =
        (filtered.length === 0
            ? '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results found</div>'
            : '<div class="ss-option" data-value="" onclick="ssSelect(\'' + containerId + '\',\'\')" ' +
                'style="padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--main-text3);' +
                'border-bottom:1px solid var(--main-border);font-style:italic">' +
                esc(inst.placeholder) +
              '</div>' +
              filtered.map(function(o) {
                  var isSelected = String(o.value) === String(inst.selected);
                  return '<div class="ss-option" data-value="' + o.value + '" ' +
                      'onclick="ssSelect(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\')" ' +
                      'style="padding:8px 12px;cursor:pointer;font-size:.82rem;' +
                      (isSelected
                          ? 'background:var(--main-accent-bg,rgba(99,102,241,.1));color:var(--main-accent,#6366f1);font-weight:600'
                          : 'color:var(--main-text)') +
                      ';border-bottom:1px solid var(--main-border,rgba(0,0,0,.05))">' +
                      esc(o.label) +
                      '</div>';
              }).join('')
        );
}

function ssSelect(containerId, val) {
    var inst = _ssInstances[containerId];
    if (!inst) return;
    inst.selected = String(val);
    inst.open = false;
    inst.filter = '';
    _ssRender(containerId);
    if (inst.onChange) inst.onChange(val);
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.ss-wrapper') && !e.target.closest('.ssm-wrapper')) {
        Object.keys(_ssInstances).forEach(function(id) {
            if (_ssInstances[id].open) {
                _ssInstances[id].open = false;
                _ssInstances[id].filter = '';
                _ssRender(id);
            }
        });
        if (typeof _ssmInstances !== 'undefined') {
            Object.keys(_ssmInstances).forEach(function(id) {
                if (_ssmInstances[id].open) {
                    _ssmInstances[id].open = false;
                    _ssmInstances[id].filter = '';
                    _ssmRender(id);
                }
            });
        }
    }
});

/* ==========================================================
   Searchable Multi-Select Component (for filters)
   ========================================================== */
var _ssmInstances = {};

function ssmCreate(containerId, options, placeholder) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        // 数字开头的排前面
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    _ssmInstances[containerId] = {
        options: sorted,
        selected: [],
        placeholder: placeholder || 'All',
        filter: '',
        open: false,
        onChange: null
    };
    _ssmRender(containerId);
}

function ssmUpdate(containerId, options, keepSelected) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var sorted = options.slice().sort(function(a, b) {
        var al = a.label.toLowerCase();
        var bl = b.label.toLowerCase();
        var aNum = /^\d/.test(al);
        var bNum = /^\d/.test(bl);
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return al.localeCompare(bl, undefined, { numeric: true });
    });
    inst.options = sorted;
    inst.filter = '';
    if (keepSelected) {
        var validValues = sorted.map(function(o) { return String(o.value); });
        inst.selected = inst.selected.filter(function(v) { return validValues.indexOf(String(v)) !== -1; });
    } else {
        inst.selected = [];
    }
    _ssmRender(containerId);
}

function ssmGetValues(containerId) {
    var inst = _ssmInstances[containerId];
    return inst ? inst.selected.map(function(v) { return parseInt(v); }) : [];
}

function ssmClear(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    inst.selected = [];
    inst.filter = '';
    _ssmRender(containerId);
    if (inst.onChange) inst.onChange([]);
}

function ssmOnChange(containerId, callback) {
    var inst = _ssmInstances[containerId];
    if (inst) inst.onChange = callback;
}

function _ssmGetFiltered(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return [];
    var f = inst.filter.toLowerCase();
    if (!f) return inst.options;
    return inst.options.filter(function(o) { return o.label.toLowerCase().indexOf(f) !== -1; });
}

function _ssmRender(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var container = document.getElementById(containerId);
    if (!container) return;

    var count = inst.selected.length;
    var displayText = inst.placeholder;
    if (count === 1) {
        var found = inst.options.find(function(o) { return String(o.value) === String(inst.selected[0]); });
        displayText = found ? found.label : inst.selected[0];
    } else if (count > 1) {
        displayText = count + ' selected';
    }

    var filtered = _ssmGetFiltered(containerId);

    var html = '<div class="ssm-wrapper" style="position:relative">' +
        '<div class="ssm-display" onclick="ssmToggle(\'' + containerId + '\')" ' +
            'style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;' +
            'background:var(--main-input-bg);border:1px solid var(--main-border);border-radius:6px;' +
            'cursor:pointer;font-size:.82rem;min-height:36px;user-select:none;gap:6px;color:var(--main-text)">' +
            '<span style="' + (count === 0 ? 'color:var(--main-text3)' : 'color:var(--main-text)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' +
                esc(displayText) +
            '</span>' +
            (count > 0
                ? '<span onclick="event.stopPropagation();ssmClear(\'' + containerId + '\');_ssmRender(\'' + containerId + '\')" style="color:var(--main-text3);font-size:.85rem;cursor:pointer;flex-shrink:0" title="Clear">&times;</span>'
                : '<span style="color:var(--main-text3);font-size:.7rem;flex-shrink:0">' + (inst.open ? '&#9650;' : '&#9660;') + '</span>'
            ) +
        '</div>';

    if (inst.open) {
        html += '<div class="ssm-dropdown" style="position:absolute;top:100%;left:0;right:0;z-index:9999;' +
            'background:var(--main-surface);border:1px solid var(--main-border);border-top:none;' +
            'border-radius:0 0 6px 6px;max-height:300px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.15)">';

        html += '<div style="padding:6px 8px;border-bottom:1px solid var(--main-border)">' +
            '<input class="input ssm-search" type="text" placeholder="Search..." ' +
            'value="' + esc(inst.filter) + '" ' +
            'oninput="ssmOnFilter(\'' + containerId + '\', this.value)" ' +
            'onclick="event.stopPropagation()" ' +
            'style="width:100%;padding:6px 8px;font-size:.8rem;border:1px solid var(--main-border);' +
            'border-radius:4px;outline:none;background:var(--main-input-bg);color:var(--main-text)">' +
            '</div>';

        html += '<div style="display:flex;gap:10px;padding:5px 8px;border-bottom:1px solid var(--main-border);font-size:.75rem">' +
            '<a href="javascript:void(0)" onclick="ssmSelectAll(\'' + containerId + '\')" style="color:var(--accent);text-decoration:none">Select All</a>' +
            '<a href="javascript:void(0)" onclick="ssmClear(\'' + containerId + '\');_ssmRender(\'' + containerId + '\')" style="color:var(--main-text3);text-decoration:none">Clear</a>' +
            '</div>';

        html += '<div class="ssm-options" style="overflow-y:auto;max-height:200px">';
        if (filtered.length === 0) {
            html += '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results</div>';
        } else {
            filtered.forEach(function(o) {
                var checked = inst.selected.indexOf(String(o.value)) !== -1;
                html += '<label onmouseover="this.style.background=\'#2563eb\';this.style.color=\'#fff\';this.querySelector(\'span\').style.color=\'#fff\'" onmouseout="this.style.background=\'' + (checked ? '#2563eb' : 'transparent') + '\';this.style.color=\'' + (checked ? '#fff' : 'var(--main-text)') + '\';this.querySelector(\'span\').style.color=\'' + (checked ? '#fff' : 'var(--main-text)') + '\'" ' +
                    'style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:.82rem;' +
                    (checked ? 'background:#2563eb;color:#fff;font-weight:600' : 'background:transparent;color:var(--main-text)') + ';border-bottom:1px solid var(--main-border)">' +
                    '<input type="checkbox" ' + (checked ? 'checked' : '') + ' ' +
                    'onchange="ssmToggleOption(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\',this.checked)" ' +
                    'style="accent-color:var(--accent)">' +
                    '<span>' + esc(o.label) + '</span>' +
                    '</label>';
            });
        }
        html += '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html;

    if (inst.open) {
        setTimeout(function() {
            var el = container.querySelector('.ssm-search');
            if (el) el.focus();
        }, 10);
    }
}

function ssmToggle(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    Object.keys(_ssmInstances).forEach(function(id) {
        if (id !== containerId && _ssmInstances[id].open) {
            _ssmInstances[id].open = false;
            _ssmInstances[id].filter = '';
            _ssmRender(id);
        }
    });
    if (typeof _ssInstances !== 'undefined') {
        Object.keys(_ssInstances).forEach(function(id) {
            if (_ssInstances[id] && _ssInstances[id].open) {
                _ssInstances[id].open = false;
                _ssInstances[id].filter = '';
                _ssRender(id);
            }
        });
    }
    inst.open = !inst.open;
    inst.filter = '';
    _ssmRender(containerId);
}

function ssmOnFilter(containerId, val) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    inst.filter = val;
    var container = document.getElementById(containerId);
    if (!container) return;
    var optionsDiv = container.querySelector('.ssm-options');
    if (!optionsDiv) return;
    var filtered = _ssmGetFiltered(containerId);
    if (filtered.length === 0) {
        optionsDiv.innerHTML = '<div style="padding:10px 12px;color:var(--main-text3);font-size:.82rem;text-align:center">No results</div>';
        return;
    }
    optionsDiv.innerHTML = filtered.map(function(o) {
        var checked = inst.selected.indexOf(String(o.value)) !== -1;
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:.82rem;' +
            (checked ? 'background:var(--accent-soft)' : '') + ';border-bottom:1px solid var(--main-border)">' +
            '<input type="checkbox" ' + (checked ? 'checked' : '') + ' ' +
            'onchange="ssmToggleOption(\'' + containerId + '\',\'' + String(o.value).replace(/'/g, "\\'") + '\',this.checked)" ' +
            'style="accent-color:var(--accent)">' +
            '<span style="color:var(--main-text)">' + esc(o.label) + '</span>' +
            '</label>';
    }).join('');
}

function ssmToggleOption(containerId, val, checked) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var strVal = String(val);
    if (checked) {
        if (inst.selected.indexOf(strVal) === -1) inst.selected.push(strVal);
    } else {
        inst.selected = inst.selected.filter(function(v) { return String(v) !== strVal; });
    }
    // 保存 scroll 位置
    var container = document.getElementById(containerId);
    var optionsDiv = container ? container.querySelector('.ssm-options') : null;
    var scrollTop = optionsDiv ? optionsDiv.scrollTop : 0;
    _ssmRender(containerId);
    // 恢复 scroll 位置
    var newContainer = document.getElementById(containerId);
    var newOptionsDiv = newContainer ? newContainer.querySelector('.ssm-options') : null;
    if (newOptionsDiv) newOptionsDiv.scrollTop = scrollTop;
    if (inst.onChange) inst.onChange(inst.selected.slice());
}

function ssmSelectAll(containerId) {
    var inst = _ssmInstances[containerId];
    if (!inst) return;
    var filtered = _ssmGetFiltered(containerId);
    inst.selected = filtered.map(function(o) { return String(o.value); });
    var container = document.getElementById(containerId);
    var optionsDiv = container ? container.querySelector('.ssm-options') : null;
    var scrollTop = optionsDiv ? optionsDiv.scrollTop : 0;
    _ssmRender(containerId);
    var newContainer = document.getElementById(containerId);
    var newOptionsDiv = newContainer ? newContainer.querySelector('.ssm-options') : null;
    if (newOptionsDiv) newOptionsDiv.scrollTop = scrollTop;
    if (inst.onChange) inst.onChange(inst.selected.slice());
}