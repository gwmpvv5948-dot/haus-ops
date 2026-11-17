# Gelbe und rote Alarme in HAUS-OPS

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
