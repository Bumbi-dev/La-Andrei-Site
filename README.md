# La Andrei — site de prezentare

Site static, fără instalare de pachete. Deschide `index.html` direct sau prin serverul local al editorului. Comenzile sunt redirecționate către Bolt Food; site-ul nu încasează bani și nu gestionează conturi/comenzi proprii.

Pagina principală păstrează primele trei preparate vizibile și secțiunea de locație. `meniu.html` afișează toate preparatele vizibile din JSON; `contact.html` reunește contactul și locația. Toate paginile se regenerează prin aceeași comandă, din structura paginii principale și din datele de conținut. Nu edita manual paginile generate `meniu.html` și `contact.html` dacă vrei să păstrezi schimbările după regenerare.

Un click pe fotografie, titlu, card sau butonul de detalii deschide un dialog cu ingredientele, gramajul total și prețul. Dialogul se închide prin buton, Escape sau click în afară. Butonul de comandă rămâne legătura directă către Bolt Food. Fără JavaScript, ingredientele rămân accesibile în fiecare card.

Harta interactivă Google se încarcă automat, fără buton de activare: imediat pe pagina de contact și când se apropie de zona vizibilă pe pagina principală. Adresa și legăturile directe rămân disponibile și fără JavaScript sau dacă harta nu se încarcă. Pagina de contact are un layout dedicat, adaptat pentru telefon, cu adresă, apel telefonic și acces la Bolt Food; programul și emailul apar doar dacă sunt completate în JSON.

## Actualizarea meniului

1. Deschide `editor.html`. Datele inițiale se încarcă local din `content/editor-data.js`, fără server.
2. Editează produsele, ingredientele, prețurile, vizibilitatea și disponibilitatea. Confirmă formularul cu **Aplică modificările**. Poți edita și datele restaurantului sau recenziile demonstrative.
3. Apasă **Descarcă site.json** și înlocuiește `content/site.json` cu fișierul descărcat. În browserele compatibile poți folosi **Salvează în folderul site-ului**, alegând explicit folderul proiectului.
4. Din folderul proiectului rulează:

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
- Toate recenziile curente sunt **exemple fictive**, etichetate individual și la nivel de secțiune. Nu provin din Google Maps, nu formează un rating general și nu apar ca recenzii în datele structurate SEO. Editorul acestei versiuni acceptă doar `isExample: true`.
- Recenziile au avatare rotunde cu inițiale. Pentru o fotografie de profil, completează câmpul opțional din editor cu o imagine locală din `assets/`; regenerarea o include în fișierele publice.
- Un produs cu `visible: false` nu este generat. Un produs vizibil cu `available: false` apare ca indisponibil și nu are buton de comandă.

## Verificări

```text
node scripts/test.cjs
```

Testele verifică validarea, codificarea textelor, filtrarea produselor, etichetele recenziilor fictive, regenerarea din JSON și delimitarea fișierelor publice. Dacă importul JSON este invalid, editorul păstrează datele curente. Ciornele sunt salvate opțional în browser și pot fi restaurate explicit.

Domeniul real nu este încă configurat. După alegerea lui, completați URL-ul canonic și sitemap-ul în configurația publică potrivită găzduirii. Domeniul, emailul și găzduirea se configurează în conturile proprietarului.
