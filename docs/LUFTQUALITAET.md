# Luftqualität · Innen

Die HAUS-OPS-Navigation öffnet die Ansicht **Luftqualität**. Der Innenindex verwendet die höchste Teilbewertung der verfügbaren CO₂-, PM2.5-, PM10- und VOC-Index-Messwerte. Die Teilbewertungen verwenden die Grenzwerte aus der [JSON-Konfiguration](../custom_components/haus_ops/frontend/air-quality-config.json). Eine VOC-Konzentration in ppb oder µg/m³ braucht eine eigene Bewertung und wird nicht automatisch als VOC-Index interpretiert.

Die Ansicht übernimmt die bekannten Temperaturquellen für Wohnzimmer, Küche, Schlafzimmer, Alwin und Bad. Bei fehlendem CO₂-Wert zeigt die Raumzeile die verfügbare Temperatur und relative Feuchte. Absolute Feuchte und Taupunkt kommen aus Thermal Comfort. Ohne Schadstoffquellen zeigt der Gesamtindex „Keine Messdaten“. Der Verlauf verwendet dann verfügbare Raumklimawerte. Die Seite im lokalen Demo-Modus verwendet gekennzeichnete Beispielwerte.

## Sensoren und Verlauf

Unter **Einstellungen → Klima · <Raum> → Luftqualität** kannst du Lufttemperatur, relative Feuchte, CO₂, PM2.5, PM10 und VOC-Index auswählen. Mit **OK** werden die Raumzuordnungen in Home Assistant gespeichert. **Automatisch** verwendet wieder die YAML-Vorgabe oder die HA-Bereichszuordnung. Die Lufttemperatur für die Luftqualitätsseite lässt sich getrennt vom Temperatursensor der Heizungsansicht einstellen.

Home Assistant ordnet Schadstoffsensoren den konfigurierten Bereichen zu. Die Ansicht nutzt dabei sowohl die Bereichszuordnung einer Entität als auch die ihres Gerätes. Unter `haus_ops.air_quality` in der `configuration.yaml` können die Schlüssel der JSON-Datei überschrieben werden. In `rooms` sind `name`, `areas` und optionale Entitäts-IDs für `co2`, `pm25`, `pm10`, `voc`, `temperature` und `humidity` vorgesehen. Die Ansicht zeigt bis zu sieben Raumzeilen. `indoor` akzeptiert zusätzliche Innenquellen je Schadstoff. `outdoor` erwartet eine Außen-AQI-Entität. `referenceRoom` kann den Innenindex auf einen Raum begrenzen.

Eine Raumzeile filtert die Kurve und die Heatmap. Erneutes Antippen setzt den Filter zurück. Kurve und Heatmap verwenden Home Assistants Recorder-Statistiken. Lücken bleiben sichtbar, wenn eine Entität keine Statistiken liefert. Ereignisse lassen sich über `events` als Objekte mit `entity`, `state` und `label` konfigurieren, etwa Fensterkontakte mit Zustand `on`.

## Gelber Alarm

Ein Innenindex über 200 löst im laufenden HAUS-OPS-Dashboard automatisch **Gelb** aus. Der Alarm verwendet denselben Innenindex wie die Luftqualitätsseite und berücksichtigt einen konfigurierten Referenzraum. Der Raumfilter ändert den Alarm nicht. **Details** öffnet die Luftqualitätsseite. Stummschaltung und Quittierung gelten für die aktuelle Meldung in diesem Dashboard. Sobald der Index wieder höchstens 200 beträgt oder kein kritischer Messwert mehr verfügbar ist, verschwindet die Meldung. Rote Alarme haben Vorrang.
