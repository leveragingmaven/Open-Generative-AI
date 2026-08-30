import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const mode = process.argv[2] || 'apply';
if (!['apply', 'baseline'].includes(mode)) {
  console.error('Usage: node scripts/run-migrations.mjs <apply|baseline>');
  process.exit(2);
}

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const name of required) {
  if (!String(process.env[name] || '').trim()) throw new Error(`${name} is required`);
}

const migrationDirectory = path.join(process.cwd(), 'migrations');
const names = (await fs.readdir(migrationDirectory))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right));

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME,
  multipleStatements: true,
});

let locked = false;
try {
  const [lockRows] = await connection.query("SELECT GET_LOCK('mavensync_creator_os_migrations', 30) AS acquired");
  if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Could not acquire Creator OS migration lock');
  locked = true;

  await connection.query(`CREATE TABLE IF NOT EXISTS creator_schema_migrations (
    migration_name VARCHAR(191) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);

  const [appliedRows] = await connection.query('SELECT migration_name, checksum FROM creator_schema_migrations');
  const applied = new Map(appliedRows.map((row) => [row.migration_name, row.checksum]));

  for (const name of names) {
    const sql = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    if (applied.has(name)) {
      if (applied.get(name) !== checksum) throw new Error(`Applied migration checksum changed: ${name}`);
      console.log(`verified ${name}`);
      continue;
    }
    if (mode === 'apply') await connection.query(sql);
    await connection.query(
      'INSERT INTO creator_schema_migrations (migration_name, checksum) VALUES (?, ?)',
      [name, checksum],
    );
    console.log(`${mode === 'apply' ? 'applied' : 'baselined'} ${name}`);
  }
} finally {
  if (locked) await connection.query("SELECT RELEASE_LOCK('mavensync_creator_os_migrations')");
  await connection.end();
}
