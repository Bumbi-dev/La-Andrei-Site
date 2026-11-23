const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'contact-edge-profile');
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

  await openPage('contact.html');
  await command('Runtime.enable');
  const contact = await evaluate(`({active:document.querySelector('.topbar-items [aria-current=page]')?.dataset.nav, phone:document.querySelector('.contact-phone a')?.getAttribute('href'), map:document.querySelector('#location-map')?.getAttribute('src'), eager:document.querySelector('#location-map')?.loading, visible:document.querySelector('#location-map')?.getBoundingClientRect().height, manual:!!document.querySelector('#load-map'), ids:[...document.querySelectorAll('[id]')].map(el=>el.id)})`);
  assert.equal(contact.active,'contact');
  assert.equal(contact.phone,'tel:+40767666909');
  assert(contact.map.includes('45.78860777%2C24.15142839') && contact.eager==='eager' && contact.visible>=360 && !contact.manual);
  assert.equal(contact.ids.length,new Set(contact.ids).size);
  report.checks.push({name:'Automatic map and contact details',...contact});
  for (const width of [1440,768,390,320]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:width>1000?1080:844,deviceScaleFactor:1,mobile:width<600});
    await settled();
    await checkOverflow('contact-'+width);
    const layout=await evaluate(`(() => {const panel=document.querySelector('.contact-panel').getBoundingClientRect();const map=document.querySelector('.contact-map').getBoundingClientRect();return {sideBySide:map.left>=panel.right,stacked:map.top>=panel.bottom};})()`);
    assert(width>760?layout.sideBySide:layout.stacked,'Contact responsive layout '+width);
    if(width===1440||width===390) await screenshot('contact-layout-'+width+'.png');
  }
  await command('Emulation.setScriptExecutionDisabled',{value:true});
  await command('Page.navigate',{url:pathToFileURL(path.join(workspace,'contact.html')).href});
  await sleep(700);
  const dom=await command('DOM.getDocument');
  const mapNode=await command('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#location-map'});
  const mapAttributes=await command('DOM.getAttributes',{nodeId:mapNode.nodeId});
  assert(mapAttributes.attributes.includes('src') && !mapAttributes.attributes.includes('hidden'),'Automatic map without JavaScript');
  await command('Emulation.setScriptExecutionDisabled',{value:false});
  await openPage('contact.html');
  await sleep(3500);
  report.mapFrame=await command('Page.getFrameTree');
  await screenshot('contact-map-loaded.png',false);
  await openPage('index.html');
  assert(await evaluate(`!!document.querySelector('#location-map').getAttribute('src') && !document.querySelector('#location-map').hidden && !document.querySelector('#load-map')`),'Homepage automatic map');
  report.checks.push({name:'Maps work without activation, including without JavaScript',passed:true});
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
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
  if (profile.startsWith(safeParent) && path.basename(profile) === 'contact-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'contact-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
