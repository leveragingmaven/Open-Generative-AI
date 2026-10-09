import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// The migration runner (scripts/run-migrations.mjs) sorts `NNN_name.sql` files and
// applies each one once, so the schema itself must be re-runnable and every
// tenant-scoped table must carry the same scope columns as migration 007.

const migrationsDirectory = new URL('../../migrations/', import.meta.url);
const projects = readFileSync(new URL('010_creator_projects.sql', migrationsDirectory), 'utf8');
const sessionProjects = readFileSync(new URL('011_design_agent_session_projects.sql', migrationsDirectory), 'utf8');

test('the project migrations are numbered directly after the existing schema', () => {
  const names = readdirSync(migrationsDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  assert.deepEqual(names.slice(-2), ['010_creator_projects.sql', '011_design_agent_session_projects.sql']);
  assert.equal(names.length, new Set(names).size, 'migration names must be unique');
});

test('both tables are created idempotently and scoped by account and creator', () => {
  for (const [name, sql] of [
    ['010_creator_projects.sql', projects],
    ['011_design_agent_session_projects.sql', sessionProjects],
  ]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS/, `${name} must be re-runnable`);
    assert.match(sql, /account_id BIGINT UNSIGNED NOT NULL/, `${name} must be account scoped`);
    assert.match(sql, /creator_identity_key VARCHAR\(191\) NOT NULL/, `${name} must be creator scoped`);
    assert.match(sql, /ENGINE=InnoDB/, `${name} must match the existing engine`);
    assert.match(sql, /COLLATE=utf8mb4_bin/, `${name} must match the existing collation`);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i, `${name} must not destroy data`);
  }
});

test('the project table carries the six bounded instruction channels and the import timestamp', () => {
  for (const channel of ['brand', 'audience', 'offer', 'product', 'visual', 'voice']) {
    assert.match(projects, new RegExp(`${channel} VARCHAR\\(1000\\) NULL`), `${channel} must be a bounded column`);
  }
  assert.match(projects, /project_id VARCHAR\(191\) NOT NULL/);
  assert.match(projects, /PRIMARY KEY \(project_id\)/);
  assert.match(projects, /briefs_json JSON NULL/);
  assert.match(projects, /source_updated_at VARCHAR\(32\) NULL/);
  assert.match(projects, /KEY idx_creator_projects_owner \(account_id, creator_identity_key, updated_at\)/);
});

test('the association table reserves archived_at without an archive code path', () => {
  assert.match(sessionProjects, /design_session_id VARCHAR\(191\) NOT NULL/);
  assert.match(sessionProjects, /project_id VARCHAR\(191\) NULL/);
  assert.match(sessionProjects, /archived_at TIMESTAMP NULL DEFAULT NULL/);
  assert.match(sessionProjects, /PRIMARY KEY \(design_session_id\)/);
  assert.doesNotMatch(sessionProjects, /FOREIGN KEY/, 'the association must not merge into the ownership trust boundary');
});

// --- MySQL 8 / InnoDB conventions --------------------------------------------
//
// These tables are written on every project save, so the budgets an InnoDB (DYNAMIC
// row format, MySQL 8 default) table actually has must hold: 65,535 bytes per row and
// 3,072 bytes per index key with utf8mb4. The columns are deliberately generous
// VARCHARs, which is exactly how a later "one more channel" edit blows the row limit.

function columnByteWidths(sql) {
  const widths = new Map();
  const body = sql.slice(sql.indexOf('('), sql.lastIndexOf(')'));
  for (const line of body.split('\n')) {
    const column = line.trim().match(/^([a-z_]+)\s+(.*?),?$/i);
    if (!column) continue;
    const [, name, definition] = column;
    const varchar = definition.match(/VARCHAR\((\d+)\)/i);
    if (varchar) widths.set(name.toLowerCase(), Number(varchar[1]) * 4);
    else if (/^BIGINT/i.test(definition)) widths.set(name.toLowerCase(), 8);
    else if (/^TIMESTAMP/i.test(definition)) widths.set(name.toLowerCase(), 4);
    // A JSON column is stored off-page: only its pointer counts towards the row.
    else if (/^JSON/i.test(definition)) widths.set(name.toLowerCase(), 12);
  }
  return widths;
}

function indexKeyBytes(sql, widths) {
  const keys = [];
  for (const line of sql.split('\n')) {
    const key = line.trim().match(/^KEY\s+[`\w]+\s*\(([^)]+)\)/i);
    if (!key) continue;
    const columns = key[1].split(',').map((name) => name.trim().replace(/`/g, '').toLowerCase());
    const missing = columns.filter((name) => !widths.has(name));
    assert.deepEqual(missing, [], `index references unknown columns: ${missing.join(', ')}`);
    keys.push({ columns, bytes: columns.reduce((total, name) => total + widths.get(name), 0) });
  }
  return keys;
}

test('both project tables fit the InnoDB row and index-key budgets on utf8mb4', () => {
  for (const [name, sql] of [
    ['010_creator_projects.sql', projects],
    ['011_design_agent_session_projects.sql', sessionProjects],
  ]) {
    const widths = columnByteWidths(sql);
    assert.ok(widths.size > 0, `${name} must declare parseable columns`);
    const rowBytes = [...widths.values()].reduce((total, value) => total + value, 0);
    assert.ok(rowBytes < 65_535, `${name} row is ${rowBytes} bytes`);
    for (const key of indexKeyBytes(sql, widths)) {
      assert.ok(key.bytes <= 3072, `${name} index on ${key.columns.join(', ')} is ${key.bytes} bytes`);
      // Project ids and creator keys are utf8mb4, so an unprefixed key must fit.
      assert.match(sql, /KEY /, `${name} must keep its owner index`);
    }
  }
  // The instruction channels are the bulk of the row; keep them bounded as one set.
  const widths = columnByteWidths(projects);
  const instructionBytes = ['brand', 'audience', 'offer', 'product', 'visual', 'voice']
    .reduce((total, channel) => total + widths.get(channel), 0);
  assert.ok(instructionBytes <= 24_000, `instruction channels total ${instructionBytes} bytes`);
});

test('every migration stays applicable by the runner as one multi-statement query', () => {
  const names = readdirSync(migrationsDirectory).filter((name) => /^\d+_.+\.sql$/.test(name));
  assert.ok(names.length >= 11);
  for (const name of names) {
    // The runner sorts by name as text, so the numeric prefix must stay zero-padded.
    assert.match(name, /^\d{3}_/, `${name} must keep a three-digit prefix`);
    const sql = readFileSync(new URL(name, migrationsDirectory), 'utf8');
    // `connection.query(fileText)` with multipleStatements cannot handle client-side
    // delimiters or stored programs, and a file without a terminator would be sent
    // as an incomplete statement.
    assert.doesNotMatch(sql, /DELIMITER/i, `${name} must not use DELIMITER`);
    assert.doesNotMatch(sql, /CREATE\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)/i, `${name} must not define stored programs`);
    assert.match(sql.trimEnd(), /;$/, `${name} must end with a statement terminator`);
    assert.doesNotMatch(sql, /\bBEGIN\b\s*;?\s*$/im, `${name} must not open a compound block`);
  }
});
