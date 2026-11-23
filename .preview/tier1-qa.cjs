const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const workspace = path.resolve(__dirname, '..');
const profile = path.resolve(__dirname, 'tier1-edge-profile');
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
  await evaluate('[...document.images].forEach(image => image.loading = "eager")');
  await sleep(500);
  const assets = await evaluate('[...document.images].map(image => ({src:image.getAttribute("src"),loaded:image.complete && image.naturalWidth > 0}))');
  assert(assets.every(asset => asset.loaded), 'Broken image: ' + JSON.stringify(assets));
  report.checks.push({ name:'local images', assets });
  const anchors = await evaluate(`[...document.querySelectorAll('a')].filter(link => link.getAttribute('href')?.startsWith('#')).map(link => ({href:link.getAttribute('href'),exists:!!document.getElementById(link.hash.slice(1))}))`);
  assert(anchors.every(anchor => anchor.exists), 'Broken local anchor: ' + JSON.stringify(anchors));
  report.checks.push({ name:'navigation anchors', anchors });

  const filterNames = await evaluate('[...document.querySelectorAll("[data-filter]")].map(button => button.dataset.filter)');
  for (const filter of filterNames) {
    const filterState = await evaluate(`(() => {
      const category = ${JSON.stringify(filter)};
      [...document.querySelectorAll('[data-filter]')].find(button => button.dataset.filter === category).click();
      return {category, visible:[...document.querySelectorAll('[data-category]')].filter(card => !card.hidden).map(card => card.dataset.category), pressed:[...document.querySelectorAll('[data-filter]')].filter(button => button.getAttribute('aria-pressed') === 'true').length};
    })()`);
    assert(filterState.visible.length > 0, 'Empty category: ' + filter);
    assert.equal(filterState.pressed, 1, 'Single active menu filter');
    if (filter !== 'all') assert(filterState.visible.every(category => category === filter), 'Wrong filtered category');
    report.checks.push({name:'menu filter', ...filterState});
  }
  await evaluate('document.querySelector(\'[data-filter="all"]\').click()');

  const scrolling = [];
  for (const top of [0,100,200,400,800,0]) {
    await evaluate(`scrollTo({top:${top},behavior:'instant'})`);
    await settled();
    scrolling.push(await evaluate(`({scrollY, opacity:Number(getComputedStyle(document.querySelector('.site-header')).getPropertyValue('--navbar-opacity').trim()),top:document.querySelector('.site-header').getBoundingClientRect().top})`));
  }
  assert(scrolling.every(state => Math.abs(state.top) <= 1), 'Sticky navbar');
  assert.equal(scrolling[0].opacity, 0, 'Transparent navbar at top');
  assert.equal(scrolling[4].opacity, 1, 'Solid navbar after scrolling');
  assert.equal(scrolling[5].opacity, 0, 'Fade reverses at top');
  report.checks.push({name:'navbar fade', scrolling});

  const reviews = await evaluate(`({text:document.querySelector('#recenzii').innerText, cards:[...document.querySelectorAll('#recenzii .review-card')].map(card => card.innerText)})`);
  assert(/exemplu|fictiv|demonstrativ/i.test(reviews.text), 'Example reviews clearly identified');
  assert(reviews.cards.length > 0, 'Review cards present');
  assert(reviews.cards.every(text => /exemplu|fictiv|demonstrativ/i.test(text)), 'Each review marked as example');
  report.checks.push({name:'demonstrative reviews', cards:reviews.cards.length});

  for (const width of [1440,900,390,320]) {
    await command('Emulation.setDeviceMetricsOverride', {width, height:width>900?1000:844, deviceScaleFactor:1,mobile:width<600});
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    await settled();
    await checkOverflow('site-' + width);
    const height = await evaluate('document.documentElement.scrollHeight');
    for (let top = 500; top < height; top += 700) {
      await evaluate(`scrollTo({top:${top},behavior:'instant'})`);
      await settled();
    }
    await screenshot('tier1-site-' + width + '.png');
    if (width === 1440) await screenshot('tier1-desktop-viewport.png',false);
  }

  const mobileMenu = await evaluate(`(() => {
    const button=document.querySelector('.menu-toggle');
    button.click();
    const opened={expanded:button.getAttribute('aria-expanded'),display:getComputedStyle(document.querySelector('#primary-navigation')).display};
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    return {opened,closed:button.getAttribute('aria-expanded')};
  })()`);
  assert.equal(mobileMenu.opened.expanded,'true');
  assert.notEqual(mobileMenu.opened.display,'none');
  assert.equal(mobileMenu.closed,'false');
  report.checks.push({name:'hamburger open and Escape close',...mobileMenu});

  const mapState = await evaluate(`(() => {
    const frame = document.querySelector('#location-map');
    const button = document.querySelector('#load-map');
    const preview = document.querySelector('#map-preview');
    const source = frame.dataset.src;
    const initial = {deferred: !frame.hasAttribute('src'), previewVisible: !preview.hidden, buttonVisible: !button.hidden};
    frame.dataset.src = 'about:blank';
    button.click();
    frame.dispatchEvent(new Event('load'));
    const opened = !frame.hidden && preview.hidden && !document.querySelector('#close-map').hidden;
    document.querySelector('#close-map').click();
    const closed = frame.hidden && !preview.hidden && !frame.hasAttribute('src');
    const nativeTimer = window.setTimeout;
    let timeout;
    window.setTimeout = (handler, delay, ...args) => delay === 12000 ? (timeout = handler, 0) : nativeTimer(handler, delay, ...args);
    button.click();
    timeout();
    window.setTimeout = nativeTimer;
    frame.dataset.src = source;
    return {initial, opened, closed, fallback: !preview.hidden && !button.disabled && document.querySelector('#map-status').textContent.includes('nu s-a încărcat')};
  })()`);
  assert(mapState.initial.deferred && mapState.initial.previewVisible && mapState.initial.buttonVisible, 'Map has a useful offline card and loads on demand');
  assert(mapState.opened && mapState.closed && mapState.fallback, 'Map UI supports opening, closing and a failed-load fallback');
  report.checks.push({name:'map deferred loading and fallback', ...mapState});

  await command('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await openPage('editor.html');
  await settled();
  await checkOverflow('editor-1440');
  const editorState=await evaluate(`({products:document.querySelectorAll('#product-list [data-product-id]').length, export:!!document.querySelector('#export-json'),import:!!document.querySelector('#import-json'),preview:document.querySelector('#product-preview').innerText})`);
  assert(editorState.products>=3,'Editor loads starter data from file URL');
  assert(editorState.export&&editorState.import,'Editor has import/export');
  assert(editorState.preview.length>0,'Product preview populated');
  report.checks.push({name:'editor starter data',...editorState});
  const previewRatio = await evaluate(`(() => { const rect = document.querySelector('#product-preview .food-image').getBoundingClientRect(); return rect.width / rect.height; })()`);
  assert(Math.abs(previewRatio - 1.6) < 0.1, 'Editor preview photo has a landscape ratio');
  report.checks.push({name:'editor preview image ratio', ratio:previewRatio});

  const editorEditing=await evaluate(`(() => {
    const form=document.querySelector('#product-form');
    const name=form.elements.namedItem('name');
    name.value='Produs verificare QA';
    name.dispatchEvent(new Event('input',{bubbles:true}));
    form.requestSubmit();
    return {preview:document.querySelector('#product-preview').innerText,status:document.querySelector('#editor-status').innerText};
  })()`);
  assert(editorEditing.preview.includes('Produs verificare QA'),'Editor product changes reflected in preview');
  report.checks.push({name:'editor product edit',...editorEditing});

  const addProduct=await evaluate(`(() => {
    document.querySelector('#add-product').click();
    const form=document.querySelector('#product-form');
    const values={id:'qa-produs',name:'Produs QA adăugat',category:'shaorma',categoryLabel:'Shaorma',grams:'500',price:'25',description:'Descriere pentru verificarea editorului.',ingredients:'pui, cartofi',allergens:'',image:'assets/real-shawarma-large.jpg',imageAlt:'Produs de verificare',badge:''};
    for (const [name,value] of Object.entries(values)) { const field=form.elements.namedItem(name); if (field) {field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));} }
    for (const name of ['available','visible']) { const field=form.elements.namedItem(name);if(field) field.checked=true; }
    form.requestSubmit();
    return {count:document.querySelectorAll('#product-list [data-product-id]').length,preview:document.querySelector('#product-preview').innerText,status:document.querySelector('#editor-status').innerText};
  })()`);
  assert.equal(addProduct.count,editorState.products+1,'Editor can add a product');
  assert(addProduct.preview.includes('Produs QA adăugat'),'New product preview');
  report.checks.push({name:'editor add product',...addProduct});

  const invalidImport=path.join(__dirname,'tier1-invalid-import.json');
  fs.writeFileSync(invalidImport,'{"version":1,');
  const documentNode=await command('DOM.getDocument');
  const fileInput=await command('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#import-json'});
  await command('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[invalidImport]});
  await sleep(250);
  const afterBadImport=await evaluate(`({count:document.querySelectorAll('#product-list [data-product-id]').length,preview:document.querySelector('#product-preview').innerText,status:document.querySelector('#editor-status').innerText})`);
  assert.equal(afterBadImport.count,addProduct.count,'Invalid import preserves products');
  assert(afterBadImport.preview.includes('Produs QA adăugat'),'Invalid import preserves current draft');
  report.checks.push({name:'editor invalid-import preservation',...afterBadImport});

  const downloadDirectory=path.join(__dirname,'tier1-downloads');
  fs.mkdirSync(downloadDirectory,{recursive:true});
  await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDirectory});
  await evaluate('document.querySelector("#export-json").click()');
  let exportedFile;
  for(let attempt=0;attempt<30;attempt++) {
    exportedFile=fs.readdirSync(downloadDirectory).find(name=>name.endsWith('.json'));
    if(exportedFile) break;
    await sleep(100);
  }
  assert(exportedFile,'Editor exports a JSON download');
  const exported=JSON.parse(fs.readFileSync(path.join(downloadDirectory,exportedFile),'utf8'));
  assert.equal(exported.products.length,addProduct.count,'Export contains all products');
  assert(exported.products.some(product=>product.name==='Produs QA adăugat'),'Export includes new product');
  report.checks.push({name:'editor JSON export',file:exportedFile,products:exported.products.length});

  const invalidPrice=await evaluate(`(() => {
    const input=document.querySelector('#product-form').elements.namedItem('price');
    input.value='-5';
    return {valid:input.checkValidity(),validation:input.validationMessage};
  })()`);
  assert.equal(invalidPrice.valid,false,'Negative price rejected by editor');
  report.checks.push({name:'editor negative-price validation',...invalidPrice});
  await openPage('editor.html');
  await screenshot('tier1-editor-desktop.png');
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await settled();
  await checkOverflow('editor-390');
  await screenshot('tier1-editor-mobile.png');
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
  if (profile.startsWith(safeParent) && path.basename(profile) === 'tier1-edge-profile') {
    try { fs.rmSync(profile, {recursive:true, force:true, maxRetries:2,retryDelay:150}); }
    catch (error) { report.cleanupWarning = error.message; }
  }
  fs.writeFileSync(path.join(__dirname, 'tier1-final-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
