import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nightDisplayOff} from '../custom_components/haus_ops/frontend/display-night.js';
let Dashboard;
globalThis.HTMLElement=class {};
globalThis.FontFace=class {};
globalThis.document={fonts:{add(){}}};
globalThis.customElements={define(name,type){if(name==='haus-ops')Dashboard=type;}};
await import('../custom_components/haus_ops/frontend/haus-ops.js');
const registry={floors:[{floor_id:'eg',name:'Erdgeschoß'}],areas:[{area_id:'living',floor_id:'eg'}],devices:[],entities:[{entity_id:'light.tv',area_id:'living'}]};
const off={'light.tv':{state:'off'}};
test('Berlin night mode requires confirmed EG darkness and ends at 06:00',()=>{
 assert.equal(nightDisplayOff(new Date('2026-11-21T21:00:00Z'),off,registry),true);
 assert.equal(nightDisplayOff(new Date('2026-11-22T04:59:00Z'),off,registry),true);
 assert.equal(nightDisplayOff(new Date('2026-11-22T05:00:00Z'),off,registry),false);
 assert.equal(nightDisplayOff(new Date('2026-11-21T21:00:00Z'),{'light.tv':{state:'on'}},registry),false);
 assert.equal(nightDisplayOff(new Date('2026-11-21T21:00:00Z'),{'light.tv':{state:'unavailable'}},registry),false);
});
function fixture(){
 const p=Object.create(Dashboard.prototype);p.yamlConfig={display_brightness_action:'shell_command.wall',display_night_lights:['light.tv']};
 Object.defineProperties(p,{controlsDisplayBrightness:{value:true},activeDisplayBrightness:{value:65}});
 p.ha={states:{...off},config:{time_zone:'Europe/Berlin'}};p.circuits={registry,load(){}};p.sendDisplayBrightness=()=>{};
 return p;
}
test('Night standby stays at zero on repeated HA updates, normal standby is five, input restores configured brightness',()=>{
 const RealDate=globalThis.Date;
 try{
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-21T21:30:00Z']));}};
  const p=fixture();
  for(let i=0;i<5;i++){p.updateDisplayBrightness(true);assert.equal(p.displayBrightnessTarget.value,0);}
  p.ha.states['light.tv']={state:'on'};p.updateDisplayBrightness(true);assert.equal(p.displayBrightnessTarget.value,5);
  p.ha.states['light.tv']={state:'off'};p.updateDisplayBrightness(true);assert.equal(p.displayBrightnessTarget.value,0);
  p.recordDisplayActivity({isTrusted:false});assert.equal(p.displayBrightnessTarget.value,0);
  assert.equal(p.lastDisplayActivity,undefined);
  p.recordDisplayActivity({isTrusted:true});assert.equal(p.displayBrightnessTarget.value,65);
  assert.ok(Number.isFinite(p.lastDisplayActivity));
 }finally{globalThis.Date=RealDate;}
});


test('Offline and unknown EG entries do not block darkness; no known readings cannot confirm darkness',()=>{
 const date=new Date('2026-11-21T21:30:00Z');
 const r={...registry,entities:[...registry.entities,{entity_id:'light.retired',area_id:'living'}]};
 const states={...off,'light.retired':{state:'unavailable'}};
 assert.equal(nightDisplayOff(date,states,r),true);
 assert.equal(nightDisplayOff(date,states,r,['light.tv','light.retired']),true);
 assert.equal(nightDisplayOff(date,{...off,'light.retired':{state:'unknown'}},r,['light.tv','light.retired']),true);
 assert.equal(nightDisplayOff(date,states,r,['light.retired']),false);
 assert.equal(nightDisplayOff(date,{'light.retired':{state:'unavailable'}},r),false);
 assert.equal(nightDisplayOff(date,{...states,'light.tv':{state:'on'}},r),false);
});
