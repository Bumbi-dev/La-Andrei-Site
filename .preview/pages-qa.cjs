const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'pages-edge-profile');
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

  async function revealAll() {
    const height = await evaluate('document.documentElement.scrollHeight');
    for(let top=0;top<height;top+=650) {
      await evaluate('scrollTo({top:'+top+',behavior:"instant"})');
      await settled();
    }
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    await sleep(600);
  }

  async function checkProductPopup(label) {
    await evaluate('document.querySelector(".food-photo-trigger").click()');
    await settled();
    const state=await evaluate('(() => {const dialog=document.querySelector(".product-dialog[open]");return {open:!!dialog,modal:dialog?.matches(":modal"),ingredients:dialog?.querySelectorAll(".product-ingredient-list li").length,portion:dialog?.querySelector(".product-dialog-facts").textContent,focusInside:!!document.activeElement.closest(".product-dialog"),overflow:dialog ? dialog.scrollWidth > dialog.clientWidth : false};})()');
    assert(state.open&&state.modal&&state.ingredients>0&&state.portion.includes('700 g')&&state.focusInside&&!state.overflow,label+': product popup');
    report.checks.push({name:label+' product popup',...state});
    await screenshot('pages-popup-'+label+'.png',false);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await settled();
    const closed=await evaluate('({open:!!document.querySelector(".product-dialog[open]"),focusReturned:document.activeElement.matches(".food-photo-trigger"),unlocked:!document.body.classList.contains("dialog-open")})');
    assert(!closed.open&&closed.focusReturned&&closed.unlocked,label+': Escape closes and restores focus '+JSON.stringify(closed));
    await evaluate('document.querySelector(".food-card .food-description").click()');
    await settled();
    assert(await evaluate('!!document.querySelector(".product-dialog[open]")'),label+': card area opens popup');
    await evaluate('document.querySelector(".product-dialog[open] .product-dialog-close button").click()');
    await settled();
    assert(await evaluate('!document.querySelector(".product-dialog[open]")'),label+': close button works');
    await evaluate('(() => {const link=document.querySelector(".food-card .food-order");link.addEventListener("click",event=>event.preventDefault(),{once:true});link.click();})()');
    assert(await evaluate('!document.querySelector(".product-dialog[open]")'),label+': ordering link does not open details');
  }

  for(const [filename,active] of [['index.html','home'],['meniu.html','menu'],['contact.html','contact']]) {
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await openPage(filename);
    await evaluate('[...document.images].forEach(image=>image.loading="eager")');
    await sleep(300);
    const state=await evaluate('({active:document.querySelector(".topbar-items [aria-current=page]")?.dataset.nav,cards:document.querySelectorAll(".food-card").length,ids:[...document.querySelectorAll("[id]")].map(element=>element.id),images:[...document.images].every(image=>image.complete&&image.naturalWidth>0)})');
    assert.equal(state.active,active,filename+': active navigation');
    assert.equal(state.ids.length,new Set(state.ids).size,filename+': unique IDs');
    assert(state.images,filename+': local images load');
    if(filename==='contact.html') {
      const contact=await evaluate('({location:!!document.querySelector("#locatie"),phone:!!document.querySelector("a[href^=tel]"),map:!!document.querySelector("#location-map"),enabled:!document.querySelector("#load-map").hidden,deferred:!document.querySelector("#location-map").hasAttribute("src")})');
      assert(contact.location&&contact.phone&&contact.map&&contact.enabled&&contact.deferred,'Contact and location share a working page');
      assert.equal(state.cards,0);
      report.checks.push({name:'Contact and location',...contact});
    } else {
      assert.equal(state.cards,3,filename+': configured dishes');
      await checkProductPopup(filename.replace('.html','')+'-desktop');
      const filtering=await evaluate('(() => {document.querySelector("[data-filter=farfurie]").click();const count=document.querySelectorAll(".food-card:not([hidden])").length;document.querySelector("[data-filter=all]").click();return count;})()');
      assert.equal(filtering,1,filename+': category filter');
    }
    for(const width of [1440,390,320]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:width===1440?1000:844,deviceScaleFactor:1,mobile:width<600});
      await settled();
      await revealAll();
      await checkOverflow(filename+'-'+width);
      await screenshot('pages-'+filename.replace('.html','')+'-'+width+'.png');
      if(width===390) {
        const nav=await evaluate('(() => {const button=document.querySelector(".menu-toggle");button.click();const opened=button.getAttribute("aria-expanded");button.click();return opened;})()');
        assert.equal(nav,'true','Mobile menu '+filename);
        if(filename!=='contact.html') await checkProductPopup(filename.replace('.html','')+'-mobile');
      }
    }
    if(filename==='index.html') {
      const avatars=await evaluate('[...document.querySelectorAll(".review-avatar")].map(element=>({round:getComputedStyle(element).borderRadius,width:element.offsetWidth,height:element.offsetHeight,text:element.textContent}))');
      assert.equal(avatars.length,3);
      assert(avatars.every(avatar=>avatar.round==='50%'&&avatar.width===avatar.height&&avatar.width>0),'Round review profile avatars');
      report.checks.push({name:'Review avatars',avatars});
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await openPage('editor.html');
  await evaluate('document.querySelector("[data-panel=reviews]").click()');
  assert(await evaluate('!!document.querySelector("#review-form input[name=avatar]")'),'Editor supports review profile photos');
  report.checks.push({name:'Editor avatar field',present:true});
  assert.equal(report.errors.length,0,'Browser JavaScript errors: '+JSON.stringify(report.errors));
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
  if (profile.startsWith(safeParent) && path.basename(profile) === 'pages-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'pages-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
