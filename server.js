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

app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY id');
        res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO projects (name) VALUES ($1) RETURNING *', [name]
        );
        res.json({ id: result.rows[0].id, name: result.rows[0].name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('UPDATE projects SET name = $1 WHERE id = $2', [name, req.params.id]);
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
            clockOut: r.clock_out ? toLocalISO(new Date(r.clock_out)) : null
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance', async (req, res) => {
    const { memberId, date, clockIn, clockOut } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO attendance (member_id, date, clock_in, clock_out) VALUES ($1, $2, $3, $4) RETURNING id',
            [memberId, date, clockIn, clockOut]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/attendance/:id', async (req, res) => {
    const { date, clockIn, clockOut } = req.body;
    try {
        await pool.query(
            'UPDATE attendance SET date = $1, clock_in = $2, clock_out = $3 WHERE id = $4',
            [date, clockIn, clockOut, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
// START SERVER
// ========================================
// Catch-all — serve index.html for any route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Auto-create tables + start server
async function initDB() {
    try {
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
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY, member_id INT REFERENCES members(id) ON DELETE CASCADE,
                date DATE NOT NULL, clock_in TIMESTAMP, clock_out TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
            INSERT INTO users (username, password, role)
            VALUES ('admin', 'admin123', 'admin')
            ON CONFLICT (username) DO NOTHING;
        `);
        console.log('Database tables ready');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await initDB();
    console.log(`Multitrade server running on port ${PORT}`);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Multitrade server running at http://localhost:${PORT}`);
});
