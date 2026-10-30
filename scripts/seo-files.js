const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'out');

function* htmlPages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '404') yield* htmlPages(full);
    else if (entry.name === 'index.html') yield full;
  }
}

const urls = new Set();
for (const file of htmlPages(OUT)) {
  const html = fs.readFileSync(file, 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (canonical) urls.add(canonical[1]);
}

const robots = ['User-agent: *', 'Allow: /'];
if (urls.size > 0) {
  const sorted = [...urls].sort();
  const body = sorted.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  robots.push('', `Sitemap: ${new URL('/sitemap.xml', sorted[0]).href}`);
}
fs.writeFileSync(path.join(OUT, 'robots.txt'), `${robots.join('\n')}\n`);
console.log(`sitemap: ${urls.size} urls`);
