const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

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



// Helper: convert member row to frontend format
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
        res.json({ id: u.id, username: u.username, role: u.role, memberId: u.member_id });
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
        // Create member
        const memberResult = await pool.query(
            'INSERT INTO members (name) VALUES ($1) RETURNING id', [name]
        );
        const memberId = memberResult.rows[0].id;
        // Create user
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
// GET /api/projects
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.name, p.category_id, p.start_date, p.end_date,
                   COALESCE(s.name, 'Uncategorized') as category_name
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
            endDate: r.end_date
        }));
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// POST /api/projects
app.post('/api/projects', async (req, res) => {
    const { name, categoryId, startDate, endDate } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO projects (name, category_id, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, categoryId || null, startDate || null, endDate || null]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id
app.put('/api/projects/:id', async (req, res) => {
    const { name, categoryId, startDate, endDate } = req.body;
    try {
        await pool.query(
            'UPDATE projects SET name = $1, category_id = $2, start_date = $3, end_date = $4 WHERE id = $5',
            [name, categoryId || null, startDate || null, endDate || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.delete('/api/projects/:id', async (req, res) => {
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

app.get('/api/members', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, p.name as position_name, d.name as department_name
            FROM members m
            LEFT JOIN positions p ON m.position_id = p.id
            LEFT JOIN departments d ON m.department_id = d.id
            ORDER BY m.id
        `);
        // Get salaries for each member
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

app.post('/api/members', async (req, res) => {
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

app.put('/api/members/:id', async (req, res) => {
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

app.get('/api/users', async (req, res) => {
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

app.post('/api/users', async (req, res) => {
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

app.put('/api/users/:id', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        if (password) {
            await pool.query(
                'UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4',
                [username, password, role, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username = $1, role = $2 WHERE id = $3',
                [username, role, req.params.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', async (req, res) => {
    const { newPassword } = req.body;
    try {
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
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
// SALARIES
// ========================================

app.put('/api/salaries', async (req, res) => {
    const { memberId, month, amount } = req.body;
    try {
        if (!amount || amount <= 0) {
            await pool.query(
                'DELETE FROM salaries WHERE member_id = $1 AND month = $2', [memberId, month]
            );
        } else {
            await pool.query(`
                INSERT INTO salaries (member_id, month, amount)
                VALUES ($1, $2, $3)
                ON CONFLICT (member_id, month)
                DO UPDATE SET amount = $3
            `, [memberId, month, amount]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// POSITIONS
// ========================================

app.get('/api/positions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM positions ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/positions', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO positions (name) VALUES ($1) RETURNING id', [name]
        );
        res.json({ id: result.rows[0].id, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/positions/:id', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE positions SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/positions/:id', async (req, res) => {
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

app.get('/api/departments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/departments', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO departments (name) VALUES ($1) RETURNING id', [name]
        );
        res.json({ id: result.rows[0].id, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/departments/:id', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE departments SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/departments/:id', async (req, res) => {
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

app.get('/api/assignments', async (req, res) => {
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

app.post('/api/assignments', async (req, res) => {
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

app.delete('/api/assignments', async (req, res) => {
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

app.get('/api/attendance', async (req, res) => {
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

app.post('/api/attendance', async (req, res) => {
    console.log('POST body:', JSON.stringify(req.body));
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

app.put('/api/attendance/:id', async (req, res) => {
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

app.delete('/api/attendance/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// SUB SCOPES
// ========================================
// GET
app.get('/api/subscopes', async (req, res) => {
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

// POST
app.post('/api/subscopes', async (req, res) => {
    const { name, scopeId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO sub_scopes (name, scope_id) VALUES ($1, $2) RETURNING *',
            [name, scopeId || null]
        );
        res.json({ id: result.rows[0].id, name: result.rows[0].name, scopeId: result.rows[0].scope_id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT
app.put('/api/subscopes/:id', async (req, res) => {
    const { name, scopeId } = req.body;
    try {
        await pool.query('UPDATE sub_scopes SET name=$1, scope_id=$2 WHERE id=$3', [name, scopeId || null, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE
app.delete('/api/subscopes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM sub_scopes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================
// DETAILS
// ========================================

app.get('/api/details', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM details ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/details', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO details (name) VALUES ($1) RETURNING id', [name]);
        res.json({ id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/details/:id', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE details SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/details/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM details WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ========================================
// SCOPES
// ========================================
app.get('/api/scopes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scopes ORDER BY id');
        const scopes = await Promise.all(result.rows.map(async (s) => {
            const pics = await pool.query(
                'SELECT member_id FROM scope_pics WHERE scope_id = $1', [s.id]
            );
            return {
                id: s.id,
                name: s.name,
                createdAt: s.created_at,
                picMemberIds: pics.rows.map(r => r.member_id)
            };
        }));
        res.json(scopes);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/scopes — 带 picMemberIds
app.post('/api/scopes', async (req, res) => {
    const { name, picMemberIds } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO scopes (name) VALUES ($1) RETURNING id', [name]
        );
        const scopeId = result.rows[0].id;
        if (picMemberIds && picMemberIds.length > 0) {
            for (const mid of picMemberIds) {
                await pool.query(
                    'INSERT INTO scope_pics (scope_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [scopeId, mid]
                );
            }
        }
        res.json({ id: scopeId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/scopes/:id — 带 picMemberIds
app.put('/api/scopes/:id', async (req, res) => {
    const { name, picMemberIds } = req.body;
    try {
        await pool.query('UPDATE scopes SET name = $1 WHERE id = $2', [name, req.params.id]);
        await pool.query('DELETE FROM scope_pics WHERE scope_id = $1', [req.params.id]);
        if (picMemberIds && picMemberIds.length > 0) {
            for (const mid of picMemberIds) {
                await pool.query(
                    'INSERT INTO scope_pics (scope_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [req.params.id, mid]
                );
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/scopes/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM scopes WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ========================================
// ===== WORKLIST =====
app.get('/api/worklist', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM worklist ORDER BY id');
        res.json(result.rows.map(r => ({
            id: r.id,
            title: r.title,
            scopeId: r.scope_id || null
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/worklist', async (req, res) => {
    const { title, scopeId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO worklist (title, scope_id) VALUES ($1, $2) RETURNING *',
            [title, scopeId || null]
        );
        res.json({ id: result.rows[0].id, title: result.rows[0].title, scopeId: result.rows[0].scope_id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/worklist/:id', async (req, res) => {
    const { title, scopeId } = req.body;
    try {
        await pool.query('UPDATE worklist SET title=$1, scope_id=$2 WHERE id=$3', [title, scopeId || null, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/worklist/:id', async (req, res) => {
    try {
        await pool.query('UPDATE attendance SET work_plan_id = NULL WHERE work_plan_id = $1', [req.params.id]);
        await pool.query('UPDATE attendance SET work_done_id = NULL WHERE work_done_id = $1', [req.params.id]);
        await pool.query('DELETE FROM worklist WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ========================================
// START SERVER
// ========================================
// Catch-all — serve index.html for any route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Auto-create tables + start server
async function initDB() {
    try {
        // 1. CREATE TABLES
        await pool.query(`
            CREATE TABLE IF NOT EXISTS positions (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY, name VARCHAR(300) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS members (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
                position_id INT REFERENCES positions(id) ON DELETE SET NULL,
                department_id INT REFERENCES departments(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(200) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'employee',
                member_id INT REFERENCES members(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS salaries (
                id SERIAL PRIMARY KEY, member_id INT REFERENCES members(id) ON DELETE CASCADE,
                month VARCHAR(7) NOT NULL, amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                UNIQUE(member_id, month)
            );
            CREATE TABLE IF NOT EXISTS project_assignments (
                id SERIAL PRIMARY KEY,
                project_id INT REFERENCES projects(id) ON DELETE CASCADE,
                member_id INT REFERENCES members(id) ON DELETE CASCADE,
                UNIQUE(project_id, member_id)
            );
            CREATE TABLE IF NOT EXISTS scopes (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS sub_scopes (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS details (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS web_access (
                id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
                description TEXT DEFAULT '', flag BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS worklist (
                id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                member_id INT REFERENCES members(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                clock_in TIMESTAMP,
                clock_out TIMESTAMP,
                project_id INT REFERENCES projects(id) ON DELETE SET NULL,
                description TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS scope_pics (
                id SERIAL PRIMARY KEY,
                scope_id INT REFERENCES scopes(id) ON DELETE CASCADE,
                member_id INT REFERENCES members(id) ON DELETE CASCADE,
                UNIQUE(scope_id, member_id)
            );
        `);
        console.log('Tables created');

        // 2. ADD COLUMNS (each one separate, with error catching)
        const alterStatements = [
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
        ];

        for (const sql of alterStatements) {
            try {
                await pool.query(sql);
            } catch (e) {
                // Column might already exist, that's ok
                console.log('ALTER skip:', e.message.substring(0, 80));
            }
        }
        console.log('Columns added');

        // 3. INDEXES
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_salaries_member ON salaries(member_id);
            CREATE INDEX IF NOT EXISTS idx_salaries_month ON salaries(month);
            CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
            CREATE INDEX IF NOT EXISTS idx_assignments_member ON project_assignments(member_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
        `);
        console.log('Indexes created');

        // 4. DEFAULT ADMIN
        await pool.query(`
            INSERT INTO users (username, password, role)
            VALUES ('adminMTA', 'admin00000', 'admin')
            ON CONFLICT (username) DO NOTHING
        `);
        console.log('Admin user ready');

        console.log('Database fully initialized');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await initDB();
    console.log(`Multitrade server running on port ${PORT}`);
});

