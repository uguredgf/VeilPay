/**
 * VeilPay - SQLite database initialisation.
 *
 * Creates all tables on first run and exposes the singleton `db` instance
 * that every other module imports. Uses `better-sqlite3` for synchronous,
 * zero-dependency, in-process SQLite access.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH ?? './data/veilpay.db';

function ensureDirExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirExists(DB_PATH);

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS employees (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    wallet_address TEXT NOT NULL UNIQUE,
    department     TEXT,
    status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive','suspended')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employees_wallet ON employees(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

  CREATE TABLE IF NOT EXISTS payroll_batches (
    id              TEXT PRIMARY KEY,
    employer_id     TEXT NOT NULL,
    total_amount    REAL NOT NULL DEFAULT 0,
    employee_count  INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','failed')),
    tx_hash         TEXT,
    commitment_root TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_batches_employer ON payroll_batches(employer_id);
  CREATE INDEX IF NOT EXISTS idx_batches_status ON payroll_batches(status);

  CREATE TABLE IF NOT EXISTS payroll_items (
    id                 TEXT PRIMARY KEY,
    batch_id           TEXT NOT NULL REFERENCES payroll_batches(id) ON DELETE CASCADE,
    employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount             REAL NOT NULL,
    commitment         TEXT,
    nullifier          TEXT,
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','claimed','expired')),
    claim_key_hash     TEXT,
    claimed_at         TEXT,
    withdraw_tx_hash   TEXT,
    withdrawal_address TEXT,
    encrypted_data     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_items_batch ON payroll_items(batch_id);
  CREATE INDEX IF NOT EXISTS idx_items_employee ON payroll_items(employee_id);
  CREATE INDEX IF NOT EXISTS idx_items_claim_key_hash ON payroll_items(claim_key_hash);

  CREATE TABLE IF NOT EXISTS withdrawal_locks (
    item_id   TEXT PRIMARY KEY REFERENCES payroll_items(id) ON DELETE CASCADE,
    locked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compliance_records (
    id                TEXT PRIMARY KEY,
    batch_id          TEXT NOT NULL REFERENCES payroll_batches(id) ON DELETE CASCADE,
    proof_hash        TEXT,
    compliance_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (compliance_status IN ('pending','passed','failed','review_required')),
    checked_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_compliance_batch ON compliance_records(batch_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id        TEXT PRIMARY KEY,
    action    TEXT NOT NULL,
    actor     TEXT NOT NULL,
    details   TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor);
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);

  CREATE TABLE IF NOT EXISTS allowlist (
    id       TEXT PRIMARY KEY,
    address  TEXT NOT NULL UNIQUE,
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_allow_address ON allowlist(address);

  CREATE TABLE IF NOT EXISTS blocklist (
    id       TEXT PRIMARY KEY,
    address  TEXT NOT NULL UNIQUE,
    reason   TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_block_address ON blocklist(address);

  CREATE TABLE IF NOT EXISTS workspace_allowlist (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    address      TEXT NOT NULL,
    added_by     TEXT NOT NULL,
    added_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (workspace_id, address)
  );

  CREATE INDEX IF NOT EXISTS idx_workspace_allow_address
    ON workspace_allowlist(workspace_id, address);

  CREATE TABLE IF NOT EXISTS workspace_blocklist (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    address      TEXT NOT NULL,
    reason       TEXT NOT NULL,
    added_by     TEXT NOT NULL,
    added_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (workspace_id, address)
  );

  CREATE INDEX IF NOT EXISTS idx_workspace_block_address
    ON workspace_blocklist(workspace_id, address);
`;

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function runMigrations(): void {
  ensureColumn('payroll_items', 'claim_key_hash', 'TEXT');
  ensureColumn('payroll_items', 'claimed_at', 'TEXT');
  ensureColumn('payroll_items', 'withdraw_tx_hash', 'TEXT');
  ensureColumn('payroll_items', 'withdrawal_address', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_claim_key_hash ON payroll_items(claim_key_hash)');
  db.prepare(`
    UPDATE employees
    SET name = 'Encrypted employee',
        wallet_address = 'private:' || id,
        department = NULL
    WHERE wallet_address NOT LIKE 'private:%'
  `).run();
}

export function initDatabase(): void {
  db.exec(SCHEMA);
  runMigrations();
  console.log('[DB] Database initialised at', DB_PATH);
}

export function logAudit(id: string, action: string, actor: string, details?: string): void {
  const stmt = db.prepare(
    'INSERT INTO audit_logs (id, action, actor, details) VALUES (?, ?, ?, ?)',
  );
  stmt.run(id, action, actor, details ?? null);
}

export default db;
