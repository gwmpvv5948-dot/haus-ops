import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VentilationPanel} from '../custom_components/haus_ops/frontend/ventilation-panel.js';

// Load the actual dashboard getters without constructing its DOM or timers.
let Dashboard;
globalThis.HTMLElement=class {};
globalThis.FontFace=class {};
globalThis.document={fonts:{add(){}}};
globalThis.customElements={define(name,type){if(name==='haus-ops')Dashboard=type;}};
await import('../custom_components/haus_ops/frontend/haus-ops.js');
function fixture(timerState='active',volts='80') {
  const p=Object.create(Dashboard.prototype);
  p.hasAttribute=()=>false;
  p.yamlConfig={timer:'timer.ventilation'};
  p.ha={states:{'number.trafocurrentvolt':{state:volts},'timer.ventilation':{state:timerState,attributes:{remaining:'00:10:00',finishes_at:new Date(Date.now()+600000).toISOString()}}}};
  p.circuits={registry:{},load(){}};
  return p;
}
test('Active boost overrides a saved LOW stage with MAX / 230 V in dashboard and ventilation view',()=>{
  const p=fixture();
  assert.equal(p.level,4);assert.equal(p.volts,230);
  const d=new VentilationPanel(p).data();
  assert.equal(d.stage,4);assert.equal(d.voltage,230);assert.equal(d.rpm,1900);
});
test('Stopping or finishing boost immediately restores the transformer reading',()=>{
  const p=fixture();assert.equal(p.level,4);
  p.ha.states['timer.ventilation'].state='idle';
  assert.equal(p.level,1);assert.equal(p.volts,80);
  p.ha.states['number.trafocurrentvolt'].state='175';
  assert.equal(p.level,3);assert.equal(p.volts,175);
});
test('Paused timers with remaining time do not force MAX',()=>{
  const p=fixture('paused');assert.ok(p.remaining>0);
  assert.equal(p.boostActive,false);assert.equal(p.level,1);assert.equal(p.volts,80);
});
test('An active boost still has a known stage when the saved voltage is unavailable',()=>{
  const p=fixture('active','unavailable');assert.equal(p.level,4);assert.equal(p.volts,230);
  p.ha.states['timer.ventilation'].state='idle';
  assert.equal(p.level,-1);assert.ok(Number.isNaN(p.volts));
});
