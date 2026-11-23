document.documentElement.classList.add('js');

const navbar = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
let scrollFramePending = false;

function updateHeaderHeight() {
    document.documentElement.style.setProperty('--header-height', navbar.offsetHeight + 'px');
}
updateHeaderHeight();
if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(navbar);
else window.addEventListener('resize', updateHeaderHeight);

function updateScrollEffects() {
    const scroll = Math.max(window.scrollY, 0);
    const opacity = Math.min(scroll / 400, 1);
    navbar.style.setProperty('--navbar-opacity', opacity);
    const fadeSize = 28 * (1 - Math.min(scroll / 600, 1));
    navbar.style.setProperty('--navbar-fade-size', fadeSize + 'px');
    if (hero) hero.style.setProperty('--hero-brightness', 1 - 0.18 * Math.min(scroll / 240, 1));
}

window.addEventListener('scroll', () => {
    if (scrollFramePending) return;
    scrollFramePending = true;
    window.requestAnimationFrame(() => {
        updateScrollEffects();
        scrollFramePending = false;
    });
}, { passive: true });
window.addEventListener('pageshow', updateScrollEffects);
updateScrollEffects();

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-navigation');
const mobileLayout = window.matchMedia('(max-width: 860px)');

function setMenuOpen(open, returnFocus = false) {
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    navigation.dataset.open = String(open);
    navbar.classList.toggle('menu-open', open);
    if (returnFocus) menuToggle.focus();
}

menuToggle.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
});
navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false, true);
    }
});
document.addEventListener('click', (event) => {
    if (!navbar.contains(event.target)) setMenuOpen(false);
});
mobileLayout.addEventListener('change', () => setMenuOpen(false));

const filters = document.querySelectorAll('[data-filter]');
const menuItems = document.querySelectorAll('[data-category]');
const filterStatus = document.querySelector('#filter-status');

filters.forEach((filter) => {
    filter.addEventListener('click', () => {
        const category = filter.dataset.filter;
        let visibleCount = 0;

        filters.forEach((button) => {
            const active = button === filter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        menuItems.forEach((item) => {
            item.hidden = category !== 'all' && item.dataset.category !== category;
            if (!item.hidden) visibleCount += 1;
        });
        filterStatus.textContent = visibleCount + (visibleCount === 1 ? ' preparat afișat.' : ' preparate afișate.');
    });
});

const productDialogs = document.querySelectorAll('.product-dialog');
if (productDialogs.length && typeof productDialogs[0].showModal === 'function') {
    document.documentElement.classList.add('has-product-dialogs');
    const openers = new WeakMap();

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-product-dialog]');
        const card = event.target.closest('.food-card[data-dialog-id]');
        if (!trigger && (!card || event.target.closest('a, button, summary, details, input'))) return;
        const id = trigger ? trigger.dataset.productDialog : card.dataset.dialogId;
        const dialog = document.getElementById(id);
        if (!dialog || dialog.open) return;
        event.preventDefault();
        openers.set(dialog, trigger || card.querySelector('[data-product-dialog]'));
        dialog.showModal();
        document.body.classList.add('dialog-open');
    });

    productDialogs.forEach((dialog) => {
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener('close', () => {
            document.body.classList.remove('dialog-open');
            const opener = openers.get(dialog);
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        });
    });
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.remove('reveal-pending');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });

    document.querySelectorAll('[data-reveal], .food-card, .review-card').forEach((element) => {
        if (element.matches('.home-menu .food-card') || element.getBoundingClientRect().top >= window.innerHeight) {
            element.classList.add('reveal', 'reveal-pending');
            observer.observe(element);
        }
    });
}

document.querySelector('#current-year').textContent = new Date().getFullYear();
