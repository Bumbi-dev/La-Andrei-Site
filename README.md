# La Andrei — site de prezentare

Site static, fără instalare de pachete. Pentru previzualizarea coșului și contului între pagini, folosește serverul local al editorului (de exemplu Live Server) sau site-ul publicat. Paginile de prezentare pot fi deschise și direct din folder. Comenzile, autentificarea și plata de pe site sunt demonstrații în browser. Linkurile Bolt Food deschid serviciul extern.

Pagina principală păstrează primele trei preparate vizibile și secțiunea de locație. `meniu.html` afișează toate preparatele vizibile din JSON; `contact.html` reunește contactul și locația. `cos.html` și `cont.html` folosesc același design și aceeași sursă de date. Toate paginile se regenerează din `index.html`, `site-builder.js` și `content/site.json`, inclusiv prin salvarea din editor. Editează structura paginilor generate în `site-builder.js` pentru a păstra schimbările după regenerare.

Cardurile din pagina principală și `meniu.html` adaugă produse în același coș. `cos.html` permite schimbarea cantităților, alegerea livrării sau ridicării și o simulare de plată. Pasul de card afișează un placeholder, fără câmpuri pentru date bancare. `cont.html` prezintă autentificarea și crearea unui profil demo, istoricul comenzilor, fidelitatea și o previzualizare a panoului restaurantului. Starea se păstrează în `localStorage` pe același domeniu. Nu există autentificare reală, trimitere de comenzi sau procesare de plăți.

Reguli demo: sold inițial 120 puncte, 1 punct pentru fiecare leu plătit pe produse după reducere, 100 puncte pentru o reducere de 10 lei (maximum o dată pe comandă, minimum 10 lei în produse), livrare 8 lei. Punctele se modifică după finalizarea simulării cu cont. Vizitatorii pot continua fără cont. Reîncărcarea după o simulare nu dublează comanda sau punctele.

Un click pe fotografie, titlu, card sau butonul de detalii deschide un dialog cu ingredientele, gramajul total și prețul. Dialogul se închide prin buton, Escape sau click în afară. „Adaugă în coș” funcționează și direct din card. Fără JavaScript, ingredientele rămân accesibile în fiecare card.

Harta interactivă Google se încarcă automat, fără buton de activare: imediat pe pagina de contact și când se apropie de zona vizibilă pe pagina principală. Adresa și legăturile directe rămân disponibile și fără JavaScript sau dacă harta nu se încarcă. Pagina de contact are un layout dedicat, adaptat pentru telefon, cu adresă, apel telefonic și acces la Bolt Food; programul și emailul apar doar dacă sunt completate în JSON.

## Actualizarea meniului

1. Deschide `editor.html`. Datele inițiale se încarcă local din `content/editor-data.js`, fără server.
2. Editează produsele, ingredientele, prețurile, vizibilitatea și disponibilitatea. Confirmă formularul cu **Aplică modificările**. Poți edita și datele restaurantului sau recenziile demonstrative.
3. Apasă **Salvează în folderul site-ului** și selectează folderul proiectului. Editorul salvează `content/site.json` și regenerează fișierele HTML, datele editorului și `dist/` direct în folder. Reîncarcă pagina site-ului ca să vezi modificările.

Dacă browserul nu oferă salvarea în folder, apasă **Descarcă site.json**, înlocuiește `content/site.json` și rulează comanda de mai jos. Aceeași comandă se folosește pentru build-ul din Render.

```text
node scripts/build.cjs
```

Comanda validează datele și imaginile, regenerează meniul/recenziile/datele de contact/schema SEO în `index.html`, actualizează datele de pornire ale editorului și pregătește `dist/` pentru publicare. Node.js este necesar doar pentru regenerare; vizitatorii primesc HTML static. Conținutul meniului rămâne disponibil și fără JavaScript.

**Publică doar conținutul folderului `dist/`.** Editorul, JSON-ul sursă și scripturile de lucru nu sunt copiate acolo. Publicarea se face separat, prin serviciul de găzduire; editorul nu deține credențiale și nu actualizează automat site-ul online. Nu copia editorul pe găzduirea publică.

## Fotografii și conținut

Catalogul include 14 produse din meniul public Wolt verificat la 23 noiembrie 2026. Sandwich Panini și sandwich-ul crispy au fost eliminate la cererea utilizatorului. Prețurile existente 36/42/31 lei sunt păstrate; cele noi provin din listarea Wolt. Sursa și neclaritățile sunt documentate în `assets/MENU_SOURCES.md`. Băuturile folosesc `unit: "ml"`; preparatele folosesc `unit: "g"`. `grams: null` înseamnă gramaj neconfirmat, iar lista goală de ingrediente rămâne marcată ca neconfirmată, fără completări inventate.

- Pentru o fotografie nouă, copiază fișierul în `assets/` și completează calea sa relativă în editor (de exemplu `assets/shaorma.jpg`). Sunt acceptate PNG, JPEG, WebP și AVIF. Build-ul se oprește dacă imaginea lipsește.
- Numele, orașul, adresa, telefonul, emailul, programul și legăturile oficiale sunt în `content/site.json`. Câmpurile neconfirmate rămân goale; un program gol nu este afișat și nu este inventat în datele SEO.
- Cele trei produse păstrează prețurile din referința furnizată: 36, 42 și 31 lei. Fotografiile și ingredientele provin din lista oficială Wolt; proveniența imaginilor este documentată în `assets/`. Reconfirmați prețurile, ingredientele, alergenii și dreptul de utilizare a fotografiilor înainte de lansarea comercială.
- Lista goală de alergeni înseamnă **informații necompletate**, nu „fără alergeni”.
- Recenziile curente sunt texte de prezentare, păstrate în sursă cu `isExample: true`. Nu provin din Google Maps, nu formează un rating general și nu apar ca recenzii în datele structurate SEO.
- Recenziile au avatare rotunde cu inițiale. Pentru o fotografie de profil, completează câmpul opțional din editor cu o imagine locală din `assets/`; regenerarea o include în fișierele publice.
- Un produs cu `visible: false` nu este generat. Un produs vizibil cu `available: false` apare ca indisponibil și nu are buton de comandă.

## Verificări

```text
node scripts/test.cjs
```

Testele verifică validarea, codificarea textelor, filtrarea produselor, etichetele recenziilor fictive, regenerarea din JSON și delimitarea fișierelor publice. Dacă importul JSON este invalid, editorul păstrează datele curente. Ciornele sunt salvate opțional în browser și pot fi restaurate explicit.

Domeniul real nu este încă configurat. După alegerea lui, completați URL-ul canonic și sitemap-ul în configurația publică potrivită găzduirii. Domeniul, emailul și găzduirea se configurează în conturile proprietarului.
