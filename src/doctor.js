// User-facing diagnostic for "tab completion isn't working" / "is this thing alive".
// Each check returns { name, status: 'ok'|'warn'|'fail', detail }.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function runChecks() {
  const out = [];
  const env = {};

  // claude binary
  let claudeOk = false;
  let claudeVersion = null;
  try {
    claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    claudeOk = true;
    out.push({ name: 'claude binary', status: 'ok', detail: claudeVersion });
  } catch {
    out.push({ name: 'claude binary', status: 'fail', detail: 'not found on PATH (loader will use static fallback)' });
  }
  env.claudeVersion = claudeVersion;

  // claude --help works
  if (claudeOk) {
    try {
      const help = execFileSync('claude', ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = help.split('\n').length;
      out.push({ name: 'claude --help', status: 'ok', detail: `${lines} lines` });
    } catch (e) {
      out.push({ name: 'claude --help', status: 'fail', detail: e.message });
    }
  }

  // cache directory
  const cacheDir = process.env.XDG_CACHE_HOME
    ? join(process.env.XDG_CACHE_HOME, 'claude-code-completions')
    : join(homedir(), '.cache', 'claude-code-completions');
  if (existsSync(cacheDir)) {
    const entries = readdirSync(cacheDir);
    const byShell = { zsh: [], bash: [], fish: [], other: [] };
    for (const e of entries) {
      if (e.startsWith('_claude-')) byShell.zsh.push(e);
      else if (e.startsWith('claude.bash-')) byShell.bash.push(e);
      else if (e.startsWith('claude.fish-')) byShell.fish.push(e);
      else byShell.other.push(e);
    }
    const summary = Object.entries(byShell)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}=${v.length}`)
      .join(' ') || 'empty';
    let status = 'ok';
    if ((byShell.zsh.length + byShell.bash.length + byShell.fish.length) > 6) status = 'warn';
    const detail = `${cacheDir} (${summary})`;
    out.push({ name: 'cache directory', status, detail: status === 'warn' ? `${detail} — many stale entries; run prefetch or open a new shell` : detail });
  } else {
    out.push({ name: 'cache directory', status: 'warn', detail: `${cacheDir} (does not exist; will be created on first tab)` });
  }

  // shell completion paths (best-effort)
  const brewPrefix = (() => {
    try { return execFileSync('brew', ['--prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  })();
  if (brewPrefix) {
    const checks = [
      { name: 'zsh loader', path: join(brewPrefix, 'share/zsh/site-functions/_claude') },
      { name: 'bash loader', path: join(brewPrefix, 'etc/bash_completion.d/claude.bash') },
      { name: 'fish loader', path: join(brewPrefix, 'share/fish/vendor_completions.d/claude.fish') },
    ];
    for (const c of checks) {
      if (existsSync(c.path)) out.push({ name: c.name, status: 'ok', detail: c.path });
      else out.push({ name: c.name, status: 'warn', detail: `not at ${c.path} (ok if you don't use this shell)` });
    }
  } else {
    out.push({ name: 'brew prefix', status: 'warn', detail: 'brew not found — manual install assumed; loader paths not checked' });
  }

  // generator self-test (parse, end to end)
  if (claudeOk) {
    try {
      const help = execFileSync('claude', ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const { parseHelp } = await import('./parse.js');
      const ir = parseHelp(help, claudeVersion);
      out.push({ name: 'parser', status: 'ok', detail: `${ir.options.length} options, ${ir.commands.length} commands parsed` });
    } catch (e) {
      out.push({ name: 'parser', status: 'fail', detail: e.message });
    }
  }

  return out;
}

export async function doctor() {
  const checks = await runChecks();
  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  const lines = ['claude-code-completions doctor'];
  for (const c of checks) {
    const icon = c.status === 'ok' ? 'OK  ' : c.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`  [${icon}] ${c.name}: ${c.detail}`);
  }
  const summary = fails === 0 && warns === 0
    ? 'all checks passed'
    : `${checks.length - fails - warns} ok, ${warns} warn, ${fails} fail`;
  lines.push('');
  lines.push(summary);
  return { text: lines.join('\n'), ok: fails === 0 };
}
