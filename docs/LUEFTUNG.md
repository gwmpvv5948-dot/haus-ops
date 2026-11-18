# Lüftung · Abluftanlage

Die Lüftungsseite zeigt den Luftweg aus Technikraum (E2), Bad (E1) und Gäste-Bad (E0) zum Lüfter im Dachspitz. Die bestehende Navigation und globale Alarmanzeige bleiben erhalten.

Unter **82873.4 → Lüftung** lassen sich Temperatur und Feuchte jeder Zone, Außentemperatur, Gesamtvolumenstrom, Drehzahl, Laufzeit heute und Filterbelastung als Entitäts-ID eintragen. Ohne explizite Raumsensoren verwendet das Dashboard verfügbare Sensoren des entsprechenden HA-Bereichs. Für Bad wird ein vorhandener `sensor.bd_temp` bevorzugt. Fehlende Werte erscheinen als „—“.

Die Feuchte-Auto- und Nacht-Low-Tasten schalten zugeordnete `input_boolean`- oder `switch`-Entitäten. Ohne Zuordnung sind sie deaktiviert. Die zugehörigen Automationen müssen in Home Assistant existieren; die Oberfläche führt keine eigene Feuchte- oder Nachtsteuerung aus.

## Stufen und Kennwerte

Die echten Stufen werden weiterhin von `number.trafocurrentvolt` gelesen. Zum Schalten dienen die vorhandenen Taster:

| Stufe | Spannung | Taster |
|---|---:|---|
| Aus | 0 V | `input_button.trafo_button` |
| Low | 80 V | `input_button.trafo_button_80` |
| 1 | 150 V | `input_button.trafo_button_150` |
| 2 | 175 V | `input_button.trafo_button_175` |
| Max | 230 V | `input_button.trafo_button_230` |

Volumenstrom und Drehzahl können von Sensoren kommen. Fehlen diese, gelten die fünf JSON-Stufenkennwerte in den Einstellungen (`flow` in m³/h, `voltage` in V, `rpm` in U/min). Diese Ersatzwerte sind in der Statusanzeige als Kennwerte gekennzeichnet. Die Tabellenwerte ändern keine Trafo-Schaltbefehle. Die Abluftanteile betragen 30 % Technikraum, 40 % Bad und 30 % Gäste-Bad.

Laufzeit heute erwartet einen numerischen Sensor in Stunden; Sekunden und Minuten werden anhand der Einheit umgerechnet. Die Filteranzeige erwartet Prozent Belastung, ab 85 % erscheint „Filter wechseln“. Ab 70 % Raumfeuchte wird die Anzeige gelb hervorgehoben.

## Stoßlüftung

Der konfigurierte HA-Timer bleibt die maßgebliche Zeitquelle. „+10 Min“ verlängert ihn auf maximal 180 Minuten; „Stop“ bricht ihn ab. Ein manueller Stufenwechsel beendet einen aktiven Timer und sendet anschließend den Stufenbefehl.

Die bestehende HA-Timer-Automation ist für MAX während der Stoßlüftung und die Rückkehr zur Grundstufe verantwortlich. Das Dashboard zeigt die tatsächlich gemeldete Trafo-Stufe an. Auch ohne geöffneten Browser muss die Automation in HA laufen.

## Animation

Beide Rotoren teilen denselben Winkel. Stufenwechsel beschleunigen oder bremsen die Bewegung weich. Maximal 30 wiederverwendete Luftteilchen folgen den drei Kanälen mit 30 Bildern pro Sekunde. Die Rotoren und das Lauflicht werden separat mit der Bildschirmfrequenz gedreht. Die Pfadpositionen werden rechnerisch ermittelt; während der Animation sind keine SVG-Geometrieabfragen nötig. Beim Verlassen der Seite wird die Animation beendet.
