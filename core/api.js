/* ==========================================================
   MULTITRADE — Project Salary Management (PostgreSQL version)
   ========================================================== */

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : '/api';

const api = async (path, opts = {}) => {
    const url = '/api' + path;
    const headers = { 'Content-Type': 'application/json' };
    const session = localStorage.getItem('multitrade_session');
    if (session) {
        try {
            const user = JSON.parse(session);
            if (user?.token) headers['Authorization'] = 'Bearer ' + user.token;
        } catch (e) {}
    }
    const options = { method: opts.method || 'GET', headers };
    if (opts.body) options.body = JSON.stringify(opts.body);

    let res;
    try {
        res = await fetch(url, options);
    } catch (e) {
        // ✅ 网络错误（服务器可能在唤醒），等 3 秒重试一次
        await new Promise(r => setTimeout(r, 3000));
        res = await fetch(url, options);
    }

    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            // ✅ 再等 3 秒重试一次，可能是服务器刚唤醒
            await new Promise(r => setTimeout(r, 3000));
            try {
                const retryRes = await fetch(url, options);
                if (retryRes.ok) {
                    return await retryRes.json();
                }
            } catch (e) {}

            // 真的 401 了，才跳 login
            localStorage.removeItem('multitrade_session');
            window.location.href = window.location.pathname;
        }
        throw new Error(data.error || 'Request failed');
    }
    return data;
};

const localISO = (d) => {
    if (!d) d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};