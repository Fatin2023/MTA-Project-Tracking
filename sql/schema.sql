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
    id          SERIAL PRIMARY KEY,
    member_id   INT REFERENCES members(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    clock_in    TIMESTAMP,
    clock_out   TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

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
