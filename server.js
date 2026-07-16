const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
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
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
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
            installDate: r.install_date
        }));
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', requireEditOrPic, async (req, res) => {
    const { name, categoryId, startDate, endDate, customer, location, installDate } = req.body;
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
            'INSERT INTO projects (name, category_id, start_date, end_date, customer, location, install_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [name, categoryId || null, startDate || null, endDate || null, customer || '', location || '', installDate || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', requireEditOrPic, async (req, res) => {
    const { name, categoryId, startDate, endDate, customer, location, installDate } = req.body;
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
            'UPDATE projects SET name = $1, category_id = $2, start_date = $3, end_date = $4, customer = $5, location = $6, install_date = $7 WHERE id = $8',
            [name, categoryId || null, startDate || null, endDate || null, customer || '', location || '', installDate || null, req.params.id]
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
            SELECT m.*, p.name as position_name, d.name as department_name
            FROM members m
            LEFT JOIN positions p ON m.position_id = p.id
            LEFT JOIN departments d ON m.department_id = d.id
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
    const { name, positionId, departmentId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO members (name, position_id, department_id) VALUES ($1, $2, $3) RETURNING id',
            [name, positionId || null, departmentId || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/members/:id', requireEdit, async (req, res) => {
    const { name, positionId, departmentId } = req.body;
    try {
        await pool.query(
            'UPDATE members SET name = $1, position_id = $2, department_id = $3 WHERE id = $4',
            [name, positionId || null, departmentId || null, req.params.id]
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
        res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/departments', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [name]);
        res.json({ id: result.rows[0].id, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/departments/:id', requireEdit, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE departments SET name = $1 WHERE id = $2', [name, req.params.id]);
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

app.post('/api/attendance', requireEdit, async (req, res) => {
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

app.put('/api/attendance/:id', requireEdit, async (req, res) => {
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

app.delete('/api/attendance/:id', requireEdit, async (req, res) => {
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
            `SELECT id, name, start_date, end_date, customer, location, install_date FROM projects WHERE category_id = $1 ORDER BY name`,
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

            try {
                await pool.query(
                    `INSERT INTO projects (name, category_id, start_date, end_date, customer, install_date) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [name, panelScopeId, parseDMY(r['Start Date']), parseDMY(r['End Date']),
                    String(r['Customer'] || '').trim(),
                    parseDMY(r['Install Date'])]
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
        ['Panel ID', 'Customer', 'Start Date', 'End Date', 'Install Date'],
        ['P10093', 'Petronas', '15/01/2025', '30/06/2025', '15/06/2025'],
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
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
        if (!categoryId) return res.status(400).json({ error: 'Category ID required' });

        const buffer = Buffer.from(data, 'base64');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ error: 'File is empty' });

        let inserted = 0, skipped = 0, errors = [];

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = String(r['ID/Name'] || r['ID'] || r['Name'] || r['Project'] || r['Item'] || '').trim();
            if (!name) { skipped++; errors.push('Row ' + (i + 2) + ': missing ID/Name'); continue; }

            try {
                await pool.query(
                    `INSERT INTO projects (name, category_id, start_date, end_date, customer) VALUES ($1, $2, $3, $4, $5)`,
                    [name, categoryId, r['Start Date'] || null, r['End Date'] || null,
                    String(r['Customer'] || '').trim()]
                );
                inserted++;
            } catch (e) { skipped++; errors.push('Row ' + (i + 2) + ': ' + e.message); }
        }

        res.json({ success: true, total: rows.length, inserted, skipped, errors });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/template/projects/:scopeId', (req, res) => {
    pool.query('SELECT name FROM scopes WHERE id = $1', [req.params.scopeId]).then(function(scope) {
        const scopeName = scope.rows.length > 0 ? scope.rows[0].name : 'Items';
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['ID/Name', 'Customer', 'Start Date', 'End Date', 'Install Date'],
            ['PLC-001', 'Petronas', '2025-01-15', '2025-06-30', ''],
        ]);
        ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, scopeName.substring(0, 31));
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="' + scopeName + '_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    }).catch(function(err) {
        res.status(500).json({ error: err.message });
    });
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
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_name_cat_unique') THEN ALTER TABLE projects ADD CONSTRAINT projects_name_cat_unique UNIQUE (name, category_id); END IF; END $$",
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
    console.log('Admin user ready');

    console.log('Database fully initialized');
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await initDB();
    console.log('Multitrade server running on port ' + PORT);
});