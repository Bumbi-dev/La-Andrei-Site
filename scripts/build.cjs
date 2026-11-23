const fs = require('node:fs');
const path = require('node:path');
const model = require('../content-model.js');

function replaceRegion(html, name, rendered, required = true) {
    const start = '<!-- ' + name + ':START -->';
    const end = '<!-- ' + name + ':END -->';
    const startPosition = html.indexOf(start);
    const endPosition = html.indexOf(end);
    if (startPosition === -1 || endPosition === -1) {
        if (required) throw new Error('Lipsesc marcajele ' + name + ' din index.html.');
        return html;
    }
    if (endPosition <= startPosition || html.indexOf(start, startPosition + start.length) !== -1 || html.indexOf(end, endPosition + end.length) !== -1) throw new Error('Marcajele ' + name + ' trebuie să apară exact o dată și în ordinea corectă.');
    return html.slice(0, startPosition + start.length) + '\n' + rendered + '\n' + html.slice(endPosition);
}

function updateMetadata(html, title, description) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + model.escapeHtml(title) + '</title>');
    html = html.replace(/(<meta\b[^>]*\bname="description"[^>]*\bcontent=")[^"]*(")/, (_, before, after) => before + model.escapeHtml(description) + after);
    return html.replace(/(<meta\b[^>]*\bproperty="og:(title|description)"[^>]*\bcontent=")[^"]*(")/g, (_, before, type, after) => before + model.escapeHtml(type === 'title' ? title : description) + after);
}

function activeNavigation(html, page) {
    return html.replace(/<a\b[^>]*\bdata-nav="([^"]+)"[^>]*>/g, (link, destination) => {
        const clean = link.replace(/\s+aria-current="[^"]*"/g, '');
        return destination === page ? clean.replace(/>$/, ' aria-current="page">') : clean;
    });
}

function pageShell(home, main, page, title, description) {
    if (!/<main\b[^>]*>[\s\S]*?<\/main>/.test(home)) throw new Error('Lipsește elementul main din pagina de pornire.');
    let html = home.replace(/<main\b[^>]*>[\s\S]*?<\/main>/, () => main);
    html = html.replace(/\s*<link\b[^>]*\brel="preload"[^>]*>/g, '');
    html = html.replace(/<a\b[^>]*\bdata-home-only\b[^>]*>[\s\S]*?<\/a>/g, '');
    return activeNavigation(updateMetadata(html, title, description), page);
}

function mapSource(business) {
    const query = new URL(business.mapsUrl).searchParams.get('q') || business.address + ', ' + business.city;
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(query) + '&z=16&output=embed';
}

function createPages(home, data) {
    const h = model.escapeHtml;
    const business = data.business;
    const menuMain = '<main id="continut" class="inner-page"><section class="page-intro" aria-labelledby="menu-page-title"><div class="container">' +
        '<p class="breadcrumbs"><a href="index.html">Acasă</a><span aria-hidden="true">/</span>Meniu</p><p class="eyebrow">Shaorma & kebab · ' + h(business.city) + '</p>' +
        '<h1 id="menu-page-title">Meniul <span>' + h(business.name) + '.</span></h1><p class="page-description">În lipie sau la farfurie? Alege un preparat pentru ingrediente, gramaj și preț.</p></div></section>' +
        '<section class="menu-section section-space" id="meniu" aria-label="Toate preparatele"><div class="container">' + model.renderMenu(data) +
        '<p class="menu-ingredient-note">Ai întrebări despre ingrediente sau alergeni? <a href="contact.html">Contactează restaurantul.</a></p>' +
        '<div class="menu-footer"><p>Ți-ai ales preferatul?</p><a class="text-link bolt-link" href="' + h(business.boltUrl) + '" target="_blank" rel="noopener noreferrer">Comandă pe Bolt Food</a></div></div></section></main>';
    const pin = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    const phone = business.phone.replace(/[^+\d]/g, '');
    const phoneLabel = business.phone.replace(/^(\+40)(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4');
    const extraDetails = model.renderBusiness({ ...data, business: { ...business, phone: '' } });
    const contactMain = `<main id="continut" class="inner-page contact-page">
        <section class="page-intro contact-intro" id="contact" aria-labelledby="contact-page-title"><div class="container">
            <p class="breadcrumbs"><a href="index.html">Acasă</a><span aria-hidden="true">/</span>Contact & locație</p>
            <p class="eyebrow">${h(business.name)} · ${h(business.city)}</p>
            <h1 id="contact-page-title">Pofta te aduce <span>la noi.</span></h1>
            <p class="page-description">Te așteptăm la ${h(business.name)}. Găsește-ne pe hartă, sună-ne sau comandă gustul preferat acasă.</p>
        </div></section>
        <section class="contact-section" id="locatie" aria-label="Date de contact și harta restaurantului"><div class="container contact-layout">
            <div class="contact-panel">
                <div class="contact-address">
                    <span class="contact-icon">${pin}</span>
                    <p class="contact-kicker">Vino pe la noi</p>
                    <h2>${h(business.name)}</h2>
                    <address>${h(business.address)}<br>${h(business.city)}</address>
                    <a class="button button-primary" href="${h(business.mapsUrl)}" target="_blank" rel="noopener noreferrer">Deschide în Google Maps</a>
                </div>
                ${phone ? `<div class="contact-phone"><span class="contact-icon"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 3 4 1 1 5-2 2a15 15 0 0 0 5 5l2-2 5 1 1 4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 2-2Z"/></svg></span><div><p class="contact-kicker">Ai o întrebare? Sună-ne</p><a href="tel:${h(phone)}">${h(phoneLabel)}</a></div></div>` : ''}
                ${business.email || business.hours.length ? `<div class="contact-details contact-extra">${extraDetails}</div>` : ''}
                <div class="contact-delivery"><p class="contact-kicker">Preferi să rămâi acasă?</p><h3>Venim noi cu gustul bun.</h3><p>Alege ce îți place din meniu și comandă prin Bolt Food.</p><a class="button button-primary bolt-link" href="${h(business.boltUrl)}" target="_blank" rel="noopener noreferrer">Comandă pe Bolt Food</a></div>
            </div>
            <div class="contact-map">
                <div class="contact-map-heading"><div><p class="contact-kicker">La un drum distanță</p><h2>Ne găsești aici.</h2></div><span class="contact-city">${h(business.city)}</span></div>
                <iframe id="location-map" data-business-map title="Harta restaurantului ${h(business.name)}, ${h(business.address)}, ${h(business.city)}" src="${h(mapSource(business))}" width="800" height="520" loading="eager" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
                <div class="contact-map-footer">${pin}<p><strong>${h(business.name)}</strong><span>${h(business.address)}, ${h(business.city)}</span></p><a href="${h(business.mapsUrl)}" target="_blank" rel="noopener noreferrer">Indicații de orientare</a></div>
            </div>
        </div></section>
    </main>`;
    return {
        'index.html': activeNavigation(home, 'home'),
        'meniu.html': pageShell(home, menuMain, 'menu', 'Meniu · ' + business.name + ' · ' + business.city, 'Toate preparatele ' + business.name + ': ingrediente, gramaje și prețuri. Alege shaorma sau kebab și comandă prin Bolt Food.'),
        'contact.html': pageShell(home, contactMain, 'contact', 'Contact și locație · ' + business.name + ' · ' + business.city, 'Găsește ' + business.name + ' în ' + business.city + '. Adresa restaurantului, telefon și indicații de orientare.')
    };
}

function build(directory = path.resolve(__dirname, '..')) {
    const source = path.join(directory, 'content', 'site.json');
    const data = model.validate(JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')));
    for (const product of data.products) {
        const imagePath = path.resolve(directory, product.image);
        const assetRoot = path.join(directory, 'assets') + path.sep;
        if (!imagePath.startsWith(assetRoot) || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) throw new Error('Imagine inexistentă pentru ' + product.name + ': ' + product.image);
    }
    const indexPath = path.join(directory, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = replaceRegion(html, 'MENU', model.renderMenu(data, { limit: 3 }));
    html = replaceRegion(html, 'REVIEWS', model.renderReviews(data));
    html = replaceRegion(html, 'BUSINESS', model.renderBusiness(data), false);
    html = replaceRegion(html, 'SCHEMA', model.renderSchema(data), false);
    const title = data.business.name + ' · Shaorma & Kebab în ' + data.business.city;
    const description = data.business.name + ': shaorma și kebab în ' + data.business.city + '. Descoperă meniul, ingredientele și prețurile. Comandă prin Bolt Food sau găsește locația noastră.';
    html = updateMetadata(html, title, description);
    html = html.replace(/<section\b[^>]*\bid="recenzii"[^>]*>/, (section) => {
        const visibleSection = section.replace(/\s+hidden(?:="[^"]*")?/g, '');
        return data.reviews.some(review => review.visible) ? visibleSection : visibleSection.replace('<section ', '<section hidden ');
    });
    // Declarative links and text let the template keep its layout while sharing the same source.
    html = html.replace(/(<a\b[^>]*\bdata-business-link="(bolt|maps)"[^>]*\bhref=")[^"]*(")/g, (_, before, type, after) => before + model.escapeHtml(type === 'bolt' ? data.business.boltUrl : data.business.mapsUrl) + after);
    html = html.replace(/(<(?:span|strong)\b[^>]*\bdata-business-text="(name|city|address)"[^>]*>)[\s\S]*?(<\/(?:span|strong)>)/g, (_, before, key, after) => before + model.escapeHtml(data.business[key]) + after);
    html = html.replace(/<a\b[^>]*\bdata-business-phone\b[^>]*>[\s\S]*?<\/a>/g, (link) => {
        let result = link.replace(/\s+hidden(?:="[^"]*")?/g, '');
        result = result.replace(/\bhref="[^"]*"/, 'href="' + (data.business.phone ? 'tel:' + data.business.phone.replace(/[^+\d]/g, '') : '#contact') + '"');
        if (!data.business.phone) result = result.replace('<a ', '<a hidden ');
        return result;
    });
    html = html.replace(/<iframe\b[^>]*\bdata-business-map\b[^>]*>/g, (frame) => {
        const source = mapSource(data.business);
        return frame.replace(/(\s(?:data-)?src=")[^"]*(")/, (_, before, after) => before + model.escapeHtml(source) + after);
    });
    const pages = createPages(html, data);
    const referencedAssets = new Set(Array.from(Object.values(pages).join('\n').matchAll(/\b(?:src|href)="(assets\/[a-zA-Z0-9_./-]+)"/g), (match) => match[1]));
    for (const asset of referencedAssets) {
        const assetPath = path.resolve(directory, asset);
        if (!assetPath.startsWith(path.join(directory, 'assets') + path.sep) || !fs.existsSync(assetPath)) throw new Error('Fișierul public lipsește: ' + asset);
    }
    const editorData = 'window.LA_ANDREI_CONTENT = ' + JSON.stringify(data, null, 2).replace(/</g, '\\u003c') + ';\n';
    fs.mkdirSync(path.join(directory, 'content'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'content', 'editor-data.js'), editorData, 'utf8');
    const output = path.join(directory, 'dist');
    fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
    for (const [filename, page] of Object.entries(pages)) {
        fs.writeFileSync(path.join(directory, filename), page, 'utf8');
        fs.writeFileSync(path.join(output, filename), page, 'utf8');
    }
    for (const filename of ['style.css', 'navbar.js', 'robots.txt']) {
        if (fs.existsSync(path.join(directory, filename))) fs.copyFileSync(path.join(directory, filename), path.join(output, filename));
    }
    for (const asset of referencedAssets) {
        const assetPath = path.resolve(directory, asset);
        const destination = path.join(output, asset);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(assetPath, destination);
    }
    return { products: data.products.length, visibleProducts: data.products.filter(item => item.visible).length, exampleReviews: data.reviews.filter(review => review.visible).length };
}

if (require.main === module) {
    try {
        const result = build();
        console.log('Site actualizat: ' + result.visibleProducts + ' produse afișate și ' + result.exampleReviews + ' recenzii demonstrative.');
    } catch (error) {
        console.error('Actualizarea a fost oprită: ' + error.message);
        process.exitCode = 1;
    }
}

module.exports = { build, replaceRegion };
