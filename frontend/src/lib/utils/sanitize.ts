import DOMPurify from 'dompurify';

export function buildSandboxedEmailDoc(rawHtml: string, allowRemoteImages = false): string {
  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick']
  });

  const imgPolicy = allowRemoteImages ? "img-src data: https: http:;" : "img-src data:;";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; ${imgPolicy}">
<base target="_blank">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; background: transparent; margin: 0; line-height: 1.6; word-wrap: break-word; }
  a { color: #48B17F; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 2px solid #334155; margin-left: 0; padding-left: 1rem; color: #94a3b8; }
</style>
</head>
<body>${clean}</body>
</html>`;
}
