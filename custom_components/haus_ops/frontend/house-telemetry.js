import {normalizeHouseName} from './house-model.js?v=1.6.61&r=17';
export function groundFloorSonosPlaying(registry={},states={}) {
 const devices=new Map((registry.devices ?? []).map(d=>[d.id,d]));
 const areas=new Map((registry.areas ?? []).map(a=>[a.area_id,a]));
 const floors=new Map((registry.floors ?? []).map(f=>[f.floor_id,f]));
 const entries=(registry.entities ?? []).filter(e=>e.entity_id.startsWith('media_player.')&&!e.disabled_by&&(e.platform==='sonos'||Array.isArray(states[e.entity_id]?.attributes?.group_members)));
 return entries.some(e=>{
  const area=areas.get(e.area_id ?? devices.get(e.device_id)?.area_id);
  const level=floors.get(area?.floor_id)?.level;
  const isGround=Number.isFinite(level)?level===0: ['wohnzimmer','esszimmer','kuche','wohnesszimmer','wohnundesszimmer'].includes(normalizeHouseName(area?.name));
  if(!isGround)return false;
  const state=states[e.entity_id];
  const leader=state?.attributes?.group_members?.[0];
  return state?.state==='playing' || (state?.state!=='unavailable' && state?.state!=='unknown' && leader && states[leader]?.state==='playing');
 });
}
export function cpuValue(state) {
 if(!state || state.state==null || ['unknown','unavailable',''].includes(String(state.state).trim()))return NaN;
 const value=Number(state.state);return Number.isFinite(value)&&value>=0&&value<=100?value:NaN;
}
export function cpuSparkline(rows,now=Date.now()) {
 const start=now-30*60000;
 const valid=rows.map(row=>({time:Date.parse(row.last_updated||row.last_changed),value:cpuValue(row)})).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.time>=start&&p.time<=now).sort((a,b)=>a.time-b.time);
 return valid.map((p,i)=>`${i?'L':'M'}${(Math.min(1,Math.max(0,(p.time-start)/(30*60000)))*170).toFixed(1)},${(26-p.value*.26).toFixed(1)}`).join(' ');
}

export function inverterReading(state) {
 if(!state || state.state==null || ['unknown','unavailable',''].includes(String(state.state).trim()))return '—';
 const value=Number(state.state);
 if(!Number.isFinite(value))return '—';
 const unit=state.attributes?.unit_of_measurement ?? '';
 return value.toLocaleString('de-DE',{maximumFractionDigits:2})+(unit?' '+unit:'');
}
