// Registry keys follow Home Assistant's Tesla Fleet entity descriptions.
const spec=(key,label,domains,sources)=>({key,label,domains,sources:Array.isArray(sources)?sources:[sources]});
export const vehicleFields=[
 spec('battery','Akku · Ladestand',['sensor'],'charge_state_battery_level'),spec('range','Akku · Reichweite',['sensor'],'charge_state_battery_range'),spec('limit','Ladelimit',['number'],'charge_state_charge_limit_soc'),
 spec('charging','Ladestatus',['sensor'],'charge_state_charging_state'),spec('charge','Laden · Schalter',['switch'],['charge_state_user_charge_enable_request','charge_state_charging_state']),spec('power','Ladeleistung',['sensor'],'charge_state_charger_power'),spec('voltage','Ladespannung',['sensor'],'charge_state_charger_voltage'),spec('current','Ladestrom',['sensor'],'charge_state_charger_actual_current'),spec('phases','Ladephasen',['sensor','binary_sensor'],'charge_state_charger_phases'),spec('energy','Geladene Energie',['sensor'],'charge_state_charge_energy_added'),spec('full','Voll geladen um / Restzeit',['sensor'],'charge_state_minutes_to_full_charge'),spec('cable','Ladekabel angeschlossen',['binary_sensor','sensor'],'charge_state_conn_charge_cable'),spec('charge_port','Ladeklappe',['cover'],'charge_state_charge_port_door_open'),
 spec('inside','Innentemperatur',['sensor'],'climate_state_inside_temp'),spec('outside','Außentemperatur',['sensor'],'climate_state_outside_temp'),spec('climate','Fahrzeugklima',['climate'],['driver_temp','climate']),spec('seat_left','Sitzheizung links',['select'],'climate_state_seat_heater_left'),spec('seat_right','Sitzheizung rechts',['select'],'climate_state_seat_heater_right'),spec('steering','Lenkradheizung',['select','switch'],'climate_state_steering_wheel_heat_level'),spec('preconditioning','Vorklimatisierung',['binary_sensor'],'climate_state_is_preconditioning'),
 spec('lock','Türschloss',['lock'],'vehicle_state_locked'),spec('sentry','Wächtermodus',['switch'],'vehicle_state_sentry_mode'),spec('dashcam','Dashcam',['binary_sensor'],'vehicle_state_dashcam_state'),spec('present','Fahrer anwesend',['binary_sensor'],'vehicle_state_is_user_present'),spec('frunk','Frunk',['cover'],'vehicle_state_ft'),spec('trunk','Kofferraum',['cover'],'vehicle_state_rt'),spec('windows','Fenster · gemeinsamer Cover',['cover'],'windows'),
 ...[['fl','Vorne links','df','fd'],['fr','Vorne rechts','pf','fp'],['rl','Hinten links','dr','rd'],['rr','Hinten rechts','pr','rp']].flatMap(([key,label,door,window])=>[spec('door_'+key,'Tür · '+label,['binary_sensor'],'vehicle_state_'+door),spec('window_'+key,'Fenster · '+label,['binary_sensor'],'vehicle_state_'+window+'_window'),spec('tire_'+key,'Reifendruck · '+label,['sensor'],'vehicle_state_tpms_pressure_'+key),spec('tire_warning_'+key,'Reifendruckwarnung · '+label,['binary_sensor'],'vehicle_state_tpms_soft_warning_'+key)]),
 spec('odometer','Kilometerstand',['sensor'],'vehicle_state_odometer'),spec('gear','Gang',['sensor'],'drive_state_shift_state'),spec('speed','Geschwindigkeit',['sensor'],'drive_state_speed'),spec('location','Standort · Zone',['device_tracker'],'location'),spec('destination','Navigationsziel',['sensor'],'drive_state_active_route_destination'),spec('distance','Entfernung zum Ziel',['sensor'],'drive_state_active_route_miles_to_arrival'),spec('arrival_battery','Akku bei Ankunft',['sensor'],'drive_state_active_route_energy_at_arrival'),spec('route','Navigation · Route',['device_tracker'],'route'),spec('software','Software / Update',['update'],['vehicle_state_software_update_status','update']),spec('online','Fahrzeug wach',['binary_sensor'],'state'),spec('wake','Aufwecken',['button'],'wake'),spec('flash','Lichthupe',['button'],'flash_lights')
];
export const normalizeVehicleName=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const vehicleAvailable=s=>!!s&&!['unknown','unavailable',''].includes(String(s.state??'').trim());
export function vehicleNumber(s){if(!vehicleAvailable(s))return NaN;const n=Number(s.state);return Number.isFinite(n)?n:NaN;}
export function discoverVehicle(registry={},config={}){
 const entries=(registry.entities??[]).filter(e=>e.platform==='tesla_fleet');
 const ids=[...new Set(entries.filter(e=>e.entity_id.startsWith('sensor.')&&(e.unique_id?.endsWith('-charge_state_battery_level')||e.translation_key==='charge_state_battery_level')).map(e=>e.device_id).filter(Boolean))];
 const model3=ids.filter(id=>/model3/.test(normalizeVehicleName((registry.devices??[]).find(d=>d.id===id)?.model)));
 const choices=model3.length?model3:ids;
 const deviceId=config.device || (choices.length===1?choices[0]:undefined);
 const device=(registry.devices??[]).find(d=>d.id===deviceId);
 const found={};
 for(const f of vehicleFields){if(config[f.key]){found[f.key]=config[f.key];continue;}const matches=entries.filter(e=>deviceId&&e.device_id===deviceId&&!e.disabled_by&&f.domains.includes(e.entity_id.split('.')[0])&&f.sources.some(key=>e.unique_id?.endsWith('-'+key)||e.translation_key===key));matches.sort((a,b)=>f.domains.indexOf(a.entity_id.split('.')[0])-f.domains.indexOf(b.entity_id.split('.')[0]));if(matches.length)found[f.key]=matches[0].entity_id;}
 return {device,deviceId,bindings:found,ambiguous:choices.length>1&&!config.device};
}
export function pressureBar(s){const n=vehicleNumber(s),u=String(s?.attributes?.unit_of_measurement??'bar').toLowerCase();return u==='psi'?n/14.5037738:u==='kpa'?n/100:u==='mpa'?n*10:n;}
export function vehicleTemperature(s){const n=vehicleNumber(s),u=s?.attributes?.unit_of_measurement;return u==='°F'?(n-32)*5/9:u==='K'?n-273.15:n;}
export function distanceKm(s){const n=vehicleNumber(s);return /^(mi|mph)$/.test(s?.attributes?.unit_of_measurement??'')?n*1.609344:n;}
export function aggregateOpen(readings){if(!readings.length)return undefined;const known=readings.map(s=>vehicleAvailable(s)?['on','open','opening'].includes(s.state):undefined);return known.some(v=>v===true)?true:known.every(v=>v===false)?false:undefined;}
export function remainingChargeHours(s,now=Date.now()){
 if(!vehicleAvailable(s))return NaN;
 if(s.attributes?.device_class==='timestamp'||/^\d{4}-\d\d-\d\dT/.test(s.state)){const end=Date.parse(s.state);return Number.isFinite(end)?Math.max(0,(end-now)/3600000):NaN;}
 const n=vehicleNumber(s),unit=s.attributes?.unit_of_measurement;return unit==='min'?n/60:unit==='s'?n/3600:n;
}
export function nextChargeLimit(s){const n=vehicleNumber(s);if(!Number.isFinite(n))return null;const min=Math.max(50,Number(s.attributes?.min)||0),max=Math.min(100,Number(s.attributes?.max)||100);if(min>max)return null;const value=n+10;return Math.min(max,Math.max(min,value>max?min:value));}
export function maskedVehicleVIN(device){const vin=(device?.identifiers??[]).map(pair=>String(pair[1])).find(v=>/^[A-HJ-NPR-Z0-9]{17}$/i.test(v));return vin?'···'+vin.slice(-4):'—';}
export function validateVehicleBlueprint(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Fahrzeug: JSON-Objekt erforderlich.');
 const image=value.image;if(!image||!['x','y','width','height'].every(k=>Number.isFinite(image[k])&&image[k]>=0&&image[k]<=1600)||image.width<100||image.height<100)throw Error('Fahrzeugbild: gültige Position und Größe erforderlich.');
 if(typeof image.src!=='string'||!(/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(image.src)||/^\/(local|haus_ops_static)\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$/i.test(image.src))||image.src.includes('..'))throw Error('Fahrzeugbild muss eine lokale Bilddatei sein.');
 if(!Array.isArray(value.leaders)||value.leaders.length>20||value.leaders.some(l=>!['left','right'].includes(l.side)||!['textY','bendX','x','y'].every(k=>Number.isFinite(l[k])&&l[k]>=0&&l[k]<=1280)||typeof l.key!=='string'||! /^[a-z_]{1,40}$/.test(l.key)||typeof l.name!=='string'||l.name.length>80||!/^#[0-9a-f]{6}$/i.test(l.color)))throw Error('Ungültige Fahrzeug-Leitungen.');
 if(!Array.isArray(value.specs)||value.specs.length>8||value.specs.some(row=>!Array.isArray(row)||row.length!==2||row.some(v=>typeof v!=='string'||v.length>80)))throw Error('Fahrzeug-Eckdaten: maximal acht Textpaare erforderlich.');
 for(const [key,id] of Object.entries(value.entities??{})){const field=vehicleFields.find(f=>f.key===key);if(!field||typeof id!=='string'||! /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id)||!field.domains.includes(id.split('.')[0]))throw Error('Fahrzeug: ungültige Entitätszuordnung für '+key);}
 return value;
}
