import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {AirQualityPanel,airIndex,outdoorEpaRating} from '../custom_components/haus_ops/frontend/air-quality-panel.js';

const base = JSON.parse(readFileSync(new URL('../custom_components/haus_ops/frontend/air-quality-config.json',import.meta.url)));
const entity = (entity_id,state,device_class,unit_of_measurement) =>
  ({entity_id,state:String(state),attributes:{device_class,unit_of_measurement}});

function fixture(states={}, registry={}) {
  const panel=new AirQualityPanel({ha:{states},circuits:{registry,load(){}},render(){}});
  panel.base=base;
  return panel;
}

test('particulate and CO₂ index use the configured breakpoints',()=>{
  assert.equal(airIndex(null,base.thresholds.co2),null);
  assert.equal(airIndex(700,base.thresholds.co2),37.5);
  assert.equal(airIndex(1000,base.thresholds.co2),100);
  assert.equal(airIndex(104,base.thresholds.pm25),210);
  assert.equal(airIndex(3000,base.thresholds.co2),250);
});

test('temperature and humidity remain usable without a pollutant index',()=>{
  const states={
    'sensor.ku_temp':entity('sensor.ku_temp',19.3,'temperature','°C'),
    'sensor.thermal_comfort_absolute_luftfeuchtigkeit':entity('sensor.thermal_comfort_absolute_luftfeuchtigkeit',10.73,'absolute_humidity','g/m³'),
    'sensor.thermal_comfort_taupunkt':entity('sensor.thermal_comfort_taupunkt',12.48,'temperature','°C'),
  };
  const panel=fixture(states);
  const markup=panel.view();
  assert.match(markup,/19,3 °C/);
  assert.match(markup,/10,7 <tspan class="air-unit">g\/m³/);
  assert.match(markup,/12,5 °C/);
  assert.match(markup,/Keine Messdaten/);
  assert.equal((markup.match(/data-air-cell=/g)??[]).length,168);
  assert.doesNotMatch(markup,/NaN/);
});

test('area discovery keeps VOC concentration separate and room filtering changes the history',()=>{
  const states={
    'sensor.indoor_co2':entity('sensor.indoor_co2',900,'carbon_dioxide','ppm'),
    'sensor.kitchen_co2':entity('sensor.kitchen_co2',700,'carbon_dioxide','ppm'),
    'sensor.indoor_voc_index':entity('sensor.indoor_voc_index',360,'volatile_organic_compounds_parts','ppb'),
  };
  const registry={
    areas:[{area_id:'living',name:'Wohnzimmer'},{area_id:'kitchen',name:'Küche'}],
    devices:[{id:'device',area_id:'living'}],
    entities:[
      {entity_id:'sensor.indoor_co2',device_id:'device'},
      {entity_id:'sensor.kitchen_co2',area_id:'kitchen',device_id:'device'},
      {entity_id:'sensor.indoor_voc_index',device_id:'device'},
    ],
  };
  const panel=fixture(states,registry);
  const now=Math.floor(Date.now()/900000)*900000;
  panel.history={recent:{
    'sensor.indoor_co2':[{start:now,mean:900}],
    'sensor.kitchen_co2':[{start:now,mean:700}],
  }};
  const overall=panel.view();
  assert.match(overall,/900 ppm/);
  assert.doesNotMatch(overall,/>360 |sensor\.indoor_voc_index/);
  assert.equal(panel.chart.points.at(-1),75);
  panel.selected='Küche';
  assert.match(panel.view(),/aria-pressed="true"/);
  assert.equal(panel.chart.points.at(-1),37.5);
});

test('saved room sensor overrides take precedence and clearing them restores YAML assignments',()=>{
  const kitchen = 'sensor.ku_temp';
  const manual = 'sensor.kitchen_temperature_manual';
  const panel=fixture({
    [kitchen]:entity(kitchen,19,'temperature','°C'),
    [manual]:entity(manual,22,'temperature','°C'),
  });
  panel.panel.yamlConfig={air_quality:{roomSensors:{Küche:{temperature:manual}}}};
  assert.equal(panel.data(panel.config()).rooms.find(room=>room.name==='Küche').temperature.id,manual);
  panel.panel.config={air_quality:{roomSensors:{}}};
  assert.equal(panel.data(panel.config()).rooms.find(room=>room.name==='Küche').temperature.id,kitchen);
});

test('critical warning uses the aggregate, ignores the room filter and clears at 200',()=>{
  const id='sensor.living_co2';
  const panel=fixture({[id]:entity(id,2100,'carbon_dioxide','ppm')});
  panel.panel.config={air_quality:{indoor:{co2:id}}};
  panel.selected='Küche';
  assert.equal(panel.criticalWarning(),'Luftqualität kritisch · CO₂');
  panel.panel.demo=true;
  assert.equal(panel.criticalWarning(),null);
  panel.panel.demo=false;
  panel.panel.ha.states[id].state='2000';
  assert.equal(panel.criticalWarning(),null);
  panel.panel.ha.states[id].state='unavailable';
  assert.equal(panel.criticalWarning(),null);
});

test('a saved room binding preserves an outdoor sensor configured in YAML',()=>{
  const id='sensor.rest_european_index';
  const panel=fixture({[id]:entity(id,28,undefined,undefined)});
  panel.panel.yamlConfig={air_quality:{outdoor:id}};
  panel.panel.config={air_quality:{roomSensors:{Küche:{temperature:'sensor.ku_temp'}}}};
  const config=panel.config();
  assert.equal(panel.data(config).outdoor,28);
  assert.equal(config.roomSensors.Küche.temperature,'sensor.ku_temp');
});

test('the named Außen AQI sensor is discovered without a device class',()=>{
  const id='sensor.au_en_aqi';
  const state=entity(id,31,undefined,undefined);
  state.attributes.friendly_name='Außen AQI';
  const panel=fixture({[id]:state});
  assert.equal(panel.data(panel.config()).outdoor,31);
});

test('outdoor US-AQI follows all six EPA bands at their boundaries',()=>{
  const cases=[
    [0,50,'Gut','#00e400'],
    [51,100,'Mäßig','#ffff00'],
    [101,150,'Ungesund für empfindliche Gruppen','#ff7e00'],
    [151,200,'Ungesund','#ff0000'],
    [201,300,'Sehr ungesund','#8f3f97'],
    [301,500,'Gefährlich','#7e0023'],
  ];
  for(const [min,max,label,color] of cases) {
    for(const value of [min,max]) {
      assert.equal(outdoorEpaRating(value).label,label);
      assert.equal(outdoorEpaRating(value).color,color);
    }
  }
  assert.equal(outdoorEpaRating(undefined),null);
  assert.equal(outdoorEpaRating(-1),null);
});

test('the display only applies EPA colors to a US-AQI source',()=>{
  const eu='sensor.aussen_aqi', us='sensor.aussen_us_aqi';
  const panel=fixture({[eu]:entity(eu,151,'aqi'),[us]:entity(us,151,'aqi')});
  assert.equal(panel.data(panel.config()).outdoorId,us);
  const markup=panel.view();
  assert.equal((markup.match(/>Außen · AQI<\//g)??[]).length,1);
  assert.match(markup,/151 · Ungesund/);
  panel.panel.config={air_quality:{outdoor:eu}};
  assert.match(panel.view(),/151 · Extrem schlecht/);
  panel.panel.config.air_quality.outdoorScale='us';
  assert.match(panel.view(),/151 · Ungesund/);
});

test('the existing outdoor tile rates European AQI without additional configuration',()=>{
  const id='sensor.aussen_aqi';
  const panel=fixture({[id]:entity(id,20,'aqi')});
  for(const [value,label] of [[0,'Gut'],[20,'Gut'],[21,'Ausreichend'],[40,'Ausreichend'],
    [41,'Mäßig'],[60,'Mäßig'],[61,'Schlecht'],[80,'Schlecht'],[81,'Sehr schlecht'],
    [100,'Sehr schlecht'],[101,'Extrem schlecht']]) {
    panel.panel.ha.states[id].state=String(value);
    assert.ok(panel.view().includes(value+' · '+label));
  }
});
