import { createWatchPreview } from './lib/watch-preview.ts';

const preview = await createWatchPreview({port: Number(process.env.PORT ?? 8874), autoplay: true});
console.log('本地界面预览（全部为演示数据，不调用模型或官方接口）：' + preview.url);
console.log('每 5 秒出现一条发言；约 25 秒显示演示判决。刷新页面可重播。');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  preview.close().catch(error => { console.error(error); process.exitCode = 1; });
});
