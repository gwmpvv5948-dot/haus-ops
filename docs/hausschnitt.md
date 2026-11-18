# HAUS · SCHNITT

Die Navigation öffnet über **Haus · Schnitt** ein Vollbild-Overlay über der aktuellen Seite für das 10-Zoll-Display (1920 × 1200, Querformat). Das einzige SVG verwendet eine logische Fläche von 1280 × 800. Die vorhandene HAUS-OPS-Verbindung liefert die Live-Zustände; es gibt keinen zweiten Login und keinen zusätzlichen Token im Browser.

## Daten und Bedienung

- Neun gezeichnete Innenräume auf vier Etagen. Räume werden über HA-Areas zugeordnet. Die HA-Floor-Ebene 0–3 wird verwendet, sofern sie vorhanden ist; andernfalls gilt die Etage aus der Zeichnungskonfiguration.
- Temperaturquellen sind der Area zugeordnete Sensoren mit `device_class: temperature`. Sensoren mit der Endung `_temperature`, `_temperatur` oder `_temp` werden bevorzugt. Bereits konfigurierte Raumtemperaturen aus Heizungsmanager/HAUS-OPS haben Vorrang. Ein expliziter `temperature_entity` in der JSON-Datei hat die höchste Priorität. Mehrere passende Area-Werte werden gemittelt. Ohne Area-Wert können eindeutig nach dem Raum benannte Temperatursensoren verwendet werden. Fahrenheit wird umgerechnet. Der Innenmittelwert enthält den Dachspitz nicht.
- `light.*` und mit **licht** beschriftete `switch.*` werden aus der Area übernommen. Diagnose-/Konfigurations-LEDs, einzelne Segmente mit vorhandener übergeordneter Lampe und doppelt repräsentierte HA-Lichtgruppen werden automatisch ausgelassen. Eine explizite JSON-Lampenzuordnung kann sie gezielt aufnehmen. Die direkte Area-Zuordnung einer Entität hat Vorrang vor der Gerätezuordnung. Der Lichtfilter der normalen Licht-Seite begrenzt den Hausschnitt nicht.
- Für das gemeinsame Wohn- und Esszimmer können mehrere Areas verwendet werden.
- Fehlende Zuordnungen oder Werte werden als solche angezeigt. Es werden im HA-Betrieb keine Beispieldaten eingesetzt. Die Demo verwendet ausschließlich Demo-Zustände.
- Tippen auf Raum oder Raumzeile hebt ihn und seine Leitungen hervor. Erneutes Tippen hebt die Auswahl auf.
- Tippen auf eine Lampe oder ihre Zeile schaltet sie. Nicht verfügbare Lampen sind gesperrt. Helligkeit, Lichtkegel, Raumaufhellung und Zähler aktualisieren sich ohne neuen Aufbau der Leitungen.
- **Schließen** führt zur zuvor geöffneten Seite. Die vorhandenen Alarm- und Standby-Regeln bleiben aktiv; rote Alarm-Overlays bleiben auch auf dem Hausschnitt sichtbar.

Die automatisch flackernden Datenpillen sind reine Dekoration und ausdrücklich keine Messwerte. Es werden keine Maßangaben oder Zeitstempel angezeigt. Ein eigener Dimmregler oder eine Langdruckfunktion ist nicht Teil dieser Ansicht.

## Lampenauswahl je Raum

Unter **Einstellungen → Haus · Schnitt** gibt es für jeden Raum eine mehrzeilige Textbox. Eine vollständige `light.*`- oder `switch.*`-ID pro Zeile eintragen; Einträge direkt hinzufügen oder entfernen. Die Liste ersetzt die automatische Auswahl dieses Raums. Eine leere Liste bedeutet ausdrücklich **keine Lampen anzeigen**. Die Auswahl wird mit **OK** gespeichert und ist unabhängig vom Lichtfilter der anderen Seiten. Noch nicht gespeicherte Raumlisten werden zunächst automatisch befüllt. Dieselbe Entität kann bei Bedarf in mehreren Räumen dargestellt werden; die Gesamtzahl zählt sie nur einmal.

Küche und Bad verwenden im mitgelieferten Layout `sensor.ku_temp` bzw. `sensor.bd_temp`. Schlafzimmer verwendet `sensor.sz_temp`.

## Eigene Geometrie und Zuordnung

Das mitgelieferte Layout steht in `custom_components/haus_ops/frontend/house-section.json`. Diese Datei als Vorlage nach `/config/www/haus-schnitt.json` kopieren und unter **Einstellungen → Haus · Schnitt** den Pfad `/local/haus-schnitt.json` eintragen. Damit bleiben eigene Änderungen bei HACS-Updates erhalten. Das Feld leer lassen, um das mitgelieferte Layout zu verwenden. Nach Änderungen am Dateiinhalt den Browser neu laden.

Jeder Raum enthält:

- `key`: eindeutiger interner Schlüssel aus Kleinbuchstaben, Ziffern, `-` oder `_`.
- `name`, `aliases`: Anzeigename und alternative HA-Area-Namen. Großschreibung und Umlaute werden beim Abgleich vereinheitlicht.
- Optional `area_ids`: explizite HA-Area-IDs statt des Namensabgleichs.
- `floor`: Zeichnungsetage 0–3, `side`: `left` oder `right` für die Beschriftung.
- `polygon`: SVG-Koordinaten des Raumumrisses; `anchor`: Zielpunkt der Raumleitung.
- Optional `temperature_entity`: ein bestimmter `sensor.*` statt automatischer Auswahl.
- `lamps`: bekannte Lampenpositionen. `entity_id` ordnet eine bestimmte Leuchte zu; alternativ werden `aliases` gegen den HA-Anzeigenamen abgeglichen. Typen: `decke`, `stehlampe`, `streifen`; `position` ist das SVG-Koordinatenpaar. Weitere Area-Leuchten bekommen zusätzliche Positionen innerhalb des Raumumrisses.

Ein Raumeintrag sieht beispielsweise so aus (als Teil der vollständigen `rooms`-Liste):

```json
{
  "key": "bedroom",
  "name": "Schlafzimmer",
  "aliases": ["Schlafzimmer", "SZ"],
  "floor": 2,
  "side": "right",
  "polygon": [[700,310],[740,310],[834,390],[834,414],[700,414]],
  "anchor": [780,389],
  "temperature_entity": "sensor.sz_temp",
  "lamps": []
}
```

Lichtquellen und Lichtkegel werden auf das jeweilige Polygon beschnitten. Geometrie und Leitungen werden bei Zustandsänderungen nicht neu erstellt. Ändert sich dagegen die Raum-/Lampenzuordnung, wird das Layout neu aufgebaut.

Der Haus-Schnitt öffnet sich als Overlay über der aktuellen Seite. Beim Öffnen werden Haus, Einrichtung, Leitungen und Beschriftungen nacheinander aufgebaut. „Schließen“ oder Escape blendet das Overlay aus. Lampennamen bestimmen die Symbole: Fado als Kugel auf einem Tisch (im Garten direkt auf dem Boden), Schrank als Unterbauleuchte, Stripe/Rope als Lichtband.


Der Garten ist nicht Teil des mitgelieferten Haus-Schnitts. Die Zeichnung ist zwischen zwei Informationsspalten zentriert. Pro Raum wird eine Verbindungslinie gezeigt; Lampendetails stehen gesammelt unter dem jeweiligen Raum, ohne zusätzliche kreuzende Einzelleitungen.

## Waschmaschine und Schreibtisch

Im Bad zeigt eine Waschtrommel den Betrieb bei mehr als 3 W über `sensor.tasmota_wama_plug_energy_power`. Bei fehlenden Messwerten erscheint „Keine Daten“ und die Animation steht still. Optional lässt sich im eigenen Zeichnungs-JSON `washer_power_entity` auf einen anderen Leistungssensor setzen (W oder kW). Stromsensoren in Ampere werden nicht als Watt interpretiert.

Im Arbeitszimmer ist `switch.schreibtisch` als Tischlampe zugeordnet. Ein vorhandener Schalter wird auch bei einer zuvor gespeicherten leeren Arbeitszimmer-Liste aufgenommen.

Der Dachspitz zeigt **Warp-Kern-Temp.** aus `sensor.inverter_interne_temperatur`. Die Ausgabe erfolgt in °C; Fahrenheit wird mit `(°F − 32) × 5 / 9` umgerechnet, Kelvin mit `K − 273,15`. Diese Gerätetemperatur wird nicht im Innenraum-Mittelwert berücksichtigt.
