const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const names=['Aus','Low','1','2','Max'];
const colors=['#c099ff','#99ccff','#ffda66'];
export const ventilationCharacteristics=[{flow:0,voltage:0,rpm:0},{flow:60,voltage:80,rpm:620},{flow:110,voltage:150,rpm:980},{flow:160,voltage:175,rpm:1380},{flow:220,voltage:230,rpm:1900}];
export const ventilationFields=[
 ['vent.outside','Außentemperatur (optional)',['sensor','weather']],
 ['vent.flow','Volumenstrom (m³/h, optional)',['sensor']],['vent.rpm','Lüfterdrehzahl (U/min, optional)',['sensor']],
 ['vent.runtime','Laufzeit heute (optional)',['sensor']],['vent.filter','Filterbelastung (%, optional)',['sensor']],
 ['vent.humidity_auto','Feuchte-Automatik · HA-Helfer',['input_boolean','switch']],['vent.night_low','Nacht-Low · HA-Helfer',['input_boolean','switch']],
 ...[['tech','Technikraum'],['bath','Bad'],['guest','Gäste-Bad']].flatMap(([key,name])=>[[`vent.${key}_temp`,`${name} · Temperatur`,['sensor']],[`vent.${key}_humidity`,`${name} · Feuchte`,['sensor']]])
];
export function ventilationNumber(state){if(!state||state.state==null||['','unknown','unavailable'].includes(String(state.state).trim()))return NaN;const n=Number(state.state);return Number.isFinite(n)?n:NaN;}
export function validateVentilationCharacteristics(value){if(!Array.isArray(value)||value.length!==5||value.some(row=>!row||['flow','voltage','rpm'].some(key=>!Number.isFinite(row[key])||row[key]<0||row[key]>({flow:5000,voltage:300,rpm:30000}[key]))))throw Error('Lüftungskennwerte: fünf Stufen mit gültigen Zahlen für flow, voltage und rpm erforderlich.');return value;}
const normal=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const number=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
function temperature(state){const n=ventilationNumber(state),unit=state?.attributes?.unit_of_measurement;return unit==='°F'?(n-32)*5/9:unit==='K'?n-273.15:n;}
export function zoneReading(registry={},states={},aliases=[],kind,explicit){
 if(explicit)return {id:explicit,value:kind==='temperature'?temperature(states[explicit]):ventilationNumber(states[explicit])};
 const areas=new Set((registry.areas??[]).filter(a=>aliases.map(normal).includes(normal(a.name))).map(a=>a.area_id));
 const devices=new Map((registry.devices??[]).map(d=>[d.id,d]));
 const candidates=(registry.entities??[]).filter(e=>!e.disabled_by&&areas.has(e.area_id??devices.get(e.device_id)?.area_id)&&e.entity_id.startsWith('sensor.')&&(states[e.entity_id]?.attributes?.device_class===kind||(kind==='temperature'?['°C','°F','K'].includes(states[e.entity_id]?.attributes?.unit_of_measurement):states[e.entity_id]?.attributes?.unit_of_measurement==='%'&&/humid|feucht/.test(e.entity_id))));
 const environmental=candidates.filter(e=>kind==='humidity'||/(_temp|_temperature|_temperatur)$/.test(e.entity_id));
 const source=(environmental.length?environmental:candidates).find(e=>Number.isFinite(kind==='temperature'?temperature(states[e.entity_id]):ventilationNumber(states[e.entity_id])));
 return {id:source?.entity_id,value:source?(kind==='temperature'?temperature(states[source.entity_id]):ventilationNumber(states[source.entity_id])):NaN};
}
const rotor=(x,y,r,attr)=>`<g ${attr} transform="translate(${x} ${y})"><g data-vent-rotor>${[0,120,240].map(a=>`<ellipse cx="0" cy="${-r*.46}" rx="${r*.24}" ry="${r*.47}" transform="rotate(${a})" fill="currentColor"/>`).join('')}<circle r="${r*.12}" fill="#000"/></g></g>`;
const button=(action,label,body)=>`<g role="button" tabindex="0" aria-label="${label}" data-action="${action}" class="vent-button">${body}</g>`;
const label=(key,x,y,size=20,fill='#ffcc99',anchor='start')=>`<text data-vent-text="${key}" x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">—</text>`;
const segmentPath=(i)=>{const a=(i*15-90)*Math.PI/180,b=(i*15-76.5)*Math.PI/180;return `M${Math.cos(a)*71} ${Math.sin(a)*71}A71 71 0 0 1 ${Math.cos(b)*71} ${Math.sin(b)*71}`;};
// Fixed rectilinear ducts: no SVG geometry queries in the animation loop.
export function ventilationRoute(zone){
 const points=[[608,209+zone*79],[679,209+zone*79],[679,166],[612,166],[612,92]];
 let length=0;
 const segments=points.slice(1).map((end,i)=>{const start=points[i],size=Math.hypot(end[0]-start[0],end[1]-start[1]);length+=size;return {start,end,size};});
 return {length,segments,d:'M'+points.map(p=>p.join(' ')).join('L')};
}
export function ventilationPosition(route,distance){
 let remaining=Math.max(0,Math.min(route.length,distance));
 for(const segment of route.segments){if(remaining<=segment.size){const f=remaining/segment.size;return {x:segment.start[0]+(segment.end[0]-segment.start[0])*f,y:segment.start[1]+(segment.end[1]-segment.start[1])*f};}remaining-=segment.size;}
 const end=route.segments.at(-1).end;return {x:end[0],y:end[1]};
}
export class VentilationPanel {
 constructor(panel){this.panel=panel;this.angle=0;this.velocity=0;this.particles=[];this.pool=[];this.lastSpawn=[0,0,0];}
 data(){
  const p=this.panel,c=p.config?.vent??{},registry=p.circuits.registry??{},states=p.ha?.states??{};
  if(!p.demo)p.circuits.load();
  let table=ventilationCharacteristics;try{if(c.characteristics)table=validateVentilationCharacteristics(c.characteristics);}catch{}
  const stage=p.level,known=stage>=0&&stage<5,metrics=known?table[stage]:{};
  const read=id=>ventilationNumber(states[id]);
  const actualFlow=read(c.flow),actualRPM=read(c.rpm);
  const flow=p.demo?metrics.flow:Number.isFinite(actualFlow)&&actualFlow>=0?actualFlow:metrics.flow;
  const rpm=p.demo?metrics.rpm:Number.isFinite(actualRPM)&&actualRPM>=0?actualRPM:metrics.rpm;
  const zones=[{key:'tech',name:'Technikraum',short:'Technik',floor:2,share:.3,aliases:['Technikraum','Technik']},{key:'bath',name:'Bad',short:'Bad',floor:1,share:.4,aliases:['Bad','Badezimmer']},{key:'guest',name:'Gäste-Bad',short:'Gäste-Bad',floor:0,share:.3,aliases:['Gäste-Bad','Gästebad','Gäste-WC','Gästetoilette','WC']}].map((z,i)=>{
   const t=zoneReading(registry,states,z.aliases,'temperature',c[z.key+'_temp']||(z.key==='bath'&&states['sensor.bd_temp']?'sensor.bd_temp':null));
   const h=zoneReading(registry,states,z.aliases,'humidity',c[z.key+'_humidity']);
   return {...z,color:colors[i],temp:p.demo?[22.6,23.1,20.4][i]:t.value,humidity:p.demo?[44,68,51][i]:h.value,flow:Number.isFinite(flow)?flow*z.share:NaN,tempSource:t.id,humiditySource:h.id};
  });
  const outsideId=c.outside||p.config?.overview?.outside;
  const weatherStates=Object.entries(states).filter(([id])=>id.startsWith('weather.'));
  const outside=outsideId?states[outsideId]:states['weather.home']??(weatherStates.length===1?weatherStates[0][1]:states['sensor.wohnzimmer_outdoor_temperatur']);
  const weather=outside?.attributes?.temperature;
  const outsideValue=!outside||['unknown','unavailable'].includes(outside.state)?NaN:weather!==undefined?temperature({state:weather,attributes:{unit_of_measurement:outside.attributes.temperature_unit}}):temperature(outside);
  let runtime=read(c.runtime);const unit=states[c.runtime]?.attributes?.unit_of_measurement;if(['s','sec'].includes(unit))runtime/=3600;else if(['min','minutes'].includes(unit))runtime/=60;
  return {stage,known,zones,flow,rpm,voltage:p.demo?metrics.voltage:Number.isFinite(p.volts)?p.volts:metrics.voltage,remaining:p.remaining,outside:p.demo?8.4:outsideValue,filter:p.demo?63:read(c.filter),runtime:p.demo?6.7:runtime,flowEstimated:!p.demo&&!Number.isFinite(actualFlow),rpmEstimated:!p.demo&&!Number.isFinite(actualRPM),humidityAuto:p.demo?this.demoAuto!==false:states[c.humidity_auto]?.state==='on',nightLow:p.demo?!!this.demoNight:states[c.night_low]?.state==='on',config:c};
 }
 view(){return `<svg class="ventilation-page" viewBox="0 0 1080 710" preserveAspectRatio="xMinYMin meet" role="group" aria-label="Lüftung · Abluftanlage">
 <defs><clipPath id="vent-inside"><rect x="432" y="45" width="308" height="402" rx="20"/></clipPath><pattern id="vent-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="#9999ff" stroke-width=".6"/></pattern></defs>
 <text x="0" y="37" class="vent-title">Lüftung · Abluftanlage</text>
 <rect x="800" y="18" width="140" height="22" fill="#ff9966"/>${label('mode',935,34,13,'#000','end')}<rect x="944" y="18" width="136" height="22" fill="#ffcc99"/>${label('outside',1075,34,13,'#000','end')}
 <text x="0" y="75" font-size="22" fill="#ff9966">Raumabluft · 3 Zonen</text>
 ${[0,1,2].map(i=>{const y=90+i*110;return `<g data-vent-zone="${i}"><path d="M30 ${y}H20a20 20 0 0 0 0 40h10Z" fill="${colors[i]}"/><rect x="34" y="${y}" width="40" height="40" fill="#ffcc99"/><text x="70" y="${y+34}" text-anchor="end" fill="#000" font-size="15">E${2-i}</text><rect x="78" y="${y}" width="180" height="40" fill="${colors[i]}"/><text x="253" y="${y+34}" text-anchor="end" fill="#000" font-size="17">${['Technikraum','Bad','Gäste-Bad'][i]}</text><rect x="262" y="${y}" width="60" height="40" fill="#ff9966"/><text x="317" y="${y+34}" fill="#000" text-anchor="end" font-size="13">Abluft</text>${label('flow'+i,328,y+38,40,colors[i])}<text x="375" y="${y+36}" fill="#cc99cc" font-size="12">m³/h</text><g data-vent-humidity="${i}"><rect x="34" y="${y+46}" width="74" height="40" fill="#cc99cc"/><text x="104" y="${y+80}" fill="#000" text-anchor="end" font-size="13">Feuchte</text>${label('humidity'+i,114,y+82,43)}</g><rect x="206" y="${y+46}" width="50" height="40" fill="#9999ff"/><text x="252" y="${y+80}" fill="#000" text-anchor="end" font-size="13">Temp</text>${label('temp'+i,264,y+82,42,'#ff9966')}</g>`;}).join('')}
 ${button('vent-auto','Feuchte-Automatik umschalten','<rect data-vent-auto="humidity_auto" x="0" y="410" width="190" height="33" rx="16"/><text x="180" y="432" fill="#000" text-anchor="end" font-size="14">Feuchte-Auto ≥ 70 %</text>')}
 ${button('vent-night','Nacht-Low umschalten','<rect data-vent-auto="night_low" x="195" y="410" width="185" height="33" rx="16"/><text x="370" y="432" fill="#000" text-anchor="end" font-size="14">Nacht-Low 22–6 Uhr</text>')}
 <rect data-vent-filter x="0" y="447" width="190" height="22" rx="11" fill="#ffcc99"/>${label('filter',180,463,14,'#000','end')}${label('ready',380,464,17,'#ffcc99','end')}
 <path d="M740 25H448Q400 25 400 73V419Q400 467 448 467H740V447H460Q432 447 432 419V73Q432 45 460 45H740Z" fill="#ff9966"/>
 <rect x="400" y="170" width="32" height="90" fill="#ffcc99"/><text transform="translate(421 215) rotate(-90)" text-anchor="middle" fill="#000" font-size="14">Luftweg</text><rect data-vent-operation-block x="400" y="264" width="32" height="94" fill="#9999ff"/><g transform="translate(421 311) rotate(-90)">${label('operation',0,0,14,'#000','middle')}</g>
 <path d="M554 25v20m98-20v20M602 447v20" stroke="#000" stroke-width="4"/>${label('small-stage',647,40,13,'#000','end')}${label('exhaust',736,40,13,'#000','end')}<text x="596" y="462" fill="#000" text-anchor="end" font-size="13">Dachspitz › ins Freie</text>${label('total-flow',735,462,13,'#000','end')}
 <g clip-path="url(#vent-inside)"><g class="vent-house-content" transform="translate(-194.32 -53.04) scale(1.28 1.12)"><g class="vent-building"><path d="M494 225L612 124L724 225M508 214V431H710V214M508 261H710M508 340H710M538 183H688"/><path d="M494 432H724v8H494Z" fill="url(#vent-hatch)"/></g>
 ${[0,1,2].map(i=>`<g><rect data-vent-room="${i}" x="578" y="${183+i*79}" width="100" height="79" fill="${colors[i]}" stroke="#cc99cc" stroke-opacity=".4"/><text x="582" y="${197+i*79}" fill="${colors[i]}" font-size="12">${['Technik','Bad','Gäste-Bad'][i]}</text>${label('room-humidity'+i,672,255+i*79,12,colors[i],'end')}<rect x="596" y="${202+i*79}" width="10" height="13" fill="#000" stroke="#99ccff"/><path d="M598 ${205+i*79}h6m-6 3h6m-6 3h6" stroke="#99ccff"/></g>`).join('')}
 ${[0,1,2].map(i=>`<path data-vent-path="${i}" d="${ventilationRoute(i).d}"/><path class="vent-duct-inner" d="${ventilationRoute(i).d}"/>`).join('')}
 <g data-vent-particles pointer-events="none"></g><circle cx="612" cy="166" r="15" fill="#000" stroke="#99ccff" stroke-width="2"/>
 ${rotor(612,166,13,'data-vent-small class="vent-small-rotor"')}<path d="M599 97h26m-23-5h20" stroke="#99ccff" stroke-width="3"/><text x="497" y="136" fill="#ffcc99" font-size="12">Dachspitz</text><text x="497" y="150" fill="#ffcc99" font-size="12">Lüfter</text><path d="M526 154L559 166H596" fill="none" stroke="#ffcc99" stroke-width=".7"/>
 </g></g>
 <path d="M1080 57H831Q760 57 760 126V405Q760 467 831 467H1080V447H827Q800 447 800 420V104Q800 77 827 77H1080Z" fill="#cc99cc"/>
 <text x="817" y="123" font-size="48" fill="#ff9966">Status</text>
 <g transform="translate(888 226)">${Array.from({length:24},(_,i)=>`<path d="${segmentPath(i)}" fill="none" stroke="#262626" stroke-width="12"/>`).join('')}<g data-vent-ring-highlight visibility="hidden">${Array.from({length:7},(_,i)=>`<path d="${segmentPath((24-i)%24)}" fill="none" stroke="${i===0?'#ffcc99':i<=3?'#ff9966':'#7a4a36'}" stroke-width="12"/>`).join('')}</g></g>
 ${rotor(888,226,58,'data-vent-large class="vent-large-rotor"')}
 <rect x="997" y="141" width="36" height="146" fill="#000" stroke="#cc99cc" stroke-width="1.5"/>
 ${Array.from({length:10},(_,i)=>`<rect data-vent-load="${i}" x="1001" y="${273-i*13}" width="28" height="10" rx="2" fill="#262626"/>`).join('')}<text x="1015" y="306" text-anchor="middle" font-size="12" fill="#cc99cc">Last</text>${label('large-stage',888,321,24,'#ffcc99','middle')}
 ${['Volumen','Spannung','Drehzahl','Laufzeit heute'].map((name,i)=>`<rect x="817" y="${333+i*27}" width="116" height="23" fill="#ff9966"/><text x="929" y="${350+i*27}" font-size="13" fill="#000" text-anchor="end">${name}</text><rect x="937" y="${333+i*27}" width="133" height="23" fill="#99ccff"/>${label('metric'+i,1065,350+i*27,14,'#000','end')}`).join('')}
 ${label('estimates',1068,444,10,'#cc99cc','end')}
 <path d="M28 483H14a11 11 0 0 0 0 22h14Z" fill="#cc99cc"/>${label('voltage-title',38,502,22)}<rect x="252" y="483" width="828" height="22" rx="11" fill="#cc99cc"/>
 ${names.map((name,i)=>button('vent:'+i,'Lüftungsstufe '+name,`<rect data-vent-stage="${i}" x="${i*217}" y="513" width="212" height="88" rx="${i===0||i===4?28:0}" fill="#9999ff"/>${i===0?'<rect data-vent-stage="0" x="106" y="513" width="106" height="88" fill="#9999ff"/>':i===4?'<rect data-vent-stage="4" x="868" y="513" width="106" height="88" fill="#9999ff"/>':''}${rotor(i*217+181,539,14,'class="vent-stage-icon"')}${i===0?'<path d="M162 522l32 32" stroke="#000" stroke-width="2.5"/>':''}<text x="${i*217+195}" y="591" text-anchor="end" fill="#000" font-size="42">${name}</text>`)).join('')}
 <path d="M28 618H14a11 11 0 0 0 0 22h14Z" fill="#cc99cc"/><text x="38" y="637" font-size="22" fill="#ffcc99">Stoßlüftung · Timer</text><rect x="278" y="618" width="802" height="22" rx="11" fill="#cc99cc"/>
 ${label('countdown',0,690,58,'#ff9966')}${Array.from({length:18},(_,i)=>`<rect data-vent-timer="${i}" x="${160+i*33}" y="656" width="29" height="35" fill="#262626"/>`).join('')}
 ${button('timer:0','Stoßlüftung um zehn Minuten verlängern','<rect x="766" y="646" width="146" height="53" rx="20" fill="#ffcc99"/><text x="839" y="681" text-anchor="middle" font-size="25" fill="#000">+10 Min</text>')}
 ${button('timer:1','Stoßlüftung stoppen','<rect x="919" y="646" width="161" height="53" rx="20" fill="#e4685c"/><text x="999" y="681" text-anchor="middle" font-size="25" fill="#000">Stop</text>')}
 </svg>`;}
 update(main){
  if(this.panel.page!==2){this.stop();return;}
  const svg=main.querySelector('.ventilation-page');if(!svg)return;
  if(this.svg!==svg){this.stop();this.svg=svg;this.paths=[0,1,2].map(ventilationRoute);this.particleLayer=svg.querySelector('[data-vent-particles]');this.rotors=[...svg.querySelectorAll('[data-vent-small] [data-vent-rotor],[data-vent-large] [data-vent-rotor]')];this.ring=svg.querySelector('[data-vent-ring-highlight]');this.lastSpawn=[0,0,0];}
  this.current=this.data();const d=this.current;
  const signature=JSON.stringify([d.stage,d.zones,d.flow,d.rpm,d.voltage,d.remaining>0,d.outside,d.filter,d.runtime,d.humidityAuto,d.nightLow,[0,1,2,3,4].map(i=>this.panel.canSetLevel(i)),this.panel.timer?.state,this.panel.demoBaseLevel,[d.config.humidity_auto,d.config.night_low].map(id=>[id,this.panel.state(id)?.state])]);
  if(this.signature===signature)return;
  this.signature=signature;
  const text=(key,value)=>{const n=svg.querySelector(`[data-vent-text="${key}"]`);if(n&&n.textContent!==value)n.textContent=value;};
  const stage=d.known?names[d.stage].toUpperCase():'—',boost=d.remaining>0;
  if(d.known&&(!boost||d.stage<4))this.baseStage=d.stage;
  const base=this.panel.demoBaseLevel??this.baseStage;
  text('mode',!d.known?'Keine Daten':boost?'Stoßlüftung':d.stage===0?'Lüfter aus':'Betrieb normal');text('outside','Außen '+number(d.outside,1)+'°');text('small-stage',(boost?'Stoß · ':'Stufe ')+stage);text('large-stage',(boost?'Stoß · ':'Stufe ')+stage);text('exhaust',d.stage>0?'Abluft aktiv':'Abluft still');text('operation',!d.known?'—':boost?'Stoß':d.stage===0?'Still':'Normal');
  text('total-flow',number(d.flow)+' m³/h');text('voltage-title','Hauslüftung · '+number(d.voltage)+' V');
  d.zones.forEach((z,i)=>{text('flow'+i,number(z.flow));text('humidity'+i,number(z.humidity)+' %');text('temp'+i,number(z.temp,1)+'°');text('room-humidity'+i,number(z.humidity)+' %');svg.querySelector(`[data-vent-humidity="${i}"]`).classList.toggle('vent-warning',z.humidity>=70);svg.querySelector(`[data-vent-room="${i}"]`).setAttribute('fill-opacity',d.stage>0?.14+d.stage*.03:.06);});
  text('metric0',number(d.flow)+' m³/h');text('metric1',number(d.voltage)+' V');text('metric2',number(d.rpm)+' U/min');text('metric3',Number.isFinite(d.runtime)?Math.floor(d.runtime)+':'+String(Math.floor((d.runtime%1)*60)).padStart(2,'0')+' h':'—');text('estimates',d.flowEstimated||d.rpmEstimated?'Volumen / Drehzahl: Kennwerte':'');
  text('filter',Number.isFinite(d.filter)?d.filter>=85?'Filter wechseln · '+number(d.filter)+' %':'Filter '+number(d.filter)+' % · OK':'Filter · —');svg.querySelector('[data-vent-filter]').setAttribute('fill',d.filter>=85?'#ffcc33':'#ffcc99');text('ready',d.known?'System bereit':'Stufe unbekannt');
  ['humidity_auto','night_low'].forEach((key,i)=>{const n=svg.querySelector(`[data-vent-auto="${key}"]`),state=this.panel.state(d.config[key]);n.setAttribute('fill',d[i?'nightLow':'humidityAuto']?(i?'#ffcc99':'#ff9966'):'#222');const button=n.parentElement;button.setAttribute('aria-pressed',String(d[i?'nightLow':'humidityAuto']));button.setAttribute('aria-disabled',String(!this.panel.demo&&(!state||['unavailable','unknown'].includes(state.state))));});
  svg.querySelectorAll('[data-vent-stage]').forEach(n=>{const i=Number(n.dataset.ventStage);n.setAttribute('fill',i===d.stage?'#ff9966':boost&&i===base?'#b9b9ff':'#9999ff');n.parentElement.setAttribute('aria-pressed',String(i===d.stage));n.parentElement.setAttribute('aria-disabled',String(!this.panel.canSetLevel(i)));});
  svg.querySelectorAll('[data-action^="timer:"]').forEach(n=>n.setAttribute('aria-disabled',String(!this.panel.demo&&(!this.panel.timer||['unknown','unavailable'].includes(this.panel.timer.state)))));
  svg.querySelectorAll('[data-vent-load]').forEach((n,i)=>n.setAttribute('fill',i<Math.ceil(Math.max(0,d.stage)*2.5)?['#9999ff','#88bbee','#88dded','#ffcc99','#ff9966'][Math.min(4,Math.floor(i/2))]:'#262626'));
  if(!svg.dataset.bound){svg.dataset.bound='true';svg.addEventListener('keydown',e=>{const b=e.target.closest('[role="button"]');if(b&&['Enter',' '].includes(e.key)){e.preventDefault();b.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));}});}
  this.tick();if(!this.frame)this.frame=requestAnimationFrame(t=>this.animate(t));
 }
 tick(){if(!this.svg?.isConnected)return;const seconds=this.panel.remaining;this.svg.querySelector('[data-vent-text="countdown"]').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');const count=Math.ceil(seconds/600);this.svg.querySelectorAll('[data-vent-timer]').forEach((n,i)=>{n.setAttribute('fill',i<count?'#ff9966':'#262626');n.classList.toggle('vent-timer-current',seconds>0&&i===count-1);});}
 animate(now){
  this.frame=0;if(!this.svg?.isConnected||this.panel.page!==2){this.stop();return;}
  if(document.hidden){this.lastTime=now;this.particleTime=now;this.frame=requestAnimationFrame(t=>this.animate(t));return;}
  const dt=Math.min(.1,Math.max(0,(now-(this.lastTime??now))/1000));this.lastTime=now;
  const d=this.current,target=[0,120,260,430,700][d.stage]??0;
  this.velocity+=(target-this.velocity)*(1-Math.exp(-dt*1.2));if(target===0&&this.velocity<.05)this.velocity=0;
  this.angle=(this.angle+this.velocity*dt)%360;
  const rotation=`rotate(${this.angle.toFixed(2)}deg)`;
  for(const node of this.rotors??[])node.style.transform=rotation;
  if(this.ring){this.ring.style.transform=rotation;const visible=this.velocity>=1;if(visible!==this.ringVisible){this.ring.setAttribute('visibility',visible?'visible':'hidden');this.ringVisible=visible;}}
  // Rotor stays at display refresh rate; the lighter airflow layer runs at 30 fps.
  if(this.particleTime===undefined||now-this.particleTime>=1000/30){
   const particleDT=Math.min(.15,(now-(this.particleTime??now))/1000);this.particleTime=now;
   if(d.stage>0)d.zones.forEach((z,i)=>{const rate=[0,2.2,3.6,5.5,8][d.stage]*z.share*1.5;if(now-this.lastSpawn[i]>1000/rate&&this.particles.length<30){this.lastSpawn[i]=now;let node=this.pool.pop();if(!node){node=document.createElementNS('http://www.w3.org/2000/svg','circle');node.setAttribute('r','2.4');}node.setAttribute('fill',colors[i]);this.particleLayer.append(node);this.particles.push({node,zone:i,distance:0});}});
   const speed=this.velocity/700*150;
   this.particles=this.particles.filter(p=>{p.distance+=speed*particleDT;const path=this.paths[p.zone];if(p.distance>=path.length){p.node.remove();this.pool.push(p.node);return false;}const point=ventilationPosition(path,p.distance);p.node.setAttribute('cx',(point.x+(p.distance>path.length-35?Math.sin(now/300+p.zone)*(p.distance-path.length+35)/12:0)).toFixed(2));p.node.setAttribute('cy',point.y.toFixed(2));p.node.setAttribute('opacity',(Math.max(0,Math.min(1,p.distance/14,(path.length-p.distance)/50))*(target===0?Math.min(1,this.velocity/70):1)).toFixed(2));return true;});
  }
  if(this.velocity===0)for(const p of this.particles.splice(0)){p.node.remove();this.pool.push(p.node);}
  if(target||this.velocity||this.particles.length)this.frame=requestAnimationFrame(t=>this.animate(t));
 }
 stop(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.lastTime=undefined;this.particleTime=undefined;this.signature=undefined;this.ringVisible=undefined;for(const p of this.particles)p.node.remove();this.particles=[];this.pool=[];this.rotors=[];this.ring=null;this.svg=null;}
 async toggle(kind){const key=kind==='auto'?'humidity_auto':'night_low';if(this.panel.demo){if(kind==='auto')this.demoAuto=this.demoAuto===false;else this.demoNight=!this.demoNight;}else if(this.panel.config?.vent?.[key])await this.panel.call(this.panel.config.vent[key],'toggle');}
}
