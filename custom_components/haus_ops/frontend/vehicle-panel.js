import {vehicleFields,discoverVehicle,vehicleAvailable,vehicleNumber,pressureBar,vehicleTemperature,distanceKm,aggregateOpen,remainingChargeHours,nextChargeLimit,maskedVehicleVIN,validateVehicleBlueprint} from './vehicle-model.js?v=1.6.63&r=2';
export {vehicleFields};
export const vehiclePageIndex=12;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const num=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const on=s=>vehicleAvailable(s)?['on','open','opening','unlocked','recording'].includes(s.state):undefined;
const coverOpen=s=>vehicleAvailable(s)?['open','opening'].includes(s.state)?true:s.state==='closed'?false:undefined:undefined;
const binaryText=v=>v===true?'An':v===false?'Aus':'—';
const closedText=v=>v===true?'Offen':v===false?'Zu':'—';
const clock=v=>Number.isFinite(v)?Math.floor(Math.round(v*60)/60)+':'+String(Math.round(v*60)%60).padStart(2,'0')+' h':'—';
const heat=s=>!vehicleAvailable(s)?NaN:s.attributes?.options?.includes(s.state)?Math.min(3,s.attributes.options.indexOf(s.state)):({off:0,aus:0,low:1,medium:2,high:3})[s.state]??NaN;
const field=(key,x,y,size=17,fill='#ffcc99',anchor='start')=>`<text data-v="${key}" x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">—</text>`;
function control(action,x,y,w,label,round=false){return `<g class="vehicle-button" data-action="vehicle-${action}" role="button" tabindex="0" aria-label="${label}"><rect x="${x}" y="${y}" width="${w}" height="36" rx="${round?18:2}" fill="${round?'#cc99cc':'#ff9966'}"/><rect class="vehicle-hold-fill" x="${x}" y="${y}" width="${w}" height="36" fill="#fff" fill-opacity=".3" pointer-events="none"/>${field('button-'+action,x+w/2,y+24,17,'#000','middle')}<text class="vehicle-hold-note" x="${x+w/2}" y="${y+32}" text-anchor="middle" font-size="8" fill="#000">1,2 s halten</text></g>`;}
export class VehiclePanel{
 constructor(panel){this.panel=panel;this.cache=new Map();this.token=0;}
 load(){if(this.loading||this.defaults)return;this.loading=true;fetch(new URL('./vehicle-config.json?v=1.6.63&r=2',import.meta.url),{credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(validateVehicleBlueprint).then(c=>{this.defaults=c;this.panel.render();}).catch(()=>{this.error='Fahrzeug-Konfiguration konnte nicht geladen werden.';this.panel.render();});}
 blueprint(){return this.panel.config?.vehicle?.blueprint??this.defaults;}
 bindings(){return discoverVehicle(this.panel.circuits.registry,{...(this.blueprint()?.entities??{}),...this.panel.config?.vehicle}).bindings;}
 data(){
  this.panel.circuits.load();
  const registry=this.panel.circuits.registry??{},found=discoverVehicle(registry,{...(this.blueprint()?.entities??{}),...this.panel.config?.vehicle}),map=found.bindings;
  const all=this.panel.ha?.states??{};
  if(this.panel.demo)return this.demoData();
  const raw=key=>all[map[key]],read=key=>{const id=map[key],s=all[id];if(vehicleAvailable(s)){this.cache.set(id,s);return s;}return this.cache.get(id)??s;};
  const number=key=>vehicleNumber(read(key));
  const inside=vehicleAvailable(read('inside'))?vehicleTemperature(read('inside')):Number(read('climate')?.attributes?.current_temperature??NaN);
  const online=on(raw('online')),climateState=read('climate'),climate=vehicleAvailable(climateState)?climateState.state!=='off':undefined;
  const initialized=online!==undefined||Number.isFinite(number('battery'))||Number.isFinite(number('range'))||Number.isFinite(inside);
  const chargeState=read('charging')?.state,charging=chargeState==='charging'||chargeState==='starting'||(!vehicleAvailable(read('charging'))&&number('power')>0);
  const front=['fl','fr'].map(k=>read('window_'+k)),rear=['rl','rr'].map(k=>read('window_'+k));
  const windows=aggregateOpen([...front,...rear])??coverOpen(read('windows'));
  const doors=aggregateOpen(['fl','fr','rl','rr'].map(k=>read('door_'+k)));
  const temperatures={inside,outside:vehicleTemperature(read('outside'))};
  const climateUnit=climateState?.attributes?.temperature_unit??this.panel.ha?.config?.unit_system?.temperature;
  const targetRaw=Number(climateState?.attributes?.temperature??NaN),target=climateUnit==='°F'?(targetRaw-32)*5/9:targetRaw;
  const tire=['fl','fr','rl','rr'].map(k=>{const value=pressureBar(read('tire_'+k));return {value,warning:value<2.6||on(read('tire_warning_'+k))===true};});
  let power=number('power');if(read('power')?.attributes?.unit_of_measurement==='W')power/=1000;
  let energy=number('energy');if(read('energy')?.attributes?.unit_of_measurement==='Wh')energy/=1000;
  const software=read('software')?.attributes?.installed_version??'—';
  const status=({charging:'Lädt',starting:'Startet',stopped:'Gestoppt',complete:'Fertig',disconnected:'Getrennt',no_power:'Kein Strom'})[chargeState]??'—';
  const timestamps=Object.entries(map).filter(([key,id])=>!['wake','flash'].includes(key)&&id?.startsWith('sensor.')).map(([,id])=>{const s=this.cache.get(id)??all[id];return vehicleAvailable(s)?Date.parse(s.last_updated):NaN;}).filter(Number.isFinite);
  const last=timestamps.length?Math.max(...timestamps):NaN;
  const phasesState=read('phases'),phases=map.phases?.startsWith('binary_sensor.')?on(phasesState)===true?'Mehrphasig':on(phasesState)===false?'1 Ph':'—':Number.isFinite(number('phases'))?num(number('phases'))+' Ph':'—';
  const cableState=read('cable'),connected=map.cable?.startsWith('binary_sensor.')?on(cableState):vehicleAvailable(cableState)?!['none','<invalid>','disconnected',''].includes(cableState.state.toLowerCase()):undefined;
  return {...found,map,read,online,initialized,stale:online!==true,charging,status,battery:number('battery'),range:distanceKm(read('range')),limit:number('limit'),...temperatures,target,seatLeft:heat(read('seat_left')),seatRight:heat(read('seat_right')),steering:heat(read('steering')),climate,preconditioning:on(read('preconditioning')),windows,front:aggregateOpen(front),rear:aggregateOpen(rear),doors,frunk:initialized?coverOpen(read('frunk')):undefined,trunk:initialized?coverOpen(read('trunk')):undefined,port:initialized?coverOpen(read('charge_port')):undefined,locked:vehicleAvailable(read('lock'))?read('lock').state==='locked'?true:read('lock').state==='unlocked'?false:undefined:undefined,sentry:on(read('sentry')),dashcam:on(read('dashcam')),present:on(read('present')),tire,power,voltage:number('voltage'),current:number('current'),energy,full:remainingChargeHours(read('full')),phases,connected,odometer:distanceKm(read('odometer')),speed:distanceKm(read('speed')),gear:vehicleAvailable(read('gear'))?read('gear').state.toUpperCase():'—',location:vehicleAvailable(read('location'))?read('location').state==='home'?'Zuhause':read('location').state==='not_home'?'Unterwegs':read('location').state:'—',destination:vehicleAvailable(read('destination'))?read('destination').state:'—',distance:distanceKm(read('distance')),arrivalBattery:number('arrival_battery'),software,update:read('software')?.state==='on',vin:maskedVehicleVIN(found.device),last};
 }
 demoData(){return {map:{},read:()=>undefined,online:true,initialized:true,stale:false,charging:true,status:'Lädt',battery:43,range:181,limit:80,inside:25.6,outside:21.5,target:21,seatLeft:2,seatRight:0,steering:0,climate:false,preconditioning:false,windows:false,front:false,rear:false,doors:false,frunk:false,trunk:false,port:true,locked:true,sentry:false,dashcam:true,present:false,tire:[2.9,2.9,2.8,2.8].map(value=>({value,warning:false})),power:11,voltage:400,current:16,energy:8.4,full:2+1/60,phases:'3 Ph',connected:true,odometer:13130,speed:0,gear:'P',location:'Zuhause',destination:'—',distance:NaN,arrivalBattery:NaN,software:'2026.14.6',update:false,vin:'···0001',last:Date.now(),...this.demoOverrides};}
 view(){this.load();const c=this.blueprint();if(!c)return `<svg class="vehicle-page" viewBox="0 0 1280 750"><text x="40" y="80" fill="#ffcc99" font-size="28">${this.error??'Fahrzeugdaten laden …'}</text></svg>`;
 const image=c.image.src.startsWith('/')?c.image.src:new URL('./'+c.image.src,import.meta.url).href;
 const leaders=c.leaders.map((l,i)=>{const left=l.side==='left',origin=left?400:852,x=left?390:862;return `<g class="vehicle-leader" style="--lead-delay:${i*70}ms"><path d="M${origin} ${l.textY-5}H${l.bendX}V${l.y}H${l.x}"/><circle cx="${origin}" cy="${l.textY-5}" r="5" fill="${l.color}"/><circle cx="${l.x}" cy="${l.y}" r="3" fill="${l.color}" stroke="#000" stroke-width=".7"/><text x="${x}" y="${l.textY}" text-anchor="${left?'end':'start'}" font-size="16" fill="${l.color}">${esc(l.name)} · <tspan data-v="lead-${l.key}" fill="#ffcc99">—</tspan></text></g>`;}).join('');
 const tiles=[['Laden','charge','limit'],['Sicherheit','lock','sentry'],['Klappen','frunk','trunk'],['Klima','climate','seat'],['Fenster','windows','flash']];
 return `<svg class="vehicle-page vehicle-start" viewBox="0 0 1280 750" role="group" aria-label="Fahrzeug · Model 3 mit Tesla-Fleet-Zuständen und Steuerung">
 <defs><clipPath id="vehicle-image-clip"><rect x="${c.image.x}" y="${c.image.y}" width="${c.image.width}" height="${c.image.height}"/></clipPath><linearGradient id="vehicle-scan"><stop stop-color="#99ccff" stop-opacity="0"/><stop offset=".5" stop-color="#99ccff" stop-opacity=".3"/><stop offset="1" stop-color="#99ccff" stop-opacity="0"/></linearGradient>${[['cabin','#99ccff'],['warm','#ff9966'],['yellow','#ffcc33']].map(([key,color])=>`<radialGradient id="vehicle-glow-${key}"><stop stop-color="${color}" stop-opacity=".8"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`).join('')}</defs>
 <circle cx="40" cy="38" r="20" fill="#cc99cc"/><text x="74" y="52" font-size="38" fill="#ff9966">Fahrzeug · ${esc(c.model??'Model 3')}</text><path class="vehicle-rail" d="M420 20H1242a18 18 0 0 1 0 36H420Z" fill="#cc99cc"/><text x="432" y="45" font-size="16" fill="#000">Tesla Fleet · Durchleuchtung</text>${field('metadata',1240,45,15,'#000','end')}
 <g class="vehicle-live"><path d="M235 70H34q-14 0-14 14v6h215Z" fill="#9999ff"/><text x="30" y="85" fill="#000" font-size="13">Energie · Akku</text>${field('battery',24,149,72,'#99ddbb')}${field('charging',26,173,16,'#ffaa00')}
 ${[['Reichweite','range'],['Ladelimit','limit'],['Innen','inside'],['Außen','outside'],['Kilometerstand','odometer'],['Zustand','gear']].map(([label,key],i)=>`<rect x="20" y="${184+i*50}" width="22" height="44" fill="${i%2?'#cc99cc':'#e8806a'}"/><text x="52" y="${197+i*50}" font-size="12" fill="#cc99cc">${label}</text>${field(key,52,225+i*50,28,i%2?'#99ccff':'#ffcc99')}`).join('')}
 ${Array.from({length:20},(_,i)=>`<rect data-vehicle-battery="${i}" x="196" y="${472-i*15}" width="30" height="12" rx="2" fill="#262626"/>`).join('')}<g data-vehicle-limit-marker><path d="M182 0l8 6l-8 6Z" fill="#99ccff"/><path d="M189 6h41" stroke="#99ccff"/></g>
 <path data-vehicle-lock-strip d="M20 492H235v38H50q-30 0-30-30Z" fill="#9999ff"/>${field('lock-strip',225,518,16,'#000','end')}</g>
 <g class="vehicle-live"><image class="vehicle-image" href="${esc(image)}" x="${c.image.x}" y="${c.image.y}" width="${c.image.width}" height="${c.image.height}" preserveAspectRatio="xMidYMid meet"/>
 <g class="vehicle-effects" clip-path="url(#vehicle-image-clip)"><ellipse data-vehicle-effect="cabin" cx="680" cy="318" rx="140" ry="55" fill="url(#vehicle-glow-cabin)"/><ellipse data-vehicle-effect="seat" cx="627" cy="345" rx="34" ry="40" fill="url(#vehicle-glow-warm)"/><ellipse data-vehicle-effect="frunk" class="vehicle-warning-pulse" cx="410" cy="335" rx="60" ry="26" fill="url(#vehicle-glow-yellow)"/><ellipse data-vehicle-effect="trunk" class="vehicle-warning-pulse" cx="862" cy="318" rx="48" ry="28" fill="url(#vehicle-glow-yellow)"/>
 <g class="vehicle-pack">${Array.from({length:18},(_,i)=>`<rect data-vehicle-pack="${i}" x="${528+i*11.4}" y="386" width="10" height="20" fill="#99ddbb" opacity="0"/>`).join('')}</g><g class="vehicle-scan"><rect x="330" y="200" width="110" height="286" fill="url(#vehicle-scan)"/></g>
 <g data-vehicle-flash><ellipse cx="388" cy="344" rx="25" ry="15" fill="url(#vehicle-glow-yellow)"/><ellipse cx="892" cy="322" rx="25" ry="15" fill="url(#vehicle-glow-warm)"/></g></g>
 <circle data-vehicle-port cx="875" cy="330" r="4" fill="#333"/><g data-vehicle-handles fill="#99ddbb"><circle cx="604" cy="314" r="3"/><circle cx="720" cy="314" r="3"/></g><g data-vehicle-sentry fill="#e8806a"><circle cx="677" cy="309" r="3"/><circle cx="520" cy="352" r="3"/></g>
 <rect x="940" y="236" width="34" height="60" rx="6" fill="#0b1820" stroke="#99ddbb" stroke-width="1.5"/><circle data-vehicle-wallbox-led cx="957" cy="254" r="4" fill="#555"/><text x="939" y="312" font-size="12" fill="#99ddbb">Wallbox</text><path class="vehicle-cable" d="M957 296C957 360 901 360 875 330"/><path class="vehicle-charge-flow" d="M957 296C957 360 901 360 875 330"/><path class="vehicle-battery-flow" d="M875 330L855 355L775 405H706"/>
 <rect x="917" y="200" width="80" height="27" fill="#000" stroke="#ffaa00"/>${field('wallbox-power',991,220,19,'#ffaa00','end')}
 ${leaders}<rect x="668" y="189" width="64" height="24" fill="#000" stroke="#99ccff"/>${field('inside-callout',700,207,17,'#99ccff','middle')}<rect x="740" y="495" width="70" height="24" fill="#000" stroke="#99ddbb"/>${field('soc-callout',775,513,17,'#99ddbb','middle')}
 </g>
 <g class="vehicle-specs"><circle cx="260" cy="473" r="10" fill="#cc99cc"/><text x="278" y="480" font-size="20" fill="#ff9966">Eckdaten · ${esc(c.model??'Model 3')}</text><rect x="470" y="463" width="120" height="20" rx="10" fill="#cc99cc"/><text x="582" y="478" text-anchor="end" font-size="12" fill="#000">${esc(c.year_label??'—')}</text>${c.specs.map(([name,value],i)=>`<text x="${i%2?422:250}" y="${504+Math.floor(i/2)*18}" font-size="14" fill="#cc99cc">${esc(name)} · <tspan fill="#ffcc99">${esc(value)}</tspan></text>`).join('')}</g>
 <path d="M1100 70H1220q40 0 40 40v380q0 40-40 40h-120v-14h113q27 0 27-29V113q0-27-27-27h-113Z" fill="#9999ff"/>
 <g class="vehicle-live"><text x="1016" y="110" font-size="27" fill="#ff9966">Reifendruck</text>${['VL','VR','HL','HR'].map((name,i)=>{const x=1016+(i%2)*111,y=122+Math.floor(i/2)*60;return `<g data-vehicle-tire="${i}"><rect x="${x}" y="${y}" width="104" height="54" rx="3" fill="#14212a"/><text x="${x+8}" y="${y+16}" font-size="12" fill="#cc99cc">${name}</text>${field('tire'+i,x+8,y+44,23,'#99ccff')}</g>`;}).join('')}
 <text x="1016" y="272" font-size="27" fill="#ff9966">Status</text>${['online','drive','speed','present','location','software'].map((key,i)=>field('status-'+key,1016,296+i*20,15)).join('')}<text x="1016" y="436" font-size="27" fill="#ff9966">Navigation</text>${['destination','distance','arrival'].map((key,i)=>field('nav-'+key,1016,460+i*20,15,'#cc99cc')).join('')}
 ${field('power-line',250,588,26,'#ffaa00')}${field('energy-line',530,588,26)}${field('full-line',760,588,26,'#99ddbb')}${field('electrical-line',950,588,24,'#99ccff')}</g>
 ${tiles.map(([name,a,b],i)=>{const x=20+i*249;return `<g class="vehicle-control-card"><path d="M${x+238} 600H${x+30}q-30 0-30 30v116h18V634q0-18 18-18h202Z" fill="#9999ff"/><text x="${x+30}" y="638" font-size="28" fill="#ffcc99">${name}</text>${[0,1,2].map(j=>field('tile'+i+'-'+j,x+30,659+j*18,13,'#cc99cc')).join('')}${control(a,x+30,710,103,a)}${control(b,x+137,710,104,b,true)}</g>`;}).join('')}
 </svg>`;
 }
 update(root,footer){
  const svg=root.querySelector('.vehicle-page');if(!svg)return;
  if(this.svg!==svg){this.cancelHold?.();this.svg=svg;this.updateSignature=undefined;}
  const wake=footer?.querySelector('[data-action="vehicle-wake"]');
  const rail=footer?.querySelector('.rail');
  const c=this.blueprint();
  if(!c){if(wake)wake.disabled=true;if(rail)rail.textContent=this.error??'Fahrzeugdaten laden …';return;}
  this.current=this.data();const d=this.current;
  const {device,read,last,full,...stable}=d;
  const signature=JSON.stringify([stable,Math.floor(last/60000),Math.round(full*60),this.busy,Object.values(d.map).map(id=>this.panel.ha?.states?.[id]?.attributes)]);
  if(signature===this.updateSignature)return;
  this.updateSignature=signature;
  const text=(key,value,warning=false)=>{const n=svg.querySelector(`[data-v="${key}"]`);if(n){const s=String(value);if(n.textContent!==s)n.textContent=s;n.classList.toggle('vehicle-warning-text',warning);}};
  svg.classList.toggle('stale',d.stale);svg.classList.toggle('charging',d.charging);svg.classList.toggle('connected',d.connected===true);svg.classList.toggle('vehicle-sentry-active',d.sentry===true);
  const time=Number.isFinite(d.last)?new Date(d.last).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—';
  const online=d.online===true?'Online':d.online===false?'Schläft':'Status —';
  text('metadata',`VIN ${d.vin} · SW ${d.software} · ${online}`);
  text('battery',num(d.battery)+' %',d.battery<20);text('charging',d.charging?'Lädt':'— '+(d.status==='Getrennt'?'Bereit':d.status));text('range',num(d.range)+' km');text('limit',num(d.limit)+' %');text('inside',num(d.inside,1)+'°');text('outside',num(d.outside,1)+'°');text('odometer',num(d.odometer)+' km');text('gear',d.gear+' · '+(d.gear==='P'?'Geparkt':['D','R','N'].includes(d.gear)?'Fahrt':'—'));
  text('lock-strip','Türen · '+(d.locked===true?'Verriegelt':d.locked===false?'Entriegelt':'—'),d.locked===false);svg.querySelector('[data-vehicle-lock-strip]')?.setAttribute('fill',d.locked===false?'#ffcc33':'#9999ff');
  svg.querySelectorAll('[data-vehicle-battery]').forEach((n,i)=>n.setAttribute('fill',i<Math.round(d.battery/5)?d.battery<20?'#ffcc33':'#77cc99':'#262626'));
  const marker=svg.querySelector('[data-vehicle-limit-marker]');marker?.setAttribute('transform',`translate(0 ${478-Math.max(0,Math.min(100,d.limit))*3-6})`);if(marker)marker.style.visibility=Number.isFinite(d.limit)?'visible':'hidden';
  const effects={cabin:d.climate===true?.7:0,seat:Number.isFinite(d.seatLeft)?d.seatLeft/3:0,frunk:d.frunk===true?.9:0,trunk:d.trunk===true?.9:0};
  svg.querySelectorAll('[data-vehicle-effect]').forEach(n=>n.style.opacity=String(effects[n.dataset.vehicleEffect]??0));
  const filled=Number.isFinite(d.battery)?Math.floor(d.battery/100*18):0;
  svg.querySelectorAll('[data-vehicle-pack]').forEach((n,i)=>{n.setAttribute('opacity',i<filled?'.45':'0');n.classList.toggle('vehicle-pack-charging',d.charging&&i===filled);});
  svg.querySelector('[data-vehicle-port]')?.setAttribute('fill',d.charging?'#ffaa00':d.port===true?'#99ddbb':'#333');
  svg.querySelector('[data-vehicle-handles]')?.setAttribute('fill',d.locked===true?'#99ddbb':d.locked===false?'#ffcc33':'#555');
  svg.querySelector('[data-vehicle-wallbox-led]')?.setAttribute('fill',d.charging?'#ffaa00':d.connected?'#99ddbb':'#555');
  text('wallbox-power',num(d.power,1)+' kW');
  const heatText=n=>Number.isFinite(n)?n?'Heizung '+n:'Aus':'—';
  const leads={cabin:d.climate===undefined?'—':d.climate?'Klima an · '+num(d.target,1)+'°':'Klima aus',roof:'Fest · UV-Schutz',seat:heatText(d.seatLeft),windows:d.windows===true?'Spalt':d.windows===false?'Alle zu':'—',steering:Number.isFinite(d.steering)?d.steering?'Heizt':'Aus':'—',pump:d.climate===undefined&&d.preconditioning===undefined?'—':d.climate||d.preconditioning?'Aktiv':'Standby',tire_fl:num(d.tire[0].value,1)+' bar',frunk:closedText(d.frunk),port:d.charging?'Lädt':closedText(d.port),trunk:closedText(d.trunk),tire_rl:num(d.tire[2].value,1)+' bar',range:num(d.range)+' km',sentry:binaryText(d.sentry),lock:d.locked===true?'Verriegelt':d.locked===false?'Entriegelt':'—'};
  for(const[key,value]of Object.entries(leads))text('lead-'+key,value,({windows:d.windows,frunk:d.frunk,trunk:d.trunk,lock:d.locked===false,tire_fl:d.tire[0].warning,tire_rl:d.tire[2].warning})[key]===true);
  text('inside-callout',num(d.inside,1)+'°');text('soc-callout',num(d.battery)+' %',d.battery<20);
  d.tire.forEach((t,i)=>{text('tire'+i,num(t.value,1)+' bar',t.warning);svg.querySelector(`[data-vehicle-tire="${i}"]`)?.classList.toggle('vehicle-tire-warning',t.warning);});
  text('status-online','Online · '+(d.online===true?'Ja':d.online===false?'Nein':'—'));
  text('status-drive','Gang · '+d.gear+(d.gear==='P'?' · Geparkt':''));text('status-speed','Tempo · '+num(d.speed)+' km/h');text('status-present','Fahrer · '+(d.present===true?'Anwesend':d.present===false?'Abwesend':'—'));text('status-location','Standort · '+String(d.location).slice(0,22));text('status-software',d.update?'Update bereit':'Software · '+String(d.software).slice(0,20),d.update);
  text('nav-destination','Ziel · '+String(d.destination).slice(0,24));text('nav-distance','Entfernung · '+num(d.distance,1)+(Number.isFinite(d.distance)?' km':''));text('nav-arrival','Akku bei Ankunft · '+num(d.arrivalBattery)+(Number.isFinite(d.arrivalBattery)?' %':''));
  text('power-line','Ladeleistung: '+num(d.power,1)+' kW');text('energy-line','Geladen: '+num(d.energy,1)+' kWh');text('full-line','Voll in: '+(d.charging?clock(d.full):'—'));text('electrical-line',d.charging?num(d.voltage)+' V · '+num(d.current)+' A · '+d.phases:d.connected===true?'Kabel steckt':d.connected===false?'Kabel —':'Kabel · —');
  const tileRows=[['Status · '+d.status,'Leistung · '+num(d.power,1)+' kW · '+num(d.current)+' A','Limit · '+num(d.limit)+' %'],['Schloss · '+leads.lock,'Wächter · '+leads.sentry,'Dashcam · '+(d.dashcam===true?'Aufnahme':d.dashcam===false?'Aus':'—')],['Türen · '+(d.doors===true?'Offen':d.doors===false?'Alle zu':'—'),'Frunk · '+leads.frunk,'Kofferraum · '+leads.trunk],['Innen · '+num(d.inside,1)+'° · Soll '+num(d.target,1)+'°','Sitz · L '+heatText(d.seatLeft)+' · R '+heatText(d.seatRight),'Lenkrad · '+leads.steering],['Vorne · '+closedText(d.front),'Hinten · '+closedText(d.rear),'Ladeklappe · '+closedText(d.port)]];
  tileRows.forEach((rows,i)=>rows.forEach((value,j)=>text('tile'+i+'-'+j,value)));
  const labels={charge:d.charging?'Stop':'Start',limit:'Limit +10',lock:d.locked===false?'Verriegeln':'Entriegeln',sentry:d.sentry?'Wächter aus':'Wächter an',frunk:'Frunk',trunk:d.trunk===true?'Schließen':'Kofferraum',climate:d.climate?'Klima aus':'Klima an',seat:'Sitz L +',windows:d.windows===true?'Schließen':'Lüften',flash:'Blinken'};
  for(const[action,label]of Object.entries(labels)){text('button-'+action,label);const n=svg.querySelector(`[data-action="vehicle-${action}"]`);if(n){const hold=this.needsHold(action,d);n.setAttribute('aria-label',label+(hold?' · 1,2 Sekunden halten':''));n.setAttribute('aria-disabled',String(!!this.busy||!this.plan(action,d)));n.classList.toggle('vehicle-needs-hold',hold);}}
  if(wake)wake.disabled=!!this.busy||!this.plan('wake',d);
  if(rail)rail.textContent=this.busy==='wake'?'Wecke Fahrzeug …':this.busy?'Befehl wird ausgeführt …':d.ambiguous?'Mehrere Fahrzeuge · in Einstellungen zuordnen':!Object.keys(d.map).length&&!this.panel.demo?'Tesla-Fleet-Entitäten in Einstellungen zuordnen':!d.initialized?'Noch keine Fahrzeugmesswerte · Aufwecken manuell':(d.stale?'Stand ':'Letzte Aktualisierung ')+time+' · '+(d.online===true?'Fahrzeug wach':d.online===false?'Fahrzeug schläft':'Fahrzeugstatus unbekannt');
  if(!svg.dataset.bound){svg.dataset.bound='true';this.bind(svg);}
 }
 needsHold(action,d=this.current){return action==='lock'&&d?.locked!==false||action==='frunk'&&d?.frunk!==true||action==='trunk'&&d?.trunk!==true;}
 plan(action,d=this.current){
  if(action==='back')return {action};if(!d)return null;
  if(this.panel.demo)return {entity:'demo.'+action,service:'demo'};
  const key=({seat:'seat_left',limit:'limit',wake:'wake',flash:'flash'})[action]??action,id=d.map[key];
  if(!id||!this.panel.ha?.states?.[id]||!vehicleFields.find(f=>f.key===key)?.domains.includes(id.split('.')[0]))return null;
  const state=d.read(key),features=state?.attributes?.supported_features??0;
  if(action!=='wake'&&(!d.map.online||!d.initialized))return null;
  if(action==='wake')return {entity:id,service:'press'};
  if(action==='flash')return {entity:id,service:'press'};
  if(action==='charge')return {entity:id,service:d.charging?'turn_off':'turn_on'};
  if(action==='limit'){const value=nextChargeLimit(state);return value===null?null:{entity:id,service:'set_value',data:{value}};}
  if(action==='lock')return d.locked===undefined?null:{entity:id,service:d.locked?'unlock':'lock'};
  if(action==='sentry')return d.sentry===undefined?null:{entity:id,service:d.sentry?'turn_off':'turn_on'};
  if(['frunk','trunk','windows'].includes(action)){const open=action==='windows'?d.windows:d[action];if(open===undefined||['opening','closing'].includes(state?.state))return null;const service=open?'close_cover':'open_cover';return features&(open?2:1)?{entity:id,service}:null;}
  if(action==='climate')return d.climate===undefined||features===0?null:{entity:id,service:d.climate?'turn_off':'turn_on'};
  if(action==='seat'){const options=state?.attributes?.options??[],index=options.indexOf(state?.state);return index<0||!options.length?null:{entity:id,service:'select_option',data:{option:options[(index+1)%options.length]}};}
  return null;
 }
 bind(svg){
  const cancel=()=>{if(!this.hold)return;clearTimeout(this.hold.timer);this.hold.node.classList.remove('vehicle-holding');this.hold=null;};
  this.bindingsAbort?.abort();this.bindingsAbort=new AbortController();
  window.addEventListener('blur',cancel,{signal:this.bindingsAbort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},{signal:this.bindingsAbort.signal});
  this.cancelHold=cancel;
  svg.addEventListener('click',e=>{const n=e.target.closest('[data-action]');if(n?.dataset.action==='vehicle-'+this.suppressedClick){this.suppressedClick=null;e.preventDefault();e.stopPropagation();}},true);
  const start=(node,pointer,x=0,y=0)=>{const action=node.dataset.action.slice(8);if(node.getAttribute('aria-disabled')==='true'||!this.needsHold(action))return false;cancel();this.suppressedClick=action;const expected=this.plan(action);node.classList.add('vehicle-holding');const timer=setTimeout(()=>{if(!this.hold||!node.isConnected)return;cancel();void this.act(action,true,expected);},1200);this.hold={node,pointer,x,y,timer};return true;};
  svg.addEventListener('pointerdown',e=>{this.suppressedClick=null;const n=e.target.closest('[data-action^="vehicle-"]');if(!n||e.button!==0||!e.isPrimary)return;if(start(n,e.pointerId,e.clientX,e.clientY)){e.preventDefault();n.setPointerCapture(e.pointerId);}});
  svg.addEventListener('pointermove',e=>{if(this.hold?.pointer===e.pointerId&&Math.hypot(e.clientX-this.hold.x,e.clientY-this.hold.y)>12)cancel();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,cancel);
  svg.addEventListener('keydown',e=>{if(e.key==='Escape'){cancel();return;}const n=e.target.closest('[data-action^="vehicle-"]');if(!n||!['Enter',' '].includes(e.key))return;e.preventDefault();if(e.repeat)return;this.suppressedClick=null;const action=n.dataset.action.slice(8);if(!start(n,'keyboard')&&!this.needsHold(action))n.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));});
  svg.addEventListener('keyup',e=>{if(['Enter',' '].includes(e.key))cancel();});svg.addEventListener('focusout',cancel);
 }
 async awake(token){
  if(this.panel.demo)return;
  if(this.data().online===true)return;
  const wake=this.plan('wake',this.data());if(!wake)throw Error('Aufwecken-Entität fehlt.');
  this.busy='wake';this.panel.render();await this.panel.call(wake.entity,wake.service);
  const start=Date.now();while(Date.now()-start<45000){if(token!==this.token||!this.opened)throw Error('Befehl abgebrochen.');if(this.data().online===true)return;await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error('Fahrzeug antwortet noch nicht. Bitte später erneut versuchen.');
 }
 async act(action,held=false,expected){
  if(this.busy)return;const d=this.data();if(this.needsHold(action,d)&&!held)return;const plan=this.plan(action,d);if(!plan||expected&&(plan.entity!==expected.entity||plan.service!==expected.service))return;
  const token=this.token;this.busy=action;this.panel.render();
  try{
   if(this.panel.demo){this.demoAction(action);}
   else if(action==='wake'){await this.awake(token);}
   else{await this.awake(token);if(token!==this.token)return;this.busy=action;this.panel.render();const fresh=this.plan(action,this.data());if(!fresh||fresh.entity!==plan.entity||fresh.service!==plan.service)throw Error('Fahrzeugzustand hat sich geändert. Bitte erneut prüfen.');await this.panel.call(fresh.entity,fresh.service,fresh.data??{});}
   if(action==='flash'&&this.svg){const node=this.svg.querySelector('[data-vehicle-flash]');node?.classList.remove('flashing');requestAnimationFrame(()=>node?.classList.add('flashing'));}
  }catch(error){if(this.opened)this.panel.notify(error.message||'Fahrzeugbefehl fehlgeschlagen.');}
  finally{this.busy=null;this.panel.render();}
 }
 demoAction(action){const d=this.demoData();this.demoOverrides??={};const changes={charge:{charging:!d.charging,status:d.charging?'Gestoppt':'Lädt'},limit:{limit:d.limit>=100?50:Math.min(100,d.limit+10)},lock:{locked:!d.locked},sentry:{sentry:!d.sentry},frunk:{frunk:!d.frunk},trunk:{trunk:!d.trunk},climate:{climate:!d.climate},seat:{seatLeft:(d.seatLeft+1)%4},windows:{windows:!d.windows,front:!d.windows,rear:!d.windows},wake:{online:true,stale:false}};Object.assign(this.demoOverrides,changes[action]??{});}
 close(){
  this.token++;
  this.cancelHold?.();
  this.bindingsAbort?.abort();
  this.opened=false;
  this.svg=null;
 }
}
