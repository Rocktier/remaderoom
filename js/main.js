/* 一键生成效果图 · 交互脚本 */

(function () {
  'use strict';

  /* ---------- 移动端菜单 ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // 点击某个链接后收起菜单
    navLinks.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- 导航滚动变深 ---------- */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.style.background = window.scrollY > 10
        ? 'rgba(245,239,227,.9)'
        : 'rgba(245,239,227,.82)';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 前后对比滑块 ---------- */
  var slider = document.getElementById('baSlider');
  if (slider) {
    var box = slider.querySelector('.ba-slider');
    var setPos = function (x) {
      var rect = box.getBoundingClientRect();
      var pct = (x - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      box.style.setProperty('--p', (pct * 100) + '%');
    };

    var move = function (e) {
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      setPos(clientX);
    };

    box.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      setPos(e.clientX);
      box.setPointerCapture(e.pointerId);
      var moveH = function (ev) { move(ev); };
      var up = function () {
        box.removeEventListener('pointermove', moveH);
        box.removeEventListener('pointerup', up);
      };
      box.addEventListener('pointermove', moveH);
      box.addEventListener('pointerup', up);
    });

    // 键盘可访问
    box.tabIndex = 0;
    box.setAttribute('role', 'slider');
    box.setAttribute('aria-label', '前后效果对比滑块');
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', '100');
    box.setAttribute('aria-valuenow', '50');
    box.addEventListener('keydown', function (e) {
      var cur = parseFloat(box.style.getPropertyValue('--p')) || 50;
      var step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0);
      if (!step) return;
      e.preventDefault();
      var next = Math.max(0, Math.min(100, cur + step));
      box.style.setProperty('--p', next + '%');
      box.setAttribute('aria-valuenow', Math.round(next));
    });
  }

  /* ---------- 滚动显现 ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('is-in'); });
    }
  }

  /* ---------- GSAP 动效（滚动进度/视差/开场/倾斜/磁吸） ---------- */
  function initGSAP() {
    if (!window.gsap || typeof window.gsap.registerPlugin !== 'function') return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.registerPlugin(window.ScrollTrigger);

    if (!reduced) {
      /* Hero 开场交错显现 */
      gsap.from('.hero-anim', {
        opacity: 0, y: 36, duration: .95, ease: 'power3.out', stagger: .13, delay: .12
      });

      /* 滚动进度条 */
      gsap.to('#scrollBar', {
        scaleX: 1, ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: .4 }
      });

      /* 场景图视差 */
      gsap.utils.toArray('.scene .par').forEach(function (img) {
        gsap.fromTo(img, { yPercent: -9 }, {
          yPercent: 9, ease: 'none',
          scrollTrigger: { trigger: img.closest('.scene'), start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });

      /* 主图 3D 倾斜 */
      document.querySelectorAll('.tilt').forEach(function (el) {
        el.addEventListener('pointerenter', function () { el.style.transition = 'transform .12s ease'; });
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - .5;
          var py = (e.clientY - r.top) / r.height - .5;
          el.style.transform = 'perspective(900px) rotateX(' + (-py * 7) + 'deg) rotateY(' + (px * 9) + 'deg)';
        });
        el.addEventListener('pointerleave', function () {
          el.style.transition = 'transform .55s ease';
          el.style.transform = 'none';
        });
      });
    }

    /* 磁吸按钮（仅精细指针） */
    if (window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      document.querySelectorAll('.magnetic').forEach(function (b) {
        b.addEventListener('pointermove', function (e) {
          var r = b.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) * .16;
          var dy = (e.clientY - (r.top + r.height / 2)) * .24;
          b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        b.addEventListener('pointerleave', function () {
          b.style.transition = 'transform .35s ease';
          b.style.transform = '';
          setTimeout(function () { b.style.transition = ''; }, 360);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGSAP);
  } else {
    initGSAP();
  }
})();