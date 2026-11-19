const navbar = document.querySelector('.site-header');

function updateNavbarOpacity() {
    const opacity = Math.min(Math.max(window.scrollY / 400, 0), 1);
    navbar.style.setProperty('--navbar-opacity', opacity);
}

window.addEventListener('scroll', updateNavbarOpacity, { passive: true });
window.addEventListener('pageshow', updateNavbarOpacity);
updateNavbarOpacity();

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

        filterStatus.textContent = `${visibleCount} ${visibleCount === 1 ? 'preparat afișat' : 'preparate afișate'}.`;
    });
});

document.querySelector('#current-year').textContent = new Date().getFullYear();
