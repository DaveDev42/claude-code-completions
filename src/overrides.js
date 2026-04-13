// Manual overrides for things that can't be reliably parsed from `claude --help`.
// Update this file when Claude Code adds new models, permission modes, or subcommand options.

export const enumOverrides = {
  '--model': ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  '--fallback-model': ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  '--effort': ['low', 'medium', 'high', 'max'],
  '--permission-mode': ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan'],
  '--output-format': ['text', 'json', 'stream-json'],
  '--input-format': ['text', 'stream-json'],
  '--setting-sources': ['user', 'project', 'local'],
};

// Subcommands that aren't captured well by top-level --help parsing.
// Shape: { commandName: { subcommands: [{ name, description }], options: [...] } }
export const subcommandOverrides = {
  mcp: {
    subcommands: [
      { name: 'serve', description: 'Start MCP server' },
      { name: 'add', description: 'Add an MCP server' },
      { name: 'remove', description: 'Remove an MCP server' },
      { name: 'list', description: 'List configured MCP servers' },
      { name: 'get', description: 'Get details of an MCP server' },
    ],
  },
  plugin: {
    subcommands: [
      { name: 'install', description: 'Install a plugin' },
      { name: 'uninstall', description: 'Uninstall a plugin' },
      { name: 'list', description: 'List installed plugins' },
      { name: 'update', description: 'Update plugins' },
    ],
  },
  plugins: { aliasOf: 'plugin' },
  auth: {
    subcommands: [
      { name: 'login', description: 'Log in to Claude' },
      { name: 'logout', description: 'Log out' },
      { name: 'status', description: 'Check authentication status' },
    ],
  },
  install: {
    positional: { name: 'target', choices: ['stable', 'latest'] },
  },
};

// Arg-name hints for generic action inference.
// If the arg pattern contains one of these substrings, use the corresponding action.
export const argActionHints = {
  file: 'file',
  path: 'file',
  director: 'directory',
  dir: 'directory',
};

// Per-flag explicit action overrides (wins over hints).
export const flagActionOverrides = {
  '--add-dir': 'directory',
  '--plugin-dir': 'directory',
  '--debug-file': 'file',
  '--settings': 'file',
  '--mcp-config': 'file',
};
