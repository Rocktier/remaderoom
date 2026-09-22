/* ============================================================
   站点骨架配置：风格清单 / 免费次数 / 出图引擎调用
   以后改参数都只动这里，工作台按时读取。

   出图走本机代理 server.mjs（POST /api/generate），
   API Key 只存在本机 engine.config.json 里，绝不写进浏览器能看到的文件。
   用 file:// 直接双击打开页面时没有代理，自动退回示例图演示。
   ============================================================ */
(function (w) {

  // 出图风格清单（工作台选风格时渲染；keyword 会拼进给模型的指令）
  var STYLES = [
    { id: 'cream',     name: '奶油风',   desc: '奶白与浅木，柔和治愈',       keyword: '奶油风，奶白米色调，浅原木色，光线柔和' },
    { id: 'wood',      name: '原木风',   desc: '自然木色与亚麻，质朴安静',   keyword: '原木风，橡木家具，亚麻布艺，自然采光' },
    { id: 'midcentury',name: '中古风',   desc: '复古质感，中古家具，浓郁配色', keyword: '中古风，复古家具，年代质感，浓郁暖色调' },
    { id: 'song',      name: '宋式美学', desc: '留白与深木，东方雅致',       keyword: '宋式美学，大面积留白，深胡桃木，水墨，宁静' },
    { id: 'modern',    name: '现代简约', desc: '干净利落，少即是多',         keyword: '现代简约，线条利落，中性色调，通透' }
  ];

  // 免费档出图次数（前端展示用；真正守钱包的是 server.mjs 里的 maxRendersPerDay）
  var FREE_QUOTA = 3;

  var API_GENERATE = '/api/generate';
  var IS_HTTP = /^https?:$/.test(w.location.protocol);
  var DEMO_AFTER = 'img/case-wood.jpg';

  // 手机原图动辄 4000×3000、十几 MB，直接传给模型又慢又费钱。
  // 出图只要看清空间关系，压到长边 1400px 足够。
  function preparePhoto(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1400, s = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s);
        cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        try { resolve(cv.toDataURL('image/jpeg', 0.85)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function demo(message) {
    return { ok: true, demo: true, afterUrl: DEMO_AFTER, message: message, engine: null };
  }

  /* 出图。返回 Promise，resolve 成两种形状：
       { ok:true,  demo, afterUrl, seconds, engine }   成功
       { ok:false, code, message }                     失败，message 是人话，可直接显示 */
  function generateImage(photoDataUrl, style, customText) {
    if (!IS_HTTP) {
      return Promise.resolve(demo('现在是双击打开的本地文件，没有本机出图服务，看到的是示例图。要真出图：命令行运行 node server.mjs，再访问 http://localhost:5173'));
    }
    return preparePhoto(photoDataUrl).then(function (small) {
      return fetch(API_GENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: small, style: style, customText: customText || '' })
      });
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: { code: 'HTTP' + res.status, message: '出图服务返回了看不懂的内容（HTTP ' + res.status + '）。' } };
      });
    }).then(function (j) {
      if (j && j.ok && j.afterUrl) {
        return { ok: true, demo: !!j.demo, afterUrl: j.afterUrl, seconds: j.seconds, engine: j.provider, message: j.message || '' };
      }
      var e = (j && j.error) || {};
      return { ok: false, code: e.code || 'Unknown', message: e.message || '出图失败，没有返回图片。' };
    }).catch(function (err) {
      return { ok: false, code: 'Offline', message: '连不上本机出图服务，确认 node server.mjs 那个窗口还开着。（' + err.message + '）' };
    });
  }

  w.App = {
    STYLES: STYLES,
    getStyle: function (id) {
      for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
      return null;
    },
    FREE_QUOTA: FREE_QUOTA,
    isLive: function () { return IS_HTTP; },
    preparePhoto: preparePhoto,
    generateImage: generateImage
  };
})(window);
