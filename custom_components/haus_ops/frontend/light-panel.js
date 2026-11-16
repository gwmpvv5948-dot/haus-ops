const html = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const scenes = [['off','Alle aus'],['evening','Abendlicht'],['film','Film'],['hell','Hell']];
const heading = (title,color) => `<div class="ops-heading" style="--card-color:var(--${color})"><h2>${title}</h2><i></i></div>`;
const display = value => Number.isFinite(value) ? Math.round(value) : '—';

export class LightPanel {
  constructor(panel) { this.panel = panel; }

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
    for (const id of Object.keys(states).filter(id=>id.startsWith('switch.'))) {
      const entry = entries.get(id);
      if ([...(entry?.labels ?? []),...(deviceMap.get(entry?.device_id)?.labels ?? [])].some(label=>(labelMap.get(label) ?? label)==='licht')) {
        lights.set(id,{id,name:states[id].attributes.friendly_name ?? id,on:states[id].state==='on',ready:['on','off'].includes(states[id].state)});
      }
    }
    const excluded = new Set(panel.config?.light_exclude ?? []);
    return [...lights.values()].flatMap(light=>{
      if (excluded.has(light.id)) return [];
      const entry = entries.get(light.id);
      const device = deviceMap.get(entry?.device_id);
      if ([...(entry?.labels ?? []),...(device?.labels ?? [])].some(label=>(labelMap.get(label) ?? label)==='nicht_im_dashboard')) return [];
      const area = areaMap.get(entry?.area_id ?? device?.area_id);
      const floor = floorMap.get(area?.floor_id);
      const candidates = powerSensors.get(entry?.device_id);
      const sensor = states[panel.config?.circuits?.power?.[light.id] ?? (candidates?.length===1 ? candidates[0] : '')];
      const measured = sensor?.state?.trim() ? Number(sensor.state) : NaN;
      const rated = Number(panel.config?.light_rated?.[light.id] ?? states[light.id]?.attributes?.rated_power);
      const power = Number.isFinite(measured) ? measured*(sensor.attributes.unit_of_measurement==='kW'?1000:1)
        : Number.isFinite(rated) && light.ready ? rated*(light.on ? light.dim ? light.percent/100 : 1 : 0) : NaN;
      return [{...light,room:area?.name ?? 'Ohne Raum',area:area?.area_id ?? '',floor:floor?.level ?? 0, power}];
    }).sort((a,b)=>a.floor-b.floor || a.room.localeCompare(b.room,'de') || a.name.localeCompare(b.name,'de'));
  }

  range(light, extra='') {
    const percent = light.on ? light.percent : 0;
    return `<div class="light-column ${extra}" data-light-column style="--level:${percent}%">
      <div class="light-fill"></div><div class="light-rungs"></div>
      <input type="range" min="0" max="100" step="10" value="${percent}" data-light-range="${html(light.id)}" aria-label="${html(light.name)} · Helligkeit" ${light.ready?'':'disabled'}>
    </div>`;
  }

  instrument(light) {
    return `<button class="light-instrument ${light.on?'lit':''}" data-action="light-toggle:${html(light.id)}" aria-pressed="${light.on}" ${light.ready?'':'disabled'}>
      <i></i><b>${light.ready?(light.on?'An':'Aus'):'Offline'}</b></button>`;
  }

  sceneId(key) {
    return this.panel.config?.light_scenes?.[key] || (key==='evening' ? this.panel.overview.id('evening') : 'scene.'+(key==='off'?'alle_aus':key));
  }

  view() {
    const lights = this.lights();
    const areas = [...new Map(lights.map(light=>[light.area,light.room])).entries()];
    const filtered = lights.filter(light=>this.area===undefined || light.area===this.area);
    const groups = new Map();
    for (const light of filtered) {
      if (!groups.has(light.area)) groups.set(light.area,[]);
      groups.get(light.area).push(light);
    }
    let slotIndex = 0;
    const selected = filtered.find(light=>light.id===this.selected) ?? filtered[0];
    const online = lights.filter(light=>light.ready);
    const active = online.filter(light=>light.on);
    const dimmers = active.filter(light=>light.dim);
    const watts = online.filter(light=>Number.isFinite(light.power));
    const total = watts.length ? watts.reduce((sum,light)=>sum+light.power,0) : NaN;
    const metrics = [[active.length,'Aktiv'],[total,'Watt'],[dimmers.length?dimmers.reduce((sum,light)=>sum+light.percent,0)/dimmers.length:0,'Ø Hell %'],[online.length,'Online']];
    const amount = light => light.ready ? light.on ? light.dim ? light.percent+' %' : 'An' : light.dim ? '0 %' : 'Aus' : 'Offline';
    const currentRoom = selected ? lights.filter(light=>light.area===selected.area) : [];
    return {status:`Licht · ${active.length} von ${lights.length} an · ${display(total)} W · Szene ${scenes.find(([key])=>key===this.scene)?.[1] ?? 'Manuell'} · ${lights.length-online.length} offline`,
      layout:`<div class="light-console">
        ${heading('Beleuchtung','sand')}
        <div class="light-metrics">${metrics.map(([value,label])=>`<div><strong data-light-metric="${display(value)}">${display(value)}</strong><b>${label}</b></div>`).join('')}</div>
        <div class="light-rooms"><b>Räume</b>${[[undefined,'Alle'],...areas].map(([area,name])=>`<button data-action="light-room:${area===undefined?'*':encodeURIComponent(area)}" aria-pressed="${this.area===area}">${area===undefined?'':lights.filter(light=>light.area===area).length+' '}${html(name)}</button>`).join('')}</div>
        <div class="light-body"><section class="light-bank">${heading('Lichtbank','peach')}
          <div class="light-columns">${[...groups.values()].map((group,index)=>`<div class="light-group" style="--room-color:var(--${['peach','pink','sand','purple','blue'][index%5]})">
            <div class="light-group-slots">${group.map(light=>`<div class="light-slot ${light===selected?'selected':''}" style="--order:${Math.min(slotIndex++,24)}">
            <small>${amount(light)}</small>
            ${!light.ready ? '<div class="light-offline"><b>Offline</b></div>' : light.dim ? this.range(light) : this.instrument(light)}
            <button class="light-name" data-action="light-${light.ready?'toggle':'select'}:${html(light.id)}" aria-pressed="${light.on}">${html(light.name)}</button>
          </div>`).join('')}</div><span class="light-group-label" title="${html(group[0].room)}">${html(group[0].room)}</span>
          </div>`).join('') || '<p>Keine Leuchten verfügbar</p>'}</div></section>
          <section class="light-detail">${heading('Detail','pink')}${selected?`
            <strong>${html(selected.name)}</strong><small>${html(selected.room)} · ${!selected.ready?'Offline':selected.dim?'Dimmer':'Schalter'}</small>
            <div class="light-reading"><b>${amount(selected)}</b><span>${display(selected.power)} W</span></div>
            <div class="light-detail-controls">${!selected.ready?'<div class="light-offline"><b>Offline</b></div>':selected.dim?this.range(selected,'large'):this.instrument(selected)}
              <div>${[['toggle',selected.on?'Ausschalten':'Einschalten'],['plus','+ 10 %'],['minus','− 10 %'],['room-off','Raum aus']].map(([action,label],i)=>`<button data-action="light-${action}:${html(selected.id)}" ${i===3?!currentRoom.some(light=>light.on&&light.ready)?'disabled':'':!selected.ready || i>0&&!selected.dim?'disabled':''}>${label}</button>`).join('')}</div>
            </div><small>${currentRoom.filter(light=>light.on).length} von ${currentRoom.length} an · ${html(currentRoom.map(light=>light.name).join(', '))}</small>`:''}</section></div>
        <div class="light-scenes"><b>Szenen</b>${scenes.map(([key,label])=>`<button data-action="light-scene:${key}" aria-pressed="${this.scene===key}" ${key!=='off' && (this.panel.demo || ['scene','script'].includes(this.sceneId(key).split('.')[0]) && this.panel.state(this.sceneId(key))) ? '' : 'disabled'}>${label}</button>`).join('')}</div>
        <div class="light-data" aria-hidden="true">${Array.from({length:9},(_,i)=>`<span style="--order:${i}">${[0,1,2].map(j=>`<i>${100000+(104729*(i+1)+7919*(j+1))%900000}</i>`).join('')}</span>`).join('')}</div>
      </div>`};
  }

  animateMetrics(main,previous) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    main.querySelectorAll('[data-light-metric]').forEach((node,index)=>{
      const to = Number(node.dataset.lightMetric);
      const from = previous[index] ?? 0;
      if (!Number.isFinite(from) || !Number.isFinite(to) || from===to) return;
      const start = performance.now();
      const tick = now => {
        if (!node.isConnected) return;
        const progress = Math.min(1,(now-start)/600);
        node.textContent = Math.round(from+(to-from)*(1-(1-progress)**3));
        if (progress<1) requestAnimationFrame(tick);
      };
      node.textContent = from;
      requestAnimationFrame(tick);
    });
  }

  animateBank(main,delay) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    main.querySelectorAll('.light-slot').forEach((node,index)=>{
      node.animate([{opacity:.22},{opacity:1,filter:'brightness(1.7)',offset:.75},{opacity:1,filter:'none'}],
        {duration:400,delay:Math.min(index,15)*delay,fill:'backwards'});
    });
  }

  async act(action,id,value) {
    const lights = this.lights();
    const light = lights.find(item=>item.id===id);
    if (action === 'room') {
      this.area = id==='*' ? undefined : decodeURIComponent(id);
      this.selected = undefined;
      return;
    }
    if (action === 'scene') {
      if (id==='off' || !scenes.some(([key])=>key===id)) return;
      const scene = this.sceneId(id);
      if (!this.panel.demo) {
        await this.panel.call(scene,'turn_on');
      } else {
        this.panel.overview.demoVolumes = id==='evening'?[40,20,0,0]:id==='film'?[20,0,0,0]:[100,100,100,100];
      }
      this.scene = id;
      this.sceneWave = true;
      return;
    }
    if (!light) return;
    this.selected = id;
    if (action === 'select') return;
    if (action === 'room-off') {
      await Promise.all(lights.filter(item=>item.area===light.area&&item.on&&item.ready).map(item=>this.set(item,'turn_off')));
    } else if (!light.ready) return;
    else if (action === 'toggle') {
      await this.set(light,light.on?'turn_off':light.dim&&light.percent?'turn_on':'toggle',light.dim&&light.percent&&!light.on?{brightness_pct:light.percent}:{});
    } else if (light.dim && ['level','plus','minus'].includes(action)) {
      const percent = action==='level'?Number(value):Math.round((light.on?light.percent:0)/10)*10+(action==='plus'?10:-10);
      if (!Number.isFinite(percent)) return;
      const level = Math.max(0,Math.min(100,percent));
      await this.set(light,level?'turn_on':'turn_off',level?{brightness_pct:level}:{});
    }
    this.scene = undefined;
  }

  set(light,service,data={}) {
    if (!this.panel.demo) return this.panel.call(light.id,service,data);
    const overview = this.panel.overview;
    const index = overview.lights().findIndex(item=>item.id===light.id);
    overview.demoVolumes ??= [40,0,80,0];
    overview.demoVolumes[index] = service==='turn_off'?0:data.brightness_pct ?? 100;
  }
}
