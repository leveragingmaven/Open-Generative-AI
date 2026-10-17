import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// `middleware.js` imports `next/server`, which this repository's Node ESM loader
// cannot resolve (the same pre-existing condition documented in the existing
// route tests). Following the repository's dependency-injection seam, we extract
// the real function sources and evaluate them with an injected `NextResponse` and
// `isAgencyModeEnabled`, so the assertions still exercise the shipped logic.

const middlewareUrl = new URL('./middleware.js', import.meta.url);
const middlewareSource = readFileSync(middlewareUrl, 'utf8');

function extractFunctionSource(name) {
  const match = new RegExp(`function ${name}\\s*\\(`).exec(middlewareSource);
  assert.notEqual(match, null, `expected ${name} to be defined in middleware.js`);
  const start = match.index;
  const parenStart = middlewareSource.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let index = parenStart; index < middlewareSource.length; index += 1) {
    if (middlewareSource[index] === '(') parenDepth += 1;
    else if (middlewareSource[index] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = index; break; }
    }
  }
  const bodyStart = middlewareSource.indexOf('{', parenEnd);
  let depth = 0;
  for (let index = bodyStart; index < middlewareSource.length; index += 1) {
    const character = middlewareSource[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return middlewareSource.slice(start, index + 1).replace('export ', '');
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}`);
}

const constantSource = /const SAME_ORIGIN_FRAMING_PATH = '[^']*';/.exec(middlewareSource);
assert.notEqual(constantSource, null, 'expected SAME_ORIGIN_FRAMING_PATH to be defined');

const buildMiddleware = new Function(
  'NextResponse',
  'isAgencyModeEnabled',
  `${constantSource[0]}
${extractFunctionSource('allowsSameOriginFraming')}
${extractFunctionSource('addSecurityHeaders')}
${extractFunctionSource('middleware')}
return { middleware, addSecurityHeaders, allowsSameOriginFraming };`,
);

function createMiddleware({ agencyMode = false } = {}) {
  const makeResponse = () => ({ headers: new Headers() });
  const NextResponse = {
    next: () => makeResponse(),
    rewrite: () => makeResponse(),
  };
  return buildMiddleware(NextResponse, () => agencyMode);
}

function headersFor(pathname, options) {
  const { middleware } = createMiddleware(options);
  const response = middleware({ nextUrl: new URL(`https://studio.example.com${pathname}`) });
  return response.headers;
}

test('the Prompt Library path may be framed by the same origin', () => {
  const headers = headersFor('/motion-prompt-library/index.html');
  assert.equal(headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'self';/);
});

test('the Prompt Library root path is treated the same as its assets', () => {
  assert.equal(headersFor('/motion-prompt-library').get('X-Frame-Options'), 'SAMEORIGIN');
});

test('cross-origin framing remains blocked on ordinary routes', () => {
  const headers = headersFor('/studio');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none';/);
});

test('cross-origin framing remains blocked on API routes', () => {
  const headers = headersFor('/api/motion-carousel');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none';/);
});

test('a look-alike path is not granted same-origin framing', () => {
  for (const pathname of ['/motion-prompt-library-evil', '/motion-prompt-library.evil/index.html', '/studio/motion-prompt-library/index.html']) {
    assert.equal(headersFor(pathname).get('X-Frame-Options'), 'DENY', `expected DENY for ${pathname}`);
  }
});

test('the Prompt Library CSP never widens framing to another origin', () => {
  const policy = headersFor('/motion-prompt-library/index.html').get('Content-Security-Policy');
  assert.doesNotMatch(policy, /frame-ancestors (\*|https?:)/);
});
