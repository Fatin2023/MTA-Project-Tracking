-- Run this in pgAdmin: right-click ProjectManagement -> Query Tool

-- ========================================
-- TABLES
-- ========================================

CREATE TABLE IF NOT EXISTS positions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(300) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    position_id     INT REFERENCES positions(id) ON DELETE SET NULL,
    department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(100) UNIQUE NOT NULL,
    password    VARCHAR(200) NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'employee',
    member_id   INT REFERENCES members(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salaries (
    id          SERIAL PRIMARY KEY,
    member_id   INT REFERENCES members(id) ON DELETE CASCADE,
    month       VARCHAR(7) NOT NULL,
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE(member_id, month)
);

CREATE TABLE IF NOT EXISTS project_assignments (
    id          SERIAL PRIMARY KEY,
    project_id  INT REFERENCES projects(id) ON DELETE CASCADE,
    member_id   INT REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(project_id, member_id)
);


CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIMESTAMP,
    clock_out TIMESTAMP,
    project_id INT,
    scope_id INT,
    sub_scope_id INT,
    detail_id INT,
    description TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

-- New tables
CREATE TABLE IF NOT EXISTS sub_scopes (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS details (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- 建 scopes 表
CREATE TABLE IF NOT EXISTS scopes (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS web_access (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    flag        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE worklist (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS scope_pics (
    id SERIAL PRIMARY KEY,
    scope_id INT REFERENCES scopes(id) ON DELETE CASCADE,
    member_id INT REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(scope_id, member_id)
);

CREATE TABLE IF NOT EXISTS scope_departments (
    id SERIAL PRIMARY KEY,
    scope_id INT REFERENCES scopes(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE(scope_id, department_id)
);

ALTER TABLE attendance ADD COLUMN work_plan_id INTEGER REFERENCES worklist(id) ON DELETE SET NULL;
ALTER TABLE attendance ADD COLUMN work_done_id INTEGER REFERENCES worklist(id) ON DELETE SET NULL;


-- Add columns to attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS sub_scope_id INT REFERENCES sub_scopes(id) ON DELETE SET NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS detail_id INT REFERENCES details(id) ON DELETE SET NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS scope_id INT REFERENCES scopes(id) ON DELETE SET NULL;
-- Add columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category_id INT REFERENCES scopes(id) ON DELETE SET NULL;

ALTER TABLE subscopes ADD COLUMN scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL;
ALTER TABLE worklist ADD COLUMN scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL;




-- ========================================
-- DEFAULT ADMIN USER
-- ========================================

INSERT INTO users (username, password, role)
VALUES ('admin', 'admin123', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ========================================
-- INDEXES for performance
-- ========================================

CREATE INDEX IF NOT EXISTS idx_salaries_member ON salaries(member_id);
CREATE INDEX IF NOT EXISTS idx_salaries_month ON salaries(month);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_member ON project_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_sub_scope ON attendance(sub_scope_id);
CREATE INDEX IF NOT EXISTS idx_attendance_detail ON attendance(detail_id);
CREATE INDEX IF NOT EXISTS idx_attendance_scope ON attendance(scope_id);
