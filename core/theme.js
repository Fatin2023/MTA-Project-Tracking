// ============================================================
// THEME
// ============================================================
function getActiveLayout() {
    const layouts = document.querySelectorAll('.app-layout.active');
    return layouts.length > 0 ? layouts[0].id : null;
}

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeUI(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeUI(next);
}

function updateThemeUI(theme) {
    const isDark = theme === 'dark';
    document.querySelectorAll('.theme-icon').forEach(icon => {
        icon.innerHTML = isDark ? '&#9788;' : '&#9790;';
    });
    document.querySelectorAll('.theme-label').forEach(label => {
        label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    });
}

initTheme();