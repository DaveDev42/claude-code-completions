// Generate zsh completion from IR.
import { subcommandOverrides, flagActionOverrides, argActionHints } from '../overrides.js';

const zshEscape = (s) =>
  s.replace(/\\/g, '\\\\')
   .replace(/'/g, "'\\''")
   .replace(/\[/g, '\\[')
   .replace(/\]/g, '\\]')
   .replace(/:/g, '\\:');

function actionForFlag(flags, arg) {
  if (!arg) return '';
  const primary = flags.find(f => f.startsWith('--')) || flags[0];
  if (arg.choices && arg.choices.length > 0) {
    return `:${arg.name}:(${arg.choices.join(' ')})`;
  }
  const override = flagActionOverrides[primary];
  if (override === 'file') return `:${arg.name}:_files`;
  if (override === 'directory') return `:${arg.name}:_directories`;
  for (const [hint, kind] of Object.entries(argActionHints)) {
    if (arg.name.toLowerCase().includes(hint)) {
      return kind === 'file' ? `:${arg.name}:_files` : `:${arg.name}:_directories`;
    }
  }
  return `:${arg.name}:`;
}

function formatOption(opt) {
  const { flags, arg, description } = opt;
  const desc = zshEscape(description);
  const variadic = arg && arg.variadic ? '*' : '';
  // Optional arg = arg spec used [..] → zsh "::" means optional
  const optional = arg && !arg.required;
  let action = actionForFlag(flags, arg);
  if (optional && action) {
    // Make it optional: prefix extra ':'
    action = ':' + action.replace(/^:/, ':');
  }

  if (flags.length === 1) {
    return `  '${variadic}${flags[0]}[${desc}]${action}'`;
  }
  // Mutex group: (-c --continue){-c,--continue}'[desc]action'
  const group = `(${flags.join(' ')})`;
  const brace = `{${flags.join(',')}}`;
  return `  '${variadic}${group}'${brace}'[${desc}]${action}'`;
}

function formatCommand(cmd) {
  const names = [cmd.name, ...cmd.aliases];
  const desc = zshEscape(cmd.description);
  return names.map(n => `  '${n}:${desc}'`).join('\n');
}

function buildSubcommandCases() {
  const cases = [];
  for (const [cmd, def] of Object.entries(subcommandOverrides)) {
    if (def.aliasOf) continue;
    if (def.subcommands) {
      const subs = def.subcommands
        .map(s => `          '${s.name}:${zshEscape(s.description)}'`)
        .join('\n');
      const pattern = Object.entries(subcommandOverrides)
        .filter(([k, v]) => k === cmd || v.aliasOf === cmd)
        .map(([k]) => k)
        .join('|');
      cases.push(`      ${pattern})
        local -a ${cmd}_subcommands
        ${cmd}_subcommands=(
${subs}
        )
        _describe -t ${cmd}-commands '${cmd} subcommand' ${cmd}_subcommands && ret=0
        ;;`);
    } else if (def.positional) {
      const choices = def.positional.choices.join(' ');
      cases.push(`      ${cmd})
        _arguments '1:${def.positional.name}:(${choices})' && ret=0
        ;;`);
    }
  }
  return cases.join('\n');
}

export function generateZsh(ir) {
  const lines = [];
  lines.push('#compdef claude');
  lines.push(`# Auto-generated from \`claude --help\` (version: ${ir.version})`);
  lines.push('# Do not edit manually — regenerate via claude-code-completions.');
  lines.push('');
  lines.push('local curcontext="$curcontext" state line ret=1');
  lines.push('typeset -A opt_args');
  lines.push('');
  lines.push('local -a commands');
  lines.push('commands=(');
  lines.push(ir.commands.map(formatCommand).join('\n'));
  lines.push(')');
  lines.push('');
  lines.push('local -a global_opts');
  lines.push('global_opts=(');
  lines.push(ir.options.map(formatOption).join('\n'));
  lines.push(')');
  lines.push('');
  lines.push('_arguments -C \\');
  lines.push('  $global_opts \\');
  lines.push("  '1: :->command' \\");
  lines.push("  '*::arg:->args' && ret=0");
  lines.push('');
  lines.push('case $state in');
  lines.push('  command)');
  lines.push("    _describe -t commands 'claude command' commands && ret=0");
  lines.push('    ;;');
  lines.push('  args)');
  lines.push('    case $line[1] in');
  lines.push(buildSubcommandCases());
  lines.push('      *)');
  lines.push('        _default && ret=0');
  lines.push('        ;;');
  lines.push('    esac');
  lines.push('    ;;');
  lines.push('esac');
  lines.push('');
  lines.push('return ret');
  return lines.join('\n') + '\n';
}
