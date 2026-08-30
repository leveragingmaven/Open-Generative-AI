import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const excluded = new Set(['.git', '.next', 'build', 'coverage', 'dist', 'node_modules', 'release']);
const tests = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (entry.isFile() && entry.name.endsWith('.test.js')) tests.push(relative(process.cwd(), absolute));
  }
}

collect(process.cwd());
tests.sort((left, right) => left.localeCompare(right));

if (!tests.length) {
  console.error('No source test files found.');
  process.exit(1);
}

console.log(`Running ${tests.length} source test files (generated outputs excluded).`);
const result = spawnSync(process.execPath, [
  '--test',
  '--test-concurrency=1',
  ...tests,
], { stdio: 'inherit', env: process.env });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
