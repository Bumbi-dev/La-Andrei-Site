(function () {
    'use strict';

    const catalog = window.LA_ANDREI_SERVICES;
    if (!catalog) return;
    const products = new Map(catalog.products.map(product => [product.id, product]));
    const storageKey = 'la-andrei-shopping-demo-v2';
    const get = id => document.getElementById(id);
    const h = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const money = cents => (cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + ' lei';
    const price = product => Math.round(product.price * 100);
    const onCheckout = !!document.querySelector('[data-checkout-page]');
    const onAccount = !!document.querySelector('[data-account-page]');
    let storageAvailable = true;
    let pendingOrder = null;
    let accountMode = 'login';
    let toastTimer;

    function emptyState() {
        return { cart: [], signedIn: false, name: 'Alex', points: 120, orders: [] };
    }

    function validAmount(amount) {
        return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000;
    }

    function validOrder(order) {
        return order && typeof order.id === 'string' && typeof order.date === 'string' && Number.isFinite(Date.parse(order.date)) &&
            typeof order.member === 'boolean' && Array.isArray(order.items) && order.items.length > 0 &&
            ['total', 'subtotal', 'delivery', 'discount', 'earned', 'spent'].every(key => validAmount(order[key])) &&
            order.items.every(item => item && typeof item.name === 'string' && validAmount(item.unitPrice) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20);
    }

    function normalize(value) {
        if (!value || typeof value !== 'object') return emptyState();
        const cart = new Map();
        for (const item of Array.isArray(value.cart) ? value.cart : []) {
            if (!item || !products.get(item.id)?.available || !Number.isInteger(item.quantity) || item.quantity <= 0) continue;
            cart.set(item.id, Math.min(20, item.quantity));
        }
        return {
            cart: [...cart].map(([id, quantity]) => ({ id, quantity })),
            signedIn: value.signedIn === true,
            name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 60) : 'Alex',
            points: validAmount(value.points) ? Math.min(value.points, 100000) : 120,
            orders: Array.isArray(value.orders) ? value.orders.filter(validOrder).slice(0, 20) : []
        };
    }

    let state = emptyState();
    function loadState() {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? normalize(JSON.parse(stored)) : emptyState();
        } catch (_) {
            if (_ instanceof SyntaxError) return emptyState();
            storageAvailable = false;
            return state;
        }
    }

    function saveState() {
        try { localStorage.setItem(storageKey, JSON.stringify(state)); }
        catch (_) { storageAvailable = false; }
        renderStorageNote();
    }

    function renderStorageNote() {
        const note = get('shop-storage-note');
        if (!note) return;
        note.hidden = storageAvailable;
        note.textContent = 'Salvarea în browser este indisponibilă. Demo-ul se păstrează doar în pagina deschisă.';
    }

    function totals() {
        const subtotal = state.cart.reduce((sum, item) => sum + price(products.get(item.id)) * item.quantity, 0);
        const delivery = onCheckout && get('checkout-form').elements.fulfillment.value === 'delivery' && subtotal > 0 ? 800 : 0;
        const canRedeem = state.signedIn && state.points >= 100 && subtotal >= 1000;
        const discount = onCheckout && canRedeem && get('redeem-points').checked ? 1000 : 0;
        return { subtotal, delivery, discount, total: subtotal + delivery - discount, canRedeem, earned: state.signedIn ? Math.floor((subtotal - discount) / 100) : 0, spent: discount ? 100 : 0 };
    }

    function notify(message) {
        const toast = get('shop-toast');
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.add('is-visible');
        toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
    }

    function renderNavigation() {
        const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
        document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = count; });
        document.querySelectorAll('[data-cart-subtotal]').forEach(element => { element.textContent = money(totals().subtotal); });
        document.querySelectorAll('[data-cart-dock]').forEach(element => { element.hidden = !count || onCheckout; });
        document.body.classList.toggle('has-shopping-cart', count > 0 && !onCheckout);
        document.querySelectorAll('[data-add-to-cart]').forEach(button => {
            const quantity = state.cart.find(item => item.id === button.dataset.addToCart)?.quantity || 0;
            button.disabled = quantity >= 20;
        });
        const accountLink = document.querySelector('[data-nav="account"]');
        if (accountLink) accountLink.textContent = state.signedIn ? state.name : 'Contul meu';
    }

    function renderCheckout() {
        if (!onCheckout) return;
        const hasItems = state.cart.length > 0;
        const form = get('checkout-form');
        if (state.signedIn && form.elements.customer.value === 'Alex Demo') form.elements.customer.value = state.name;
        get('checkout-summary').hidden = !hasItems;
        form.hidden = !hasItems;
        get('basket-items').innerHTML = hasItems ? state.cart.map(item => {
            const product = products.get(item.id);
            return `<article class="shop-basket-item"><img src="${h(product.image)}" alt="" width="88" height="88"><div class="shop-basket-info"><h3>${h(product.name)}</h3><p>${money(price(product))}${product.grams === null ? '' : ' · ' + product.grams + ' ' + h(product.unit)}</p><div class="shop-quantity" aria-label="Cantitate ${h(product.name)}"><button type="button" data-cart-action="decrease" data-item="${h(item.id)}" aria-label="Scade cantitatea pentru ${h(product.name)}">−</button><span>${item.quantity}</span><button type="button" data-cart-action="increase" data-item="${h(item.id)}" aria-label="Crește cantitatea pentru ${h(product.name)}" ${item.quantity >= 20 ? 'disabled' : ''}>+</button></div></div><div class="shop-basket-price"><strong>${money(price(product) * item.quantity)}</strong><button type="button" data-cart-action="remove" data-item="${h(item.id)}">Elimină</button></div></article>`;
        }).join('') : '<div class="shop-empty"><h3>Ceva bun lipsește din coș.</h3><p>Alege o shaorma, un kebab sau ceva de băut.</p><a class="button button-primary" href="meniu.html">Descoperă meniul</a></div>';
        const delivery = form.elements.fulfillment.value === 'delivery';
        get('delivery-address').hidden = !delivery;
        form.elements.address.required = delivery;
        get('pickup-address').hidden = delivery;
        const amounts = totals();
        get('summary-lines').innerHTML = `<p class="shop-sum-line"><span>Produse</span><strong>${money(amounts.subtotal)}</strong></p><p class="shop-sum-line"><span>${delivery ? 'Livrare demo' : 'Ridicare din restaurant'}</span><strong>${delivery ? money(amounts.delivery) : 'Gratuită'}</strong></p>${amounts.discount ? `<p class="shop-sum-line shop-discount"><span>100 puncte fidelitate</span><strong>−${money(amounts.discount)}</strong></p>` : ''}<p class="shop-sum-line shop-grand-total"><span>Total</span><strong>${money(amounts.total)}</strong></p>`;
        get('redeem-option').hidden = !amounts.canRedeem;
        if (!amounts.canRedeem) get('redeem-points').checked = false;
        get('checkout-member').innerHTML = state.signedIn ? `<strong>${h(state.name)}, ai ${state.points} puncte.</strong><a href="cont.html?redirect=cos">Vezi contul</a>` : '<span>Ai cont? Păstrează comanda și câștigă puncte.</span><a href="cont.html?redirect=cos">Intră în cont</a><small>Poți continua și fără cont.</small>';
        get('checkout-earn').textContent = state.signedIn ? `Această simulare îți aduce ${amounts.earned} puncte.` : '1 leu = 1 punct, când comanzi cu cont.';
        get('continue-payment').textContent = form.elements.payment.value === 'card' ? 'Continuă la plată' : 'Simulează comanda';
    }

    function orderMarkup(order) {
        const date = new Date(order.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
        return `<article class="shop-history-item"><div><strong>${h(order.id)}</strong><span>${h(date)} · ${order.fulfillment === 'delivery' ? 'Livrare' : 'Ridicare'} · Simulată</span><p>${order.items.map(item => `${item.quantity} × ${h(item.name)}`).join(', ')}</p>${order.member ? `<small>+${order.earned} puncte${order.spent ? ' · −100 puncte folosite' : ''}</small>` : ''}</div><strong>${money(order.total)}</strong></article>`;
    }

    function renderAccount() {
        if (!onAccount) return;
        get('account-access').hidden = state.signedIn;
        get('account-profile').hidden = !state.signedIn;
        get('profile-title').textContent = `Salut, ${state.name}!`;
        get('profile-initial').textContent = Array.from(state.name)[0].toLocaleUpperCase('ro-RO');
        get('loyalty-balance').textContent = state.signedIn ? state.points : '120';
        get('loyalty-progress').value = state.signedIn ? Math.min(100, state.points) : 100;
        get('loyalty-detail').textContent = !state.signedIn ? 'Intră în contul demo pentru a încerca cele 120 puncte de pornire.' : state.points >= 100 ? 'Ai o reducere de 10 lei disponibilă în coș.' : `Încă ${100 - state.points} puncte până la o reducere de 10 lei.`;
        const orders = state.orders.filter(order => order.member);
        get('order-history').innerHTML = !state.signedIn ? '<p class="shop-muted">Autentifică-te pentru a vedea istoricul contului demo.</p>' : orders.length ? orders.map(orderMarkup).join('') : '<p class="shop-muted">Prima ta comandă începe din meniu. Simulează plata și o vei găsi aici.</p>';
        get('restaurant-demo-orders').innerHTML = state.orders.length ? state.orders.map(orderMarkup).join('') : '<p class="shop-muted">Comenzile simulate vor apărea aici.</p>';
    }

    function render() {
        renderNavigation();
        renderCheckout();
        renderAccount();
        renderStorageNote();
    }

    function changeQuantity(id, change) {
        state = loadState();
        const product = products.get(id);
        if (!product?.available) return;
        const item = state.cart.find(entry => entry.id === id);
        const quantity = Math.max(0, Math.min(20, (item?.quantity || 0) + change));
        if (item) item.quantity = quantity;
        else if (quantity) state.cart.push({ id, quantity });
        state.cart = state.cart.filter(entry => entry.quantity > 0);
        saveState();
        render();
    }

    document.addEventListener('click', event => {
        const add = event.target.closest('[data-add-to-cart]');
        if (add) {
            changeQuantity(add.dataset.addToCart, 1);
            notify(`${products.get(add.dataset.addToCart).name} a fost adăugat în coș.`);
        }
    });

    function cartSignature() {
        return JSON.stringify([state.cart, state.signedIn, state.points, state.name]);
    }

    function showCart() {
        pendingOrder = null;
        get('payment-step').hidden = true;
        get('checkout-content').hidden = false;
        get('continue-payment').focus();
    }

    function completeOrder() {
        if (!pendingOrder) return;
        state = loadState();
        if (pendingOrder.signature !== cartSignature()) {
            showCart();
            render();
            get('checkout-status').textContent = 'Coșul sau contul s-a schimbat. Verifică sumarul înainte de a continua.';
            return;
        }
        const order = pendingOrder;
        pendingOrder = null;
        delete order.signature;
        state.points = Math.max(0, Math.min(100000, state.points - order.spent + order.earned));
        state.orders.unshift(order);
        state.orders = state.orders.slice(0, 20);
        state.cart = [];
        saveState();
        render();
        get('payment-step').hidden = true;
        get('checkout-content').hidden = true;
        const completion = get('checkout-complete');
        completion.hidden = false;
        completion.innerHTML = `<div class="shop-panel"><div class="shop-success-mark" aria-hidden="true">✓</div><p class="eyebrow">Simulare finalizată</p><h2>Poftă bună, în curând.</h2><p>Ai parcurs comanda ${h(order.id)}. Aceasta este o previzualizare a experienței La Andrei.</p><p class="shop-success-total">${money(order.total)}</p><p>${order.member ? `Ai primit ${order.earned} puncte${order.spent ? ' și ai folosit 100 puncte' : ''}. Soldul tău este ${state.points} puncte.` : 'Poți explora și contul demo pentru puncte de fidelitate.'}</p><div class="shop-completion-links"><a class="button button-primary" href="meniu.html">Înapoi la meniu</a><a class="button button-outline" href="cont.html">Vezi contul</a></div></div>`;
        completion.focus();
    }

    if (onCheckout) {
        get('basket-items').addEventListener('click', event => {
            const button = event.target.closest('[data-cart-action]');
            if (!button) return;
            const id = button.dataset.item;
            const quantity = state.cart.find(item => item.id === id)?.quantity || 0;
            const change = button.dataset.cartAction === 'increase' ? 1 : button.dataset.cartAction === 'remove' ? -quantity : -1;
            changeQuantity(id, change);
            const next = document.querySelector(`[data-cart-action="increase"][data-item="${id}"]`) || get('basket-items').querySelector('a');
            next?.focus({ preventScroll: true });
        });
        get('checkout-form').addEventListener('change', renderCheckout);
        get('redeem-points').addEventListener('change', renderCheckout);
        get('checkout-form').addEventListener('submit', event => {
            event.preventDefault();
            state = loadState();
            if (!state.cart.length || pendingOrder) return;
            const form = get('checkout-form');
            const amounts = totals();
            pendingOrder = {
                id: 'LA-' + crypto.randomUUID().slice(0, 6).toUpperCase(), date: new Date().toISOString(),
                items: state.cart.map(item => ({ name: products.get(item.id).name, quantity: item.quantity, unitPrice: price(products.get(item.id)) })),
                member: state.signedIn, fulfillment: form.elements.fulfillment.value, payment: form.elements.payment.value,
                subtotal: amounts.subtotal, delivery: amounts.delivery, discount: amounts.discount, total: amounts.total,
                earned: amounts.earned, spent: amounts.spent, signature: cartSignature()
            };
            get('checkout-status').textContent = '';
            if (pendingOrder.payment === 'cash') { completeOrder(); return; }
            get('checkout-content').hidden = true;
            get('payment-step').hidden = false;
            get('payment-amount').textContent = money(pendingOrder.total);
            get('payment-title').focus();
        });
        get('back-to-cart').addEventListener('click', showCart);
        get('simulate-payment').addEventListener('click', completeOrder);
    }

    if (onAccount) {
        const returnToCart = new URLSearchParams(location.search).get('redirect') === 'cos';
        document.querySelectorAll('[data-account-mode]').forEach(button => {
            button.addEventListener('click', () => {
                accountMode = button.dataset.accountMode;
                document.querySelectorAll('[data-account-mode]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
                get('register-name').hidden = accountMode !== 'register';
                get('account-form').elements.name.required = accountMode === 'register';
                get('access-title').textContent = accountMode === 'login' ? 'Bine ai revenit.' : 'Hai în comunitate.';
                get('account-submit').textContent = accountMode === 'login' ? 'Intră în contul demo' : 'Creează contul demo';
            });
        });
        get('account-form').addEventListener('submit', event => {
            event.preventDefault();
            state = loadState();
            if (accountMode === 'register') state.name = get('account-form').elements.name.value.trim() || 'Alex';
            state.signedIn = true;
            saveState();
            if (returnToCart) { location.href = 'cos.html'; return; }
            render();
            get('account-status').textContent = 'Ești în contul demo. Punctele și comenzile tale se păstrează în acest browser.';
        });
        get('sign-out').addEventListener('click', () => {
            state = loadState();
            state.signedIn = false;
            saveState();
            render();
            get('account-status').textContent = 'Ai ieșit din contul demo.';
        });
    }

    window.addEventListener('storage', event => {
        if (event.key !== storageKey && event.key !== null) return;
        state = loadState();
        if (pendingOrder) showCart();
        render();
    });
    window.addEventListener('pageshow', () => { state = loadState(); render(); });
    state = loadState();
    render();
}());
