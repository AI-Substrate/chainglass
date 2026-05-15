import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 844 };
const OUT = '/tmp/mobile-history-audit';
const findings = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([
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
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error')
    findings.push({ severity: 'minor', kind: 'console', text: m.text().slice(0, 200) });
});
page.on('pageerror', (e) =>
  findings.push({ severity: 'major', kind: 'pageerror', text: String(e).slice(0, 300) })
);

// Step 1 — open workspaces, find first workspace
await page.goto(`${BASE}/workspaces`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.screenshot({ path: `${OUT}/01-workspaces.png`, fullPage: true });

// Find a workspace and navigate into its browser page. Prefer
// `higgs-jordo` since the user's been testing against it; fall back to
// the first listed workspace if absent.
const slug = await page.evaluate(() => {
  const hrefs = Array.from(document.querySelectorAll('a'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => /^\/workspaces\/[^/?]+(\/|$|\?)/.test(h));
  const slugs = hrefs.map((h) => h.match(/^\/workspaces\/([^/?]+)/)?.[1]).filter(Boolean);
  return slugs.find((s) => s === 'higgs-jordo') ?? slugs[0] ?? null;
});
if (!slug) {
  console.error('NO WORKSPACE FOUND');
  console.log(JSON.stringify({ findings, fatal: 'no-workspace' }, null, 2));
  await browser.close();
  process.exit(2);
}
console.log('slug=', slug);

await page.goto(`${BASE}/workspaces/${slug}/browser`, {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/02-browser-default.png`, fullPage: true });

// Step 2 — find the mobile tab strip
const tabs = await page.$$eval('button, [role="tab"]', (els) =>
  els
    .filter((e) => /^(Files|Content|Terminal|History)$/.test(e.textContent?.trim() ?? ''))
    .map((e) => ({
      label: e.textContent.trim(),
      rect: e.getBoundingClientRect(),
    }))
);
console.log('tabs found:', JSON.stringify(tabs, null, 2));
if (tabs.length !== 4) {
  findings.push({
    severity: 'critical',
    kind: 'tab-strip',
    text: `Expected 4 tabs (Files/Content/Terminal/History), found ${tabs.length}: ${tabs.map((t) => t.label).join(', ')}`,
  });
}
const labels = tabs.map((t) => t.label);
for (const want of ['Files', 'Content', 'Terminal', 'History']) {
  if (!labels.includes(want)) {
    findings.push({ severity: 'critical', kind: 'tab-strip', text: `Missing tab: ${want}` });
  }
}

// Check tabs do not overflow
for (const t of tabs) {
  if (t.rect.right > VIEWPORT.width) {
    findings.push({
      severity: 'major',
      kind: 'tab-overflow',
      text: `Tab "${t.label}" overflows: right=${t.rect.right}, viewport=${VIEWPORT.width}`,
    });
  }
}

// Step 3 — tap History tab (last one)
const historyTab = tabs.find((t) => t.label === 'History');
if (historyTab) {
  await page.mouse.click(
    historyTab.rect.x + historyTab.rect.width / 2,
    historyTab.rect.y + historyTab.rect.height / 2
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-history-tab.png`, fullPage: true });

  const url = page.url();
  if (!url.includes('view=recent-feed')) {
    findings.push({
      severity: 'major',
      kind: 'history-tab-url',
      text: `Tapping History did not set view=recent-feed; URL=${url}`,
    });
  }

  // Verify "Recent changes" header rendered
  const hasFeedHeader = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h2')).some((h) =>
      /recent changes/i.test(h.textContent ?? '')
    );
  });
  if (!hasFeedHeader) {
    findings.push({
      severity: 'critical',
      kind: 'feed-render',
      text: 'Tapped History tab but "Recent changes" header not visible',
    });
  }

  // Capture filter chip strip overflow status
  const chipStrip = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('button')).filter((b) =>
      /^(All|Images|Videos|Audio|Markdown|Code|Other)$/.test(b.textContent?.trim() ?? '')
    );
    if (chips.length === 0) return null;
    const rects = chips.map((c) => ({
      label: c.textContent.trim(),
      rect: c.getBoundingClientRect(),
    }));
    const minTop = Math.min(...rects.map((r) => r.rect.top));
    const maxTop = Math.max(...rects.map((r) => r.rect.top));
    return { count: chips.length, wrapped: maxTop - minTop > 4, rects };
  });
  if (chipStrip?.wrapped) {
    findings.push({
      severity: 'minor',
      kind: 'chip-wrap',
      text: `Filter chip strip wrapped to multiple lines (count=${chipStrip.count})`,
    });
  }
} else {
  findings.push({
    severity: 'critical',
    kind: 'history-missing',
    text: 'No History tab found in tab strip — cannot verify behavior',
  });
}

// Step 4 — tap a feed card and verify it returns to Content tab
const firstFeedCardTitle = await page.evaluate(() => {
  const articles = Array.from(document.querySelectorAll('article'));
  for (const a of articles) {
    const btn = a.querySelector('button[id^="feed-card-title-"]');
    if (btn)
      return {
        name: btn.textContent.trim(),
        x: btn.getBoundingClientRect().x + 5,
        y: btn.getBoundingClientRect().y + 5,
      };
  }
  return null;
});
console.log('first card:', firstFeedCardTitle);
if (firstFeedCardTitle) {
  // Install a global click logger on the page so we can see what the
  // browser actually dispatched the click to.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target;
        const path = [];
        let n = t;
        while (n && path.length < 6) {
          path.push(`${n.tagName ?? '?'}.${(n.className ?? '').toString().slice(0, 60)}`);
          n = n.parentElement;
        }
        // eslint-disable-next-line no-console
        console.log('[click-log]', e.target?.tagName, e.target?.id ?? '', '|', path.join(' > '));
      },
      true
    );
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[click-log]')) console.log('PAGE>', t);
  });
  console.log('URL before click:', page.url());
  await page.mouse.click(firstFeedCardTitle.x, firstFeedCardTitle.y);
  await page.waitForTimeout(500);
  console.log('URL +500ms after click:', page.url());
  await page.waitForTimeout(1500);
  console.log('URL +2000ms after click:', page.url());
  await page.screenshot({ path: `${OUT}/04-after-card-click.png`, fullPage: true });

  const url2 = page.url();
  if (url2.includes('view=recent-feed')) {
    findings.push({
      severity: 'major',
      kind: 'card-click-stays-on-history',
      text: `Card click did not clear view; URL=${url2}`,
    });
  }
  if (!url2.match(/[?&]file=/)) {
    findings.push({
      severity: 'major',
      kind: 'card-click-no-file',
      text: `Card click did not set ?file=…; URL=${url2}`,
    });
  }

  // Confirm the active tab is Content (label active styling)
  const activeTabLabel = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button, [role="tab"]')).filter((e) =>
      /^(Files|Content|Terminal|History)$/.test(e.textContent?.trim() ?? '')
    );
    const active = tabs.find(
      (t) =>
        t.getAttribute('aria-selected') === 'true' ||
        /(?:bg-(accent|primary)|text-(?:foreground|primary)|font-semibold)/.test(t.className)
    );
    return active ? active.textContent.trim() : null;
  });
  if (activeTabLabel && activeTabLabel !== 'Content') {
    findings.push({
      severity: 'minor',
      kind: 'card-click-active-tab',
      text: `Active tab after card click is "${activeTabLabel}", expected Content`,
    });
  }
}

// Output
console.log('\n=== FINDINGS ===');
console.log(
  JSON.stringify(
    {
      slug,
      findings,
      screenshots: [
        '01-workspaces.png',
        '02-browser-default.png',
        '03-history-tab.png',
        '04-after-card-click.png',
      ],
    },
    null,
    2
  )
);
await browser.close();
