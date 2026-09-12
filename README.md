# CoC Upgrade Tracker – GitHub Pages Edition

Diese Version ist für **GitHub Pages** vorbereitet. Sie benötigt keinen Node.js-Server und keinen Clash-API-Token.

## Upload zu GitHub

1. Auf GitHub ein neues Repository erstellen, z. B. `coc-upgrade-tracker`.
2. **Alle Dateien aus diesem Ordner direkt in das Repository hochladen**. `index.html` muss im Hauptverzeichnis des Repositories liegen.
3. Repository öffnen → **Settings → Pages**.
4. Unter **Build and deployment** bei Source **Deploy from a branch** auswählen.
5. Branch **main** und Ordner **/(root)** auswählen → **Save**.
6. Nach dem Deployment erscheint oben in den Pages-Einstellungen die öffentliche URL, normalerweise:
   `https://DEIN-NAME.github.io/coc-upgrade-tracker/`

## Nutzung

- `+ Account` anklicken.
- In Clash of Clans den Village-JSON-Export kopieren.
- JSON einfügen und importieren.
- Weitere Accounts können jederzeit mit `+ Account` hinzugefügt werden.

## Speicherung / Datenschutz

Die Accounts und deine importierten Village-Daten werden ausschließlich im **localStorage des jeweiligen Browsers** gespeichert. Sie werden nicht in das GitHub-Repository hochgeladen.

Wichtig: Daten von `localhost` werden nicht automatisch auf die GitHub-Pages-Adresse übertragen, weil Browser-Speicher an die jeweilige Domain gebunden ist. Auf der GitHub-Seite musst du die Accounts einmal erneut per Village JSON importieren.

## Upgrade-Daten

Die Seite lädt die strukturierte Clash-of-Clans-Datenbasis `clash-of-clans-data@0.16.0` über jsDelivr. Die Version ist fest angepinnt, damit ein späteres Paket-Update die Website nicht unbemerkt verändert.

## Dateien

- `index.html` – Website
- `app.js` – Tracker-Oberfläche und Logik
- `village-import.js` – Village-JSON-Parser
- `data-loader.js` – lädt Upgrade-Kosten/-Zeiten
- `export-map.json` – Zuordnung der Village-Export-IDs
- `style.css` – Design
- `.nojekyll` – verhindert Jekyll-Verarbeitung auf GitHub Pages

## Hinweis

Dieses Projekt ist nicht mit Supercell verbunden oder von Supercell unterstützt. Clash of Clans ist eine Marke von Supercell.
