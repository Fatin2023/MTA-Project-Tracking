/* ===== Pull to Refresh (Mobile) ===== */
let _ptrStartY = 0, _ptrPulling = false, _ptrRefreshing = false;

const _ptrRefreshData = async () => {
    if (_ptrRefreshing) return;
    _ptrRefreshing = true;

    const indicator = document.querySelector('.ptr-indicator');
    if (indicator) {
        indicator.classList.remove('pulling');
        indicator.classList.add('refreshing');
        indicator.querySelector('.ptr-text').textContent = 'Refreshing...';
    }

    try {
        const savedModule = localStorage.getItem('multitrade_module') || 'attendance';
        if (savedModule === 'panel') {
            await ptLoadDB();
            const activePage = localStorage.getItem('multitrade_pt_page') || 'pt-dashboard';
            if (typeof ptNav === 'function') ptNav(activePage);
        } else {
            await loadDB();
            if (currentUser.role === 'admin' || currentUser.role === 'viewer') {
                const activePage = localStorage.getItem('multitrade_admin_page') || 'projects';
                if (typeof adminNav === 'function') adminNav(activePage);
            } else {
                const activePage = localStorage.getItem('multitrade_emp_page') || 'attendance';
                if (typeof empNav === 'function') empNav(activePage);
            }
        }
        showToast('Data refreshed');
    } catch (e) {
        // session 过期，跳回登录
        if (e.message && (e.message.includes('401') || e.message.includes('Unauthorized'))) {
            showToast('Session expired, please login again');
            setTimeout(() => doLogout(), 1000);
        } else {
            showToast('Refresh failed');
        }
    }

    if (indicator) {
        indicator.classList.remove('refreshing');
        indicator.querySelector('.ptr-text').textContent = '';
    }
    _ptrRefreshing = false;
};

const initPullToRefresh = () => {
    const main = document.querySelector('.app-layout.active .app-main');
    if (!main) return;

    if (!main.querySelector('.ptr-indicator')) {
        const div = document.createElement('div');
        div.className = 'ptr-indicator';
        div.innerHTML = '<span class="ptr-spinner"></span><span class="ptr-text"></span>';
        main.insertBefore(div, main.firstChild);
    }

    // 先移除旧监听，防止重复绑定
    main.removeEventListener('touchstart', _ptrTouchStart);
    main.removeEventListener('touchmove', _ptrTouchMove);
    main.removeEventListener('touchend', _ptrTouchEnd);

    main.addEventListener('touchstart', _ptrTouchStart, { passive: true });
    main.addEventListener('touchmove', _ptrTouchMove, { passive: false });
    main.addEventListener('touchend', _ptrTouchEnd, { passive: true });
};

function _ptrTouchStart(e) {
    if (_ptrRefreshing) return;
    const main = e.currentTarget;
    if (main.scrollTop > 0) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrPulling = true;
}

function _ptrTouchMove(e) {
    if (!_ptrPulling || _ptrRefreshing) return;
    const main = e.currentTarget;
    if (main.scrollTop > 0) { _ptrPulling = false; return; }

    const diff = e.touches[0].clientY - _ptrStartY;
    const indicator = main.querySelector('.ptr-indicator');
    if (!indicator) return;

    if (diff > 0 && main.scrollTop <= 0) {
        // 阻止页面本身的弹性滚动
        e.preventDefault();

        if (diff > 80) {
            indicator.classList.add('pulling');
            indicator.querySelector('.ptr-text').textContent = '松开刷新';
        } else if (diff > 30) {
            indicator.classList.add('pulling');
            indicator.querySelector('.ptr-text').textContent = '下拉刷新';
        }
    }
}

function _ptrTouchEnd(e) {
    if (!_ptrPulling) return;
    _ptrPulling = false;
    const main = document.querySelector('.app-layout.active .app-main');
    if (!main) return;
    const indicator = main.querySelector('.ptr-indicator');
    if (!indicator) return;

    if (indicator.classList.contains('pulling') && indicator.querySelector('.ptr-text').textContent.includes('松开')) {
        _ptrRefreshData();
    } else {
        indicator.classList.remove('pulling');
        indicator.querySelector('.ptr-text').textContent = '';
    }
}

// 在 sidebar 开关和页面切换时重新初始化
const _originalShowPage = typeof showPage === 'function' ? showPage : null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPullToRefresh, 500);
});

// 每次切页面也重新绑定
const _initPTRDebounce = () => setTimeout(initPullToRefresh, 300);