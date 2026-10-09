// Runs every source `*.test.js` file in the repository with `node --test`.
//
// Two silent-omission failure modes are guarded explicitly:
//   1. Discovery: a positional argument that does not resolve to exactly one
//      file (e.g. an unescaped Next.js `[[...path]]` catch-all segment) would
//      make `node --test` exit 0 having run nothing.
//   2. Coverage: a file that is collected but never reported by the runner.
//
// Both guards fail the process rather than trusting a green exit code.

import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  discoverTestFiles,
  findOmittedFiles,
  findUnaddressableFiles,
  toTestArgument,
} from './lib/sourceTestDiscovery.mjs';

// `new URL('..', ...)` keeps a trailing separator; drop it so path prefix
// comparisons stay unambiguous.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');

// A tiny reporter that emits one machine-readable line so we can prove every
// discovered file was collected. Kept inline so the runner stays portable
// regardless of the current working directory.
const COVERAGE_MARKER = '#coverage:';
const COVERAGE_REPORTER_SOURCE = `
import { writeFileSync } from 'node:fs';
export default async function* reporter(source) {
  const perFile = [];
  let aggregate = null;
  for await (const event of source) {
    if (event && event.type === 'test:summary' && event.data) {
      if (typeof event.data.file === 'string') perFile.push(event.data.file);
      else aggregate = event.data.counts;
    }
  }
  const line = ${JSON.stringify(COVERAGE_MARKER)} + JSON.stringify({ perFile, aggregate });
  if (process.env.COVERAGE_SINK) writeFileSync(process.env.COVERAGE_SINK, line);
  else process.stdout.write(line + '\\n');
}
`;

function exitWithDiscoveryFailures(failures) {
  console.error(`Refusing to run: ${failures.length} discovered test file(s) cannot be addressed by the test runner.`);
  for (const failure of failures) {
    console.error(`  - ${failure.file}`);
    console.error(`      argument: ${failure.pattern}`);
    console.error(`      reason:   ${failure.reason}`);
  }
  console.error('These files would be silently omitted and reported as a pass.');
  process.exit(1);
}

const discovered = discoverTestFiles(REPO_ROOT);

if (!discovered.length) {
  console.error('No source test files were discovered.');
  process.exit(1);
}

if (typeof globSync === 'function') {
  // Resolve against REPO_ROOT so the guard does not depend on the caller's cwd.
  const failures = findUnaddressableFiles(discovered, (pattern) => globSync(pattern, { cwd: REPO_ROOT }));
  if (failures.length) exitWithDiscoveryFailures(failures);
}

const coverageReporter = `data:text/javascript,${encodeURIComponent(COVERAGE_REPORTER_SOURCE)}`;
const result = spawnSync(
  process.execPath,
  [
    '--test',
    // Preserve the historical serial scheduling; escaping the paths must not
    // also change how the suite is executed.
    '--test-concurrency=1',
    `--test-reporter=${coverageReporter}`,
    '--test-reporter-destination=stdout',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    ...discovered.map(toTestArgument),
  ],
  { cwd: REPO_ROOT, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);

if (result.error) throw result.error;

const stdout = result.stdout ?? '';
const coverageLine = stdout.split(/\r?\n/).find((line) => line.startsWith(COVERAGE_MARKER));
const humanOutput = stdout
  .split(/\r?\n/)
  .filter((line) => !line.startsWith(COVERAGE_MARKER))
  .join('\n');
if (humanOutput.trim()) process.stdout.write(`${humanOutput.replace(/\n+$/, '')}\n`);

let coverage = null;
if (coverageLine) {
  try {
    coverage = JSON.parse(coverageLine.slice(COVERAGE_MARKER.length));
  } catch {
    coverage = null;
  }
}

if (!coverage) {
  console.error('Refusing to trust the exit code: the test runner produced no coverage summary.');
  process.exit(1);
}

const omitted = findOmittedFiles(discovered, coverage.perFile, REPO_ROOT);
if (omitted.length) {
  console.error(`Refusing to trust the exit code: ${omitted.length} of ${discovered.length} discovered test files never reached the test runner.`);
  for (const file of omitted.slice(0, 40)) console.error(`  - ${file}`);
  if (omitted.length > 40) console.error(`  ... and ${omitted.length - 40} more`);
  console.error('This is a discovery/escaping regression, not a pass.');
  process.exit(1);
}

if (coverage.aggregate) {
  const { tests, passed, failed } = coverage.aggregate;
  console.log(`Coverage guard: ${discovered.length}/${discovered.length} discovered test files executed (${tests} tests, ${passed} passed, ${failed} failed).`);
}

process.exit(result.status ?? 1);
