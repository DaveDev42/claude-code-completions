// Generate fish completion from IR.
import { subcommandOverrides } from '../overrides.js';

const fishEscape = (s) => s.replace(/'/g, "\\'").replace(/\n/g, ' ');

export function generateFish(ir) {
  const lines = [];
  lines.push(`# Auto-generated from \`claude --help\` (version: ${ir.version})`);
  lines.push('# fish completion for claude');
  lines.push('');

  const commandNames = ir.commands.map(c => c.name);
  const subcommandCmds = Object.keys(subcommandOverrides).filter(k => !subcommandOverrides[k].aliasOf);

  // Disable file completion when no subcommand given
  lines.push(`complete -c claude -n "__fish_use_subcommand" -f`);

  // Top-level commands
  for (const cmd of ir.commands) {
    lines.push(
      `complete -c claude -n "__fish_use_subcommand" -a "${cmd.name}" -d '${fishEscape(cmd.description)}'`
    );
    for (const alias of cmd.aliases) {
      lines.push(
        `complete -c claude -n "__fish_use_subcommand" -a "${alias}" -d '${fishEscape(cmd.description)}'`
      );
    }
  }

  // Global options
  for (const opt of ir.options) {
    const desc = fishEscape(opt.description).slice(0, 200);
    const short = opt.flags.find(f => /^-[^-]$/.test(f));
    const long = opt.flags.find(f => /^--/.test(f));
    const parts = ['complete', '-c', 'claude'];
    if (short) parts.push('-s', short.slice(1));
    if (long) parts.push('-l', long.slice(2));
    if (opt.arg) {
      parts.push('-r');
      if (opt.arg.choices) {
        parts.push('-a', `"${opt.arg.choices.join(' ')}"`);
      }
    }
    parts.push('-d', `'${desc}'`);
    lines.push(parts.join(' '));
  }

  // Subcommand-specific completions
  for (const [cmd, def] of Object.entries(subcommandOverrides)) {
    if (def.aliasOf) continue;
    if (def.subcommands) {
      for (const sub of def.subcommands) {
        lines.push(
          `complete -c claude -n "__fish_seen_subcommand_from ${cmd}" -a "${sub.name}" -d '${fishEscape(sub.description)}'`
        );
      }
    }
    if (def.positional) {
      for (const choice of def.positional.choices) {
        lines.push(
          `complete -c claude -n "__fish_seen_subcommand_from ${cmd}" -a "${choice}"`
        );
      }
    }
  }

  return lines.join('\n') + '\n';
}
