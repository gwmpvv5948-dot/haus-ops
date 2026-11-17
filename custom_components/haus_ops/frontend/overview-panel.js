const lamps = [['tv','TV'],['stehlampe','Stehlampe'],['esszimmer','Esszimmer'],['kueche','Küche']];
export const overviewFields = [
  ...lamps.map(([key,label])=>['overview.'+key,label,['light','switch']]),
  ['overview.evening','Abendlicht',['scene']],
  ['overview.alarm','Alarmstufe',['sensor']],
  ['overview.acknowledged','Alarm quittiert',['input_boolean']],
];
const format = (value,digits=0) => Number.isFinite(value)
  ? value.toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
const bars = (count,value) => `<span class="ops-bars" aria-hidden="true">${Array.from({length:count},(_,i)=>
  `<i class="${i/count<value?'filled':''}"></i>`).join('')}</span>`;
const heading = (title,color,info,page) => `<div class="ops-heading" style="--card-color:var(--${color})">
  ${page===undefined?`<h2>${title}</h2>`:`<button data-page="${page}">${title}</button>`}<i></i>${info?`<b>${info}</b>`:''}</div>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const enabled = state => state && !['unknown','unavailable'].includes(state.state);

export class OverviewPanel {
  constructor(panel) { this.panel = panel; }

  id(key) {
    return this.panel.config?.overview?.[key] || ({
      evening:'scene.abendlicht', alarm:'sensor.alarmstufe', acknowledged:'input_boolean.alarm_quittiert',
    })[key] || (lamps.some(([id])=>id===key) ? 'light.'+key : 'sensor.kwl_'+key);
  }

  discoveredLights() {
    return Object.keys(this.panel.ha?.states ?? {}).filter(id => id.startsWith('light.')).sort();
  }

  lights(selection) {
    const featured = lamps.map(([key,name]) => [this.id(key),name]);
    const ids = this.panel.demo ? featured.map(([id]) => id) : selection ?? (this.panel.config?.light_selection_saved ? this.panel.config.lights : [...new Set([
      ...featured.filter(([id]) => this.panel.state(id)).map(([id]) => id),
      ...(this.panel.config?.lights ?? []),
      ...this.discoveredLights(),
    ])]);
    const excluded = new Set(this.panel.config?.light_exclude ?? []);
    const names = new Map(featured);
    return ids.filter(id=>this.panel.demo || !excluded.has(id)).map((id,i)=>{
      const state = this.panel.state(id);
      const name = names.get(id) ?? state?.attributes?.friendly_name ?? id;
      if (this.panel.demo) {
        const percent = (this.demoVolumes ?? [40,0,80,0])[i];
        return {id,name,on:percent>0,percent,dim:true,ready:true};
      }
      const dim = state?.attributes?.supported_color_modes?.some(mode=>!['onoff','unknown'].includes(mode));
      const on = state?.state === 'on';
      this.brightness ??= new Map();
      if (on && Number.isFinite(state.attributes.brightness)) this.brightness.set(id, Math.round(state.attributes.brightness/255*100));
      return {id,name,on,dim,ready:enabled(state),percent:this.brightness.get(id) ?? 0};
    });
  }

  alarm() {
    const state = this.panel.state(this.id('alarm'));
    const level = ['gelb','rot'].includes(state?.state?.toLowerCase()) ? state.state.toLowerCase() : 'normal';
    if (level !== 'rot') this.localAck = false;
    const causes = Array.isArray(state?.attributes?.ursachen) ? state.attributes.ursachen : [];
    return {level, reasons:causes.join(' · '), count:causes.length,
      leak:this.panel.state(this.panel.water.entity('leak'))?.state === 'on' || causes.some(cause=>/wasserleck/i.test(String(cause))),
      acknowledged: this.localAck || this.panel.state(this.id('acknowledged'))?.state==='on'};
  }

  favoriteLights() {
    return this.lights(this.panel.config?.overview_lights).slice(0,6);
  }

  async act(action, id, value) {
    const panel = this.panel;
    const favorites = this.favoriteLights();
    if (action === 'ack') {
      if (enabled(panel.state(this.id('acknowledged')))) await panel.call(this.id('acknowledged'),'turn_on');
      this.localAck = true;
    } else if (action === 'off') {
      await Promise.all(favorites.filter(light=>light.on && light.ready).map(light=>this.act('toggle',light.id)));
    } else {
      const light = favorites.find(item=>item.id===id);
      if (!light?.ready || (value !== undefined && !light.dim)) return;
      const level = value ?? (light.on ? 0 : light.dim ? light.percent || 100 : 100);
      if (panel.demo) {
        const index = this.lights().findIndex(item=>item.id===id);
        this.demoVolumes ??= [40,0,80,0];
        this.demoVolumes[index] = level;
      } else {
        await panel.call(id,level?'turn_on':'turn_off',level && light.dim ? {brightness_pct:level} : {});
      }
      panel.lightsPanel.scene = undefined;
    }
  }

  lightControls(lights) {
    const tiles = Array.from({length:6},(_,index)=>{
      const light = lights[index];
      if (!light) return '<span class="ops-light-tile empty" aria-hidden="true"></span>';
      const level = light.on ? light.dim ? light.percent : 100 : 0;
      const status = !light.ready ? 'Offline' : !light.on ? 'Aus' : light.dim ? level+' %' : 'An';
      return `<button class="ops-light-tile ${light.ready?'':'offline'}" style="--fill:${level}%"
        data-action="ops-toggle:${escapeHtml(light.id)}" ${light.dim?'data-overview-dimmer':''}
        aria-pressed="${light.on}" ${light.ready?'':'disabled'}><small>${status}</small><strong>${escapeHtml(light.name)}</strong></button>`;
    }).join('');
    const sceneReady = key => {
      const entity = this.panel.lightsPanel.sceneId(key);
      return this.panel.demo || (['scene','script'].includes(entity.split('.')[0]) && enabled(this.panel.state(entity)));
    };
    return `<div class="ops-light-grid">${tiles}</div><div class="ops-light-actions">
      <button data-action="ops-off" ${lights.some(light=>light.on&&light.ready)?'':'disabled'}>Alle aus</button>
      <button data-action="light-scene:evening" ${sceneReady('evening')?'':'disabled'}>Abend</button>
      <button data-action="light-scene:film" ${sceneReady('film')?'':'disabled'}>Film</button>
      <button data-page="9">Licht ▶</button>
    </div>`;
  }

  supply(energy, alarm) {
    const water = this.panel.water;
    const today = this.panel.state(water.entity('today'));
    const average = this.panel.state(water.entity('average'));
    const rate = this.panel.state(water.entity('flow'));
    const leak = alarm.leak;
    const read = sensor => enabled(sensor) && sensor.state.trim()
      ? Number(sensor.state)*(sensor.attributes.unit_of_measurement==='m³'?1000:1) : NaN;
    const watts = value => format(Math.abs(value))+' W';
    return `<div class="ops-supply">${[
      ['Solar',watts(energy.solar),'#ffaa00'],['Haus',watts(energy.house),'var(--peach)'],
      [energy.grid<0?'Netz · Einspeisung':'Netz · Bezug',watts(energy.grid),'var(--purple)'],['Akku',format(energy.soc)+' %','#99ddbb'],
    ].map(([label,value,color])=>`<div style="--source:${color}"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>
    <div class="energy-flow ops-flow">${energy.segments}</div>
    <button class="ops-water ${leak?'bad':''}" data-page="7"><span>Wasser heute<strong>${this.panel.demo?107:format(read(today))} L</strong></span>
      <small>Ø ${this.panel.demo?180:format(read(average))} L</small><b>${leak?'Leck':read(rate)>0?'Fließt':read(rate)===0 || this.panel.demo?'Ruhe':'—'}</b></button>`;
  }

  render(data) {
    const {accesses,complete,alarm,rooms,level,levels,coverButtons,escape,energy,overviewAlarm} = data;
    const panel = this.panel;
    const alert = overviewAlarm.level;
    const safetyText = alert !== 'normal' ? escape(overviewAlarm.reasons || alarm)
      : complete ? 'Status der Zugänge' : 'Zustand einzelner Kontakte fehlt';
    const temperatures = panel.demo ? rooms : ['Wohnzimmer','Carla','Alwin','Schlafzimmer','Flur','Bad']
      .map(name=>rooms.find(room=>room.name===name) ?? {name,value:NaN,display:'—'});
    const speeds = [0,120,260,430,700];
    const duration = speeds[level] ? 360/speeds[level] : 0;
    const blinds = panel.blinds();
    const lights = this.favoriteLights();
    return `<div class="ops-overview">
      <section class="ops-safety">${heading('Sicherheit',alert==='rot'?'red':alert==='gelb'?'yellow':'purple',alarm,1)}
        ${alert !== 'normal' || complete && !accesses.some(item=>item.open) ? `<strong class="ops-sec-status" data-alert="${alert}">${alarm}</strong>` : ''}
        <small class="ops-safety-note" title="${safetyText}">${safetyText}</small>
        <div class="ops-contacts">${accesses.map(item=>`<span class="${item.open ? (alert === 'normal' ? 'contact-open' : 'open') : ''} ${item.open===undefined&&!item.open?'missing':''}">${escape(item.name)}</span>`).join('')}</div>
        <small class="ops-caption">Sensor-Scan · ${accesses.filter(item=>item.open!==undefined).length} / ${accesses.length} online</small>
      </section>
      <section class="ops-vent">${heading('Hauslüftung','pink',level===4?'Boost':level>0?'Aktiv':level===0?'Aus':'—',2)}
        <div class="ops-air">
          <svg viewBox="0 0 120 120" role="img" aria-label="Lüfterrad" class="ops-fan"><circle cx="60" cy="60" r="52" fill="#101019"/>
            ${Array.from({length:24},(_,i)=>`<path d="M60 3v7" transform="rotate(${i*15} 60 60)" stroke="${i<level*6?(i<6?'#ff995f':'#cd9bd0'):'#292929'}" stroke-width="7"/>`).join('')}
            <g class="ops-rotor" style="--turn:${duration || 1}s;animation-play-state:${duration?'running':'paused'}">
            ${Array.from({length:6},(_,i)=>`<path d="M60 60Q47 18 75 19Q88 29 60 60" transform="rotate(${i*60} 60 60)" fill="#cd9bd0"/>`).join('')}
            </g><circle cx="60" cy="60" r="14" fill="#000" stroke="#ff995f"/>
            <text x="60" y="61">${levels[level] ?? '—'}</text></svg>
        </div>
        <div class="ops-stages">${levels.map((name,i)=>`<button data-action="vent:${i}" aria-pressed="${i===level}" ${panel.canSetLevel(i)?'':'disabled'}>${escapeHtml(name)}</button>`).join('')}</div>
        <div class="ops-timer">Timer <span data-timer-bar>${bars(12,0)}</span><strong>${panel.remaining>0?'<span data-countdown></span>':'Auto'}</strong>
          <button data-action="ops-timer:0" ${panel.demo || enabled(panel.timer)?'':'disabled'}>+15</button>
          <button data-action="ops-timer:1" ${panel.demo || enabled(panel.timer)?'':'disabled'}>Stop</button></div>
      </section>
      <section data-card-page="4">${heading('Klima · Quartiere','sand',temperatures.length+' Räume',4)}
        <div class="ops-climate">${temperatures.map(room=>`<div style="--reading:var(--${room.value<19?'blue':room.value<20.5?'purple':room.value<21.5?'sand':'peach'})">
          <span>${escape(room.name)} ${room.stale?'<small class="warn">· Still</small>':''}</span>${bars(10,Math.max(0,(room.value-15)/10))}<strong>${room.display}</strong></div>`).join('')}</div>
      </section>
      <section class="ops-blinds" data-card-page="3">${heading('Rollos','purple',blinds.some(blind=>blind.movement)?'Fährt':blinds.length+' Fenster',3)}
        ${coverButtons}
        <div class="ops-blind-rows">${blinds.map(blind=>`<div><span>${escape(blind.name)}</span>${bars(10,Number.isFinite(blind.position)?1-blind.position/100:0)}
          <b>${blind.position===100?'Offen':blind.position===0?'Zu':Number.isFinite(blind.position)?format(100-blind.position)+' %':'—'}</b></div>`).join('')}</div>
      </section>
      <section class="ops-utilities ${overviewAlarm.leak?'ops-leak':''}">${heading('Versorgung',overviewAlarm.leak?'red':'peach','Strom · Wasser',6)}${this.supply(energy,overviewAlarm)}</section>
      <section class="ops-light-card">${heading('Licht','sand',lights.filter(light=>light.on).length+' an',9)}${this.lightControls(lights)}</section>
    </div>`;
  }
}
