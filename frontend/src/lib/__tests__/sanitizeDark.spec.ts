import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html
  }
}));

import { buildSandboxedEmailDoc } from '../utils/sanitize';

describe('buildSandboxedEmailDoc — mode sombre avancé', () => {
  it('applique le fond sombre et le sélecteur universel *', () => {
    const doc = buildSandboxedEmailDoc('<p>Bonjour</p>', false, true);
    expect(doc).toContain('* { box-sizing: border-box; }');
    expect(doc).toContain('background-color: #16191f;');
    expect(doc).toContain('color: #e6edf3;');
  });

  it('assombrit les fonds clairs exprimés en rgb(), rgba() et hsl() en mode sombre', () => {
    const html = [
      '<table style="background-color: rgb(255, 255, 255);"><tr>',
      '<td style="background: rgba(248, 250, 252, 0.95);">Cellule</td>',
      '<td style="background-color: hsl(210, 40%, 96%);">HSL</td>',
      '<td style="background-color: rgb(20, 80, 120);">Badge sombre conservé</td>',
      '</tr></table>'
    ].join('');
    const doc = buildSandboxedEmailDoc(html, false, true);
    expect(doc).toContain('background-color: #1e242d;');
    expect(doc).toContain('background: #1e242d;');
    expect(doc).toContain('background-color: rgb(20, 80, 120);');
  });

  it('préserve les styles inline intacts en mode clair (isDark = false)', () => {
    const html = '<div style="background-color: rgb(255, 255, 255);">Clair</div>';
    const doc = buildSandboxedEmailDoc(html, false, false);
    expect(doc).toContain('background-color: rgb(255, 255, 255);');
  });
});
