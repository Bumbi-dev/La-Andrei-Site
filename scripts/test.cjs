const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const model = require('../content-model.js');
const { build, replaceRegion } = require('./build.cjs');
const fullMenu = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../content/site.json'), 'utf8'));
const data = { ...fullMenu, products: fullMenu.products.slice(0, 3) };
const copy = (value) => JSON.parse(JSON.stringify(value));
let assertions = 0;
function check(name, callback) { callback(); assertions += 1; console.log('OK ' + name); }

check('Source content validates without mutation', () => {
    const source = JSON.stringify(data);
    assert.equal(model.validate(data).products.length, 3);
    assert.equal(JSON.stringify(data), source);
});
check('The full catalog renders foods, drinks and unconfirmed quantities honestly', () => {
    const menu = model.validate(fullMenu);
    assert.ok(menu.products.length >= 14);
    assert.ok(!menu.products.some(item => ['sandwich-panini', 'sandwich-crispy-mare'].includes(item.id)));
    const html = model.renderMenu(menu);
    assert.equal((html.match(/data-product-id=/g) || []).length, menu.products.filter(item => item.visible).length);
    assert.equal((html.match(/<dialog\b/g) || []).length, menu.products.filter(item => item.visible).length);
    assert.ok(html.includes('330 ml'));
    assert.ok(html.includes('Gramaj de confirmat'));
    assert.ok(html.includes('Consultă ingredientele de pe ambalaj.'));
    assert.ok(!html.includes('null g'));
    const bad = copy(fullMenu); bad.products[0].unit = 'kg';
    assert.throws(() => model.validate(bad), /unitatea/);
});
check('Duplicate product IDs are rejected', () => {
    const invalid = copy(data);
    invalid.products[1].id = invalid.products[0].id;
    assert.throws(() => model.validate(invalid), /duplicat/);
});
check('Invalid prices, weights, ratings and category conflicts are rejected', () => {
    for (const [key, value] of [['price', -1], ['price', 2.001], ['grams', 0], ['grams', 4.5]]) {
        const invalid = copy(data); invalid.products[0][key] = value;
        assert.throws(() => model.validate(invalid));
    }
    const invalidRating = copy(data); invalidRating.reviews[0].rating = 6;
    assert.throws(() => model.validate(invalidRating));
    const conflict = copy(data); conflict.products[2].categoryLabel = 'Altă etichetă';
    assert.throws(() => model.validate(conflict), /aceeași categorie/);
});
check('Unsafe image paths and unofficial/action URLs are rejected', () => {
    for (const value of ['assets/../secret.jpg', 'assets/./image.jpg', 'https://example.com/image.jpg', 'assets\\image.jpg', 'assets/x.jpg" onerror="alert(1)']) {
        const invalid = copy(data); invalid.products[0].image = value;
        assert.throws(() => model.validate(invalid), /imagine/);
    }
    for (const value of ['javascript:alert(1)', 'https://food.bolt.eu.evil.test/shop', 'https://user:pass@food.bolt.eu/shop']) {
        const invalid = copy(data); invalid.business.boltUrl = value;
        assert.throws(() => model.validate(invalid), /HTTPS oficial/);
    }
    const invalidMap = copy(data); invalidMap.business.mapsUrl = 'https://www.google.com/url?q=https://evil.test';
    assert.throws(() => model.validate(invalidMap));
});
check('Hidden products disappear and unavailable products cannot be ordered', () => {
    const changed = copy(data);
    changed.products[0].visible = false;
    changed.products[1].available = false;
    const html = model.renderMenu(model.validate(changed));
    assert.ok(!html.includes('data-product-id="shaorma-mare"'));
    assert.ok(html.includes('Indisponibil momentan'));
    const article = html.match(/<article[^>]*data-product-id="kebab-farfurie"[\s\S]*?<\/article>/)[0];
    assert.ok(!article.includes('class="food-order'));
});
check('Text and attribute payloads stay escaped and reviews remain fictional', () => {
    const changed = copy(data);
    changed.products[0].name = '<script>alert("x")</script>';
    changed.products[0].imageAlt = '"><img src=x onerror=alert(1)>';
    changed.reviews[0].text = '<img src=x onerror=alert(1)>';
    const safe = model.validate(changed);
    assert.ok(model.renderMenu(safe).includes('&lt;script&gt;'));
    assert.ok(!model.renderMenu(safe).includes('<img src=x'));
    assert.ok(!model.renderReviews(safe).includes('<img src=x'));
    assert.equal((model.renderReviews(safe).match(/Exemplu — /g) || []).length, 3);
    const changedReview = copy(data); changedReview.reviews[0].isExample = false;
    assert.throws(() => model.validate(changedReview), /doar exemple fictive/);
    assert.ok(!model.renderSchema(safe).includes('aggregateRating'));
    assert.ok(!model.renderSchema(safe).includes('review'));
});
check('Missing/duplicate/out-of-order template markers fail safely', () => {
    assert.throws(() => replaceRegion('<main></main>', 'MENU', 'test'));
    assert.throws(() => replaceRegion('<!-- MENU:END --><!-- MENU:START -->', 'MENU', 'test'));
    assert.throws(() => replaceRegion('<!-- MENU:START --><!-- MENU:START --><!-- MENU:END -->', 'MENU', 'test'));
});
check('Product dialogs include portions, escaped ingredients and availability', () => {
    const changed = copy(data);
    changed.products[0].ingredients = ['Pui <test>', 'Cartofi'];
    changed.products[0].available = false;
    const html = model.renderMenu(model.validate(changed));
    assert.equal((html.match(/<dialog\b/g) || []).length, changed.products.length);
    const dialog = html.match(/<dialog[^>]*id="product-shaorma-mare"[\s\S]*?<\/dialog>/)[0];
    assert.ok(dialog.includes('700 g'));
    assert.ok(dialog.includes('Pui &lt;test&gt;'));
    assert.ok(dialog.includes('Indisponibil momentan'));
    assert.ok(!dialog.includes('target="_blank"'));
    assert.ok(html.includes('aria-haspopup="dialog"'));
});
check('Review avatars support safe local photos and default initials', () => {
    const normal = model.validate(data);
    assert.ok(model.renderReviews(normal).includes('class="review-avatar"'));
    assert.ok(model.renderReviews(normal).includes('aria-hidden="true">A</span>'));
    const changed = copy(data);
    changed.reviews[0].avatar = changed.products[0].image;
    assert.ok(model.renderReviews(model.validate(changed)).includes('width="44" height="44"'));
    for (const avatar of ['javascript:alert(1)', 'assets/../private.jpg', 'https://example.com/a.jpg']) {
        changed.reviews[0].avatar = avatar;
        assert.throws(() => model.validate(changed), /fotografia/);
    }
});

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'la-andrei-test-'));
try {
    fs.mkdirSync(path.join(fixture, 'content'));
    fs.mkdirSync(path.join(fixture, 'assets'));
    const sourcePath = path.join(fixture, 'content/site.json');
    const indexPath = path.join(fixture, 'index.html');
    const template = '<!doctype html><html><head><title>Vechi</title><meta name="description" content="Vechi"><meta property="og:title" content="Vechi"><meta property="og:description" content="Vechi"><!-- SCHEMA:START --><!-- SCHEMA:END --></head><body><nav><a data-nav="home" href="index.html">Acasă</a><a data-nav="menu" href="meniu.html">Meniu</a><a data-nav="contact" href="contact.html">Contact</a></nav><main id="continut"><!-- MENU:START --><!-- MENU:END --><section id="recenzii"><!-- REVIEWS:START --><!-- REVIEWS:END --></section><section id="locatie"><a data-business-link="bolt" href="https://old.example">Bolt</a><a data-business-phone href="tel:old">Telefon</a><span data-business-text="address">Vechi</span><iframe data-business-map src="old"></iframe><!-- BUSINESS:START --><!-- BUSINESS:END --></section></main></body></html>';
    fs.writeFileSync(indexPath, template);
    fs.writeFileSync(sourcePath, JSON.stringify(data));
    fs.writeFileSync(path.join(fixture, 'style.css'), 'body { margin: 0; }');
    fs.writeFileSync(path.join(fixture, 'navbar.js'), '');
    fs.writeFileSync(path.join(fixture, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    for (const product of data.products) fs.writeFileSync(path.join(fixture, product.image), 'fixture image');
    check('Build is idempotent and packages only public files', () => {
        build(fixture);
        const once = fs.readFileSync(indexPath, 'utf8');
        build(fixture);
        assert.equal(fs.readFileSync(indexPath, 'utf8'), once);
        assert.equal(fs.readFileSync(path.join(fixture, 'dist/index.html'), 'utf8'), once);
        assert.ok(fs.existsSync(path.join(fixture, 'dist/assets/real-shawarma-large.jpg')));
        assert.ok(!fs.existsSync(path.join(fixture, 'dist/editor.html')));
        assert.ok(!fs.existsSync(path.join(fixture, 'dist/content')));
        assert.ok(!fs.existsSync(path.join(fixture, 'dist/scripts')));
        const scope = {};
        vm.runInNewContext(fs.readFileSync(path.join(fixture, 'content/editor-data.js'), 'utf8'), { window: scope });
        assert.equal(scope.LA_ANDREI_CONTENT.products.length, 3);
    });
    check('Menu page includes every visible dish and contact page includes the location', () => {
        const changed = copy(data);
        changed.products.push({ ...changed.products[0], id: 'produs-suplimentar', name: 'Preparat suplimentar' });
        fs.writeFileSync(sourcePath, JSON.stringify(changed));
        build(fixture);
        const home = fs.readFileSync(indexPath, 'utf8');
        const menu = fs.readFileSync(path.join(fixture, 'meniu.html'), 'utf8');
        const contact = fs.readFileSync(path.join(fixture, 'contact.html'), 'utf8');
        assert.equal((home.match(/data-product-id=/g) || []).length, 3);
        assert.equal((menu.match(/data-product-id=/g) || []).length, 4);
        assert.ok(menu.includes('Preparat suplimentar'));
        assert.ok(menu.includes('data-nav="menu" href="meniu.html" aria-current="page"'));
        assert.ok(contact.includes('id="locatie"'));
        assert.ok(contact.includes(data.business.phone));
        const contactMap = contact.match(/<iframe\b[^>]*\bid="location-map"[^>]*>/)[0];
        assert.ok(contactMap.includes(' src="https://maps.google.com/maps?'));
        assert.ok(contactMap.includes('loading="eager"'));
        assert.ok(!contactMap.includes('hidden'));
        assert.ok(!contact.includes('id="load-map"'));
        assert.ok(contact.includes('data-nav="contact" href="contact.html" aria-current="page"'));
        assert.ok(!contact.includes('class="food-card'));
        for (const file of ['meniu.html', 'contact.html']) assert.equal(fs.readFileSync(path.join(fixture, 'dist', file), 'utf8'), fs.readFileSync(path.join(fixture, file), 'utf8'));
        fs.writeFileSync(sourcePath, JSON.stringify(data));
        build(fixture);
    });
    check('Business changes update links, contact details, metadata and schema', () => {
        const changed = copy(data);
        changed.business.name = 'Nume & nou'; changed.business.city = 'Oraș nou'; changed.business.address = 'Adresă nouă';
        changed.business.phone = ''; changed.business.email = 'contact@example.com'; changed.business.hours = ['Luni: 10:00–20:00'];
        fs.writeFileSync(sourcePath, JSON.stringify(changed));
        build(fixture);
        let generated = fs.readFileSync(indexPath, 'utf8');
        assert.ok(generated.includes('<title>Nume &amp; nou'));
        assert.ok(generated.includes('contact%40example.com'));
        assert.ok(generated.includes('Luni: 10:00–20:00'));
        assert.ok(generated.includes('<a hidden data-business-phone'));
        assert.ok(generated.includes('"addressLocality":"Oraș nou"'));
        const contact = fs.readFileSync(path.join(fixture, 'contact.html'), 'utf8');
        assert.ok(contact.includes('contact%40example.com'));
        assert.ok(contact.includes('Luni: 10:00–20:00'));
        assert.ok(!contact.includes('class="contact-phone"'));
        changed.business.phone = '+40123456789';
        fs.writeFileSync(sourcePath, JSON.stringify(changed)); build(fixture);
        generated = fs.readFileSync(indexPath, 'utf8');
        assert.ok(generated.includes('<a data-business-phone href="tel:+40123456789"'));
    });
    check('Hiding all reviews hides the entire section and can be reversed', () => {
        const changed = copy(data); changed.reviews.forEach(review => { review.visible = false; });
        fs.writeFileSync(sourcePath, JSON.stringify(changed)); build(fixture);
        assert.ok(fs.readFileSync(indexPath, 'utf8').includes('<section hidden id="recenzii">'));
        fs.writeFileSync(sourcePath, JSON.stringify(data)); build(fixture);
        assert.ok(fs.readFileSync(indexPath, 'utf8').includes('<section id="recenzii">'));
    });
    check('Deferred map URLs and dollar signs in business names remain intact', () => {
        fs.writeFileSync(indexPath, template.replace('data-business-map src="old"', 'data-business-map data-src="old"'));
        const changed = copy(data);
        changed.business.name = 'La $& Andrei';
        changed.business.mapsUrl = 'https://maps.google.com/?q=45.7,24.1';
        fs.writeFileSync(sourcePath, JSON.stringify(changed));
        build(fixture);
        const generated = fs.readFileSync(indexPath, 'utf8');
        assert.ok(generated.includes('<title>La $&amp; Andrei'));
        const frame = generated.match(/<iframe\b[^>]*>/)[0];
        assert.ok(frame.includes('data-src="https://maps.google.com/maps?q=45.7%2C24.1&amp;z=16&amp;output=embed"'));
        assert.ok(!/\ssrc=/.test(frame));
    });
    check('Malformed JSON, invalid source and missing images do not mutate index.html', () => {
        const before = fs.readFileSync(indexPath, 'utf8');
        for (const source of ['{"broken"', JSON.stringify({ ...data, version: 8 })]) {
            fs.writeFileSync(sourcePath, source);
            assert.throws(() => build(fixture));
            assert.equal(fs.readFileSync(indexPath, 'utf8'), before);
        }
        const changed = copy(data); changed.products[0].image = 'assets/missing.jpg';
        fs.writeFileSync(sourcePath, JSON.stringify(changed));
        assert.throws(() => build(fixture), /Imagine inexistentă/);
        assert.equal(fs.readFileSync(indexPath, 'utf8'), before);
    });
} finally {
    const resolved = path.resolve(fixture);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('la-andrei-test-')) throw new Error('Unsafe test cleanup target.');
    fs.rmSync(resolved, { recursive: true, force: true });
}
console.log('\n' + assertions + ' verificări trecute.');
