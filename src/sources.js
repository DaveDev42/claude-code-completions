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
// Value = UUID (filename stem). Description = first `summary` entry, or first
// user message content, truncated. Sort by mtime descending so most recent
// sessions appear first in the picker.
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
  return files.map(({ uuid, path }) => `${uuid}\t${sanitize(extractSummary(path))}`);
}

// Read up to ~64KB of the jsonl, scan for the first useful description.
// Priority: a {"type":"summary","summary":"..."} entry, else the first
// user message text content.
function extractSummary(path) {
  let text;
  try {
    const buf = readFileSync(path, { encoding: 'utf8' });
    text = buf.length > 65536 ? buf.slice(0, 65536) : buf;
  } catch { return ''; }
  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type === 'summary' && typeof obj.summary === 'string') return obj.summary;
  }
  for (const line of text.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type === 'user' && obj.message && obj.message.role === 'user') {
      const c = obj.message.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        const first = c.find(p => p && p.type === 'text' && typeof p.text === 'string');
        if (first) return first.text;
      }
    }
  }
  return '';
}
