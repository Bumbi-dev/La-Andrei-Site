const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'modal-layout-edge-profile');
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
  for(const width of [1440,390,320]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:width===1440?1000:844,deviceScaleFactor:1,mobile:width<600});
    await settled();
    await evaluate('document.querySelectorAll(".food-photo-trigger")[1].click()');
    await evaluate('[...document.querySelector(".product-dialog[open]").querySelectorAll("img")].forEach(image=>image.loading="eager")');
    await sleep(200);
    const geometry=await evaluate('(() => {const dialog=document.querySelector(".product-dialog[open]"); const rect=selector=>{const r=dialog.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}; return {hero:rect(".product-dialog-hero"),heading:rect(".product-dialog-heading"),details:rect(".product-dialog-details"),order:rect(".product-dialog-order"),button:rect(".product-dialog-order .button"),price:rect(".product-dialog-facts .food-price"),dialogWidth:dialog.clientWidth,overflow:dialog.scrollWidth>dialog.clientWidth};})()');
    assert(!geometry.overflow,'No modal overflow at '+width);
    assert(Math.abs(geometry.hero.width-geometry.dialogWidth)<2,'Full-width top image at '+width);
    assert(geometry.heading.top>=geometry.hero.top&&geometry.heading.bottom<=geometry.hero.bottom,'Category/title overlap image at '+width);
    assert(geometry.details.top>=geometry.hero.bottom,'Details below image at '+width);
    assert(geometry.button.top>=geometry.details.bottom,'Text is above the final button row');
    assert(Math.abs(geometry.button.right-geometry.details.right)<2,'Button is aligned bottom right');
    assert(Math.abs(geometry.order.width-geometry.details.width)<2,'Text and button row span the same full width');
    const borders=await evaluate('(() => {const style=getComputedStyle(document.querySelector(".product-dialog[open] .product-dialog-order"));return {left:style.borderLeftWidth,top:style.borderTopWidth};})()');
    assert(borders.left==='0px'&&borders.top==='0px','No separator beside or above the button');
    report.checks.push({name:'Horizontal dialog '+width,geometry});
    await screenshot('modal-horizontal-'+width+'.png',false);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await settled();
    assert(await evaluate('!document.querySelector(".product-dialog[open]")'),'Escape closes '+width);
  }
  assert.equal(report.errors.length,0,'No JavaScript errors');
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
  if (profile.startsWith(safeParent) && path.basename(profile) === 'modal-layout-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'modal-layout-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
