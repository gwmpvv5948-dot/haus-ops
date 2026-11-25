const html = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const scenes = [['off','Alle aus'],['evening','Abendlicht'],['film','Film'],['hell','Hell']];
const display = value => Number.isFinite(value) ? Math.round(value) : '—';
const roomKey = value => String(value).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[^a-z0-9]/g,'');
const roomDefaults = {
  wohnzimmer:['#99ddbb',1], kuche:['#99ccff',1], garten:['#9999ff',2],
  alwin:['#ff9966',2], carla:['#cc99cc',3], esszimmer:['#ffcc99',3], schlafzimmer:['#ffaa00',3],
};
const powerIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v9m-5.7-6a8 8 0 1 0 11.4 0"/></svg>';
const lampValue = light => !light.ready ? 'Offline' : !light.on ? 'Aus' : light.dim ? light.percent+' %' : 'An';

function shortName(name, room) {
  const lower = name.toLocaleLowerCase('de-DE');
  const prefix = [room, roomKey(room)==='kuche'?'Kü':null, {wohnzimmer:'WZ',kuche:'KU',schlafzimmer:'SZ',esszimmer:'EZ'}[roomKey(room)]]
    .find(value=>value && (lower.startsWith(value.toLocaleLowerCase('de-DE')+' ') || lower.startsWith(value.toLocaleLowerCase('de-DE')+' · ')));
  return prefix ? name.slice(prefix.length).replace(/^[\s·–-]+/,'') || name : name;
}

export class LightPanel {
  constructor(panel) {
    this.panel = panel;
    this.pending = new Map();
  }

  lights() {
    const {panel} = this;
    panel.circuits.load();
    const {areas=[],entities=[],devices=[],floors=[],labels=[]} = panel.circuits.registry ?? {};
    const entries = new Map(entities.map(entry=>[entry.entity_id,entry]));
    const deviceMap = new Map(devices.map(device=>[device.id,device]));
    const areaMap = new Map(areas.map(area=>[area.area_id,area]));
    const floorMap = new Map(floors.map(floor=>[floor.floor_id,floor]));
    const labelMap = new Map(labels.map(label=>[label.label_id,label.name.toLowerCase().replaceAll(' ','_')]));
    const states = panel.ha?.states ?? {};
    const powerSensors = new Map();
    for (const entry of entities) {
      if (entry.device_id && states[entry.entity_id]?.attributes?.device_class === 'power') {
        const ids = powerSensors.get(entry.device_id) ?? [];
        ids.push(entry.entity_id);
        powerSensors.set(entry.device_id,ids);
      }
    }
    const lights = new Map(panel.overview.lights().map(light=>[light.id,light]));
    for (const id of Object.keys(states).filter(id=>!panel.config?.light_selection_saved && id.startsWith('switch.'))) {
      const entry = entries.get(id);
      if (!panel.config?.light_selection_saved && [...(entry?.labels ?? []),...(deviceMap.get(entry?.device_id)?.labels ?? [])].some(label=>(labelMap.get(label) ?? label)==='licht')) {
        lights.set(id,{id,name:states[id].attributes.friendly_name ?? id,on:states[id].state==='on',ready:['on','off'].includes(states[id].state)});
      }
    }
    const excluded = new Set(panel.config?.light_exclude ?? []);
    return [...lights.values()].flatMap(light=>{
      if (excluded.has(light.id)) return [];
      const entry = entries.get(light.id);
      const device = deviceMap.get(entry?.device_id);
      if (!panel.config?.light_selection_saved && [...(entry?.labels ?? []),...(device?.labels ?? [])].some(label=>(labelMap.get(label) ?? label)==='nicht_im_dashboard')) return [];
      const area = areaMap.get(entry?.area_id ?? device?.area_id);
      const floor = floorMap.get(area?.floor_id);
      const candidates = powerSensors.get(entry?.device_id);
      const sensor = states[panel.config?.circuits?.power?.[light.id] ?? (candidates?.length===1 ? candidates[0] : '')];
      const measured = sensor?.state?.trim() ? Number(sensor.state) : NaN;
      const rated = Number(panel.config?.light_rated?.[light.id] ?? states[light.id]?.attributes?.rated_power);
      const power = Number.isFinite(measured) ? measured*(sensor.attributes.unit_of_measurement==='kW'?1000:1)
        : Number.isFinite(rated) && light.ready ? rated*(light.on ? light.dim ? light.percent/100 : 1 : 0) : NaN;
      if (panel.ha?.connection?.connected === false) light = {...light,ready:false};
      let reading = light;
      const pending = this.pending.get(light.id);
      if (pending) {
        const confirmed = light.on===pending.on && (!pending.on || !light.dim || Math.abs(light.percent-pending.percent)<=1);
        if (confirmed || !light.ready || Date.now()>=pending.until) this.pending.delete(light.id);
        else reading = {...light,on:pending.on,percent:pending.percent};
      }
      return [{...reading,room:area?.name ?? (panel.demo ? 'Wohnzimmer' : 'Ohne Raum'),area:area?.area_id ?? '',floor:floor?.level ?? 0, power}];
    }).sort((a,b)=>a.floor-b.floor || a.room.localeCompare(b.room,'de') || a.name.localeCompare(b.name,'de'));
  }

  rooms(lights) {
    const groups = new Map();
    const settings = this.panel.config?.light_rooms ?? {};
    for (const light of lights) {
      if (!groups.has(light.area)) {
        const override = settings[light.area] ?? settings[light.room] ?? {};
        const [defaultColor='#ffcc99', defaultColumn] = roomDefaults[roomKey(light.room)] ?? [];
        const color = /^#[0-9a-f]{6}$/i.test(override.color ?? '') ? override.color : defaultColor;
        const column = [1,2,3].includes(override.column) ? override.column : defaultColumn;
        groups.set(light.area,{id:light.area,name:override.name || light.room,color,column,lights:[]});
      }
      groups.get(light.area).lights.push(light);
    }
    const order = Object.keys(roomDefaults);
    const rank = room => {
      const index = order.indexOf(roomKey(room.name));
      return index < 0 ? order.length : index;
    };
    return [...groups.values()].sort((a,b)=>rank(a)-rank(b));
  }

  row(light) {
    const name = html(shortName(light.name,light.room));
    const value = lampValue(light);
    const percent = light.ready && light.on ? light.dim ? light.percent : 100 : 0;
    const statusLabel = light.ready ? (light.on?'Ausschalten: ':'Einschalten: ') : 'Offline: ';
    const layers = `<span class="light-fill"></span><span class="light-line-label"><span>${name}</span><b data-light-value>${value}</b></span>
      <span class="light-line-label light-line-invert" aria-hidden="true"><span>${name}</span><b data-light-value>${value}</b></span>`;
    const content = light.ready && !light.dim
      ? `<button class="light-line" data-action="light-toggle:${html(light.id)}" aria-pressed="${light.on}" style="--level:${percent}%">${layers}</button>`
      : `<div class="light-line ${light.ready?'':'light-line-offline'}" data-light-column style="--level:${percent}%">${layers}
        ${light.ready?`<input type="range" min="0" max="100" step="5" value="${percent}" data-light-range="${html(light.id)}" aria-label="${html(light.name)} · Helligkeit" aria-valuetext="${value}">`:''}</div>`;
    return `<div class="light-slot">
      <button class="light-power" data-action="light-toggle:${html(light.id)}" aria-label="${statusLabel}${html(light.name)}" aria-pressed="${light.on}" ${light.ready?'':'disabled'}>${powerIcon}</button>${content}</div>`;
  }

  preview(range) {
    const parent = range.closest('[data-light-column]');
    parent.style.setProperty('--level', range.value+'%');
    const value = range.valueAsNumber ? range.value+' %' : 'Aus';
    parent.querySelectorAll('[data-light-value]').forEach(node=>node.textContent=value);
    range.setAttribute('aria-valuetext',value);
  }

  sceneId(key) {
    return this.panel.config?.light_scenes?.[key] || (key==='evening' ? this.panel.overview.id('evening') : 'scene.'+(key==='off'?'alle_aus':key));
  }

  view() {
    const lights = this.lights();
    const groups = this.rooms(lights);
    const selected = groups.some(group=>group.id===this.area) ? this.area : undefined;
    const columns = [[],[],[]];
    const weight = column => column.reduce((sum,room)=>sum+room.lights.length+1,0);
    for (const room of groups.filter(room=>room.column)) columns[room.column-1].push(room);
    for (const room of groups.filter(room=>!room.column)) columns.reduce((a,b)=>weight(a)<=weight(b)?a:b).push(room);
    const online = lights.filter(light=>light.ready);
    const active = online.filter(light=>light.on);
    const dimmers = active.filter(light=>light.dim);
    const watts = online.filter(light=>Number.isFinite(light.power));
    const total = watts.length ? watts.reduce((sum,light)=>sum+light.power,0) : NaN;
    const offline = lights.length-online.length;
    const disconnected = !this.panel.demo && this.panel.ha?.connection?.connected===false;
    const metrics = [[display(active.length),'Aktiv','von '+lights.length],[display(total),'Watt','gesamt'],
      [dimmers.length ? display(dimmers.reduce((sum,light)=>sum+light.percent,0)/dimmers.length)+' %' : '—','Ø Helligkeit','der aktiven'],
      [online.length+'/'+lights.length,'Online',offline+' offline']];
    const roomButton=room=>`<button style="--room-color:${room.color}" data-action="light-room:${room.id===undefined?'*':encodeURIComponent(room.id)}" aria-pressed="${selected===room.id}">${html(room.name)}</button>`;
    const roomBlock=room=>{
      const active=room.lights.filter(light=>light.ready&&light.on).length;
      const ready=room.lights.some(light=>light.ready);
      return `<section class="light-room-group" style="--room-color:${room.color}" ${selected!==undefined && selected!==room.id?'data-muted':''}>
        <button class="light-room-heading" data-action="light-room-toggle:${encodeURIComponent(room.id)}"
          aria-label="${html(room.name)} · ${active?'Raum ausschalten':'Raum einschalten'}" ${ready?'':'disabled'}>
          <strong>${html(room.name)}</strong><span>${active} / ${room.lights.length} an</span><b>${powerIcon} ${active?'Aus':'An'}</b>
        </button>
        <div class="light-room-lamps">${room.lights.map(light=>this.row(light)).join('')}</div>
      </section>`;
    };
    const status = `Licht · ${active.length} von ${lights.length} an · ${display(total)} W · Szene ${scenes.find(([key])=>key===this.scene)?.[1] ?? 'Manuell'} · ${offline} offline`;
    return {status:disconnected?'Verbindung getrennt':status, layout:`<div class="light-console">
      <div class="light-metrics">${metrics.map(([value,label,sub])=>`<div><strong>${value}</strong><b>${label}<br>${sub}</b></div>`).join('')}</div>
      <div class="light-rooms">${[{id:undefined,name:'Alle',color:'#ffcc99'},...groups].map(roomButton).join('')}</div>
      <div class="ops-heading" style="--card-color:var(--pink)"><h2>Lichtbank · nach Raum</h2><i></i></div>
      <div class="light-columns">
        ${groups.length ? columns.map(column=>`<div class="light-room-stack" style="--light-headers:${column.length};--light-rows:${Math.max(1,weight(column)-column.length)}">${column.map(roomBlock).join('')}</div>`).join('') : '<p>Keine Leuchten verfügbar</p>'}
      </div>
      <div class="light-scenes"><b>Szenen</b>${scenes.map(([key,label])=>`<button data-action="light-scene:${key}" aria-pressed="${this.scene===key}" ${!disconnected && (key==='off' || this.panel.demo || ['scene','script'].includes(this.sceneId(key).split('.')[0]) && this.panel.state(this.sceneId(key))) ? '' : 'disabled'}>${label}</button>`).join('')}</div>
    </div>`};
  }

  async act(action,id,value) {
    const lights = this.lights();
    if (action === 'room') {
      this.area = id==='*' ? undefined : decodeURIComponent(id);
      return;
    }
    if (action === 'scene') {
      if (!scenes.some(([key])=>key===id)) return;
      if (id==='off') {
        const scene = this.panel.config?.light_scenes?.off;
        if (!this.panel.demo && scene && this.panel.state(scene)) await this.panel.call(scene,'turn_on');
        else await Promise.all(lights.filter(light=>light.ready&&light.on).map(light=>this.set(light,0)));
      } else if (!this.panel.demo) {
        await this.panel.call(this.sceneId(id),'turn_on');
      } else {
        this.panel.overview.demoVolumes = id==='evening'?[40,20,0,0]:id==='film'?[20,0,0,0]:[100,100,100,100];
      }
      this.scene = id;
      return;
    }
    this.scene = undefined;
    if (action === 'room-toggle') {
      const room = lights.filter(light=>light.area===decodeURIComponent(id)&&light.ready);
      const turnOff = room.some(light=>light.on);
      await Promise.all(room.map(light=>this.set(light,turnOff ? 0 : this.lastLevel(light))));
      return;
    }
    const light = lights.find(item=>item.id===id);
    if (!light?.ready) return;
    if (action === 'toggle') await this.set(light,light.on ? 0 : this.lastLevel(light));
    if (action === 'level' && light.dim && Number.isFinite(Number(value))) {
      await this.set(light,Math.max(0,Math.min(100,Math.round(Number(value)/5)*5)));
    }
  }

  lastLevel(light) {
    return light.dim ? light.percent || 60 : 100;
  }

  async set(light,percent) {
    if (this.panel.demo) {
      const overview = this.panel.overview;
      const index = overview.lights().findIndex(item=>item.id===light.id);
      overview.demoVolumes ??= [40,0,80,0];
      overview.demoVolumes[index] = percent;
      return;
    }
    const pending = {on:percent>0,percent,until:Date.now()+3000};
    this.pending.set(light.id,pending);
    try {
      await this.panel.call(light.id,pending.on?'turn_on':'turn_off', pending.on && light.dim ? {brightness_pct:percent} : {});
    } catch (error) {
      if (this.pending.get(light.id)===pending) this.pending.delete(light.id);
      throw error;
    }
  }
}
