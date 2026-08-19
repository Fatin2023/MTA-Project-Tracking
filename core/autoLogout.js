(function() {
    // ---------- 配置 ----------
    const TIMEOUT = 2 * 60 * 60 * 1000;   // 2 小时（正式）
    //const TIMEOUT = 1 * 3 * 1000;      // 3 秒（测试用）

    // ---------- 变量 ----------
    let logoutTimer;
    let sessionExpiredTimer;
    let isListening = false;

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    // ---------- 核心函数 ----------
    function resetTimer() {
        clearTimeout(logoutTimer);
        logoutTimer = setTimeout(autoLogout, TIMEOUT);
    }

    function startListening() {
        if (isListening) return;
        events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
        isListening = true;
    }

    function stopListening() {
        if (!isListening) return;
        events.forEach(e => document.removeEventListener(e, resetTimer));
        isListening = false;
    }

    function clearAllTimers() {
        clearTimeout(logoutTimer);
        clearTimeout(sessionExpiredTimer);
        logoutTimer = null;
        sessionExpiredTimer = null;
    }

    // ---------- 对外接口 ----------
    window.clearSessionExpiredTimer = function() {
        clearTimeout(sessionExpiredTimer);
        sessionExpiredTimer = null;
    };

    window.restartAutoLogout = function() {
        clearAllTimers();       // 清掉所有残留定时器
        startListening();       // 保证事件监听在（幂等，不会重复绑）
        resetTimer();           // 启动倒计时
    };

    // ---------- 自动登出执行 ----------
    function autoLogout() {
        const saved = localStorage.getItem('multitrade_session');
        if (!saved) return;

        stopListening();
        clearAllTimers();
        currentUser = null;

        ['multitrade_session', 'multitrade_module',
         'multitrade_admin_page', 'multitrade_emp_page',
         'multitrade_pt_page'].forEach(key => localStorage.removeItem(key));

        document.querySelectorAll('.pt-drawer, .pt-drawer-overlay, .sidebar, .mobile-overlay')
            .forEach(el => el.classList.remove('active'));

        const noticeBtn = document.getElementById('notice-float-btn');
        if (noticeBtn) {
            noticeBtn.style.display = 'none';
            noticeBtn.innerHTML = '';
        }

        document.querySelectorAll('.app-layout').forEach(el => {
            el.style.visibility = 'hidden';
        });

        // ---------- 显示会话过期弹窗 ----------
        const goToLogin = () => {
            clearAllTimers();
            hideModal();
            document.querySelectorAll('.app-layout').forEach(el => {
                el.classList.remove('active');
                el.style.visibility = '';
            });
            document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
            document.getElementById('login-page').classList.add('active');
            document.getElementById('login-pass').value = '';
            document.getElementById('login-pass').focus();
            currentUser = null;
        };

        showModal(`
            <div style="text-align:center;padding:20px 0">
                <div style="font-size:2.5rem;margin-bottom:16px">&#128274;</div>
                <h3 style="margin-bottom:8px">Session Expired</h3>
                <p style="color:var(--main-text2);line-height:1.6;margin-bottom:20px">
                    You have been inactive for 2 Hours.<br>Please sign in again.
                </p>
                <button class="btn btn-accent" id="session-expired-btn">Sign In</button>
            </div>
        `);

        document.getElementById('session-expired-btn').onclick = goToLogin;

        const overlay = document.getElementById('modal-overlay');
        const overlayClickHandler = (e) => {
            if (e.target === overlay) {
                overlay.removeEventListener('click', overlayClickHandler);
                goToLogin();
            }
        };
        overlay.addEventListener('click', overlayClickHandler);

        // 后备：5 秒后若用户未操作则自动跳转
        sessionExpiredTimer = setTimeout(() => {
            if (!currentUser) goToLogin();
        }, 5000);
    }

    // ---------- 启动 ----------
    startListening();
    resetTimer();
})();