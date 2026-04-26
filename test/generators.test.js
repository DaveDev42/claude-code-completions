// Tests for shell generators. Verifies:
//   1. headers and structural skeleton (smoke)
//   2. round-trip: every parsed flag appears in each generator's output
//   3. mutex pairs (e.g. -c/--continue) are kept together in zsh
//   4. enum choices are emitted in the shell-correct form
//   5. dangerous chars in descriptions don't break syntax
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

// 1. zsh: headers + structure
const zsh = generateZsh(ir);
assert.match(zsh, /^#compdef claude/m, 'zsh script must start with #compdef');
assert.match(zsh, /2\.1\.119/, 'zsh script should embed the version');
assert.match(zsh, /_arguments/, 'zsh script should call _arguments');
assert.match(zsh, /case \$state in/, 'zsh script should branch on state');
for (const cmd of ir.commands) {
  assert.ok(zsh.includes(`'${cmd.name}:`), `zsh missing _describe entry for ${cmd.name}`);
}

// 2. round-trip: every parsed flag must appear textually in each generator
//    in the form natural to that shell. fish uses `-l name` / `-s c`, not the
//    raw -- / - prefixed token, so we map for fish accordingly.
function flagInZshOrBash(script, flag) { return script.includes(flag); }
function flagInFish(script, flag) {
  if (flag.startsWith('--')) return script.includes(`-l ${flag.slice(2)}`);
  if (/^-[^-]$/.test(flag)) return script.includes(`-s ${flag.slice(1)}`);
  return script.includes(flag);
}
function assertFlagsPresent(script, label, matcher) {
  for (const opt of ir.options) {
    for (const flag of opt.flags) {
      assert.ok(
        matcher(script, flag),
        `${label} missing flag ${flag} from option ${opt.flags.join('/')}`,
      );
    }
  }
}
assertFlagsPresent(zsh, 'zsh', flagInZshOrBash);

// 3. mutex pairs: short+long forms must end up grouped in zsh _arguments
//    Pattern emitted by zsh generator: '(-c --continue)'{-c,--continue}'[...]'
const mutexOpts = ir.options.filter(o => o.flags.length >= 2 && o.flags.some(f => f.startsWith('--')) && o.flags.some(f => /^-[^-]$/.test(f)));
assert.ok(mutexOpts.length > 0, 'fixture should contain at least one short+long mutex pair');
for (const opt of mutexOpts) {
  const short = opt.flags.find(f => /^-[^-]$/.test(f));
  const long = opt.flags.find(f => f.startsWith('--'));
  const expected = new RegExp(`'\\(${short.replace(/-/g, '\\-')} ${long.replace(/-/g, '\\-')}\\)'`);
  assert.match(zsh, expected, `zsh should group mutex pair ${short}/${long}`);
}

// 4. enum choices: --output-format declares choices in --help; zsh should
//    surface them as a parenthesized list and fish as a comma-completion.
const outputFmt = ir.options.find(o => o.flags.includes('--output-format'));
assert.ok(outputFmt && outputFmt.arg && outputFmt.arg.choices, 'fixture has --output-format with choices');
const choices = outputFmt.arg.choices;
for (const c of choices) {
  assert.ok(zsh.includes(c), `zsh missing choice ${c} for --output-format`);
}

// 5. dangerous chars in descriptions: synthetic IR with single-quote, colon,
//    backslash. Generators must produce syntactically valid scripts that
//    zsh -n / bash -n accept. The actual exec is done in CI via syntax checks
//    on the pre-generated completions/, but we at least verify no raw quote
//    leaks here.
const tortureIR = {
  version: 'torture-1',
  options: [
    { flags: ['--quote'], arg: null, description: "she said 'hi' and ran" },
    { flags: ['--colon'], arg: null, description: "key: value : nested" },
    { flags: ['--backslash'], arg: null, description: "path\\to\\thing" },
    { flags: ['--mixed'], arg: { name: 'val', required: true, choices: null }, description: "what's that?: ok" },
  ],
  commands: [],
};
const tortureZsh = generateZsh(tortureIR);
const tortureBash = generateBash(tortureIR);
const tortureFish = generateFish(tortureIR);
// zsh single-quoted strings need ' escaped as '\''. Verify the literal
// description "she said 'hi'" is not embedded raw (which would terminate
// the surrounding single-quoted string mid-line).
assert.ok(
  !tortureZsh.includes("she said 'hi'"),
  'zsh should escape single quotes in descriptions, not embed raw',
);
assert.ok(
  tortureZsh.includes("she said '\\''hi'\\''"),
  'zsh should use POSIX \\\' escape sequence for single quotes',
);
// every flag must still appear in each script (fish uses -l form)
for (const opt of tortureIR.options) {
  assert.ok(tortureZsh.includes(opt.flags[0]), `torture zsh missing ${opt.flags[0]}`);
  assert.ok(tortureBash.includes(opt.flags[0]), `torture bash missing ${opt.flags[0]}`);
  assert.ok(flagInFish(tortureFish, opt.flags[0]), `torture fish missing ${opt.flags[0]}`);
}

// 5b. variadic + mutex: zsh's _arguments parser rejects `'*(--a --b){--a,--b}...'`
//     as "invalid rest argument definition". Generator must emit one line per
//     alias instead. Regression for the v0.2.0 zsh breakage.
const variadicMutexIR = {
  version: 'vm-1',
  options: [
    { flags: ['--allowedTools', '--allowed-tools'], arg: { name: 'tools', variadic: true, required: true, choices: null }, description: 'Comma list' },
  ],
  commands: [],
};
const vmZsh = generateZsh(variadicMutexIR);
assert.doesNotMatch(vmZsh, /'\*\(--/, 'zsh must not combine * variadic marker with ( ) mutex group');
assert.match(vmZsh, /'\*--allowedTools\[/, 'zsh should emit --allowedTools as its own variadic line');
assert.match(vmZsh, /'\*--allowed-tools\[/, 'zsh should emit --allowed-tools as its own variadic line');

// 6. bash: round-trip + COMPREPLY structure
const bash = generateBash(ir);
assert.match(bash, /complete .*-F .*_claude/, 'bash script must register completion');
assert.match(bash, /2\.1\.119/, 'bash script should embed the version');
assert.match(bash, /COMPREPLY/, 'bash script should populate COMPREPLY');
assertFlagsPresent(bash, 'bash', flagInZshOrBash);

// 7. fish: round-trip + per-flag complete lines
const fish = generateFish(ir);
assert.match(fish, /complete -c claude/, 'fish script must use complete -c claude');
assert.match(fish, /2\.1\.119/, 'fish script should embed the version');
for (const cmd of ir.commands) {
  assert.ok(fish.includes(cmd.name), `fish missing subcommand ${cmd.name}`);
}
assertFlagsPresent(fish, 'fish', flagInFish);

console.log('generator tests passed');
