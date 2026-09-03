const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// ========================================
// PostgreSQL connection
// ========================================
const pg = require('pg');
pg.types.setTypeParser(1082, val => val);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || null,
    host: process.env.DATABASE_URL ? undefined : 'localhost',
    port: process.env.DATABASE_URL ? undefined : 5436,
    database: process.env.DATABASE_URL ? undefined : 'ProjectManagement',
    user: process.env.DATABASE_URL ? undefined : 'postgres',
    password: process.env.DATABASE_URL ? undefined : 'Postgre@sql1',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    options: process.env.DATABASE_URL ? undefined : '-c timezone=Asia/Kuala_Lumpur'
});

pool.on('error', (err) => {
    console.error('Unexpected DB error:', err);
});

function formatMember(row) {
    return {
        id: row.id,
        name: row.name,
        positionId: row.position_id,
        departmentId: row.department_id,
        salaries: {}
    };
}

// ========================================
// AUTH MIDDLEWARE
// ========================================
function requireAuth(req, res, next) {
    var auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    var token = auth.slice(7);
    pool.query(
        `SELECT u.id, u.username, u.role, u.member_id
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token = $1`,
        [token]
    ).then(function(result) {
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Session expired, please login again' });
        }
        req.user = {
            id: result.rows[0].id,
            username: result.rows[0].username,
            role: result.rows[0].role,
            memberId: result.rows[0].member_id
        };
        next();
    }).catch(function(err) {
        return res.status(500).json({ error: err.message });
    });
}

function requireEdit(req, res, next) {
    requireAuth(req, res, function() {
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'View only access' });
        }
        next();
    });
}

async function requireEditOrPic(req, res, next) {
    requireAuth(req, res, async function() {
        if (req.user.role === 'admin') return next();
        if (req.user.memberId) {
            try {
                const picCheck = await pool.query(
                    'SELECT 1 FROM scope_pics WHERE member_id = $1 LIMIT 1',
                    [req.user.memberId]
                );
                if (picCheck.rows.length > 0) return next();
            } catch (e) { /* fall through */ }
        }
        return res.status(403).json({ error: 'Edit access required' });
    });
}

// ========================================
// AUTH
// ========================================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        const u = result.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
            'INSERT INTO sessions (token, user_id) VALUES ($1, $2)',
            [token, u.id]
        );
        res.json({
            id: u.id,
            username: u.username,
            role: u.role,
            memberId: u.member_id,
            token: token
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', requireAuth, async (req, res) => {
    try {
        var token = req.headers.authorization.slice(7);
        await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password, name } = req.body;
    try {
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const memberResult = await pool.query('INSERT INTO members (name) VALUES ($1) RETURNING id', [name]);
        const memberId = memberResult.rows[0].id;
        await pool.query(
            'INSERT INTO users (username, password, role, member_id) VALUES ($1, $2, $3, $4)',
            [username, password, 'employee', memberId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// PROJECTS
// ========================================
app.get('/api/projects', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, COALESCE(s.name, 'Uncategorized') as category_name
            FROM projects p
            LEFT JOIN scopes s ON p.category_id = s.id
            ORDER BY p.id
        `);
        const projects = result.rows.map(r => ({
            id: r.id,
            name: r.name,
            categoryId: r.category_id,
            categoryName: r.category_name,
            startDate: r.start_date,
            endDate: r.end_date,
            customer: r.customer || '',
            location: r.location || '',
            installDate: r.install_date,
            status: r.status || 'pending'
        }));
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', requireEditOrPic, async (req, res) => {
    const { name, categoryId, startDate, endDate, customer, location, installDate, status } = req.body;
    try {
        if (categoryId && name) {
            const exists = await pool.query(
                'SELECT id FROM projects WHERE LOWER(name) = LOWER($1) AND category_id = $2',
                [name.trim(), categoryId]
            );
            if (exists.rows.length > 0) {
                return res.status(400).json({ error: 'Panel ID "' + name + '" already exists' });
            }
        }
        const result = await pool.query(
            'INSERT INTO projects (name, category_id, start_date, end_date, customer, location, install_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [name, categoryId || null, startDate || null, endDate || null, customer || '', location || '', installDate || null, status || 'pending']
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', requireEditOrPic, async (req, res) => {
    const { name, categoryId, startDate, endDate, customer, location, installDate, status } = req.body;
    try {
        if (categoryId && name) {
            const exists = await pool.query(
                'SELECT id FROM projects WHERE LOWER(name) = LOWER($1) AND category_id = $2 AND id != $3',
                [name.trim(), categoryId, req.params.id]
            );
            if (exists.rows.length > 0) {
                return res.status(400).json({ error: 'Panel ID "' + name + '" already exists' });
            }
        }
        await pool.query(
            'UPDATE projects SET name = $1, category_id = $2, start_date = $3, end_date = $4, customer = $5, location = $6, install_date = $7, status = $8 WHERE id = $9',
            [name, categoryId || null, startDate || null, endDate || null, customer || '', location || '', installDate || null, status || 'pending', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', requireEditOrPic, async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// MEMBERS
// ========================================
app.get('/api/members', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, p.name as position_name, d.name as department_name, u.role
            FROM members m
            LEFT JOIN positions p ON m.position_id = p.id
            LEFT JOIN departments d ON m.department_id = d.id
            LEFT JOIN users u ON u.member_id = m.id
            ORDER BY m.id
        `);
        const members = await Promise.all(result.rows.map(async (r) => {
            const salResult = await pool.query(
                'SELECT month, amount FROM salaries WHERE member_id = $1 ORDER BY month', [r.id]
            );
            const salaries = {};
            salResult.rows.forEach(s => { salaries[s.month] = parseFloat(s.amount); });
            return {
                id: r.id,
                name: r.name,
                email: r.email,
                role: r.role,
                positionId: r.position_id,
                departmentId: r.department_id,
                salaries
            };
        }));
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/members', requireEdit, async (req, res) => {
    const { name, positionId, departmentId, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO members (name, position_id, department_id, email) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, positionId || null, departmentId || null, email || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/members/:id', requireEdit, async (req, res) => {
    const { name, positionId, departmentId, email } = req.body;
    try {
        await pool.query(
            'UPDATE members SET name = $1, position_id = $2, department_id = $3, email = $4 WHERE id = $5',
            [name, positionId || null, departmentId || null, email || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// USERS
// ========================================
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.*, m.name as member_name, m.position_id, m.department_id
            FROM users u
            LEFT JOIN members m ON u.member_id = m.id
            ORDER BY u.id
        `);
        const users = await Promise.all(result.rows.map(async (r) => {
            let salaries = {};
            if (r.member_id) {
                const salResult = await pool.query(
                    'SELECT month, amount FROM salaries WHERE member_id = $1 ORDER BY month', [r.member_id]
                );
                salResult.rows.forEach(s => { salaries[s.month] = parseFloat(s.amount); });
            }
            return {
                id: r.id,
                username: r.username,
                password: r.password,
                role: r.role,
                memberId: r.member_id,
                memberName: r.member_name,
                positionId: r.position_id,
                departmentId: r.department_id,
                salaries
            };
        }));
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', requireEdit, async (req, res) => {
    const { username, password, role, memberId } = req.body;
    try {
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const result = await pool.query(
            'INSERT INTO users (username, password, role, member_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, password, role, memberId || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', requireEdit, async (req, res) => {
    const { username, password, role, memberId } = req.body;
    try {
        if (password) {
            await pool.query(
                'UPDATE users SET username = $1, password = $2, role = $3, member_id = $4 WHERE id = $5',
                [username, password, role, memberId || null, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username = $1, role = $2, member_id = $3 WHERE id = $4',
                [username, role, memberId || null, req.params.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    try {
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
            return res.status(403).json({ error: 'Can only change your own password' });
        }
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', requireEdit, async (req, res) => {
    try {
        const user = await pool.query('SELECT member_id FROM users WHERE id = $1', [req.params.id]);
        if (user.rows.length > 0 && user.rows[0].member_id) {
            await pool.query('DELETE FROM members WHERE id = $1', [user.rows[0].member_id]);
        }
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// get viewer scope for view category
// ========================================

app.get('/api/viewer-scopes/:userId', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT scope_id FROM viewer_scopes WHERE user_id = $1',
            [req.params.userId]
        );
        res.json(result.rows.map(r => r.scope_id));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 设置 viewer 的额外 scope
app.put('/api/viewer-scopes/:userId', requireEdit, async (req, res) => {
    try {
        const { scopeIds } = req.body;
        await pool.query('DELETE FROM viewer_scopes WHERE user_id = $1', [req.params.userId]);
        if (scopeIds && scopeIds.length > 0) {
            for (const sid of scopeIds) {
                await pool.query(
                    'INSERT INTO viewer_scopes (user_id, scope_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [req.params.userId, sid]
                );
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// SALARIES
// ========================================
app.put('/api/salaries', requireEdit, async (req, res) => {
    const { memberId, month, amount } = req.body;
    try {
        const finalAmount = (!amount || amount <= 0) ? 0 : amount;
        await pool.query(`
            INSERT INTO salaries (member_id, month, amount)
            VALUES ($1, $2, $3)
            ON CONFLICT (member_id, month)
            DO UPDATE SET amount = $3
        `, [memberId, month, finalAmount]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// POSITIONS
// ========================================
app.get('/api/positions', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM positions ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/positions', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO positions (name) VALUES ($1) RETURNING id', [name]);
        res.json({ id: result.rows[0].id, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/positions/:id', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE positions SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/positions/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('UPDATE members SET position_id = NULL WHERE position_id = $1', [req.params.id]);
        await pool.query('DELETE FROM positions WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// DEPARTMENTS
// ========================================
app.get('/api/departments', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY id');
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            workDaysPerWeek: r.work_days_per_week,
            normalDayHours: parseFloat(r.normal_day_hours),
            saturdayHours: parseFloat(r.saturday_hours)
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/departments', requireEdit, async (req, res) => {
    const { name, work_days_per_week, normal_day_hours, saturday_hours } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO departments (name, work_days_per_week, normal_day_hours, saturday_hours) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, work_days_per_week ?? 5, normal_day_hours ?? 9, saturday_hours ?? 0]
        );
        res.json({ id: result.rows[0].id, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/departments/:id', requireEdit, async (req, res) => {
    const { name, work_days_per_week, normal_day_hours, saturday_hours } = req.body;
    try {
        await pool.query(
            'UPDATE departments SET name = $1, work_days_per_week = $2, normal_day_hours = $3, saturday_hours = $4 WHERE id = $5',
            [name, work_days_per_week ?? 5, normal_day_hours ?? 9, saturday_hours ?? 0, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/departments/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('UPDATE members SET department_id = NULL WHERE department_id = $1', [req.params.id]);
        await pool.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// PROJECT ASSIGNMENTS
// ========================================
app.get('/api/assignments', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM project_assignments ORDER BY id');
        res.json(result.rows.map(r => ({
            id: r.id,
            projectId: r.project_id,
            memberId: r.member_id
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/assignments', requireEdit, async (req, res) => {
    const { projectId, memberId } = req.body;
    try {
        await pool.query(`
            INSERT INTO project_assignments (project_id, member_id)
            VALUES ($1, $2)
            ON CONFLICT (project_id, member_id) DO NOTHING
        `, [projectId, memberId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/assignments', requireEdit, async (req, res) => {
    const { projectId, memberId } = req.body;
    try {
        await pool.query(
            'DELETE FROM project_assignments WHERE project_id = $1 AND member_id = $2',
            [projectId, memberId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// ATTENDANCE
// ========================================
function toLocalISO(d) {
    if (!d) return null;
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

app.get('/api/attendance', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM attendance ORDER BY date DESC, id DESC');
        res.json(result.rows.map(r => ({
            id: r.id,
            memberId: r.member_id,
            date: r.date || null,
            clockIn: r.clock_in ? toLocalISO(new Date(r.clock_in)) : null,
            clockOut: r.clock_out ? toLocalISO(new Date(r.clock_out)) : null,
            projectId: r.project_id,
            scopeId: r.scope_id || null,
            subScopeId: r.sub_scope_id || null,
            detailId: r.detail_id || null,
            description: r.description || '',
            work_plan_id: r.work_plan_id || null,
            work_done_id: r.work_done_id || null
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/attendance', requireAuth, async (req, res) => {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'View only' });
    const { memberId, date, clockIn, clockOut, projectId, scopeId, subScopeId, detailId, description, work_plan_id, work_done_id } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO attendance (member_id, date, clock_in, clock_out, project_id, scope_id, sub_scope_id, detail_id, description, work_plan_id, work_done_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [memberId, date, clockIn, clockOut, projectId || null, scopeId || null, subScopeId || null, detailId || null, description || '', work_plan_id || null, work_done_id || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/attendance/:id', requireAuth, async (req, res) => {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'View only' });
    const { date, clockIn, clockOut, projectId, scopeId, subScopeId, detailId, description, work_plan_id, work_done_id } = req.body;
    try {
        await pool.query(
            `UPDATE attendance SET date=$1, clock_in=$2, clock_out=$3, project_id=$4,
             scope_id=$5, sub_scope_id=$6, detail_id=$7, description=$8, work_plan_id=$9, work_done_id=$10 WHERE id=$11`,
            [date, clockIn, clockOut, projectId || null, scopeId || null, subScopeId || null, detailId || null, description || '', work_plan_id || null, work_done_id || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/attendance/:id', requireAuth, async (req, res) => {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'View only' });
    try {
        await pool.query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// SUB SCOPES
// ========================================
app.get('/api/subscopes', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sub_scopes ORDER BY id');
        res.json(result.rows.map(r => ({
            id: r.id,
            name: r.name,
            scopeId: r.scope_id || null,
            createdAt: r.created_at
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subscopes', requireEdit, async (req, res) => {
    const { name, scopeId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO sub_scopes (name, scope_id) VALUES ($1, $2) RETURNING *',
            [name, scopeId || null]
        );
        res.json({ id: result.rows[0].id, name: result.rows[0].name, scopeId: result.rows[0].scope_id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/subscopes/:id', requireEdit, async (req, res) => {
    const { name, scopeId } = req.body;
    try {
        await pool.query('UPDATE sub_scopes SET name=$1, scope_id=$2 WHERE id=$3', [name, scopeId || null, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subscopes/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM sub_scopes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// DETAILS
// ========================================
app.get('/api/details', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM details ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/details', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO details (name) VALUES ($1) RETURNING id', [name]);
        res.json({ id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/details/:id', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE details SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/details/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM details WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// SCOPES
// ========================================
app.get('/api/scopes', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scopes ORDER BY id');
        const scopes = await Promise.all(result.rows.map(async (s) => {
            const pics = await pool.query('SELECT member_id FROM scope_pics WHERE scope_id = $1', [s.id]);
            const departments = await pool.query('SELECT department_id FROM scope_departments WHERE scope_id = $1', [s.id]);
            return {
                id: s.id,
                name: s.name,
                createdAt: s.created_at,
                picMemberIds: pics.rows.map(r => r.member_id),
                departmentIds: departments.rows.map(r => r.department_id)
            };
        }));
        res.json(scopes);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/scopes', requireEdit, async (req, res) => {
    const { name, picMemberIds, departmentIds } = req.body;
    try {
        const result = await pool.query('INSERT INTO scopes (name) VALUES ($1) RETURNING id', [name]);
        const scopeId = result.rows[0].id;
        if (picMemberIds && picMemberIds.length > 0) {
            for (const mid of picMemberIds) {
                await pool.query('INSERT INTO scope_pics (scope_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [scopeId, mid]);
            }
        }
        if (departmentIds && departmentIds.length > 0) {
            for (const did of departmentIds) {
                await pool.query('INSERT INTO scope_departments (scope_id, department_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [scopeId, did]);
            }
        }
        res.json({ id: scopeId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/scopes/:id', requireEdit, async (req, res) => {
    const { name, picMemberIds, departmentIds } = req.body;
    try {
        await pool.query('UPDATE scopes SET name = $1 WHERE id = $2', [name, req.params.id]);
        await pool.query('DELETE FROM scope_pics WHERE scope_id = $1', [req.params.id]);
        if (picMemberIds && picMemberIds.length > 0) {
            for (const mid of picMemberIds) {
                await pool.query('INSERT INTO scope_pics (scope_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, mid]);
            }
        }
        await pool.query('DELETE FROM scope_departments WHERE scope_id = $1', [req.params.id]);
        if (departmentIds && departmentIds.length > 0) {
            for (const did of departmentIds) {
                await pool.query('INSERT INTO scope_departments (scope_id, department_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, did]);
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/scopes/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM scopes WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// WORKLIST
// ========================================
app.get('/api/worklist', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM worklist ORDER BY id');
        res.json(result.rows.map(r => ({
            id: r.id,
            title: r.title,
            scopeId: r.scope_id || null
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/worklist', requireEdit, async (req, res) => {
    const { title, scopeId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO worklist (title, scope_id) VALUES ($1, $2) RETURNING *',
            [title, scopeId || null]
        );
        res.json({ id: result.rows[0].id, title: result.rows[0].title, scopeId: result.rows[0].scope_id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/worklist/:id', requireEdit, async (req, res) => {
    const { title, scopeId } = req.body;
    try {
        await pool.query('UPDATE worklist SET title=$1, scope_id=$2 WHERE id=$3', [title, scopeId || null, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/worklist/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('UPDATE attendance SET work_plan_id = NULL WHERE work_plan_id = $1', [req.params.id]);
        await pool.query('UPDATE attendance SET work_done_id = NULL WHERE work_done_id = $1', [req.params.id]);
        await pool.query('DELETE FROM worklist WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========================================
// PANEL TRACKING — M_DASHBOARD
// ========================================
app.get('/api/m-dashboard', requireAuth, async (req, res) => {
    try {
        const scopeResult = await pool.query(
            `SELECT id FROM scopes WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
            ['%Panel Build%']
        );
        let panelCount = 0;
        if (scopeResult.rows.length > 0) {
            const r = await pool.query(
                `SELECT COUNT(*) AS total FROM projects WHERE category_id = $1`,
                [scopeResult.rows[0].id]
            );
            panelCount = parseInt(r.rows[0].total);
        }
        const materials = await pool.query('SELECT COUNT(*) AS total FROM m_material');
        res.json({
            total_panels: panelCount,
            complete: 0,
            in_progress: 0,
            total_materials: parseInt(materials.rows[0].total),
            total_ordered: 0,
            total_installed: 0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// M_USERS
// ========================================
app.get('/api/m-users', requireEdit, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, created_at FROM m_users ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/m-users', requireEdit, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const exists = await pool.query('SELECT id FROM m_users WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const result = await pool.query(
            'INSERT INTO m_users (username, password, role) VALUES ($1, $2, $3) RETURNING id',
            [username, password, role || 'admin']
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/m-users/:id', requireEdit, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            await pool.query(
                'UPDATE m_users SET username = $1, password = $2, role = $3 WHERE id = $4',
                [username, password, role, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE m_users SET username = $1, role = $2 WHERE id = $3',
                [username, role, req.params.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/m-users/:id', requireEdit, async (req, res) => {
    try {
        const user = await pool.query('SELECT username FROM m_users WHERE id = $1', [req.params.id]);
        if (user.rows.length > 0 && user.rows[0].username === 'admin') {
            return res.status(400).json({ error: 'Cannot delete default admin' });
        }
        await pool.query('DELETE FROM m_users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// M_PANEL
// ========================================
app.get('/api/m-panels', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM m_panel ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/m-panels', requireEdit, async (req, res) => {
    const { name, project_name, customer, customer_location, pic, status, start_date, end_date, remark } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO m_panel (name, project_name, customer, customer_location, pic, status, start_date, end_date, remark)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [name, project_name || '', customer || '', customer_location || '', pic || '', status || 'pending', start_date || null, end_date || null, remark || '']
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/m-panels/:id', requireEdit, async (req, res) => {
    const { name, project_name, customer, customer_location, pic, status, start_date, end_date, remark } = req.body;
    try {
        await pool.query(
            `UPDATE m_panel SET name=$1, project_name=$2, customer=$3, customer_location=$4, pic=$5, status=$6, start_date=$7, end_date=$8, remark=$9 WHERE id=$10`,
            [name, project_name, customer, customer_location, pic, status, start_date || null, end_date || null, remark, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/m-panels/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM m_panel WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// M_MATERIAL
// ========================================
app.get('/api/m-materials', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM m_material ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/m-materials', requireEdit, async (req, res) => {
    const { part_no, brand, serial_no, description, yom, vendor, vendor_po_no, panel_no, install_date, category, unit, unit_price } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO m_material (part_no, brand, serial_no, description, yom, vendor, vendor_po_no, panel_no, install_date, category, unit, unit_price)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [part_no, brand || '', serial_no || '', description || '', yom || '', vendor || '', vendor_po_no || '', panel_no || '', install_date || null, category || '', unit || 'pc', unit_price || 0]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/m-materials/:id', requireEdit, async (req, res) => {
    const { part_no, brand, serial_no, description, yom, vendor, vendor_po_no, panel_no, install_date, category, unit, unit_price } = req.body;
    try {
        await pool.query(
            `UPDATE m_material SET part_no=$1, brand=$2, serial_no=$3, description=$4, yom=$5, vendor=$6, vendor_po_no=$7, panel_no=$8, install_date=$9, category=$10, unit=$11, unit_price=$12 WHERE id=$13`,
            [part_no, brand, serial_no, description, yom || '', vendor || '', vendor_po_no || '', panel_no || '', install_date || null, category, unit, unit_price, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/m-materials/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM m_material WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// PANEL IDS FROM PROJECT TRACKING
// ========================================
app.get('/api/m-panel-ids', requireAuth, async (req, res) => {
    try {
        const scopeResult = await pool.query(
            `SELECT id FROM scopes WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
            ['%Panel Build%']
        );
        if (scopeResult.rows.length === 0) {
            return res.json([]);
        }
        const result = await pool.query(
            `SELECT id, name, start_date, end_date, customer, location, install_date,
                    COALESCE(status, 'pending') as status
             FROM projects WHERE category_id = $1 ORDER BY name`,
            [scopeResult.rows[0].id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// IMPORT EXCEL
// ========================================
const XLSX = require('xlsx');

function parseDMY(val) {
    if (!val) return null;
    var s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        var day = m[1].padStart(2, '0');
        var month = m[2].padStart(2, '0');
        var year = m[3];
        return year + '-' + month + '-' + day;
    }
    if (/^\d{5}$/.test(s)) {
        var d = new Date((parseInt(s) - 25569) * 86400 * 1000);
        return d.toISOString().slice(0, 10);
    }
    return s || null;
}

app.post('/api/m-import/panels', requireEdit, async (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!data) return res.status(400).json({ error: 'No file data' });

        const buffer = Buffer.from(data, 'base64');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ error: 'File is empty' });

        const scopeResult = await pool.query(
            `SELECT id FROM scopes WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`, ['%Panel Build%']
        );
        const panelScopeId = scopeResult.rows.length > 0 ? scopeResult.rows[0].id : null;

        let existingNames = new Set();
        if (panelScopeId) {
            const existing = await pool.query(
                'SELECT LOWER(name) as name FROM projects WHERE category_id = $1', [panelScopeId]
            );
            existing.rows.forEach(r => existingNames.add(r.name));
        }

        let inserted = 0, skipped = 0, errors = [];

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = String(r['Panel ID'] || r['Panel Name'] || r['Name'] || r['panel_id'] || r['panel_name'] || r['PanelID'] || r['PanelId'] || r['PANEL ID'] || r['panel id'] || '').trim();
            if (!name) { skipped++; errors.push(`Row ${i + 2}: missing Panel ID`); continue; }

            if (existingNames.has(name.toLowerCase())) {
                skipped++; errors.push(`Row ${i + 2}: Panel ID "${name}" already exists`); continue;
            }

            var status = String(r['Status'] || 'pending').trim().toLowerCase();
            var validStatuses = ['pending', 'in progress', 'completed'];
            if (validStatuses.indexOf(status) === -1) status = 'pending';

            try {
                await pool.query(
                    `INSERT INTO projects (name, category_id, start_date, end_date, customer, install_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [name, panelScopeId, parseDMY(r['Start Date']), parseDMY(r['End Date']),
                    String(r['Customer'] || '').trim(),
                    parseDMY(r['Install Date']),
                    status]
                );
                existingNames.add(name.toLowerCase());
                inserted++;
            } catch (e) { skipped++; errors.push(`Row ${i + 2}: ${e.message}`); }
        }

        res.json({ success: true, total: rows.length, inserted, skipped, errors });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/m-import/materials', requireEdit, async (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!data) return res.status(400).json({ error: 'No file data' });

        const buffer = Buffer.from(data, 'base64');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ error: 'File is empty' });

        let inserted = 0, skipped = 0, errors = [];

        const existingResult = await pool.query('SELECT serial_no FROM m_material');
        const existingSerials = new Set();
        existingResult.rows.forEach(r => existingSerials.add(r.serial_no));
        const fileSerials = new Set();

        const scopeResult = await pool.query(
            `SELECT id FROM scopes WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`, ['%Panel Build%']
        );
        const validPanelSet = new Set();
        if (scopeResult.rows.length > 0) {
            const panels = await pool.query(
                `SELECT name FROM projects WHERE category_id = $1`, [scopeResult.rows[0].id]
            );
            panels.rows.forEach(p => validPanelSet.add(p.name));
        }

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const partNo = String(r['Part No'] || '').trim();
            const serialNo = String(r['Serial No'] || '').trim();
            const panelId = String(r['Panel ID'] || '').trim();

            if (!partNo) { skipped++; errors.push(`Row ${i + 2}: missing Part No`); continue; }
            if (!serialNo) { skipped++; errors.push(`Row ${i + 2}: missing Serial No`); continue; }
            if (!panelId) { skipped++; errors.push(`Row ${i + 2}: missing Panel ID`); continue; }

            if (validPanelSet.size > 0 && !validPanelSet.has(panelId)) {
                skipped++; errors.push(`Row ${i + 2}: Panel ID "${panelId}" not found`); continue;
            }

            if (existingSerials.has(serialNo)) {
                skipped++; errors.push(`Row ${i + 2}: Serial No "${serialNo}" already exists in database`); continue;
            }

            if (fileSerials.has(serialNo)) {
                skipped++; errors.push(`Row ${i + 2}: Serial No "${serialNo}" is duplicated in this file`); continue;
            }

            try {
                await pool.query(
                    `INSERT INTO m_material (part_no, brand, description, serial_no, yom, vendor, vendor_po_no, panel_no, install_date, category, unit, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [partNo,
                     String(r['Brand'] || '').trim(),
                     String(r['Description'] || '').trim(),
                     serialNo,
                     String(r['YOM'] || '').trim(),
                     String(r['Vendor'] || '').trim(),
                     String(r['Vendor PO'] || r['Vendor PO No'] || '').trim(),  // 兼容旧版
                     panelId,
                     parseDMY(r['Install Date']),
                     String(r['Category'] || 'Other').trim(),
                     String(r['Unit'] || 'pc').trim(),
                     parseFloat(r['Price'] || r['Unit Price'] || 0) || 0]       // 兼容旧版
                );
                fileSerials.add(serialNo);
                existingSerials.add(serialNo);
                inserted++;
            } catch (e) { skipped++; errors.push(`Row ${i + 2}: ${e.message}`); }
        }

        res.json({ success: true, total: rows.length, inserted, skipped, errors });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- DOWNLOAD TEMPLATES (public) ----------
app.get('/api/m-template/panels', (req, res) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ['Panel ID', 'Customer', 'Start Date', 'End Date', 'Install Date', 'Status'],
        ['P10093', 'Petronas', '15/01/2025', '30/06/2025', '15/06/2025', 'pending'],
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Panels');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="panel_import_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

app.get('/api/m-template/materials', (req, res) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ['Part No', 'Description', 'Brand', 'Serial No', 'Vendor PO', 'Vendor', 'Panel ID', 'YOM', 'Category', 'Unit', 'Price', 'Install Date'],
        ['CB-MCCB100', 'MCCB 100A 3P', 'Schneider', 'SN-20240001', 'PO-2024-001', 'Supplier Sdn Bhd', 'P10093', '2024', 'Breaker', 'pc', '250.00', '15/03/2025'],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Materials');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="material_import_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

// ========================================
// IMPORT PROJECTS (generic)
// ========================================
app.post('/api/import/projects', requireEditOrPic, async (req, res) => {
    try {
        const { filename, data, categoryId } = req.body;
        if (!data) return res.status(400).json({ error: 'No file data' });
        const buffer = Buffer.from(data, 'base64');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) return res.status(400).json({ error: 'File is empty' });

        let inserted = 0, skipped = 0, errors = [];
        const catId = categoryId ? parseInt(categoryId) : null;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = String(r['Panel ID'] || r['Name'] || r['ID'] || r['Panel Name'] || r['name'] || '').trim();
            if (!name) { skipped++; errors.push('Row ' + (i + 2) + ': missing Panel ID'); continue; }

            var status = String(r['Status'] || 'pending').trim().toLowerCase();
            var validStatuses = ['pending', 'in progress', 'completed'];
            if (validStatuses.indexOf(status) === -1) status = 'pending';

            try {
                await pool.query(
                    'INSERT INTO projects (name, category_id, start_date, end_date, customer, install_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [name, catId, parseDMY(r['Start Date']), parseDMY(r['End Date']),
                    String(r['Customer'] || '').trim(), parseDMY(r['Install Date']), status]
                );
                inserted++;
            } catch (e) { skipped++; errors.push('Row ' + (i + 2) + ': ' + e.message); }
        }

        res.json({ success: true, total: rows.length, inserted, skipped, errors });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// APP CONFIG
// ========================================
app.get('/api/app-config', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM app_config');
        const config = {};
        result.rows.forEach(r => { config[r.key] = r.value; });
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/app-config', requireEdit, async (req, res) => {
    const entries = Object.entries(req.body);
    try {
        for (const [key, value] of entries) {
            await pool.query(
                'INSERT INTO app_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                [key, value]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// DRIVE SETTINGS
// ========================================
app.get('/api/drive-settings', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM drive_settings ORDER BY is_default DESC, id');
        res.json(result.rows.map(r => ({
            id: r.id, name: r.name, folderId: r.folder_id, isDefault: r.is_default
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/drive-settings', requireEdit, async (req, res) => {
    const { name, folderId, isDefault } = req.body;
    try {
        if (isDefault) await pool.query('UPDATE drive_settings SET is_default = false');
        const result = await pool.query(
            'INSERT INTO drive_settings (name, folder_id, is_default) VALUES ($1, $2, $3) RETURNING id',
            [name, folderId, isDefault || false]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/drive-settings/:id', requireEdit, async (req, res) => {
    const { name, folderId, isDefault } = req.body;
    try {
        if (isDefault) await pool.query('UPDATE drive_settings SET is_default = false');
        await pool.query(
            'UPDATE drive_settings SET name = $1, folder_id = $2, is_default = $3 WHERE id = $4',
            [name, folderId, isDefault || false, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/drive-settings/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM drive_settings WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FILES
// ========================================
app.get('/api/files', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.*, COALESCE(m.name, u.username, 'Unknown') as uploader_name
            FROM files f
            LEFT JOIN members m ON f.uploaded_by = m.id
            LEFT JOIN users u ON f.uploaded_by = u.id
            ORDER BY f.created_at DESC
        `);
        res.json(result.rows.map(r => ({
            id: r.id, title: r.title || '', name: r.name, type: r.type, size: parseInt(r.size || 0),
            url: r.url, driveFileId: r.drive_file_id,
            uploadedBy: r.uploaded_by, uploaderName: r.uploader_name,
            driveSettingId: r.drive_setting_id, remark: r.remark || '',
            createdAt: r.created_at
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files', requireAuth, async (req, res) => {
    const { title, name, type, size, url, driveFileId, driveSettingId, remark } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO files (title, name, type, size, url, drive_file_id, uploaded_by, drive_setting_id, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [title || '', name, type, size, url, driveFileId, req.user.memberId || null, driveSettingId, remark || '']
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/files/:id', requireAuth, async (req, res) => {
    try {
        const file = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
        if (file.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        const fileData = file.rows[0];

        // Employee 只能删自己上传的
        if (req.user.role !== 'admin') {
            if (fileData.uploaded_by !== req.user.memberId) {
                return res.status(403).json({ error: 'You can only delete your own files' });
            }
        }

        // Delete from Google Drive
        if (fileData.drive_file_id) {
            try {
                const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                const scriptUrl = cfgResult.rows[0]?.value;
                const token = tokenResult.rows[0]?.value || '';
                if (scriptUrl) {
                    const deleteUrl = scriptUrl + '?action=delete&token=' + encodeURIComponent(token) + '&fileId=' + fileData.drive_file_id;
                    await fetch(deleteUrl, { redirect: 'follow' });
                }
            } catch (e) {
                console.log('Drive delete error:', e.message);
            }
        }

        // Delete from database
        await pool.query('DELETE FROM files WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// UPLOAD TO GOOGLE DRIVE (proxy) — 加安全
// ========================================
app.post('/api/upload-to-drive', requireAuth, async (req, res) => {
    try {
        const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
        const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
        const scriptUrl = cfgResult.rows[0]?.value;
        const token = tokenResult.rows[0]?.value || '';
        if (!scriptUrl) return res.status(400).json({ error: 'Drive script URL not configured' });

        const { fileBase64, fileName, mimeType, folderId } = req.body;

        // ===== 安全检查 =====

        // 1. 文件名清理
        if (!fileName || typeof fileName !== 'string') {
            return res.status(400).json({ error: 'Invalid file name' });
        }
        const safeName = fileName
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/\.\./g, '_')
            .substring(0, 200);
        if (!safeName || safeName.length < 1) {
            return res.status(400).json({ error: 'Invalid file name' });
        }

        // 2. 危险扩展名黑名单
        const blockedExts = [
            '.exe', '.bat', '.cmd', '.com', '.msi', '.pif',
            '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf',
            '.ps1', '.psm1', '.psd1', '.reg', '.dll', '.sys',
            '.scr', '.hta', '.cpl', '.inf', '.lnk', '.sh',
            '.php', '.asp', '.aspx', '.jsp', '.cgi', '.py',
            '.rb', '.pl'
        ];
        const lowerName = safeName.toLowerCase();
        for (const ext of blockedExts) {
            if (lowerName.endsWith(ext)) {
                return res.status(400).json({ error: 'File type not allowed: ' + ext });
            }
        }

        // 3. 文件大小检查（base64 解码后）
        if (!fileBase64 || typeof fileBase64 !== 'string') {
            return res.status(400).json({ error: 'Invalid file data' });
        }
        const estimatedSize = Math.floor(fileBase64.length * 3 / 4);
        if (estimatedSize > 20 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large. Max 20MB.' });
        }

        // 4. MIME 类型白名单
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/csv',
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/zip', 'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/dwg', 'application/dxf', 'application/x-autocad',
            'application/octet-stream',
            ''
        ];
        if (mimeType && !allowedMimes.includes(mimeType)) {
            return res.status(400).json({ error: 'File type not allowed: ' + mimeType });
        }

        // ===== 安全检查结束 =====

        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ token, folderId, fileName: safeName, fileBase64, mimeType }),
            redirect: 'follow'
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            return res.status(500).json({ error: 'Invalid response from Drive: ' + text.substring(0, 200) });
        }

        if (result.error) return res.status(500).json({ error: result.error });

        res.json(result);
    } catch (err) {
        console.log('Upload error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/files/:id', requireAuth, async (req, res) => {
    try {
        const file = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
        if (file.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        const fileData = file.rows[0];

        if (req.user.role !== 'admin') {
            if (fileData.uploaded_by !== req.user.memberId) {
                return res.status(403).json({ error: 'You can only edit your own files' });
            }
        }

        const { title, remark, newName, newType, newSize, newUrl, newDriveFileId, newDriveSettingId, replaceFile } = req.body;

        const safeTitle = (title || '').replace(/<[^>]*>/g, '').substring(0, 300);
        const safeRemark = (remark || '').replace(/<[^>]*>/g, '').substring(0, 500);

        if (replaceFile && newDriveFileId) {
            if (fileData.drive_file_id) {
                try {
                    const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                    const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                    const scriptUrl = cfgResult.rows[0]?.value;
                    const token = tokenResult.rows[0]?.value || '';
                    if (scriptUrl) {
                        const deleteUrl = scriptUrl + '?action=delete&token=' + encodeURIComponent(token) + '&fileId=' + fileData.drive_file_id;
                        await fetch(deleteUrl, { redirect: 'follow' });
                    }
                } catch (e) { console.log('Drive delete error:', e.message); }
            }
            await pool.query(
                'UPDATE files SET title=$1, remark=$2, name=$3, type=$4, size=$5, url=$6, drive_file_id=$7, drive_setting_id=$8 WHERE id=$9',
                [safeTitle, safeRemark, newName, newType, newSize, newUrl, newDriveFileId, newDriveSettingId || fileData.drive_setting_id, req.params.id]
            );
        } else {
            const safeDriveId = newDriveSettingId || fileData.drive_setting_id;

            // 如果改了 Drive Folder 且有旧文件，真正移动文件
            if (newDriveSettingId && newDriveSettingId !== fileData.drive_setting_id && fileData.drive_file_id) {
                try {
                    const oldDrive = await pool.query('SELECT folder_id FROM drive_settings WHERE id = $1', [fileData.drive_setting_id]);
                    const newDrive = await pool.query('SELECT folder_id FROM drive_settings WHERE id = $1', [newDriveSettingId]);
                    const oldFolderId = oldDrive.rows[0]?.folder_id;
                    const newFolderId = newDrive.rows[0]?.folder_id;

                    if (oldFolderId && newFolderId) {
                        const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                        const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                        const scriptUrl = cfgResult.rows[0]?.value;
                        const token = tokenResult.rows[0]?.value || '';
                        if (scriptUrl) {
                            const moveUrl = scriptUrl + '?action=move&token=' + encodeURIComponent(token) +
                                '&fileId=' + fileData.drive_file_id +
                                '&fromFolderId=' + oldFolderId +
                                '&toFolderId=' + newFolderId;
                            await fetch(moveUrl, { redirect: 'follow' });
                        }
                    }
                } catch (e) { console.log('Drive move error:', e.message); }
            }

            await pool.query(
                'UPDATE files SET title=$1, remark=$2, drive_setting_id=$3 WHERE id=$4',
                [safeTitle, safeRemark, safeDriveId, req.params.id]
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FILE NOTICES
// ========================================
app.get('/api/file-notices', requireAuth, async (req, res) => {
    try {
        let result;
        if (req.user.role === 'admin') {
            result = await pool.query(`
                SELECT fn.* FROM file_notices fn ORDER BY fn.created_at DESC
            `);
        } else {
            result = await pool.query(`
                SELECT fn.* FROM file_notices fn
                WHERE fn.is_active = true
                ORDER BY fn.created_at DESC
            `);
        }

        const notices = result.rows.map(r => {
            const ids = (r.target_member_ids || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
            let targetMemberNames = [];
            if (r.target_type === 'multiple' && ids.length > 0) {
                // will fill below
            }
            return {
                id: r.id, title: r.title, message: r.message,
                targetType: r.target_type,
                targetMemberIds: ids,
                targetMemberNames: [],
                isActive: r.is_active, createdAt: r.created_at
            };
        });

        // Fill member names
        const allMemberIds = [...new Set(notices.flatMap(n => n.targetMemberIds))];
        if (allMemberIds.length > 0) {
            const memResult = await pool.query('SELECT id, name FROM members WHERE id = ANY($1)', [allMemberIds]);
            const nameMap = {};
            memResult.rows.forEach(m => { nameMap[m.id] = m.name; });
            notices.forEach(n => {
                n.targetMemberNames = n.targetMemberIds.map(id => nameMap[id] || 'Unknown');
            });
        }

        // Employee filter: only show notices targeting 'all' or containing their memberId
        if (req.user.role !== 'admin') {
            const myId = req.user.memberId || 0;
            const filtered = notices.filter(n => n.targetType === 'all' || n.targetMemberIds.includes(myId));
            return res.json(filtered);
        }

        res.json(notices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file-notices', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, message, targetType, targetMemberIds, isActive } = req.body;
    const idsStr = Array.isArray(targetMemberIds) ? targetMemberIds.join(',') : (targetMemberIds || '');
    try {
        const result = await pool.query(
            'INSERT INTO file_notices (title, message, target_type, target_member_ids, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [title, message || '', targetType || 'all', idsStr, isActive !== false]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/file-notices/:id', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, message, targetType, targetMemberIds, isActive } = req.body;
    const idsStr = Array.isArray(targetMemberIds) ? targetMemberIds.join(',') : (targetMemberIds || '');
    try {
        await pool.query(
            'UPDATE file_notices SET title=$1, message=$2, target_type=$3, target_member_ids=$4, is_active=$5 WHERE id=$6',
            [title, message || '', targetType || 'all', idsStr, isActive !== false, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/file-notices/:id', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        await pool.query('DELETE FROM file_notices WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send emial with file notification
app.post('/api/send-email', requireAuth, async (req, res) => {
    const { to, subject, htmlBody } = req.body;

    try {
        const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
        const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
        const scriptUrl = cfgResult.rows[0]?.value;
        const token = tokenResult.rows[0]?.value || '';

        if (!scriptUrl || !token) {
            return res.status(400).json({ error: 'Email service not configured.' });
        }

        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify({
                token: token,
                action: 'sendEmail',
                to: to,
                subject: subject,
                htmlBody: htmlBody
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        res.json(data);
    } catch (err) {
        console.error('[send-email] ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Test email endpoint
app.get('/api/test-email', requireAuth, async (req, res) => {
    try {
        const config = await pool.query('SELECT * FROM app_config WHERE id = 1');
        const cfg = config.rows[0];

        if (!cfg || !cfg.drive_script_url || !cfg.drive_token) {
            return res.json({ error: 'Missing config', cfg: { hasUrl: !!cfg?.drive_script_url, hasToken: !!cfg?.drive_token } });
        }

        console.log('[Test Email] Sending to Apps Script:', cfg.drive_script_url);

        const response = await fetch(cfg.drive_script_url, {
            method: 'POST',
            body: JSON.stringify({
                token: cfg.drive_token,
                action: 'sendEmail',
                to: [req.query.email || 'test@example.com'],
                subject: 'Test Email from Multitrade',
                htmlBody: '<h1>It works!</h1><p>This is a test email from Multitrade Management System.</p>'
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        console.log('[Test Email] Apps Script response:', data);
        res.json(data);
    } catch (err) {
        console.error('[Test Email] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FILE TASKS — Admin CRUD
// ========================================
app.get('/api/file-tasks', requireAuth, async (req, res) => {
    try {
        // ✅ 第 1 次查询：拿所有 task + submission count
        const tasks = await pool.query(`
            SELECT ft.*,
                COALESCE(sub.cnt, 0) as submitted_count
            FROM file_tasks ft
            LEFT JOIN (
                SELECT task_id, COUNT(*) as cnt
                FROM file_task_submissions
                GROUP BY task_id
            ) sub ON sub.task_id = ft.id
            ORDER BY ft.created_at DESC
        `);

        // ✅ 第 2 次查询：employee 总数（所有 task 共用）
        const empResult = await pool.query(
            `SELECT COUNT(*) FROM members m JOIN users u ON u.member_id = m.id WHERE u.role = 'employee'`
        );
        const allEmployeeCount = parseInt(empResult.rows[0].count);

        // ✅ 第 3 次查询：所有 submission 详情一次拉完
        const allSubs = await pool.query(`
            SELECT fts.*, m.name as member_name
            FROM file_task_submissions fts
            LEFT JOIN members m ON fts.member_id = m.id
            ORDER BY fts.submitted_at DESC
        `);

        // 按 task_id 分组
        const subsMap = {};
        allSubs.rows.forEach(s => {
            if (!subsMap[s.task_id]) subsMap[s.task_id] = [];
            subsMap[s.task_id].push(s);
        });

        const result = tasks.rows.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            deadline: t.deadline,
            targetType: t.target_type,
            targetMemberIds: t.target_member_ids || [],
            notifyType: t.notify_type,
            checkIntervalMinutes: t.check_interval_minutes,
            lastCheckedAt: t.last_checked_at,
            isActive: t.is_active,
            createdBy: t.created_by,
            createdAt: t.created_at,
            targetCount: t.target_type === 'all' ? allEmployeeCount : (t.target_member_ids || []).length,
            submittedCount: parseInt(t.submitted_count),
            submissions: (subsMap[t.id] || []).map(s => ({
                id: s.id,
                memberId: s.member_id,
                memberName: s.member_name,
                fileName: s.submitted_file_name,
                fileUrl: s.submitted_file_url,
                driveFileId: s.submitted_drive_file_id,
                submittedAt: s.submitted_at
            }))
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file-tasks', requireEdit, async (req, res) => {
    const { title, description, deadline, targetType, targetMemberIds, notifyType, checkIntervalMinutes, isActive, sendNow } = req.body;
    if (!title || !deadline) return res.status(400).json({ error: 'Title and deadline required' });

    try {
        const result = await pool.query(
            `INSERT INTO file_tasks (title, description, deadline, target_type, target_member_ids, notify_type, check_interval_minutes, is_active, created_by, last_checked_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [
                title.trim(),
                (description || '').trim(),
                deadline,
                targetType || 'all',
                targetMemberIds || [],
                notifyType || 'both',
                checkIntervalMinutes || 1440,
                isActive !== false,
                req.user.memberId || null,
                sendNow ? null : new Date()  // ✅ NOW，scheduler will not immediate trigger
            ]
        );

        const taskId = result.rows[0].id;

        // Send immediate notification (wrapped so it NEVER breaks task creation)
        if (sendNow && isActive !== false) {
            try {
                let targetMembers;
                if (targetType === 'all') {
                    // ✅ 改这里，只查 employee
                    targetMembers = await pool.query(`SELECT m.id, m.name, m.email FROM members m
                        JOIN users u ON u.member_id = m.id WHERE u.role = 'employee'`);
                } else {
                    // ✅ 不改，admin 手动选的人可能是故意的
                    const ids = targetMemberIds || [];
                    if (ids.length > 0) {
                        targetMembers = await pool.query('SELECT id, name, email FROM members WHERE id = ANY($1)', [ids]);
                    } else {
                        targetMembers = { rows: [] };
                    }
                }

                const deadlineStr = new Date(deadline).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const notifTitle = title.trim();
                const notifMsg = description
                    ? description.trim() + ' | Deadline: ' + deadlineStr
                    : 'Deadline: ' + deadlineStr;

                for (const member of targetMembers.rows) {
                    if (notifyType === 'inapp' || notifyType === 'both') {
                        await pool.query(
                            'INSERT INTO notifications (member_id, title, message, type, related_type, related_id) VALUES ($1,$2,$3,$4,$5,$6)',
                            [member.id, notifTitle, notifMsg, 'file_task', 'file_task', taskId]
                        );
                    }

                    if ((notifyType === 'email' || notifyType === 'both') && member.email) {
                        try {
                            const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                            const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                            const scriptUrl = cfgResult.rows[0]?.value;
                            const token = tokenResult.rows[0]?.value || '';

                            if (scriptUrl && token) {
                                await fetch(scriptUrl, {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        token: token,
                                        action: 'sendEmail',
                                        to: [member.email],
                                        subject: '[Multitrade] ' + notifTitle,
                                        htmlBody: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">'
                                            + '<div style="background:#f59e0b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">'
                                            + '<h2 style="margin:0;font-size:1.1rem">' + notifTitle + '</h2></div>'
                                            + '<div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">'
                                            + (description ? '<p style="color:#374151;line-height:1.6">' + description.trim() + '</p>' : '')
                                            + '<p style="color:#6b7280">Deadline: ' + deadlineStr + '</p>'
                                            + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">'
                                            + '<p style="color:#9ca3af;font-size:.82rem">Multitrade Management System</p></div></div>'
                                    }),
                                    headers: { 'Content-Type': 'application/json' }
                                });
                            }
                        } catch (emailErr) {
                            console.error('[FileTask] Immediate email failed for ' + member.email + ':', emailErr.message);
                        }
                    }

                    console.log('[FileTask] Immediate notify sent to: ' + member.name);
                }

                await pool.query('UPDATE file_tasks SET last_checked_at = NOW() WHERE id = $1', [taskId]);
                
            } catch (notifyErr) {
                console.error('[FileTask] Immediate notify error:', notifyErr.message);
                // Don't fail the task creation
            }
        }

        res.json({ id: taskId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/file-tasks/:id', requireEdit, async (req, res) => {
    const { title, description, deadline, targetType, targetMemberIds, notifyType, checkIntervalMinutes, isActive, sendNow } = req.body;
    try {
        await pool.query(
            `UPDATE file_tasks SET title=$1, description=$2, deadline=$3, target_type=$4, target_member_ids=$5,
             notify_type=$6, check_interval_minutes=$7, is_active=$8 WHERE id=$9`,
            [title.trim(), (description||'').trim(), deadline, targetType||'all', targetMemberIds||[],
             notifyType||'both', checkIntervalMinutes||1440, isActive!==false, req.params.id]
        );

        const taskId = parseInt(req.params.id);

        // Send notification now (edit)
        if (sendNow && isActive !== false) {
            try {
                const taskTitle = title.trim();
                let targetMembers;
                if (targetType === 'all') {
                    targetMembers = await pool.query(`SELECT m.id, m.name, m.email FROM members m
                        JOIN users u ON u.member_id = m.id WHERE u.role = 'employee'`);
                } else {
                    const ids = targetMemberIds || [];
                    if (ids.length > 0) {
                        targetMembers = await pool.query('SELECT id, name, email FROM members WHERE id = ANY($1)', [ids]);
                    } else {
                        targetMembers = { rows: [] };
                    }
                }

                const deadlineStr = new Date(deadline).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const notifMsg = description
                    ? description.trim() + ' | Deadline: ' + deadlineStr
                    : 'Deadline: ' + deadlineStr;

                const promises = [];

                for (const member of targetMembers.rows) {
                    if (notifyType === 'inapp' || notifyType === 'both') {
                        promises.push(
                            pool.query(
                                'INSERT INTO notifications (member_id, title, message, type, related_type, related_id) VALUES ($1,$2,$3,$4,$5,$6)',
                                [member.id, taskTitle, notifMsg, 'file_task', 'file_task', taskId]
                            ).then(() => console.log('[FileTask] Edit in-app sent to: ' + member.name))
                        );
                    }

                    if ((notifyType === 'email' || notifyType === 'both') && member.email) {
                        promises.push(
                            (async () => {
                                const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                                const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                                const scriptUrl = cfgResult.rows[0]?.value;
                                const token = tokenResult.rows[0]?.value || '';

                                if (scriptUrl && token) {
                                    await fetch(scriptUrl, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            token: token,
                                            action: 'sendEmail',
                                            to: [member.email],
                                            subject: '[Multitrade] ' + taskTitle,
                                            htmlBody: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">'
                                                + '<div style="background:#f59e0b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">'
                                                + '<h2 style="margin:0;font-size:1.1rem">' + taskTitle + '</h2></div>'
                                                + '<div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">'
                                                + (description ? '<p style="color:#374151;line-height:1.6">' + description.trim() + '</p>' : '')
                                                + '<p style="color:#6b7280">Deadline: ' + deadlineStr + '</p>'
                                                + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">'
                                                + '<p style="color:#9ca3af;font-size:.82rem">Multitrade Management System</p></div></div>'
                                        }),
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                    console.log('[FileTask] Edit email sent to: ' + member.email);
                                }
                            })().catch(err => console.error('[FileTask] Edit email failed for ' + member.email + ':', err.message))
                        );
                    }
                }

                await Promise.all(promises);
                await pool.query('UPDATE file_tasks SET last_checked_at = NOW() WHERE id = $1', [taskId]);

            } catch (notifyErr) {
                console.error('[FileTask] Edit notify error:', notifyErr.message);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/file-tasks/:id', requireEdit, async (req, res) => {
    try {
        await pool.query('DELETE FROM file_tasks WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FILE TASKS — Employee Submit
// ========================================
app.get('/api/file-tasks/my-tasks', requireAuth, async (req, res) => {
    try {
        const memberId = req.user.memberId;
        if (!memberId) return res.json([]);

        const tasks = await pool.query(`
            SELECT ft.*,
                fts.id as submission_id,
                fts.submitted_file_name,
                fts.submitted_file_url,
                fts.submitted_drive_file_id,
                fts.submitted_at
            FROM file_tasks ft
            LEFT JOIN file_task_submissions fts ON ft.id = fts.task_id AND fts.member_id = $1
            WHERE ft.is_active = true
            AND (ft.target_type = 'all' OR $1 = ANY(ft.target_member_ids))
            ORDER BY ft.deadline ASC
        `, [memberId]);

        const result = tasks.rows.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            deadline: t.deadline,
            targetType: t.target_type,
            notifyType: t.notify_type,
            isActive: t.is_active,
            createdAt: t.created_at,
            submitted: !!t.submission_id,
            submittedFileName: t.submitted_file_name,
            submittedFileUrl: t.submitted_file_url,
            submittedDriveFileId: t.submitted_drive_file_id,
            submittedAt: t.submitted_at
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file-tasks/:id/submit', requireAuth, async (req, res) => {
    try {
        const taskId = req.params.id;
        const memberId = req.user.memberId;
        if (!memberId) return res.status(400).json({ error: 'Member not found' });

        const task = await pool.query('SELECT * FROM file_tasks WHERE id = $1 AND is_active = true', [taskId]);
        if (!task.rows.length) return res.status(404).json({ error: 'Task not found' });

        const existing = await pool.query(
            'SELECT id FROM file_task_submissions WHERE task_id = $1 AND member_id = $2', [taskId, memberId]
        );
        if (existing.rows.length) return res.status(400).json({ error: 'Already submitted' });

        const { fileName, fileUrl, driveFileId, fileSize, fileType, driveSettingId, remark } = req.body;

        // Create file record with remark and drive_setting_id
        const fileResult = await pool.query(
            'INSERT INTO files (title, name, type, size, url, drive_file_id, drive_setting_id, uploaded_by, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [task.rows[0].title + ' - Submission', fileName, fileType || '', fileSize || 0, fileUrl, driveFileId, driveSettingId || null, memberId, remark || '']
        );

        await pool.query(
            'INSERT INTO file_task_submissions (task_id, member_id, submitted_file_name, submitted_file_url, submitted_drive_file_id) VALUES ($1,$2,$3,$4,$5)',
            [taskId, memberId, fileName, fileUrl, driveFileId]
        );

        res.json({ success: true, fileId: fileResult.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get who hasn't submitted (admin view)
app.get('/api/file-tasks/:id/pending', requireEdit, async (req, res) => {
    try {
        const task = await pool.query('SELECT * FROM file_tasks WHERE id = $1', [req.params.id]);
        if (!task.rows.length) return res.status(404).json({ error: 'Task not found' });

        const t = task.rows[0];
        let members;

        if (t.target_type === 'all') {
            // ✅ 只查 employee
            members = await pool.query(`SELECT m.id, m.name, m.email FROM members m
                JOIN users u ON u.member_id = m.id WHERE u.role = 'employee' ORDER BY m.name`);
        } else {
            const ids = t.target_member_ids || [];
            if (ids.length === 0) return res.json([]);
            members = await pool.query('SELECT id, name, email FROM members WHERE id = ANY($1) ORDER BY name', [ids]);
        }

        const submitted = await pool.query(
            'SELECT member_id FROM file_task_submissions WHERE task_id = $1', [t.id]
        );
        const submittedIds = new Set(submitted.rows.map(r => r.member_id));

        const result = members.rows.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            submitted: submittedIds.has(m.id)
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// NOTIFICATIONS
// ========================================
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const memberId = req.user.memberId;
        if (!memberId) return res.json([]);

        const result = await pool.query(
            'SELECT * FROM notifications WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50', [memberId]
        );
        res.json(result.rows.map(n => ({
            id: n.id,
            memberId: n.member_id,
            title: n.title,
            message: n.message,
            type: n.type,
            relatedType: n.related_type,
            relatedId: n.related_id,
            isRead: n.is_read,
            createdAt: n.created_at
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND member_id = $2',
            [req.params.id, req.user.memberId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE member_id = $1', [req.user.memberId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// delete one — 加 requireAuth + 限制只能删自己的
app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM notifications WHERE id = $1 AND member_id = $2',
            [req.params.id, req.user.memberId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// delete all
app.delete('/api/notifications/member/me', requireAuth, async (req, res) => {
    try {
        // 只删已完成任务的通知 + 非 task 类型的通知
        await pool.query(`
            DELETE FROM notifications
            WHERE member_id = $1
            AND (
                type NOT IN ('file_task', 'file_task_reminder')
                OR related_id IN (
                    SELECT task_id FROM file_task_submissions
                    WHERE member_id = $1
                )
            )
        `, [req.user.memberId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// project template download
app.get('/api/template/projects/:scopeId', async (req, res) => {
    try {
        const scope = await pool.query('SELECT name FROM scopes WHERE id = $1', [req.params.scopeId]);
        const scopeName = scope.rows.length > 0 ? scope.rows[0].name : 'Projects';
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Panel ID', 'Customer', 'Start Date', 'End Date', 'Install Date', 'Status'],
            ['P10093', 'Petronas', '15/01/2025', '30/06/2025', '15/06/2025', 'pending'],
        ]);
        ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, scopeName.substring(0, 31));
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="' + scopeName + '_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

async function initDB() {
    var tables = [
        `CREATE TABLE IF NOT EXISTS positions (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS departments (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY, name VARCHAR(300) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS members (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
            position_id INT REFERENCES positions(id) ON DELETE SET NULL,
            department_id INT REFERENCES departments(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(200) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'employee',
            member_id INT REFERENCES members(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
            token VARCHAR(64) PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS salaries (
            id SERIAL PRIMARY KEY, member_id INT REFERENCES members(id) ON DELETE CASCADE,
            month VARCHAR(7) NOT NULL, amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            UNIQUE(member_id, month)
        )`,
        `CREATE TABLE IF NOT EXISTS project_assignments (
            id SERIAL PRIMARY KEY,
            project_id INT REFERENCES projects(id) ON DELETE CASCADE,
            member_id INT REFERENCES members(id) ON DELETE CASCADE,
            UNIQUE(project_id, member_id)
        )`,
        `CREATE TABLE IF NOT EXISTS scopes (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS sub_scopes (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS details (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS web_access (
            id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '', flag BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS worklist (
            id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            member_id INT REFERENCES members(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            clock_in TIMESTAMP,
            clock_out TIMESTAMP,
            project_id INT REFERENCES projects(id) ON DELETE SET NULL,
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS scope_pics (
            id SERIAL PRIMARY KEY,
            scope_id INT REFERENCES scopes(id) ON DELETE CASCADE,
            member_id INT REFERENCES members(id) ON DELETE CASCADE,
            UNIQUE(scope_id, member_id)
        )`,
        `CREATE TABLE IF NOT EXISTS scope_departments (
            id SERIAL PRIMARY KEY,
            scope_id INT REFERENCES scopes(id) ON DELETE CASCADE,
            department_id INT REFERENCES departments(id) ON DELETE CASCADE,
            UNIQUE(scope_id, department_id)
        )`,
        `CREATE TABLE IF NOT EXISTS viewer_scopes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            scope_id INTEGER REFERENCES scopes(id) ON DELETE CASCADE,
            UNIQUE(user_id, scope_id)
        )`,
        `CREATE TABLE IF NOT EXISTS m_panel (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            project_name VARCHAR(300) DEFAULT '',
            customer VARCHAR(200) DEFAULT '',
            customer_location VARCHAR(300) DEFAULT '',
            pic VARCHAR(200) DEFAULT '',
            status VARCHAR(50) DEFAULT 'pending',
            start_date DATE,
            end_date DATE,
            remark TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS m_material (
            id SERIAL PRIMARY KEY,
            part_no VARCHAR(100) NOT NULL,
            brand VARCHAR(200) DEFAULT '',
            description VARCHAR(300) DEFAULT '',
            serial_no VARCHAR(100) UNIQUE NOT NULL,
            yom VARCHAR(20) DEFAULT '',
            vendor VARCHAR(200) DEFAULT '',
            vendor_po_no VARCHAR(100) DEFAULT '',
            panel_no VARCHAR(200) DEFAULT '',
            install_date DATE,
            category VARCHAR(100) DEFAULT '',
            unit VARCHAR(20) DEFAULT 'pc',
            unit_price NUMERIC(12,2) DEFAULT 0,
            qty NUMERIC(12,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS app_config (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT DEFAULT ''
        )`,
        `CREATE TABLE IF NOT EXISTS drive_settings (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) DEFAULT '',
            folder_id VARCHAR(300) DEFAULT '',
            is_default BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS files (
            id SERIAL PRIMARY KEY,
            name VARCHAR(500) DEFAULT '',
            type VARCHAR(200) DEFAULT '',
            size BIGINT DEFAULT 0,
            url TEXT DEFAULT '',
            drive_file_id VARCHAR(200) DEFAULT '',
            uploaded_by INT REFERENCES members(id) ON DELETE SET NULL,
            drive_setting_id INT REFERENCES drive_settings(id) ON DELETE SET NULL,
            category VARCHAR(100) DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS file_notices (
            id SERIAL PRIMARY KEY,
            title VARCHAR(300) NOT NULL,
            message TEXT DEFAULT '',
            target_type VARCHAR(20) DEFAULT 'all',
            target_member_id INT REFERENCES members(id) ON DELETE CASCADE,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS file_tasks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(300) NOT NULL,
            description TEXT DEFAULT '',
            deadline TIMESTAMP NOT NULL,
            target_type VARCHAR(20) DEFAULT 'all',
            target_member_ids INTEGER[] DEFAULT '{}',
            notify_type VARCHAR(20) DEFAULT 'both',
            check_interval_minutes INTEGER DEFAULT 1440,
            last_checked_at TIMESTAMP,
            is_active BOOLEAN DEFAULT true,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS file_task_submissions (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES file_tasks(id) ON DELETE CASCADE,
            member_id INTEGER,
            submitted_file_name VARCHAR(500),
            submitted_file_url TEXT,
            submitted_drive_file_id VARCHAR(200),
            submitted_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(task_id, member_id)
        )`,
        `CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            member_id INTEGER,
            title VARCHAR(300),
            message TEXT DEFAULT '',
            type VARCHAR(50) DEFAULT 'general',
            related_type VARCHAR(50),
            related_id INTEGER,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )`
    ];

    for (var i = 0; i < tables.length; i++) {
        try {
            await pool.query(tables[i]);
        } catch (e) {
            console.error('CREATE TABLE error:', e.message.substring(0, 120));
        }
    }
    console.log('All tables created');

    var alterStatements = [
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE SET NULL",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS sub_scope_id INT REFERENCES sub_scopes(id) ON DELETE SET NULL",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS detail_id INT REFERENCES details(id) ON DELETE SET NULL",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS scope_id INT REFERENCES scopes(id) ON DELETE SET NULL",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_plan_id INTEGER REFERENCES worklist(id) ON DELETE SET NULL",
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_done_id INTEGER REFERENCES worklist(id) ON DELETE SET NULL",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS category_id INT REFERENCES scopes(id) ON DELETE SET NULL",
        "ALTER TABLE sub_scopes ADD COLUMN IF NOT EXISTS scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL",
        "ALTER TABLE worklist ADD COLUMN IF NOT EXISTS scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer VARCHAR(200) DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS location VARCHAR(300) DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS install_date DATE",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_name_cat_unique') THEN ALTER TABLE projects ADD CONSTRAINT projects_name_cat_unique UNIQUE (name, category_id); END IF; END $$",
        "ALTER TABLE departments ADD COLUMN IF NOT EXISTS work_days_per_week INT DEFAULT 6",
        "ALTER TABLE departments ADD COLUMN IF NOT EXISTS normal_day_hours DECIMAL(4,2) DEFAULT 9.00",
        "ALTER TABLE departments ADD COLUMN IF NOT EXISTS saturday_hours DECIMAL(4,2) DEFAULT 9.00",
        "ALTER TABLE files ADD COLUMN IF NOT EXISTS remark VARCHAR(500) DEFAULT ''",
        "ALTER TABLE files ADD COLUMN IF NOT EXISTS title VARCHAR(300) DEFAULT ''",
        "ALTER TABLE file_notices ADD COLUMN IF NOT EXISTS target_member_ids TEXT DEFAULT ''",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL;"
    ];

    for (var i = 0; i < alterStatements.length; i++) {
        try { await pool.query(alterStatements[i]); } catch (e) {
            console.log('ALTER skip:', e.message.substring(0, 80));
        }
    }
    console.log('Attendance columns ensured');

    var ptAlterStatements = [
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS yom VARCHAR(20) DEFAULT ''",
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS vendor VARCHAR(200) DEFAULT ''",
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS vendor_po_no VARCHAR(100) DEFAULT ''",
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS panel_no VARCHAR(200) DEFAULT ''",
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS install_date DATE",
        "ALTER TABLE m_material ADD COLUMN IF NOT EXISTS qty NUMERIC(12,2) DEFAULT 0",
    ];

    for (var i = 0; i < ptAlterStatements.length; i++) {
        try { await pool.query(ptAlterStatements[i]); } catch (e) {
            console.log('PT ALTER skip:', e.message.substring(0, 80));
        }
    }
    console.log('Panel Tracking columns ensured');

    var indexes = [
        "CREATE INDEX IF NOT EXISTS idx_salaries_member ON salaries(member_id)",
        "CREATE INDEX IF NOT EXISTS idx_salaries_month ON salaries(month)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_member ON project_assignments(member_id)",
        "CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_id)",
        "CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)",
    ];

    for (var i = 0; i < indexes.length; i++) {
        try { await pool.query(indexes[i]); } catch (e) {
            console.log('INDEX skip:', e.message.substring(0, 80));
        }
    }
    console.log('Indexes created');

    try {
        await pool.query(`INSERT INTO users (username, password, role) VALUES ('adminMTA', 'admin00000', 'admin') ON CONFLICT (username) DO NOTHING`);
    } catch (e) {
        console.log('Admin insert skip:', e.message.substring(0, 80));
    }

    // 给所有没有 member 的 admin 自动建 member 并关联
    try {
        const orphanAdmins = await pool.query("SELECT id, username FROM users WHERE role = 'admin' AND member_id IS NULL");
        if (orphanAdmins.rows.length > 0) {
            const existingAdmin = await pool.query("SELECT id FROM members WHERE name = 'Admin' LIMIT 1");
            let memberId;
            if (existingAdmin.rows.length) {
                memberId = existingAdmin.rows[0].id;
            } else {
                const newMember = await pool.query("INSERT INTO members (name) VALUES ('Admin') RETURNING id");
                memberId = newMember.rows[0].id;
            }
            for (const admin of orphanAdmins.rows) {
                await pool.query("UPDATE users SET member_id = $1 WHERE id = $2", [memberId, admin.id]);
                console.log(`Admin '${admin.username}' linked: member_id=${memberId}`);
            }
        }
    } catch (e) {
        console.log('Admin member link skip:', e.message.substring(0, 80));
    }

    console.log('Admin user ready');
    console.log('Admin user ready');

    console.log('Database fully initialized');
}


// ========================================
// RUNTIME STATE FLAGS — prevent overlapping runs
// ========================================
let isOverdueChecking = false;
let isUpcomingChecking = false;

// ========================================
// SAFE WRAPPERS — sequential, no overlap
// ========================================
const checkOverdueTasksSafe = async () => {
    if (isOverdueChecking) return;
    isOverdueChecking = true;
    try {   
        await checkOverdueTasks();
    } catch (error) {
        console.error('[Scheduler] Error in overdue check:', error);
    } finally {
        isOverdueChecking = false;
        setTimeout(checkOverdueTasksSafe, 60 * 1000 );
    }
};

const checkUpcomingTasksSafe = async () => {
    if (isUpcomingChecking) return;
    isUpcomingChecking = true;
    try {
        await checkUpcomingTasks();
    } catch (error) {
        console.error('[Scheduler] Error in upcoming check:', error);
    } finally {
        isUpcomingChecking = false;
        setTimeout(checkUpcomingTasksSafe, 60 * 1000);
    }
};

// ========================================
// FILE TASK AUTO-CHECK SCHEDULER
// ========================================
const cleanupOldNotifications = async () => {
    try {
        const result = await pool.query(
            `DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'`
        );
        if (result.rowCount > 0) {
            console.log('[Scheduler] Cleaned up ' + result.rowCount + ' old notifications');
        }
    } catch (err) {
        console.error('[Scheduler] Cleanup error:', err.message);
    }
};

const cleanupOldSessions = async () => {
    try {
        const result = await pool.query(
            `DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '7 days'`
        );
        if (result.rowCount > 0) {
            console.log('[Scheduler] Cleaned up ' + result.rowCount + ' old sessions');
        }
    } catch (err) {
    }
};

const startFileTaskScheduler = () => {
    console.log('[Scheduler] Started Safely');
    checkOverdueTasksSafe();
    checkUpcomingTasksSafe();

    // 每 24 小时清理一次旧通知
    // Clean old notice every 24 hour 
    setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000);
    cleanupOldNotifications(); // auto run
};

// ========================================
// OVERDUE CHECK — deadline passed, not submitted
// ========================================
const checkOverdueTasks = async () => {
    try {
        const now = new Date();
        const tasks = await pool.query(`
            SELECT ft.* FROM file_tasks ft
            WHERE ft.is_active = true
            AND ft.deadline <= $1
            AND EXISTS (
                SELECT 1 FROM members m
                WHERE (ft.target_type = 'all' OR m.id = ANY(ft.target_member_ids))
                AND NOT EXISTS (
                    SELECT 1 FROM file_task_submissions fts
                    WHERE fts.task_id = ft.id AND fts.member_id = m.id
                )
            )
        `, [now]);

        if (tasks.rows.length === 0) return;

        for (const task of tasks.rows) {
            const lastChecked = task.last_checked_at ? new Date(task.last_checked_at) : null;
            const intervalMs = (task.check_interval_minutes || 30) * 60 * 1000;
            const deadlineTime = new Date(task.deadline);

            // ✅ 第一次 overdue：last_checked 在 deadline 之前（或没有）→ 立刻发
            // ✅ 之后：严格按 interval 冷却
            const isFirstOverdue = !lastChecked || lastChecked < deadlineTime;

            if (!isFirstOverdue && (now - lastChecked) < intervalMs) {
                console.log('[Scheduler] Overdue — cooldown for "' + task.title + '", skipping');
                continue;
            }

            console.log('[Scheduler] Processing overdue "' + task.title + '"');

            const submitted = await pool.query(
                'SELECT member_id FROM file_task_submissions WHERE task_id = $1', [task.id]
            );
            const submittedIds = new Set(submitted.rows.map(r => r.member_id));

            let targetMembers;
            if (task.target_type === 'all') {
                targetMembers = await pool.query(`SELECT m.id, m.name, m.email FROM members m
                    JOIN users u ON u.member_id = m.id WHERE u.role = 'employee'`);
            } else {
                const ids = task.target_member_ids || [];
                if (ids.length === 0) continue;
                targetMembers = await pool.query('SELECT id, name, email FROM members WHERE id = ANY($1)', [ids]);
            }

            const pendingMembers = targetMembers.rows.filter(m => !submittedIds.has(m.id));
            if (pendingMembers.length === 0) continue;

            let scriptUrl = null, token = null;
            if (task.notify_type === 'email' || task.notify_type === 'both') {
                const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                scriptUrl = cfgResult.rows[0]?.value;
                token = tokenResult.rows[0]?.value || '';
            }

            const deadlineStr = new Date(task.deadline).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const notifTitle = 'Overdue: ' + task.title;
            const notifMsg = 'The submission was due on ' + deadlineStr + '. Please submit ASAP.';

            const promises = [];

            for (const member of pendingMembers) {
                if (task.notify_type === 'inapp' || task.notify_type === 'both') {
                    promises.push(
                        pool.query(
                            'INSERT INTO notifications (member_id, title, message, type, related_type, related_id) VALUES ($1,$2,$3,$4,$5,$6)',
                            [member.id, notifTitle, notifMsg, 'file_task_reminder', 'file_task', task.id]
                        ).then(() => console.log('[Scheduler] Overdue in-app sent to: ' + member.name))
                    );
                }

                if ((task.notify_type === 'email' || task.notify_type === 'both') && member.email && scriptUrl && token) {
                    promises.push(
                        fetch(scriptUrl, {
                            method: 'POST',
                            body: JSON.stringify({
                                token: token,
                                action: 'sendEmail',
                                to: [member.email],
                                subject: '[Multitrade] OVERDUE: ' + task.title,
                                htmlBody: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">'
                                    + '<div style="background:#dc2626;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">'
                                    + '<h2 style="margin:0">Overdue Submission Reminder</h2></div>'
                                    + '<div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">'
                                    + '<p style="font-weight:600">' + task.title + '</p>'
                                    + '<p style="color:#dc2626">Deadline was: ' + deadlineStr + '</p>'
                                    + '<p>Please submit as soon as possible.</p></div></div>'
                            }),
                            headers: { 'Content-Type': 'application/json' }
                        })
                        .then(() => console.log('[Scheduler] Overdue email sent to: ' + member.email))
                        .catch(err => console.error('[Scheduler] Overdue email failed for ' + member.email + ':', err.message))
                    );
                }
            }

            await Promise.all(promises);
            await pool.query('UPDATE file_tasks SET last_checked_at = $1 WHERE id = $2', [now, task.id]);
        }
    } catch (err) {
        console.error('[Scheduler] checkOverdueTasks error:', err.message);
    }
};

// ========================================
// UPCOMING CHECK — before deadline, interval-based reminders
// ========================================
const checkUpcomingTasks = async () => {
    try {
        const now = new Date();
        const tasks = await pool.query(
            `SELECT * FROM file_tasks WHERE is_active = true AND deadline > NOW()`
        );

        for (const task of tasks.rows) {
            const lastChecked = task.last_checked_at ? new Date(task.last_checked_at) : null;
            const intervalMs = (task.check_interval_minutes || 1440) * 60 * 1000;

            if (lastChecked && (now - lastChecked) < intervalMs) continue;

            console.log('[Scheduler] Processing upcoming "' + task.title + '"');

            const submitted = await pool.query(
                'SELECT member_id FROM file_task_submissions WHERE task_id = $1', [task.id]
            );
            const submittedIds = new Set(submitted.rows.map(r => r.member_id));

            let targetMembers;
            if (task.target_type === 'all') {
                targetMembers = await pool.query(`SELECT m.id, m.name, m.email FROM members m
                    JOIN users u ON u.member_id = m.id WHERE u.role = 'employee'`);
            } else {
                const ids = task.target_member_ids || [];
                if (ids.length === 0) {
                    await pool.query('UPDATE file_tasks SET last_checked_at = $1 WHERE id = $2', [now, task.id]);
                    continue;
                }
                targetMembers = await pool.query('SELECT id, name, email FROM members WHERE id = ANY($1)', [ids]);
            }

            const pendingMembers = targetMembers.rows.filter(m => !submittedIds.has(m.id));
            if (pendingMembers.length === 0) {
                await pool.query('UPDATE file_tasks SET last_checked_at = $1 WHERE id = $2', [now, task.id]);
                continue;
            }

            // ✅ check one time
            let scriptUrl = null, token = null;
            if (task.notify_type === 'email' || task.notify_type === 'both') {
                const cfgResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_script_url'");
                const tokenResult = await pool.query("SELECT value FROM app_config WHERE key = 'drive_token'");
                scriptUrl = cfgResult.rows[0]?.value;
                token = tokenResult.rows[0]?.value || '';
            }

            const deadlineStr = new Date(task.deadline).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const notifTitle = task.title;
            const notifMsg = task.description
                ? task.description + ' | Deadline: ' + deadlineStr
                : 'Deadline: ' + deadlineStr;

            // ✅ collect all，and execute
            const promises = [];

            for (const member of pendingMembers) {
                // In-app 通知
                if (task.notify_type === 'inapp' || task.notify_type === 'both') {
                    promises.push(
                        pool.query(
                            'INSERT INTO notifications (member_id, title, message, type, related_type, related_id) VALUES ($1,$2,$3,$4,$5,$6)',
                            [member.id, notifTitle, notifMsg, 'file_task', 'file_task', task.id]
                        ).then(() => console.log('[Scheduler] Upcoming in-app sent to: ' + member.name))
                    );
                }

                // Email
                if ((task.notify_type === 'email' || task.notify_type === 'both') && member.email && scriptUrl && token) {
                    promises.push(
                        fetch(scriptUrl, {
                            method: 'POST',
                            body: JSON.stringify({
                                token: token,
                                action: 'sendEmail',
                                to: [member.email],
                                subject: '[Multitrade] ' + notifTitle,
                                htmlBody: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">'
                                    + '<div style="background:#f59e0b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">'
                                    + '<h2 style="margin:0;font-size:1.1rem">' + notifTitle + '</h2></div>'
                                    + '<div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">'
                                    + (task.description ? '<p style="color:#374151;line-height:1.6">' + task.description + '</p>' : '')
                                    + '<p style="color:#6b7280">Deadline: ' + deadlineStr + '</p>'
                                    + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">'
                                    + '<p style="color:#9ca3af;font-size:.82rem">Multitrade Management System</p></div></div>'
                            }),
                            headers: { 'Content-Type': 'application/json' }
                        })
                        .then(() => console.log('[Scheduler] Upcoming email sent to: ' + member.email))
                        .catch(err => console.error('[Scheduler] Upcoming email failed for ' + member.email + ':', err.message))
                    );
                }
            }

            // ✅ send all in one time
            await Promise.all(promises);

            await pool.query('UPDATE file_tasks SET last_checked_at = $1 WHERE id = $2', [now, task.id]);
        }
    } catch (err) {
        console.error('[Scheduler] checkUpcomingTasks error:', err.message);
    }
};


const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await initDB();
    console.log('Multitrade server running on port ' + PORT);

    // Call this after server starts
    startFileTaskScheduler();
});

// use for app script access permission
// function authorizeEmail() {
//   MailApp.sendEmail({
//     to: 'ongts@multitradepac.com',
//     subject: 'Multitrade Mail Authorization',
//     body: 'Testing MailApp permission'
//   });
//   Logger.log('Done! Permission granted.');
// }
//