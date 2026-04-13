// Minimal smoke test for parse.js. Run via `npm test`.
import assert from 'node:assert/strict';
import { parseHelp } from '../src/parse.js';

const helpSample = `Usage: claude [options] [command] [prompt]

Options:
  -c, --continue                      Continue the most recent conversation in the current directory
  --model <model>                     Model for the current session (sonnet/opus)
  --output-format <format>            Output format (only works with --print): "text" (default), "json" (single result), or "stream-json" (realtime streaming) (choices: "text", "json", "stream-json")
  -w, --worktree [name]               Create a new git worktree for this session (optionally specify a name)
  --add-dir <directories...>          Additional directories to allow tool access to

Commands:
  doctor                              Check health
  plugin|plugins                      Manage plugins
`;

const ir = parseHelp(helpSample, '1.0.0-test');

assert.equal(ir.version, '1.0.0-test');
assert.equal(ir.options.length, 5, `expected 5 options, got ${ir.options.length}`);
assert.deepEqual(ir.options[0].flags, ['-c', '--continue']);
assert.equal(ir.options[0].arg, null);

const modelOpt = ir.options.find(o => o.flags.includes('--model'));
assert.ok(modelOpt.arg);
assert.ok(modelOpt.arg.choices && modelOpt.arg.choices.includes('sonnet'), 'model should get choices from override');

const outputOpt = ir.options.find(o => o.flags.includes('--output-format'));
assert.deepEqual(outputOpt.arg.choices, ['text', 'json', 'stream-json']);

const worktreeOpt = ir.options.find(o => o.flags.includes('-w'));
assert.equal(worktreeOpt.arg.required, false, 'worktree arg is optional');

const addDirOpt = ir.options.find(o => o.flags.includes('--add-dir'));
assert.equal(addDirOpt.arg.variadic, true);

assert.equal(ir.commands.length, 2);
const pluginCmd = ir.commands.find(c => c.name === 'plugin');
assert.deepEqual(pluginCmd.aliases, ['plugins']);

console.log('all tests passed');
