// Loader regression tests. Scenarios per shell:
//   1. 0-byte cache file is treated as missing and regenerated.
//   2. Generator that emits partial output then crashes does NOT leave a
//      truncated cache at the destination — falls through to static fallback
//      installed at the brew layout's <prefix>/share/claude-code-completions/.
//   3. 1-byte corrupt cache (e.g. a stray newline left over from a prior
//      failed `echo > file` simulation) is treated as missing — `-s` alone
//      lets it through, but the sentinel check rejects it.
//   4. No leftover .tmp files after any scenario.
//
// Each scenario assembles a synthetic brew prefix layout in a tmpdir so the
// loader's static-path resolution can be exercised end-to-end without
// touching the real install.

import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, existsSync, rmSync, copyFileSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repoRoot, 'bin/claude-code-completions.js');
const completionsDir = join(repoRoot, 'completions');

let hasClaude = true;
try { execFileSync('claude', ['--version'], { stdio: 'ignore' }); } catch { hasClaude = false; }
if (!hasClaude) {
  console.log('loader tests skipped (no claude binary)');
  process.exit(0);
}

const rawVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
const sanitized = rawVersion.replace(/[ ()/]/g, '');

function shellAvailable(name) {
  try { execFileSync(name, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

// SHELLS describes how each loader is laid out under a brew prefix and how
// to invoke it. The static fallback path is relative to the loader's
// install dir; the test prepares both.
const SHELLS = [
  {
    name: 'zsh',
    bin: 'zsh',
    loaderSrc: join(repoRoot, 'shell-loaders/_claude'),
    loaderDest: 'share/zsh/site-functions/_claude',
    cachePrefix: '_claude-',
    staticSrc: join(completionsDir, '_claude'),
    staticDest: 'share/claude-code-completions/_claude.static',
  },
  {
    name: 'bash',
    bin: 'bash',
    loaderSrc: join(repoRoot, 'shell-loaders/claude.bash'),
    loaderDest: 'etc/bash_completion.d/claude',
    cachePrefix: 'claude.bash-',
    staticSrc: join(completionsDir, 'claude.bash'),
    staticDest: 'share/claude-code-completions/claude.bash.static',
  },
  {
    name: 'fish',
    bin: 'fish',
    loaderSrc: join(repoRoot, 'shell-loaders/claude.fish'),
    loaderDest: 'share/fish/vendor_completions.d/claude.fish',
    cachePrefix: 'claude.fish-',
    staticSrc: join(completionsDir, 'claude.fish'),
    staticDest: 'share/claude-code-completions/claude.fish.static',
  },
];

function makePrefix(shell) {
  const dir = mkdtempSync(join(tmpdir(), `cccomp-loader-${shell.name}-`));
  const prefix = join(dir, 'prefix');
  mkdirSync(join(prefix, dirname(shell.loaderDest)), { recursive: true });
  mkdirSync(join(prefix, dirname(shell.staticDest)), { recursive: true });
  copyFileSync(shell.loaderSrc, join(prefix, shell.loaderDest));
  copyFileSync(shell.staticSrc, join(prefix, shell.staticDest));
  return { dir, prefix, loader: join(prefix, shell.loaderDest), cacheDir: join(dir, 'cache/claude-code-completions') };
}

function sourceLoader(shell, env, cmd) {
  // bash exits non-zero when the loader's `_arguments`/`_default` are
  // unavailable outside a real completion context — that's expected and
  // happens AFTER the slow path completes its work. Tolerate non-zero exit.
  try {
    execFileSync(shell.bin, ['-c', cmd], { env, stdio: 'ignore' });
  } catch { /* expected */ }
}

function findCacheFile(cacheDir, prefix, version) {
  if (!existsSync(cacheDir)) return null;
  const expected = `${prefix}${version}`;
  const entries = readdirSync(cacheDir);
  return entries.includes(expected) ? join(cacheDir, expected) : null;
}

function tmpLeftovers(cacheDir) {
  if (!existsSync(cacheDir)) return [];
  return readdirSync(cacheDir).filter(n => n.endsWith('.tmp'));
}

function makeFakeCrashGen() {
  // A generator that emits one line then SIGKILLs itself — the worst case
  // for atomic write: tmp file is non-empty but exit code is non-zero.
  const path = join(mkdtempSync(join(tmpdir(), 'cccomp-fakegen-')), 'gen.sh');
  writeFileSync(path, '#!/bin/bash\necho "# partial output"\nkill -9 $$\n');
  chmodSync(path, 0o755);
  return path;
}

let ran = 0;

for (const shell of SHELLS) {
  if (!shellAvailable(shell.bin)) {
    console.log(`  ${shell.name}: skipped (${shell.bin} not installed)`);
    continue;
  }

  // --- scenario 1: 0-byte cache regenerates ---
  {
    const { dir, loader, cacheDir } = makePrefix(shell);
    mkdirSync(cacheDir, { recursive: true });
    const cacheFile = join(cacheDir, `${shell.cachePrefix}${sanitized}`);
    writeFileSync(cacheFile, '');
    assert.equal(statSync(cacheFile).size, 0);

    sourceLoader(shell, { ...process.env, XDG_CACHE_HOME: dirname(cacheDir), CLAUDE_COMPLETIONS_BIN: cli }, `source ${loader}`);

    const found = findCacheFile(cacheDir, shell.cachePrefix, sanitized);
    assert.ok(found, `${shell.name}: cache file should exist after regen`);
    assert.ok(statSync(found).size > 100, `${shell.name}: cache file should be non-empty (got ${statSync(found).size}B)`);
    assert.deepEqual(tmpLeftovers(cacheDir), [], `${shell.name}: no leftover .tmp files after regen`);
    rmSync(dir, { recursive: true, force: true });
    ran++;
  }

  // --- scenario 2: partial-output crash falls back to static ---
  {
    const { dir, loader, cacheDir } = makePrefix(shell);
    mkdirSync(cacheDir, { recursive: true });
    const fakeGen = makeFakeCrashGen();

    sourceLoader(shell, { ...process.env, XDG_CACHE_HOME: dirname(cacheDir), CLAUDE_COMPLETIONS_BIN: fakeGen }, `source ${loader}`);

    const found = findCacheFile(cacheDir, shell.cachePrefix, sanitized);
    assert.ok(found, `${shell.name}: static fallback should produce cache file even when generator crashes`);
    const content = execFileSync('head', ['-1', found], { encoding: 'utf8' });
    assert.ok(!content.includes('# partial output'), `${shell.name}: cache must NOT contain partial generator output (got: ${content.trim()})`);
    assert.deepEqual(tmpLeftovers(cacheDir), [], `${shell.name}: no leftover .tmp files after crash fallback`);
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirname(fakeGen), { recursive: true, force: true });
    ran++;
  }

  // --- scenario 3: 1-byte corrupt cache regenerates ---
  // Reproduces the v0.4.3 bug: a leftover 1-byte file (e.g. from `echo
  // > cache` simulation, or a generator that wrote one newline before
  // SIGKILL) passed `-s` and was sourced, leaving _claude undefined.
  // With sentinel-based validation, the loader should reject it and
  // regenerate.
  {
    const { dir, loader, cacheDir } = makePrefix(shell);
    mkdirSync(cacheDir, { recursive: true });
    const cacheFile = join(cacheDir, `${shell.cachePrefix}${sanitized}`);
    writeFileSync(cacheFile, '\n');
    assert.equal(statSync(cacheFile).size, 1);

    sourceLoader(shell, { ...process.env, XDG_CACHE_HOME: dirname(cacheDir), CLAUDE_COMPLETIONS_BIN: cli }, `source ${loader}`);

    const found = findCacheFile(cacheDir, shell.cachePrefix, sanitized);
    assert.ok(found, `${shell.name}: cache file should exist after corrupt-cache regen`);
    const size = statSync(found).size;
    assert.ok(size > 100, `${shell.name}: cache file should be regenerated, not the 1-byte corrupt original (got ${size}B)`);
    assert.deepEqual(tmpLeftovers(cacheDir), [], `${shell.name}: no leftover .tmp files after corrupt-cache regen`);
    rmSync(dir, { recursive: true, force: true });
    ran++;
  }
}

console.log(`loader tests passed (${ran} scenarios)`);
