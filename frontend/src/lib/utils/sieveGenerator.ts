export type SieveField = 'from' | 'to' | 'subject' | 'header' | 'size';
export type SieveOperator = 'contains' | 'is' | 'matches' | 'over' | 'under';
export type SieveActionType = 'fileinto' | 'markRead' | 'star' | 'redirect' | 'reject' | 'stop';

export interface SieveCondition {
  id: string;
  field: SieveField;
  headerName: string;
  operator: SieveOperator;
  value: string;
}

export interface SieveAction {
  id: string;
  type: SieveActionType;
  value: string;
}

export interface SieveRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: 'allof' | 'anyof';
  conditions: SieveCondition[];
  actions: SieveAction[];
}

export interface SieveVacation {
  enabled: boolean;
  days: number;
  subject: string;
  reason: string;
}

export interface SieveTemplate {
  id: string;
  label: string;
  description: string;
  code: string;
}

export const SIEVE_TEMPLATES: SieveTemplate[] = [
  {
    id: 'newsletter',
    label: '📰 Trier les newsletters',
    description: 'Déplace les emails contenant List-Unsubscribe dans Archives',
    code: 'require ["fileinto"];\n\n# @rule: Trier les newsletters\nif header :contains "List-Unsubscribe" "@" {\n    fileinto "Archives";\n    stop;\n}\n'
  },
  {
    id: 'mark-read',
    label: '📭 Notifications auto-lues',
    description: 'Marque comme lus les messages provenant de no-reply',
    code: 'require ["imap4flags"];\n\n# @rule: Notifications automatiques\nif header :contains "From" "no-reply" {\n    addflag "\\\\Seen";\n}\n'
  },
  {
    id: 'vacation',
    label: '🏖️ Répondeur d’absence (Vacances)',
    description: 'Envoie une réponse automatique tous les 7 jours',
    code: 'require ["vacation"];\n\nvacation\n    :days 7\n    :subject "Absence du bureau"\n    "Bonjour, je suis actuellement absent et prendrai connaissance de votre message à mon retour.";\n'
  },
  {
    id: 'forward',
    label: '↪️ Transfert avec copie locale',
    description: 'Transfère les messages urgents tout en les gardant en réception',
    code: 'require ["copy"];\n\n# @rule: Transfert urgent\nif header :contains "Subject" "[URGENT]" {\n    redirect :copy "collegue@mondomaine.fr";\n}\n'
  }
];

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function escapeSieveString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createEmptyRule(prefill?: { from?: string; subject?: string; defaultFolder?: string }): SieveRule {
  const conditions: SieveCondition[] = [];
  if (prefill?.from) {
    conditions.push({ id: uid(), field: 'from', headerName: 'From', operator: 'contains', value: prefill.from });
  } else if (prefill?.subject) {
    conditions.push({ id: uid(), field: 'subject', headerName: 'Subject', operator: 'contains', value: prefill.subject });
  } else {
    conditions.push({ id: uid(), field: 'from', headerName: 'From', operator: 'contains', value: '' });
  }

  return {
    id: uid(),
    name: prefill?.from ? 'Messages de ' + prefill.from : 'Nouvelle règle',
    enabled: true,
    matchType: 'allof',
    conditions,
    actions: [
      {
        id: uid(),
        type: 'fileinto',
        value: prefill?.defaultFolder || 'Archives'
      }
    ]
  };
}

export function compileSieveScript(rules: SieveRule[], vacation: SieveVacation): string {
  const requires = new Set<string>();
  const activeRules = rules.filter((r) => r.enabled && r.conditions.some((c) => c.value.trim() !== ''));

  for (const r of activeRules) {
    for (const a of r.actions) {
      if (a.type === 'fileinto') requires.add('fileinto');
      if (a.type === 'markRead' || a.type === 'star') requires.add('imap4flags');
      if (a.type === 'reject') requires.add('reject');
    }
  }
  if (vacation.enabled && vacation.reason.trim()) {
    requires.add('vacation');
  }

  const lines: string[] = [];
  if (requires.size > 0) {
    const list = Array.from(requires).map((r) => '"' + r + '"').join(', ');
    lines.push('require [' + list + '];', '');
  }

  for (const rule of rules) {
    const validConds = rule.conditions.filter((c) => c.value.trim() !== '');
    if (validConds.length === 0 || rule.actions.length === 0) continue;

    lines.push('# @rule: ' + (rule.name || 'Règle'));
    if (!rule.enabled) {
      lines.push('# (Règle désactivée)');
      continue;
    }

    const testExprs = validConds.map((c) => {
      const val = escapeSieveString(c.value.trim());
      if (c.field === 'size') {
        const op = c.operator === 'under' ? ':under' : ':over';
        const cleanSize = c.value.trim().replace(/[^0-9KMGkmg]/g, '') || '1M';
        return 'size ' + op + ' ' + cleanSize;
      }
      const matchOp = c.operator === 'is' ? ':is' : c.operator === 'matches' ? ':matches' : ':contains';
      if (c.field === 'from') return 'header ' + matchOp + ' "From" "' + val + '"';
      if (c.field === 'to') return 'header ' + matchOp + ' ["To", "Cc"] "' + val + '"';
      if (c.field === 'subject') return 'header ' + matchOp + ' "Subject" "' + val + '"';
      const hdr = escapeSieveString(c.headerName.trim() || 'X-Custom');
      return 'header ' + matchOp + ' "' + hdr + '" "' + val + '"';
    });

    const conditionBlock =
      testExprs.length === 1
        ? testExprs[0]
        : rule.matchType + ' (\n    ' + testExprs.join(',\n    ') + '\n)';

    lines.push('if ' + conditionBlock + ' {');
    for (const act of rule.actions) {
      if (act.type === 'fileinto' && act.value.trim()) {
        lines.push('    fileinto "' + escapeSieveString(act.value.trim()) + '";');
      } else if (act.type === 'markRead') {
        lines.push('    addflag "\\\\Seen";');
      } else if (act.type === 'star') {
        lines.push('    addflag "\\\\Flagged";');
      } else if (act.type === 'redirect' && act.value.trim()) {
        lines.push('    redirect "' + escapeSieveString(act.value.trim()) + '";');
      } else if (act.type === 'reject' && act.value.trim()) {
        lines.push('    reject "' + escapeSieveString(act.value.trim()) + '";');
      } else if (act.type === 'stop') {
        lines.push('    stop;');
      }
    }
    lines.push('}', '');
  }

  if (vacation.enabled && vacation.reason.trim()) {
    lines.push('# @vacation');
    lines.push('vacation');
    lines.push('    :days ' + Math.max(1, Number(vacation.days) || 7));
    if (vacation.subject.trim()) {
      lines.push('    :subject "' + escapeSieveString(vacation.subject.trim()) + '"');
    }
    lines.push('    "' + escapeSieveString(vacation.reason.trim()) + '";', '');
  }

  return lines.join('\n').trim() + (lines.length ? '\n' : '');
}

export function parseSieveToVisual(code: string): {
  rules: SieveRule[];
  vacation: SieveVacation;
  hasAdvancedCode: boolean;
} {
  const rules: SieveRule[] = [];
  const vacation: SieveVacation = {
    enabled: false,
    days: 7,
    subject: 'Absence du bureau',
    reason: ''
  };

  const trimmed = code.trim();
  if (!trimmed) return { rules, vacation, hasAdvancedCode: false };

  const hasAdvancedCode = /\b(elsif|else|envelope|address|body|regex|variables|set\s+")\b/i.test(trimmed);

  const vacMatch = trimmed.match(/vacation\s*(?::days\s+(\d+)\s*)?(?::subject\s+"([^"]*)"\s*)?"((?:[^"\\]|\\.)*)"\s*;/s);
  if (vacMatch) {
    vacation.enabled = true;
    vacation.days = Number(vacMatch[1] || 7);
    if (vacMatch[2] !== undefined) vacation.subject = vacMatch[2].replace(/\\"/g, '"');
    vacation.reason = (vacMatch[3] || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  const blockRegex = /(?:^|\n)(?:#\s*@rule:\s*([^\n]+)\n)?if\s+([\s\S]*?)\s*\{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(trimmed)) !== null) {
    const ruleName = (m[1] || 'Règle ' + (rules.length + 1)).trim();
    const condRaw = m[2].trim();
    const bodyRaw = m[3].trim();

    const matchType: 'allof' | 'anyof' = condRaw.startsWith('anyof') ? 'anyof' : 'allof';
    const conditions: SieveCondition[] = [];

    const hdrRegex = /header\s+(:contains|:is|:matches)\s+(\[[^\]]+\]|"[^"]+")\s+"((?:[^"\\]|\\.)*)"/g;
    let hm: RegExpExecArray | null;
    while ((hm = hdrRegex.exec(condRaw)) !== null) {
      const op = hm[1].slice(1) as SieveOperator;
      const hdrSpec = hm[2];
      const val = hm[3].replace(/\\"/g, '"');
      let field: SieveField = 'header';
      let headerName = hdrSpec.replace(/"/g, '');
      if (hdrSpec === '"From"') field = 'from';
      else if (hdrSpec.includes('"To"')) field = 'to';
      else if (hdrSpec === '"Subject"') field = 'subject';
      conditions.push({ id: uid(), field, headerName, operator: op, value: val });
    }

    const sizeRegex = /size\s+(:over|:under)\s+([0-9KMGkmg]+)/g;
    let sm: RegExpExecArray | null;
    while ((sm = sizeRegex.exec(condRaw)) !== null) {
      conditions.push({
        id: uid(),
        field: 'size',
        headerName: 'Size',
        operator: sm[1] === ':under' ? 'under' : 'over',
        value: sm[2]
      });
    }

    const actions: SieveAction[] = [];
    const fileMatch = bodyRaw.match(/fileinto\s+"((?:[^"\\]|\\.)*)"\s*;/);
    if (fileMatch) actions.push({ id: uid(), type: 'fileinto', value: fileMatch[1].replace(/\\"/g, '"') });
    if (/addflag\s+"\\\\Seen"\s*;/.test(bodyRaw)) actions.push({ id: uid(), type: 'markRead', value: '' });
    if (/addflag\s+"\\\\Flagged"\s*;/.test(bodyRaw)) actions.push({ id: uid(), type: 'star', value: '' });
    const redirMatch = bodyRaw.match(/redirect\s+"((?:[^"\\]|\\.)*)"\s*;/);
    if (redirMatch) actions.push({ id: uid(), type: 'redirect', value: redirMatch[1].replace(/\\"/g, '"') });
    const rejMatch = bodyRaw.match(/reject\s+"((?:[^"\\]|\\.)*)"\s*;/);
    if (rejMatch) actions.push({ id: uid(), type: 'reject', value: rejMatch[1].replace(/\\"/g, '"') });
    if (/\bstop\s*;/.test(bodyRaw)) actions.push({ id: uid(), type: 'stop', value: '' });

    if (conditions.length > 0 && actions.length > 0) {
      rules.push({ id: uid(), name: ruleName, enabled: true, matchType, conditions, actions });
    }
  }

  return { rules, vacation, hasAdvancedCode };
}

export function highlightSieveCode(code: string): string {
  const esc = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return esc.replace(
    /(#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(require|if|elsif|else|allof|anyof|not|true|false)\b|\b(fileinto|redirect|keep|discard|stop|addflag|removeflag|setflag|vacation|reject)\b|\b(header|address|envelope|size|exists|body)\b|(:(?:contains|is|matches|regex|over|under|days|subject|from|addresses|copy))\b|\b(\d+[KMGkmg]?)\b/g,
    (match, comment, str, kw, action, test, tag, num) => {
      if (comment) return '<span class="text-slate-500 italic">' + comment + '</span>';
      if (str) return '<span class="text-amber-300">' + str + '</span>';
      if (kw) return '<span class="font-semibold text-purple-400">' + kw + '</span>';
      if (action) return '<span class="font-semibold text-[#48B17F]">' + action + '</span>';
      if (test) return '<span class="text-sky-400">' + test + '</span>';
      if (tag) return '<span class="text-teal-300">' + tag + '</span>';
      if (num) return '<span class="text-orange-300">' + num + '</span>';
      return match;
    }
  );
}
