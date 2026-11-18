import {dateKey,nextDays,pvDayIds,pvDays,weatherDays,duration,weatherLabel} from './pv-data.js?v=1.6.21';
import {monthlyReferences,yieldAssessment} from './pv-reference.js?v=1.6.21';

const fmt = (value, digits=1) => Number.isFinite(value) ? value.toLocaleString('de-DE',{maximumFractionDigits:digits}) : '—';
const fallback = 'sensor.solcast_pv_forecast_prognose_heute';

export async function loadPV(panel){
  const location = panel.config?.weather_location;
  const weatherKey = location ? JSON.stringify(location) : '';
  if (panel.pvWeatherKey !== weatherKey) {
    panel.pvWeatherKey = weatherKey;
    panel.pvWeatherAt = 0;
    panel.pvWeather = undefined;
    panel.pvAttempt = 0;
  }
  if(panel.demo || !panel.ha?.callWS || panel.pvLoading || Date.now()-(panel.pvAttempt||0)<300000)return;
  panel.pvLoading=true;
  panel.pvAttempt=Date.now();
  const ha=panel.ha, zone=ha?.config?.time_zone || 'Europe/Berlin';
  const entry=(ha.panels?.['solar-pilot']?.config?.entry_id || ha.panels?.['solar-pilot']?.config?._panel_custom?.config?.entry_id);
  try{
    if(entry)panel.pvStatus=await ha.callWS({type:'solar_pilot/status',entry_id:entry});
  }catch{panel.pvStatus=null;}
  const display=panel.pvStatus?.source_entities?.display||{};
  const source=display.pv_daily||panel.pvStatus?.entities?.pv_daily||panel.config?.energy?.solar_energy_today;
  await Promise.allSettled([
    (async()=>{
      if(!source || (panel.pvReferenceSource===source && Date.now()-(panel.pvReferenceAt||0)<86400000))return;
      const rows=await ha.callWS({type:'recorder/statistics_during_period',start_time:new Date(Date.now()-730*86400000).toISOString(),end_time:new Date().toISOString(),statistic_ids:[source],period:'day',types:['change'],units:{energy:'kWh'}});
      panel.pvReferenceSource=source;
      panel.pvReferenceAt=Date.now();
      panel.pvReferences=monthlyReferences(rows[source],Date.now(),zone);
    })(),
    (async()=>{
      if(!location || Date.now()-(panel.pvWeatherAt||0)<3600000)return;
      const response=await fetch('https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({
        latitude:location.latitude, longitude:location.longitude, timezone:zone,
        daily:'weather_code,sunshine_duration,daylight_duration,precipitation_sum', forecast_days:7,
      }),{signal:AbortSignal.timeout(10000),credentials:'omit',referrerPolicy:'no-referrer'});
      if(response.ok){
        const data = await response.json();
        if (panel.pvWeatherKey === weatherKey) {
          panel.pvWeather=weatherDays(data);panel.pvWeatherAt=Date.now();
        }
      }
    })()
  ]);
  panel.pvLoading=false;
  panel.render();
}

export function pvView(panel){
  const zone=panel.ha?.config?.time_zone||'Europe/Berlin', now=Date.now();
  const days=nextDays(now,zone), states=panel.ha?.states||{}, status=panel.pvStatus;
  const display=status?.source_entities?.display||{}, entities=status?.entities||{};
  const first=display.forecast_day_1||entities.forecast_day||entities.forecast?.replace(/prognose_verbleibende_leistung_heute$/,'prognose_heute').replace(/forecast_remaining_today$/,'forecast_today')||fallback;
  const ids=pvDayIds(first);
  const pv=pvDays(states,first,zone,days.map((_,i)=>display['forecast_day_'+(i+1)]||ids[i]));
  const refs=panel.pvReferences||monthlyReferences([]);
  const weather=now-(panel.pvWeatherAt||0)<21600000?panel.pvWeather||{}:{};
  const house=status?.consumption_forecast?.daily_house;
  const settings=status?.settings||{}, snapshot=status?.snapshot||{};
  const fresh=Number.isFinite(house?.updated)&&now/1000-house.updated>=0&&now/1000-house.updated<=900;
  const roof=states[display.roof_daily||'sensor.sum_dach_tagesertrag'];
  const roofValue=Number(roof?.state), unit=roof?.attributes?.unit_of_measurement;
  const actual=dateKey(roof?.last_updated,zone)===days[0]&&roofValue>=0&&['Wh','kWh'].includes(unit)?roofValue/(unit==='Wh'?1000:1):null;
  const rows=days.map((day,i)=>{
    const sample=[5.6,5.8,5.8,3.1,4.4,6.1,7.5][i];
    const {kwh,low}=panel.demo?{kwh:sample,low:sample*.4}:pv[day]||{};
    const reference=refs[Number(day.slice(5,7))-1];
    const demand=panel.demo?11.3:fresh&&house.days?.[day]?.available?house.days[day].kwh:null;
    const reserve=settings.efficiency>0 && Number.isFinite(settings.capacity_kwh) && Number.isFinite(settings.reserve_soc)
      ? (i===0 && Number.isFinite(snapshot.house_soc) && snapshot.house_soc_age+Math.max(0,now/1000-snapshot.now)<=settings.meter_max_age_s
        ? Math.max(0,settings.reserve_soc-snapshot.house_soc) : i===0 ? NaN : settings.reserve_soc)*settings.capacity_kwh/100/settings.efficiency : null;
    const assessment=yieldAssessment(kwh,demand,panel.demo?1:reserve);
    const date=new Date(day+'T12:00:00Z');
    return {kwh,low:low<=kwh?low:null,reference,demand,assessment,
      label:i===0?'Heute':i===1?'Morgen':date.toLocaleDateString('de-DE',{weekday:'long',timeZone:'UTC'}),
      date:day.slice(8)+'.'+day.slice(5,7)+'.',
      weather:panel.demo?{code:i<4?61:2,sun:4200+i*2400,day:32000,rain:i<4?5.7-i:0}:weather[day]||{}};
  });
  const scale=Math.ceil(Math.max(15,actual||0,...rows.flatMap(r=>[r.kwh||0,r.reference.kwh,r.demand||0]))/5)*5;
  const height=value=>100*value/scale;
  const selected=panel.pvSelected??0, active=rows[selected];
  const valid=rows.filter(r=>Number.isFinite(r.kwh));
  const total=valid.length?valid.reduce((sum,r)=>sum+r.kwh,0):null;
  const percent=r=>Number.isFinite(r.kwh)?100*r.kwh/r.reference.kwh:NaN;
  const rate=percent(active);
  const metric=(label,value,unit)=>`<div><small>${label}</small><strong>${value}</strong> ${unit}</div>`;
  const bar=(value,max)=>`<i class="pv-mini"><b style="width:${Math.max(0,Math.min(100,100*value/max))||0}%"></b></i>`;
  const observed=panel.demo?0:actual;
  return {status:`PV-Prognose · ${valid.length}/7 Tage · ${fmt(total)} kWh`,layout:`<section class="pv-outlook">
    <header><h2>Solarprognose · 7 Tage</h2><div><button data-pv-daily>PV-Tagesverlauf ▶</button><button data-pv-back>Zur Energiebilanz</button></div></header>
    <div class="pv-metrics">${metric('Prognose',fmt(active.kwh),'kWh')}${metric('Vorsichtig · P10',fmt(active.low),'kWh')}${metric('Monatsreferenz',fmt(rate,0),'%')}${metric(valid.length===7?'7 Tage':valid.length+' von 7 Tagen',fmt(total),'kWh')}</div>
    <div class="pv-days"><div class="pv-scale"><small>kWh</small><div>${[0,.25,.5,.75,1].map(f=>`<span style="bottom:${f*100}%">${fmt(f*scale)}</span>`).join('')}</div><small>Wetter</small><small>Sonne</small><small>Regen</small></div>
    ${rows.map((r,i)=>{
      const [condition,icon]=weatherLabel(r.weather.code), value=percent(r);
      const color=!Number.isFinite(value)?'#aaa':value>=75?'#a6dcad':value>=50?'#ff9a68':'#ffd052';
      return `<article class="pv-day ${i===selected?'selected':''}" style="--pv-score:${color}">
        <button data-pv-day="${i}" aria-pressed="${i===selected}" class="${i===0?'today':''}">${r.label}<small>${r.date}</small></button>
        <button class="pv-plot" data-pv-day="${i}" aria-label="${r.label} · ${fmt(r.kwh)} kWh">
          <span class="pv-stack" aria-hidden="true">${Array.from({length:20},(_,n)=>{
            const level=(n+.5)*scale/20;
            return `<i class="${level<=r.low?'certain':level<=r.kwh?'expected':''}" style="--segment:${n}"></i>`;
          }).join('')}</span>
          ${Number.isFinite(r.demand)?`<span class="pv-demand" style="bottom:${height(r.demand)}%" title="Hausbedarf ${fmt(r.demand)} kWh">${i===selected?'Bedarf '+fmt(r.demand):''}</span>`:''}
          <strong class="pv-expected" style="bottom:${Math.min(88,height(r.kwh||0))}%">${fmt(r.kwh)}</strong>
          ${Number.isFinite(r.low)?`<small class="pv-low" style="bottom:${Math.min(84,height(r.low))}%">${fmt(r.low)}</small>`:''}
          ${i===0&&Number.isFinite(observed)?`<span class="pv-now" style="bottom:${Math.min(95,height(observed))}%">● Jetzt ${fmt(observed)} kWh</span>`:''}
        </button>
        <div class="pv-score"><strong>${fmt(value,0)} %</strong><small>${{poor:'Knapp',fair:'Reserve offen',good:'Überschuss',unknown:'Bedarf unbekannt'}[r.assessment.kind]}</small></div>
        <div class="pv-weather ${r.weather.code===0?'sunny':r.weather.rain>0?'rainy':'cloudy'}"><ha-icon icon="mdi:${icon}"></ha-icon><small>${condition}</small></div>
        <div class="pv-sun"><small>${duration(r.weather.sun)} / ${duration(r.weather.day)}</small>${bar(r.weather.sun,r.weather.day)}</div>
        <div class="pv-rain"><small>${fmt(r.weather.rain)} mm</small>${bar(r.weather.rain,10)}</div>
      </article>`;
    }).join('')}</div>
    <footer>Solcast · ${panel.config?.weather_location ? 'Open-Meteo' : 'Wetterstandort nicht eingestellt'} · 100 % = ${fmt(active.reference.kwh)} kWh Monatsreferenz${active.reference.source==='provisional'?' (vorläufig)':''} · Hausbedarf ohne Tesla</footer>
    </section>`};
}
