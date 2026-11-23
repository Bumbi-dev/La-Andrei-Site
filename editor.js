(function () {
    'use strict';
    const model = window.LaAndreiContent;
    const status = document.querySelector('#editor-status');
    const saveState = document.querySelector('#save-state');
    const productForm = document.querySelector('#product-form');
    const reviewForm = document.querySelector('#review-form');
    const businessForm = document.querySelector('#business-form');
    const draftKey = 'la-andrei-editor-draft-v1';
    const h = model.escapeHtml;
    let data;
    let selectedProduct = null;
    let selectedReview = null;
    let panel = 'products';
    let dirty = false;
    let formDirty = false;

    function report(message, error = false) {
        status.textContent = message;
        status.classList.toggle('is-error', error);
    }
    function updateDirty(value) {
        dirty = value;
        saveState.textContent = value ? 'Modificări neexportate' : 'Conținut exportat / încărcat';
        saveState.classList.toggle('is-dirty', value);
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function rememberDraft() {
        try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch (_) { /* Export works even when local storage is disabled. */ }
    }
    function changed() { formDirty = false; updateDirty(true); rememberDraft(); }
    function canLeaveForm() {
        return !formDirty || window.confirm('Există modificări neaplicate în formular. Renunți la ele?');
    }
    function canReplaceData() {
        return (!dirty && !formDirty) || window.confirm('Importul înlocuiește ciorna curentă, inclusiv modificările neexportate. Continui?');
    }
    function setField(form, name, value) {
        const field = form.elements.namedItem(name);
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value === undefined ? '' : value;
    }
    function fillForm(form, record) {
        for (const [name, value] of Object.entries(record)) {
            if (form.elements.namedItem(name)) setField(form, name, Array.isArray(value) ? value.join(name === 'hours' ? '\n' : ', ') : value);
        }
    }
    function showPanel(name) {
        panel = name;
        document.querySelectorAll('[data-panel]').forEach((button) => {
            const active = button.dataset.panel === name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        document.querySelectorAll('[data-panel-content]').forEach((section) => { section.hidden = section.dataset.panelContent !== name; });
    }
    function renderProductList() {
        document.querySelector('#product-list').innerHTML = data.products.length ? data.products.map((item) => '<button type="button" class="item-button' + (item.id === selectedProduct ? ' is-selected' : '') + '" data-product-id="' + h(item.id) + '"><strong>' + h(item.name) + '</strong><span>' + item.price.toLocaleString('ro-RO') + ' lei · ' + (item.visible ? item.available ? 'Disponibil' : 'Indisponibil' : 'Ascuns') + '</span></button>').join('') : '<p class="list-note">Adaugă primul produs.</p>';
    }
    function renderReviewList() {
        document.querySelector('#review-list').innerHTML = data.reviews.length ? data.reviews.map((review) => '<button type="button" class="item-button' + (review.id === selectedReview ? ' is-selected' : '') + '" data-review-id="' + h(review.id) + '"><strong>' + h(review.author) + '</strong><span>Exemplu fictiv · ' + review.rating + '/5 · ' + (review.visible ? 'Afișat' : 'Ascuns') + '</span></button>').join('') : '<p class="list-note">Nu există exemple. Poți adăuga unul.</p>';
    }
    function productFromForm() {
        const values = new FormData(productForm);
        const split = (name) => String(values.get(name) || '').split(',').map(value => value.trim()).filter(Boolean);
        return {
            id: values.get('id'), name: values.get('name'), category: values.get('category'), categoryLabel: values.get('categoryLabel'),
            price: Number(values.get('price')), grams: values.get('grams') === '' ? null : Number(values.get('grams')), unit: values.get('unit') || 'g', description: values.get('description'),
            ingredients: split('ingredients'), allergens: split('allergens'), image: values.get('image'), imageAlt: values.get('imageAlt'), badge: values.get('badge'),
            available: values.has('available'), visible: values.has('visible')
        };
    }
    function updatePreview() {
        if (!selectedProduct) { document.querySelector('#product-preview').innerHTML = '<p class="preview-note">Adaugă un produs pentru previzualizare.</p>'; return; }
        try {
            const candidate = clone(data);
            const index = candidate.products.findIndex(item => item.id === selectedProduct);
            candidate.products[index] = productFromForm();
            const valid = model.validate(candidate);
            document.querySelector('#product-preview').innerHTML = model.renderProduct(valid.products[index], valid.business);
        } catch (_) { /* Keep the last valid preview while the form is incomplete. */ }
    }
    function selectProduct(id) {
        selectedProduct = id;
        const item = data.products.find(product => product.id === id);
        productForm.hidden = !item;
        if (item) fillForm(productForm, item);
        formDirty = false;
        renderProductList();
        updatePreview();
    }
    function selectReview(id) {
        selectedReview = id;
        const item = data.reviews.find(review => review.id === id);
        reviewForm.hidden = !item;
        if (item) fillForm(reviewForm, item);
        formDirty = false;
        renderReviewList();
    }
    function renderAll() {
        selectProduct(data.products[0] ? data.products[0].id : null);
        selectReview(data.reviews[0] ? data.reviews[0].id : null);
        fillForm(businessForm, data.business);
        showPanel(panel);
    }
    function newId(prefix, records) {
        let number = 1;
        while (records.some(record => record.id === prefix + '-' + number)) number += 1;
        return prefix + '-' + number;
    }

    try {
        data = model.validate(window.LA_ANDREI_CONTENT);
        renderAll();
        try { if (localStorage.getItem(draftKey)) document.querySelector('#restore-draft').hidden = false; } catch (_) { /* Optional local draft storage. */ }
    } catch (error) {
        report('Conținutul inițial nu poate fi încărcat. Rulează node scripts/build.cjs sau importă un JSON valid.\n' + error.message, true);
        data = null;
        document.querySelectorAll('.editor-panel').forEach(section => { section.hidden = true; });
    }

    document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => {
        if (!data || !canLeaveForm()) return;
        formDirty = false;
        renderAll();
        showPanel(button.dataset.panel);
    }));
    for (const form of [productForm, businessForm, reviewForm]) form.addEventListener('input', () => {
        formDirty = true;
        updateDirty(true);
        if (form === productForm) updatePreview();
    });
    document.querySelector('#product-list').addEventListener('click', (event) => {
        const button = event.target.closest('[data-product-id]');
        if (button && canLeaveForm()) selectProduct(button.dataset.productId);
    });
    document.querySelector('#review-list').addEventListener('click', (event) => {
        const button = event.target.closest('[data-review-id]');
        if (button && canLeaveForm()) selectReview(button.dataset.reviewId);
    });
    productForm.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
            const candidate = clone(data);
            const index = candidate.products.findIndex(item => item.id === selectedProduct);
            candidate.products[index] = productFromForm();
            const next = model.validate(candidate);
            data = next;
            changed();
            selectProduct(data.products[index].id);
            report('Produs actualizat în ciornă.');
        } catch (error) { report(error.message, true); }
    });
    businessForm.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
            const candidate = clone(data);
            const values = new FormData(businessForm);
            candidate.business = Object.fromEntries(values.entries());
            candidate.business.hours = String(values.get('hours') || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
            data = model.validate(candidate);
            changed();
            updatePreview();
            report('Datele restaurantului au fost modificate în ciornă.');
        } catch (error) { report(error.message, true); }
    });
    reviewForm.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
            const candidate = clone(data);
            const index = candidate.reviews.findIndex(review => review.id === selectedReview);
            const values = new FormData(reviewForm);
            candidate.reviews[index] = { id: values.get('id'), author: values.get('author'), avatar: values.get('avatar') || '', rating: Number(values.get('rating')), text: values.get('text'), isExample: true, visible: values.has('visible') };
            data = model.validate(candidate);
            changed();
            selectReview(data.reviews[index].id);
            report('Exemplul a fost modificat. Va rămâne marcat ca text fictiv pe site.');
        } catch (error) { report(error.message, true); }
    });
    document.querySelector('#add-product').addEventListener('click', () => {
        if (!data || !canLeaveForm()) return;
        const existing = data.products[0];
        const item = { id: newId('produs', data.products), name: 'Preparat nou', category: existing ? existing.category : 'shaorma', categoryLabel: existing ? existing.categoryLabel : 'Shaorma', grams: null, unit: 'g', price: 1, description: '', ingredients: [], allergens: [], image: existing ? existing.image : 'assets/real-shawarma-large.jpg', imageAlt: 'Completează descrierea preparatului', available: false, visible: false, badge: '' };
        data.products.push(item);
        changed();
        selectProduct(item.id);
        report('Produs nou adăugat ca ascuns și indisponibil. Completează datele înainte să îl afișezi.');
        productForm.elements.namedItem('name').focus();
    });
    document.querySelector('#remove-product').addEventListener('click', () => {
        if (!selectedProduct || !window.confirm('Ștergi acest produs din ciornă?')) return;
        data.products = data.products.filter(item => item.id !== selectedProduct);
        changed();
        selectProduct(data.products[0] ? data.products[0].id : null);
        report('Produsul a fost șters din ciornă. Fișierul sursă nu se schimbă până la salvare.');
    });
    document.querySelector('#add-review').addEventListener('click', () => {
        if (!data || !canLeaveForm()) return;
        const review = { id: newId('exemplu', data.reviews), author: 'Exemplu — Client', rating: 5, text: 'Textul recenziei.', isExample: true, visible: false };
        data.reviews.push(review);
        changed();
        selectReview(review.id);
        report('Exemplu fictiv adăugat ca ascuns.');
    });
    document.querySelector('#remove-review').addEventListener('click', () => {
        if (!selectedReview || !window.confirm('Ștergi acest exemplu din ciornă?')) return;
        data.reviews = data.reviews.filter(review => review.id !== selectedReview);
        changed();
        selectReview(data.reviews[0] ? data.reviews[0].id : null);
        report('Exemplul a fost șters din ciornă.');
    });
    document.querySelector('#import-json').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            if (file.size > 2000000) throw new Error('Fișierul depășește limita de 2 MB.');
            const imported = model.validate(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
            if (!canReplaceData()) return;
            data = imported;
            changed();
            renderAll();
            report('JSON valid importat. Datele din folderul site-ului nu au fost încă înlocuite.');
        } catch (error) { report('Import oprit; conținutul existent a fost păstrat.\n' + error.message, true); }
        finally { event.target.value = ''; }
    });
    document.querySelector('#restore-draft').addEventListener('click', () => {
        try {
            const restored = model.validate(JSON.parse(localStorage.getItem(draftKey)));
            if (!canReplaceData()) return;
            data = restored;
            changed();
            renderAll();
            report('Ciorna locală a fost restaurată.');
        } catch (error) { report('Ciorna nu poate fi restaurată: ' + error.message, true); }
    });
    function exportValue() {
        if (!data) throw new Error('Importă mai întâi un fișier valid.');
        if (formDirty) throw new Error('Apasă „Aplică modificările” în formular înainte de export.');
        return JSON.stringify(model.validate(data), null, 2) + '\n';
    }
    document.querySelector('#export-json').addEventListener('click', () => {
        try {
            const file = new Blob([exportValue()], { type: 'application/json;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = 'site.json';
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            updateDirty(false);
            report('Fișierul site.json a fost descărcat. Înlocuiește content/site.json și rulează node scripts/build.cjs pentru a actualiza site-ul.');
        } catch (error) { report(error.message, true); }
    });
    const saveFolder = document.querySelector('#save-folder');
    if (typeof window.showDirectoryPicker === 'function' && window.isSecureContext) saveFolder.hidden = false;

    async function projectFile(directory, relativePath, create = false) {
        const parts = relativePath.split('/');
        const filename = parts.pop();
        for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
        return directory.getFileHandle(filename, { create });
    }

    async function writeProjectFile(directory, relativePath, value) {
        const file = await projectFile(directory, relativePath, true);
        const writable = await file.createWritable();
        try {
            await writable.write(value);
            await writable.close();
        } catch (error) {
            try { await writable.abort(); } catch (_) { /* Preserve the original write error. */ }
            throw error;
        }
    }

    saveFolder.addEventListener('click', async () => {
        saveFolder.disabled = true;
        try {
            const exported = exportValue();
            const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
            await directory.getFileHandle('content-model.js');
            await projectFile(directory, 'content/site.json');
            report('Se actualizează paginile site-ului…');
            const homepage = await (await projectFile(directory, 'index.html')).getFile();
            const site = window.LaAndreiSite.prepareSite(await homepage.text(), JSON.parse(exported));

            // Verifică toate fișierele sursă înainte de a suprascrie paginile.
            const assetPaths = new Set([...site.referencedAssets, ...site.data.products.map(product => product.image)]);
            const assets = new Map();
            for (const asset of assetPaths) {
                try {
                    assets.set(asset, await (await projectFile(directory, asset)).getFile());
                } catch (error) {
                    if (error.name !== 'NotFoundError') throw error;
                    throw new Error('Imagine inexistentă: ' + asset);
                }
            }
            const publicFiles = [];
            for (const filename of window.LaAndreiSite.publicFiles) {
                publicFiles.push([filename, await (await projectFile(directory, filename)).getFile()]);
            }

            await writeProjectFile(directory, 'content/site.json', exported);
            await writeProjectFile(directory, 'content/editor-data.js', site.editorData);
            for (const [filename, html] of Object.entries(site.pages)) {
                await writeProjectFile(directory, filename, html);
                await writeProjectFile(directory, 'dist/' + filename, html);
            }
            for (const [filename, file] of publicFiles) await writeProjectFile(directory, 'dist/' + filename, file);
            for (const asset of site.referencedAssets) await writeProjectFile(directory, 'dist/' + asset, assets.get(asset));
            if (!formDirty && exportValue() === exported) updateDirty(false);
            report('Datele, paginile HTML și folderul dist/ au fost actualizate. Reîncarcă pagina site-ului ca să vezi modificările.');
        } catch (error) {
            if (error.name === 'AbortError') report('Salvarea a fost anulată. Ciorna este păstrată.');
            else report('Salvarea nu s-a finalizat. Selectează folderul proiectului La Andrei sau folosește descărcarea JSON.\n' + error.message, true);
        } finally {
            saveFolder.disabled = false;
        }
    });
    window.addEventListener('beforeunload', (event) => {
        if (dirty || formDirty) { event.preventDefault(); event.returnValue = ''; }
    });
}());
