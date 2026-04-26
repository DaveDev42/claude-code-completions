// Smoke test for src/doctor.js. Verifies it returns a valid report shape and
// degrades gracefully when claude / brew are unavailable.
import assert from 'node:assert/strict';
import { doctor } from '../src/doctor.js';

const r = await doctor();
assert.equal(typeof r.text, 'string');
assert.equal(typeof r.ok, 'boolean');
assert.match(r.text, /^claude-code-completions doctor/);
assert.match(r.text, /\b(OK|WARN|FAIL)\b/);

// Final summary line must be one of the known shapes.
const lastLine = r.text.trim().split('\n').pop();
assert.ok(
  /^all checks passed$/.test(lastLine) || /\d+ ok, \d+ warn, \d+ fail$/.test(lastLine),
  `unexpected summary line: ${lastLine}`,
);

console.log('doctor tests passed');
