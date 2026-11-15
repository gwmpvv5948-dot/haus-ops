# HAUS-OPS · LCARS-Wanddisplay

Ein Home-Assistant-Panel mit fünf Ansichten für ein Raspberry-Pi-Display im Querformat (800 × 480). Das Panel skaliert proportional mit der Fenstergröße.

## Vorschau

Im Stammverzeichnis des Repos `python3 -m http.server 8000 --bind 127.0.0.1` ausführen und [die Demo](http://127.0.0.1:8000/vorschau.html) öffnen. Alle Bedienaktionen in der Demo ändern simulierte Zustände. Beim Neuladen werden die Demo-Daten zurückgesetzt.

## Installation über HACS

HACS lädt benutzerdefinierte Repositories von öffentlichen GitHub-Repositories. Solange dieses Repository privat ist, kannst du die Integration manuell installieren.

1. In Home Assistant **HACS → ⋮ → Benutzerdefinierte Repositories** öffnen. `https://github.com/gwmpvv5948-dot/haus-ops` mit der Kategorie **Integration** hinzufügen und **HAUS-OPS** herunterladen.
2. Den Block aus [haus_ops.example.yaml](haus_ops.example.yaml) in die `configuration.yaml` übernehmen. Unter **Entwicklerwerkzeuge → Zustände** findest du die tatsächlichen Entitäts-IDs. Bei der Lüftung die fünf Optionen deines `input_select` oder `select` in der Reihenfolge Aus, Low, 1, 2, Max eintragen. Für den Timer einen HA-Timer-Helfer und für die Rollos eine Cover-Gruppe verwenden.
3. Falls der alte HAUS-OPS-Eintrag unter `panel_custom:` schon eingerichtet ist, diesen einen Eintrag entfernen, damit die URL `/haus-ops` nur einmal registriert wird.
4. Die Home-Assistant-Konfiguration prüfen und Home Assistant neu starten. **HAUS-OPS** erscheint in der Seitenleiste. Für Chromium im Kioskmodus die volle URL verwenden, beispielsweise `http://homeassistant.local:8123/haus-ops`.

## Manuelle Installation

Den Ordner `custom_components/haus_ops` in den Ordner `custom_components` neben deiner Home-Assistant-`configuration.yaml` kopieren. Danach mit Schritt 2 oben fortfahren. Die [bisherige panel_custom-Konfiguration](panel_custom.example.yaml) bleibt als Referenz verfügbar. Bei Bedarf liegen die dazugehörigen JS- und CSS-Dateien unter `custom_components/haus_ops/frontend`.

„+10 min“ startet den Timer oder verlängert die verbleibende Zeit. „Stop“ bricht ihn ab. Wenn der Timer deine Lüftung nach Ablauf regeln soll, übernimmt das eine Automation in Home Assistant. Das Panel zeigt die Zeit seit dem letzten vom Frontend bereitgestellten Sensorbericht an und verwendet ersatzweise die letzte Zustandsaktualisierung.

[Home Assistant · Custom Panel](https://www.home-assistant.io/integrations/panel_custom/)
