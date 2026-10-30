const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'out');

function pageFile(route) {
  const dir = path.join(OUT, route, 'index.html');
  return fs.existsSync(dir) ? dir : path.join(OUT, `${route.replace(/\/$/, '')}.html`);
}

(async () => {
  const { htmlRoutes, robotsTxt, sitemapXml } = await import('@altterisk/game-hub/build');
  const urls = [];
  for (const route of htmlRoutes(OUT, { exclude: (r) => r === '/404/' })) {
    const html = fs.readFileSync(pageFile(route), 'utf8');
    if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue;
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (canonical) urls.push(canonical[1]);
  }
  if (urls.length > 0) fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemapXml(urls));
  const origin = urls.length > 0 ? new URL(urls[0]).origin : '';
  fs.writeFileSync(path.join(OUT, 'robots.txt'), robotsTxt(origin, { sitemap: urls.length > 0 }));
  console.log(`sitemap: ${new Set(urls).size} urls`);
})();
