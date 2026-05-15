import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([
  {
    name: 'chainglass-bootstrap',
    value: 'UvgJ8fb5kZVRCuJ5624lO_-TOnVEcmGMNfWP5UIyBJE',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  },
]);
const page = await ctx.newPage();
await page.goto('http://localhost:3000/workspaces', { waitUntil: 'networkidle', timeout: 30000 });
const html = await page.content();
console.log('HTML length:', html.length);
const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')).filter(Boolean));
console.log('hrefs:', hrefs.slice(0, 30));
const url = page.url();
console.log('final url:', url);
await browser.close();
