# Gelbe und rote Alarme in HAUS-OPS

**Vollständiger Bestand der gelben Warnungen, Grenzwerte und Anleitungen zum Deaktivieren:** [Gelbe Alarme](gelbe-alarme.md).

Die Alarmregeln laufen in Home Assistant. HAUS-OPS zeigt die Meldungen an und spielt die Alarmtöne ab. Die folgenden Namen sind Beispiele. Ersetze die Kontakt-IDs durch die eigenen Entitäten und prüfe unter **Entwicklerwerkzeuge → Zustände**, dass der jeweilige Kontakt bei offenem Fenster oder offener Tür `on` meldet.

## Gelb · einzelne Warnungen

Lege unter **Einstellungen → Geräte & Dienste → Helfer** für jede separat quittierbare Ursache einen Helfer vom Typ **Schalter** an, beispielsweise `input_boolean.fenster_gelberalarm`. Eine Automation schaltet ihn ein, wenn die Ursache vorliegt, und beim Ende der Ursache wieder aus.

Für eine Kältewarnung prüft die Automation beispielsweise, ob der Kontakt seit mindestens 15 Minuten offen ist und die Außentemperatur unter 5 °C liegt. Sie sollte beim Schließen, bei einer Temperaturänderung und nach Ablauf der Offenzeit erneut prüfen. Eine zusätzliche Prüfung im Minutentakt kann den Ablauf nach einem Neustart wieder erfassen.

Ergänze pro Helfer einen Alert in der `configuration.yaml`:

```yaml
alert:
  fenster_gelb:
    name: "Fenster bei Kälte zu lange offen"
    entity_id: input_boolean.fenster_gelberalarm
    state: "on"
    repeat: 30
    can_acknowledge: true
    notifiers: []
```

Trage danach als Administrator unter **82873.4 → Gelbe Warnungen** jede Alert-ID in eine eigene Zeile ein, etwa `alert.fenster_gelb`, und speichere mit **OK**.

- `on` erscheint als **Neu**. Der Rahmen pulsiert gelb. Bei aktiven Dashboard-Tönen wird der gelbe Ton alle 60 Sekunden wiederholt.
- Halte **Quittieren** 1,2 Sekunden. HAUS-OPS ruft `alert.turn_off` auf. Der Alert bleibt mit Zustand `off` als **Quittiert** sichtbar, bis die Ursache entfällt.
- **Stumm 30 min** pausiert die ausgewählte Warnung lokal in diesem Dashboard. Wenn andere neue Warnungen aktiv sind, bleibt der gelbe Rahmen aktiv.
- Sobald der überwachte Helfer ausgeschaltet ist, wechselt der Alert auf `idle` und verschwindet aus der Liste.

Sobald die Liste **Gelbe Warnungen** befüllt ist, richtet sich die gelbe Anzeige nach dieser Liste. Rot hat Vorrang. `repeat: 30` betrifft nur Benachrichtigungen der HA-Alert-Integration in Minuten. Mit `notifiers: []` ist kein Benachrichtigungsdienst konfiguriert. [Home Assistant Alert](https://www.home-assistant.io/integrations/alert/)

## Rot · gemeinsame Alarmstufe mit Ursachen

Lege je Ursache eine Bedingung und bei Bedarf einen eigenen `alert.*` an. Der gemeinsame Sensor `sensor.alarmstufe` wertet die roten Ursachen aus. Sein Zustand ist `rot` oder `normal`. Für ältere Konfigurationen ohne gelbe Warnungsliste kann er zusätzlich `gelb` liefern. Im Attribut `ursachen` steht eine Liste lesbarer Meldungen.

Das folgende Beispiel zählt die Offenzeit erst ab **22:00 Uhr** und beendet die Nachtregel um **06:00 Uhr**. Ein bereits vor 22 Uhr geöffnetes Tor kann damit frühestens um **22:10 Uhr** auslösen. Die Vorlagen mit `now()` werden im Minutentakt aktualisiert.

```yaml
template:
  - binary_sensor:
      - name: "Garagentor Nachtalarm Bedingung"
        default_entity_id: binary_sensor.garagentor_nacht_rot_bedingung
        unique_id: garagentor_nacht_rot_bedingung
        state: >-
          {% set zeit = now() %}
          {% set beginn = today_at('22:00') - timedelta(days=1 if zeit.hour < 6 else 0) %}
          {% set kontakt = 'binary_sensor.garagentor_kontakt' %}
          {{ (zeit.hour >= 22 or zeit.hour < 6)
             and is_state(kontakt, 'on')
             and as_timestamp(zeit) -
                 [as_timestamp(beginn), as_timestamp(states[kontakt].last_changed)] | max >= 600 }}

  - sensor:
      - name: "Alarmstufe"
        default_entity_id: sensor.alarmstufe
        unique_id: haus_ops_alarmstufe
        state: >-
          {{ 'rot' if states('alert.garagentor_nacht_rot') in ['on', 'off']
             or states('alert.haustuer_nacht_rot') in ['on', 'off'] else 'normal' }}
        attributes:
          ursachen: >-
            {% set meldungen = [] %}
            {% if states('alert.garagentor_nacht_rot') in ['on', 'off'] %}
              {% set meldungen = meldungen + ['Garagentor nachts zu lange offen'] %}
            {% endif %}
            {% if states('alert.haustuer_nacht_rot') in ['on', 'off'] %}
              {% set meldungen = meldungen + ['Haustür nachts zu lange offen'] %}
            {% endif %}
            {{ meldungen }}

alert:
  garagentor_nacht_rot:
    name: "Garagentor nachts zu lange offen"
    entity_id: binary_sensor.garagentor_nacht_rot_bedingung
    state: "on"
    repeat: 30
    can_acknowledge: true
    notifiers: []
```

Für die Haustür ergänze eine zweite Bedingung und einen Alert nach demselben Muster. Verwende dabei `binary_sensor.haustuer_nacht_rot_bedingung`, `alert.haustuer_nacht_rot` und den tatsächlichen **Türkontakt**. Wenn `sensor.alarmstufe` bereits existiert, erweitere dessen Zustand und Ursachen um beide Alerts. Die Zustände `on` und `off` gelten beide als aktive Ursache. Erst `idle` bedeutet, dass die Ursache behoben ist.

In HAUS-OPS hinterlegst du unter **82873.4 → Alarmstufe** den gemeinsamen Sensor. Unter **Alarm quittiert** hinterlegst du optional einen Schalter-Helfer wie `input_boolean.alarm_quittiert`. HAUS-OPS schaltet ihn beim Quittieren ein. Eine Home-Assistant-Automation sollte ihn wieder ausschalten, sobald der Sensor den Zustand `rot` verlässt. Damit beginnt der nächste rote Alarm unquittiert. Ohne Helfer gilt die Quittierung lokal im geöffneten Dashboard.

Bei Rot wechselt HAUS-OPS zu **Sicherheit** und zeigt das rote Overlay. Bei aktiven Dashboard-Tönen wiederholt sich der Ton alle **30 Sekunden**. Quittieren blendet das Overlay aus und beendet die Erinnerungstöne. Der rote Status bleibt bis zum Ende der Ursache sichtbar.

## Anwenden und testen

1. Füge Einträge in die vorhandenen `alert:`- und `template:`-Blöcke ein. Prüfe anschließend die YAML-Konfiguration in Home Assistant.
2. Starte Home Assistant neu, um neu angelegte `alert.*` zu laden. Prüfe ihre tatsächlichen IDs unter **Entwicklerwerkzeuge → Zustände** und speichere die HAUS-OPS-Zuordnungen.
3. Teste Gelb mit einem geeigneten Helfer und prüfe **Neu → Quittiert → verschwunden**. Prüfe bei Rot den Zustand und das Attribut `ursachen` von `sensor.alarmstufe`, das Overlay und die Quittierung.
4. Wenn die Nachtregel eine kürzere Testverzögerung braucht, setze im Beispiel `600` Sekunden auf `60`. Falls du pro Kontakt einen Minuten-Helfer eingerichtet hast, ändere den Wert dort. Die Regel gilt weiterhin nur im Nachtzeitraum. Stelle nach dem Test die reguläre Verzögerung wieder her.

## Zusätzliche gelbe Warnungen

Die Referenz `examples/gelbe-zusatzalarme.yaml` enthält drei weitere Warnungen. Diese HA-Regeln werden durch ein HACS-Update von HAUS-OPS nicht automatisch installiert. Bereits in HA angelegte Regeln nicht doppelt als Paket hinzufügen.

| Alert | Bedingung | Ende der Warnung |
| --- | --- | --- |
| `alert.schlafzimmer_temperatur_gelb` | `sensor.sz_temp` unter 16 °C | Temperatur mindestens 16 °C |
| `alert.terrasse_nacht_gelb` | `binary_sensor.wz_terasse` offen, 00–06 Uhr, mindestens 10 Minuten seit Öffnung bzw. Mitternacht | Kontakt geschlossen oder 06 Uhr |
| `alert.wama_nicht_abgestellt_gelb` | 60 Minuten nach tatsächlichem Programmende, Leistung weiterhin über 2 W | höchstens 2 W oder neuer Waschgang |

Die Zeitprüfung erfolgt im Minutentakt. Nichtnumerische Temperatur- und Leistungswerte lösen keine neue Warnung aus. Die Alerts erlauben das Quittieren nach dem oben beschriebenen Ablauf. Nach dem Laden der HA-Regeln die drei Alert-IDs unter **Gelbe Warnungen** ergänzen und mit **OK** speichern.

### WAMA fertig · Blueprint-Aktionen

Für den Blueprint `Blackshome/appliance-notifications.yaml` unter dem vorhandenen `use_blueprint.input` der Automation **WAMA fertig** ergänzen. Bereits vorhandene benutzerdefinierte Aktionen zusammenführen, nicht ersetzen. Entscheidend ist die End-Aktion des Blueprints; `last_triggered` der Automation bezeichnet den Start des Waschgangs und eignet sich nicht als Fertig-Zeit.

```yaml
include_custom_actions:
  - enable_start_custom_actions
  - enable_end_custom_actions
start_custom_actions:
  - action: input_boolean.turn_off
    target:
      entity_id: input_boolean.wama_abstellen_ausstehend
end_custom_actions:
  - action: input_datetime.set_datetime
    target:
      entity_id: input_datetime.wama_programmende
    data:
      timestamp: "{{ as_timestamp(now()) }}"
  - choose:
      - conditions: "{{ states('sensor.tasmota_wama_plug_energy_power') | float(0) > 0 }}"
        sequence:
          - action: input_boolean.turn_on
            target:
              entity_id: input_boolean.wama_abstellen_ausstehend
    default:
      - action: input_boolean.turn_off
        target:
          entity_id: input_boolean.wama_abstellen_ausstehend
```

Fertig-Zeit und ausstehende Erinnerung werden in HA-Helfern gespeichert und überstehen Neustarts. Die zusätzliche Rücksetz-Automation im Beispiel beendet die Erinnerung bei höchstens 2 W. Nach der erstmaligen Einrichtung beginnt die Überwachung mit dem nächsten vom Blueprint erkannten Programmende.

## Mobile Alarmmeldungen

Unter **82873.4 → Mobile Alarmmeldungen** werden die in HA verfügbaren `notify.mobile_app_*`-Aktionen als Empfänger angeboten. Für Gelb und Rot können jeweils mehrere Geräte ausgewählt werden. Ohne Auswahl wird nichts versendet. Die Zustellung übernimmt die HAUS-OPS-Integration im Home-Assistant-Backend; der Browser muss dafür nicht geöffnet sein.

- **Nur einmal beim Auslösen** ist die Voreinstellung. Optional alle 30 Sekunden, jede Minute, alle 5 Minuten oder alle 30 Minuten erinnern.
- Gelb verwendet die konfigurierten **Gelben Warnungen** (`alert.*`). Nur Zustand `on` sendet; `off` (quittiert) und `idle` senden nicht.
- Für Rot kann eine eigene Liste `alert.*` hinterlegt werden. Eine leere Liste verwendet den unter **Alarmstufe** konfigurierten Sensor, standardmäßig `sensor.alarmstufe`.
- Der HA-Helfer unter **Alarm quittiert** beendet rote Push-Wiederholungen, ohne die Alarmursache zu löschen. Für browserunabhängiges Quittieren muss dieser Helfer vorhanden und korrekt zugeordnet sein. Wie bisher beim Ende des roten Alarms zurücksetzen.
- Kritische Meldungen sind nur für Rot optional. Auf iOS ist dafür die Companion-App-Berechtigung für kritische Hinweise erforderlich; normale Meldungen bleiben standardmäßig aktiv. Bei Android werden bei aktivierter Option hohe Priorität und sofortige Zustellung angefordert; eine Umgehung von „Nicht stören“ wird nicht pauschal eingerichtet.
- Die Wiederholungen werden im 30-Sekunden-Takt geprüft. Erfolgreiche Zustellungen und die Konfiguration bleiben über Neustarts erhalten. Ein aktiver Alarm wird nicht erneut als neu versendet, solange seine Kennung und sein Beginn unverändert bleiben. Wenn HA beim Neustart einen neuen Beginn meldet, kann eine erneute Erstnachricht entstehen.

Die Beispielkonfiguration `examples/mobile-alarmmeldungen.yaml` verwendet `notify.mobile_app_iphone` einmalig für Gelb und Rot. Vorhandene weitere Alert-IDs ergänzen. Die YAML-Konfiguration dient als Startwert; anschließend im Dashboard gespeicherte Mobile-Einstellungen haben Vorrang. Der Versand beginnt nach dem Laden der aktualisierten Integration. Beim erstmaligen Aktivieren können bereits laufende, nicht quittierte Alarme eine Nachricht erzeugen.

Die Einstellungen speichern sich im HA-Verzeichnis `.storage/haus_ops.mobile_notifications`. Sie enthalten Empfänger-Aktionsnamen und Versandzeitpunkte, keine Passwörter oder Push-Tokens. Companion App und HA übernehmen den eigentlichen Push-Versand. Ein erfolgreicher HA-Aktionsaufruf bestätigt noch nicht, dass das Telefon die Nachricht tatsächlich angezeigt hat.

Referenz: [kritische Companion-App-Benachrichtigungen](https://companion.home-assistant.io/docs/notifications/critical-notifications/).

## Raumklima · gelbe Warnungen

`examples/raumklima-alarme.yaml` ergänzt die vorhandene Schlafzimmer-Warnung um die übrigen Raumtemperaturen und um Warnungen für vorhandene Raum-Feuchtesensoren. Die Sensorzuordnungen vor einer Übernahme prüfen. Die Datei nicht zusätzlich laden, wenn ihre Einträge bereits in der `configuration.yaml` stehen.

- **Temperatur unter 16 °C:** sofortige Warnung je Raum; bei mindestens 16 °C beendet. Die bestehende `alert.schlafzimmer_temperatur_gelb` bleibt erhalten.
- **Luftfeuchtigkeit über 70 %:** erst nach 30 Minuten ununterbrochener Überschreitung; bei höchstens 70 % beendet. Jeder Raum besitzt einen eigenen quittierbaren Alert.
- Ungültige bzw. nicht verfügbare Messwerte erfüllen die Bedingung nicht. Bei Feuchte beginnt die Wartezeit nach einer solchen Unterbrechung erneut. Das Wiederherstellen der 30-Minuten-Wartezeit nach einem HA-Neustart ist nicht vorgesehen; sie beginnt erneut.
- Quittieren beendet die Warnung nicht: Sie bleibt bis zum Ende der Ursache als quittiert sichtbar. Bei einer erneuten Überschreitung nach zwischenzeitlicher Normalisierung entsteht eine neue Warnung.
- Raumtemperaturen: Wohnzimmer, Carla, Alwin, Arbeitszimmer, Schlafzimmer, Bad, Küche, Flur und Dachspitze. Für Feuchte sind Wohnzimmer, Carla, Alwin, Bad und Dachspitze zugeordnet. Fehlende Feuchtesensoren anderer Räume müssen zunächst ergänzt werden. Außensensoren, Geräte-Innentemperaturen und die unbeheizte Garage werden nicht als Wohnraumklima überwacht.

Neue `alert.*`-Definitionen benötigen einen HA-Neustart. Die Alert-IDs außerdem unter **Gelbe Warnungen** sowie gegebenenfalls in der bestehenden mobilen Benachrichtigungskonfiguration ergänzen. Die `delay_on`-Verzögerung gehört zur Bedingung; `repeat: 30` ist keine Auslöseverzögerung.


## Hoher nächtlicher Grundverbrauch

`alert.grundverbrauch_nacht_gelb` warnt von **22:00 bis 06:00 Uhr**, wenn der Hausverbrauch abzüglich der separat gemessenen Wallboxleistung für **30 Minuten durchgehend über 500 W** liegt. Die Quellen sind `sensor.pv_own_usage_total_power` und `sensor.30a_breaker_energy_power`; das Ergebnis heißt `sensor.hausverbrauch_ohne_wallbox`. Bei fehlender Messung wird keine Null für die Wallbox angenommen. Früheste Auslösung ist 22:30 Uhr.

Konfiguration, Deaktivierung und Rücksetzung sind im [Bestand der gelben Alarme](gelbe-alarme.md#6-hoher-nächtlicher-grundverbrauch--eine-warnung) beschrieben; die YAML-Referenz ist [grundverbrauch-nacht-gelb.yaml](../examples/grundverbrauch-nacht-gelb.yaml). Neue Alert-Definitionen benötigen einen HA-Neustart.
