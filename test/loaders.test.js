// Regression: a 0-byte cache file (left behind by a prior failed generate)
// must NOT be sourced as-is — that leaves _claude undefined and produces
// "command not found: _claude" on every tab. The loader must treat 0-byte
// as "missing" and regenerate.
//
// We exercise the zsh loader end-to-end against a real cache directory.
// bash/fish are sufficiently structurally similar (`-s` checks, write-temp +
// rename) that fixing all three together is verified by inspection.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loader = join(repoRoot, 'shell-loaders/_claude');
const cli = join(repoRoot, 'bin/claude-code-completions.js');

// `claude` may not be on PATH in CI. Skip cleanly if so — the loader's slow
// path needs `claude --version` to derive the cache filename.
let hasClaude = true;
try { execFileSync('claude', ['--version'], { stdio: 'ignore' }); } catch { hasClaude = false; }
if (!hasClaude) {
  console.log('loader tests skipped (no claude binary)');
  process.exit(0);
}

const xdg = mkdtempSync(join(tmpdir(), 'cccomp-loader-'));
const cacheDir = join(xdg, 'claude-code-completions');
mkdirSync(cacheDir, { recursive: true });

// Derive the cache filename the loader will compute.
const rawVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
const sanitized = rawVersion.replace(/[ ()/]/g, '');
const cacheFile = join(cacheDir, `_claude-${sanitized}`);

// Plant a 0-byte file at exactly the path the loader will consult.
writeFileSync(cacheFile, '');
assert.equal(statSync(cacheFile).size, 0, 'sanity: planted 0-byte cache');

// Source the loader in zsh. The bottom of the loader calls `_claude "$@"`,
// which (outside of a real completion context) trips `_arguments: can only
// be called from completion function` and exits non-zero — but that runs
// AFTER the slow path has already regenerated the cache, which is what we
// actually want to verify. So tolerate non-zero exit and only assert on the
// resulting cache state.
try {
  execFileSync('zsh', ['-c', `source ${loader}`], {
    env: { ...process.env, XDG_CACHE_HOME: xdg, CLAUDE_COMPLETIONS_BIN: cli },
    stdio: 'ignore',
  });
} catch { /* expected: _arguments errors when sourced outside completion */ }

// After the loader runs, the cache file must exist and be non-empty.
assert.ok(existsSync(cacheFile), 'cache file should exist after loader runs');
const size = statSync(cacheFile).size;
assert.ok(size > 100, `cache file should be regenerated, got ${size} bytes`);

// No leftover .tmp files.
const leftovers = execFileSync('zsh', ['-c', `print -r -- ${cacheDir}/*.tmp(N)`], { encoding: 'utf8' }).trim();
assert.equal(leftovers, '', `no leftover tmp files; got: ${leftovers}`);

rmSync(xdg, { recursive: true, force: true });
console.log('loader tests passed');
