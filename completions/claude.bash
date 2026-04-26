# Auto-generated from `claude --help` (version: 2.1.119 (Claude Code))
# bash completion for claude

_claude_completions() {
  local cur prev words cword
  _init_completion || return

  # Previous word determines enum or dynamic completion
  case "$prev" in
    --agent)
      COMPREPLY=($(compgen -W "$(${CLAUDE_COMPLETIONS_BIN:-claude-code-completions} list-agents 2>/dev/null | cut -f1)" -- "$cur"))
      return 0
      ;;
    -r)
      COMPREPLY=($(compgen -W "$(${CLAUDE_COMPLETIONS_BIN:-claude-code-completions} list-sessions 2>/dev/null | cut -f1)" -- "$cur"))
      return 0
      ;;
    --resume)
      COMPREPLY=($(compgen -W "$(${CLAUDE_COMPLETIONS_BIN:-claude-code-completions} list-sessions 2>/dev/null | cut -f1)" -- "$cur"))
      return 0
      ;;
    --session-id)
      COMPREPLY=($(compgen -W "$(${CLAUDE_COMPLETIONS_BIN:-claude-code-completions} list-sessions 2>/dev/null | cut -f1)" -- "$cur"))
      return 0
      ;;
    --allowedTools)
      COMPREPLY=($(compgen -W "Agent Bash Edit Glob Grep NotebookEdit Read Task TodoWrite WebFetch WebSearch Write" -- "$cur"))
      return 0
      ;;
    --disallowedTools)
      COMPREPLY=($(compgen -W "Agent Bash Edit Glob Grep NotebookEdit Read Task TodoWrite WebFetch WebSearch Write" -- "$cur"))
      return 0
      ;;
    --effort)
      COMPREPLY=($(compgen -W "low medium high max" -- "$cur"))
      return 0
      ;;
    --fallback-model)
      COMPREPLY=($(compgen -W "sonnet opus haiku claude-sonnet-4-6 claude-opus-4-6 claude-haiku-4-5-20251001" -- "$cur"))
      return 0
      ;;
    --input-format)
      COMPREPLY=($(compgen -W "text stream-json" -- "$cur"))
      return 0
      ;;
    --model)
      COMPREPLY=($(compgen -W "sonnet opus haiku claude-sonnet-4-6 claude-opus-4-6 claude-haiku-4-5-20251001" -- "$cur"))
      return 0
      ;;
    --output-format)
      COMPREPLY=($(compgen -W "text json stream-json" -- "$cur"))
      return 0
      ;;
    --permission-mode)
      COMPREPLY=($(compgen -W "acceptEdits auto bypassPermissions default dontAsk plan" -- "$cur"))
      return 0
      ;;
    --setting-sources)
      COMPREPLY=($(compgen -W "user project local" -- "$cur"))
      return 0
      ;;
    --tools)
      COMPREPLY=($(compgen -W "Agent Bash Edit Glob Grep NotebookEdit Read Task TodoWrite WebFetch WebSearch Write" -- "$cur"))
      return 0
      ;;
  esac

  # If we're at position 1 (no subcommand yet), offer commands + flags
  local i
  local subcommand=""
  for ((i=1; i < cword; i++)); do
    case "${words[i]}" in
      -*) continue ;;
      *) subcommand="${words[i]}"; break ;;
    esac
  done

  case "$subcommand" in
    mcp)
      COMPREPLY=($(compgen -W "serve add remove list get" -- "$cur"))
      return 0
      ;;
    plugin|plugins)
      COMPREPLY=($(compgen -W "install uninstall list update" -- "$cur"))
      return 0
      ;;
    auth)
      COMPREPLY=($(compgen -W "login logout status" -- "$cur"))
      return 0
      ;;
    install)
      COMPREPLY=($(compgen -W "stable latest" -- "$cur"))
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--add-dir --agent --agents --allow-dangerously-skip-permissions --allowedTools --allowed-tools --append-system-prompt --bare --betas --brief --chrome -c --continue --dangerously-skip-permissions -d --debug --debug-file --disable-slash-commands --disallowedTools --disallowed-tools --effort --exclude-dynamic-system-prompt-sections --fallback-model --file --fork-session --from-pr -h --help --ide --include-hook-events --include-partial-messages --input-format --json-schema --max-budget-usd --mcp-config --mcp-debug --model -n --name --no-chrome --no-session-persistence --output-format --permission-mode --plugin-dir -p --print --remote-control-session-name-prefix --replay-user-messages -r --resume --session-id --setting-sources --settings --strict-mcp-config --system-prompt --tmux --tools --verbose -v --version -w --worktree" -- "$cur"))
    return 0
  fi

  if [[ -z "$subcommand" ]]; then
    COMPREPLY=($(compgen -W "agents auth auto-mode doctor install mcp plugin setup-token update" -- "$cur"))
    return 0
  fi

  COMPREPLY=($(compgen -f -- "$cur"))
}

complete -F _claude_completions claude
