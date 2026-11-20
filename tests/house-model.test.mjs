import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveHouseData,validateHouseConfig,houseTemperatureColor,houseLampType,houseWasher} from '../custom_components/haus_ops/frontend/house-model.js';
const config=JSON.parse(fs.readFileSync(new URL('../custom_components/haus_ops/frontend/house-section.json',import.meta.url)));
const registry={areas:[{area_id:'wz',name:'Wohnzimmer',floor_id:'eg'},{area_id:'roof',name:'Dachspitz',floor_id:'roof'}],floors:[{floor_id:'eg',level:0},{floor_id:'roof',level:3}],devices:[{id:'lamp-device',area_id:'wz'}],labels:[{label_id:'light-label',name:'Licht'}],entities:[
  {entity_id:'sensor.wz_temp',area_id:'wz'}, {entity_id:'sensor.roof_temperature',area_id:'roof'},
  {entity_id:'light.fado',device_id:'lamp-device'}, {entity_id:'switch.licht',area_id:'wz',labels:['light-label']},
  {entity_id:'switch.power',area_id:'wz'}, {entity_id:'light.offline',area_id:'wz'},
]};
const states={'sensor.wz_temp':{state:'68',attributes:{device_class:'temperature',unit_of_measurement:'°F'}},'sensor.inverter_interne_temperatur':{state:'53.6',attributes:{unit_of_measurement:'°F'}},'sensor.roof_temperature':{state:'12',attributes:{device_class:'temperature'}},'light.fado':{state:'on',attributes:{friendly_name:'Fado WZ',brightness:128,supported_color_modes:['brightness']}},'switch.licht':{state:'off',attributes:{friendly_name:'Lichtschalter'}},'switch.power':{state:'on',attributes:{}},'light.offline':{state:'unavailable',attributes:{friendly_name:'Offline'}}};
test('Default house has nine valid rooms and four floors',()=>{assert.equal(validateHouseConfig(config).rooms.length,9);assert.deepEqual([...new Set(config.rooms.map(r=>r.floor))].sort(),[0,1,2,3]);});
test('Area temperature and Fahrenheit conversion',()=>{assert.equal(resolveHouseData(config,registry,states).rooms.find(r=>r.key==='living').temperature,20);});
test('Only lights and switches carrying the licht label are included',()=>{const ids=resolveHouseData(config,registry,states).lamps.map(l=>l.id);assert.ok(ids.includes('light.fado'));assert.ok(ids.includes('switch.licht'));assert.ok(!ids.includes('switch.power'));});
test('Roof temperature is excluded from inside mean',()=>{const data=resolveHouseData(config,registry,states);assert.equal(data.roof,12);assert.equal(data.inside,20);});
test('Dimming controls the room glow',()=>{const room=resolveHouseData(config,registry,states).rooms.find(r=>r.key==='living');assert.equal(room.lamps.find(l=>l.id==='light.fado').brightness,128/255*100);assert.equal(room.glow,128/255*.13);});
test('Unavailable lamps never turn on or illuminate a room',()=>{const lamp=resolveHouseData(config,registry,states).lamps.find(l=>l.id==='light.offline');assert.equal(lamp.available,false);assert.equal(lamp.on,false);assert.equal(lamp.brightness,0);});
test('Known lamp aliases keep their configured geometry',()=>{const lamp=resolveHouseData(config,registry,states).lamps.find(l=>l.id==='light.fado');assert.deepEqual(lamp.position,[678,600]);});
test('No guessed temperatures or lamps without HA areas',()=>{const data=resolveHouseData(config,{},{});assert.deepEqual(data.lamps.map(l=>l.id),['switch.schreibtisch','light.sz_fado']);assert.ok(data.lamps.every(l=>!l.available));assert.ok(Number.isNaN(data.inside));assert.ok(data.rooms.every(r=>Number.isNaN(r.temperature)&&!r.matched));});
test('Disconnected HA disables all light controls',()=>{assert.ok(resolveHouseData(config,registry,states,false).lamps.every(l=>!l.available));});
test('Temperature colors use the specified boundaries',()=>{assert.equal(houseTemperatureColor(18.9),'#99ccff');assert.equal(houseTemperatureColor(19),'#9999ff');assert.equal(houseTemperatureColor(20.5),'#9999ff');assert.equal(houseTemperatureColor(20.6),'#ff9966');assert.equal(houseTemperatureColor(NaN),'#777');});
test('Unsafe geometry is rejected',()=>{assert.throws(()=>validateHouseConfig({...config,rooms:[{...config.rooms[0],key:'"><script>'}]}));});
test('Entity area assignment takes precedence over device assignment',()=>{const altered={...registry,entities:registry.entities.map(e=>e.entity_id==='light.fado'?{...e,area_id:'roof'}:e)};const data=resolveHouseData(config,altered,states);assert.ok(!data.rooms.find(r=>r.key==='living').lamps.some(l=>l.id==='light.fado'));assert.ok(data.rooms.find(r=>r.key==='roof').lamps.some(l=>l.id==='light.fado'));});
test('Floor status has ten distinct segment positions and a box for each lamp',async()=>{
  const {HouseSection}=await import('../custom_components/haus_ops/frontend/house-section.js');
  const panel={demo:true};const house=new HouseSection(panel);house.config=config;
  const data=house.data(), svg=house.build(data);
  const xs=[...svg.matchAll(/data-house-floor-temp="0"[^>]*?x="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(xs.length,10);assert.equal(new Set(xs).size,10);
  assert.equal([...svg.matchAll(/data-house-floor-lamp="0"/g)].length,data.floors.find(f=>f.level===0).lamps.length);
});
test('Segment children, diagnostic LEDs and duplicate groups do not clutter the drawing',()=>{
 const more={...registry,entities:[...registry.entities,{entity_id:'light.parent',area_id:'wz'},{entity_id:'light.segment',area_id:'wz'},{entity_id:'light.led',area_id:'wz',entity_category:'config'},{entity_id:'light.group',area_id:'wz'}]};
 const moreStates={...states,'light.parent':{state:'on',attributes:{friendly_name:'Glide Hexa'}},'light.segment':{state:'on',attributes:{friendly_name:'Glide Hexa Segment 001'}},'light.led':{state:'on',attributes:{friendly_name:'AP LED'}},'light.group':{state:'on',attributes:{entity_id:['light.parent']}}};
 const ids=resolveHouseData(config,more,moreStates).lamps.map(l=>l.id);assert.ok(ids.includes('light.parent'));assert.ok(!ids.includes('light.segment'));assert.ok(!ids.includes('light.led'));assert.ok(!ids.includes('light.group'));
});
test('Configured room temperature overrides incidental area readings',()=>{assert.equal(resolveHouseData(config,registry,states,true,{living:21.2}).rooms.find(r=>r.key==='living').temperature,21.2);});
test('Per-room text selections replace discovery and allow ordinary switches',()=>{
 const selected={...config,rooms:config.rooms.map(r=>r.key==='living'?{...r,light_entities:['switch.power']}:r)};
 const room=resolveHouseData(selected,registry,states).rooms.find(r=>r.key==='living');assert.deepEqual(room.lamps.map(l=>l.id),['switch.power']);assert.equal(room.lamps[0].on,true);
});
test('An explicitly empty room list displays no lamps',()=>{
 const selected={...config,rooms:config.rooms.map(r=>r.key==='living'?{...r,light_entities:[]}:r)};
 assert.equal(resolveHouseData(selected,registry,states).rooms.find(r=>r.key==='living').lamps.length,0);
});
test('Shared entities are counted only once in the whole-house total',()=>{
 const selected={...config,rooms:config.rooms.map(r=>({...r,light_entities:['light.fado']}))};const data=resolveHouseData(selected,registry,states);assert.equal(data.lamps.length,1);assert.equal(data.active,1);
});
test('Kitchen, bath and bedroom have the supplied explicit sensors',()=>{
 const more={...states,'sensor.ku_temp':{state:'21.3',attributes:{}},'sensor.bd_temp':{state:'20.1',attributes:{}},'sensor.sz_temp':{state:'19.2',attributes:{}}};const data=resolveHouseData(config,registry,more);
 for(const [key,expected] of [['kitchen',21.3],['bath',20.1],['bedroom',19.2]])assert.equal(data.rooms.find(r=>r.key===key).temperature,expected);
});

test('Lamp names select sphere, cabinet and strip glyphs',()=>{assert.equal(houseLampType('Carla Fado'),'kugel');assert.equal(houseLampType('Alwin Schrank Stripe'),'schrank');assert.equal(houseLampType('Neon Rope Lights'),'streifen');assert.equal(houseLampType('Carla Stripe'),'streifen');});
test('Alwin is left and Carla right, garden is absent',()=>{assert.equal(config.rooms.find(r=>r.key==='alwin').side,'left');assert.equal(config.rooms.find(r=>r.key==='carla').side,'right');assert.ok(!config.rooms.some(r=>r.key==='garden'));});

test('Garden Fado sits on the ground and spots point up',()=>{const c={...config,rooms:[...config.rooms,{key:'garden',outdoor:true,floor:0,side:'left',polygon:[[85,495],[400,495],[400,648],[85,648]],anchor:[235,623],light_entities:['light.garden_fado','light.garden_spots']}]};const data=resolveHouseData(c,{}, {'light.garden_fado':{state:'on',attributes:{friendly_name:'Garten Fado'}},'light.garden_spots':{state:'on',attributes:{friendly_name:'Garten Spots'}}});const garden=data.rooms.find(r=>r.key==='garden');assert.equal(garden.lamps[0].position[1],636);assert.equal(garden.lamps[0].outdoor,true);assert.equal(garden.lamps[1].type,'spot');assert.equal(garden.lamps[1].position[1],638);});

test('Living room lamps use the specified fixtures',()=>{assert.equal(houseLampType('WZ Fernseher'),'kommode');assert.equal(houseLampType('WZ Fernsehr'),'kommode');assert.equal(houseLampType('WZ Sofa Stehlampe'),'stehlampe');assert.equal(houseLampType('Shelly EZ-Tisch','stehlampe'),'decke');});

test('Washer uses watts with a strict 3 W threshold and rejects amperes',()=>{assert.equal(houseWasher({state:'3',attributes:{unit_of_measurement:'W'}}).running,false);assert.equal(houseWasher({state:'3.1',attributes:{unit_of_measurement:'W'}}).running,true);assert.equal(houseWasher({state:'0.004',attributes:{unit_of_measurement:'kW'}}).running,true);assert.equal(houseWasher({state:'4',attributes:{unit_of_measurement:'A'}}).available,false);assert.equal(houseWasher({state:'unavailable',attributes:{unit_of_measurement:'W'}}).running,false);});

test('Configured desk switch powers the office monitor only when on',()=>{for(const on of [false,true]){const data=resolveHouseData(config,{}, {'switch.schreibtisch':{state:on?'on':'off',attributes:{friendly_name:'Schreibtisch'}}});const lamp=data.rooms.find(r=>r.key==='office').lamps.find(l=>l.id==='switch.schreibtisch');assert.equal(lamp.on,on);assert.equal(lamp.type,'monitor');}});

test('Warp core temperature uses the inverter and converts Fahrenheit or Kelvin to Celsius',()=>{const id='sensor.inverter_interne_temperatur';assert.equal(config.rooms.find(r=>r.key==='roof').temperature_entity,id);for(const [value,unit,celsius] of [['95','°F',35],['310.15','K',37],['42','°C',42]]){const data=resolveHouseData(config,{}, {[id]:{state:value,attributes:{unit_of_measurement:unit}}});assert.ok(Math.abs(data.roof-celsius)<.00001);assert.ok(Number.isNaN(data.inside));}assert.ok(Number.isNaN(resolveHouseData(config,{}, {[id]:{state:'unavailable',attributes:{unit_of_measurement:'°F'}}}).roof));});
