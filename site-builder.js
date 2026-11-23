(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./content-model.js'));
    else root.LaAndreiSite = factory(root.LaAndreiContent);
}(globalThis, function (model) {
    'use strict';

    const publicFiles = Object.freeze(['style.css', 'navbar.js', 'robots.txt', 'servicii.css', 'servicii.js']);

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
        if (page === 'cart' || page === 'account') html = html.replace('</head>', '<meta name="robots" content="noindex,follow">\n</head>');
        return activeNavigation(updateMetadata(html, title, description), page);
    }

    function mapSource(business) {
        const query = new URL(business.mapsUrl).searchParams.get('q') || business.address + ', ' + business.city;
        return 'https://maps.google.com/maps?q=' + encodeURIComponent(query) + '&z=16&output=embed';
    }

    function checkoutPage(business) {
        const h = model.escapeHtml;
        return `<main id="continut" class="inner-page shop-page" data-checkout-page>
            <section class="page-intro"><div class="container">
                <p class="breadcrumbs"><a href="meniu.html">Meniu</a><span aria-hidden="true">/</span>Coșul tău</p>
                <p class="eyebrow">Mai aproape de poftă</p><h1>Coșul <span>tău.</span></h1>
                <p class="shop-demo-note">Demo interactiv · comenzile și plățile sunt simulate.</p>
            </div></section>
            <div class="container shop-checkout-layout" id="checkout-content">
                <div>
                    <section class="shop-panel" aria-labelledby="basket-title"><div class="shop-panel-heading"><h2 id="basket-title">Ce ai ales</h2><a href="meniu.html">Mai adaugă ceva</a></div><div id="basket-items"></div></section>
                    <form id="checkout-form" class="shop-panel" hidden>
                        <h2>Cum primești comanda?</h2>
                        <fieldset class="shop-segment"><legend class="visually-hidden">Metodă de primire</legend><label><input type="radio" name="fulfillment" value="pickup" checked> Ridicare</label><label><input type="radio" name="fulfillment" value="delivery"> Livrare</label></fieldset>
                        <p id="pickup-address" class="shop-muted">${h(business.name)} · ${h(business.address)}, ${h(business.city)}</p>
                        <label class="shop-field" id="delivery-address" hidden>Adresă de livrare în ${h(business.city)}<input name="address" placeholder="Stradă, număr, apartament" maxlength="200" autocomplete="off"><small>Pentru previzualizare, folosește o adresă fictivă.</small></label>
                        <h3>Detalii de contact</h3>
                        <div class="shop-field-grid"><label class="shop-field">Nume<input name="customer" value="Alex Demo" required maxlength="80" autocomplete="off"></label><label class="shop-field">Telefon demo<input value="07xx xxx xxx" readonly aria-label="Telefon demonstrativ"></label></div>
                        <div id="checkout-member" class="shop-member-note"></div>
                        <h3>Cum vrei să plătești?</h3>
                        <fieldset class="shop-payment-options"><legend class="visually-hidden">Metodă de plată</legend><label><input type="radio" name="payment" value="card" checked><span><strong>Card online</strong><small>Previzualizarea pasului de plată</small></span></label><label><input type="radio" name="payment" value="cash"><span><strong>Numerar</strong><small>Comandă simulată cu plata la primire</small></span></label></fieldset>
                    </form>
                </div>
                <aside class="shop-panel shop-summary" id="checkout-summary" hidden aria-labelledby="summary-title">
                    <h2 id="summary-title">Sumar comandă</h2><div id="summary-lines"></div>
                    <label class="shop-redeem" id="redeem-option" hidden><input type="checkbox" id="redeem-points"><span>Folosește 100 puncte <small>Reducere de 10 lei</small></span></label>
                    <p id="checkout-earn" class="shop-points-note"></p>
                    <button type="submit" form="checkout-form" class="button button-primary" id="continue-payment">Continuă la plată</button>
                    <p class="shop-demo-note">O simulare pentru prezentarea serviciilor La Andrei.</p>
                </aside>
            </div>
            <section id="payment-step" class="container shop-payment-step" aria-labelledby="payment-title" hidden>
                <button type="button" class="shop-back" id="back-to-cart">Înapoi la coș</button>
                <div class="shop-panel shop-payment-placeholder"><p class="eyebrow">Plată demo</p><h2 id="payment-title" tabindex="-1">Ultimul pas.</h2><p class="shop-payment-amount" id="payment-amount"></p>
                    <div class="shop-gateway"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/></svg><strong>Aici va apărea formularul de plată</strong><p>Placeholder · fără date de card</p></div>
                    <button type="button" class="button button-primary" id="simulate-payment">Simulează plata</button>
                </div>
            </section>
            <section class="container shop-completion" id="checkout-complete" hidden tabindex="-1" aria-live="polite"></section>
            <p class="container shop-message" id="checkout-status" role="status"></p>
        </main>`;
    }

    function accountPage() {
        return `<main id="continut" class="inner-page shop-page" data-account-page>
            <section class="page-intro"><div class="container"><p class="breadcrumbs"><a href="index.html">Acasă</a><span aria-hidden="true">/</span>Contul meu</p><p class="eyebrow">Pofta bună se răsplătește</p><h1>Contul <span>meu.</span></h1><p class="shop-demo-note">Cont demonstrativ · profilul, punctele și comenzile sunt păstrate în acest browser.</p></div></section>
            <div class="container shop-account-layout">
                <section class="shop-panel" id="account-access" aria-labelledby="access-title">
                    <div class="shop-account-tabs" role="group" aria-label="Acces cont"><button type="button" data-account-mode="login" aria-pressed="true">Autentificare</button><button type="button" data-account-mode="register" aria-pressed="false">Creează cont</button></div>
                    <h2 id="access-title">Bine ai revenit.</h2>
                    <form id="account-form"><label class="shop-field" id="register-name" hidden>Nume afișat<input name="name" value="Alex" maxlength="60" autocomplete="off"></label><label class="shop-field">Email demo<input value="client@laandrei.example" readonly type="email"></label><label class="shop-field">Parolă<input placeholder="Parolă demonstrativă" disabled type="password"></label><button class="button button-primary" type="submit" id="account-submit">Intră în contul demo</button></form>
                    <p class="shop-demo-note">Poți explora contul folosind profilul demonstrativ de mai sus.</p>
                </section>
                <section id="account-profile" class="shop-panel" hidden aria-labelledby="profile-title"><div class="shop-profile-avatar" aria-hidden="true" id="profile-initial">A</div><p class="eyebrow">Membru La Andrei</p><h2 id="profile-title"></h2><p class="shop-muted">client@laandrei.example</p><a class="button button-primary" href="meniu.html">Comandă din meniu</a><button class="shop-back" type="button" id="sign-out">Ieși din cont</button></section>
                <section class="shop-panel shop-loyalty" aria-labelledby="loyalty-title"><p class="eyebrow">Fidelitate</p><h2 id="loyalty-title">Pofta îți aduce puncte.</h2><p class="shop-points-balance"><strong id="loyalty-balance">120</strong> <span>puncte</span></p><progress id="loyalty-progress" max="100" value="100" aria-label="Progres către o reducere de 10 lei"></progress><p id="loyalty-detail"></p><div class="shop-loyalty-rule"><strong>1 leu = 1 punct</strong><p>Primești puncte după fiecare comandă simulată cu cont. Cu 100 puncte poți folosi o reducere de 10 lei la o comandă de minimum 10 lei.</p></div></section>
                <section class="shop-panel shop-order-history" aria-labelledby="history-title"><div class="shop-panel-heading"><h2 id="history-title">Comenzile mele</h2><a href="meniu.html">Vezi meniul</a></div><div id="order-history"></div></section>
                <details class="shop-panel shop-restaurant-preview"><summary>Panoul restaurantului · previzualizare demo</summary><p class="shop-muted">Comenzile simulate în acest browser</p><div id="restaurant-demo-orders"></div></details>
            </div><p class="container shop-message" id="account-status" role="status"></p>
        </main>`;
    }

    function createPages(home, data) {
        const h = model.escapeHtml;
        const business = data.business;
        const menuMain = '<main id="continut" class="inner-page"><section class="page-intro" aria-labelledby="menu-page-title"><div class="container">' +
            '<p class="breadcrumbs"><a href="index.html">Acasă</a><span aria-hidden="true">/</span>Meniu</p><p class="eyebrow">Shaorma & kebab · ' + h(business.city) + '</p>' +
            '<h1 id="menu-page-title">Meniul <span>' + h(business.name) + '.</span></h1><p class="page-description">Alege ce îți place, adaugă în coș și continuă cu livrare sau ridicare.</p><p class="shop-demo-note">Demo interactiv · comenzile și plățile sunt simulate.</p></div></section>' +
            '<section class="menu-section section-space" id="meniu" aria-label="Toate preparatele"><div class="container">' + model.renderMenu(data) +
            '<p class="menu-ingredient-note">Ai întrebări despre ingrediente sau alergeni? <a href="contact.html">Contactează restaurantul.</a></p>' +
            '<div class="menu-footer"><p>Ți-ai ales preferatul?</p><a class="text-link" href="cos.html">Continuă la coș</a></div></div></section></main>';
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
            'contact.html': pageShell(home, contactMain, 'contact', 'Contact și locație · ' + business.name + ' · ' + business.city, 'Găsește ' + business.name + ' în ' + business.city + '. Adresa restaurantului, telefon și indicații de orientare.'),
            'cos.html': pageShell(home, checkoutPage(business), 'cart', 'Coșul tău · ' + business.name, 'Coș și finalizarea comenzii. Demonstrație interactivă La Andrei.'),
            'cont.html': pageShell(home, accountPage(), 'account', 'Contul meu · ' + business.name, 'Cont demonstrativ, puncte de fidelitate și istoricul comenzilor La Andrei.')
        };
    }

    function prepareSite(html, input) {
        const data = model.validate(input);
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
        const servicesData = {
            products: data.products.filter(product => product.visible),
            business: { name: data.business.name, address: data.business.address, city: data.business.city }
        };
        const servicesScript = '<script>window.LA_ANDREI_SERVICES = ' + JSON.stringify(servicesData).replace(/</g, '\\u003c') + ';</script>';
        html = replaceRegion(html, 'SERVICES', servicesScript, false);
        const pages = createPages(html, data);
        const referencedAssets = new Set(Array.from(Object.values(pages).join('\n').matchAll(/\b(?:src|href)="(assets\/[a-zA-Z0-9_./-]+)"/g), (match) => match[1]));
        const editorData = 'window.LA_ANDREI_CONTENT = ' + JSON.stringify(data, null, 2).replace(/</g, '\\u003c') + ';\n';
        for (const asset of referencedAssets) {
            if (asset.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Cale de imagine invalid?: ' + asset);
        }
        return { data, pages, referencedAssets, editorData };
    }

    return { prepareSite, publicFiles, replaceRegion };
}));
