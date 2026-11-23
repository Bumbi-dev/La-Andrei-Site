const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'catalog-edge-profile');
const report = { checks: [], viewports: [], errors: [], screenshots: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
let browser;
let socket;
let nextId = 0;

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 6000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}

async function settled() {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await sleep(90);
}

async function openPage(filename) {
  await command('Page.navigate', { url: pathToFileURL(path.join(workspace, filename)).href });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate('document.readyState !== "loading"')) break;
    await sleep(100);
  }
  await settled();
}

async function checkOverflow(label) {
  const layout = await evaluate(`({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && (rect.right > innerWidth + 1 || rect.left < -1) && getComputedStyle(element).position !== 'absolute';
    }).slice(0,8).map(element => ({tag:element.tagName, class: element.className})) })`);
  report.viewports.push({ label, ...layout });
  assert(layout.documentWidth <= layout.width, 'Horizontal overflow: ' + JSON.stringify({ label, ...layout }));
}

async function screenshot(filename, full = true) {
  await evaluate('scrollTo({top:0,behavior:"instant"})');
  await settled();
  const dimensions = await evaluate('({width:innerWidth, height:document.documentElement.scrollHeight, viewport:innerHeight})');
  const shot = await command('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: full,
    clip: { x:0, y:0, width:dimensions.width, height:full ? dimensions.height : dimensions.viewport, scale:1 }
  });
  fs.writeFileSync(path.join(__dirname, filename), Buffer.from(shot.data, 'base64'));
  report.screenshots.push(filename);
}

async function main() {
  fs.mkdirSync(profile, {recursive:true});
  const portFile = path.join(profile, 'DevToolsActivePort');
  if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
  browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide:true, stdio:'ignore' });
  for (let attempt = 0; attempt < 80 && !fs.existsSync(portFile); attempt++) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Headless Edge did not expose its local debugging port.');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', {signal:AbortSignal.timeout(3000)})).json();
  const page = targets.find(target => target.type === 'page');
  if (!page) throw new Error('Headless Edge did not create a page target.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); }),
    sleep(3000).then(() => { throw new Error('WebSocket connection timeout.'); })
  ]);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails);
  });
  report.browser = await command('Browser.getVersion');
  await command('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });



  await openPage('meniu.html');
  await command('Runtime.enable');
  await evaluate('[...document.images].forEach(image=>image.loading="eager")');
  let images;
  for(let i=0;i<30;i++) {
    images=await evaluate('[...document.images].map(image=>({src:image.getAttribute("src"),ok:image.complete&&image.naturalWidth>0}))');
    if(images.every(image=>image.ok)) break;
    await sleep(100);
  }
  assert(images.every(image=>image.ok),'Images loaded: '+JSON.stringify(images.filter(image=>!image.ok)));
  const count=await evaluate('document.querySelectorAll(".food-card").length');
  assert.equal(count,16);
  report.checks.push({name:'Full menu',products:count,images:images.length});
  const filters=await evaluate('[...document.querySelectorAll("[data-filter]")].map(button=>button.dataset.filter)');
  for(const category of filters) {
    const state=await evaluate('(() => {document.querySelector("[data-filter='+category+']").click();return [...document.querySelectorAll(".food-card:not([hidden])")].map(card=>card.dataset.category);})()');
    assert(state.length>0&&state.every(item=>category==='all'||item===category));
    if(category==='bauturi') assert.equal(state.length,5);
    report.checks.push({category,count:state.length});
  }
  await evaluate('document.querySelector("[data-filter=all]").click()');
  for(const [id,expected] of [['sprite-330','330 ml'],['sandwich-panini','De confirmat la restaurant'],['kebab-box','200 g']]) {
    await evaluate('document.querySelector("[data-product-id='+id+'] .food-photo-trigger").click()');
    await settled();
    const portion=await evaluate('document.querySelector(".product-dialog[open] .product-dialog-facts").textContent');
    assert(portion.includes(expected),id+': '+portion);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await settled();
    report.checks.push({name:id,portion});
  }
  for(const width of [1440,390,320]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    await settled();
    await checkOverflow('catalog-'+width);
    await screenshot('catalog-'+width+'.png',false);
  }
  await openPage('editor.html');
  assert.equal(await evaluate('document.querySelectorAll("#product-list [data-product-id]").length'),16);
  await evaluate('document.querySelector("#product-list [data-product-id=cola-330]").click()');
  assert.equal(await evaluate('document.querySelector("#product-form").elements.namedItem("unit").value'),'ml');
  await evaluate('document.querySelector("#product-list [data-product-id=sandwich-panini]").click()');
  assert.equal(await evaluate('document.querySelector("#product-form").elements.namedItem("grams").value'),'');
  assert.equal(report.errors.length,0,'No JS errors');
}
main().catch(error => { report.failure = error.message; process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({id:++nextId,method:'Browser.close'}));
    await sleep(350);
    socket.close();
  }
  if (browser?.pid) spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore', timeout:5000});
  await sleep(250);
  const safeParent = path.resolve(workspace, '.preview') + path.sep;
  if (profile.startsWith(safeParent) && path.basename(profile) === 'catalog-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'catalog-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
