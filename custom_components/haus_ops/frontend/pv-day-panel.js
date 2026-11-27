import {dateKey,nextDays,pvDayIds,pvDays} from './pv-data.js?v=1.6.46';

const numeric=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
const fmt=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('de-DE',{maximumFractionDigits:digits}):'—';
const clock=(stamp,zone)=>new Date(stamp).toLocaleTimeString('de-DE',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
function sources(panel){
  const display=panel.pvStatus?.source_entities?.display||{}, entities=panel.pvStatus?.entities||{};
  const first=display.forecast_day_1||entities.forecast_day||entities.forecast?.replace(/prognose_verbleibende_leistung_heute$/,'prognose_heute').replace(/forecast_remaining_today$/,'forecast_today')||'sensor.solcast_pv_forecast_prognose_heute';
  return {ids:Array.from({length:7},(_,i)=>display['forecast_day_'+(i+1)]||pvDayIds(first)[i]).filter(Boolean),
    power:entities.pv_power||panel.config?.energy?.pv_total_power,
    roof:display.roof_daily||'sensor.sum_dach_tagesertrag',remaining:entities.forecast};
}
function points(panel,day,zone){
  const states=panel.ha?.states||{}, result=new Map();
  for(const id of sources(panel).ids){
    const state=states[id];
    if(!state||['unknown','unavailable'].includes(state.state)||state.attributes.dataCorrect===false)continue;
    for(const row of state.attributes.detailedForecast||[]){
      const t=Date.parse(row.period_start), p=numeric(row.pv_estimate),low=numeric(row.pv_estimate10);
      if(dateKey(t,zone)===day&&p!==null&&p>=0)result.set(t,{t,p,low:low!==null&&low>=0&&low<=p?low:null});
    }
  }
  return [...result.values()].sort((a,b)=>a.t-b.t);
}
export function pvSimulationForecast(panel, now = Date.now()) {
  const zone = panel.ha?.config?.time_zone || 'Europe/Berlin';
  const day = dateKey(now,zone);
  return {day, rows:points(panel,day,zone).map(({t,p})=>[t,p])};
}
export function normalizePVHistory(row, fallbackUnit) {
  const rawTime = row.lu ?? row.lc ?? row.last_updated ?? row.last_changed;
  const t = typeof rawTime === 'number' ? rawTime * 1000 : Date.parse(rawTime);
  const value = numeric(row.s ?? row.state);
  const unit = row.a?.unit_of_measurement ?? row.attributes?.unit_of_measurement ?? fallbackUnit;
  return {t, p: value === null || value < 0 ? null : unit === 'W' ? value / 1000 : unit === 'kW' ? value : null};
}

export async function loadPVActual(panel){
  const source=sources(panel).power, now=Date.now(), zone=panel.ha?.config?.time_zone||'Europe/Berlin';
  const day=dateKey(now,zone), key=source+'|'+day;
  if(panel.demo||!source||!panel.ha?.callWS||panel.pvActualLoading||panel.pvActualKey===key&&now-(panel.pvActualAt||0)<300000)return;
  panel.pvActualLoading=true;
  panel.pvActualAt=now;
  try{
    const history=await panel.ha.callWS({type:'history/history_during_period',start_time:new Date(now-26*3600000).toISOString(),end_time:new Date(now).toISOString(),entity_ids:[source],minimal_response:false,no_attributes:false});
    const unit=panel.ha.states[source]?.attributes?.unit_of_measurement;
    panel.pvActual=(history[source]||[]).map(row=>normalizePVHistory(row,unit))
      .filter(row=>Number.isFinite(row.t)&&dateKey(row.t,zone)===day);
    panel.pvActualError='';
    panel.pvActualKey=key;
  }catch{panel.pvActual=[];panel.pvActualKey=key;panel.pvActualError='PV-Ist-Historie konnte nicht geladen werden';}
  finally{panel.pvActualLoading=false;panel.render();}
}
function actualPoints(panel,day,zone){
  const source=sources(panel).power, live=panel.ha?.states?.[source];
  if(panel.pvActualKey!==source+'|'+day)return [];
  const current=live?normalizePVHistory(live,live.attributes?.unit_of_measurement):null;
  return [...panel.pvActual||[],...current?[current]:[]]
    .filter(row=>Number.isFinite(row.t)&&dateKey(row.t,zone)===day)
    .sort((a,b)=>a.t-b.t);
}
function pathSegments(rows,x,y){
  let last=null;
  return rows.map(row=>{
    if(row.p===null||row.p<0){last=null;return '';}
    const move=last===null||row.t-last>15*60000;
    last=row.t;
    return (move?'M':'L')+x(row.t).toFixed(2)+' '+y(row.p).toFixed(2);
  }).join(' ');
}
function chart(rows,actual,now,zone){
  if(!rows.length)return '<div class="pv-day-empty">Keine Zeitprognose für diesen Tag verfügbar</div>';
  const positive=rows.filter(row=>row.p>0);
  const start=Math.max(rows[0].t,(positive[0]?.t||rows[0].t)-1800000);
  const end=Math.max(start+3600000,Math.min(rows.at(-1).t+1800000,(positive.at(-1)?.t||rows.at(-1).t)+3600000));
  const maximum=Math.max(.1,Math.ceil(Math.max(...rows.map(r=>r.p),...actual.map(r=>r.p||0))*10)/10);
  const x=t=>48+(t-start)/(end-start)*652, y=p=>226-p/maximum*200;
  const curve=field=>rows.filter(r=>r.t>=start&&r.t<=end&&Number.isFinite(r[field])).map((r,i)=>(i?'L':'M')+x(r.t)+' '+y(r[field])).join(' ');
  const area=field=>{const valid=rows.filter(r=>r.t>=start&&r.t<=end&&Number.isFinite(r[field]));return valid.length?curve(field)+'L'+x(valid.at(-1).t)+' 226L'+x(valid[0].t)+' 226Z':'';};
  const hours=[];
  for(let t=Math.ceil(start/3600000)*3600000;t<=end;t+=3600000)hours.push(t);
  const inside=now>=start&&now<=end;
  const last=actual.filter(r=>r.p!==null&&r.t>=start&&r.t<=end).at(-1);
  return `<svg viewBox="0 0 720 264" role="img" aria-label="PV-Leistung und Prognose in Kilowatt, Tagesverlauf">
    <defs><linearGradient id="pv-p50" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="#cc99cc" stop-opacity=".75"/><stop offset="1" stop-color="#9999ff" stop-opacity=".15"/></linearGradient><linearGradient id="pv-p10" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="#99ccff" stop-opacity=".65"/><stop offset="1" stop-color="#9999ff" stop-opacity=".15"/></linearGradient></defs>
    ${hours.map(t=>`<path d="M${x(t)} 24V226" stroke="#cc99cc" opacity=".22" stroke-width="9" stroke-linecap="round"/><text x="${x(t)}" y="243" text-anchor="middle" fill="#cc99cc">${clock(t,zone)}</text>`).join('')}
    ${[0,.25,.5,.75,1].map(f=>`<path d="M48 ${y(f*maximum)}H700" stroke="#b8653f" stroke-width="2" opacity=".8"/><text x="44" y="${y(f*maximum)-3}" text-anchor="end">${fmt(f*maximum)}${f===1?' kW':''}</text>`).join('')}
    <path d="${area('p')}" fill="url(#pv-p50)" stroke="#cc99cc" stroke-width="1.5"/>
    <path d="${area('low')}" fill="url(#pv-p10)" stroke="#99ccff" stroke-width="1"/>
    ${rows.filter(r=>r.t>=start&&r.t<=end&&new Date(r.t).getUTCMinutes()===0).map(r=>`<rect x="${x(r.t)-3}" y="${y(r.p)-3}" width="6" height="6" fill="#ffaa00" stroke="#000"/>${r.low!==null?`<rect x="${x(r.t)-2}" y="${y(r.low)-2}" width="4" height="4" fill="#9999ff" stroke="#000"/>`:''}`).join('')}
    <path d="${pathSegments(actual.filter(r=>r.t>=start&&r.t<=end),x,y)}" stroke="#ffaa00" stroke-width="1.8" stroke-linejoin="round" fill="none"/>
    ${inside?`<path d="M${x(now)} 18V226" stroke="#ffcc99" stroke-dasharray="4 3"/><text x="${Math.min(665,Math.max(85,x(now)))}" y="14" text-anchor="middle">Jetzt ${clock(now,zone)}</text>`:''}
    ${last?`<circle cx="${x(last.t)}" cy="${y(last.p)}" r="3" fill="#ffaa00"><title>PV-Ist ${clock(last.t,zone)} · ${fmt(last.p,2)} kW</title></circle>`:''}
    ${rows.filter(r=>r.t>=start&&r.t<=end).map(r=>`<rect x="${x(r.t)-5}" y="25" width="10" height="201" fill="transparent"><title>${clock(r.t,zone)} · P50 ${fmt(r.p,2)} kW · P10 ${fmt(r.low,2)} kW</title></rect>`).join('')}
    <text x="48" y="260">${clock(start,zone)}</text><text x="700" y="260" text-anchor="end">${clock(end,zone)}</text>
  </svg>`;
}
export function pvDayView(panel){
  const zone=panel.ha?.config?.time_zone||'Europe/Berlin', today=dateKey(Date.now(),zone), days=nextDays(Date.now(),zone);
  const index=Math.min(6,Math.max(0,panel.pvDayIndex||0)), day=days[index], ids=sources(panel),states=panel.ha?.states||{};
  let rows=points(panel,day,zone), actual=index===0?actualPoints(panel,day,zone):[];
  if(panel.demo){
    const start=Date.parse(day+'T06:00:00Z');
    rows=Array.from({length:23},(_,i)=>({t:start+i*1800000,p:Math.max(0,1.8*Math.sin(i/22*Math.PI)),low:Math.max(0,.8*Math.sin(i/22*Math.PI))}));
    actual=index===0?rows.filter(r=>r.t<Date.now()).map(r=>({...r,p:r.p*.85})):[];}
  const sums=pvDays(states,ids.ids[0],zone,ids.ids)[day]||{};
  const energy=states[ids.roof], value=numeric(energy?.state),unit=energy?.attributes?.unit_of_measurement;
  const produced=index===0&&dateKey(energy?.last_updated,zone)===today&&['Wh','kWh'].includes(unit)&&value!==null&&value>=0?value/(unit==='Wh'?1000:1):null;
  const p50=panel.demo?10:sums.kwh,p10=panel.demo?4.4:sums.low;
  const remainingState=states[ids.remaining],remainingValue=numeric(remainingState?.state);
  const remaining=index? p50 : remainingValue!==null&&remainingValue>=0&&dateKey(remainingState?.last_updated,zone)===today&&['Wh','kWh'].includes(remainingState?.attributes?.unit_of_measurement)?remainingValue/(remainingState.attributes.unit_of_measurement==='Wh'?1000:1):null;
  const label=index===0?'Heute':index===1?'Morgen':new Date(day+'T12:00:00Z').toLocaleDateString('de-DE',{weekday:'long',timeZone:'UTC'});
  const progress=produced!==null&&p50>0?100*produced/p50:null;
  const metric=(label,v,color)=>`<article style="--metric:${color}"><strong>${fmt(v)} <small>kWh</small></strong><span>${label}</span></article>`;
  const now=Math.floor(Date.now()/60000)*60000,validActual=actual.filter(r=>r.p!==null),current=validActual.at(-1);
  return {status:`PV · ${label} · P50 ${fmt(p50)} kWh · Rest ${fmt(remaining)} kWh`,layout:`<section class="pv-daily">
    <div class="pv-daily-nav"><button data-pv-back>‹ Energie</button><button aria-label="Vorheriger Tag" data-pv-day-shift="-1" ${index===0?'disabled':''}><svg class="ops-triangle" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M8 1L1 5L8 9Z"/></svg></button><strong>${label} · ${day.slice(8)}.${day.slice(5,7)}.</strong>
    <div>${days.map((_,i)=>`<button data-pv-date="${i}" aria-label="Tag ${i+1}" aria-pressed="${i===index}">●</button>`).join('')}</div><button aria-label="Nächster Tag" data-pv-day-shift="1" ${index===6?'disabled':''}><svg class="ops-triangle" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 1L9 5L2 9Z"/></svg></button><button data-pv-week>7-Tage-Ausblick <svg class="ops-triangle" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 1L9 5L2 9Z"/></svg></button></div>
    <div class="pv-daily-metrics">${metric('Dach-Ertrag heute',produced,'#ffaa00')}${metric('Prognose P50',p50,'#cc99cc')}${metric('Vorsichtig P10',p10,'#9999ff')}${metric('Rest P50',remaining,'#ffcc99')}</div>
    <div class="pv-analysis"><aside><b>Analyse</b><b>P50</b><b>P10</b><b>PV-Ist</b></aside><div class="pv-daily-chart">${chart(rows,actual,index===0?now:NaN,zone)}</div></div>
    <div class="pv-daily-legend"><span>PV-Ist · ${current&&now-current.t<900000?fmt(current.p,2):'—'} kW</span><span>P50 · erwartet</span><span>P10 · vorsichtig</span><small>${panel.pvActualError||'Solcast · Originalraster 30 min · Ist aus HA-Historie'}</small></div>
    <div class="pv-daily-goal"><b>Prognose P50</b><div>${Array.from({length:40},(_,i)=>`<i class="${progress!==null&&i<Math.min(40,progress/2.5)?'produced':'forecast'}"></i>`).join('')}</div><strong>${fmt(progress,0)} %</strong></div>
  </section>`};
}

export function bindPVDay(panel,main){
  const svg=main.querySelector('.pv-daily-chart svg');
  if(!svg)return;
  const zone=panel.ha?.config?.time_zone||'Europe/Berlin';
  const day=nextDays(Date.now(),zone)[panel.pvDayIndex||0];
  const rows=points(panel,day,zone);
  const readout=main.querySelector('.pv-daily-legend small');
  if(!rows.length||!readout)return;
  const read=event=>{
    const box=svg.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,((event.clientX-box.left)/box.width*720-48)/652));
    const positive=rows.filter(r=>r.p>0);
    const start=Math.max(rows[0].t,(positive[0]?.t||rows[0].t)-1800000);
    const end=Math.max(start+3600000,Math.min(rows.at(-1).t+1800000,(positive.at(-1)?.t||rows.at(-1).t)+3600000));
    const target=start+ratio*(end-start);
    const row=rows.reduce((best,r)=>Math.abs(r.t-target)<Math.abs(best.t-target)?r:best);
    readout.textContent=clock(row.t,zone)+' · P50 '+fmt(row.p,2)+' · P10 '+fmt(row.low,2)+' kW';
  };
  svg.onpointerdown=event=>{svg.setPointerCapture(event.pointerId);read(event);};
  svg.onpointermove=event=>{if(svg.hasPointerCapture(event.pointerId))read(event);};
}
