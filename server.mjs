#!/usr/bin/env node
/* ============================================================
   本地出图代理（零依赖，Node 18+）
   ------------------------------------------------------------
   为什么需要它：网页是纯静态的，API Key 写进 js 里等于公开送人，
   所以由这个小程序替你看住 Key —— 浏览器只跟本机这个服务说话，
   真正的出图请求由它转发给火山方舟（豆包 Seedream）。

   启动：  node server.mjs            然后浏览器打开 http://localhost:5173
   配置：  把 engine.config.example.json 复制成 engine.config.json，填入 Key
   没配置也能跑：出图接口会返回一句人话提示，前端自动退回示例图演示。
   ============================================================ */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const CFG_FILE = path.join(ROOT, 'engine.config.json');
const COUNTER_FILE = path.join(ROOT, '.renders.json');
const MAX_BODY = 25 * 1024 * 1024;      // 手机原图 base64 后可能到十几 MB
const UPSTREAM_TIMEOUT_MS = 150_000;    // 出图慢，留足余量

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

/* ---------------- 配置 ---------------- */

function loadConfig() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
  } catch {
    return { provider: 'none', error: '还没配置：请把 engine.config.example.json 复制为 engine.config.json 并填入你的 API Key。' };
  }
  const provider = cfg.provider || 'mock';
  if (provider === 'ark') {
    const ark = cfg.ark || {};
    if (!ark.key || /把Key粘贴|YOUR_/.test(ark.key)) {
      return { provider, error: 'engine.config.json 里的 ark.key 还是空的（或还是示例占位文字）。去火山方舟控制台建一个 API Key 填进去。' };
    }
    if (!ark.model) return { provider, error: 'engine.config.json 里缺 ark.model（模型名，形如 doubao-seedream-4-0-xxxxxx，从控制台「模型列表」里复制）。' };
  }
  return { ok: true, provider, cfg };
}

/* ---------------- 每日出图上限（替你守钱包） ---------------- */

/* 每日上限按「本地日」算，不是 UTC。
   用 toISOString() 的话，北京时间要到早上 8 点才翻页，
   客户凌晨两点来试会被误挡，提示里说的「明天恢复」也就对不上了。 */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function readCounter() {
  try {
    const c = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    return c.day === today() ? c : { day: today(), count: 0 };
  } catch { return { day: today(), count: 0 }; }
}

function bumpCounter() {
  const c = readCounter();
  c.count += 1;
  try { fs.writeFileSync(COUNTER_FILE, JSON.stringify(c)); } catch { /* 计数失败不挡出图 */ }
  return c.count;
}

/* ---------------- 出图指令 ----------------
   这套产品的命门是「图好看 × 还是你家」。指令里反复压住结构，
   否则模型会顺手把墙和门窗也重画，客户第一句就是「这不是我家」。 */

function buildPrompt(style, customText) {
  const styleName = style && style.name ? style.name : '更高级的';
  const keyword = style && style.keyword ? style.keyword : '';
  const extra = customText ? '；用户的额外想法：' + customText : '';
  return [
    '对这张真实房间照片做室内软装与饰面改造，输出照片级写实效果图。',
    '必须严格保持原照片的相机机位、透视角度、层高，以及墙体、门、窗、梁、管道井的位置和尺寸完全不变，',
    '不得增删或移动任何建筑结构，不得改变房间的形状与面积，只允许更换墙面/地面饰面、天花、灯具、家具、布艺、绿植与摆件。',
    '目标风格：' + styleName + '（' + keyword + '）。' + extra,
    '整体温暖、干净、有生活气息，光线自然柔和，材质细节真实，无人物、无文字、无水印。',
  ].join('');
}

/* ---------------- 各家引擎适配 ----------------
   目前只实现 ark（火山方舟 · 豆包 Seedream）。它同步返回、支持 base64 入参、
   只要一个 Key，最适合起步。阿里万相 wan2.7 需要业务空间 ID 且默认走异步轮询，
   等真要换引擎时再照同样的接口补一个函数即可。 */

async function callArk(ark, photoDataUrl, prompt) {
  const body = {
    model: ark.model,
    prompt,
    image: [photoDataUrl],
    size: ark.size || '2K',
    watermark: ark.watermark === true,
    response_format: 'b64_json',
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  let res, json;
  try {
    res = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ark.key },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    json = await res.json().catch(() => ({}));
  } catch (e) {
    if (e.name === 'AbortError') throw { code: 'Timeout', message: '出图超过 ' + Math.round(UPSTREAM_TIMEOUT_MS / 1000) + ' 秒没返回，这张没扣成功的钱可以重试。' };
    throw { code: 'Network', message: '连不上火山方舟，检查这台电脑的网络（或 Key 是否填错地址）。' };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = json.error || json;
    const code = err.code || ('HTTP' + res.status);
    const hint = res.status === 401 ? '（Key 不对或已过期）'
      : res.status === 403 ? '（账号未开通该模型，去控制台「模型列表」里先开通）'
      : res.status === 429 ? '（请求太频繁或余额不足）' : '';
    throw { code, message: (err.message || '出图失败') + hint };
  }

  const item = (json.data && json.data[0]) || {};
  if (item.b64_json) {
    return { afterUrl: 'data:image/jpeg;base64,' + item.b64_json, usedTokens: json.usage && json.usage.output_tokens };
  }
  if (item.url) {
    // 兜底：个别模型只回 URL。URL 通常 24 小时过期，所以转存成 base64 再交给浏览器。
    const img = await fetch(item.url, { signal: ac.signal });
    if (!img.ok) throw { code: 'FetchResult', message: '图出来了但取不回来，重试一次。' };
    const buf = Buffer.from(await img.arrayBuffer());
    return { afterUrl: 'data:image/jpeg;base64,' + buf.toString('base64') };
  }
  throw { code: 'BadResponse', message: '接口返回里没有图片字段，可能模型名不对。原始返回：' + JSON.stringify(json).slice(0, 200) };
}

async function callMock(photoDataUrl, style) {
  const file = path.join(ROOT, 'img', 'case-wood.jpg');
  const buf = fs.readFileSync(file);
  return { afterUrl: 'data:image/jpeg;base64,' + buf.toString('base64') };
}

/* ---------------- HTTP ---------------- */

function send(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject({ code: 'TooLarge', message: '照片太大（超过 25MB），换一张或截图发过来。' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject({ code: 'BadJSON', message: '请求内容格式不对。' }); }
    });
    req.on('error', reject);
  });
}

async function handleGenerate(req, res) {
  const loaded = loadConfig();
  if (loaded.error) return send(res, 503, { ok: false, error: { code: 'NotConfigured', message: loaded.error } });

  const limit = (loaded.cfg.maxRendersPerDay || 20);
  if (readCounter().count >= limit) {
    return send(res, 429, { ok: false, error: { code: 'DailyLimit', message: '今天本机出图已到 ' + limit + ' 张上限（engine.config.json 的 maxRendersPerDay 可调），明天自动恢复。' } });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return send(res, 400, { ok: false, error: { code: e.code || 'BadRequest', message: e.message || '请求读不出来' } }); }

  const { photo, style, customText } = body;
  if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
    return send(res, 400, { ok: false, error: { code: 'NoPhoto', message: '没收到照片，请回到第一步重新上传。' } });
  }
  if (photo.length > 12 * 1024 * 1024) {
    return send(res, 400, { ok: false, error: { code: 'PhotoTooBig', message: '照片压缩后仍然过大，请换一张光线好的远景照。' } });
  }

  const prompt = buildPrompt(style, customText);
  const t0 = Date.now();
  try {
    const r = loaded.provider === 'ark'
      ? await callArk(loaded.cfg.ark, photo, prompt)
      : await callMock(photo, style);
    const count = bumpCounter();
    console.log('[出图] 成功 provider=' + loaded.provider + ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's 今日第 ' + count + ' 张');
    send(res, 200, {
      ok: true,
      demo: loaded.provider === 'mock',
      afterUrl: r.afterUrl,
      seconds: Math.round((Date.now() - t0) / 1000),
      provider: loaded.provider,
      todayCount: count,
      message: loaded.provider === 'mock'
        ? '本机代理已经跑通了，但 engine.config.json 里 provider 仍是 "mock"，所以给你看的是示例图。把 provider 改成 "ark" 并填入 Key 就是真出图。'
        : '',
    });
  } catch (e) {
    console.log('[出图] 失败 ' + (e.code || '?') + ' ' + (e.message || e));
    send(res, 502, { ok: false, error: { code: e.code || 'Unknown', message: e.message || '出图失败' } });
  }
}

/* 密钥和计数文件绝不通过 HTTP 发出去：同一 WiFi 下的手机能访问这个服务，
   也就有能力 fetch 到这些文件，所以一律 403。 */
function isPrivate(rel) {
  const base = rel.split('/').pop() || '';
  return base.charAt(0) === '.' || base === 'engine.config.json' ||
    base === 'server.log' || /\.env(\.|$)/.test(base);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || isPrivate(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 不提供该文件'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 找不到 ' + rel); return; }
    // 素材和脚本改动频繁，本地一律不缓存，避免看到旧图
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') { handleGenerate(req, res); return; }
  if (req.method === 'GET' && req.url === '/api/health') {
    const loaded = loadConfig();
    send(res, 200, {
      ok: true,
      provider: loaded.provider || 'none',
      configured: !loaded.error,
      note: loaded.error || 'ready',
      today: readCounter().count,
      limit: (loaded.cfg && loaded.cfg.maxRendersPerDay) || 20,
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('405'); return; }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  const loaded = loadConfig();
  const nets = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) nets.push(i.address);
    }
  }
  console.log('一键生成效果图 · 本机预览：http://localhost:' + PORT);
  if (nets.length) {
    console.log('同一 WiFi 下的手机访问：' + nets.map((n) => 'http://' + n + ':' + PORT).join('  '));
    console.log('提醒：同一 WiFi 里的人都能用这个页面出图，所以有 maxRendersPerDay 兜底。不在外面演示时把这个窗口关掉。');
  }
  console.log(loaded.error ? '出图引擎：未配置（' + loaded.error + '）' : '出图引擎：' + loaded.provider + '，每日上限 ' + (loaded.cfg.maxRendersPerDay || 20) + ' 张');
});
