const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export class MobileNotifications {
  constructor(settings) { this.settings = settings; }

  async load(hass) {
    try {
      const result = await hass.callWS({type:'haus_ops/notifications/get'});
      this.config = result.config;
      this.devices = result.devices;
      this.available = true;
    } catch { this.available = false; }
  }

  fields() {
    if (!this.available) return '<fieldset><legend>Mobile Alarmmeldungen</legend><p>Für die Empfängerauswahl muss die aktualisierte HAUS-OPS-Integration in HA geladen sein. Danach diese Einstellungen erneut laden.</p></fieldset>';
    return `<fieldset><legend>Mobile Alarmmeldungen</legend>
      <p>Versand durch Home Assistant, auch ohne geöffnetes Dashboard. Ohne ausgewählte Empfänger wird nichts versendet.</p>
      ${[['yellow','Gelber Alarm'],['red','Roter Alarm']].map(([level,label])=>{
        const options = this.config[level];
        return `<fieldset><legend>${label}</legend>
          ${this.devices.length ? this.devices.map(device=>`<label><span><input type="checkbox" name="mobile-${level}-recipient" value="${escape(device.service)}" ${options.recipients.includes(device.service)?'checked':''}> ${escape(device.name)} · notify.${escape(device.service)}</span></label>`).join('') : '<p>Keine Mobile-App-Benachrichtigungsaktionen in HA gefunden.</p>'}
          <label>Wiederholung<select name="mobile-${level}-repeat">${[[0,'Nur einmal beim Auslösen'],[30,'Alle 30 Sekunden'],[60,'Jede Minute'],[300,'Alle 5 Minuten'],[1800,'Alle 30 Minuten']].map(([value,text])=>`<option value="${value}" ${options.repeat_seconds===value?'selected':''}>${text}</option>`).join('')}</select></label>
          ${level==='red'?`<label><span><input type="checkbox" name="mobile-red-critical" ${options.critical?'checked':''}> Kritische Meldung (iPhone: Berechtigung für kritische Hinweise erforderlich)</span></label>`:''}
        </fieldset>`;
      }).join('')}
      <label>Rote alert.*-Entitäten (eine pro Zeile; leer nutzt den Alarmstufen-Sensor)
        <textarea name="mobile-red-alerts" rows="3" spellcheck="false">${escape(this.config.red_alerts.join('\n'))}</textarea>
      </label>
      <small>Gelb verwendet die Liste „Gelbe Warnungen“. Quittieren beendet Wiederholungen. Für Rot muss „Alarm quittiert“ auf einen HA-Schalter-Helfer zeigen, damit die Quittierung auch ohne Browser gilt.</small>
    </fieldset>`;
  }

  configFromForm(data, next) {
    if (!this.available) return undefined;
    const config = {...this.config,
      yellow_alerts:next.yellow_alerts,
      red_alerts:[...new Set(data.get('mobile-red-alerts').split(/[\s,]+/).filter(Boolean))],
      red_sensor:next.overview.alarm || 'sensor.alarmstufe',
      red_acknowledged:next.overview.acknowledged || 'input_boolean.alarm_quittiert',
    };
    if (config.red_alerts.some(id=>!/^alert\.[a-z0-9_]+$/.test(id))) throw Error('Mobile Alarmmeldungen · Bitte rote alert.*-Entitäten eingeben.');
    for (const level of ['yellow','red']) config[level] = {
      recipients:data.getAll(`mobile-${level}-recipient`),
      repeat_seconds:Number(data.get(`mobile-${level}-repeat`)),
      critical:level==='red' && data.has('mobile-red-critical'),
    };
    return config;
  }

  async save(hass, config) {
    if (!config) return;
    await hass.callWS({type:'haus_ops/notifications/save',config});
    this.config = config;
  }
}
