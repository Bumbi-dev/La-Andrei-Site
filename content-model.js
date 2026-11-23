(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LaAndreiContent = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

    function validate(input) {
        const errors = [];
        const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
        if (!object(input)) throw new Error('Fișierul trebuie să conțină un obiect JSON.');
        if (input.version !== 1) errors.push('Versiunea fișierului trebuie să fie 1.');
        function text(value, label, maximum = 500, required = true) {
            if (typeof value !== 'string') { errors.push(label + ': introduceți text.'); return ''; }
            const result = value.trim();
            if (required && !result) errors.push(label + ': câmp obligatoriu.');
            if (result.length > maximum) errors.push(label + ': maximum ' + maximum + ' de caractere.');
            return result;
        }
        function list(value, label, maximum = 40) {
            if (!Array.isArray(value) || value.length > maximum) { errors.push(label + ': lista nu este validă.'); return []; }
            return value.map((entry, index) => text(entry, label + ' #' + (index + 1), 150));
        }
        function boolean(value, label) {
            if (typeof value !== 'boolean') errors.push(label + ': valoarea trebuie să fie true sau false.');
            return value === true;
        }
        function identifier(value, label) {
            const result = text(value, label, 80);
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) errors.push(label + ': folosiți litere mici fără diacritice, cifre și cratimă.');
            return result;
        }
        function url(value, label, hosts) {
            const result = text(value, label, 1000);
            try {
                const parsed = new URL(result);
                if (parsed.protocol !== 'https:' || !hosts.includes(parsed.hostname) || parsed.username || parsed.password) throw new Error();
                if (parsed.hostname === 'www.google.com' && !parsed.pathname.startsWith('/maps')) throw new Error();
            } catch (_) { errors.push(label + ': folosiți un link HTTPS oficial.'); }
            return result;
        }
        const sourceBusiness = object(input.business) ? input.business : {};
        if (!object(input.business)) errors.push('Datele restaurantului lipsesc.');
        const business = {
            name: text(sourceBusiness.name, 'Numele restaurantului', 100),
            city: text(sourceBusiness.city, 'Orașul', 100),
            address: text(sourceBusiness.address, 'Adresa', 300),
            boltUrl: url(sourceBusiness.boltUrl, 'Linkul Bolt Food', ['food.bolt.eu']),
            mapsUrl: url(sourceBusiness.mapsUrl, 'Linkul Google Maps', ['maps.google.com', 'www.google.com', 'maps.app.goo.gl']),
            phone: text(sourceBusiness.phone, 'Telefon', 40, false),
            email: text(sourceBusiness.email, 'Email', 150, false),
            hours: list(sourceBusiness.hours, 'Program', 14)
        };
        if (business.phone && !/^\+?[\d ()-]{6,40}$/.test(business.phone)) errors.push('Numărul de telefon nu este valid.');
        if (business.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(business.email)) errors.push('Adresa de email nu este validă.');
        const sourceProducts = Array.isArray(input.products) ? input.products : [];
        if (!Array.isArray(input.products) || input.products.length > 200) errors.push('Meniul trebuie să fie o listă de maximum 200 de produse.');
        const productIds = new Set();
        const categories = new Map();
        const products = sourceProducts.slice(0, 200).map((entry, index) => {
            const item = object(entry) ? entry : {};
            const prefix = 'Produsul ' + (index + 1) + ' — ';
            const result = {
                id: identifier(item.id, prefix + 'ID'),
                name: text(item.name, prefix + 'nume', 120),
                category: identifier(item.category, prefix + 'categorie'),
                categoryLabel: text(item.categoryLabel, prefix + 'eticheta categoriei', 80),
                grams: item.grams,
                unit: item.unit === undefined ? 'g' : item.unit,
                price: item.price,
                description: text(item.description === undefined ? '' : item.description, prefix + 'descriere', 500, false),
                ingredients: list(item.ingredients, prefix + 'ingrediente'),
                allergens: list(item.allergens === undefined ? [] : item.allergens, prefix + 'alergeni'),
                image: text(item.image, prefix + 'imagine', 250),
                imageAlt: text(item.imageAlt, prefix + 'descrierea imaginii', 300),
                available: boolean(item.available, prefix + 'disponibilitate'),
                visible: boolean(item.visible, prefix + 'vizibilitate'),
                badge: text(item.badge === undefined ? '' : item.badge, prefix + 'etichetă', 80, false)
            };
            if (productIds.has(result.id)) errors.push(prefix + 'ID-ul este duplicat.');
            productIds.add(result.id);
            if (result.category === 'all') errors.push(prefix + 'categoria all este rezervată.');
            if (categories.has(result.category) && categories.get(result.category) !== result.categoryLabel) errors.push(prefix + 'aceeași categorie trebuie să aibă aceeași etichetă.');
            categories.set(result.category, result.categoryLabel);
            if (result.grams !== null && (!Number.isInteger(result.grams) || result.grams <= 0 || result.grams > 100000)) errors.push(prefix + 'gramajul trebuie să fie un număr întreg pozitiv sau null dacă nu este confirmat.');
            if (!['g', 'ml'].includes(result.unit)) errors.push(prefix + 'unitatea trebuie să fie g sau ml.');
            if (typeof result.price !== 'number' || !Number.isFinite(result.price) || result.price <= 0 || result.price > 10000 || Math.abs(Math.round(result.price * 100) - result.price * 100) > 0.000001) errors.push(prefix + 'prețul trebuie să fie pozitiv, cu maximum două zecimale.');
            if (!/^assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif)$/i.test(result.image) || result.image.split('/').some((segment) => segment === '..' || segment === '.')) errors.push(prefix + 'imaginea trebuie să fie un fișier din assets/, fără segmente de navigare.');
            return result;
        });
        const sourceReviews = Array.isArray(input.reviews) ? input.reviews : [];
        if (!Array.isArray(input.reviews) || input.reviews.length > 30) errors.push('Recenziile trebuie să fie o listă de maximum 30 de exemple.');
        const reviewIds = new Set();
        const reviews = sourceReviews.slice(0, 30).map((entry, index) => {
            const review = object(entry) ? entry : {};
            const prefix = 'Recenzia ' + (index + 1) + ' — ';
            const result = {
                id: identifier(review.id, prefix + 'ID'),
                author: text(review.author, prefix + 'autor', 100),
                avatar: text(review.avatar === undefined ? '' : review.avatar, prefix + 'fotografie', 250, false),
                rating: review.rating,
                text: text(review.text, prefix + 'text', 1000),
                isExample: review.isExample,
                visible: boolean(review.visible, prefix + 'vizibilitate')
            };
            if (reviewIds.has(result.id)) errors.push(prefix + 'ID-ul este duplicat.');
            if (result.avatar && (!/^assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif)$/i.test(result.avatar) || result.avatar.split('/').some(segment => segment === '..' || segment === '.'))) errors.push(prefix + 'fotografia trebuie să fie un fișier din assets/, fără segmente de navigare.');
            reviewIds.add(result.id);
            if (!Number.isInteger(result.rating) || result.rating < 1 || result.rating > 5) errors.push(prefix + 'nota trebuie să fie între 1 și 5.');
            if (result.isExample !== true) errors.push(prefix + 'această versiune acceptă doar exemple fictive, marcate isExample: true.');
            return result;
        });
        if (errors.length) throw new Error(errors.join('\n'));
        return { version: 1, business, products, reviews };
    }

    const bagIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>';
    function renderProduct(item, business, options = {}) {
        const h = escapeHtml;
        const formattedPrice = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(item.price);
        const dialogId = 'product-' + item.id;
        const attributes = ' data-product-dialog="' + h(dialogId) + '" aria-haspopup="dialog" aria-controls="' + h(dialogId) + '"';
        const image = '<img src="' + h(item.image) + '" alt="' + h(item.imageAlt) + '" width="1200" height="675" loading="lazy" decoding="async">';
        return '<article class="food-card' + (item.available ? '' : ' is-unavailable') + '" data-category="' + h(item.category) + '" data-product-id="' + h(item.id) + '"' + (options.modal ? ' data-dialog-id="' + h(dialogId) + '"' : '') + '>\n' +
            '<div class="food-image">' + (options.modal ? '<a class="food-photo-trigger" href="#ingredients-' + h(item.id) + '"' + attributes + ' aria-label="Detalii despre ' + h(item.name) + '">' + image + '</a>' : image) + (item.badge ? '<span class="food-badge">' + h(item.badge) + '</span>' : '') + '</div>\n' +
            '<div class="food-content"><p class="food-category">' + h(item.categoryLabel) + ' <span>·</span> ' + (item.grams === null ? 'Gramaj de confirmat' : item.grams + ' ' + (item.unit || 'g')) + '</p><h3>' + (options.modal ? '<a href="#ingredients-' + h(item.id) + '"' + attributes + '>' + h(item.name) + '</a>' : h(item.name)) + '</h3>' +
            (item.description ? '<p class="food-description">' + h(item.description) + '</p>' : '') +
            '<details class="food-ingredients" id="ingredients-' + h(item.id) + '"><summary>Ingrediente</summary><p>' + (item.ingredients.length ? h(item.ingredients.join(', ')) + '.' : item.unit === 'ml' ? 'Consultă ingredientele de pe ambalaj.' : 'Lista ingredientelor se confirmă la restaurant.') + '</p></details>' +
            (options.modal ? '<button class="food-details-button" type="button"' + attributes + '>Ingrediente și gramaj</button>' : '') +
            (item.allergens.length ? '<p class="food-allergens"><strong>Alergeni:</strong> ' + h(item.allergens.join(', ')) + '.</p>' : '') +
            '<div class="food-bottom"><p class="food-price">' + formattedPrice + ' <span>lei</span></p>' +
            (item.available ? '<a class="food-order bolt-link" href="' + h(business.boltUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Comandă ' + h(item.name.toLocaleLowerCase('ro-RO')) + ' pe Bolt Food">Comandă ' + bagIcon + '</a>' : '<span class="food-unavailable">Indisponibil momentan</span>') + '</div></div></article>';
    }
    function renderProductDialog(item, business) {
        const h = escapeHtml;
        return '<dialog class="product-dialog" id="product-' + h(item.id) + '" aria-labelledby="product-title-' + h(item.id) + '"><div class="product-dialog-panel">' +
            '<form method="dialog" class="product-dialog-close"><button type="submit" aria-label="Închide detaliile preparatului" autofocus><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></form>' +
            '<div class="product-dialog-hero"><div class="product-dialog-photo"><img class="product-dialog-image" src="' + h(item.image) + '" alt="' + h(item.imageAlt) + '" width="1200" height="675" loading="lazy"></div>' +
            '<div class="product-dialog-heading"><p class="eyebrow">' + h(item.categoryLabel) + '</p><h2 id="product-title-' + h(item.id) + '">' + h(item.name) + '</h2></div></div>' +
            '<div class="product-dialog-copy"><div class="product-dialog-details"><div class="product-dialog-facts"><span>' + (item.grams === null ? 'Gramaj: <strong>De confirmat la restaurant</strong>' : 'Porție: <strong>' + item.grams + ' ' + (item.unit || 'g') + '</strong>') + '</span><span class="food-price">' + new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(item.price) + ' <span>lei</span></span></div>' +
            (item.description ? '<p class="product-dialog-description">' + h(item.description) + '</p>' : '') +
            '<h3>Ingrediente</h3>' + (item.ingredients.length ? '<ul class="product-ingredient-list">' + item.ingredients.map(ingredient => '<li>' + h(ingredient) + '</li>').join('') + '</ul>' : '<p class="product-dialog-description">' + (item.unit === 'ml' ? 'Consultă ingredientele de pe ambalaj.' : 'Lista ingredientelor se confirmă la restaurant.') + '</p>') +
            (item.allergens.length ? '<p class="food-allergens"><strong>Alergeni:</strong> ' + h(item.allergens.join(', ')) + '.</p>' : '') +
            '<p class="product-dialog-note">Pentru detalii despre ingrediente și alergeni, <a href="contact.html">contactează restaurantul</a>.</p>' +
            '</div><div class="product-dialog-order">' +
            (item.available ? '<a class="button button-primary bolt-link" href="' + h(business.boltUrl) + '" target="_blank" rel="noopener noreferrer">Comandă pe Bolt Food</a>' : '<p class="food-unavailable">Indisponibil momentan</p>') + '</div></div></div></dialog>';
    }
    function renderMenu(data, options = {}) {
        const visibleProducts = data.products.filter((item) => item.visible).slice(0, options.limit === undefined ? Infinity : options.limit);
        const categories = new Map(visibleProducts.map((item) => [item.category, item.categoryLabel]));
        const buttons = '<button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true" aria-controls="menu-grid">Toate</button>' + Array.from(categories, ([id, label]) => '<button class="filter-button" type="button" data-filter="' + escapeHtml(id) + '" aria-pressed="false" aria-controls="menu-grid">' + escapeHtml(label) + '</button>').join('');
        return '<div class="menu-filters" role="group" aria-label="Filtrează meniul">' + buttons + '</div>\n<div class="menu-grid" id="menu-grid">\n' + (visibleProducts.length ? visibleProducts.map((item) => renderProduct(item, data.business, { modal: true })).join('\n') : '<p class="menu-empty">Meniul este în curs de actualizare. Descoperă oferta disponibilă pe Bolt Food.</p>') + '\n</div>\n<p class="visually-hidden" id="filter-status" role="status" aria-live="polite"></p>\n' + visibleProducts.map(item => renderProductDialog(item, data.business)).join('\n');
    }
    function renderReviews(data) {
        const reviews = data.reviews.filter((review) => review.visible);
        if (!reviews.length) return '';
        return '<div class="review-grid">\n' + reviews.map((review) => {
            const name = review.author.replace(/^Exemplu\s*[—–-]\s*/i, '').trim();
            const initials = name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase('ro-RO');
            const avatar = review.avatar ? '<img src="' + escapeHtml(review.avatar) + '" alt="" width="44" height="44" loading="lazy">' : escapeHtml(initials || '?');
            return '<figure class="review-card"><figcaption class="review-card-top"><span class="review-author"><span class="review-avatar" aria-hidden="true">' + avatar + '</span><span>' + escapeHtml(review.author) + '</span></span><span class="review-stars" role="img" aria-label="' + review.rating + ' din 5 stele"><span aria-hidden="true">' + '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating) + '</span></span></figcaption><blockquote><p>„' + escapeHtml(review.text) + '”</p></blockquote></figure>';
        }).join('\n') + '\n</div>';
    }
    function renderBusiness(data) {
        const business = data.business;
        return '<div class="business-details">' +
            (business.phone ? '<p><a href="tel:' + business.phone.replace(/[^+\d]/g, '') + '">' + escapeHtml(business.phone) + '</a></p>' : '') +
            (business.email ? '<p><a href="mailto:' + encodeURIComponent(business.email) + '">' + escapeHtml(business.email) + '</a></p>' : '') +
            (business.hours.length ? '<div class="business-hours"><h3>Program</h3>' + business.hours.map((line) => '<p>' + escapeHtml(line) + '</p>').join('') + '</div>' : '') + '</div>';
    }
    function renderSchema(data) {
        const business = data.business;
        const schema = { '@context': 'https://schema.org', '@type': 'Restaurant', name: business.name, servesCuisine: ['Shaorma', 'Kebab'], address: { '@type': 'PostalAddress', streetAddress: business.address, addressLocality: business.city, addressCountry: 'RO' }, hasMap: business.mapsUrl, menu: business.boltUrl };
        if (business.phone) schema.telephone = business.phone;
        if (business.email) schema.email = business.email;
        return '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>';
    }
    return { validate, escapeHtml, renderProduct, renderProductDialog, renderMenu, renderReviews, renderBusiness, renderSchema };
}));
