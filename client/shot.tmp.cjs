const { chromium } = require('playwright');
const OUT = '/mnt/project-files/streak-calendar/built/';
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, theme] of [['mobile', { width: 390, height: 844 }, 'dark'], ['mobile', { width: 390, height: 844 }, 'light'], ['desktop', { width: 1440, height: 900 }, 'dark']]) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2, colorScheme: theme });
    await p.clock.install({ time: new Date('2026-11-11T18:00:00Z') });
    await p.goto('http://localhost:4173/?focus=25&break=5&bots=0&streak=4&missed=1');
    await p.getByRole('timer').waitFor();
    await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    if (name === 'mobile') await p.getByRole('navigation', { name: 'Session' }).getByRole('button', { name: 'Start focusing' }).click();
    else await p.getByRole('button', { name: 'Join room timer' }).click();
    await p.getByRole('dialog', { name: 'What are you working on?' }).getByRole('button', { name: 'Start focusing' }).click();
    await p.clock.runFor(12 * 60_000);
    try { await p.getByRole('button', { name: /^Leave (room )?timer$/ }).click({ timeout: 5000 }); } catch (e) { await p.screenshot({ path: '/tmp/claude-0/dbg-' + name + '.png' }); throw e; }
    await p.getByRole('button', { name: 'Your progress' }).click();
    const card = p.locator('section[aria-label="Streak"]');
    await card.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await card.screenshot({ path: `${OUT}streak-${name}-${theme}.png` });
    await p.close();
  }
  await b.close();
})();
