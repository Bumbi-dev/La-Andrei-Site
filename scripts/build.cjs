const fs = require('node:fs');
const path = require('node:path');
const { prepareSite, publicFiles, replaceRegion } = require('../site-builder.js');

function build(directory = path.resolve(__dirname, '..')) {
    const source = path.join(directory, 'content', 'site.json');
    const input = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
    const home = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    const { data, pages, referencedAssets, editorData } = prepareSite(home, input);
    for (const product of data.products) {
        const imagePath = path.resolve(directory, product.image);
        const assetRoot = path.join(directory, 'assets') + path.sep;
        if (!imagePath.startsWith(assetRoot) || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) throw new Error('Imagine inexistentă pentru ' + product.name + ': ' + product.image);
    }
    for (const asset of referencedAssets) {
        const assetPath = path.resolve(directory, asset);
        if (!assetPath.startsWith(path.join(directory, 'assets') + path.sep) || !fs.existsSync(assetPath)) throw new Error('Fișierul public lipsește: ' + asset);
    }
    fs.mkdirSync(path.join(directory, 'content'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'content', 'editor-data.js'), editorData, 'utf8');
    const output = path.join(directory, 'dist');
    fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
    for (const [filename, page] of Object.entries(pages)) {
        fs.writeFileSync(path.join(directory, filename), page, 'utf8');
        fs.writeFileSync(path.join(output, filename), page, 'utf8');
    }
    for (const filename of publicFiles) {
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
