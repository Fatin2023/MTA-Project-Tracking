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
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem('multitrade_session');
            const loginPage = document.getElementById('login-page');
            if (!loginPage || !loginPage.classList.contains('active')) {
                window.location.href = window.location.pathname;
            }
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