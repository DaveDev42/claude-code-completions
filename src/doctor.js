// User-facing diagnostic for "tab completion isn't working" / "is this thing alive".
// Each check returns { name, status: 'ok'|'warn'|'fail', detail, fix? }.
// `fix` is a machine-readable hint for `doctor --fix` to act on.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ANSI styling. Disabled when stdout isn't a TTY or NO_COLOR is set
// (https://no-color.org). Kept inline so we keep the zero-dependency property.
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: COLOR ? '\x1b[0m' : '',
  bold: COLOR ? '\x1b[1m' : '',
  dim: COLOR ? '\x1b[2m' : '',
  red: COLOR ? '\x1b[31m' : '',
  green: COLOR ? '\x1b[32m' : '',
  yellow: COLOR ? '\x1b[33m' : '',
  blue: COLOR ? '\x1b[34m' : '',
  cyan: COLOR ? '\x1b[36m' : '',
};

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
        detail: `${loaderDir} not in $fpath`,
        hint: 'Add brew shellenv to ~/.zshrc BEFORE compinit / oh-my-zsh / zinit / prezto init.',
        snippet: 'eval "$(brew shellenv)"',
        fix: 'zshrc-shellenv',
      };
    }
    return {
      name: 'zsh activation',
      status: 'fail',
      detail: `loader dir is in $fpath but compinit didn't register _claude`,
      hint: 'Stale ~/.zcompdump. Clear it and open a new shell.',
      snippet: 'rm -f ~/.zcompdump* && exec zsh',
      fix: 'zcompdump',
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
  // Only offer --fix on macOS where we can use brew. Linux requires distro-
  // specific package management, so we skip the automated path there.
  const isMac = process.platform === 'darwin';
  return {
    name: 'bash activation',
    status: 'fail',
    detail: `complete -p claude empty after sourcing loader`,
    hint: isMac
      ? 'Install bash-completion and ensure ~/.bashrc sources its init script.'
      : 'Install bash-completion for your distro and ensure ~/.bashrc sources its init script.',
    snippet: isMac ? 'brew install bash-completion' : undefined,
    fix: isMac ? 'bash-setup' : undefined,
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

function statusBadge(status) {
  switch (status) {
    case 'ok':   return `${c.green}OK  ${c.reset}`;
    case 'warn': return `${c.yellow}WARN${c.reset}`;
    case 'fail': return `${c.red}FAIL${c.reset}`;
    default:     return status;
  }
}

function formatChecks(checks) {
  const lines = [`${c.bold}claude-code-completions doctor${c.reset}`];
  for (const ch of checks) {
    lines.push(`  [${statusBadge(ch.status)}] ${c.bold}${ch.name}${c.reset}: ${ch.detail}`);
    if (ch.hint) {
      lines.push(`         ${c.dim}${ch.hint}${c.reset}`);
    }
    if (ch.snippet) {
      // The snippet is meant to be copy-paste-runnable, so it must stay on its
      // own line with no leading indent dressing that could be copied along.
      lines.push(`         ${c.cyan}${ch.snippet}${c.reset}`);
    }
  }
  return lines;
}

export async function doctor() {
  const checks = await runChecks();
  const fails = checks.filter(ch => ch.status === 'fail').length;
  const warns = checks.filter(ch => ch.status === 'warn').length;
  const fixable = checks.some(ch => ch.fix);
  const lines = formatChecks(checks);
  const summary = fails === 0 && warns === 0
    ? `${c.green}all checks passed${c.reset}`
    : `${checks.length - fails - warns} ok, ${warns} warn, ${fails} fail`;
  lines.push('');
  lines.push(summary);
  if (fixable) {
    lines.push('');
    lines.push(`${c.dim}Some issues are auto-fixable. Run:${c.reset}`);
    lines.push(`  ${c.cyan}claude-code-completions doctor --fix${c.reset}`);
  }
  return { text: lines.join('\n'), ok: fails === 0, checks };
}

// --- doctor --fix ---------------------------------------------------------
// Idempotent repairs for the two most common failure modes:
//   1. ~/.zshrc missing `eval "$(brew shellenv)"` (loader dir not in $fpath)
//   2. stale ~/.zcompdump* (loader dir in $fpath but compinit didn't pick up)
// We never modify shell init files without an explicit `--fix` invocation.

function brewShellenvLine() {
  // Resolve a concrete brew prefix when possible so the line works even before
  // brew is on PATH. Falls back to the bare `brew shellenv` form, which works
  // on any machine that has brew on PATH already.
  let prefix = null;
  try {
    prefix = execFileSync('brew', ['--prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  if (prefix) {
    return `eval "$(${prefix}/bin/brew shellenv)"`;
  }
  return `eval "$(brew shellenv)"`;
}

function fixZshrcShellenv() {
  const zshrc = join(homedir(), '.zshrc');
  const line = brewShellenvLine();
  let body = '';
  try { body = readFileSync(zshrc, 'utf8'); } catch {}
  // Idempotent: any existing `brew shellenv` line counts as already-fixed,
  // even if the prefix differs (user may have set their own).
  if (/eval\s+"\$\(.*brew\s+shellenv\)"/.test(body)) {
    return { changed: false, detail: `${zshrc} already has a brew shellenv line` };
  }
  // Prepend so the line runs before any framework's compinit. A trailing
  // newline keeps the rest of the file intact even if it was empty.
  const banner = '# Added by claude-code-completions doctor --fix: brew completions need this BEFORE compinit.\n';
  const next = banner + line + '\n' + (body.length && !body.startsWith('\n') ? '\n' : '') + body;
  writeFileSync(zshrc, next);
  return { changed: true, detail: `prepended brew shellenv to ${zshrc}` };
}

function fixZcompdump() {
  const home = homedir();
  let removed = 0;
  let entries = [];
  try { entries = readdirSync(home); } catch { return { changed: false, detail: 'could not read $HOME' }; }
  for (const name of entries) {
    if (name.startsWith('.zcompdump')) {
      try { unlinkSync(join(home, name)); removed++; } catch {}
    }
  }
  return {
    changed: removed > 0,
    detail: removed > 0 ? `removed ${removed} ~/.zcompdump* file(s)` : 'no ~/.zcompdump* files to remove',
  };
}

// Returns true if bash-completion (either version) is installed via brew.
function brewBashCompletionInstalled() {
  try {
    execFileSync('brew', ['list', '--formula', 'bash-completion'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {}
  try {
    execFileSync('brew', ['list', '--formula', 'bash-completion@2'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {}
  return false;
}

function fixBashCompletion() {
  if (brewBashCompletionInstalled()) {
    return { changed: false, detail: 'bash-completion already installed' };
  }
  try {
    execFileSync('brew', ['install', 'bash-completion'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    return { changed: true, detail: 'installed bash-completion via brew' };
  } catch (e) {
    return { changed: false, error: true, detail: `brew install bash-completion failed: ${e.message.split('\n')[0]}` };
  }
}

function fixBashrc() {
  // Brew uses the same init script path for both bash-completion versions.
  let prefix = null;
  try {
    prefix = execFileSync('brew', ['--prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  if (!prefix) return { changed: false, detail: 'brew not found; cannot determine init script path' };

  const initScript = join(prefix, 'etc/profile.d/bash_completion.sh');
  // The canonical line that Homebrew caveats recommend.
  const sourceLine = `[[ -r "${initScript}" ]] && . "${initScript}"`;

  // Check ~/.bashrc and ~/.bash_profile; if either already has it, skip.
  const targets = [join(homedir(), '.bashrc'), join(homedir(), '.bash_profile')];
  for (const f of targets) {
    let body = '';
    try { body = readFileSync(f, 'utf8'); } catch {}
    if (body.includes('bash_completion.sh')) {
      return { changed: false, detail: `${f} already sources bash_completion.sh` };
    }
  }

  // Write to ~/.bashrc (bash -i picks this up for non-login shells; same
  // path the doctor uses when running `bash -i` for activation checks).
  const bashrc = join(homedir(), '.bashrc');
  let body = '';
  try { body = readFileSync(bashrc, 'utf8'); } catch {}
  const banner = '# Added by claude-code-completions doctor --fix: enables bash-completion.\n';
  const next = body + (body.endsWith('\n') || body === '' ? '' : '\n') + '\n' + banner + sourceLine + '\n';
  writeFileSync(bashrc, next);
  return { changed: true, detail: `appended bash-completion source line to ${bashrc}` };
}

export async function doctorFix() {
  const r = await doctor();
  const fixable = r.checks.filter(ch => ch.fix);
  const lines = [`${c.bold}claude-code-completions doctor --fix${c.reset}`];

  if (fixable.length === 0) {
    lines.push('');
    lines.push(`${c.green}nothing to fix.${c.reset}`);
    return { text: lines.join('\n'), ok: true };
  }

  // Track whether we've already cleaned ~/.zcompdump so we don't do it twice
  // when both `zshrc-shellenv` and `zcompdump` fixes are present.
  let didCompdump = false;
  const fixedShells = new Set();
  for (const ch of fixable) {
    if (ch.fix === 'zshrc-shellenv') {
      const r = fixZshrcShellenv();
      lines.push(`  [${r.changed ? c.green + 'FIXED' + c.reset : c.dim + 'SKIP ' + c.reset}] ${ch.name}: ${r.detail}`);
      // Adding brew shellenv changes $fpath, so any cached .zcompdump is now
      // stale and would prevent compinit from picking up _claude on next start.
      // Always clean it as part of this fix, so a single `--fix` invocation
      // is enough to actually make completion work.
      if (r.changed && !didCompdump) {
        const dump = fixZcompdump();
        lines.push(`  [${dump.changed ? c.green + 'FIXED' + c.reset : c.dim + 'SKIP ' + c.reset}] zcompdump cleanup: ${dump.detail}`);
        didCompdump = true;
      }
      fixedShells.add('zsh');
    } else if (ch.fix === 'zcompdump') {
      if (didCompdump) continue;
      const r = fixZcompdump();
      lines.push(`  [${r.changed ? c.green + 'FIXED' + c.reset : c.dim + 'SKIP ' + c.reset}] zcompdump cleanup: ${r.detail}`);
      didCompdump = true;
      fixedShells.add('zsh');
    } else if (ch.fix === 'bash-setup') {
      const pkg = fixBashCompletion();
      const badge = pkg.error ? c.red + 'ERR ' + c.reset : pkg.changed ? c.green + 'FIXED' + c.reset : c.dim + 'SKIP ' + c.reset;
      lines.push(`  [${badge}] ${ch.name} (bash-completion): ${pkg.detail}`);
      if (!pkg.error) {
        const rc = fixBashrc();
        const rcBadge = rc.changed ? c.green + 'FIXED' + c.reset : c.dim + 'SKIP ' + c.reset;
        lines.push(`  [${rcBadge}] ${ch.name} (~/.bashrc): ${rc.detail}`);
        fixedShells.add('bash');
      }
    }
  }

  lines.push('');
  lines.push(`${c.dim}Open a new shell to pick up the changes:${c.reset}`);
  if (fixedShells.has('bash') && !fixedShells.has('zsh')) {
    lines.push(`  ${c.cyan}exec bash${c.reset}`);
  } else if (fixedShells.has('bash') && fixedShells.has('zsh')) {
    lines.push(`  ${c.cyan}exec zsh  # or exec bash${c.reset}`);
  } else {
    lines.push(`  ${c.cyan}exec zsh${c.reset}`);
  }
  return { text: lines.join('\n'), ok: true };
}
