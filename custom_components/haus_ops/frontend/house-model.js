export const normalizeHouseName = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const houseTemperatureColor = value => !Number.isFinite(value) ? '#777' : value < 19 ? '#99ccff' : value <= 20.5 ? '#9999ff' : '#ff9966';
export function houseLampType(name, fallback='decke') {
  const normalized=normalizeHouseName(name);
  if (normalized.includes('wzfernseh')) return 'kommode';
  if (normalized.includes('shellyeztisch')) return 'decke';
  if (normalized.includes('stehlampe')) return 'stehlampe';
  if (normalized.includes('fado')) return 'kugel';
  if (normalized.includes('schrank')) return 'schrank';
  if (normalized.includes('stripe') || normalized.includes('strip') || normalized.includes('rope')) return 'streifen';
  return fallback;
}
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : NaN;
const validNumber = state => state && !['unknown','unavailable',''].includes(state.state?.trim()) && Number.isFinite(Number(state.state));

export function validateHouseConfig(config) {
  if (!Array.isArray(config?.rooms) || !config.rooms.length || config.rooms.length > 20) throw Error('Hausschnitt: Raumliste fehlt oder ist zu groß.');
  const keys = new Set();
  const point = value => Array.isArray(value) && value.length===2 && value.every(v=>Number.isFinite(v) && v>=0 && v<=1280);
  for (const room of config.rooms) {
    if (['__proto__','constructor','prototype'].includes(room.key) || !/^[a-z0-9_-]+$/.test(room.key) || keys.has(room.key) || !['left','right'].includes(room.side) || ![0,1,2,3].includes(room.floor) || !point(room.anchor) || !Array.isArray(room.polygon) || room.polygon.length<3 || !room.polygon.every(point)) throw Error('Hausschnitt: Ungültige Raumgeometrie.');
    keys.add(room.key);
    if (room.temperature_entity && !/^sensor\.[a-z0-9_]+$/.test(room.temperature_entity)) throw Error('Hausschnitt: Ungültiger Temperatursensor.');
    for (const lamp of room.lamps ?? []) {
      if (!['decke','stehlampe','streifen','kugel','schrank','spot','kommode'].includes(lamp.type) || !point(lamp.position) || lamp.entity_id && !/^(light|switch)\.[a-z0-9_]+$/.test(lamp.entity_id)) throw Error('Hausschnitt: Ungültige Lampenzuordnung.');
    }
  }
  return config;
}

export function resolveHouseData(config, registry = {}, states = {}, connected = true, temperatureOverrides = {}) {
  const {areas=[],floors=[],entities=[],devices=[],labels=[]} = registry;
  const deviceMap = new Map(devices.map(item=>[item.id,item]));
  const entries = new Map(entities.map(item=>[item.entity_id,item]));
  const areaFor = entry => entry?.area_id ?? deviceMap.get(entry?.device_id)?.area_id;
  const labelMap = new Map(labels.map(label=>[label.label_id,normalizeHouseName(label.name)]));
  const temperature = id => {
    const source = states[id];
    if (!validNumber(source)) return NaN;
    const value = Number(source.state);
    return source.attributes?.unit_of_measurement==='°F' ? (value-32)*5/9 : value;
  };
  const rooms = config.rooms.map(room=>{
    const aliases = new Set([room.name,...(room.aliases ?? [])].map(normalizeHouseName));
    const matches = room.area_ids?.length ? areas.filter(area=>room.area_ids.includes(area.area_id))
      : areas.filter(area=>aliases.has(normalizeHouseName(area.name)));
    const ids = new Set(matches.map(area=>area.area_id));
    const assigned = entities.filter(entry=>!entry.disabled_by && ids.has(areaFor(entry)));
    const candidates = assigned.filter(entry=>entry.entity_id.startsWith('sensor.') && (states[entry.entity_id]?.attributes?.device_class==='temperature' || ['°C','°F'].includes(states[entry.entity_id]?.attributes?.unit_of_measurement)));
    // Prefer environmental temperature suffixes over incidental device temperature readings.
    const environmental = candidates.filter(entry=>/(_temperature|_temperatur|_temp)$/.test(entry.entity_id));
    const sources = room.temperature_entity ? [room.temperature_entity] : (environmental.length ? environmental : candidates).map(entry=>entry.entity_id);
    const values = sources.map(temperature).filter(Number.isFinite);
    const namedSources = Object.keys(states).filter(id=>id.startsWith('sensor.') && validNumber(states[id]) && ['°C','°F'].includes(states[id].attributes?.unit_of_measurement) && [...aliases].some(alias=>{
      const name=normalizeHouseName(states[id].attributes?.friendly_name);
      const entityName=normalizeHouseName(id.split('.')[1]);
      return [alias+'temperatur',alias+'temperature',alias+'temp','temperatur'+alias,'temperature'+alias].some(expected=>name===expected || entityName===expected);
    }));
    const current = room.temperature_entity ? mean(values) : Number.isFinite(temperatureOverrides[room.key]) ? temperatureOverrides[room.key]
      : values.length ? mean(values) : mean(namedSources.map(temperature).filter(Number.isFinite));
    const explicit = new Set((room.lamps ?? []).map(lamp=>lamp.entity_id).filter(Boolean));
    const assignedNames = new Set(assigned.map(entry=>normalizeHouseName(states[entry.entity_id]?.attributes?.friendly_name)));
    const segmentOfParent = entry => {
      const name=states[entry.entity_id]?.attributes?.friendly_name ?? '';
      const parent=name.replace(/[ _-]+segment[ _-]*\d+$/i,'');
      return parent!==name && assignedNames.has(normalizeHouseName(parent));
    };
    const candidatesForLight = assigned.filter(entry=>{
      if (entry.entity_category || segmentOfParent(entry)) return false;
      if (entry.entity_id.startsWith('light.')) return true;
      return entry.entity_id.startsWith('switch.') && [...(entry.labels ?? []),...(deviceMap.get(entry.device_id)?.labels ?? [])].some(id=>(labelMap.get(id) ?? normalizeHouseName(id))==='licht');
    });
    const physicalIds = new Set(candidatesForLight.map(entry=>entry.entity_id));
    const discoveredLampIds = [...new Set([...candidatesForLight.filter(entry=>{
      const members=states[entry.entity_id]?.attributes?.entity_id;
      return !Array.isArray(members) || !members.some(id=>physicalIds.has(id));
    }).map(entry=>entry.entity_id),...explicit])].sort();
    const lampIds = Array.isArray(room.light_entities) ? [...new Set(room.light_entities)].filter(id=>/^(light|switch)\.[a-z0-9_]+$/.test(id)) : discoveredLampIds;
    const used = new Set();
    const reserved = new Map(), reservedSlots = new Set();
    for (const id of lampIds) {
      const name=normalizeHouseName(states[id]?.attributes?.friendly_name ?? entries.get(id)?.name ?? id.split('.')[1]);
      const slot=(room.lamps ?? []).find(slot=>slot.entity_id===id) ?? (room.lamps ?? []).find(slot=>!reservedSlots.has(slot) && !slot.entity_id && (slot.aliases ?? []).some(alias=>normalizeHouseName(alias)===name));
      if (slot) {reserved.set(id,slot);reservedSlots.add(slot);}
    }
    const lamps = lampIds.map((id,index)=>{
      const state = states[id];
      const entry = entries.get(id);
      const name = state?.attributes?.friendly_name ?? entry?.name ?? id.split('.')[1];
      let slot = reserved.get(id);
      slot ??= (room.lamps ?? []).find(item=>!used.has(item) && !reservedSlots.has(item) && !item.entity_id);
      if (slot) used.add(slot);
      const xs=room.polygon.map(p=>p[0]), ys=room.polygon.map(p=>p[1]);
      const x = Math.min(...xs)+16+(index%4)*(Math.max(...xs)-Math.min(...xs)-32)/Math.min(3,Math.max(1,lampIds.length-1));
      const type = room.outdoor && /spots?/i.test(name) ? 'spot' : houseLampType(name,slot?.type ?? 'decke');
      const position = [...(slot?.position ?? [x,Math.min(...ys)+12+Math.floor(index/4)*24])];
      if (type==='kugel' && slot?.type!=='kugel') position[1]=Math.max(...ys)-30;
      if (!room.outdoor && type==='kommode') position[1]=Math.max(...ys)-22;
      if (!room.outdoor && type==='stehlampe') position[1]=Math.max(...ys)-30;
      if (normalizeHouseName(name).includes('shellyeztisch')) position[1]=Math.min(...ys)+10;
      const available = connected && ['on','off'].includes(state?.state);
      const on = available && state.state==='on';
      const brightness = on ? Number.isFinite(state.attributes?.brightness) ? Math.max(0,Math.min(100,state.attributes.brightness/255*100)) : 100 : 0;
      const dim = state?.attributes?.supported_color_modes?.some(mode=>!['onoff','unknown'].includes(mode));
      if (room.outdoor && type==='kugel') {position[0]=150;position[1]=636;}
      if (room.outdoor && type==='spot') {position[0]=275;position[1]=638;}
      return {id,name,type,position,outdoor:!!room.outdoor,on,available,brightness,dim};
    });
    const areaFloors = [...new Set(matches.map(area=>floors.find(floor=>floor.floor_id===area.floor_id)?.level).filter(level=>[0,1,2,3].includes(level)))];
    const floor = areaFloors.length===1 ? areaFloors[0] : room.floor;
    return {...room,floor,matched:matches.length>0 || Boolean(room.temperature_entity && states[room.temperature_entity]) || [...explicit].some(id=>states[id]),temperature:current,temperatureSources:sources,lamps,
      glow:Math.min(.38,lamps.reduce((sum,lamp)=>sum+lamp.brightness/100,0)*.13)};
  });
  const allLamps = [...new Map(rooms.flatMap(room=>room.lamps).map(lamp=>[lamp.id,lamp])).values()];
  const floorData = [3,2,1,0].map(level=>{
    const members=rooms.filter(room=>!room.outdoor && room.floor===level);
    const lamps=[...new Map(members.flatMap(room=>room.lamps).map(lamp=>[lamp.id,lamp])).values()];
    return {level,temperature:mean(members.map(room=>room.temperature).filter(Number.isFinite)),lamps};
  });
  return {rooms,floors:floorData,lamps:allLamps,active:allLamps.filter(lamp=>lamp.on).length,
    inside:mean(rooms.filter(room=>!room.outdoor && room.floor!==3).map(room=>room.temperature).filter(Number.isFinite)),
    roof:rooms.find(room=>room.key==='roof')?.temperature ?? NaN};
}
