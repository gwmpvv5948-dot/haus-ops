# HAUS-OPS · LCARS-Wanddisplay

Home-Assistant-Panel für ein Raspberry-Pi-Display im Querformat (800 × 480) mit Übersicht, Sicherheit, Lüftung, Rollos und Klima. Antonio und die zugehörige Schriftlizenz sind im Paket enthalten.

## Installation über HACS

1. In Home Assistant unter **HACS → ⋮ → Benutzerdefinierte Repositories** das Repository `https://github.com/gwmpvv5948-dot/haus-ops` als **Integration** hinzufügen. Anschließend **HAUS-OPS** herunterladen oder aktualisieren.
2. Falls der bisherige HAUS-OPS-Eintrag unter `panel_custom:` eingerichtet ist, diesen Eintrag entfernen, damit `/haus-ops` nur einmal registriert wird.
3. In der `configuration.yaml` einmal `haus_ops: {}` ergänzen. Eine vorhandene `haus_ops:`-Konfiguration kann beibehalten werden.
4. Die Home-Assistant-Konfiguration prüfen und Home Assistant neu starten. **HAUS-OPS** erscheint mit dem Enterprise-Symbol in der Seitenleiste. Die URL für den Raspberry bleibt `/haus-ops`.
5. Als Administrator **82873.4** antippen, Entitäten mit vollständiger ID eintragen und mit **OK** speichern. Eine vorhandene Konfiguration aus dem aktuellen Panel wird übernommen.

## Entitäten und Funktionen

- **Sicherheit:** Kontakte können als `binary_sensor.*` eingetragen werden. Ein steuerbares Schloss benötigt `lock.*`.
- **Lüftung:** Die Trafo-Anzeige verwendet `number.trafocurrentvolt`. Die fünf Stufen verwenden `input_button.trafo_button` und die Varianten mit den Endungen `_80`, `_150`, `_175` und `_230`. Die bisherige YAML-Konfiguration mit `select` oder `input_select` funktioniert als Alternative.
- **Rollos:** Für Wohnen, Küche und Terrasse je eine `cover.*`-Entität hinterlegen. Namen und Presets sind konfigurierbar. Für die Übersicht können Auf und Ab getrennt belegt werden. Optional synchronisiert ein `input_select.rollo_auswahl` mit den Optionen `alle`, `wohnen`, `kueche` und `terrasse` die Auswahl zwischen Geräten.
- **Klima:** HAUS-OPS verwendet vorhandene Heizungsmanager-Daten oder die in den Einstellungen hinterlegten Klimasensoren und Thermostate.
- **Navigation:** Wasser verlinkt auf das separate Panel unter `/wassermanager`, sofern es installiert ist. Garten ist als Platzhalter vorhanden.

## PV-Simulation

Unter **Energie → PV-Simulation** öffnet sich die 3D-Ansicht für Sonnenstand, Verschattung und PV-Ertrag bei klarem Himmel. Die Ansicht bietet Datumsauswahl, Tagesablauf und Kameraperspektiven.

Die Ist-Leistung über der 3D-Ansicht summiert die vier PV-Leistungssensoren aus **Energie**. Den Ist-Tagesertrag liefert `energy.solar_energy_today`. Beide Anzeigen aktualisieren sich mit den Zuständen aus Home Assistant. Die 3D-Ansicht berechnet die Werte für das ausgewählte Datum.

Die Simulationsdateien der eigenen Anlage lokal unter `/config/www/haus3d/` ablegen. HAUS-OPS lädt `/local/haus3d/index.html`. Den Ordner vollständig kopieren, damit Modell, Luftbild und Schriften verfügbar sind. Die Dateien unter `/local/` sind über die Home-Assistant-URL ohne Anmeldung abrufbar. Für Standortdaten Home Assistant nur im Heimnetz oder über ein privates VPN erreichbar machen.

## Vorschau und manuelle Installation

Für die Demo im Repository `python3 -m http.server 8000 --bind 127.0.0.1` ausführen und [vorschau.html](http://127.0.0.1:8000/vorschau.html) öffnen. Die Demo verwendet simulierte Zustände.

Für eine manuelle Installation `custom_components/haus_ops` nach `/config/custom_components/haus_ops` kopieren und ab Schritt 2 fortfahren. [YAML-Beispiel](haus_ops.example.yaml).

## Alarme

[Gelbe und rote Alarme in Home Assistant und HAUS-OPS konfigurieren](docs/alarme.md)

[Alle gelben Alarme: Bedingungen, Einstellungen und Deaktivierung](docs/gelbe-alarme.md)

Die Ansicht **Luftqualität** zeigt Schadstoffwerte, Raumklima und Recorder-Verläufe. Die Sensorzuordnung ist in der [Dokumentation zur Luftqualität](docs/LUFTQUALITAET.md) beschrieben.
