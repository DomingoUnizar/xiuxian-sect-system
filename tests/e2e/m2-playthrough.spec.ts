import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';

const evidenceDir = path.resolve(process.cwd(), 'docs/plan/evidence/m2');
fs.mkdirSync(evidenceDir, { recursive: true });

async function expectAllVisibleImagesLoaded(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  const check = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const broken = imgs
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src);
    return { total: imgs.length, broken };
  });
  expect(check.broken).toEqual([]);
}

test.describe('宗门系统 M2 实机浏览器端到端验收（百艺联动 + 规则赐予 + 多人因果大比）', () => {
  test('完整打通首炼 -> 承传(+2) -> 锻剑封隐(+3=5规则赐予) -> 携兽探泉(+4=9多人因果) -> 丹库校验 -> 赐神通 -> 大比三令结算', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedAssets: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) failedAssets.push(`${res.status()} ${res.url()}`);
    });

    await page.goto('/');
    await expect(page.getByTestId('world-clock')).toContainText('开山第1年');

    // 1. 招进双栖弟子
    await page.getByTestId('tab-recruit').click();
    const dualCard = page.locator('[data-testid^="candidate-card-"]').filter({
      hasText: '炉坊兼武馆学徒出身',
    }).first();
    await dualCard.getByRole('button', { name: /邀其入门/ }).click();
    await expect(page.getByTestId('mission-issuer')).toBeVisible();

    // 2. 展开进阶委派 -> 首炼 + 承传分火提清 (+2 根基)
    await page.getByTestId('toggle-advanced-bounty').click();
    await page.getByTestId('select-target-first_alchemy').click();
    await page.getByTestId('btn-issue-mission').click();
    await page.getByTestId('btn-step-3').click();
    await page.getByTestId('btn-step-3').click();

    await page.getByTestId('select-target-followup_heritage_fenhuo').click();
    await page.getByTestId('btn-issue-mission').click();
    await page.getByTestId('btn-step-day').click();
    await expect(page.getByTestId('foundation-pill')).toContainText('2');

    // 3. 锻铸蓄水剑并勾选预封隐藏机缘 (+3 根基 = 5，解锁规则赐予)
    await page.getByTestId('select-target-craft_forging_sword').click();
    await page.getByTestId('chk-hidden-reward').check();
    await page.getByTestId('btn-issue-mission').click();
    await page.getByTestId('btn-step-3').click();
    await page.getByTestId('btn-step-3').click();
    await expect(page.getByTestId('foundation-pill')).toContainText('5');

    // 4. 携兽探泉采露 (+4 根基 = 9，解锁多人因果)
    await page.getByTestId('select-target-craft_beast_gather').click();
    await page.getByTestId('btn-issue-mission').click();
    await page.getByTestId('btn-step-3').click();
    await page.getByTestId('btn-step-3').click();
    await expect(page.getByTestId('foundation-pill')).toContainText('9');

    // 5. 检查「丹库·法器」潮纹玉、炉胆、灵兽伙伴与近况百艺实录
    await page.getByTestId('tab-vault').click();
    await expect(page.getByTestId('vault-treasury-panel')).toContainText('潮纹玉');
    await expect(page.getByTestId('vault-beasts-section')).toContainText('听泉云纹鹿');
    await expectAllVisibleImagesLoaded(page);
    await page.screenshot({ path: path.join(evidenceDir, 'vault-m2-crafts.png'), fullPage: false });

    // 6. 检查「道统·悬赏」5点与9点权限全部解锁 -> 赐予永久神通 + 发起宗门大比三令同局
    await page.getByTestId('tab-more').click();
    await page.getByTestId('tab-heritage').click();
    await expect(page.getByTestId('perm-tier-rule_grant')).toContainText('✓ 已解锁');
    await expect(page.getByTestId('perm-tier-multi_causal')).toContainText('✓ 已解锁');

    await page.getByTestId('btn-grant-ability').click();
    await page.screenshot({ path: path.join(evidenceDir, 'heritage-m2-unlocks.png'), fullPage: false });

    await page.getByTestId('btn-launch-tournament').click();
    await page.getByTestId('btn-step-day').click();

    await expect(page.locator('[data-testid^="tournament-card-"]').first()).toContainText('已落幕');
    await expect(page.locator('[data-testid^="tournament-card-"]').first()).toContainText('✓ 已兑现');
    const tickerText = await page.locator('.map-ticker').innerText();
    expect(tickerText).not.toContain('…');
    expect(tickerText).not.toContain('...');
    await expectAllVisibleImagesLoaded(page);
    await page.screenshot({ path: path.join(evidenceDir, 'desktop-m2-tournament.png'), fullPage: false });

    // 7. 公开视角严禁系统词检查
    await page.getByTestId('tab-more').click();
    await page.getByTestId('tab-chronicle').click();
    await page.getByTestId('view-public').click();
    const publicText = await page.getByTestId('chronicle-panel').innerText();
    for (const term of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
      expect(publicText).not.toContain(term);
    }

    await context.close();
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedAssets).toEqual([]);
  });
});
