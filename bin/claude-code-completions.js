#!/usr/bin/env node
// CLI entrypoint.
// Usage:
//   claude-code-completions generate --shell zsh [--out DIR] [--help-file FILE]
//   claude-code-completions generate --all --out DIR
//   claude-code-completions parse [--help-file FILE]   # prints IR as JSON

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseHelp } from '../src/parse.js';
import { generateZsh } from '../src/generators/zsh.js';
import { generateBash } from '../src/generators/bash.js';
import { generateFish } from '../src/generators/fish.js';

const GENERATORS = {
  zsh: { gen: generateZsh, filename: '_claude' },
  bash: { gen: generateBash, filename: 'claude.bash' },
  fish: { gen: generateFish, filename: 'claude.fish' },
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else { args[key] = true; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function getHelpText(opts) {
  if (opts['help-file']) {
    return readFileSync(opts['help-file'], 'utf8');
  }
  try {
    return execFileSync('claude', ['--help'], { encoding: 'utf8' });
  } catch (err) {
    console.error('Failed to run `claude --help`:', err.message);
    process.exit(1);
  }
}

function getVersion(opts) {
  if (opts['version']) return opts['version'];
  try {
    return execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function cmdGenerate(opts) {
  const help = getHelpText(opts);
  const version = getVersion(opts);
  const ir = parseHelp(help, version);

  const shells = opts.all ? Object.keys(GENERATORS) : [opts.shell || 'zsh'];
  const outDir = opts.out ? resolve(opts.out) : null;

  for (const shell of shells) {
    const g = GENERATORS[shell];
    if (!g) { console.error(`Unknown shell: ${shell}`); process.exit(2); }
    const output = g.gen(ir);
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      const path = resolve(outDir, g.filename);
      writeFileSync(path, output);
      console.error(`wrote ${path}`);
    } else {
      process.stdout.write(output);
    }
  }
}

function cmdParse(opts) {
  const help = getHelpText(opts);
  const version = getVersion(opts);
  const ir = parseHelp(help, version);
  process.stdout.write(JSON.stringify(ir, null, 2) + '\n');
}

function cmdHelp() {
  console.log(`claude-code-completions - Generate shell completions for Claude Code CLI

Usage:
  claude-code-completions generate --shell <zsh|bash|fish> [--out DIR]
  claude-code-completions generate --all --out DIR
  claude-code-completions parse [--help-file FILE]

Options:
  --shell      Target shell (zsh, bash, fish). Default: zsh
  --all        Generate for all supported shells
  --out DIR    Output directory. If omitted, writes to stdout
  --help-file  Use a saved \`claude --help\` output file instead of running claude
  --version    Override version string (for testing)
`);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

switch (cmd) {
  case 'generate': cmdGenerate(args); break;
  case 'parse': cmdParse(args); break;
  case 'help':
  case undefined:
    cmdHelp();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    cmdHelp();
    process.exit(2);
}
