/* 出图工作台 · 交互（三步流程 + 前后对比滑块）
   出图本身在 js/config.js 里走本机代理；没开代理时自动退回示例图。 */
(function () {
  'use strict';
  var App = window.App || { STYLES: [], FREE_QUOTA: 3, generateImage: function () { return null; } };

  var $ = function (id) { return document.getElementById(id); };
  var state = { photo: null, styleId: null };

  /* ---------- 剩余次数（sessionStorage 模拟计费） ---------- */
  var QUOTA_KEY = 'wb_quota';
  var remaining = parseInt(sessionStorage.getItem(QUOTA_KEY), 10);
  if (isNaN(remaining)) remaining = App.FREE_QUOTA;
  var quotaLabel = $('quotaLeft');
  function refreshQuota() {
    if (quotaLabel) quotaLabel.textContent = remaining;
  }
  refreshQuota();

  /* ---------- 步骤切换 ---------- */
  var stepIndex = 1;
  var stepperEls = document.querySelectorAll('.stepper .step');
  function go(step, dir) {
    var p1 = $('p1'), p2 = $('p2'), p3 = $('p3');
    [p1, p2, p3].forEach(function (p) { p.hidden = true; });
    (step === 1 ? p1 : step === 2 ? p2 : p3).hidden = false;
    stepperEls.forEach(function (el) {
      var n = +el.getAttribute('data-step');
      el.classList.toggle('is-done', n < step);
      el.classList.toggle('is-active', n === step);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 步骤 1：上传照片 ---------- */
  var dz = $('dz'), fileInput = $('fileInput'), dzInner = $('dzInner'),
      dzPreview = $('dzPreview'), photoPreview = $('photoPreview'), nextBtn = $('nextBtn');

  function useFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function () {
      state.photo = { name: file.name, url: reader.result };
      photoPreview.src = reader.result;
      dzInner.hidden = true;
      dzPreview.hidden = false;
      nextBtn.setAttribute('aria-disabled', 'false');
      nextBtn.classList.remove('is-disabled');
    };
    reader.readAsDataURL(file);
  }

  dz.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { useFile(fileInput.files[0]); });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('is-over'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('is-over');
    useFile(e.dataTransfer.files[0]);
  });
  $('repickBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    state.photo = null;
    dzInner.hidden = false; dzPreview.hidden = true;
    fileInput.value = '';
    nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.classList.add('is-disabled');
  });

  nextBtn.addEventListener('click', function () {
    if (nextBtn.getAttribute('aria-disabled') === 'true') return;
    go(2); renderStyles(); stepIndex = 2;
  });

  /* ---------- 步骤 2：选风格 + 自定义补充 ---------- */
  var styleGrid = $('styleGrid');
  function renderStyles() {
    styleGrid.innerHTML = '';
    (App.STYLES || []).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'style-card';
      b.setAttribute('data-id', s.id);
      b.innerHTML = '<b>' + s.name + '</b><span>' + s.desc + '</span>';
      b.addEventListener('click', function () {
        state.styleId = s.id;
        styleGrid.querySelectorAll('.style-card').forEach(function (x) { x.classList.remove('is-selected'); });
        b.classList.add('is-selected');
      });
      styleGrid.appendChild(b);
    });
    // 默认选中第一个，降低操作门槛
    state.styleId = App.STYLES[0].id;
    styleGrid.querySelector('.style-card').classList.add('is-selected');
  }

  var customText = $('customText');
  $('backBtn1').addEventListener('click', function () { go(1); stepIndex = 1; });
  $('genBtn').addEventListener('click', function () {
    if (!state.photo) { go(1); return; }
    if (remaining <= 0) {
      showError('这一轮 ' + App.FREE_QUOTA + ' 次免费体验已经用完了。账号和支付还没做，关掉标签页重新打开可以重置次数。', true);
      return;
    }
    generate();
  });
  $('retryBtn').addEventListener('click', function () { $('genError').hidden = true; go(2); renderStyles(); });
  $('backBtn2').addEventListener('click', function () { go(2); renderStyles(); stepIndex = 2; });
  $('againBtn').addEventListener('click', function () {
    go(1); state.photo = null;
    dzInner.hidden = false; dzPreview.hidden = true;
    fileInput.value = ''; nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.classList.add('is-disabled');
    stepIndex = 1;
  });

  function showError(msg, noRetry) {
    $('genLoading').hidden = true;
    $('genResult').hidden = true;
    $('genErrorText').textContent = msg;
    $('genError').hidden = false;
    // 次数用完后「回上一步重试」是条死路，别摆在那儿让人再撞一次
    $('retryBtn').hidden = !!noRetry;
    go(3);
  }

  function generate() {
    var loading = $('genLoading'), result = $('genResult');
    $('genError').hidden = true;
    loading.hidden = false; result.hidden = true;
    var style = App.getStyle(state.styleId) || {};
    var t0 = Date.now();

    App.generateImage(state.photo.url, style, customText.value.trim()).then(function (r) {
      loading.hidden = true;
      if (!r || !r.ok) {
        showError('出图没成功：' + ((r && r.message) || '未知错误'));
        return;
      }
      $('beforeImg').src = state.photo.url;
      $('afterImg').src = r.afterUrl;
      var tip = $('demoTip');
      if (r.demo) {
        tip.textContent = '当前为【示例效果图】：' + (r.message || '出图引擎尚未接入，仅演示交互流程。');
        tip.hidden = false;
      } else {
        var secs = r.seconds != null ? r.seconds : Math.round((Date.now() - t0) / 1000);
        tip.textContent = '效果图已生成，用时 ' + secs + ' 秒。拖动中间白线，左边是你家原样，右边是新方案。';
        tip.hidden = false;
      }
      result.hidden = false;
      remaining -= 1; sessionStorage.setItem(QUOTA_KEY, remaining); refreshQuota();
      go(3);
      initSlider(result.querySelector('.ba-slider'));
      window.setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 60);
    }).catch(function (err) {
      // 出图成功后若还有别的环节抛异常，也要让人看见发生了什么，而不是停在空白面板
      showError('结果页出了问题：' + ((err && err.message) || err));
    });
  }

  /* ---------- 前后对比滑块（复用首页交互） ----------
     传容器或 .ba-slider 本身都行：早先只认容器，传错就静默抛异常，
     结果第 3 步面板卡在隐藏状态，界面上什么也看不见。 */
  function initSlider(slider) {
    if (!slider) return;
    var box = slider.classList && slider.classList.contains('ba-slider')
      ? slider : slider.querySelector('.ba-slider');
    if (!box) return;
    function setPos(x) {
      var r = box.getBoundingClientRect();
      var p = (x - r.left) / r.width;
      p = Math.max(0, Math.min(1, p));
      box.style.setProperty('--p', (p * 100) + '%');
    }
    box.addEventListener('pointerdown', function (e) {
      e.preventDefault(); setPos(e.clientX); box.setPointerCapture(e.pointerId);
      function mh(ev) { setPos(ev.clientX); }
      box.addEventListener('pointermove', mh);
      box.addEventListener('pointerup', function () { box.removeEventListener('pointermove', mh); },
        { once: true });
    });
  }

  /* ---------- 区块显现（轻量） ---------- */
  var els = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('is-in'); });
  }

  go(1);
})();