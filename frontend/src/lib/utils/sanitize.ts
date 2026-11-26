import DOMPurify from 'dompurify';

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
<body>${clean}</body>
</html>`;
}
