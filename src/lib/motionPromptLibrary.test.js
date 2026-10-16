import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// The library is a static page. Its behavior lives in one inline script, so these tests
// execute that script against a minimal DOM and an in-memory localStorage.
const HTML_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/motion-prompt-library/index.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + '<script>'.length, HTML.lastIndexOf('</script>'));
const SCOPE_A = 'profile-abc123';
const SCOPE_B = 'profile-def456';
const TITLE = 'Anime trailer about a Claude and ChatGPT battle';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this.className = '';
    this.value = '';
    this.placeholder = '';
    this.readOnly = false;
    this.rows = 0;
    this.title = '';
    this.onclick = null;
    this.oninput = null;
    this.onchange = null;
  }
  get textContent() { return this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  append(...nodes) { for (const n of nodes) if (n && typeof n === 'object') this.children.push(n); }
  setAttribute(k, v) { this[k] = v; }
  focus() {}
  select() { this.selected = true; }
  get classList() {
    const node = this;
    return {
      toggle(name, force) {
        const set = new Set(node.className.split(' ').filter(Boolean));
        const on = force ?? !set.has(name);
        if (on) set.add(name); else set.delete(name);
        node.className = [...set].join(' ');
      },
    };
  }
}

function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function makeClipboard({ allow = true } = {}) {
  const written = [];
  return {
    written,
    writeText: async (text) => {
      if (!allow) throw new Error('Clipboard write denied');
      written.push(text);
    },
  };
}

function openPage({ search = '', storage, clipboard = makeClipboard() }) {
  const byId = new Map();
  const $ = (id) => {
    if (!byId.has(id)) byId.set(id, new FakeNode(id));
    return byId.get(id);
  };
  const sandbox = {
    document: { getElementById: $, createElement: (t) => new FakeNode(t) },
    localStorage: storage,
    location: { search },
    URLSearchParams,
    URL,
    Blob,
    navigator: { clipboard },
    confirm: () => true,
    alert: () => {},
    setTimeout: () => 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  return { $, clipboard };
}

function walk(node, pred, out = []) {
  if (pred(node)) out.push(node);
  for (const child of node.children) walk(child, pred, out);
  return out;
}

function cards(page) {
  return page.$('grid').children;
}

function cardFor(page, title) {
  const card = cards(page).find((c) => walk(c, (n) => n.tagName === 'h3' && n._text === title).length > 0);
  assert.ok(card, `card for "${title}" should be rendered`);
  return card;
}

function button(root, label) {
  const found = walk(root, (n) => n.tagName === 'button' && n._text === label);
  assert.ok(found.length > 0, `button "${label}" should exist`);
  return found[0];
}

function countText(page) {
  return page.$('count').textContent;
}

function savedCount(page) {
  return Number(/· (\d+) saved$/.exec(countText(page))[1]);
}

function starFor(page, title) {
  return walk(cardFor(page, title), (n) => n.className.split(' ').includes('star'))[0];
}

function noteFor(page, title) {
  return walk(cardFor(page, title), (n) => n.tagName === 'textarea' && n.placeholder.startsWith('Notes'))[0];
}

function promptBoxFor(page, title) {
  return walk(cardFor(page, title), (n) => n.tagName === 'textarea' && n.placeholder.startsWith('Paste the prompt'))[0];
}

function savedRecord(storage, scope) {
  const raw = storage.getItem(`pm-lib-v1:${scope}`);
  return raw ? JSON.parse(raw) : null;
}

test('scoped saves stay separate between creators sharing one browser', async () => {
  const storage = makeStorage();

  const a = openPage({ search: `?scope=${SCOPE_A}`, storage });
  await starFor(a, TITLE).onclick();
  noteFor(a, TITLE).value = 'Creator A tweak';
  noteFor(a, TITLE).oninput();
  a.$('mx').value = 'Creator A own prompt';
  a.$('mt').value = 'A title';
  await a.$('addMine').onclick();

  assert.equal(savedCount(a), 1);
  const recordA = savedRecord(storage, SCOPE_A);
  assert.ok(recordA, 'Creator A data is stored under A scope');
  assert.equal(Object.keys(recordA.saved).length, 1);
  assert.equal(recordA.notes[Object.keys(recordA.saved)[0]], 'Creator A tweak');
  assert.equal(recordA.mine[0].text, 'Creator A own prompt');
  assert.equal(savedRecord(storage, SCOPE_B), null, 'Creator B has no record yet');

  // Creator B opens the same browser and sees an empty library.
  const b = openPage({ search: `?scope=${SCOPE_B}`, storage });
  assert.equal(countText(b), '156 of 156 entries · 0 saved');
  assert.equal(starFor(b, TITLE).className.includes('on'), false);
  assert.equal(noteFor(b, TITLE).value, '');
  assert.equal(b.$('mine').children[0].textContent, 'No prompts of your own yet. Paste one above.');

  // Creator B saves a different entry, which must not appear for Creator A.
  const otherTitle = 'Animated pixel art wizard casting a spell';
  await starFor(b, otherTitle).onclick();
  assert.equal(savedCount(b), 1);

  const a2 = openPage({ search: `?scope=${SCOPE_A}`, storage });
  assert.equal(savedCount(a2), 1, 'Creator A still has only their own save');
  assert.equal(starFor(a2, TITLE).className.includes('on'), true);
  assert.equal(starFor(a2, otherTitle).className.includes('on'), false);
  assert.equal(noteFor(a2, TITLE).value, 'Creator A tweak');
  assert.equal(a2.$('mine').children.length, 1);
});

test('a missing or invalid scope never persists data', async () => {
  for (const search of ['', '?scope=', '?scope=profile-ABC', '?scope=profile-', '?scope=../../other', '?scope=abc123']) {
    const storage = makeStorage();
    const page = openPage({ search, storage });
    await starFor(page, TITLE).onclick();
    noteFor(page, TITLE).value = 'should not persist';
    noteFor(page, TITLE).oninput();
    page.$('mx').value = 'should not persist either';
    await page.$('addMine').onclick();

    assert.equal(storage.map.size, 0, `nothing stored for search "${search}"`);
    assert.equal(savedCount(page), 1, 'the page still works in memory during the session');

    const reopened = openPage({ search, storage });
    assert.equal(countText(reopened), '156 of 156 entries · 0 saved', `nothing restored for "${search}"`);
  }
});

test('entries, search, category filter and saved-only filter stay intact', async () => {
  const storage = makeStorage();
  const page = openPage({ search: `?scope=${SCOPE_A}`, storage });

  const match = /^(\d+) of (\d+) entries/.exec(countText(page));
  assert.equal(match[1], '156');
  assert.equal(match[2], '156');
  assert.equal(cards(page).length, 156);

  page.$('q').oninput({ target: { value: 'claude' } });
  const searched = Number(/^(\d+) of/.exec(countText(page))[1]);
  assert.ok(searched > 0 && searched < 156, 'search narrows the list');
  assert.equal(cards(page).length, searched);
  for (const card of cards(page)) {
    assert.ok(walk(card, (n) => n._text && /claude/i.test(n._text)).length > 0, 'every match mentions the query');
  }

  page.$('q').oninput({ target: { value: '' } });
  button(page.$('chips'), 'Skills').onclick();
  const skills = Number(/^(\d+) of/.exec(countText(page))[1]);
  assert.ok(skills > 0 && skills < 156, 'category filter narrows the list');
  for (const card of cards(page)) {
    assert.ok(walk(card, (n) => n._text === 'Skills').length > 0, 'every card is in the Skills category');
  }

  button(page.$('chips'), 'All').onclick();
  assert.equal(cards(page).length, 156);

  await starFor(page, TITLE).onclick();
  page.$('savedBtn').onclick({ target: page.$('savedBtn') });
  assert.equal(cards(page).length, 1);
  assert.equal(cardFor(page, TITLE).tagName, 'div');
  page.$('savedBtn').onclick({ target: page.$('savedBtn') });
  assert.equal(cards(page).length, 156);

  // A reload restores saves, notes, and the output format without changing the entry list.
  const reopened = openPage({ search: `?scope=${SCOPE_A}`, storage });
  assert.equal(countText(reopened), '156 of 156 entries · 1 saved');
  assert.equal(cards(reopened).length, 156);
});

test('Copy for Maven copies the instruction and shows a manual fallback when the clipboard is blocked', async () => {
  const storage = makeStorage();
  const denied = openPage({ search: `?scope=${SCOPE_A}`, storage, clipboard: makeClipboard({ allow: false }) });
  const card = cardFor(denied, TITLE);
  await button(card, 'Copy for Maven').onclick();

  assert.equal(button(card, 'Copy failed').tagName, 'button');
  const manual = walk(card, (n) => n.tagName === 'textarea' && n.readOnly === true);
  assert.equal(manual.length, 1, 'a read-only text box with the instruction is shown');
  assert.match(manual[0].value, /^Create a short video about Anime trailer/);
  assert.match(manual[0].value, /Reference\nTitle: Anime trailer/);
  assert.equal(manual[0].selected, true, 'the instruction is pre-selected for Ctrl+C');
  assert.ok(walk(card, (n) => n._text && /Your browser blocked automatic copying/.test(n._text)).length > 0);

  const allowed = openPage({ search: `?scope=${SCOPE_A}`, storage, clipboard: makeClipboard() });
  const okCard = cardFor(allowed, TITLE);
  await button(okCard, 'Copy for Maven').onclick();
  assert.equal(button(okCard, 'Copied ✓').tagName, 'button');
  assert.equal(walk(okCard, (n) => n.tagName === 'textarea' && n.readOnly === true).length, 0);
  assert.equal(allowed.clipboard.written[0], manual[0].value, 'successful copy writes the same instruction');
});

test('the user-prompt Copy button also falls back to a manual copy box', async () => {
  const storage = makeStorage();
  const seed = openPage({ search: `?scope=${SCOPE_A}`, storage });
  seed.$('mx').value = 'Prompt text to copy';
  await seed.$('addMine').onclick();

  const denied = openPage({ search: `?scope=${SCOPE_A}`, storage, clipboard: makeClipboard({ allow: false }) });
  const mineCard = denied.$('mine').children[0];
  await button(mineCard, 'Copy').onclick();
  assert.equal(button(mineCard, 'Copy failed').tagName, 'button');
  const manual = walk(mineCard, (n) => n.tagName === 'textarea' && n.readOnly === true);
  assert.equal(manual.length, 1);
  assert.equal(manual[0].value, 'Prompt text to copy');
});
