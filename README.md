# Matlogg

Personlig matloggning som PWA. Fritext ("150 g köttfärs, 2 ägg") tolkas lokalt och matchas mot
Livsmedelsverkets livsmedelsdatabas. All data sparas i telefonen (IndexedDB).

Näringsvärden: © Livsmedelsverket, [livsmedelsdatabasen](https://dataportal.livsmedelsverket.se/livsmedel), licens CC BY 4.0.

## Struktur

```
index.html, manifest.webmanifest, sw.js   appens skal, PWA-manifest, offline-cache
css/app.css                               all styling
js/app.js                                 start och navigering
js/db.js                                  IndexedDB + export/import
js/parser.js                              tolkar "150 g köttfärs" → mängd, enhet, namn
js/foods.js                               livsmedelsregister, sökning, ihågkomna val, egna livsmedel
js/portions.js                            gram per st/skiva/dl osv.
js/goals.js                               målförslag (Mifflin-St Jeor)
js/views/                                 dagsvy, loggning, inställningar
data/livsmedel.json                       Livsmedelsverkets data (genereras)
tools/import-slv.mjs                      hämtar databasen på nytt
tools/release.mjs                         höjer versionsnumret inför publicering
tools/serve.mjs                           lokal testserver
```

## Testa på datorn

```bash
node tools/serve.mjs
```

Öppna sedan http://localhost:8765. På localhost är offline-cachen avstängd så att ändringar syns direkt
(lägg till `?sw=1` i adressen för att testa offline-läget).

## Uppdatera Livsmedelsverkets data

```bash
node tools/import-slv.mjs
```

---

# Guide: publicera på GitHub Pages och lägg appen på hemskärmen

GitHub Pages är GitHubs gratis webbhotell för statiska sidor. Appen blir tillgänglig på
`https://<ditt-användarnamn>.github.io/matlogg/`.

> Repot måste vara **publikt** för att Pages ska vara gratis. Det är ingen fara: koden innehåller ingen
> personlig data. Din matlogg och (senare) din API-nyckel finns bara i telefonen.

## 1. Skapa ett repo på GitHub

1. Gå till https://github.com/new och logga in.
2. **Repository name:** `matlogg`.
3. Välj **Public**.
4. Kryssa **inte** i "Add a README" eller något annat. Repot ska vara tomt.
5. Tryck **Create repository**.

## 2. Pusha koden från datorn

Öppna Terminal och kör kommandona ett i taget:

```bash
cd ~/Documents/Träningsapp
```

Första gången du använder git på datorn behöver du ange namn och e-post:

```bash
git config --global user.name "Ditt Namn"
```

```bash
git config --global user.email "din@epost.se"
```

Skapa ett lokalt repo och gör den första sparningen (commit):

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "Matlogg version 1"
```

Koppla till GitHub och skicka upp koden (byt `ac360` om ditt användarnamn är ett annat):

```bash
git remote add origin https://github.com/ac360/matlogg.git
```

```bash
git push -u origin main
```

> Snabbare alternativ: du har GitHub CLI (`gh`) inloggat, så steg 1–2 kan göras med
> `gh repo create matlogg --public --source=. --push` efter `git init`, `git add` och `git commit`.

## 3. Aktivera GitHub Pages

1. Gå till repot på GitHub: `https://github.com/ac360/matlogg`.
2. Tryck **Settings** (kugghjulet i menyn överst i repot).
3. Välj **Pages** i vänstermenyn.
4. Under **Build and deployment** → **Source**: välj **Deploy from a branch**.
5. Under **Branch**: välj **main** och mappen **/ (root)**. Tryck **Save**.
6. Vänta 1–2 minuter och ladda om sidan. Överst står **"Your site is live at …"** med adressen.

Öppna adressen på datorn och kontrollera att appen laddar.

## 4. Lägg appen på hemskärmen (iPhone)

1. Öppna adressen (`https://ac360.github.io/matlogg/`) i **Safari**. Det måste vara Safari.
2. Tryck på **Dela**-knappen (fyrkanten med pil uppåt).
3. Scrolla ner och välj **Lägg till på hemskärmen**.
4. Kontrollera att namnet är "Matlogg" och tryck **Lägg till**.
5. Öppna appen från hemskärmen. Den startar i helskärm utan Safaris adressfält och fungerar offline.

**Viktigt:** Det som loggas i hemskärmsappen sparas separat från Safari-fliken. Använd alltid
hemskärmsikonen.

## 5. Publicera uppdateringar

När koden har ändrats:

```bash
cd ~/Documents/Träningsapp
```

```bash
node tools/release.mjs
```

(Höjer versionsnumret. Utan det ser telefonen inte att något ändrats, eftersom appen körs från offline-cachen.)

```bash
git add .
```

```bash
git commit -m "Beskriv ändringen"
```

```bash
git push
```

Efter 1–2 minuter är den nya versionen ute. Öppna appen på telefonen. Inom några sekunder visas
**"Ny version finns – Uppdatera"**. Tryck på Uppdatera. Visas inget? Stäng appen helt (svep bort den) och
öppna igen.

Din data påverkas inte av uppdateringar.

## Backup

Inställningar → **Exportera all data** öppnar delningsmenyn. Välj **Spara i Filer** (t.ex. iCloud Drive).
Med **Importera backup** återställer du från en sådan fil (ersätter all data i appen).
Appen påminner dig om du inte exporterat på två veckor.
