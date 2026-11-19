export const airQualityPageIndex = 13;
const hour = 3600000;
const quarter = hour / 4;
const colors = ['#99ddbb','#ffcc33','#ff9966','#e4685c','#b07cc6'];
const stages = ['Gut','Mäßig','Erhöht','Schlecht','Kritisch'];
const metrics = {
  co2: {label:'CO₂', unit:'ppm', device:'carbon_dioxide'},
  pm25: {label:'Feinstaub PM2.5', unit:'µg/m³', device:'pm25'},
  pm10: {label:'Feinstaub PM10', unit:'µg/m³', device:'pm10'},
  voc: {label:'VOC-Index', unit:'', device:''},
};
const keys = Object.keys(metrics);
const peach = '#ffcc99', pink = '#cc99cc', white = '#fff4e0', blue = '#99ccff';
const fmt = new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
const num = value => Number.isFinite(value) ? fmt.format(value) : '—';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric = value => value != null && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const stage = value => Math.min(4,Math.max(0,Math.ceil(value / 50) - 1));
const color = value => value == null ? '#333039' : colors[stage(value)];
const status = value => value == null ? 'Keine Messdaten' : stages[stage(value)];
const mean = values => values.reduce((sum,value)=>sum+value,0)/values.length;
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('de');
const unit = state => (state?.attributes?.unit_of_measurement ?? '').replace('μ','µ').replace('m3','m³').toLowerCase();

export function airIndex(value, limits) {
  if (value == null || value < 0 || !limits) return null;
  for (let i=1;i<limits.length;i++) {
    if (value <= limits[i]) return 50 * (i-1+Math.max(0,value-limits[i-1])/(limits[i]-limits[i-1]));
  }
  return 250;
}

function metricFor(id,state) {
  if (!id.startsWith('sensor.') || !state) return undefined;
  const cls = state.attributes?.device_class;
  if (/(?:^|_)voc_index(?:_|$)/.test(id) && ['', 'index'].includes(unit(state))) return 'voc';
  return keys.find(key => metrics[key].device && metrics[key].device===cls && metrics[key].unit.toLowerCase()===unit(state))
    ?? keys.find(key => key!=='voc' && new RegExp('(?:^|[._])'+key+'(?:_|$)').test(id) && metrics[key].unit.toLowerCase()===unit(state));
}

function temperature(state) {
  if (['unknown','unavailable'].includes(state?.state)) return null;
  const value = numeric(state?.entity_id?.startsWith('climate.') ? state.attributes?.current_temperature : state?.state);
  if (value == null) return null;
  return unit(state)==='°f' ? (value-32)*5/9 : unit(state)==='k' ? value-273.15 : value;
}

const configUrl = new URL('./air-quality-config.json',import.meta.url);
const txt = (x,y,label,size=16,fill=peach,anchor='start') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escape(label).replace(/(?:µg|g)\/m³/g,unit=>`<tspan class="air-unit">${unit}</tspan>`)}</text>`;
const rect = (x,y,w,h,fill,rx=0,attrs='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}" ${attrs}/>`;
const head = (x,y,w,label) => rect(x,y,20,19,pink,10)+txt(x+28,y+15,label,17)+rect(x+w-92,y,92,19,pink,10);
const action = (name,body,label,selected=false) => `<g data-air-action="${escape(name)}" role="button" tabindex="0" aria-label="${escape(label)}" aria-pressed="${selected}">${body}</g>`;
const clock = date => new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(date);
const weekday = date => new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(date).replace('.','');

function arc(r,a,b) {
  const point = t => [178+r*Math.cos(t*Math.PI/180),251+r*Math.sin(t*Math.PI/180)];
  return `M${point(a)} A${r} ${r} 0 0 1 ${point(b)}`;
}

function ring(value, lead, demo) {
  const tint = color(value);
  return `<defs><radialGradient id="air-glow"><stop offset="49%" stop-color="${tint}" stop-opacity="0"/><stop offset="69%" stop-color="${tint}" stop-opacity=".35"/><stop offset="100%" stop-color="${tint}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="178" cy="251" r="175" fill="url(#air-glow)" class="${value==null?'':'air-glow'}"/>
    ${Array.from({length:40},(_,i)=>`<path d="${arc(122,150+i*6,154.3+i*6)}" fill="none" stroke="${colors[Math.floor(i/8)]}" stroke-width="29" opacity="${value!=null && i*6.25<=value ? 1:.18}"/>`).join('')}
    ${Array.from({length:6},(_,i)=>{const a=(150+48*i)*Math.PI/180; return txt(178+150*Math.cos(a),256+150*Math.sin(a),i*50,13,pink,'middle');}).join('')}
    ${value==null?'':`<circle cx="${178+141*Math.cos((150+value*.96)*Math.PI/180)}" cy="${251+141*Math.sin((150+value*.96)*Math.PI/180)}" r="5" fill="${white}"/>`}
    ${txt(178,265,value==null?'—':Math.round(value),87,white,'middle')}
    ${txt(178,308,status(value),value==null?25:37,value==null?pink:tint,'middle')}
    ${txt(178,334,lead?'Leitschadstoff · '+metrics[lead].label:demo?'Demo':'CO₂ · PM2.5 · PM10 · VOC',13,pink,'middle')}
    ${stages.map((word,i)=>rect(i*71,408,68,25,'#131117',4,i===stage(value)&&value!=null?`stroke="${colors[i]}"`:'')+rect(i*71+5,417,7,7,colors[i],1)+txt(i*71+16,425,word,11)).join('')}`;
}

function particleRow(key,y,source,limits,range) {
  const metric=metrics[key], value=source?.value, index=airIndex(value,limits);
  const start=378, width=329, end=start+width, marker=start+width*index/250;
  const rangeStart=range && start+width*airIndex(range[0],limits)/250;
  const rangeEnd=range && start+width*airIndex(range[1],limits)/250;
  return `<g><title>${escape(source?.id ?? 'Keine verfügbare Entität')}</title>
    ${txt(start,y,metric.label,19)}${txt(end,y,index==null?'—':num(value)+' '+metric.unit,26,white,'end')}
    ${colors.map((fill,i)=>rect(start+i*width/5,y+10,width/5-2,13,fill,4,'opacity=".28"')).join('')}
    ${index==null?'':rect(start,y+10,marker-start,13,color(index),4)+`<path d="M${marker-5} ${y+6}h10l-5 6z M${marker} ${y+11}v15" stroke="${white}" fill="${white}"/>`}
    ${range?`<path d="M${rangeStart} ${y+29}v4H${rangeEnd}v-4" fill="none" stroke="${pink}"/>`:''}
    ${txt(start,y+49,index==null?'Kein Messwert':status(index),13,index==null?pink:color(index))}
    ${range?txt(end,y+49,'24 h · '+num(range[0])+' – '+num(range[1])+' '+metric.unit,12,pink,'end'):''}
  </g>`;
}

const plot = {x:38,y:490,w:652,h:157};
function linePlot(points, cliff, min, max, indexMode, events) {
  const {x,y,w,h}=plot, bottom=y+h;
  const chartY = value => bottom - h*Math.max(0,Math.min(1,(value-min)/(max-min)));
  const chartX = i => x+w*i/(points.length-1);
  let line='', area='', run=[];
  const finish = () => {
    if (!run.length) return;
    line += 'M'+run.join('L');
    area += 'M'+run[0].split(',')[0]+','+bottom+'L'+run.join('L')+'L'+run.at(-1).split(',')[0]+','+bottom+'Z';
    run=[];
  };
  points.forEach((value,i)=> { if (value==null) finish(); else run.push(chartX(i)+','+chartY(value)); });
  finish();
  const steps = Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  return `<defs><linearGradient id="air-chart" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${bottom}" y2="${y}">
    ${colors.map((fill,i)=>`<stop offset="${Math.min(1,i/4)}" stop-color="${fill}"/><stop offset="${Math.min(1,(i+1)/4)}" stop-color="${fill}"/>`).join('')}
    </linearGradient></defs>
    ${steps.map((value,i)=> (indexMode&&i<4?rect(x,chartY(steps[i+1]),w,h/4,colors[i],0,'opacity=".08"'):'')+
      `<path d="M${x} ${chartY(value)}h${w}" stroke="#39343c" stroke-dasharray="3 4"/>`+txt(x-7,chartY(value)+4,num(value),11,pink,'end')).join('')}
    <path d="${area}" fill="${indexMode?'url(#air-chart)':blue}" opacity=".22"/>
    <path d="${line}" stroke="${indexMode?'url(#air-chart)':blue}" stroke-width="2.4" fill="none"/>
    ${!points.some(Number.isFinite)?txt(x+w/2,y+h/2,cliff,19,pink,'middle'):''}
    ${events.slice(-8).map(({index,label},j)=>{
      if(points[index]==null)return '';
      const px=chartX(index),py=chartY(points[index]),ly=y+13+(j%2)*15, left=px>x+w*.72;
      return `<path d="M${px} ${ly+3}V${py}" stroke="${pink}" stroke-dasharray="2 3"/><circle cx="${px}" cy="${py}" r="4" fill="#000" stroke="${white}"/>`+txt(px+(left?-5:5),ly,label,10,pink,left?'end':'start');
    }).join('')}
    ${points.slice(0,-1).map((v,i)=>rect(chartX(i),bottom+8,w/(points.length-1)-.5,11,v==null?'#18161b':indexMode?color(v):blue)).join('')}
    ${['−24 h','−18 h','−12 h','−6 h','Jetzt'].map((t,i)=>txt(x+w*i/4,bottom+38,t,12,pink,i===0?'start':i===4?'end':'middle')).join('')}
    ${rect(x,y,w,h,'transparent',0,'data-air-chart')}
    <g data-air-tooltip pointer-events="none"></g>`;
}

function readSource(id,states,kind) {
  const state=states[id];
  if (!state) return null;
  const value=kind==='temperature'?temperature(state):numeric(state.state);
  return {id,value};
}
function preferred(sources) {
  return sources.find(source=>source.value!=null) ?? sources[0];
}
function classify(state,kind) {
  const cls=state?.attributes?.device_class, id=state?.entity_id ?? '';
  return id.startsWith('sensor.') && (cls===kind || (kind==='humidity' && unit(state)==='%' && /humid|feucht/.test(id)));
}
function bucket(rows,step) {
  const groups=new Map();
  for(const row of rows ?? []) {
    const value=numeric(row.mean);
    const when=typeof row.start==='number'?row.start:Date.parse(row.start);
    if(value==null||!Number.isFinite(when))continue;
    const t=Math.floor(when/step)*step;
    if(!groups.has(t))groups.set(t,[]);
    groups.get(t).push(value);
  }
  return new Map([...groups].map(([time,values])=>[time,mean(values)]));
}

function matrix(now, lookup) {
  const base=new Date(now);
  base.setHours(0,0,0,0);
  return Array.from({length:7},(_,day)=> {
    const date=new Date(base);
    date.setDate(date.getDate()+day-6);
    return {day:day===6?'Heute':weekday(date),cells:Array.from({length:24},(_,h)=>{
      const time=new Date(date);
      time.setHours(h);
      const future=time.getTime()>now;
      return {h,future,time,value:!future&&time.getHours()===h?lookup(time.getTime()):null};
    })};
  });
}

function heatmap(days,isIndex,unitLabel) {
  const cells=days.flatMap((day,i)=>day.cells.map(cell=>({...cell,day:day.day,i})));
  const elevated=cells.filter(c=>isIndex && c.value>100);
  const counts=Array.from({length:24},(_,h)=>elevated.filter(c=>c.h===h).length);
  const peak=counts.indexOf(Math.max(...counts));
  const pattern=counts[peak]>1?'Erhöhte Werte am häufigsten um '+String(peak).padStart(2,'0')+' Uhr':elevated.length?'Einzelne erhöhte Stunden':'';
  return days.map(({day,cells},i)=>txt(737,502+i*23,day,11,i===6?peach:pink,'end')+cells.map(({h,value,future})=>{
    const fill=future?'#171717':value==null?'#2a2530':isIndex?color(value):blue;
    const label=day+' '+String(h).padStart(2,'0')+':00 · '+(value==null?(future?'Zukünftig':'Keine Daten'):num(value)+' '+unitLabel+(isIndex?' · '+status(value):''));
    return `<g><title>${escape(label)}</title>${rect(744+h*12.9,487+i*23,11.9,21,fill,2,`data-air-cell="${escape(label)}" opacity="${value==null||isIndex?'.88':'.65'}"`)}</g>`;
  }).join('')).join('')+
  [0,6,12,18,23].map(h=>txt(744+h*12.9,664,String(h).padStart(2,'0'),11,pink)).join('')+
  txt(744,685,pattern,12,pink)+`<g data-air-heat-tip pointer-events="none"></g>`;
}

export class AirQualityPanel {
  constructor(panel) { this.panel=panel; }

  tick() {
    if(this.panel.page===airQualityPageIndex && this.refreshAt && Date.now()>=this.refreshAt && !this.pending) this.panel.render();
  }

  config() {
    if(!this.base && !this.loading) {
      this.loading=true;
      fetch(configUrl).then(response=>{
        if(!response.ok) throw Error('Luftqualitäts-Konfiguration');
        return response.json();
      }).then(base=>{this.base=base;}).catch(()=>{this.configError=true;}).finally(()=>this.panel.render());
    }
    const custom=this.panel.config?.air_quality ?? this.panel.yamlConfig?.air_quality ?? {};
    const thresholds={...this.base?.thresholds};
    for(const key of keys) {
      const limits=custom.thresholds?.[key];
      if(Array.isArray(limits) && limits.length===6 && limits.every((v,i)=>Number.isFinite(v)&&(!i||v>limits[i-1]))) thresholds[key]=limits;
    }
    return {...this.base,...custom,thresholds};
  }

  data(config) {
    const {panel}=this, states=panel.ha?.states ?? {};
    if(!panel.demo)panel.circuits.load();
    const registry=panel.circuits.registry ?? {}, ids=Object.keys(states);
    const areasByDevice=new Map((registry.devices??[]).map(d=>[d.id,d.area_id]));
    const areaByEntity=new Map((registry.entities??[]).map(e=>[e.entity_id,e.area_id??areasByDevice.get(e.device_id)]));
    const indoor=config.indoor??{};
    const make=(room,i)=>{
      const aliases=(room.areas??[room.name]).map(normalized);
      const areaIds=new Set((registry.areas??[]).filter(a=>aliases.includes(normalized(a.name))).map(a=>a.area_id));
      const candidates=ids.filter(id=>areaIds.has(areaByEntity.get(id)));
      const readings=Object.fromEntries(keys.map((key,j)=>{
        if(panel.demo)return [key,{id:'demo_'+i+'_'+key,value:[625+i*68,7+i,12+i*2,124+i*4][j]}];
        const bound=room[key];
        const sources=(bound?[bound]:candidates.filter(id=>metricFor(id,states[id])===key))
          .filter(id=>id!==config.outdoor).map(id=>readSource(id,states,key)).filter(Boolean);
        return [key,preferred(sources)];
      }));
      const env=kind=>{
        const bound=room[kind];
        const sources=[bound,...candidates.filter(id=>classify(states[id],kind))].filter(Boolean)
          .map(id=>readSource(id,states,kind)).filter(Boolean);
        return preferred(sources);
      };
      return {name:room.name,readings,temperature:env('temperature'),humidity:env('humidity')};
    };
    const rooms=(config.rooms??[]).filter(room=>typeof room?.name==='string').map(make);
    const reference=rooms.find(room=>room.name===config.referenceRoom);
    const aggregate=Object.fromEntries(keys.map(key=>{
      if(reference)return [key,reference.readings[key]?[reference.readings[key]]:[]];
      const all=rooms.map(room=>room.readings[key]).filter(Boolean);
      const bound=readSource(indoor[key],states,key);
      return [key,bound?[bound,...all]:all];
    }));
    const outdoorId=config.outdoor || ids.find(id=>states[id]?.attributes?.device_class==='aqi' && /outdoor|aussen|außen|waqi|open_meteo/i.test(id+' '+states[id].attributes.friendly_name));
    return {rooms,aggregate,outdoor:panel.demo?28:readSource(outdoorId,states,'aqi')?.value,
      absolute:readSource('sensor.thermal_comfort_absolute_luftfeuchtigkeit',states),
      dew:readSource('sensor.thermal_comfort_taupunkt',states)};
  }

  refresh(ids,eventSources) {
    const signature=JSON.stringify([ids,eventSources]);
    if(this.panel.demo || !this.panel.ha?.callWS || this.pending) return;
    if(this.signature===signature && Date.now()<(this.refreshAt??0))return;
    this.signature=signature;
    this.refreshAt=Date.now()+300000;
    if (!ids.length) { this.history={}; return; }
    this.pending=true;
    const ha=this.panel.ha, now=Date.now();
    const query=(period,days)=>ha.callWS({type:'recorder/statistics_during_period',
      start_time:new Date(now-days*24*hour).toISOString(),end_time:new Date(now).toISOString(),
      period,statistic_ids:ids,types:period==='5minute'?['mean','min','max']:['mean']});
    const eventIds=[...new Set(eventSources.map(event=>event.entity))];
    const eventHistory=eventIds.length?ha.callWS({type:'history/history_during_period',
      start_time:new Date(now-24*hour).toISOString(),end_time:new Date(now).toISOString(),
      entity_ids:eventIds,minimal_response:false,no_attributes:true}):Promise.resolve({});
    Promise.allSettled([query('5minute',1.02),query('hour',7.1),eventHistory]).then(([recent,week,events])=>{
      this.history={recent:recent.value??{},week:week.value??{},events:events.value??{},error:recent.status==='rejected'||week.status==='rejected'};
    }).finally(()=>{this.pending=false; if(this.panel.page===airQualityPageIndex)this.panel.render();});
  }

  view() {
    const config=this.config();
    const {rooms,aggregate,outdoor,absolute,dew}=this.data(config);
    const demo=this.panel.demo, now=Date.now(), thresholds=config.thresholds;
    const selected=rooms.find(room=>room.name===this.selected);
    const pools=selected?Object.fromEntries(keys.map(key=>[key,[selected.readings[key]].filter(Boolean)])):aggregate;
    const top=key=>[...pools[key]].filter(source=>source.value!=null).sort((a,b)=>b.value-a.value)[0]??pools[key][0];
    const indexOf=(key,v)=>airIndex(v,thresholds[key]);
    const readings=keys.map(key=>({key,source:top(key),index:indexOf(key,top(key)?.value)}));
    const lead=readings.filter(row=>row.index!=null).sort((a,b)=>b.index-a.index)[0];
    const eventSources=(Array.isArray(config.events)?config.events:[]).filter(event=>event?.entity && this.panel.ha?.states?.[event.entity]);
    const timer=this.panel.config?.vent?.timer ?? this.panel.config?.timer;
    if(timer && !eventSources.some(event=>event.entity===timer))eventSources.push({entity:timer,state:'active',label:'Stoßlüftung'});
    const ids=[...new Set([...Object.values(aggregate).flat(),...rooms.flatMap(r=>[...Object.values(r.readings),r.humidity,r.temperature]),absolute,dew]
      .filter(Boolean).map(source=>source.id))].sort();
    this.refresh(ids,eventSources);
    const indexMode=demo || keys.some(key=>pools[key].length>0);
    const environment=preferred((selected?[selected.humidity,selected.temperature]:[absolute,dew]).filter(Boolean));
    const environmentLabel=environment && environment===absolute?'Absolute Feuchte':environment===dew?'Taupunkt':environment===selected?.humidity?'Relative Feuchte':'Temperatur';
    const environmentUnit=environment && environment===absolute?'g/m³':environment===selected?.humidity?'%':'°C';
    const recent=Object.fromEntries(ids.map(id=>[id,bucket(this.history?.recent?.[id],quarter)]));
    const week=Object.fromEntries(ids.map(id=>[id,bucket(this.history?.week?.[id],hour)]));
    const at=(store,time)=>{
      if(demo) {
        const h=new Date(time).getHours(), wave=(Math.sin(time/hour*1.8)+1)*5;
        return 27+wave+(h>=3&&h<=6?52:0)+(h===18?87:0)+(selected?rooms.indexOf(selected)*3:0);
      }
      if(!indexMode)return store[environment?.id]?.get(time)??null;
      const available=keys.flatMap(key=>pools[key].map(source=>indexOf(key,store[source.id]?.get(time))))
        .filter(Number.isFinite);
      return available.length?Math.max(...available):null;
    };
    const end=Math.floor(now/quarter)*quarter, start=end-96*quarter;
    const points=Array.from({length:97},(_,i)=>at(recent,start+i*quarter));
    const days=matrix(now,time=>at(week,time));
    const observed=[...points,...days.flatMap(day=>day.cells.map(cell=>cell.value))].filter(Number.isFinite);
    const min=indexMode||!observed.length?0:Math.floor(Math.min(...observed)-1), max=indexMode?200:observed.length?Math.ceil(Math.max(...observed)+1):100;
    const events=eventSources.flatMap(source=>(this.history?.events?.[source.entity]??[]).flatMap((entry,i,entries)=>{
      const time=Date.parse(entry.last_changed??entry.last_updated);
      const index=Math.round((time-start)/quarter);
      return entry.state===(source.state??'on') && entries[i-1]?.state!==entry.state && time>start && index<97?
        [{index,label:source.label??source.entity}]:[];
    })).sort((a,b)=>a.index-b.index);
    const rangeFor=id=>{
      const rows=(this.history?.recent?.[id]??[]).filter(row=>{
        const time=typeof row.start==='number'?row.start:Date.parse(row.start);
        return time>=now-24*hour;
      });
      const values=rows.flatMap(row=>[numeric(row.min??row.mean),numeric(row.max??row.mean)]).filter(Number.isFinite);
      return values.length?[Math.min(...values),Math.max(...values)]:null;
    };
    const subtitle=demo?'Demo · Beispielwerte':'Innenindex · 0–250';
    const showingRooms=rooms.slice(0,7);
    const roomRows=showingRooms.map((room,i)=>{
      const co2=room.readings.co2, index=indexOf('co2',co2?.value), y=96+i*42, active=room===selected;
      const summary=index!=null?num(co2.value)+' ppm · '+status(index):
        [room.temperature?.value!=null?num(room.temperature.value)+' °C':'',room.humidity?.value!=null?num(room.humidity.value)+' %':''].filter(Boolean).join(' · ')||'—';
      const label=room.name+' · '+summary;
      return action(room.name,`<title>${escape(label+' · '+[co2?.id,room.temperature?.id,room.humidity?.id].filter(Boolean).join(' · '))}</title>`+
        rect(728,y,326,40,index==null?'#24202b':color(index),19,(active?`stroke="${white}" stroke-width="2" `:'')+(index>50?'class="air-room-warn"':''))+
        txt(741,y+26,room.name,15,index==null?pink:'#000')+txt(1041,y+26,summary,15,index==null?white:'#000','end'),label,active);
    }).join('');
    this.chart={points,start,min,max,indexMode,environmentUnit};
    this.footer='Luftqualität innen · '+status(lead?.index);
    return `<svg class="air-quality-page" viewBox="0 0 1054 700" preserveAspectRatio="xMidYMin meet" role="group" aria-label="Luftqualität innen">
      ${txt(0,43,'Luftqualität · Innen',34,'#ff9966')}${txt(1054,42,subtitle,15,pink,'end')}
      ${head(0,64,352,'Gesamtindex · Innen')}${head(378,64,329,'Schadstoffe · Aktuell')}${head(728,64,326,'Räume · CO₂ / Klima')}
      ${ring(lead?.index,lead?.key,demo)}
      ${readings.map(({key,source},i)=>particleRow(key,120+i*82,source,thresholds[key],rangeFor(source?.id))).join('')}
      ${roomRows}
      ${rect(728,393,326,40,blue,20)}${txt(741,419,'Außen · AQI',16,'#000')}${txt(1041,419,outdoor==null?'—':num(outdoor),18,'#000','end')}
      ${head(0,446,690,'Verlauf · 24 h'+(indexMode?'':' · '+(environment?environmentLabel:'Raumklima')))}
      ${head(715,446,339,'7 Tage · Stunden')}
      ${!indexMode && environment?txt(1054,478,environmentLabel+' · '+environmentUnit,11,pink,'end'):''}
      ${txt(593,478,selected?.name??'Gesamt',12,pink,'end')}
      ${linePlot(points,this.pending?'Lade Verlauf':this.history?.error?'Verlauf nicht verfügbar':'Keine Verlaufsdaten',min,max,indexMode,events)}
      ${heatmap(days,indexMode,indexMode?'Index':environmentUnit)}
      ${txt(378,427,[absolute?.value!=null?'Abs. Feuchte '+num(absolute.value)+' g/m³':'',dew?.value!=null?'Taupunkt '+num(dew.value)+' °C':''].filter(Boolean).join(' · '),12,pink)}
      ${this.configError?txt(1054,14,'Konfiguration nicht geladen',12,pink,'end'):''}
    </svg>`;
  }

  bind(main) {
    const svg=main.querySelector('.air-quality-page');
    if(!svg || this.bound===svg)return;
    this.bound=svg;
    const choose=node=>{
      this.selected=this.selected===node.dataset.airAction?undefined:node.dataset.airAction;
      this.panel.render();
    };
    const tooltip=(node,markup)=>{
      node.innerHTML=markup;
      clearTimeout(this.tipTimer);
      this.tipTimer=setTimeout(()=>{node.replaceChildren();},3000);
    };
    const show=event=>{
      const chart=event.target.closest('[data-air-chart]');
      const cell=event.target.closest('[data-air-cell]');
      if(cell) {
        const tip=svg.querySelector('[data-air-heat-tip]');
        tooltip(tip,rect(744,668,309,29,'#000',4,`stroke="${white}"`)+txt(752,687,cell.dataset.airCell,13,white));
        return;
      }
      if(!chart)return;
      const {points,start,min,max,indexMode,environmentUnit}=this.chart;
      const bounds=chart.getBoundingClientRect();
      const i=Math.round(Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width))*96);
      const x=plot.x+plot.w*i/96, value=points[i], box=Math.min(x+8,plot.x+plot.w-182);
      const y=plot.y+plot.h*(1-Math.max(0,Math.min(1,(value-min)/(max-min))));
      const label=clock(new Date(start+i*quarter))+' Uhr · '+(value==null?'Keine Daten':(indexMode?'Index ':'')+num(value)+' '+(indexMode?status(value):environmentUnit));
      tooltip(svg.querySelector('[data-air-tooltip]'),`<path d="M${x} ${plot.y}v${plot.h}" stroke="${white}" opacity=".6"/>`+
        (value==null?'':`<circle cx="${x}" cy="${y}" r="4" fill="${indexMode?color(value):blue}" stroke="${white}"/>`)+
        rect(box,plot.y+18,174,25,'#000',4,`stroke="${white}"`)+txt(box+7,plot.y+35,label,13,white));
    };
    svg.addEventListener('pointermove',show);
    svg.addEventListener('click',event=>{const room=event.target.closest('[data-air-action]'); if(room)choose(room);else show(event);});
    svg.addEventListener('keydown',event=>{
      const room=event.target.closest('[data-air-action]');
      if(room && ['Enter',' '].includes(event.key)){
        event.preventDefault();
        choose(room);
        [...main.querySelectorAll('[data-air-action]')].find(node=>node.dataset.airAction===room.dataset.airAction)?.focus();
      }
    });
  }
}
