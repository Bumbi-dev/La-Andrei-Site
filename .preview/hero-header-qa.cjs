const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'hero-header-edge-profile');
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


  await openPage('index.html');
  await command('Runtime.enable');
  for(const width of [1440,390,320]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:width===1440?1000:844,deviceScaleFactor:1,mobile:width<600});
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    await settled();
    await sleep(200);
    const initial=await evaluate('(() => { const header=document.querySelector(".site-header");const image=document.querySelector(".hero-photo");const hero=document.querySelector(".hero");const background=getComputedStyle(header).backgroundColor;const numbers=background.match(/[0-9.]+/g).map(Number);return {headerTop:header.getBoundingClientRect().top,headerBottom:header.getBoundingClientRect().bottom,heroTop:hero.getBoundingClientRect().top,imageTop:image.getBoundingClientRect().top,headingTop:document.querySelector("h1").getBoundingClientRect().top,alpha:numbers.length===4?numbers[3]:1,background,blur:getComputedStyle(header).backdropFilter,imageLoaded:image.complete&&image.naturalWidth>0,source:image.getAttribute("src"),preload:document.querySelector("link[rel=preload]")?.getAttribute("href")};})()');
    assert.equal(initial.alpha,0,'Navbar is initially transparent '+width);
    assert.equal(initial.blur,'blur(0px)','Navbar has no initial blur '+width);
    assert(Math.abs(initial.heroTop)<2&&Math.abs(initial.imageTop)<2,'Hero image extends behind navbar '+width);
    assert(initial.headingTop>=initial.headerBottom,'Hero heading stays below navbar '+width);
    assert(initial.imageLoaded&&initial.source==='assets/hero-shaorma-slate.jpg'&&initial.preload===initial.source,'Edited hero photo loaded '+width);
    report.checks.push({name:'Hero and navbar initial '+width,...initial});
    await checkOverflow('hero-'+width);
    await screenshot('hero-navbar-start-'+width+'.png',false);
    for(const top of [200,400,800,0]) {
      await evaluate('scrollTo({top:'+top+',behavior:"instant"})');
      await settled();
      const state=await evaluate('(() => {const h=document.querySelector(".site-header");const nums=getComputedStyle(h).backgroundColor.match(/[0-9.]+/g).map(Number);return {scroll:scrollY,top:h.getBoundingClientRect().top,rgb:nums.slice(0,3),alpha:nums.length===4?nums[3]:1};})()');
      const expected=Math.min(Math.max(state.scroll/400,0),1)*0.82;
      assert(Math.abs(state.alpha-expected)<0.015,'Gradual translucent background '+width+' at '+top);
      assert(state.alpha<1&&state.rgb.every(channel=>channel===24)&&Math.abs(state.top)<1,'Dark grey semi-transparent sticky navbar');
      report.checks.push({name:'Navbar scroll '+width,...state});
      if(top===400&&width===1440) await screenshot('hero-navbar-scrolled-1440.png',false);
    }
    if(width<600) {
      const opened=await evaluate('(() => {const b=document.querySelector(".menu-toggle");b.click();return b.getAttribute("aria-expanded");})()');
      assert.equal(opened,'true');
      await settled();
      await evaluate('document.querySelector(".menu-toggle").click()');
      await settled();
      assert(Math.abs(await evaluate('document.querySelector(".hero").getBoundingClientRect().top'))<2,'Hero stays aligned after mobile menu closes');
    }
  }
  for(const file of ['meniu.html','contact.html']) {
    await openPage(file);
    const spacing=await evaluate('({header:document.querySelector(".site-header").getBoundingClientRect().bottom,main:document.querySelector("main").getBoundingClientRect().top})');
    assert(spacing.main>=spacing.header-1,'Inner page content keeps its normal navbar space: '+file);
    report.checks.push({name:'Inner page spacing '+file,...spacing});
  }
  assert.equal(report.errors.length,0,'No browser JavaScript errors');
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
  if (profile.startsWith(safeParent) && path.basename(profile) === 'hero-header-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'hero-header-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
