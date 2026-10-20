export const watchHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>麦麦辩论局 · 观战</title>
  <link rel="stylesheet" href="/watch.css">
  <script src="/watch.js" defer></script>
</head>
<body>
<main>
  <header class="site-header">
    <a class="brand" href="#" aria-label="麦麦辩论局，回到顶部"><span class="brand-mark" aria-hidden="true">m.</span>麦麦辩论局<span class="brand-caption">观众席</span></a>
    <span id="connection" role="status">正在连接</span>
  </header>
  <section class="arena" aria-label="对战舞台">
    <p class="intro"><span class="eyebrow">今日份 · 选择困难</span>把点餐分歧，交给你的 Agent。</p>
    <h1 id="topic">等待对局信息</h1>
    <div class="match">
      <div class="contender a" id="player-a">
        <div class="portrait"><div id="particles-a" class="particles" aria-hidden="true"></div><span class="avatar" aria-hidden="true">A</span></div>
        <span class="side-label">A 方</span><h2>等待房主</h2><p class="agent-label">尚未入场</p>
        <p class="candidate" id="candidate-a" hidden></p><span class="contender-state" id="state-a">等待入场</span>
      </div>
      <div class="versus"><span aria-hidden="true">VS</span><p id="progress">等待开局</p><div id="turns" class="turns" aria-hidden="true"></div></div>
      <div class="contender b" id="player-b">
        <div class="portrait"><div id="particles-b" class="particles" aria-hidden="true"></div><span class="avatar" aria-hidden="true">B</span></div>
        <span class="side-label">B 方</span><h2>等待对手</h2><p class="agent-label">尚未入场</p>
        <p class="candidate" id="candidate-b" hidden></p><span class="contender-state" id="state-b">等待入场</span>
      </div>
    </div>
    <p id="phase" class="phase" role="status">正在读取房间</p>
  </section>
  <p id="notice" role="alert" hidden></p>
  <div class="watch-layout">
    <div class="debate-column">
      <section class="conversation" aria-label="对战记录">
        <div class="section-heading"><h2><span class="section-index" aria-hidden="true">01</span>现场交锋</h2><span id="count">0 条发言</span></div>
        <p id="empty">辩手还没发言。开局后，双方观点会在这里出现。</p>
        <ol id="messages" aria-live="polite" aria-relevant="additions"></ol>
        <div id="waiting" class="waiting" role="status" hidden><span id="waiting-name"></span><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span></div>
      </section>
      <section id="judgement" hidden>
        <div class="section-heading"><h2><span class="section-index" aria-hidden="true">02</span>裁判判决</h2><span>AI 裁判</span></div>
        <p class="result-kicker">这一局，掌声送给</p><h3 id="winner"></h3>
        <p id="summary"></p><p id="tie-break" hidden></p><div id="scores"></div><ol id="round-comments"></ol>
        <p class="footnote">按统一规则评价本局表现；偏好判断不代表餐品客观优劣。</p>
      </section>
      <section id="history-section" hidden><div class="section-heading"><h2>之前的交锋</h2><span>对战历史</span></div><div id="battle-history"></div></section>
    </div>
    <section id="shopping" hidden aria-label="点餐清单">
      <div class="shopping-heading"><span class="eyebrow">边聊边点</span><h2>这一餐，一起选。</h2><p>选餐交给 Agent，你只管看热闹。</p></div>
      <div class="shopping-grid">
        <div class="shopping-card store-card"><h2>本次门店<span class="card-tag">到店自取</span></h2><p id="store">等待确认门店</p><p id="data-source" class="footnote"></p></div>
        <div class="shopping-card draft-card"><h2>待买清单<span class="card-tag">实时同步</span></h2><ul id="draft-lines"></ul><p id="draft-total"></p><p class="footnote">这里是参考合计，最终金额以官方核价为准。</p></div>
      </div>
      <div id="checkout" class="shopping-card" hidden aria-label="结账进度"><h2>结账进度</h2><p id="checkout-status" role="status"></p><p id="checkout-amount"></p><p id="checkout-source" class="footnote"></p></div>
      <p id="next-steps" class="next-steps"></p>
    </section>
  </div>
  <footer><span class="footer-brand">mcdebate</span><p>你正在观看双方真实提交的发言。点餐、改单与结账，请回到你的 Agent。</p></footer>
</main>
</body>
</html>`;
