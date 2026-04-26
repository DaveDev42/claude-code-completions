// Tests for src/audit.js. Builds synthetic IRs and verifies drift detection.
import assert from 'node:assert/strict';
import { auditOverrides } from '../src/audit.js';

function makeIR({ options = [], commands = [] } = {}) {
  return { version: 'test', options, commands };
}

// Clean case: every override that exists in IR is consistent.
{
  const ir = makeIR({
    options: [
      { flags: ['--model'], arg: { choices: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'] } },
      { flags: ['--fallback-model'], arg: { choices: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'] } },
      { flags: ['--effort'], arg: null },
      { flags: ['--permission-mode'], arg: { choices: ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan'] } },
      { flags: ['--output-format'], arg: { choices: ['text', 'json', 'stream-json'] } },
      { flags: ['--input-format'], arg: { choices: ['text', 'stream-json'] } },
      { flags: ['--setting-sources'], arg: null },
    ],
    commands: [
      { name: 'mcp', aliases: [] },
      { name: 'plugin', aliases: ['plugins'] },
      { name: 'auth', aliases: [] },
      { name: 'install', aliases: [] },
    ],
  });
  const r = auditOverrides(ir);
  assert.equal(r.ok, true, 'clean IR should produce ok=true');
  assert.equal(r.issues.length, 0, `clean IR should have no issues, got ${JSON.stringify(r.issues)}`);
}

// Drift: --help declares a new model that overrides don't have.
{
  const ir = makeIR({
    options: [
      { flags: ['--model'], arg: { choices: ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001', 'claude-haiku-5-PREVIEW'] } },
    ],
    commands: [],
  });
  const r = auditOverrides(ir);
  assert.equal(r.ok, false, 'missing enum value should fail audit');
  const e = r.issues.find(i => i.kind === 'enum-missing');
  assert.ok(e, 'should report enum-missing');
  assert.match(e.message, /claude-haiku-5-PREVIEW/);
}

// Orphan: override exists for an option no longer present.
{
  const ir = makeIR({ options: [], commands: [] });
  const r = auditOverrides(ir);
  const orphan = r.issues.find(i => i.kind === 'orphan-enum-override');
  assert.ok(orphan, 'should report orphan enum override');
  assert.equal(r.ok, true, 'orphan is warn, not error');
}

// Orphan subcommand override.
{
  const ir = makeIR({
    options: [
      { flags: ['--model'], arg: null },
      { flags: ['--fallback-model'], arg: null },
      { flags: ['--effort'], arg: null },
      { flags: ['--permission-mode'], arg: null },
      { flags: ['--output-format'], arg: null },
      { flags: ['--input-format'], arg: null },
      { flags: ['--setting-sources'], arg: null },
    ],
    commands: [],
  });
  const r = auditOverrides(ir);
  const sub = r.issues.find(i => i.kind === 'orphan-subcommand-override');
  assert.ok(sub, 'should report orphan subcommand');
}

console.log('audit tests passed');
