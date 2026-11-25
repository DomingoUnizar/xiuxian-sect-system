import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';

const evidenceDir = path.resolve(process.cwd(), 'docs/plan/evidence/m2');
fs.mkdirSync(evidenceDir, { recursive: true });

test.describe('先天气运、天机外挂三选一、大地图奇袭前哨与实况手操斗法验收', () => {
  test('双私令攒满算力抽外挂三选一 -> 点大地图敌哨Pin进入实况斗法 -> 识海传音破招胜首领入第2幕', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    await expect(page.getByTestId('world-clock')).toContainText('开山第1年');
    await expect(page.getByTestId('sect-crisis-panel')).toContainText('第 1 幕');
    await expect(page.getByTestId('map-pin-outpost')).toBeVisible();

    // 1. 发动双头拱火 + 雪中送炭，攒满60算力触发「外挂三选一」
    await page.getByTestId('btn-scheme-rivalry').click();
    await expect(page.getByTestId('drama-contrast-box')).toBeVisible();
    await page.getByTestId('btn-scheme-nurture').click();
    await expect(page.getByTestId('btn-open-perk-draft')).toBeVisible();

    await page.getByTestId('btn-open-perk-draft').click();
    await expect(page.getByTestId('system-draft-modal')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'system-perk-draft.png'), fullPage: false });
    await page.getByTestId('btn-pick-perk-0').click();
    await expect(page.getByTestId('system-draft-modal')).toBeHidden();
    await expect(page.getByTestId('active-perks-strip')).toBeVisible();

    // 2. 直接点击大地图寒鸦山口上的「🎯 敌哨·奇袭」Pin -> 打开实况斗法台，点「自动看戏」顺滑推进不卡第0合
    await page.getByTestId('map-pin-outpost').click();
    await expect(page.getByTestId('live-duel-modal')).toBeVisible();
    await page.getByTestId('btn-duel-autoplay').click();
    await expect(page.getByTestId('live-duel-modal')).toContainText(/第 [1-9]\d* \/ 14 合/);
    await page.getByTestId('btn-duel-autoplay').click();
    await expect(page.getByTestId('duel-ult-alert')).toBeVisible();
    await page.getByTestId('btn-duel-whisper').click();
    await page.screenshot({ path: path.join(evidenceDir, 'live-duel-stage.png'), fullPage: false });

    await page.getByTestId('btn-duel-autofinish').click();
    await expect(page.getByTestId('btn-duel-close')).toBeVisible();
    await page.getByTestId('btn-duel-close').click();
    await expect(page.getByTestId('sect-crisis-panel')).toContainText('前哨已拔');

    // 3. 迎战被削弱 18% 的第 1 幕首领炎破军 -> 实况完胜迈入第 2 幕
    await page.getByTestId('btn-resolve-crisis').click();
    await expect(page.getByTestId('live-duel-modal')).toBeVisible();
    await page.getByTestId('btn-duel-autofinish').click();
    await page.getByTestId('btn-duel-close').click();

    await expect(page.getByTestId('sect-crisis-panel')).toContainText('第 2 幕');
    await expect(page.getByTestId('drama-contrast-box')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'clutch-crisis-victory.png'), fullPage: false });

    // 4. 校验公开纪事绝对零系统词泄露
    await page.getByTestId('tab-more').click();
    await page.getByTestId('tab-chronicle').click();
    await page.getByTestId('view-public').click();
    const publicText = await page.getByTestId('chronicle-panel').innerText();
    for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
      expect(publicText).not.toContain(bad);
    }

    await context.close();
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
