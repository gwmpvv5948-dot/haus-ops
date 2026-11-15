# HAUS-OPS · LCARS-Wanddisplay

Ein Home-Assistant-Panel mit fünf Ansichten für ein Raspberry-Pi-Display im Querformat (800 × 480). Das Panel skaliert proportional mit der Fenstergröße.

## Vorschau

Im Stammverzeichnis des Repos `python3 -m http.server 8000 --bind 127.0.0.1` ausführen und [die Demo](http://127.0.0.1:8000/vorschau.html) öffnen. Alle Bedienaktionen in der Demo ändern simulierte Zustände. Beim Neuladen werden die Demo-Daten zurückgesetzt.

## Home Assistant

1. `www/haus-ops.js` und `www/haus-ops.css` in den Ordner `www` neben deiner Home-Assistant-`configuration.yaml` kopieren.
2. Den Eintrag aus `panel_custom.example.yaml` in die `configuration.yaml` übernehmen. Falls es bereits einen Schlüssel `panel_custom:` gibt, den Listeneintrag dort ergänzen.
3. Unter **Entwicklerwerkzeuge → Zustände** die tatsächlichen Entitäts-IDs nachsehen und die Beispiele ersetzen. Für die Lüftung die fünf tatsächlichen Optionen eines `input_select` oder `select` in der Reihenfolge Aus, Low, 1, 2, Max eintragen. Der Timer verwendet einen HA-Timer-Helfer. Für „Alle ab“ und „Alle auf“ eine Cover-Gruppe angeben. Die Lamellenanzeige verwendet deren Attribut `current_position`.
4. Die Konfiguration prüfen und Home Assistant neu starten. Mit deinem HA-Benutzer anmelden und `/haus-ops` öffnen. Diese vollständige URL als Chromium-Kiosk-Startseite nutzen, z. B. `http://homeassistant.local:8123/haus-ops`.

„+10 min“ startet den Timer oder verlängert die verbleibende Zeit. „Stop“ bricht ihn ab. Wenn der Timer deine Lüftung nach Ablauf regeln soll, übernimmt das eine Automation in Home Assistant. Das Panel zeigt die Zeit seit dem letzten vom Frontend bereitgestellten Sensorbericht an und verwendet ersatzweise die letzte Zustandsaktualisierung.

[Home Assistant · Custom Panel](https://www.home-assistant.io/integrations/panel_custom/)
