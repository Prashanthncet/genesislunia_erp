const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mdPath = path.resolve(__dirname, '..', 'docs', 'SYSTEM_REQUIREMENTS.md');
const md = fs.readFileSync(mdPath, 'utf8');

// Simple markdown -> HTML (same logic as the PDF renderer, without the PDF-specific bits)
function mdToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<h2 class="sec">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="sub">$1</h3>')
    .replace(/^# (.+)$/gm, '<h1 class="title">$1</h1>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre class="code${lang === 'mermaid' ? ' mermaid' : ''}">${code.trim()}</pre>`)
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/(\*\*)([^*]+?)(\*\*)/g, '<b>$2</b>')
    .replace(/(\*)([^*]+?)(\*)/g, '<i>$2</i>')
    .replace(/^(\|.+\|)\n\|?[-: ]+\|?\n((?:\|.+\|\n?)*)/gm, (_, head, body) => {
      const rows = [head, body].join('\n').trim().split('\n').map(line =>
        line.trim().slice(1, -1).split('|').map(c => c.trim()).map(c => `<td>${c.replace(/\n/g,'<br>')}</td>`).join('')
      );
      return `<table class="tbl"><thead><tr>${rows[0]}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r}</tr>`).join('')}</tbody></table>`;
    })
    .replace(/^> (.+)$/gm, '<blockquote class="note">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\u0001hr\u0001/gm, '<hr class="rule">')
    .replace(/((?:<li>.*?<\/li>\s*)+)/g, (block) => {
      const ol = block.includes('<li>1.') || block.match(/<li>\d+\./);
      return ol ? `<ol class="list">${block}</ol>` : `<ul class="list">${block}</ul>`;
    })
    .split(/\n{2,}/).map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return '';
      if (chunk.startsWith('<')) return chunk;
      return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

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
    --ok:#166534; --warn:#92400E; --danger:#9F1239; --mono:#0B1F3A;
  }
  *{ box-sizing:border-box; }
  body{
    font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;
    color:var(--ink); font-size:10.5pt; line-height:1.5; background:var(--bg); margin:0; padding:18pt;
  }
  h1.title{ font-size:20pt; font-weight:700; color:var(--brand); margin:0 0 2pt 0; letter-spacing:-0.01em; }
  .subtitle{ font-size:9.5pt; color:var(--ink2); margin:0 0 12pt 0; font-style:italic; }
  h2.sec{ font-size:13pt; font-weight:700; color:var(--brand); margin:14pt 0 3pt 0; padding-bottom:3pt; border-bottom:2px solid var(--brand); }
  h3.sub{ font-size:11pt; font-weight:600; color:var(--brand2); margin:9pt 0 2pt 0; }
  p{ margin:0 0 6pt 0; }
  ul.list, ol.list{ margin:0 0 7pt 0; padding-left:16pt; }
  ul.list li, ol.list li{ margin:0 0 2pt 0; }
  code.inline{ font-family:"JetBrains Mono","Consolas",monospace; font-size:8.5pt; background:var(--panel); color:var(--mono); padding:1px 4px; border-radius:4px; border:1px solid var(--line2); }
  pre.code{ font-family:"JetBrains Mono","Consolas",monospace; font-size:8pt; line-height:1.3; background:var(--mono); color:#EAF2FB; padding:7pt 9pt; border-radius:8px; overflow:hidden; white-space:pre; margin:5pt 0 8pt 0; border:1px solid #16263f; }
  pre.code.mermaid{ background:var(--panel); color:var(--ink); border-color:var(--line2); }
  table.tbl{ width:100%; border-collapse:collapse; margin:5pt 0 8pt 0; font-size:9pt; }
  table.tbl th{ background:var(--brand); color:#fff; text-align:left; padding:4pt 6pt; font-weight:600; border:1px solid var(--brand); }
  table.tbl td{ padding:4pt 6pt; border:1px solid var(--line2); vertical-align:top; }
  table.tbl tbody tr:nth-child(even){ background:var(--bg2); }
  table.tbl td:first-child{ font-weight:600; color:var(--brand2); width:26%; }
  blockquote.note{ margin:5pt 0 8pt 0; padding:6pt 9pt; border-left:4px solid var(--accent); background:var(--bg2); border-radius:0 6px 6px 0; color:var(--ink2); font-style:italic; }
  hr.rule{ border:none; border-top:1px solid var(--line); margin:10pt 0; }
  .small{ font-size:8.5pt; color:var(--ink3); }
  a{ color:var(--accent); text-decoration:none; }
  @media print{ body{ print-color-adjust:exact; -webkit-print-color-adjust:exact; } pre.code{ page-break-inside:avoid; } table.tbl{ page-break-inside:avoid; } }
</style>
</head>
<body>
<div style="background:var(--bg2); border:1px solid var(--line2); border-radius:8px; padding:7pt 9pt; font-size:9pt; margin-bottom:8pt;">
  <b style="color:var(--brand)">Genesis Lumia ERP — System Requirements</b><br>
  A plain-English guide to the technology behind your school management system.<br>
  <span class="small">Frontend: Next.js (TypeScript) · Backend: NestJS (TypeScript) · Database: SQLite · Hosting: Cloudflare</span>
</div>
${html}
</body>
</html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const html = mdToHtml(md);
  await page.setContent(html, { waitUntil: 'networkidle' });

  const previewPath = path.resolve(__dirname, '..', 'docs', '_pdf_preview.png');
  await page.screenshot({ path: previewPath, fullPage: true });
  await browser.close();

  console.log('preview PNG written:', previewPath);
  console.log('size:', (fs.statSync(previewPath).size / 1024).toFixed(1), 'KB');

  const pdfPath = path.resolve(__dirname, '..', 'docs', 'SYSTEM_REQUIREMENTS.pdf');
  const htmlSnapshot = mdToHtml(md);
  const ff = fs.readFileSync(pdfPath);
  const titleHex = Buffer.from('Genesis Lumia ERP — System Requirements').toString('ucs2').split('').map(c => c.charCodeAt(0).toString(16).padStart(4,'0')).join(' ');
  const titleCheck = ff.toString('latin1').includes('FEFF00470065006E00650073006900730020004C0075006D006900610020004500520050');
  const titleObjMatch = ff.toString('latin1').match(/<FEFF([0-9A-Fa-f]{4})+>/);
  fs.writeFileSync(pdfPath + '.html.txt', htmlSnapshot);
  fs.writeFileSync(pdfPath + '.md.txt', md);
  console.log('source HTML snapshot written:', pdfPath + '.html.txt', '(' + (html.length / 1024).toFixed(1) + ' KB)');
  console.log('source markdown snapshot written:', pdfPath + '.md.txt', '(' + (md.length / 1024).toFixed(1) + ' KB)');
  console.log('PDF bytes:', ff.length.toLocaleString());
  console.log('PDF header:', ff.toString('latin1').slice(0,8));
  console.log('computed titleHex:', titleHex);
  console.log('PDF /Title:', titleHex);
  console.log('PDF /Title present in file:', titleCheck);
  console.log('PDF /Title raw match:', titleObjMatch ? titleObjMatch[0].slice(0,40) : 'none');
  console.log('PDF title in file matches computed:', titleCheck);
})().catch(e => { console.log('ERR', e.message.slice(0, 300)); process.exit(1); });
