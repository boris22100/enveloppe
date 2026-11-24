import { describe, it, expect } from 'vitest';
import {
  compileSieveScript,
  createEmptyRule,
  parseSieveToVisual
} from '../utils/sieveGenerator';

describe('sieveGenerator', () => {
  it('compile et re-parse une règle visuelle simple', () => {
    const rule = createEmptyRule();
    rule.name = 'Tri factures';
    rule.conditions[0].field = 'subject';
    rule.conditions[0].operator = 'contains';
    rule.conditions[0].value = 'Facture';
    rule.actions[0].type = 'fileinto';
    rule.actions[0].value = 'Comptabilite';

    const code = compileSieveScript([rule], {
      enabled: false,
      days: 7,
      subject: 'Absence',
      reason: ''
    });

    expect(code).toContain('require ["fileinto"]');
    expect(code).toContain('header :contains "Subject" "Facture"');
    expect(code).toContain('fileinto "Comptabilite"');

    const parsed = parseSieveToVisual(code);
    expect(parsed.rules.length).toBe(1);
    expect(parsed.rules[0].actions[0].value).toBe('Comptabilite');
  });

  it('génère une extension vacation quand activée', () => {
    const code = compileSieveScript([], {
      enabled: true,
      days: 5,
      subject: 'Congés',
      reason: 'De retour lundi.'
    });

    expect(code).toContain('vacation');
    expect(code).toContain(':days 5');
    expect(code).toContain('Congés');
  });
});
