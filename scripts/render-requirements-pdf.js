const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MD = path.resolve(__dirname, '..', 'docs', 'SYSTEM_REQUIREMENTS.md');
const OUT = path.resolve(__dirname, '..', 'docs', 'SYSTEM_REQUIREMENTS.pdf');

const md = fs.readFileSync(MD, 'utf8');

// Render markdown -> HTML with a clean, print-focused stylesheet.
// We use a small inline markdown renderer so we don't depend on any npm markdown lib.
function mdToHtml(md) {
  let html = md
    // escape
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headings
    .replace(/^## (.+)$/gm, '<h2 class="sec">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="sub">$1</h3>')
    .replace(/^# (.+)$/gm, '<h1 class="title">$1</h1>')
    // code blocks (triple backtick) - keep as pre; render ascii art blocks as-is
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      // generic monospace block; ascii diagrams we keep wide
      return `<pre class="code${lang === 'mermaid' ? ' mermaid' : ''}">${code.trim()}</pre>`;
    })
    // inline code
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    // tables
    .replace(/^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)*)/gm, (_, head, _sep, body) => {
      const rows = [head, body].join('\n').trim().split('\n').map(line =>
        line.trim().slice(1, -1).split('|').map(c => c.trim()).map(c => `<td>${c.replace(/\n/g,'<br>')}</td>`).join('')
      );
      return `<table class="tbl"><thead><tr>${rows[0]}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r}</tr>`).join('')}</tbody></table>`;
    })
    // blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="tip">$1</blockquote>')
    // ul
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // ol
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // hr
    .replace(/^---$/gm, '<hr class="rule">')
    // paragraphs: split on double newline, wrap runs of li in ul/ol, wrap rest in p
    ;

  // Wrap consecutive <li> in <ul> or <ol> based on leading numbering
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, (block) => {
    const lis = block.match(/<li>/g);
    if (!lis) return block;
    const firstLi = block.match(/<li>(.*?)<\/li>/)[1];
    const isOl = /^\d+\./.test(firstLi.trim()) || /^[^a-z]/.test(firstLi.trim()) && /\d+\./.test(firstLi);
    // detect ol: if the original markdown line started with a number
    const ol = block.includes('<li>1.') || block.match(/<li>\d+\./);
    return ol ? `<ol class="list">${block}</ol>` : `<ul class="list">${block}</ol>`;
  });
  // fix ol closing tags that became ul
  html = html.replace(/<ul class="list">(.*?)<\/ol>/g, '<ol class="list">$1</ol>');

  // wrap bare paragraphs
  html = html.split(/\n{2,}/).map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return '';
    if (chunk.startsWith('<')) return chunk; // already a block element
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  // Fix tip/blockquote class typo consistency
  html = html.replace(/class="tip"/g, 'class="note"');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Genesis Lumia ERP — System Requirements</title>
<style>
  :root{
    --ink:#172B4D; --ink2:#475569; --ink3:#64748B;
    --line:#E2E8F0; --line2:#CBD5E1;
    --bg:#ffffff; --bg2:#F8FAFC; --panel:#F1F5F9;
    --brand:#142B4A; --brand2:#1D3B60; --accent:#3B82F6;
    --ok:#166534; --warn:#92400E; --danger:#9F1239;
    --mono:#0B1F3A;
  }
  @page{ size:A4; margin:20mm 18mm 18mm 18mm; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; }
  body{
    font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;
    color:var(--ink);
    font-size:10.5pt;
    line-height:1.5;
    background:var(--bg);
  }
  h1.title{
    font-size:22pt; font-weight:700; color:var(--brand);
    margin:0 0 2pt 0; letter-spacing:-0.01em;
  }
  .subtitle{ font-size:10.5pt; color:var(--ink2); margin:0 0 14pt 0; font-style:italic; }
  h2.sec{
    font-size:14pt; font-weight:700; color:var(--brand);
    margin:16pt 0 4pt 0; padding-bottom:3pt;
    border-bottom:2px solid var(--brand);
  }
  h3.sub{
    font-size:11.5pt; font-weight:600; color:var(--brand2);
    margin:10pt 0 3pt 0;
  }
  p{ margin:0 0 7pt 0; }
  ul.list, ol.list{ margin:0 0 8pt 0; padding-left:18pt; }
  ul.list li, ol.list li{ margin:0 0 3pt 0; }
  code.inline{ font-family:"JetBrains Mono","Consolas",monospace; font-size:9pt; background:var(--panel);
    color:var(--mono); padding:1px 4px; border-radius:4px; border:1px solid var(--line2); }
  pre.code{
    font-family:"JetBrains Mono","Consolas",monospace; font-size:8.5pt; line-height:1.35;
    background:var(--mono); color:#EAF2FB; padding:8pt 10pt; border-radius:8px;
    overflow:hidden; white-space:pre; margin:6pt 0 10pt 0;
    border:1px solid #16263f;
  }
  pre.code.mermaid{ background:var(--panel); color:var(--ink); border-color:var(--line2); }
  table.tbl{
    width:100%; border-collapse:collapse; margin:6pt 0 10pt 0;
    font-size:9.5pt;
  }
  table.tbl th{
    background:var(--brand); color:#fff; text-align:left;
    padding:5pt 7pt; font-weight:600; font-size:9.5pt;
    border:1px solid var(--brand);
  }
  table.tbl td{
    padding:5pt 7pt; border:1px solid var(--line2);
    vertical-align:top;
  }
  table.tbl tbody tr:nth-child(even){ background:var(--bg2); }
  table.tbl td:first-child{ font-weight:600; color:var(--brand2); width:26%; }
  blockquote.note{
    margin:6pt 0 10pt 0; padding:7pt 10pt; border-left:4px solid var(--accent);
    background:var(--bg2); border-radius:0 6px 6px 0; color:var(--ink2); font-style:italic;
  }
  hr.rule{ border:none; border-top:1px solid var(--line); margin:12pt 0; }
  .small{ font-size:9pt; color:var(--ink3); }
  a{ color:var(--accent); text-decoration:none; }
  a:hover{ text-decoration:underline; }
  .toc{ background:var(--bg2); border:1px solid var(--line2); border-radius:8px; padding:8pt 10pt; margin:0 0 10pt 0; font-size:9.5pt; }
  .toc b{ color:var(--brand); }
  @media print{
    body{ print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    pre.code{ page-break-inside:avoid; }
    table.tbl{ page-break-inside:avoid; }
    h2.sec{ page-break-after:avoid; }
    h3.sub{ page-break-after:avoid; }
  }
</style>
</head>
<body>
<div class="toc">
  <b>Genesis Lumia ERP — System Requirements</b><br>
  A plain-English guide to the technology behind your school management system.<br>
  <span class="small">Frontend: Next.js (TypeScript) · Backend: NestJS (TypeScript) · Database: SQLite · Hosting: Cloudflare</span>
</div>
${html}
</body>
</html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const html = mdToHtml(md);
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.matchMedia('print').matches = true; });
  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
    preferCSSPageSize: true,
  });
  await browser.close();

  const stats = fs.statSync(OUT);
  console.log('PDF written:', OUT);
  console.log('size:', (stats.size / 1024).toFixed(1), 'KB');
})().catch(err => { console.error(err); process.exit(1); });
