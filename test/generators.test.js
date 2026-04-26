// Smoke tests for shell generators. Verifies the IR → script wiring produces
// the headers, flags, and subcommand branches each shell needs to load.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseHelp } from '../src/parse.js';
import { generateZsh } from '../src/generators/zsh.js';
import { generateBash } from '../src/generators/bash.js';
import { generateFish } from '../src/generators/fish.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(__dirname, 'fixtures/help.txt'), 'utf8');
const ir = parseHelp(fixture, '2.1.119');

assert.ok(ir.options.length > 10, `fixture should yield many options, got ${ir.options.length}`);
assert.ok(ir.commands.length > 0, 'fixture should yield commands');

const zsh = generateZsh(ir);
assert.match(zsh, /^#compdef claude/m, 'zsh script must start with #compdef');
assert.match(zsh, /2\.1\.119/, 'zsh script should embed the version');
assert.match(zsh, /_arguments/, 'zsh script should call _arguments');
assert.match(zsh, /case \$state in/, 'zsh script should branch on state');
for (const cmd of ir.commands) {
  assert.ok(zsh.includes(`'${cmd.name}:`), `zsh missing _describe entry for ${cmd.name}`);
}

const bash = generateBash(ir);
assert.match(bash, /complete .*-F .*_claude/, 'bash script must register completion');
assert.match(bash, /2\.1\.119/, 'bash script should embed the version');
assert.match(bash, /COMPREPLY/, 'bash script should populate COMPREPLY');

const fish = generateFish(ir);
assert.match(fish, /complete -c claude/, 'fish script must use complete -c claude');
assert.match(fish, /2\.1\.119/, 'fish script should embed the version');
for (const cmd of ir.commands) {
  assert.ok(fish.includes(cmd.name), `fish missing subcommand ${cmd.name}`);
}

console.log('generator tests passed');
