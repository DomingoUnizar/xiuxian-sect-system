import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';

const evidenceDir = path.resolve(process.cwd(), 'docs/plan/evidence/m1');
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
  return check.total;
}

test.describe('宗门系统 M1 全流程浏览器实机验收（互动地图 + 全品类素材）', () => {
  test('桌面端（1440×860）：地图交互 → 招徒绑定 → 秘密发令「首炼灵丹」→ 关页重开继续 → 传承自动悬赏 → 截图取证', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    await context.tracing.start({ screenshots: true, snapshots: true });

    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedAssets: string[] = [];
    let initialTransferBytes = 0;
    let initialLoadedDone = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', async (res) => {
      if (res.status() >= 400) {
        failedAssets.push(`${res.status()} ${res.url()}`);
      }
      if (!initialLoadedDone) {
        try {
          const sizes = await res.request().sizes();
          initialTransferBytes += sizes.responseBodySize + sizes.responseHeadersSize;
        } catch {
          // ignore if target closed
        }
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('world-clock')).toContainText('开山第1年');
    await page.waitForLoadState('networkidle');
    initialLoadedDone = true;

    // 校验设置弹窗内世界种子信息，再展开弟子档案校验3条青玉槽，切宝库校验品阶格
    await page.getByTestId('btn-save-modal').click();
    await expect(page.getByTestId('world-seed-info')).toContainText('种子 20261123');
    await page.getByRole('button', { name: '关闭' }).click();
    await page.getByTestId('toggle-host-detail').click();

    // 1. 验证首屏冷缓存、字体、立绘、品阶框与互动宗门大地图 Canvas 正常渲染
    const initialMetrics = await page.evaluate(async () => {
      await document.fonts.ready;
      const fontLoaded = document.fonts.check('16px "LXGW WenKai"');
      const imgs = Array.from(document.querySelectorAll('img'));
      const brokenImgs = imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);
      const itemSlotsCount = document.querySelectorAll('.item-slot-frame').length;
      const gaugesCount = document.querySelectorAll('.jade-gauge-frame').length;

      const canvas = document.querySelector('[data-testid="sect-map-canvas"]') as HTMLCanvasElement | null;
      let canvasNonBlank = false;
      let canvasRect = { width: 0, height: 0 };
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvasRect = { width: Math.round(rect.width), height: Math.round(rect.height) };
        const ctx = canvas.getContext('2d');
        if (ctx && canvas.width > 10 && canvas.height > 10) {
          const a = ctx.getImageData(Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.25), 1, 1).data;
          const b = ctx.getImageData(Math.floor(canvas.width * 0.55), Math.floor(canvas.height * 0.6), 1, 1).data;
          const c = ctx.getImageData(Math.floor(canvas.width * 0.78), Math.floor(canvas.height * 0.4), 1, 1).data;
          canvasNonBlank =
            a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || b[0] !== c[0] || b[1] !== c[1];
        }
      }

      return {
        fontLoaded,
        totalImgs: imgs.length,
        brokenImgs,
        itemSlotsCount,
        gaugesCount,
        canvasRect,
        canvasNonBlank,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(initialMetrics.fontLoaded).toBe(true);
    expect(initialMetrics.brokenImgs).toEqual([]);
    expect(initialMetrics.gaugesCount).toBe(3);
    expect(initialMetrics.canvasRect.width).toBeGreaterThanOrEqual(500);
    expect(initialMetrics.canvasRect.height).toBeGreaterThanOrEqual(400);
    expect(initialMetrics.canvasNonBlank).toBe(true);
    expect(initialMetrics.overflow).toBe(false);

    // 到宝库页校验总品阶格 >= 8 后切回修炼页
    await page.getByTestId('tab-vault').click();
    const vaultSlotsCount = await page.locator('.item-slot-frame').count();
    expect(initialMetrics.itemSlotsCount + vaultSlotsCount).toBeGreaterThanOrEqual(8);
    await page.getByTestId('tab-hall').click();

    // 导出冷缓存指标（预算 ≤ 1.5 MiB）
    fs.writeFileSync(
      path.join(evidenceDir, 'cold-cache-metrics.json'),
      JSON.stringify(
        {
          initialTransferBytes,
          initialTransferKiB: Number((initialTransferBytes / 1024).toFixed(2)),
          budgetBytes: 1_572_864,
          passed: initialTransferBytes <= 1_572_864,
        },
        null,
        2,
      ),
    );
    expect(initialTransferBytes).toBeLessThanOrEqual(1_572_864);

    // 2. 验证地图交互：点击地图弟子切换到宗主，再点击演武台预览玄角妖狼，再点击山门直达招徒
    await page.getByTestId('map-actor-member_master').click();
    await expect(page.getByTestId('host-detail-panel')).toContainText('筑基1层');

    await page.getByTestId('map-zone-arena').click();
    await expect(page.getByTestId('opponents-preview')).toContainText('玄角妖狼');
    await expectAllVisibleImagesLoaded(page);

    await page.getByTestId('map-zone-gate').click();
    await expect(page.getByTestId('recruitment-panel')).toBeVisible();
    await expectAllVisibleImagesLoaded(page);
    await page.screenshot({ path: path.join(evidenceDir, 'recruit-standee-m1.png'), fullPage: false });

    // 3. 招徒试艺并邀双栖新秀自愿入宗（秘密绑定）
    const dualCard = page.locator('[data-testid^="candidate-card-"]').filter({
      hasText: '炉坊兼武馆学徒出身',
    }).first();
    await expect(dualCard).toBeVisible();
    await dualCard.getByRole('button', { name: /山门试艺/ }).click();
    await expect(dualCard.getByTestId('audition-revealed')).toContainText('会运丹火');
    await dualCard.getByRole('button', { name: /邀其入门/ }).click();

    await expect(page.getByTestId('mission-issuer')).toBeVisible();
    const cultBeforeText = await page.getByTestId('host-cultivation-badge').innerText();
    expect(cultBeforeText).toContain('60');

    // 4. 点击地图丹霞药庐切回并预选「首炼灵丹」→ 发布私令 → 推演 3 刻成丹领十轮修为
    await page.getByTestId('map-zone-alchemy').click();
    await page.getByTestId('btn-issue-mission').click();
    await expect(
      page.locator('[data-testid="ding-toast"]', { hasText: '【叮！系统发布任务「首炼灵丹」】' }),
    ).toBeVisible();

    await page.getByTestId('btn-step-3').click();
    await expect(page.getByTestId('host-detail-panel')).toContainText('已成初丹');
    await expect(page.getByTestId('host-detail-panel')).toContainText('已兑现');

    const cultAfterText = await page.getByTestId('host-cultivation-badge').innerText();
    expect(cultAfterText).not.toContain('60 /');

    // 5. 巡礼「宝库」丹库、十二兵械谱与 T1-T6 品阶格并截图取证
    await page.getByTestId('tab-vault').click();
    await expect(page.getByTestId('pill-vault-list')).toContainText('凝灵丹');
    await expect(page.getByTestId('vault-treasury-panel')).toContainText('修真界十二兵械法器录');
    await expectAllVisibleImagesLoaded(page);
    await page.screenshot({ path: path.join(evidenceDir, 'vault-showcase-m1.png'), fullPage: false });

    // 6. 真实关页重开（等待 > 1 刻 = 6.2 秒），核对离线归来简报与丹药去向
    await page.close();
    await new Promise((resolve) => setTimeout(resolve, 6200));

    const reopened = await context.newPage();
    reopened.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    reopened.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await reopened.goto('/');
    await expect(reopened.getByTestId('return-summary-modal')).toBeVisible({ timeout: 15000 });
    await expect(reopened.getByTestId('return-pill-whereabouts')).toContainText('凝灵丹');
    await expect(reopened.getByTestId('return-disciple-growth')).toContainText('战力');
    await expectAllVisibleImagesLoaded(reopened);
    await reopened.screenshot({ path: path.join(evidenceDir, 'return-summary-m1.png'), fullPage: false });

    // 从回归简报直接发下一道任务「承传分火提清」→ 解锁自动悬赏
    await reopened.locator('[data-testid^="btn-return-next-"]').first().click();
    await expect(reopened.getByTestId('return-summary-modal')).toBeHidden();

    if ((await reopened.getByTestId('select-target-followup_heritage_fenhuo').count()) === 0) {
      await reopened.getByTestId('toggle-advanced-bounty').click();
    }
    await reopened.getByTestId('select-target-followup_heritage_fenhuo').click();
    await reopened.getByTestId('btn-issue-mission').click();
    await reopened.getByTestId('btn-step-day').click();

    await expect(reopened.getByTestId('foundation-pill')).toContainText('2');
    await reopened.getByTestId('tab-more').click();
    await reopened.getByTestId('tab-heritage').click();
    await expect(reopened.getByTestId('perm-tier-standing_bounty')).toContainText('✓ 已解锁');
    await expect(reopened.getByTestId('heritage-record-item')).toContainText('分火提清法');

    await reopened.getByTestId('btn-create-standing').click();
    await expect(reopened.locator('[data-testid^="standing-rule-"]').first()).toBeVisible();

    await reopened.getByTestId('tab-recruit').click();
    await reopened.getByTestId('btn-open-session').click();
    await reopened.getByTestId('btn-auto-fill').click();

    await reopened.getByTestId('tab-more').click();
    await reopened.getByTestId('tab-heritage').click();
    await expect(reopened.locator('[data-testid^="standing-rule-"]').first()).toContainText(/已触发 [1-9]\d* 人/);

    // 7. 检验三视角隐私隔离
    await reopened.getByTestId('tab-chronicle').click();
    await reopened.getByTestId('view-public').click();
    const publicText = await reopened.getByTestId('chronicle-panel').innerText();
    for (const term of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
      expect(publicText).not.toContain(term);
    }

    // 8. 切回主坛检验挂机流速、设置内多曲雅乐切换与缩放控制，然后拍干净首屏 desktop-m1.png
    await reopened.getByTestId('tab-hall').click();
    await reopened.getByTestId('speed-2x').click();
    await reopened.getByTestId('btn-auto-pause').click();
    await reopened.getByTestId('speed-1x').click();

    await reopened.getByTestId('btn-save-modal').click();
    await reopened.getByTestId('btn-bgm').click();
    await expect(reopened.getByTestId('btn-bgm')).toContainText('雅乐：奏鸣');
    await reopened.getByTestId('btn-bgm-next').click();
    await expect(reopened.getByTestId('btn-bgm')).toContainText('灵泉静修');
    await reopened.getByTestId('btn-bgm').click();
    await reopened.getByRole('button', { name: '关闭' }).click();

    // 收起进阶委派与完整档案，拍摄极简首屏全景
    if ((await reopened.getByTestId('btn-issue-mission').count()) > 0) {
      await reopened.getByTestId('toggle-advanced-bounty').click();
    }
    if ((await reopened.getByTestId('host-detail-panel').count()) > 0) {
      await reopened.getByTestId('toggle-host-detail').click();
    }

    await reopened.getByTestId('map-zoom-in').click();
    await reopened.getByTestId('map-zoom-reset').click();

    const ackBtn = reopened.locator('[data-testid="ding-toast"] button');
    if (await ackBtn.count()) {
      await ackBtn.first().click();
    }

    await expectAllVisibleImagesLoaded(reopened);
    await reopened.screenshot({ path: path.join(evidenceDir, 'desktop-m1.png'), fullPage: false });

    const finalOverflow = await reopened.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(finalOverflow).toBe(false);

    await context.tracing.stop({ path: path.join(evidenceDir, 'm1-trace.zip') });
    await context.close();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedAssets).toEqual([]);
  });

  test('手机视口（390×844）竖屏地图 + 宣纸侧栏零横向溢出且主控 ≥ 44px', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('world-clock')).toContainText('开山第1年');
    await expect(page.getByTestId('sect-map-canvas')).toBeVisible();

    await page.getByTestId('tab-recruit').click();
    const dualCard = page.locator('[data-testid^="candidate-card-"]').filter({
      hasText: '炉坊兼武馆学徒出身',
    }).first();
    await dualCard.getByRole('button', { name: /邀其入门/ }).click();
    await page.getByTestId('toggle-advanced-bounty').click();
    await page.getByTestId('select-target-first_alchemy').click();
    await page.getByTestId('btn-issue-mission').click();
    await page.getByTestId('btn-step-3').click();

    const mobileMetrics = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const issueBtn = document.querySelector('[data-testid="btn-issue-mission"]');
      const stepBtn = document.querySelector('[data-testid="btn-step-3"]');
      return {
        overflow,
        issueBtnHeight: issueBtn ? issueBtn.getBoundingClientRect().height : 0,
        stepBtnHeight: stepBtn ? stepBtn.getBoundingClientRect().height : 0,
      };
    });

    expect(mobileMetrics.overflow).toBe(false);
    expect(mobileMetrics.issueBtnHeight).toBeGreaterThanOrEqual(44);
    expect(mobileMetrics.stepBtnHeight).toBeGreaterThanOrEqual(44);

    await expect(page.getByTestId('ding-toast')).toBeVisible();
    await page.locator('[data-testid="ding-toast"] button').click();
    await expect(page.getByTestId('ding-toast')).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(evidenceDir, 'mobile-m1.png'), fullPage: false });
    await context.close();
  });
});
