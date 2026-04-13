// Parse `claude --help` output into an intermediate representation (IR).
//
// IR shape:
// {
//   version: "2.1.104",
//   options: [
//     { flags: ["-c", "--continue"], arg: null, description: "..." },
//     { flags: ["--model"], arg: { name: "model", required: true, variadic: false, choices: [...] }, description: "..." }
//   ],
//   commands: [{ name: "mcp", aliases: [], description: "..." }]
// }

import { enumOverrides } from './overrides.js';

export function parseHelp(helpText, version = 'unknown') {
  const options = parseOptionsSection(helpText);
  const commands = parseCommandsSection(helpText);
  return { version, options, commands };
}

function extractSection(text, startRe, endRe) {
  const lines = text.split('\n');
  const result = [];
  let inside = false;
  for (const line of lines) {
    if (startRe.test(line)) { inside = true; continue; }
    if (inside && endRe.test(line)) break;
    if (inside) result.push(line);
  }
  return result;
}

function parseOptionsSection(text) {
  const lines = extractSection(text, /^Options:/, /^Commands:/);
  const entries = mergeWrappedEntries(lines);
  return entries.map(parseOptionEntry).filter(Boolean);
}

function parseCommandsSection(text) {
  const lines = extractSection(text, /^Commands:/, /^$/);
  const entries = mergeWrappedEntries(lines);
  return entries.map(parseCommandEntry).filter(Boolean);
}

// Commander wraps long descriptions onto continuation lines indented past the column
// where descriptions start. An entry starts with "  -" (option) or "  word" (command),
// and continuation lines are indented deeper without that leading flag/command token.
function mergeWrappedEntries(lines) {
  const entries = [];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    // An entry line begins with exactly 2 spaces followed by a non-space
    const isEntryStart = /^ {2}\S/.test(line);
    if (isEntryStart) {
      if (current) entries.push(current);
      current = line;
    } else if (current) {
      current += ' ' + line.trim();
    }
  }
  if (current) entries.push(current);
  return entries;
}

// Option entry formats:
//   "  --flag  description"
//   "  --flag <arg>  description"
//   "  -x, --flag  description"
//   "  -d, --debug [filter]  description"
//   "  --allowedTools, --allowed-tools <tools...>  description"
//   "  -w, --worktree [name]  description"
function parseOptionEntry(entry) {
  // Separate spec (flags + arg) from description using 2+ spaces as delimiter.
  // But args can contain spaces? commander doesn't do that. Safe to split on first 2+ space run
  // AFTER the flag spec. The flag spec ends at the first " " followed by description text.
  // Strategy: find position of first "  " (two spaces) not inside <...> or [...].
  const trimmed = entry.replace(/^ {2}/, '');
  const split = splitSpecAndDesc(trimmed);
  if (!split) return null;
  const { spec, description } = split;

  // Extract arg pattern (trailing <...> or [...])
  let argSpec = null;
  let flagSpec = spec;
  const argMatch = spec.match(/^(.*?)\s+([<\[].+[>\]])\s*$/);
  if (argMatch) {
    flagSpec = argMatch[1];
    argSpec = argMatch[2];
  }

  // Flags: comma-separated
  const flags = flagSpec.split(',').map(f => f.trim()).filter(Boolean);
  if (flags.length === 0) return null;

  let arg = null;
  if (argSpec) {
    const required = argSpec.startsWith('<');
    const inner = argSpec.slice(1, -1);
    const variadic = inner.endsWith('...');
    const name = inner.replace(/\.\.\.$/, '');
    const primary = flags.find(f => f.startsWith('--')) || flags[0];
    const choices = enumOverrides[primary] || extractChoicesFromDescription(description);
    arg = { name, required, variadic, choices };
  }

  return { flags, arg, description: description.trim() };
}

// Many commander descriptions include '(choices: "a", "b", "c")'.
function extractChoicesFromDescription(desc) {
  const m = desc.match(/\(choices:\s*((?:"[^"]+",?\s*)+)\)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}

// Split "spec  description" where spec may contain single spaces.
// Delimiter is 2+ spaces outside of <...>/[...].
function splitSpecAndDesc(line) {
  let depth = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (c === '<' || c === '[') depth++;
    else if (c === '>' || c === ']') depth--;
    else if (depth === 0 && c === ' ' && line[i + 1] === ' ') {
      return {
        spec: line.slice(0, i).trimEnd(),
        description: line.slice(i).trim(),
      };
    }
  }
  return { spec: line.trim(), description: '' };
}

// Command entry formats:
//   "  agents [options]  List configured agents"
//   "  plugin|plugins  Manage Claude Code plugins"
//   "  install [options] [target]  Install Claude Code native build. ..."
function parseCommandEntry(entry) {
  const trimmed = entry.replace(/^ {2}/, '');
  const split = splitSpecAndDesc(trimmed);
  if (!split) return null;
  const { spec, description } = split;
  // spec example: "plugin|plugins" or "install [options] [target]"
  const nameToken = spec.split(/\s+/)[0];
  const parts = nameToken.split('|');
  const name = parts[0];
  const aliases = parts.slice(1);
  return { name, aliases, description };
}
