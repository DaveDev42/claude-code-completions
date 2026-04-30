// Runtime data sources for dynamic completions (--agent, --resume, --session-id).
// Called from the `list-agents` / `list-sessions` CLI subcommands which the
// generated completion scripts shell out to. Output is one entry per line:
//   "<value>\t<description>"
// Description may be empty. Generators that don't surface descriptions (bash)
// just take the first column.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const sanitize = (s) =>
  String(s || '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

// Agents: ~/.claude/agents/*.md and $CWD/.claude/agents/*.md
// Description = the basename (no .md). We could parse YAML frontmatter for a
// `description:` field, but agents are usually well-named; basename is enough.
export function listAgents(cwd = process.cwd()) {
  const dirs = [
    join(homedir(), '.claude', 'agents'),
    join(cwd, '.claude', 'agents'),
  ];
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const stem = name.slice(0, -3);
      if (seen.has(stem)) continue;
      seen.add(stem);
      out.push(`${stem}\t`);
    }
  }
  return out;
}

// cwd → ~/.claude/projects/<slug>/. claude has used two slug schemes over
// time: (a) replace only `/` with `-` (newer), (b) replace any non-alnum with
// `-` (older — `.` becomes `-` too). Try both so older sessions remain
// completable. Return all candidate dirs that exist.
function projectDirs(cwd) {
  const base = join(homedir(), '.claude', 'projects');
  const slugs = new Set([
    cwd.replace(/\//g, '-'),
    cwd.replace(/[^A-Za-z0-9]/g, '-'),
  ]);
  return [...slugs].map(s => join(base, s));
}

// Sessions: ~/.claude/projects/<cwd-slug>/*.jsonl
// claude --resume accepts session ID, the auto-generated slug ("crispy-moseying-kay"),
// or a user-set name (claude --name foo). Pick the friendliest that exists:
// user name > slug > UUID. Description = first `summary` entry or first user
// message text. Sort by mtime descending so recent sessions appear first.
//
// To keep cold-path latency low (the helper spawns per Tab), only the top
// SUMMARY_LIMIT sessions get their jsonl scanned; the rest emit value-only.
const SUMMARY_LIMIT = 50;
const SCAN_BYTES = 32768;

export function listSessions(cwd = process.cwd()) {
  const files = [];
  const seen = new Set();
  for (const dir of projectDirs(cwd)) {
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const uuid = name.slice(0, -6);
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      const path = join(dir, name);
      let mtime;
      try { mtime = statSync(path).mtimeMs; } catch { continue; }
      files.push({ uuid, path, mtime });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);

  // Restrict live-name lookup to sessions that actually have a jsonl in this
  // cwd, so a stale pid.json from a crashed session in some other project
  // can't surface a name here.
  const known = new Set(files.map(f => f.uuid));
  const liveNames = liveSessionNames(known);
  return files.map(({ uuid, path }, i) => {
    const scan = i < SUMMARY_LIMIT ? scanJsonl(path) : { summary: '', slug: '' };
    // sanitize value too: a `--name "foo\tbar"` or a corrupted slug would
    // otherwise inject a tab and break the `<value>\t<description>` format.
    const value = sanitize(liveNames.get(uuid) || scan.slug) || uuid;
    return `${value}\t${sanitize(scan.summary)}`;
  });
}

// Active sessions write {pid}.json with {sessionId, name?} while running.
// `name` is the user-set --name (or rename via /name). The file is normally
// removed at exit, but a crashed claude can leave one behind — we filter
// those out by checking the pid is still alive (kill 0) and by intersecting
// with the caller's known sessionIds.
function liveSessionNames(known) {
  const out = new Map();
  const dir = join(homedir(), '.claude', 'sessions');
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    let obj;
    try { obj = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { continue; }
    if (!obj || typeof obj.sessionId !== 'string' || typeof obj.name !== 'string' || !obj.name) continue;
    if (!known.has(obj.sessionId)) continue;
    if (typeof obj.pid === 'number' && !pidAlive(obj.pid)) continue;
    out.set(obj.sessionId, obj.name);
  }
  return out;
}

// kill(pid, 0): no signal, just permission/existence check. Returns true if
// the process is alive (or alive-but-not-ours, which still proves existence).
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

// Single pass over the first SCAN_BYTES of the jsonl. Picks up:
//  - summary: an explicit {"type":"summary","summary":"..."} entry, else the
//    first user message text.
//  - slug: the auto-generated session name. Only read from envelope lines
//    (those carrying `sessionId`) so unrelated nested `slug` fields — e.g.
//    a tool input that happens to use that key — can't poison the value.
// Stops as soon as a description (summary or user fallback) and slug are both
// in hand.
function scanJsonl(path) {
  let text;
  try {
    const buf = readFileSync(path, { encoding: 'utf8' });
    text = buf.length > SCAN_BYTES ? buf.slice(0, SCAN_BYTES) : buf;
  } catch { return { summary: '', slug: '' }; }

  let summary = '';
  let slug = '';
  let userFallback = '';
  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (!summary && obj.type === 'summary' && typeof obj.summary === 'string') {
      summary = obj.summary;
    }
    if (!slug && typeof obj.slug === 'string' && obj.slug && typeof obj.sessionId === 'string') {
      slug = obj.slug;
    }
    if (!userFallback && obj.type === 'user' && obj.message && obj.message.role === 'user') {
      const c = obj.message.content;
      if (typeof c === 'string') userFallback = c;
      else if (Array.isArray(c)) {
        const first = c.find(p => p && p.type === 'text' && typeof p.text === 'string');
        if (first) userFallback = first.text;
      }
    }
    if ((summary || userFallback) && slug) break;
  }
  return { summary: summary || userFallback, slug };
}
