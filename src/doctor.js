// User-facing diagnostic for "tab completion isn't working" / "is this thing alive".
// Each check returns { name, status: 'ok'|'warn'|'fail', detail }.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Run a shell command through the user's interactive init (so fpath/compinit/
// completion plugins all run) and return stdout. Returns null on any failure.
// Timeout is intentionally short — a slow shell startup hanging doctor is worse
// than skipping the check.
function runInShell(shell, command) {
  try {
    return execFileSync(shell, ['-i', '-c', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch {
    return null;
  }
}

// Check that zsh, started with the user's init, actually loaded _claude.
// Reports two distinct failure modes so the fix message can be specific.
function checkZshActivation(loaderPath) {
  if (!existsSync('/bin/zsh') && !existsSync('/usr/bin/zsh') && !existsSync('/opt/homebrew/bin/zsh')) {
    return { name: 'zsh activation', status: 'warn', detail: 'zsh not installed; skipping' };
  }
  // Print fpath (one per line) and the registered compdef target for `claude`.
  const out = runInShell('zsh', 'print -l -- $fpath; echo "---"; print -r -- ${_comps[claude]:-MISSING}');
  if (out === null) {
    return { name: 'zsh activation', status: 'warn', detail: 'could not start zsh -i (skipped)' };
  }
  const [fpathBlock = '', compsBlock = ''] = out.split('---');
  const fpathDirs = fpathBlock.split('\n').map(s => s.trim()).filter(Boolean);
  const compsLine = compsBlock.trim();

  if (compsLine && compsLine !== 'MISSING') {
    return { name: 'zsh activation', status: 'ok', detail: `compdef registered (${compsLine})` };
  }

  // Not registered. Distinguish "fpath missing the loader's directory" from
  // "directory in fpath but compinit didn't pick it up" (stale .zcompdump).
  if (loaderPath) {
    const loaderDir = loaderPath.replace(/\/[^/]+$/, '');
    const inFpath = fpathDirs.includes(loaderDir);
    if (!inFpath) {
      return {
        name: 'zsh activation',
        status: 'fail',
        detail: `${loaderDir} not in $fpath — add \`eval "$(brew shellenv)"\` to ~/.zshrc BEFORE compinit/zinit/oh-my-zsh init`,
      };
    }
    return {
      name: 'zsh activation',
      status: 'fail',
      detail: `loader dir is in $fpath but compinit didn't register _claude — try \`rm -f ~/.zcompdump*\` and open a new shell`,
    };
  }
  return {
    name: 'zsh activation',
    status: 'fail',
    detail: `_claude not registered with compdef and loader path unknown`,
  };
}

function checkBashActivation(loaderPath) {
  if (!loaderPath) return { name: 'bash activation', status: 'warn', detail: 'loader path unknown; skipping' };
  // bash -i sources ~/.bashrc; bash-completion's dynamic loader registers on
  // first tab, but `complete -p claude` after sourcing the loader explicitly
  // is the reliable check.
  const cmd = `source "${loaderPath}" 2>/dev/null; complete -p claude 2>/dev/null || echo MISSING`;
  const out = runInShell('bash', cmd);
  if (out === null) {
    return { name: 'bash activation', status: 'warn', detail: 'could not start bash -i (skipped)' };
  }
  const line = out.trim();
  if (line && line !== 'MISSING' && line.includes('claude')) {
    return { name: 'bash activation', status: 'ok', detail: line.split('\n').pop() };
  }
  return {
    name: 'bash activation',
    status: 'fail',
    detail: `complete -p claude empty after sourcing loader — ensure bash-completion is installed and ~/.bashrc sources it`,
  };
}

function checkFishActivation() {
  if (!existsSync('/opt/homebrew/bin/fish') && !existsSync('/usr/local/bin/fish') && !existsSync('/usr/bin/fish')) {
    return { name: 'fish activation', status: 'warn', detail: 'fish not installed; skipping' };
  }
  // fish auto-loads completions from vendor_completions.d when the command is
  // first tabbed. `complete -c claude` lists completions registered for it.
  const out = runInShell('fish', 'complete -c claude');
  if (out === null) {
    return { name: 'fish activation', status: 'warn', detail: 'could not start fish -i (skipped)' };
  }
  const lines = out.split('\n').filter(Boolean);
  if (lines.length > 0) {
    return { name: 'fish activation', status: 'ok', detail: `${lines.length} completions registered` };
  }
  return {
    name: 'fish activation',
    status: 'fail',
    detail: `no completions registered for claude — fish loader may not be on $fish_complete_path`,
  };
}

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

  // shell completion paths (best-effort) — file presence only.
  // The activation checks below are what actually verifies the shell sees them.
  const brewPrefix = (() => {
    try { return execFileSync('brew', ['--prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  })();
  const loaderPaths = { zsh: null, bash: null, fish: null };
  if (brewPrefix) {
    const checks = [
      { shell: 'zsh', name: 'zsh loader', path: join(brewPrefix, 'share/zsh/site-functions/_claude') },
      { shell: 'bash', name: 'bash loader', path: join(brewPrefix, 'etc/bash_completion.d/claude.bash') },
      { shell: 'fish', name: 'fish loader', path: join(brewPrefix, 'share/fish/vendor_completions.d/claude.fish') },
    ];
    for (const c of checks) {
      if (existsSync(c.path)) {
        out.push({ name: c.name, status: 'ok', detail: c.path });
        loaderPaths[c.shell] = c.path;
      } else {
        out.push({ name: c.name, status: 'warn', detail: `not at ${c.path} (ok if you don't use this shell)` });
      }
    }
  } else {
    out.push({ name: 'brew prefix', status: 'warn', detail: 'brew not found — manual install assumed; loader paths not checked' });
  }

  // Activation checks: spawn each shell with the user's init and ask whether
  // claude completion is actually registered. This catches the case where the
  // file is installed correctly but never reaches $fpath / $fish_complete_path.
  if (loaderPaths.zsh) out.push(checkZshActivation(loaderPaths.zsh));
  if (loaderPaths.bash) out.push(checkBashActivation(loaderPaths.bash));
  if (loaderPaths.fish) out.push(checkFishActivation());

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
