# Display-Helligkeit per SSH

Der Regler unter **82873.4 → Display** ruft eine Home-Assistant-Aktion aus der Integration `shell_command` auf. Beim Loslassen übergibt er `brightness` als ganze Prozentzahl von 5 bis 100. Die Wirkung erfolgt sofort. **Abbrechen** schließt die Einstellungen, bereits gesendete Helligkeitsbefehle bleiben wirksam.

Die SSH-Verbindung muss von Home Assistant zum Raspberry funktionieren. Verwende den Benutzer des Raspberry, den Host und einen in Home Assistant verfügbaren privaten SSH-Schlüssel. Private Schlüssel und Passwörter gehören in die lokale HA-Konfiguration.

Ersetze in den Beispielen `kiosk` und `raspberrypi.local` durch Benutzer und Host deines Displays.

## Raspberry vorbereiten

Für das hier verwendete Display ist der Pfad:

```text
/sys/class/backlight/panel_backlight@1/brightness
```

Der SSH-Befehl muss ohne Passwortdialog schreiben können. Eine Möglichkeit ist ein kleines, root-eigenes Skript auf dem Raspberry unter `/usr/local/sbin/walldisplay-helligkeit`:

```sh
#!/bin/sh
set -eu
[ "$#" -eq 1 ] || exit 2
case "$1" in
  ''|*[!0-9]*) exit 2 ;;
esac
[ "${#1}" -le 3 ] || exit 2
[ "$1" -ge 5 ] && [ "$1" -le 100 ] || exit 2
display="/sys/class/backlight/panel_backlight@1"
max=$(cat "$display/max_brightness")
printf '%s\n' "$((max * $1 / 100))" > "$display/brightness"
```

Setze Besitzer und Rechte des Skripts auf `root:root` und `0755`. Bearbeite mit `sudo visudo -f /etc/sudoers.d/walldisplay-helligkeit` eine gezielte sudo-Regel:

```text
kiosk ALL=(root) NOPASSWD: /usr/local/sbin/walldisplay-helligkeit
```

Das Skript muss für `kiosk` schreibgeschützt bleiben. Es erlaubt ausschließlich Helligkeitswerte von 5 bis 100.

## Schlüssel und HA-Aktion

Erzeuge einen eigenen Schlüssel in der Home-Assistant-Terminal-App. Prüfe vorab, dass die gewählten Dateien noch nicht existieren.

```sh
mkdir -p /config/.ssh
chmod 700 /config/.ssh
ssh-keygen -t ed25519 -f /config/.ssh/walldisplay -N ''
ssh-copy-id -i /config/.ssh/walldisplay.pub kiosk@raspberrypi.local
```

Falls `ssh-copy-id` fehlt, füge den Inhalt der öffentlichen Datei `walldisplay.pub` auf dem Raspberry in `~kiosk/.ssh/authorized_keys` ein. Der private Schlüssel bleibt in Home Assistant.

Verbinde dich anschließend einmal aus dem HA-Terminal mit dem Raspberry. Prüfe den angezeigten Host-Fingerabdruck vor dem Bestätigen gegen den Raspberry:

```sh
ssh -i /config/.ssh/walldisplay \
  -o UserKnownHostsFile=/config/.ssh/known_hosts \
  kiosk@raspberrypi.local true
```

Ergänze in der lokalen `configuration.yaml` unter dem vorhandenen oder neuen `shell_command:`-Block:

```yaml
shell_command:
  walldisplay_helligkeit: >-
    ssh -i /config/.ssh/walldisplay
    -o UserKnownHostsFile=/config/.ssh/known_hosts
    -o StrictHostKeyChecking=yes
    -o BatchMode=yes
    -o ConnectTimeout=5
    kiosk@raspberrypi.local
    sudo -n /usr/local/sbin/walldisplay-helligkeit
    {{ [5, [100, brightness | int(50)] | min] | max }}
```

Prüfe die HA-Konfiguration und lade die Shell-Commands über `shell_command.reload` neu. Bei erstmaliger Einrichtung der Integration kann ein HA-Neustart erforderlich sein.

Trage in HAUS-OPS bei **SSH-Aktion für die Display-Helligkeit** `shell_command.walldisplay_helligkeit` ein, speichere mit **OK** und öffne die Einstellungen erneut. Der Regler sendet jetzt den Prozentwert an die gespeicherte Aktion.

Der gespeicherte Reglerwert ist der zuletzt erfolgreich gesendete Wert. Änderungen außerhalb des Dashboards werden ohne zusätzlichen Sensor nicht zurückgelesen.
