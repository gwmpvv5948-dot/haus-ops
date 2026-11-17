const lamps = [['tv','TV'],['stehlampe','Stehlampe'],['esszimmer','Esszimmer'],['kueche','Küche']];
export const overviewFields = [
  ...lamps.map(([key,label])=>['overview.'+key,label,['light','switch']]),
  ['overview.evening','Abendlicht',['scene']],
  ['overview.outside','Außentemperatur',['sensor']],
  ['overview.camera','Kamera',['camera']],
  ['overview.alarm','Alarmstufe',['sensor']],
  ['overview.acknowledged','Alarm quittiert',['input_boolean']],
];
const format = (value,digits=0) => Number.isFinite(value)
  ? value.toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
const bars = (count,value) => `<span class="ops-bars" aria-hidden="true">${Array.from({length:count},(_,i)=>
  `<i class="${i/count<value?'filled':''}"></i>`).join('')}</span>`;
const heading = (title,color,info,page) => `<div class="ops-heading" style="--card-color:var(--${color})">
  ${page===undefined?`<h2>${title}</h2>`:`<button data-page="${page}">${title}</button>`}<i></i>${info?`<b>${info}</b>`:''}</div>`;
const action = (code,label,attributes='',extra='') => `<button ${attributes} ${extra}><small>${code}</small><span>${label}</span></button>`;
const actions = (...buttons) => `<div class="ops-card-actions">${buttons.join('')}</div>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const enabled = state => state && !['unknown','unavailable'].includes(state.state);

export class OverviewPanel {
  constructor(panel) { this.panel = panel; }

  id(key) {
    if (key === 'outside' || key === 'camera') return this.panel.config?.overview?.[key];
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
    return `<div class="ops-light-grid">${tiles}</div>${actions(
      action('10-01','Alle aus','data-action="ops-off" class="ops-off"',lights.some(light=>light.on&&light.ready)?'':'disabled'),
      action('10-02','Abend','data-action="light-scene:evening"',sceneReady('evening')?'':'disabled'),
      action('10-03','Film','data-action="light-scene:film"',sceneReady('film')?'':'disabled'),
      action('10-30','Licht ▶','data-page="9"'))}`;

  }

  supply(energy, alarm) {
    const water = this.panel.water;
    const today = this.panel.state(water.entity('today'));
    const average = this.panel.state(water.entity('average'));
    const rate = this.panel.state(water.entity('flow'));
    const leak = alarm.leak;
    const read = sensor => enabled(sensor) && sensor.state.trim()
      ? Number(sensor.state)*(sensor.attributes.unit_of_measurement==='m³'?1000:1) : NaN;
    const waterUsed = this.panel.demo ? 107 : read(today);
    const waterAverage = this.panel.demo ? 180 : read(average);
    const ratio = waterAverage > 0 && Number.isFinite(waterUsed) ? waterUsed / waterAverage : NaN;
    const watts = value => format(Math.abs(value))+' W';
    return `<div class="ops-supply">${[
      ['Solar',watts(energy.solar),'#ffaa00'],['Haus',watts(energy.house),'var(--peach)'],
      [energy.grid<0?'Netz · Einspeisung':'Netz · Bezug',watts(energy.grid),'var(--purple)'],['Akku',format(energy.soc)+' %','#99ddbb'],
    ].map(([label,value,color])=>`<div style="--source:${color}"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>
    <div class="energy-flow ops-flow">${energy.segments}</div>
    <button class="ops-water ${leak?'bad':''}" data-page="7"><span>Wasser heute<strong>${format(waterUsed)} L</strong></span>
      <span class="ops-water-average"><small>Ø ${format(waterAverage)} L${Number.isFinite(ratio)?' · '+format(ratio*100)+' %':''}</small>
      <i style="--water-share:${Number.isFinite(ratio)?Math.min(100,Math.max(0,ratio*100)):0}%"></i></span>
      ${leak?'<b>Leck</b>':read(rate)>0?'<b>Fließt</b>':''}</button>`;

  }

  render(data) {
    const {accesses,complete,alarm,rooms,level,levels,escape,energy,overviewAlarm} = data;
    const panel = this.panel;
    const alert = overviewAlarm.level;
    const safetyText = alert !== 'normal' ? escape(overviewAlarm.reasons || alarm)
      : complete ? 'Status der Zugänge' : 'Zustand einzelner Kontakte fehlt';
    const temperatures = panel.demo ? rooms : ['Wohnzimmer','Carla','Alwin','Schlafzimmer','Flur','Bad']
      .map(name=>rooms.find(room=>room.name===name) ?? {name,value:NaN,display:'—'});
    const blinds = panel.blinds();
    const lights = this.favoriteLights();
    const secured = accesses.filter(item=>item.open===false).length;
    const open = accesses.filter(item=>item.open===true);
    const latest = accesses.filter(item=>Number.isFinite(Date.parse(item.changed))).sort((a,b)=>Date.parse(b.changed)-Date.parse(a.changed))[0];
    const lockReady = accesses.some(item=>item.lock && item.open===true);
    const camera = panel.config?.overview?.camera;
    const readings = temperatures.map(room=>room.value).filter(Number.isFinite);
    const inside = readings.length ? readings.reduce((sum,value)=>sum+value,0)/readings.length : NaN;
    const outsideId = this.id('outside');
    const outsideState = outsideId && panel.state(outsideId);
    const outside = enabled(outsideState) ? Number(outsideState.state) : NaN;
    return `<div class="ops-overview">
      <section class="ops-safety">${heading('Sicherheit',alert==='rot'?'red':alert==='gelb'?'yellow':'purple',alert==='normal'?'Kein Alarm':alarm,1)}
        ${alert !== 'normal' || complete && !accesses.some(item=>item.open) ? `<strong class="ops-sec-status" data-alert="${alert}">${alarm}</strong>` : ''}
        <small class="ops-safety-note" title="${safetyText}">${alert==='normal'?`${secured} / ${accesses.length} gesichert${open.length?' · '+open.map(item=>escape(item.name)).join(', ')+' offen':''}`:safetyText}</small>
        <div class="ops-contacts">${accesses.map(item=>`<span class="${item.open ? (alert === 'normal' ? 'contact-open' : 'open') : ''} ${item.open===undefined&&!item.open?'missing':''}">${escape(item.name)}</span>`).join('')}</div>
        <small class="ops-caption">Sensor-Scan · ${accesses.filter(item=>item.open!==undefined).length} / ${accesses.length} online</small>
        ${latest?`<small class="ops-caption">Zuletzt geändert · ${escape(latest.name)} ${new Date(latest.changed).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</small>`:''}
        ${actions(action('06-11','Verriegeln','data-action="ops-lock"',lockReady?'':'disabled'),
          action('06-12','Kameras','data-action="ops-camera"',camera&&enabled(panel.state(camera))?'':'disabled'),
          action('06-40','Details ▶','data-page="1"'))}
      </section>
      <section class="ops-vent">${heading('Hauslüftung','pink',level===4?'Boost':level>0?'Aktiv':level===0?'Aus':'—',2)}
        <div class="ops-air">
          <svg viewBox="0 0 120 120" role="img" aria-label="Lüfterrad" class="ops-fan"><circle cx="60" cy="60" r="52" fill="#101019"/>
            ${Array.from({length:24},(_,i)=>`<path data-fan-segment d="M60 3v7" transform="rotate(${i*15} 60 60)" stroke="${i<level*6?(i<6?'#ff995f':'#cd9bd0'):'#292929'}" stroke-width="7"/>`).join('')}
            <path class="ops-fan-marker" visibility="hidden" d="M60 3v7" stroke="#fff" stroke-width="7"/>
            <g class="ops-rotor">
            ${Array.from({length:6},(_,i)=>`<path d="M60 60Q47 18 75 19Q88 29 60 60" transform="rotate(${i*60} 60 60)" fill="#cd9bd0"/>`).join('')}
            </g><circle cx="60" cy="60" r="14" fill="#000" stroke="#ff995f"/>
            <text x="60" y="61">${levels[level] ?? '—'}</text></svg>
          <div class="ops-vent-reading"><small>Stufe</small><strong>${levels[level] ?? '—'}</strong><small>Modus</small><b>${panel.remaining>0?'Timer':'Auto'}</b></div>
        </div>
        <div class="ops-timer">Timer <span data-timer-bar>${bars(12,0)}</span><strong>${panel.remaining>0?'<span data-countdown></span>':'Auto'}</strong>
          <button data-action="ops-timer:0" ${panel.demo || enabled(panel.timer)?'':'disabled'}>+15</button>
        </div>
        ${actions(...levels.map((name,i)=>action('08-0'+i,escapeHtml(name),`data-action="vent:${i}" aria-pressed="${i===level}"`,panel.canSetLevel(i)?'':'disabled')))}
      </section>
      <section data-card-page="4">${heading('Klima · Quartiere','blue',temperatures.length+' Räume',4)}
        <div class="ops-climate">${temperatures.map(room=>`<div style="--reading:var(--${room.value<20?'blue':'peach'})">
          <span>${escape(room.name)} ${room.stale?'<small class="warn">· Still</small>':''}</span>${bars(10,Math.max(0,(room.value-15)/10))}<strong>${room.display}</strong></div>`).join('')}</div>
        <div class="ops-card-actions"><div><small>Außen</small><span>${format(outside,1)}°</span></div>
          <div><small>Ø Innen</small><span>${format(inside,1)}°</span></div>${action('05-20','Heizung ▶','data-page="4"')}</div>
      </section>
      <section class="ops-blinds" data-card-page="3">${heading('Rollos','sand',blinds.some(blind=>blind.movement)?'Fährt':blinds.every(blind=>blind.position===0)?'Alle zu':blinds.filter(blind=>blind.position===100).length+' offen',3)}
        <div class="ops-blind-windows">${blinds.map(blind=>`<button data-action="ops-blind:${escape(blind.key)}"
          ${panel.canToggleOverviewBlind(blind)?'':'disabled'}>
          <b>${blind.position===null?'—':blind.position+' %'}</b>
          <span class="ops-blind-frame"><i data-slats="${escape(blind.key)}" style="height:${blind.position===null?0:100-blind.position}%"></i></span>
          <strong>${escape(blind.name)}</strong><small>${escape(blind.status)}</small></button>`).join('')}</div>
        ${actions(action('07-01','↓ Alle ab','data-action="cover:0"',panel.canMoveCover(0)?'':'disabled'),
          action('07-02','Stop','data-action="ops-blind-stop"',blinds.some(blind=>blind.available&&(blind.features&8))?'':'disabled'),
          action('07-03','↑ Alle auf','data-action="cover:1"',panel.canMoveCover(1)?'':'disabled'))}
      </section>
      <section class="ops-utilities ${overviewAlarm.leak?'ops-leak':''}">${heading('Versorgung',overviewAlarm.leak?'red':'peach','Strom · Wasser',6)}${this.supply(energy,overviewAlarm)}
        ${actions(action('02-112','Energie ▶','data-page="6"'),action('03-309','Wasser ▶','data-page="7"'),action('02-3','PV-Ausblick ▶','data-action="ops-pv"'))}</section>
      <section class="ops-light-card">${heading('Licht','gold',lights.filter(light=>light.on).length+' an',9)}${this.lightControls(lights)}</section>
    </div>`;
  }
}
