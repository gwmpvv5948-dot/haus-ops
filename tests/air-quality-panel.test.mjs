import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {AirQualityPanel,airIndex} from '../custom_components/haus_ops/frontend/air-quality-panel.js';

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
  assert.equal(airIndex(55,base.thresholds.pm25),210);
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
