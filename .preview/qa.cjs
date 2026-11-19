const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const directory = __dirname;
const profile = path.join(directory, 'edge-profile');
const portFile = path.join(profile, 'DevToolsActivePort');
const url = process.argv[2] || 'file:///C:/Users/Claudiu/Desktop/La-Andrei-Site/index.html';
fs.mkdirSync(profile, { recursive: true });
if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore', windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
let socket;
let id = 0;
const pending = new Map();
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(current, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function settled() {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(100);
}
async function screenshot(name, fullPage = true) {
  await evaluate('window.scrollTo({top:0,behavior:"instant"})');
  await settled();
  const metrics = await command('Page.getLayoutMetrics');
  const viewport = await evaluate('({width: innerWidth, height: innerHeight})');
  const image = await command('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: fullPage,
    clip: { x: 0, y: 0, width: viewport.width, height: fullPage ? metrics.cssContentSize.height : viewport.height, scale: 1 }
  });
  fs.writeFileSync(path.join(directory, name), Buffer.from(image.data, 'base64'));
}

(async () => {
  try {
    for (let attempt = 0; attempt < 150 && !fs.existsSync(portFile); attempt++) await delay(100);
    if (!fs.existsSync(portFile)) throw new Error('Edge did not expose a debugging port.');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
    });
    console.log('Connected browser:', await command('Browser.getVersion'));
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Log.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("document.readyState === 'complete' && [...document.images].every(image => image.complete)")) break;
      await delay(100);
    }
    await settled();
    const assets = await evaluate('[...document.images].map(image => ({src: image.getAttribute("src"), loaded: image.complete && image.naturalWidth > 0}))');
    assert(assets.every(asset => asset.loaded), 'Broken images: ' + JSON.stringify(assets));
    const anchors = await evaluate('[...document.querySelectorAll("a[href^=\"#\"]")].map(link => ({href:link.getAttribute("href"), exists:!!document.getElementById(link.hash.slice(1))}))');
    assert(anchors.every(anchor => anchor.exists), 'Invalid anchor destination: ' + JSON.stringify(anchors));
    const filters = {};
    for (const filter of ['all', 'shaorma', 'farfurie']) {
      await evaluate('document.querySelector(\'button[data-filter="' + filter + '"]\').click()');
      filters[filter] = await evaluate('[...document.querySelectorAll("article[data-category]")].filter(card => !card.hidden).map(card => card.dataset.category)');
      assert(filters[filter].length > 0, 'Filter returned no products: ' + filter);
      if (filter !== 'all') assert(filters[filter].every(category => category === filter), 'Incorrect filter: ' + filter);
    }
    await evaluate('document.querySelector(\'button[data-filter="all"]\').click()');
    const scrolling = [];
    for (const scrollY of [0, 100, 200, 400, 800, 0]) {
      await evaluate('window.scrollTo({top:' + scrollY + ',behavior:"instant"})');
      await settled();
      scrolling.push(await evaluate('({scrollY, opacity: getComputedStyle(document.querySelector(".site-header")).getPropertyValue("--navbar-opacity").trim(), top: document.querySelector(".site-header").getBoundingClientRect().top})'));
    }
    assert(scrolling.every(value => Math.abs(value.top) <= 1), 'Header failed to remain sticky: ' + JSON.stringify(scrolling));
    const viewports = [];
    for (const width of [1440, 390, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: width === 1440 ? 1050 : 844, deviceScaleFactor: 1, mobile: width !== 1440 });
      await evaluate('window.scrollTo({top:0,behavior:"instant"})');
      await settled();
      const layout = await evaluate('({width: innerWidth, documentWidth:document.documentElement.scrollWidth, overflowing:[...document.querySelectorAll("body *")].filter(element => {const rect=element.getBoundingClientRect();return rect.width && (rect.right>innerWidth+1 || rect.left < -1);}).map(element => ({tag:element.tagName,class:element.className})).slice(0,10)})');
      viewports.push(layout);
      assert(layout.documentWidth <= layout.width, 'Horizontal overflow: ' + JSON.stringify(layout));
      await screenshot(width === 1440 ? 'desktop.png' : 'mobile-' + width + '.png');
      if (width === 1440) await screenshot('desktop-viewport.png', false);
    }
    assert.equal(errors.length, 0, 'Browser errors: ' + JSON.stringify(errors));
    const report = { url, assets, anchors, filters, scrolling, viewports, errors };
    fs.writeFileSync(path.join(directory, 'qa-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { await command('Browser.close'); } catch (_) {}
      socket.close();
    }
    browser.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
