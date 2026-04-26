// Audit overrides.js against the parsed IR from `claude --help`.
// Detects three classes of drift that would silently make completions wrong:
//   1. enum override for an option that no longer exists in --help
//   2. enum override that disagrees with the choices --help itself declares
//   3. subcommand override for a command no longer in --help
// Returns { issues: [...], ok: boolean }. Each issue has { severity, kind, message }.

import { enumOverrides, subcommandOverrides } from './overrides.js';

export function auditOverrides(ir) {
  const issues = [];
  const optionByFlag = new Map();
  for (const opt of ir.options) for (const flag of opt.flags) optionByFlag.set(flag, opt);

  for (const flag of Object.keys(enumOverrides)) {
    const opt = optionByFlag.get(flag);
    if (!opt) {
      issues.push({
        severity: 'warn',
        kind: 'orphan-enum-override',
        message: `enumOverrides has '${flag}' but --help does not list it (option may have been removed or renamed)`,
      });
      continue;
    }
    const declared = opt.arg && opt.arg.choices;
    if (declared && declared.length > 0) {
      const overrideSet = new Set(enumOverrides[flag]);
      const missing = declared.filter(c => !overrideSet.has(c));
      const extra = enumOverrides[flag].filter(c => !declared.includes(c));
      if (missing.length > 0) {
        issues.push({
          severity: 'error',
          kind: 'enum-missing',
          message: `enumOverrides['${flag}'] is missing values declared by --help: ${missing.join(', ')}`,
        });
      }
      if (extra.length > 0) {
        issues.push({
          severity: 'info',
          kind: 'enum-extra',
          message: `enumOverrides['${flag}'] has values not in --help (likely intentional supplements): ${extra.join(', ')}`,
        });
      }
    }
  }

  const commandNames = new Set(ir.commands.map(c => c.name));
  for (const cmd of ir.commands) for (const a of (cmd.aliases || [])) commandNames.add(a);
  for (const name of Object.keys(subcommandOverrides)) {
    if (!commandNames.has(name)) {
      issues.push({
        severity: 'warn',
        kind: 'orphan-subcommand-override',
        message: `subcommandOverrides has '${name}' but --help does not list it as a top-level command`,
      });
    }
  }

  const ok = !issues.some(i => i.severity === 'error');
  return { issues, ok };
}

export function formatAuditReport({ issues, ok }) {
  if (issues.length === 0) return 'overrides audit: clean (0 issues)';
  const lines = [`overrides audit: ${issues.length} issue(s), ${ok ? 'no errors' : 'ERRORS PRESENT'}`];
  for (const i of issues) lines.push(`  [${i.severity}] ${i.kind}: ${i.message}`);
  return lines.join('\n');
}
