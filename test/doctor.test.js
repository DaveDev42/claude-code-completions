// Smoke test for src/doctor.js. Verifies it returns a valid report shape and
// degrades gracefully when claude / brew are unavailable.
import assert from 'node:assert/strict';
import { doctor, doctorFix } from '../src/doctor.js';

// Strip ANSI escapes so assertions are stable when stdout is a TTY.
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

const r = await doctor();
assert.equal(typeof r.text, 'string');
assert.equal(typeof r.ok, 'boolean');
assert.ok(Array.isArray(r.checks));

const text = stripAnsi(r.text);
assert.match(text, /^claude-code-completions doctor/);
assert.match(text, /\b(OK|WARN|FAIL)\b/);

// The summary line must appear somewhere in the output (it's no longer
// guaranteed to be the very last line — a `--fix` hint may follow it).
const summaryRegex = /^(all checks passed|\d+ ok, \d+ warn, \d+ fail)$/m;
assert.match(text, summaryRegex, 'expected summary line not found');

// doctor --fix must run without throwing even when there's nothing to repair
// or when fixes are applied. Don't actually run it here (it would mutate
// ~/.zshrc on the dev's machine); just check the export is callable.
assert.equal(typeof doctorFix, 'function');

console.log('doctor tests passed');
