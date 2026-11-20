# Gelbe Alarme: Bestand, Konfiguration und Deaktivierung

Stand: **19.11.2026**, abgeglichen mit der Home-Assistant-Konfiguration und dem HAUS-OPS-Frontend. Dies ist eine Bestandsdokumentation; die beschriebenen Regeln wurden beim Dokumentieren nicht verändert.

In HA sind **28 gelbe `alert.*`-Definitionen** hinterlegt. Zusätzlich kann HAUS-OPS eine eigene Warnung für kritische Innen-Luftqualität erzeugen. Welche HA-Alerts im Dashboard erscheinen, bestimmt die gespeicherte Liste **Gelbe Warnungen**; eine vorhandene Definition ist nicht automatisch dort ausgewählt.

Die Raumklima-Alerts sind inzwischen in HA geladen. Die zuletzt ergänzte Nachtverbrauchs-Warnung ist in YAML vorbereitet und in der Dashboard-Liste eingetragen; ihre neue `alert.*`-Entität wird erst beim nächsten HA-Neustart geladen. Beim Einrichten wurde kein Neustart durchgeführt. Den aktuellen Ladezustand unter **Entwicklerwerkzeuge → Zustände** anhand der unten genannten IDs prüfen.

## Schnellzugriff: Wo ändere ich was?

| Wunsch | Stelle | Wirkung |
| --- | --- | --- |
| Eine Warnung im Dashboard anzeigen oder ausblenden | **HAUS-OPS → Sternzeit unten links (bisher „82873.4“) → Gelbe Warnungen**; eine vollständige `alert.*`-ID pro Zeile; mit **OK** speichern | Ändert die ausgewählten Warnungen, nicht ihre HA-Auslösebedingungen |
| Temperaturgrenze, Feuchtegrenze, Wartezeit oder Nachtzeit ändern | **File editor → `/config/configuration.yaml` → `template:`**, passende `…_gelb_bedingung` suchen | Ändert die tatsächliche Bedingung |
| Fenster-Kältewarnung ändern | **Einstellungen → Automationen & Szenen → „Gelber Alarm – Fenster und Türen bei Kälte“ → In YAML bearbeiten** | Gemeinsame Regel für acht Kontakte |
| Einen Alarm dauerhaft vollständig deaktivieren | **`/config/configuration.yaml` → `alert:`**, beim betreffenden Eintrag `state: "on"` auf `state: "deaktiviert"` ändern; siehe Anleitung unten | Alert löst nach dem Laden nicht mehr aus, bleibt aber konfiguriert |
| Laufenden Alarm quittieren | **HAUS-OPS → Sicherheit → Warnung auswählen → QUITTIEREN 1,2 s halten** | Für diese Episode quittiert; Ursache bleibt sichtbar |
| Vorübergehend Ruhe im geöffneten Dashboard | **Sicherheit → Warnung → STUMM 30 MIN** | Lokale Pause, kein Abschalten der HA-Regel oder der mobilen Meldungen |
| Gelbe Push-Nachrichten abschalten | **HAUS-OPS-Einstellungen → Mobile Alarmmeldungen → Gelber Alarm → alle Empfänger abwählen → OK** | Keine gelben Push-Nachrichten aus HAUS-OPS; Dashboard-Warnungen bleiben erhalten |
| Dashboard-Töne verändern | **HAUS-OPS-Einstellungen → Töne** | Betrifft die Tonwiedergabe, nicht das Entstehen der Alarme |

**Konfiguration ist getrennt:** Raum-Sensoren unter **Klima/Luftqualität** neu zuzuordnen ändert die unten genannten HA-YAML-Alarmbedingungen nicht automatisch. Dort sind die Sensor-IDs ausdrücklich eingetragen. Auch eine Änderung der HA-Raumzuordnung legt keine neuen Raum-Alarme an.

## 1. Fenster und Türen bei Kälte — acht Warnungen

Gemeinsame Automation: **„Gelber Alarm – Fenster und Türen bei Kälte“**, ID `1794915630023`, gespeichert in `/config/automations.yaml`.

Die Regel setzt pro Kontakt einen `input_boolean`-Helfer. Der zugehörige `alert.*` überwacht diesen Helfer.

| Bereich | Kontakt | Alarm-Helfer | Alert-ID |
| --- | --- | --- | --- |
| Carla, Fenster 1 | `binary_sensor.carla_fensterstatus1_contact` | `input_boolean.fenster1_carla_gelberalarm` | `alert.fenster1_carla_gelb` |
| Carla, Fenster 2 | `binary_sensor.carla_fensterstatus2_contact` | `input_boolean.fenster2_carla_gelberalarm` | `alert.fenster2_carla_gelb` |
| Alwin, Fenster 1 | `binary_sensor.alwin_fensterstatus1_contact` | `input_boolean.fenster1_alwin_gelberalarm` | `alert.fenster1_alwin_gelb` |
| Alwin, Fenster 2 | `binary_sensor.alwin_fensterstatus2_contact` | `input_boolean.fenster2_alwin_gelberalarm` | `alert.fenster2_alwin_gelb` |
| Arbeitszimmer | `binary_sensor.aqara_az_fenster` | `input_boolean.fenster_arbeitszimmer_gelberalarm` | `alert.fenster_arbeitszimmer_gelb` |
| Küche | `binary_sensor.ku_fenster` | `input_boolean.fenster_kueche_gelberalarm` | `alert.fenster_kueche_gelb` |
| Wohnzimmer, Terrassentür | `binary_sensor.wz_terasse` | `input_boolean.wz_tuer_gelberalarm` | `alert.wz_tuer_gelb` |
| Haustür | `binary_sensor.haustuer_reedkontakt` | `input_boolean.haustuer_gelberalarm` | `alert.haustuer_gelb` |

**Auslösung:** Kontakt `on` (offen), Außentemperatur unter **5 °C**, Kontakt seit mindestens **450 Sekunden** offen. Die Regel prüft jede Minute, beim HA-Start, bei Änderungen der Kontakte und bei Änderungen der Außen-/Wettertemperatur.

**Achtung: tatsächlicher Wert weicht von der Beschreibung ab.** Die Automationsbeschreibung nennt 15 Minuten. Im ausführbaren Template steht aktuell aber `>= 450`, also **7 Minuten 30 Sekunden**. Die Meldung erscheint bei der nächsten Prüfung nach Ablauf dieser Zeit. Für 15 Minuten muss dort `>= 900` stehen. Diese Dokumentation ändert den Wert nicht.

Die Außentemperatur kommt aus `sensor.wohnzimmer_outdoor_temperatur`; ist dieser nicht numerisch, wird das Attribut `temperature` von `weather.home` verwendet. Ohne gültigen Außenwert wird kein neuer Kältealarm gesetzt.

**Ende:** Kontakt geschlossen oder gültige Außentemperatur mindestens 5 °C. Ein bereits gesetzter Helfer wird bei fehlender Außentemperatur nicht allein deshalb zurückgesetzt.

**Ändern:** In der Automation unter `actions` die Variablen bzw. den Ablauf suchen:

- `aussentemperatur`: Sensor und Wetter-Fallback.
- `aussentemperatur < 5`: Auslösegrenze; dazu passend die Rücksetzbedingung `aussentemperatur >= 5` ändern.
- `>= 450`: Mindest-Offenzeit in Sekunden.
- `repeat → for_each`: Liste der Kontakt-/Helfer-Paare.

**Nur einen Kontakt nicht mehr überwachen:** Sein Paar aus `for_each` entfernen und speichern. Den zugehörigen Alarm-Helfer anschließend ausschalten, falls er noch an ist. Nur den Helfer auszuschalten reicht nicht: Solange die Bedingung besteht, würde die aktive Automation ihn erneut einschalten.

**Alle acht Kältewarnungen deaktivieren:** Die gemeinsame Automation ausschalten und die gegebenenfalls noch eingeschalteten acht Alarm-Helfer ausschalten. Die anderen gelben Warnungen laufen unabhängig weiter.

## 2. Nachtwarnungen — drei Warnungen

Ort: `/config/configuration.yaml`, Blöcke `template:` und `alert:`. Die Bedingungen heißen jeweils wie die Alert-ID, mit dem Suffix `_bedingung` und der Domain `binary_sensor`.

| Alert-ID | Überwachter Kontakt | Auslösung | Ende |
| --- | --- | --- | --- |
| `alert.haustuer_nacht_gelb` | `binary_sensor.haustuer_riegelkontakt` | 22:00–06:00 Uhr und Kontakt `on` = nicht abgeschlossen | Kontakt `off` oder 06:00 Uhr |
| `alert.garagentuer_nacht_gelb` | `binary_sensor.esphome_web_f15708_garagen_tuerschloss` | 22:00–06:00 Uhr und Kontakt `on` = nicht abgeschlossen | Kontakt `off` oder 06:00 Uhr |
| `alert.garagentor_nacht_gelb` | `binary_sensor.esphome_web_f15708_garagen_tor` | 22:00–06:00 Uhr und Tor `on` = offen | Kontakt `off` oder 06:00 Uhr |

Diese **gelben** Nachtwarnungen haben aktuell **keine zusätzliche Wartezeit**. Die separat vorhandenen **roten** Nachtalarme mit Verzögerung gehören nicht zu dieser Tabelle.

**Nachtzeit ändern:** In der jeweiligen Bedingung steht:

```jinja
now().hour >= 22 or now().hour < 6
```

`22` ist der Beginn, `6` das Ende. Durch `now()` werden die Zeitbedingungen auch ohne Kontaktänderung im Minutentakt neu ausgewertet. Kontakt-IDs und die Bedeutung von `on` müssen zur eigenen Sensorik passen.

## 3. Weitere bestehende Warnungen — zwei Warnungen

| Alert-ID | Auslösung | Ende / Rücksetzung | Konfigurationsstelle |
| --- | --- | --- | --- |
| `alert.terrasse_nacht_gelb` | `binary_sensor.wz_terasse` von 00:00–06:00 Uhr offen und mindestens **600 s** seit Öffnung bzw. Mitternacht | Tür zu oder 06:00 Uhr | `template:` → `terrasse_nacht_gelb_bedingung`; `zeit.hour < 6`, `today_at('00:00')`, `>= 600` |
| `alert.wama_nicht_abgestellt_gelb` | Programmende wurde gespeichert; Erinnerung ist ausstehend; seitdem mindestens **3600 s** vergangen; `sensor.tasmota_wama_plug_energy_power` weiterhin **über 2 W** | Leistung höchstens 2 W oder neuer Waschgang setzt die Erinnerung zurück | `template:` → `wama_nicht_abgestellt_gelb_bedingung`, WAMA-Ende-Hook und Rücksetz-Automation |

Bei der Terrassentür können sowohl die Kältewarnung als auch die Nachtwarnung auslösen. Das sind zwei getrennte Ursachen mit eigener Quittierung.

Die Waschmaschinen-Warnung verwendet `input_datetime.wama_programmende` und `input_boolean.wama_abstellen_ausstehend`. Die Automation **WAMA fertig** setzt diese über die benutzerdefinierte End-Aktion ihres Blueprints. Nicht die gesamte WAMA-fertig-Automation abschalten, wenn nur der gelbe Folgealarm deaktiviert werden soll: Dafür den betreffenden `alert:`-Eintrag deaktivieren.

Beim Ändern der **2-W-Schwelle** auch die Rücksetzregel anpassen. Eine genaue Beschreibung des Blueprint-Hooks steht in [Alarme → WAMA fertig](alarme.md#wama-fertig--blueprint-aktionen), die YAML-Referenz in [gelbe-zusatzalarme.yaml](../examples/gelbe-zusatzalarme.yaml).

## 4. Raumtemperatur unter 16 °C — neun Warnungen

**Auslösung:** gültiger Messwert **unter 16 °C**, ohne zusätzliche Wartezeit. **Ende:** mindestens 16 °C. Eine zugeordnete, aber nicht erreichbare Quelle liefert keinen neuen Temperaturalarm.

| Raum | Sensor | Alert-ID |
| --- | --- | --- |
| Wohnzimmer | `sensor.wz_temp` | `alert.wohnzimmer_temperatur_gelb` |
| Carla | `sensor.heizungsmanager_carla_raumtemperatur` | `alert.carla_temperatur_gelb` |
| Alwin | `sensor.heizungsmanager_alwin_raumtemperatur` | `alert.alwin_temperatur_gelb` |
| Arbeitszimmer | `sensor.nspanelaz_temperature` | `alert.arbeitszimmer_temperatur_gelb` |
| Schlafzimmer | `sensor.sz_temp` | `alert.schlafzimmer_temperatur_gelb` |
| Bad | `sensor.bd_temp` | `alert.bad_temperatur_gelb` |
| Küche | `sensor.ku_temp` | `alert.kueche_temperatur_gelb` |
| Flur | `sensor.fl_temp` | `alert.flur_temperatur_gelb` |
| Dachspitze | `sensor.shellyht_2e8ffd_temperature` | `alert.dachspitze_temperatur_gelb` |

**Ändern:** `/config/configuration.yaml` → `template:` → `<raum>_temperatur_gelb_bedingung`. Im `state`-Template die Zahl in `< 16` ändern. Die Beschriftung unter `alert:` → `name:` ebenfalls anpassen, damit die angezeigte Warnung den richtigen Grenzwert nennt.

Die Dachspitze verwendet den Shelly-Raumsensor, **nicht** die Temperatur des Inverters/Warp-Kerns. Garage, Außen- und Geräte-Innentemperaturen werden nicht als Wohnraumtemperatur überwacht. Weitere Räume werden nicht automatisch ergänzt.

## 5. Luftfeuchtigkeit über 70 % seit 30 Minuten — fünf Warnungen

**Auslösung:** gültiger Messwert durchgehend **über 70 %** für **30 Minuten**. **Ende:** höchstens 70 %. Ungültige Werte unterbrechen bei diesen neuen Bedingungen die Wartezeit. Nach einem HA-Neustart bzw. dem Neuladen der Template-Entitäten beginnt die Wartezeit erneut.

| Raum | Sensor | Alert-ID |
| --- | --- | --- |
| Wohnzimmer | `sensor.wohnzimmer_luftfeuchtigkeit` | `alert.wohnzimmer_luftfeuchtigkeit_gelb` |
| Carla | `sensor.aqara_temp_carla_humidity` | `alert.carla_luftfeuchtigkeit_gelb` |
| Alwin | `sensor.wohnzimmer_alfizimmer_luftfeuchtigkeit` | `alert.alwin_luftfeuchtigkeit_gelb` |
| Bad | `sensor.bd_luftfeuchte` | `alert.bad_luftfeuchtigkeit_gelb` |
| Dachspitze | `sensor.shellyht_2e8ffd_humidity` | `alert.dachspitze_luftfeuchtigkeit_gelb` |

Für Küche, Flur, Schlafzimmer und Arbeitszimmer ist in diesen Alarmregeln derzeit **kein Feuchtesensor hinterlegt**. Für Alwin und Dachspitze waren die zugeordneten Feuchtesensoren beim Einrichten nicht erreichbar; deren Warnungen können erst mit gültigen Messwerten auslösen.

**Ändern:** `/config/configuration.yaml` → `template:` → `<raum>_luftfeuchtigkeit_gelb_bedingung`:

```yaml
state: "{{ is_number(states('sensor.bd_luftfeuchte')) and states('sensor.bd_luftfeuchte') | float(0) > 70 }}"
delay_on:
  minutes: 30
```

`> 70` ist die Feuchtegrenze, `delay_on.minutes` die ununterbrochene Wartezeit. Die Beschriftung des zugehörigen Alerts bei Änderungen mit anpassen. YAML-Referenz für Temperatur und Feuchte: [raumklima-alarme.yaml](../examples/raumklima-alarme.yaml).

## 6. Hoher nächtlicher Grundverbrauch — eine Warnung

| Alert-ID | Auslösung | Ende |
| --- | --- | --- |
| `alert.grundverbrauch_nacht_gelb` | **22:00–06:00 Uhr**, Hausverbrauch **ohne Wallbox über 500 W**, ununterbrochen für **30 Minuten** | Bereinigter Verbrauch höchstens 500 W, Beginn des Tages um 06:00 Uhr oder ungültige Messdaten |

Die Berechnung verwendet denselben gesamten Hausverbrauch wie die Energieansicht, nicht den Netzbezug:

```text
sensor.hausverbrauch_ohne_wallbox
  = max(0, sensor.pv_own_usage_total_power − sensor.30a_breaker_energy_power)
```

- Hausverbrauch: `sensor.pv_own_usage_total_power`.
- Separat gemessene Wallboxleistung: `sensor.30a_breaker_energy_power`.
- Beide Quellen werden von W bzw. kW auf Watt vereinheitlicht. Nichtnumerische Werte, unbekannte Einheiten und negative Quellwerte machen die Berechnung nicht verfügbar. Eine fehlende Wallboxmessung wird **nicht als 0 W angenommen**.
- 1.200 W Hausverbrauch minus 900 W Wallbox = 300 W: **keine Warnung**. 1.200 W minus 600 W = 600 W: Warnung nach 30 Minuten, sofern der Zustand nachts durchgehend besteht.
- Die Wartezeit beginnt frühestens um **22:00 Uhr**; früheste Auslösung ist **22:30 Uhr**. Nach einem HA-Neustart/Template-Neuladen beginnt die Wartezeit erneut.

**Ändern:** `/config/configuration.yaml` → `template:`:

- Sensor **Hausverbrauch ohne Wallbox**: Quell-IDs unter `availability` und `state` gemeinsam anpassen.
- `grundverbrauch_nacht_gelb_bedingung`: `> 500` bestimmt den Grenzwert, `delay_on.minutes: 30` die Wartezeit und `now().hour >= 22 or now().hour < 6` die Nachtzeit.
- Den Namen unter `alert.grundverbrauch_nacht_gelb` bei geänderten Grenzwerten ebenfalls anpassen.

**Stand der Einrichtung (19.11.2026):** Die HA-Konfiguration ist gültig und die Dashboard-Liste ergänzt. Der Speicherversuch für die separate mobile Alarmliste scheiterte mit `unknown_error` an der bestehenden HAUS-OPS-Benachrichtigungsschnittstelle. Push-Zustellung für diesen neuen Alert ist daher noch nicht eingerichtet. Nach Behebung der Schnittstelle die ID über die Einstellungen mit in die mobile Liste übernehmen und die Zustellung prüfen.

**Deaktivieren:** Beim Alert `state: "on"` durch `state: "deaktiviert"` ersetzen und nach Konfigurationsprüfung HA neu starten, wie unten beschrieben. Nur ausblenden: ID unter **Gelbe Warnungen** entfernen. Die YAML-Referenz steht in [grundverbrauch-nacht-gelb.yaml](../examples/grundverbrauch-nacht-gelb.yaml).

## 7. Kritische Innen-Luftqualität — zusätzliche Dashboard-Warnung

HAUS-OPS kann **„Luftqualität kritisch · …“** melden, sobald eine CO₂-, PM2.5-, PM10- oder VOC-Index-Teilbewertung des Innenindex **über 200** liegt. Hierfür gibt es **keinen `alert.*`-Eintrag** in HA und keine 30-Minuten-Wartezeit.

- Sensorzuordnung: **HAUS-OPS-Einstellungen → Klima · <Raum> → Luftqualität**.
- Bewertungsgrenzen und optionaler Referenzraum: `haus_ops.air_quality` in `/config/configuration.yaml`; Standardwerte in `custom_components/haus_ops/frontend/air-quality-config.json`.
- Quittierung und Stummschaltung gelten lokal für diese Meldung im geöffneten Dashboard.
- Die Warnung endet, wenn keine Teilbewertung mehr über 200 liegt oder keine kritischen Messwerte mehr verfügbar sind.
- Die Warnung wird **nicht** über die `alert.*`-Liste an Mobile-App-Geräte versendet.

**Deaktivierung:** Derzeit gibt es für diese eingebaute Warnung **keinen eigenen Ein-/Aus-Schalter**. Sie lässt sich auch nicht durch Entfernen einer Zeile unter **Gelbe Warnungen** abschalten. Eine getrennte Abschaltoption müsste im Dashboard ergänzt werden. Das Ändern von Messwerten oder Bewertungsgrenzen ist kein Ersatz für eine solche Abschaltoption.

Siehe [Luftqualität](LUFTQUALITAET.md#gelber-alarm).

## Dauerhaft deaktivieren, ausblenden oder quittieren

### A. Nur aus HAUS-OPS entfernen

1. Sternzeit unten links antippen und **Gelbe Warnungen** öffnen.
2. Genau die betreffende `alert.*`-Zeile entfernen.
3. **OK** drücken.

Die HA-Regel und ihre Entität bleiben bestehen und können weiter `on` oder `off` sein. Beim erfolgreichen Speichern mit verfügbarer Mobile-Konfiguration übernimmt HAUS-OPS dieselbe Liste auch für seine mobilen gelben Meldungen. Andere HA-Automationen, die auf den Alert oder Alarm-Helfer reagieren, werden dadurch nicht abgeschaltet.

Wenn die Liste vollständig leer ist, kann die ältere Anzeige über den konfigurierten Alarmstufen-Sensor wieder greifen. Für eine vollständige Abschaltung die Ursache bzw. den Alert deaktivieren; eine leere Dashboard-Liste ist kein globaler Alarm-Aus-Schalter. Die eingebaute Luftqualitätswarnung ist hiervon unabhängig.

### B. Einen HA-Alert vollständig deaktivieren — reversibel

Im vorhandenen `alert:`-Block von `/config/configuration.yaml` beim gewünschten Alert nur die überwachte Zielbedingung ändern:

```yaml
alert:
  bad_luftfeuchtigkeit_gelb:
    name: Bad · Luftfeuchtigkeit seit 30 Minuten über 70 %
    entity_id: binary_sensor.bad_luftfeuchtigkeit_gelb_bedingung
    state: "deaktiviert"  # vorher: "on"
    repeat: 30
    can_acknowledge: true
    notifiers: []
```

Die hier verwendeten Quellen sind Schalter-Helfer bzw. binäre Sensoren. Sie melden `on`/`off`, aber niemals `deaktiviert`. Deshalb kann diese Alert-Definition nicht mehr auslösen. Der Messsensor und die anderen Alarme bleiben erhalten. **Zum Reaktivieren wieder `state: "on"` setzen.** Keine zweite `alert:`-Sektion anlegen; immer den bestehenden Eintrag bearbeiten.

Nach Konfigurationsprüfung und **HA-Neustart** gilt die Änderung. Den Alert kann man in der Dashboard-Liste stehen lassen; er erscheint ohne erfüllte Bedingung nicht als aktive Warnung. Bei anderen Benachrichtigungen, die direkt den Rohsensor oder Helfer überwachen, deren eigene Automationen zusätzlich prüfen.

Alternativ kann man die betreffende Alert-Definition entfernen. Dann auch ihre IDs aus Dashboard-/Benachrichtigungslisten entfernen; die reversible `state`-Änderung vermeidet verwaiste Verweise.

### C. Nur diese Alarmepisode quittieren

**QUITTIEREN** im Dashboard 1,2 Sekunden halten. Für HA-Alerts ruft HAUS-OPS `alert.turn_off` auf:

| Zustand | Bedeutung |
| --- | --- |
| `on` | Ursache besteht, neu / nicht quittiert |
| `off` | Ursache besteht, aber quittiert |
| `idle` | Ursache besteht nicht |

`alert.turn_off` ist **kein dauerhaftes Deaktivieren**. Die Warnung bleibt als quittiert sichtbar. Nachdem die Ursache behoben war, kann sie bei einer neuen Überschreitung erneut auslösen. Quittieren beendet die zugehörigen Wiederholungstöne und die mobilen HAUS-OPS-Wiederholungen für diese quittierte HA-Warnung.

**STUMM 30 MIN** ist dagegen eine lokale Dashboard-Pause. Der HA-Alert bleibt `on`; der mobile Versand wird dadurch nicht automatisch pausiert.

## Änderungen laden und testen

1. Vor Änderungen eine Sicherung der betreffenden YAML-Datei erstellen.
2. **Entwicklerwerkzeuge → YAML → Konfiguration prüfen**.
3. Änderungen an der gemeinsamen Kontakt-Automation über die Automationsoberfläche speichern; dafür ist kein HA-Neustart nötig. Änderungen an ihren Einträgen in `automations.yaml` können über das Neuladen der Automationen übernommen werden.
4. Änderungen nur an vorhandenen Template-Bedingungen können über **Template-Entitäten neu laden** übernommen werden. Dabei beginnen laufende Feuchte-Verzögerungen neu.
5. Neue oder geänderte `alert:`-Definitionen benötigen einen HA-Neustart. Ein HACS-Update oder Browser-Neuladen ersetzt diesen nicht. Neustarts gezielt sammeln.
6. Unter **Entwicklerwerkzeuge → Zustände** zuerst den Rohsensor/Helfer, dann `binary_sensor.…_bedingung` und zuletzt `alert.…` prüfen.
7. Danach unter **Gelbe Warnungen** die tatsächlich vorhandenen Alert-IDs hinterlegen und **OK** speichern. Bei noch nicht geladenen neuen Alerts kann die Prüfung „vorhandene passende Entitäts-ID“ melden.
8. Nach Änderungen der mobilen Empfänger-/Alarmliste den erfolgreichen Speichervorgang prüfen. YAML-Startwerte und bereits in HAUS-OPS gespeicherte Einstellungen sind getrennt; gespeicherte Einstellungen haben Vorrang. Die interne `.storage` nicht bei laufendem HA von Hand bearbeiten.

**Die Zeitangaben nicht verwechseln:** `delay_on.minutes: 30` bzw. Sekundenvergleiche im Template bestimmen die Auslösung. `repeat: 30` unter `alert:` bezeichnet HA-Benachrichtigungswiederholungen in Minuten. Bei `notifiers: []` sendet der Alert selbst keine Nachrichten. HAUS-OPS spielt seinen gelben Wiederholungston bei neuen, nicht stummen Warnungen alle **60 Sekunden**; mobile Wiederholungen werden separat unter **Mobile Alarmmeldungen** eingestellt.

Referenzen: [Home Assistant Alert](https://www.home-assistant.io/integrations/alert/), [Template-Integration](https://www.home-assistant.io/integrations/template/), [allgemeine gelbe und rote Alarmkonfiguration](alarme.md).
