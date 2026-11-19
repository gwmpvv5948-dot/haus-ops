# Fahrzeug · Model 3

Die Seite öffnet sich über **Fahrzeug** in der linken Navigation als LCARS-Röntgenansicht mit sichtbarer Seitennavigation. Im unteren Balken führt „Übersicht“ links zurück und „Aufwecken“ steht rechts. Die üblichen HAUS-OPS-Alarme bleiben darüber sichtbar. Neue Alarme schließen die Fahrzeugansicht und öffnen wie bisher Sicherheit. Nach 60 Sekunden ohne Bedienung wird die Fahrzeugansicht geschlossen.

## Konfiguration

Unter **82873.4 → Fahrzeug** stehen Freitextfelder für alle Entitäten. Bei genau einem Model 3 in Tesla Fleet erkennt HAUS-OPS die Entitäten anhand der HA-Gerätezuordnung und der stabilen Fleet-Registrierungsschlüssel. Deaktivierte Entitäten werden nicht verwendet. Bei mehreren Fahrzeugen ist die gewünschte HA-Geräte-ID einzutragen; eine zufällige Auswahl findet nicht statt.

Die Felder werden mit erkannten Zuordnungen vorausgefüllt. Erst OK speichert diese Zuordnungen in der HA-Frontend-Konfiguration. Persönliche Fahrzeug-IDs, VIN, Standort und Zugangsdaten gehören nicht in die öffentliche Repository-Konfiguration.

Einige Sensoren, insbesondere Reifendruck, Kilometerstand, Gang und Geschwindigkeit, sind in Tesla Fleet standardmäßig deaktiviert. Sie lassen sich beim jeweiligen HA-Gerät aktivieren. Fehlende Werte bleiben „—“. Sie werden nicht durch die Beispielwerte aus dem Mockup ersetzt.

## Bild, Eckdaten und Zielpunkte

Das gebündelte Bild `vehicle-model3.jpg` liegt lokal bei der Integration. Es wurde aus der bereitgestellten PNG-Datei auf 2400 Pixel Breite verkleinert und benötigt ungefähr 555 KB statt 13 MB. Das Original wird nicht verändert.

Die JSON-Konfiguration in den Einstellungen enthält Bildposition, Leitungs-Zielpunkte und acht Eckdaten-Zeilen. Grundlage ist `frontend/vehicle-config.json`. Eigene Bilder können unter `/config/www/` abgelegt und als `/local/datei.jpg` eingebunden werden. Externe Bild-URLs sind nicht vorgesehen.

Die genaue Fahrzeugvariante ist nicht bekannt. Deshalb sind Abmessungen, Leergewicht, Akkutyp, Antrieb und WLTP-Wert zunächst leer und lassen sich passend zum eigenen Fahrzeug eintragen. Die 2024+-RWD-Beispielwerte des Mockups werden nicht als Daten des bereitgestellten 2021er-Bildes ausgegeben.

## Zustände und Steuerung

- Daten werden aus dem vorhandenen HA-Zustandsbestand gelesen. Die Seite fordert keine zusätzlichen Fleet-API-Abfragen an und sendet beim Öffnen keinen Weckbefehl.
- Solange Fleet noch keinen gültigen Fahrzeugstatus oder Kernmesswert geliefert hat, bleiben die Fahrzeugbefehle außer „Aufwecken“ gesperrt. Defaultwerte einzelner Cover-Entitäten werden dabei nicht als echte Offen-Meldung ausgegeben.
- Schlaf wird anhand des Fleet-Verbindungs-Binärsensors erkannt. Letzte in dieser Sitzung verfügbare Messwerte bleiben gedimmt sichtbar. Der Zeitstempel zeigt den letzten verfügbaren HA-Messstand. Nach einem Browserneustart stehen nur die von HA bereitgestellten bzw. wiederhergestellten Werte zur Verfügung.
- Bei einem ausdrücklich ausgelösten Befehl wird ein schlafendes Fahrzeug zuerst über seinen Wake-Button geweckt. Die Oberfläche wartet bis zu 45 Sekunden auf den aktualisierten HA-Status; sie pollt dabei nur den lokalen Zustand und nicht die Tesla-API. Bei Timeout, Schließen der Seite oder geändertem Befehlsziel wird der Folgebefehl abgebrochen.
- Entriegeln sowie Öffnen von Frunk und Kofferraum erfordern 1,2 Sekunden Halten. Frühes Loslassen, größere Fingerbewegung, Fokusverlust oder Verlassen der Seite brechen ab. Das Loslassen erzeugt keinen zweiten Schaltbefehl.
- Frunk, Kofferraum und Fenster respektieren die von HA gemeldeten Cover-Funktionen. Ein Frunk ohne Schließfunktion erhält keinen Schließbefehl.
- Ladelimit +10 bleibt innerhalb der HA-Grenzen und des Bereichs 50–100 %. Sitzheizung verwendet die tatsächliche Optionsliste des Select-Helfers.
- Tür-/Fensterkontakte mit fehlenden Daten werden nicht als geschlossen angenommen. VIN erscheint nur mit den letzten vier Zeichen. Reifendruck in psi/kPa wird in bar, Meilen in Kilometer und Fahrenheit in Celsius umgerechnet. Fleet-Zeitstempel für „Voll in“ werden als Restzeit dargestellt.
- Die 2,6-bar-Markierung ist die Darstellungsgrenze aus dem Mockup, keine fahrzeugspezifische Druckvorgabe. Die separaten Fleet-Reifendruckwarnungen haben ebenfalls Einfluss auf die Warnfarbe.

Die vorhandene Tesla-Fleet-Integration muss Befehle zulassen; je nach Fahrzeug sind korrekt eingerichtete Signierschlüssel nötig. Diese Schlüssel werden ausschließlich von der HA-Integration verwaltet und nicht durch HAUS-OPS gespeichert.

Quelle der Entitätsschlüssel und Funktionen: [Home Assistant Tesla Fleet](https://www.home-assistant.io/integrations/tesla_fleet/) und die Entity-Beschreibungen im offiziellen Home-Assistant-Core-Repository.
