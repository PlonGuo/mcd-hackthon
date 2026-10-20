import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { build } from 'esbuild';
import { createWatchPreview, previewSnapshot } from './lib/watch-preview.ts';

const evidence = '.local/watch-ui-check';
await mkdir(evidence, {recursive: true});
const browser = await chromium.launch({headless: true});
const preview = await createWatchPreview();
const canvasImage = async (page: Page, side = 'a') => createHash('sha256').update(
  await page.locator('#particles-' + side + ' canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
).digest('hex');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
async function waitConnected(page: Page) { await page.locator('#connection[data-state="live"]').waitFor(); }
try {
  for (const width of [390, 1280]) {
    preview.publish(previewSnapshot(0));
    const deviceScaleFactor = width === 390 ? 3 : 2;
    const page = await browser.newPage({viewport: {width, height: 850}, deviceScaleFactor});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (process.env.WATCH_ASSET_BASE) {
      // Also exercise the actual built runtime's serialized browser function.
      const base = process.env.WATCH_ASSET_BASE;
      assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
      await page.route('**/watch.js', async route => {
        const response = await fetch(new URL('/watch.js', base));
        assert.ok(response.ok);
        await route.fulfill({contentType: 'text/javascript', body: await response.text()});
      });
    }
    try {
      await page.goto(preview.url); await waitConnected(page);
      await page.waitForFunction(() => document.querySelectorAll('.portrait.has-particles').length === 2);
      assert.equal(await page.locator('#particles-a canvas').evaluate((c: HTMLCanvasElement) => c.width / c.clientWidth),
        deviceScaleFactor, '画布按设备像素密度绘制，避免高分屏拉伸');
      const painted = await page.locator('#particles-a canvas').evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 32) visible++;
        return visible;
      });
      assert.ok(painted > 100, '粒子必须真实绘制，不只存在 canvas');
      const frame = await canvasImage(page);
      await page.waitForTimeout(250);
      assert.notEqual(await canvasImage(page), frame, '正常模式连续帧应变化');
      assert.equal(await page.locator('#player-a.active').count(), 1);
      assert.match(await page.locator('#candidate-b').innerText(), /中薯条/);
      await page.screenshot({path: `${evidence}/active-${width}.png`, fullPage: true});

      preview.publish(previewSnapshot(1));
      await page.locator('#player-b.active').waitFor();
      await page.waitForFunction(() => {
        const rect = document.getElementById('waiting')!.getBoundingClientRect();
        return rect.bottom <= innerHeight + 2;
      });
      assert.equal(await page.locator('#messages li').count(), 1);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      preview.disconnect();
      await page.locator('#connection[data-state="offline"]').waitFor();
      assert.equal(await page.locator('.contender.active').count(), 0);
      const offline = await canvasImage(page);
      await page.waitForTimeout(250);
      assert.equal(await canvasImage(page), offline, '断线后装饰停止');
      await waitConnected(page);
      await page.locator('#player-b.active').waitFor();

      preview.publish(previewSnapshot(4));
      await page.locator('#phase').filter({hasText: '评分中'}).waitFor();
      assert.equal(await page.locator('#waiting').isVisible(), false);
      assert.equal(await page.locator('#judgement').isVisible(), false);
      preview.publish(previewSnapshot(5));
      await page.locator('#winner').filter({hasText: '麦乐鸡派 获胜'}).waitFor();
      assert.equal(await page.locator('#player-a.is-winner').count(), 1);
      assert.equal(await page.locator('.score-meter').count(), 2);
      assert.equal(await page.locator('#score-value-a').innerText(), '87');
      assert.equal(await page.locator('#score-value-b').innerText(), '83');
      const argumentsLayout = await page.locator('#messages > li').evaluateAll(nodes =>
        nodes.map(node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, bottom: r.bottom}; }));
      if (width > 600) {
        assert.equal(argumentsLayout[0]!.y, argumentsLayout[1]!.y, '同轮双方发言并排');
        assert.ok(argumentsLayout[1]!.x > argumentsLayout[0]!.x);
      } else {
        assert.equal(argumentsLayout[0]!.x, argumentsLayout[1]!.x, '手机端按发言先后顺序排列');
        assert.ok(argumentsLayout[1]!.y > argumentsLayout[0]!.bottom);
      }
      assert.equal(await overflow(page), false);
      await page.screenshot({path: `${evidence}/result-${width}.png`, fullPage: true});

      await page.evaluate(() => scrollTo(0, 0));
      // The initial celebration ends, but the particle portrait must stay alive.
      await page.waitForTimeout(1800);
      const winner = await canvasImage(page);
      await page.waitForTimeout(600);
      assert.notEqual(await canvasImage(page), winner, '判决结束后胜者粒子仍应持续流动');
      const centers: number[] = [];
      for (let frame = 0; frame < 8; frame++) {
        centers.push(await page.locator('#particles-a canvas').evaluate((c: HTMLCanvasElement) => {
          const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let total = 0, ySum = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 180) {
            total++; ySum += Math.floor(i / 4 / c.width);
          }
          return ySum / total / (c.width / c.clientWidth);
        }));
        await page.waitForTimeout(200);
      }
      assert.ok(Math.max(...centers) - Math.min(...centers) > .6, '字形应有可见位移，而不只是亚像素闪烁');
      await page.locator('.shopping-heading').click();
      assert.equal(await page.locator('.shopping-body').isVisible(), false);
      const repeated = previewSnapshot(5); repeated.sequence++;
      repeated.draft.lines[0]!.quantity = 2;
      repeated.draft.total_cents += 1250;
      // Score order from the API must not swap the A/B scoreboard labels.
      if (repeated.judgement?.status === 'SUCCEEDED') repeated.judgement.result.scores.reverse();
      preview.publish(repeated);
      await page.locator('#cart-summary').filter({hasText: '3 件商品'}).waitFor();
      assert.equal(await page.locator('.shopping-body').isVisible(), false, '实时清单更新保留折叠状态');
      assert.equal(await page.locator('#score-value-a').innerText(), '87');
      assert.equal(await page.locator('#score-value-b').innerText(), '83');
      assert.match(await page.locator('.score-row').first().textContent() ?? '', /麦乐鸡派/);
      assert.equal(await page.locator('.score-meter.reveal').count(), 0, '清单更新不得重播比分入场动画');
      await page.locator('.shopping-heading').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.shopping-body').isVisible(), true, '键盘可以展开清单');
      assert.match(await page.locator('#draft-total').innerText(), /40\.00/);
      assert.equal(await page.locator('.portrait.has-particles').count(), 2);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const offscreen = await canvasImage(page, 'b');
      await page.waitForTimeout(250);
      assert.equal(await canvasImage(page, 'b'), offscreen, '舞台离开视口后不继续绘制');
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      assert.notEqual(await canvasImage(page, 'b'), offscreen, '舞台返回视口后恢复绘制');
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.waitForTimeout(100);
      const staticFrame = await canvasImage(page, 'b');
      await page.waitForTimeout(300);
      assert.equal(await canvasImage(page, 'b'), staticFrame, '减少动态效果时保持静态');
      await page.setViewportSize({width: 320, height: 740});
      await page.waitForTimeout(150);
      assert.equal(await overflow(page), false);
      assert.ok(await page.locator('#particles-a canvas').evaluate((c: HTMLCanvasElement) => c.width > 0));

      // Exercise page lifecycle cleanup/restoration, including finished/replay state.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true})));
      assert.equal(await page.locator('canvas').count(), 0);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
      await waitConnected(page);
      assert.equal(await page.locator('canvas').count(), 2);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({width,ok:true,checks:['实际像素','连续帧','双方候选与回合','自动滚动','断线暂停/恢复','发言响应式排版','比分归属','清单折叠/实时同步/键盘','判决后持续流动','离屏暂停/恢复','减少动态效果','320px缩放','生命周期释放/重建','CSP/无异常']}));
    } finally { await page.close(); }
  }
  // A reader can leave the live edge without losing their place or the result.
  const reading = await browser.newPage({viewport: {width: 390, height: 850}, reducedMotion: 'reduce'});
  reading.setDefaultTimeout(10000);
  try {
    preview.publish(previewSnapshot(2));
    await reading.goto(preview.url); await waitConnected(reading);
    await reading.waitForFunction(() => document.getElementById('waiting')!.getBoundingClientRect().bottom < innerHeight - 80);
    await reading.keyboard.press('Home');
    await reading.waitForFunction(() => scrollY === 0);
    preview.publish(previewSnapshot(4));
    await reading.locator('#unread-label').filter({hasText: '2 条新发言'}).waitFor();
    assert.equal(await reading.evaluate(() => scrollY), 0, '读历史时新消息不夺走位置');
    assert.match(await reading.locator('#judge-status-title').innerText(), /裁判正在评分/);
    preview.publish(previewSnapshot(5));
    await reading.locator('#unread-label').filter({hasText: '判决已出'}).waitFor();
    assert.equal(await reading.evaluate(() => scrollY), 0, '判决不打断历史阅读');
    assert.equal(await reading.locator('#score-details').getAttribute('open'), null, '手机评分细节默认折叠');
    await reading.locator('#follow-live').click();
    await reading.waitForFunction(() => {
      const result=document.getElementById('judgement')!.getBoundingClientRect();
      return result.bottom <= document.getElementById('cart-dock')!.getBoundingClientRect().top;
    });
    assert.equal(await reading.locator('#compact-status').isVisible(), true);
    assert.equal(await reading.locator('#follow-live').isVisible(), false);
    await reading.locator('#score-details > summary').focus(); await reading.keyboard.press('Enter');
    assert.equal(await reading.locator('#scores').isVisible(), true, '键盘展开评分细节');
    const sync=previewSnapshot(5);sync.sequence+=1;preview.publish(sync);
    await reading.waitForTimeout(100);
    assert.equal(await reading.locator('#scores').isVisible(), true, '更新保留评分展开选择');
    await reading.locator('#view-cart').click();
    assert.equal(await reading.locator('#shopping-details').getAttribute('open'), '');
    const shopping=await reading.locator('#shopping').boundingBox();
    assert.ok(shopping && shopping.y>=52 && shopping.y<100, '清单定位避开顶部状态条');
    assert.equal(await reading.locator('#follow-live').isVisible(), true, '查看清单后可返回现场');
    await reading.setViewportSize({width:320,height:740});
    assert.equal(await overflow(reading),false);
    await reading.screenshot({path:`${evidence}/reading-mobile.png`,fullPage:true});
    const failed=previewSnapshot(4);failed.sequence=20;
    failed.judgement={status:'FAILED',error_code:'MODEL_TIMEOUT'};
    failed.battles[0]!.judgement=failed.judgement;failed.battles[0]!.status='FAILED';
    failed.active_battle_id=null;preview.publish(failed);
    await reading.reload();await waitConnected(reading);
    assert.match(await reading.locator('#judge-status-title').innerText(),/暂无判决/);
    assert.equal(await reading.locator('#judge-status .dots').isVisible(),false);
    assert.equal(await reading.locator('#judgement').isVisible(),false);
    console.log('历史阅读/新消息提醒/返回现场/评分中与失败/手机状态与清单导航/评分折叠：通过');
  } finally {await reading.close();preview.publish(previewSnapshot(5));}
  const fallback = await browser.newPage();
  try {
    await fallback.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {apply() { return null; }});
    });
    await fallback.goto(preview.url); await waitConnected(fallback);
    assert.equal(await fallback.locator('.portrait.has-particles').count(), 0);
    assert.equal(await fallback.locator('#player-a .avatar').isVisible(), true);
    assert.match(await fallback.locator('#winner').innerText(), /麦乐鸡派/);
    console.log('Canvas 不可用：HTML 字母与正文回退正常');
  } finally { await fallback.close(); }
  // Wrangler keeps function names; serializing injected helpers previously made
  // particles silently fall back in Workers while the Node build still worked.
  for (const keepNames of [false, true]) {
    const result = await build({entryPoints: ['src/watch-page.ts'], bundle: true, write: false,
      platform: 'browser', format: 'esm', target: 'es2022', keepNames});
    const bundled = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0]!.text).toString('base64')) as typeof import('../src/watch-page.ts');
    const script = await bundled.watchPageResponse('/watch.js').text();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.route('**/watch.js', route => route.fulfill({contentType: 'text/javascript', body: script}));
      await page.goto(preview.url); await waitConnected(page);
      assert.equal(await page.locator('.portrait.has-particles').count(), 2, '打包后粒子不得静默降级');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({bundled: true, keepNames, ok: true}));
    } finally { await page.close(); }
  }
} finally { await browser.close(); await preview.close(); }
