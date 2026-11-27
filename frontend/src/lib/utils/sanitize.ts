import DOMPurify from 'dompurify';

function darkenLightInlineColors(html: string): string {
  return html.replace(
    /style\s*=\s*(["'])(.*?)\1/gi,
    (_full, quote: string, styleBody: string) => {
      let updated = styleBody.replace(
        /(background(?:-color)?\s*:\s*)(rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\))/gi,
        (m, prop: string, _fn: string, rStr: string, gStr: string, bStr: string, aStr?: string) => {
          const r = Number(rStr), g = Number(gStr), b = Number(bStr);
          const alpha = aStr !== undefined ? Number(aStr) : 1;
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (alpha > 0.2 && luminance > 185) {
            return `${prop}#1e242d`;
          }
          return m;
        }
      );
      updated = updated.replace(
        /(background(?:-color)?\s*:\s*)(hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*(\d{1,3})%(?:\s*,\s*[\d.]+)?\s*\))/gi,
        (m, prop: string, _fn: string, lStr: string) => {
          if (Number(lStr) > 75) {
            return `${prop}#1e242d`;
          }
          return m;
        }
      );
      return `style=${quote}${updated}${quote}`;
    }
  );
}

export function buildSandboxedEmailDoc(
  rawHtml: string,
  allowRemoteImages = false,
  isDark = true
): string {
  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick']
  });

  const imgPolicy = allowRemoteImages ? "img-src data: https: http:;" : "img-src data:;";

  const themeCss = isDark
    ? `
  html, body {
    color: #e6edf3;
    background-color: #16191f;
  }
  body > div, body > table, body > section, body > article,
  td, th, div, p, span, li, section, article, header, footer {
    background-color: transparent !important;
  }
  [style*="color: #fff"], [style*="color:#fff"],
  [style*="color: #ffffff"], [style*="color:#ffffff"],
  [style*="color: white"], [style*="color:white"] {
    color: #e6edf3 !important;
  }
  [style*="color: #000"], [style*="color:#000"],
  [style*="color: #000000"], [style*="color:#000000"],
  [style*="color: #111"], [style*="color:#111"],
  [style*="color: #1e293b"], [style*="color:#1e293b"],
  [style*="color: #334155"], [style*="color:#334155"],
  [style*="color: black"], [style*="color:black"] {
    color: #e6edf3 !important;
  }
  [bgcolor="#fff"], [bgcolor="#ffffff"], [bgcolor="#f8fafc"], [bgcolor="#f1f5f9"], [bgcolor="white"],
  [style*="background-color: #fff"], [style*="background-color:#fff"],
  [style*="background-color: #ffffff"], [style*="background-color:#ffffff"],
  [style*="background-color: #f8fafc"], [style*="background-color:#f8fafc"],
  [style*="background-color: #f1f5f9"], [style*="background-color:#f1f5f9"],
  [style*="background-color: white"], [style*="background-color:white"],
  [style*="background:#fff"], [style*="background: #fff"],
  [style*="background:#ffffff"], [style*="background: #ffffff"],
  [style*="background: white"], [style*="background:white"] {
    background-color: #1e242d !important;
    color: #e6edf3 !important;
  }
  table, td, th {
    border-color: #2e3744 !important;
  }
  pre, code {
    background-color: #11151b !important;
    color: #e6edf3 !important;
  }
  a { color: #58c490; }
  blockquote { border-left: 2px solid #334155; margin-left: 0; padding-left: 1rem; color: #9aa5b4; }
  hr { border-color: #2b313c; }
`
    : `
  html, body {
    color: #1e293b;
    background-color: #ffffff;
  }
  a { color: #1f7a52; }
  blockquote { border-left: 2px solid #cbd5e1; margin-left: 0; padding-left: 1rem; color: #475569; }
`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; ${imgPolicy}">
<base target="_blank">
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 4px; line-height: 1.6; word-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  ${themeCss}
</style>
</head>
<body>${isDark ? darkenLightInlineColors(clean) : clean}</body>
</html>`;
}
