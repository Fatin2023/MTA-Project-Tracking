/* ==========================================================
   SECTION 1: DATA LAYER
   ========================================================== */

let DB = {
    projects: [], members: [], users: [], positions: [],
    departments: [], scopes: [], subScopes: [], details: [],
    worklist: [], projectAssignments: [], attendance: [],
    viewerScopes: {},fileNotices: [],
};

const loadDB = async () => {
    try {
        const [projects, members, users, positions, departments, scopes, subScopes, details, assignments, attendance, worklist, driveSettings, appConfig, files, fileNotices] =
            await Promise.all([
                api('/projects'), api('/members'), api('/users'), api('/positions'),
                api('/departments'), api('/scopes'), api('/subscopes'), api('/details'),
                api('/assignments'), api('/attendance'), api('/worklist'),
                api('/drive-settings'), api('/app-config'), api('/files'), api('/file-notices')
            ]);
        Object.assign(DB, { projects, members, users, positions, departments, scopes, subScopes, details, projectAssignments: assignments, attendance, worklist, driveSettings, appConfig, files, fileNotices });

        // ↓↓↓ 新增：加载 sites ↓↓↓
        try { DB.sites = await api('/site-attendance/sites'); } catch(e) { DB.sites = []; }
        // ↑↑↑ 结束 ↑↑↑

        DB.viewerScopes = {};
        const viewerUsers = (DB.users || []).filter(u => u.role === 'viewer');
        for (const u of viewerUsers) {
            try { DB.viewerScopes[u.id] = await api('/viewer-scopes/' + u.id); }
            catch (e) { DB.viewerScopes[u.id] = []; }
        }
        renderNoticeBanners();
        updateFileBadge();

        const [ftResult, notifResult] = await Promise.all([
            api('/file-tasks').catch(() => []),
            currentUser.memberId ? api('/notifications').catch(() => []) : Promise.resolve([])
        ]);
        DB.fileTasks = ftResult;
        DB.notifications = notifResult;
        updateNotificationBadge();

        const notifRes = await api('/notifications');
        DB.notifications = notifRes || [];

    } catch (e) { console.error('Failed to load data:', e); }
};