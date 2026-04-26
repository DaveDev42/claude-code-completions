// Generate bash completion from IR.
import { subcommandOverrides } from '../overrides.js';

export function generateBash(ir) {
  const allFlags = ir.options.flatMap(o => o.flags);
  const commandNames = ir.commands.map(c => c.name);
  const enumFlags = ir.options.filter(o => o.arg && o.arg.choices && !o.arg.dynamicSource);
  const dynamicFlags = ir.options.filter(o => o.arg && o.arg.dynamicSource);

  const dynamicCases = dynamicFlags
    .flatMap(o => o.flags.map(f => ({ flag: f, source: o.arg.dynamicSource })))
    .map(({ flag, source }) => {
      const subcmd = source === 'agents' ? 'list-agents' : 'list-sessions';
      // bash compgen can't surface descriptions; take only the first column.
      return `    ${flag})
      COMPREPLY=($(compgen -W "$(\${CLAUDE_COMPLETIONS_BIN:-claude-code-completions} ${subcmd} 2>/dev/null | cut -f1)" -- "$cur"))
      return 0
      ;;`;
    })
    .join('\n');

  const subcommandCases = Object.entries(subcommandOverrides)
    .filter(([, def]) => def.subcommands || def.positional)
    .map(([cmd, def]) => {
      if (def.aliasOf) return '';
      const pattern = Object.entries(subcommandOverrides)
        .filter(([k, v]) => k === cmd || v.aliasOf === cmd)
        .map(([k]) => k)
        .join('|');
      if (def.subcommands) {
        const subs = def.subcommands.map(s => s.name).join(' ');
        return `    ${pattern})
      COMPREPLY=($(compgen -W "${subs}" -- "$cur"))
      return 0
      ;;`;
      }
      if (def.positional) {
        const choices = def.positional.choices.join(' ');
        return `    ${cmd})
      COMPREPLY=($(compgen -W "${choices}" -- "$cur"))
      return 0
      ;;`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  const enumCases = enumFlags
    .map(o => {
      const primary = o.flags.find(f => f.startsWith('--')) || o.flags[0];
      return `    ${primary})
      COMPREPLY=($(compgen -W "${o.arg.choices.join(' ')}" -- "$cur"))
      return 0
      ;;`;
    })
    .join('\n');

  return `# Auto-generated from \`claude --help\` (version: ${ir.version})
# bash completion for claude

_claude_completions() {
  local cur prev words cword
  _init_completion || return

  # Previous word determines enum or dynamic completion
  case "$prev" in
${dynamicCases}
${enumCases}
  esac

  # If we're at position 1 (no subcommand yet), offer commands + flags
  local i
  local subcommand=""
  for ((i=1; i < cword; i++)); do
    case "\${words[i]}" in
      -*) continue ;;
      *) subcommand="\${words[i]}"; break ;;
    esac
  done

  case "$subcommand" in
${subcommandCases}
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${allFlags.join(' ')}" -- "$cur"))
    return 0
  fi

  if [[ -z "$subcommand" ]]; then
    COMPREPLY=($(compgen -W "${commandNames.join(' ')}" -- "$cur"))
    return 0
  fi

  COMPREPLY=($(compgen -f -- "$cur"))
}

complete -F _claude_completions claude
`;
}
