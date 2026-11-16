const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
const colors = ['#ff995f','#cd9bd0','#a19aff','#ffaa00','#99ddbb'];
const watts = new Intl.NumberFormat('de-DE', {maximumFractionDigits:0});
const format = value => Number.isFinite(value) ? watts.format(value)+' W' : '—';
const total = items => {
  const values = items.map(item=>item.power).filter(Number.isFinite);
  return values.length ? values.reduce((sum,value)=>sum+value,0) : NaN;
};
const onCount = items => items.filter(item=>item.on).length;
const normalize = value => String(value ?? '').toLowerCase().replace(/ü/g,'ue').replace(/[^a-z0-9]/g,'');
const point = (radius,angle) => [250+radius*Math.sin(angle*Math.PI/180),250-radius*Math.cos(angle*Math.PI/180)];
function sector(inner, outer, start, end) {
  const large = end-start > 180 ? 1 : 0;
  return `M${point(outer,start)} A${outer} ${outer} 0 ${large} 1 ${point(outer,end)}
    L${point(inner,end)} A${inner} ${inner} 0 ${large} 0 ${point(inner,start)}Z`;
}
const short = value => escape(String(value).slice(0,8));
const pageSize = 3;
const roomToken = room => encodeURIComponent(room.key);

export class CircuitsPanel {
  constructor(panel) { this.panel = panel; }

  load() {
    if (!this.panel.ha?.callWS || Date.now() < (this.retryAt ?? 0) || this.loading) return;
    this.loading = true;
    const types = ['floor','area','entity','device','label'];
    Promise.all(types.map(type=>this.panel.ha.callWS({type:`config/${type}_registry/list`})))
      .then(([floors,areas,entities,devices,labels])=>{
        this.registryError = false;
        this.registry = {floors,areas,entities,devices,labels};
        this.retryAt = Date.now()+60000;
      })
      .catch(()=>{ this.registryError = true; this.retryAt = Date.now()+60000; })
      .finally(()=>{ this.loading = false; this.panel.render(); });
  }

  structure() {
    this.load();
    const config = this.panel.config?.circuits ?? {};
    const states = this.panel.ha?.states ?? {};
    const {floors=[],areas=[],entities=[],devices=[],labels=[]} = this.registry ?? {};
    const index = (list,key) => new Map(list.map(item=>[item[key],item]));
    const floorsById = index(floors,'floor_id');
    const areasById = index(areas,'area_id');
    const entries = index(entities,'entity_id');
    const devicesById = index(devices,'id');
    const labelIds = new Map(labels.map(label=>[label.label_id,normalize(label.name)]));
    const hasLabel = (entry,device,name) => [entry,device].some(item=>
      item?.labels?.some(id=>(labelIds.get(id) ?? normalize(id))===name));
    const sensorsByDevice = new Map();
    for (const entry of entities) {
      if (!entry.device_id || entry.disabled_by || states[entry.entity_id]?.attributes?.device_class !== 'power') continue;
      if (!sensorsByDevice.has(entry.device_id)) sensorsByDevice.set(entry.device_id,[]);
      sensorsByDevice.get(entry.device_id).push(entry.entity_id);
    }
    const configured = Object.keys(states).filter(id=>/^switch\./.test(id) || config.includeLights !== false && /^light\./.test(id));
    const ids = config.selectionSaved || config.include?.length ? config.include ?? [] : configured;
    const groups = new Map();
    for (const id of ids) {
      const state = states[id];
      const entry = entries.get(id);
      const device = devicesById.get(entry?.device_id);
      if (!config.selectionSaved && config.labelOnly && !hasLabel(entry,device,'stromkreis')) continue;
      const area = areasById.get(entry?.area_id ?? device?.area_id);
      const floor = floorsById.get(area?.floor_id);
      const floorName = floor?.name ?? 'Ohne Etage';
      const roomName = area?.name ?? 'Ohne Raum';
      if (!groups.has(floorName)) groups.set(floorName,new Map());
      const rooms = groups.get(floorName);
      if (!rooms.has(roomName)) rooms.set(roomName,[]);
      const on = state?.state === 'on';
      const sensorId = config.power?.[id] ?? (sensorsByDevice.get(entry?.device_id)?.length === 1
        ? sensorsByDevice.get(entry.device_id)[0] : undefined);
      const sensor = states[sensorId];
      const raw = sensor?.state?.trim() ? Number(sensor.state) : NaN;
      const power = Number.isFinite(raw) ? Math.max(0,raw)*(sensor.attributes.unit_of_measurement==='kW'?1000:1) : NaN;
      rooms.get(roomName).push({
        id, name:state?.attributes?.friendly_name ?? entry?.name ?? id,
        on, power, available: ['on','off'].includes(state?.state),
        protected: config.protected?.includes(id) || hasLabel(entry,device,'geschuetzt'),
      });
    }
    return [...groups].map(([name,rooms],i)=>({
      name, color:colors[i%colors.length], rooms:[...rooms].map(([room,items])=>({
        name:room, key:JSON.stringify([name,room]), items,
      })),
    }));
  }

  view() {
    const floors = this.structure();
    const rooms = floors.flatMap(floor=>floor.rooms);
    const all = rooms.flatMap(room=>room.items);
    const selected = rooms.find(room=>room.key===this.room) ?? rooms[0];
    const floor = floors.find(entry=>entry.rooms.includes(selected));
    const selectedKey = selected ? roomToken(selected) : '';
    const canSwitch = Boolean(this.registry && this.panel.ha?.connection?.connected !== false);
    const hasSwitchableOn = all.some(item=>item.on && !item.protected);
    const locked = all.filter(item=>item.protected);
    const top = all.filter(item=>item.power>0).sort((a,b)=>b.power-a.power).slice(0,5);
    const armed = Date.now() < (this.confirmUntil ?? 0);
    const normalizedPage = Math.min(this.page ?? 0,Math.max(0,Math.ceil((selected?.items.length ?? 0)/pageSize)-1));
    const sequence = this.wheel(floors,selected,all);
    const band = (title,color,info='') => `<div class="ops-heading" style="--card-color:${color}"><h2>${escape(title)}</h2><i></i>${info?`<b>${escape(info)}</b>`:''}</div>`;
    return {
      status: `Stromkreise · ${onCount(all)} von ${all.length} an · ${format(total(all))}${locked.length?' · Geschützt: '+locked.map(item=>item.name).join(', '):''}`,
      layout:`<div class="circuits-page"><section class="circuits-map">${sequence}
      <div class="circuits-floors">${floors.map(entry=>{
        const items=entry.rooms.flatMap(room=>room.items);
        return `<button data-action="circuit-room:${roomToken(entry.rooms[0])}" style="--floor:${entry.color}">
          <small>${escape(entry.name)} · ${onCount(items)} an</small><strong>${format(total(items))}</strong></button>`;
      }).join('')}</div>
      <div class="circuits-global"><button data-action="circuit-all-off" ${!hasSwitchableOn || !canSwitch?'disabled':''} class="${armed?'alarm':''}">
        ${armed?'Alles aus bestätigen':'Alles aus · Standby-Killer'}</button><span>${locked.length?'🔒 '+escape(locked.map(item=>item.name).join(' · ')):'Keine geschützten Stromkreise'}</span></div>
      </section><section class="circuits-detail">
      ${band(selected?'Sektor '+selected.name:'Stromkreise',floor?.color ?? colors[0],floor?.name)}
      ${selected?`<div class="circuits-totals"><strong>${format(total(selected.items))}</strong><span>${selected.items.length} Kreise · ${onCount(selected.items)} an</span></div>
      <div class="circuits-items" style="--floor:${floor.color}">${selected.items.slice(normalizedPage*pageSize,(normalizedPage+1)*pageSize).map(item=>
        `<div class="circuit-row ${item.on?'on':''} ${item.protected?'protected':''}">
          <button data-action="circuit-toggle:${selectedKey}:${item.id}" ${item.protected || !item.available || !canSwitch?'disabled':''}>${escape(item.name)}</button>
          <span class="circuit-flow"><i style="--load:${Math.min(100,(item.power||0)/Math.max(1,...selected.items.map(value=>value.power || 0))*100)}%;--speed:${Math.max(.25,1.6-(item.power||0)/60)}s"></i></span>
          <strong>${format(item.power)}</strong><b>${item.protected?'🔒 ':''}${item.available?(item.on?'An':'Aus'):'Offline'}</b></div>`).join('')}</div>
      ${selected.items.length>pageSize?`<div class="circuits-paging"><button data-action="circuit-paging:${normalizedPage-1}" ${normalizedPage===0?'disabled':''}>‹</button>
         <span>${normalizedPage+1} / ${Math.ceil(selected.items.length/pageSize)}</span>
         <button data-action="circuit-paging:${normalizedPage+1}" ${(normalizedPage+1)*pageSize>=selected.items.length?'disabled':''}>›</button></div>`:''}
      <div class="circuits-off"><button data-action="circuit-room-off:${selectedKey}" ${!canSwitch || !selected.items.some(item=>item.on&&!item.protected)?'disabled':''}>Raum aus</button>
       <button data-action="circuit-floor-off:${selectedKey}" ${!canSwitch || !floor.rooms.some(room=>room.items.some(item=>item.on&&!item.protected))?'disabled':''}>Etage aus</button></div>`:''}
      ${!this.registry?`<small>${this.registryError?'HA-Registry nicht erreichbar · Schalten gesperrt':'Lade Bereiche und Schutzkennzeichnungen …'}</small>`:''}
      ${band('Top-Verbraucher',colors[0],'Live')}
      <div class="circuits-top">${top.map((item,rank)=>{
        const room=rooms.find(room=>room.items.includes(item));
        return `<button data-action="circuit-room:${roomToken(room)}"><b>${rank+1}</b><span>${escape(room.name)} · ${escape(item.name)}</span>
          <i style="--load:${item.power/top[0].power*100}%"></i><strong>${format(item.power)}</strong></button>`;
      }).join('') || '<small>Keine gemessene Last</small>'}</div>
      </section></div>`,
    };
  }

  wheel(floors,selected,all) {
    const step = 360/floors.length;
    const ring = floors.map((floor,i)=>{
      const roomWidth = step/floor.rooms.length;
      const start = i*step;
      return `<path data-action="circuit-room:${roomToken(floor.rooms[0])}" fill="${floor.color}" d="${sector(83,117,start+Math.min(.75,step/4),start+step-Math.min(.75,step/4))}"/>
        ${floor.rooms.map((room,j)=>{
          const a = start+j*roomWidth;
          const b = a+roomWidth;
          const roomIndex = roomToken(room);
          const angle = (a+b)/2;
          const [x,y] = point(149,angle);
          const [lineX,lineY] = point(218,angle);
          return `<path data-action="circuit-room:${roomIndex}" fill="${room===selected?'#ffcc99':floor.color}" opacity="${room===selected?1:.55}"
             d="${sector(121,179,a+Math.min(.4,roomWidth/4),b-Math.min(.4,roomWidth/4))}"/><text x="${x}" y="${y}" class="circuit-sector-label">${short(room.name)}</text>
             <text x="${x}" y="${y+12}" class="circuit-sector-load">${format(total(room.items))}</text>
             ${room.items.map((item,k)=>{
               const width=roomWidth/room.items.length;
               const gap=Math.min(.25,width/4);
               return `<path data-action="circuit-toggle:${roomIndex}:${item.id}" class="${item.on?'circuit-live':''}" fill="${item.on?(item.protected?'#99ccff':'#ffcc99'):'#262626'}"
                 d="${sector(183,213,a+k*width+gap,a+(k+1)*width-gap)}"/>`;
             }).join('')}
             ${room===selected?`<path fill="#ffcc99" d="${sector(218,222,a+Math.min(.25,roomWidth/4),b-Math.min(.25,roomWidth/4))}"/>
               <line x1="250" y1="250" x2="${lineX}" y2="${lineY}" class="circuit-lead"/>`:''}`;
        }).join('')}`;
    }).join('');
    return `<svg class="circuits-wheel" viewBox="0 0 500 500" aria-label="Sektorenscheibe">
      <circle cx="250" cy="250" r="237" fill="none" stroke="#37364a" stroke-width="5" stroke-dasharray="10 5 2 5" class="circuit-outer"/>
      <circle cx="250" cy="250" r="246" fill="none" stroke="#656173" stroke-width="2" stroke-dasharray="2 11"/>
      ${ring}
      <circle cx="250" cy="250" r="73" fill="#000" stroke="#ff995f" stroke-width="4"/>
      <circle cx="250" cy="250" r="63" fill="none" stroke="#cd9bd0" stroke-dasharray="13 6" class="circuit-inner"/>
      <text x="250" y="228" class="circuit-home">Haus</text>
      <text x="250" y="260" class="circuit-watts">${format(total(all))}</text>
      <text x="250" y="285" class="circuit-home">${onCount(all)} / ${all.length} an</text></svg>`;
  }

  async act(action, args) {
    const floors = this.structure();
    const rooms = floors.flatMap(floor=>floor.rooms);
    const room = rooms.find(entry => roomToken(entry) === args[0]);
    if (action === 'room' && room) {
      this.room = room.key;
      this.page = 0;
      this.confirmUntil = 0;
      return;
    }
    if (action === 'paging') { this.page = Math.max(0,Number(args[0])); return; }
    if (!this.registry || this.panel.ha?.connection?.connected === false) return;
    if (action === 'toggle' && room) {
      const item = room.items.find(entry => entry.id === args[1]);
      if (!item?.available || item.protected) return;
      this.room = room.key;
      await this.panel.call(item.id,'toggle');
      return;
    }
    if (action === 'all-off' && Date.now() >= (this.confirmUntil ?? 0)) {
      this.confirmUntil = Date.now()+3000;
      return;
    }
    const targets = action === 'all-off' ? rooms : action === 'floor-off'
      ? floors.find(floor=>floor.rooms.includes(room))?.rooms : action === 'room-off' && room ? [room] : [];
    this.confirmUntil = 0;
    const ids = (targets ?? []).flatMap(target=>target.items).filter(item=>item.on && !item.protected).map(item=>item.id);
    await Promise.all(['switch','light'].map(domain=>{
      const entity_id = ids.filter(id=>id.startsWith(domain+'.'));
      return entity_id.length ? this.panel.ha.callService(domain,'turn_off',{entity_id}) : null;
    }));
  }
}
