import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html
  }
}));

import { buildSandboxedEmailDoc } from '../utils/sanitize';

describe('buildSandboxedEmailDoc — mode sombre', () => {
  it('applique le fond sombre et corrige le sélecteur universel *', () => {
    const doc = buildSandboxedEmailDoc('<p>Bonjour</p>', false, true);
    expect(doc).toContain('* { box-sizing: border-box; }');
    expect(doc).toContain('background-color: #16191f;');
    expect(doc).toContain('color: #e6edf3;');
  });

  it('neutralise les styles inline clairs et textes sombres en mode sombre', () => {
    const html = '<div style="background-color: #ffffff; color: #1e293b;">Carte claire</div>';
    const doc = buildSandboxedEmailDoc(html, false, true);
    expect(doc).toContain('[style*="background-color: #ffffff"]');
    expect(doc).toContain('[style*="color: #1e293b"]');
    expect(doc).toContain('background-color: #1e242d !important;');
  });
});
