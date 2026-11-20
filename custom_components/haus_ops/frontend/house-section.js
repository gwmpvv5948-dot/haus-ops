import {livingMarkup,livingSonos,LivingAcoustics} from './house-living.js?v=1.6.63&r=20';
import {groundFloorSonosPlaying,cpuValue,cpuSparkline,inverterReading} from './house-telemetry.js?v=1.6.63&r=18';
import { roomNames } from './climate-panel.js';
import {resolveHouseData, validateHouseConfig, houseTemperatureColor, normalizeHouseName, houseWasher} from './house-model.js?v=1.6.63&r=19';
export const housePageIndex = 11;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const fmt = value => Number.isFinite(value) ? value.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+'°' : '—';
const points = room => room.polygon.map(point=>point.join(',')).join(' ');
const attrs = action => `role="button" tabindex="0" data-action="${esc(action)}"`;
const labelStatus = lamp => !lamp.available ? 'Offline' : !lamp.on ? 'Aus' : lamp.dim ? Math.round(lamp.brightness)+' %' : 'An';
const stair = (top,bottom,reverse) => {
  const left=566,right=612, step=(bottom-top)/14;
  return 'M'+(reverse?right:left)+','+top+Array.from({length:14},(_,i)=>`v${step}h${(reverse?-1:1)*(right-left)/14}`).join('');
};

export class HouseSection {
  constructor(panel) { this.panel=panel; this.acoustics=new LivingAcoustics(); this.selected=null; this.pending=new Set(); }

  load() {
    const path=this.panel.config?.house_section_config || new URL('./house-section.json?v=1.6.63&r=19',import.meta.url).href;
    if (this.path===path) return;
    this.path=path; this.config=null; this.current=null; this.error=''; this.layoutKey='';
    fetch(path,{credentials:'same-origin'}).then(response=>{
      if (!response.ok) throw Error('Konfiguration nicht erreichbar');
      return response.json();
    }).then(validateHouseConfig).then(config=>{
      if(this.path!==path) return;
      this.config=config; this.panel.render();
    }).catch(()=>{
      if(this.path!==path) return;
      this.error='Hausschnitt-Konfiguration konnte nicht geladen werden.'; this.panel.render();
    });
  }

  data() {
    if (this.panel.demo) {
      const areas=this.config.rooms.map(room=>({area_id:room.key,name:room.name,floor_id:'e'+room.floor}));
      const temperatures={roof:12.7,office:20.2,utility:22.8,bedroom:19.5,carla:21.7,bath:19.7,alwin:21.3,kitchen:21,living:20.9,garden:13.5};
      const states={},entities=[];
      this.config.rooms.forEach((room,index)=>{
        const id=room.temperature_entity || 'sensor.'+room.key+'_temperature';
        entities.push({entity_id:id,area_id:room.key});
        states[id]={state:String(temperatures[room.key]),attributes:{device_class:'temperature'}};
        (room.lamps ?? []).forEach((lamp,i)=>{
          const id='light.'+room.key+'_'+i;
          entities.push({entity_id:id,area_id:room.key});
          const on=room.floor===0 && (room.key==='kitchen' || i!==2);
          const name=lamp.aliases?.[0] ?? 'Licht';
          states[id]={state:room.key==='alwin'?'unavailable':this.demoLights?.get(id) ?? (on?'on':'off'),attributes:{friendly_name:name,brightness:i===0?153:255,supported_color_modes:['brightness']}};
        });
      });
      return resolveHouseData(this.config,{areas,entities,floors:[0,1,2,3].map(level=>({floor_id:'e'+level,level}))},states);
    }
    this.panel.circuits.load();
    const overrides = {};
    for (const room of this.config.rooms) {
      const aliases = [room.name,...(room.aliases ?? [])].map(normalizeHouseName);
      const index = roomNames.findIndex(name=>aliases.includes(normalizeHouseName(name)));
      if (index>=0) overrides[room.key] = this.panel.climatePanel.room(index).current;
      if (!Number.isFinite(overrides[room.key])) {
        const reading = this.panel.temperatures().find(value=>aliases.includes(normalizeHouseName(value.name)) && Number.isFinite(value.value));
        if (reading) overrides[room.key] = reading.value;
      }
    }
    const selections = this.panel.config?.house_section_lights ?? {};
    const configured = {...this.config,rooms:this.config.rooms.map(room=> {
      const selected=Object.prototype.hasOwnProperty.call(selections,room.key)?{...room,light_entities:selections[room.key]}:room;
      return room.key==='office' && this.panel.ha?.states?.['switch.schreibtisch'] ? {...selected, light_entities:[...new Set([...(selected.light_entities ?? room.lamps.filter(lamp=>lamp.entity_id).map(lamp=>lamp.entity_id)),'switch.schreibtisch'])]} : selected;
    })};
    return resolveHouseData(configured,this.panel.circuits.registry,this.panel.ha?.states,this.panel.ha?.connection?.connected!==false,overrides);
  }

  view() {
    this.load();
    if (!this.config) return `<svg class="house-section" viewBox="0 0 1280 746" aria-label="Hausschnitt"><text x="60" y="110" fill="#ffcc99" font-size="30">${esc(this.error || 'HA-Bereiche und Hausschnitt laden …')}</text></svg>`;
    const data=this.data();
    data.washer=houseWasher(this.panel.demo?{state:'85',attributes:{unit_of_measurement:'W'}}:this.panel.state(this.config.washer_power_entity || 'sensor.tasmota_wama_plug_energy_power'));
    this.refreshCPU();
    data.cpu=cpuValue(this.panel.state?.('sensor.ap_dg_cpu_utilization'));
    data.cpuRows=[...(this.cpuRows ?? []),...(this.panel.state?.('sensor.ap_dg_cpu_utilization')?[this.panel.state('sensor.ap_dg_cpu_utilization')]:[])];
    data.musicPlaying=this.panel.demo || groundFloorSonosPlaying(this.panel.circuits.registry,this.panel.ha?.states);
    const key=JSON.stringify([this.path,data.rooms.map(room=>[room.key,room.floor,room.lamps.map(lamp=>[lamp.id,lamp.type,lamp.position])])]);
    if (key!==this.layoutKey) {
      this.layoutKey=key; this.geometry=data; this.markup=this.build(data);
    }
    this.current=data;
    return this.markup;
  }

  build(data) {
    // Center the house between two clear room-information columns.
    const shift=0;
    const rooms=data.rooms.map(room=>room.outdoor?room:{...room,
      polygon:room.polygon.map(([x,y])=>[x+shift,y]),anchor:[room.anchor[0]+shift,room.anchor[1]],
      lamps:room.lamps.map(lamp=>({...lamp,position:[lamp.position[0]+shift,lamp.position[1]]}))});
    const floorSummary=[3,2,1,0].map((level,index)=>`<g transform="translate(0 ${index*18})"><text x="90" y="128" class="house-floor-name">Etage ${level} · ${['EG','OG','DG','Dachspitz'][level]}</text>${Array.from({length:10},(_,i)=>`<rect data-house-floor-temp="${level}" data-segment="${i}" x="${220+i*12}" y="115" width="10" height="13"/>`).join('')}<text data-house-floor-value="${level}" x="365" y="128"/><text data-house-floor-lights="${level}" x="415" y="128"/>${Array.from({length:data.floors.find(floor=>floor.level===level)?.lamps.length ?? 0},(_,i)=>{const count=data.floors.find(floor=>floor.level===level).lamps.length;const step=Math.min(10,62/count);return `<rect data-house-floor-lamp="${level}" data-segment="${i}" x="${485+i*step}" y="118" width="${Math.max(2,step-2)}" height="10" rx="1"/>`;}).join('')}</g>`).join('');
    const lamps=rooms.flatMap(room=>room.lamps.map(lamp=>({...lamp,room:room.key})));
    let lineOrder=0;
    const lead=(room,id,labelY,anchor,lamp=false)=>{
      const left=room.side==='left'; const origin=left?350:946; const bus=left?398-(lineOrder%10)*5:884+(lineOrder%11)*5;
      return `<g class="house-leader ${lamp?'lamp-leader':'room-leader'}" data-house-leader="${esc(id)}" data-house-owner="${room.key}" style="--lead-delay:${Math.min(lineOrder++,35)*70}ms"><path d="M${origin} ${labelY-5}H${bus}V${anchor[1]}H${anchor[0]}"/><circle cx="${origin}" cy="${labelY-5}" r="3"/><circle cx="${anchor[0]}" cy="${anchor[1]}" r="2.5"/></g>`;
    };
    const labels=['left','right'].map(side=>{
      const group=rooms.filter(room=>room.side===side).sort((a,b)=>a.anchor[1]-b.anchor[1]);
      const rowCount=room=>(room.key==='roof'?1:Math.max(1,room.lamps.length))+(room.key==='bath'?1:0)+(room.key==='utility'&&room.lamps.length?1:0);
      const rows=group.reduce((sum,room)=>sum+rowCount(room),0);
      const start=side==='left'?112:190;
      const available=700-start;
      const groupGap=24;
      const lineHeight=Math.max(26,Math.min(28,(available-group.length*24-Math.max(0,group.length-1)*groupGap)/Math.max(1,rows)));
      const blockHeights=group.map(room=>24+rowCount(room)*lineHeight);
      const gap=Math.max(groupGap,(available-blockHeights.reduce((a,b)=>a+b,0))/Math.max(1,group.length-1));
      let y=start;
      return group.map((room,index)=>{
        const x=side==='left'?338:958, left=side==='left';
        let markup=lead(room,room.key,y,room.anchor);
        if(index) markup+=`<path class="house-group-divider" d="M${left?160:958} ${y-27}h178"/>`;
        markup+=`<g class="house-room-label" data-house-owner="${room.key}" ${attrs('house-room:'+room.key)} aria-label="${esc(room.name)} · Raum auswählen"><rect x="${left?55:950}" y="${y-20}" width="305" height="28" fill="transparent"/><text ${room.key==='living'?'textLength="290" lengthAdjust="spacingAndGlyphs"':''} x="${x}" y="${y}" text-anchor="${left?'end':'start'}"><tspan fill="#cc99cc">${room.outdoor?'Außen':`E<tspan data-house-room-floor="${room.key}">${room.floor}</tspan>`} · </tspan><tspan>${esc(room.key==='roof'?'Warp-Kern-Temp.':room.name)} · </tspan><tspan data-house-room-temp="${room.key}">—</tspan></text></g>`;
        if (!room.lamps.length && !['roof','utility'].includes(room.key)) markup+=`<text data-house-room-missing="${room.key}" class="house-unmapped" x="${x}" y="${y+26}" text-anchor="${left?'end':'start'}">Licht · nicht erfasst</text>`;
        (room.lamps ?? []).forEach((lamp,i)=>{
          const ly=y+(i+1)*lineHeight;
          markup+=`<g class="house-lamp-label" data-house-lamp-label="${esc(lamp.id)}" data-house-owner="${room.key}" ${attrs('house-light:'+lamp.id)}><rect x="${left?55:950}" y="${ly-22}" width="305" height="26" fill="transparent"/><text data-house-lamp-text="${esc(lamp.id)}" x="${x}" y="${ly}" text-anchor="${left?'end':'start'}">${esc(lamp.name)} · —</text></g>`;
        });
        if(room.key==='roof') markup+=`<text class="house-lamp-label" data-house-inverter-output x="${x}" y="${y+lineHeight}" text-anchor="${left?'end':'start'}">Leistung · — · Heute · —</text>`;
        if(room.key==='utility') markup+=`<g class="house-cpu" aria-label="CPU-Auslastung AP DG · letzte 30 Minuten"><text class="house-lamp-label" data-house-cpu-value x="${x}" y="${y+(room.lamps.length+1)*lineHeight}">CPU · —</text><g transform="translate(${x+105} ${y+(room.lamps.length+1)*lineHeight-19})"><path d="M0 0V26H170" fill="none" stroke="#474052"/><path data-house-cpu-path fill="none" stroke="#99ccff" stroke-width="1.5"/></g></g>`;
        if(room.key==='bath') {
          const wy=y+(Math.max(1,room.lamps.length)+1)*lineHeight;
          markup+=`<text class="house-lamp-label" data-house-washer-status x="${x}" y="${wy}" text-anchor="${left?'end':'start'}">Waschmaschine · —</text>`;
        }
        y+=blockHeights[index]+gap;
        return markup;
      }).join('');
    }).join('');
    return `<svg class="house-section house-start" viewBox="0 0 1280 746" role="group" aria-label="Wohnhaus · Hausschnitt mit Temperaturen und Lichtsteuerung" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="house-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="7" height="7" fill="#241a30"/><path d="M0 0V7" stroke="#cc99cc" stroke-width="1.5"/></pattern>
        <pattern id="house-deck" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="7" height="7" fill="#1b2030"/><path d="M0 0V7" stroke="#9999ff" stroke-width="1.5"/></pattern>
        <linearGradient id="house-cone" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff0d8" stop-opacity=".95"/><stop offset="1" stop-color="#ffcc99" stop-opacity=".05"/></linearGradient>
        <radialGradient id="house-halo"><stop stop-color="#ffe9c8" stop-opacity=".85"/><stop offset=".45" stop-color="#ffcc99" stop-opacity=".4"/><stop offset="1" stop-color="#ffcc99" stop-opacity="0"/></radialGradient>
        <linearGradient id="house-scan" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#99ccff" stop-opacity="0"/><stop offset=".5" stop-color="#cdeaff" stop-opacity=".4"/><stop offset="1" stop-color="#99ccff" stop-opacity="0"/></linearGradient>
        <clipPath id="house-outline"><path transform="translate(0 0)" d="M438 414L640 222L842 414V650H438Z"/></clipPath>
        ${rooms.map(room=>`<clipPath id="house-room-${room.key}"><polygon points="${points(room)}"/></clipPath>`).join('')}
        <radialGradient id="house-core-aura"><stop stop-color="#99ccff" stop-opacity=".5"/><stop offset="1" stop-color="#99ccff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1280" height="800" fill="#000"/><rect x="470" y="85" width="95" height="610" fill="#1c1426"/>
      <path d="M1245 120H915Q855 120 855 180V680Q855 740 915 740H1245V640H997Q955 640 955 598V262Q955 220 997 220H1245Z" fill="#202027"/>
      <g transform="translate(0 -24)"><path d="M64 24H28a18 18 0 0 0 0 36h36Z M1234 24h12a18 18 0 0 1 0 36h-12Z" fill="#cc99cc"/>
      <rect x="70" y="24" width="10" height="36" fill="#cc99cc"/><text class="house-title" x="92" y="57">${esc(this.config.title || 'Wohnhaus · Schnitt A-A')}</text>
      <rect x="560" y="24" width="668" height="36" fill="#cc99cc"/><text class="house-class" x="1210" y="50" text-anchor="end">Satteldach-Klasse · Etage 0 – 3</text></g>
      <g class="house-status-panel" transform="translate(860 -15) scale(.72 .85)"><path d="M78 187V88H558V187" fill="none" stroke="#cc99cc" stroke-width="6"/><text class="house-status-title" x="90" y="106">Etagen-Status · Temperatur / Licht</text>${floorSummary}</g>
      <g transform="translate(0 -24)"><path d="M590 84V168H842V84" fill="none" stroke="#cc99cc" stroke-width="7"/>
      ${Array.from({length:16},(_,i)=>`<g transform="translate(${602+(i%4)*59} ${94+Math.floor(i/4)*16})"><rect width="44" height="11" rx="6" fill="${['#ff9966','#cc99cc','#ffcc99','#9999ff'][i%4]}"/><text data-house-number x="49" y="10">${(i*17+23)%100}</text></g>`).join('')}</g>
      ${rooms.map(room=>`<g data-house-room="${room.key}" data-outdoor="${!!room.outdoor}" data-house-owner="${room.key}" ${attrs('house-room:'+room.key)} aria-label="${esc(room.name)} · Raum auswählen"><polygon class="house-room-fill" points="${points(room)}"/><polygon class="house-room-glow" points="${points(room)}"/></g>`).join('')}
      ${lamps.filter(lamp=>lamp.room!=='living').map((lamp,i)=>{
        const [x,y]=lamp.position;
        const monitor=lamp.type==='monitor', spot=lamp.type==='spot', sphere=lamp.type==='kugel', cabinet=lamp.type==='schrank', stripe=lamp.type==='streifen', indirect=lamp.type==='kommode';
        const cy=y+(monitor?-10:indirect?-15:spot?-60:sphere?0:stripe?18:cabinet?28:47);
        const cone=cabinet?`M${x-20} ${y+3}L${x-36} ${y+85}H${x+36}L${x+20} ${y+3}Z`:`M${x-3} ${y+5}L${x-23} ${y+105}H${x+23}L${x+3} ${y+5}Z`;
        return `<g class="house-lamp-light" data-house-glow="${esc(lamp.id)}" clip-path="url(#house-room-${lamp.room})" style="--lamp-order:${i}"><ellipse cx="${x}" cy="${cy}" rx="${monitor?32:indirect?65:sphere?42:stripe?88:cabinet?65:55}" ry="${monitor?22:indirect?45:sphere?36:stripe?45:cabinet?50:92}" fill="url(#house-halo)"/>${!monitor&&!lamp.outdoor&&!indirect&&!sphere&&!stripe?`<path d="${cone}" fill="url(#house-cone)" ${spot?`transform="rotate(180 ${x} ${y})"`:  ''}/>`:''}</g>`;
      }).join('')}

      <g class="house-structure" transform="translate(0 0)">
        <path d="M402 414L640 212L878 414V430L640 230L402 430Z" fill="url(#house-hatch)"/><path d="M640 212V201" stroke-width="7"/>
        <path d="M438 414h8v216h-8Z M834 414h8v216h-8Z M438 414h404v8H438Z M438 522h404v8H438Z M430 630h420v20H430Z" fill="url(#house-deck)"/>
        <path d="M540 308H740" stroke-width="4"/><path class="house-inner" d="M558 310V630M618 310V630M700 310V522"/>
        <path class="house-inner house-stairs" d="${stair(534,624,false)} ${stair(426,516,true)} ${stair(320,408,false)}" stroke-width="1.5"/>
        <path d="M330 642H430M850 642H950" stroke="#cc99cc" stroke-dasharray="10 5"/>
      </g>
      <g class="house-furniture" transform="translate(0 0)"><path d="M467 391h54v7h-54v-7m5 7v11m43-11v11 M760 408h67 M460 513v-14h43v14m-43-14v-8h16v8 M628 499h49a11 11 0 0 1 0 22h-49a11 11 0 0 1 0-22Z M634 456h14v28h-14Z M766 515v-15h39v15m-39-15v-7h13v7 M457 626v-26h45v26m-45-61h30v9h-30Z"/></g>
      <g class="house-windows" transform="translate(0 0)"><path d="M435 439h10v49h-10Z M435 555h10v52h-10Z M835 440h10v48h-10Z M835 553h10v54h-10Z"/><path d="M463 365l29-25l4 5l-29 25Z M785 340l28 24l-4 5l-28-24Z"/></g>
      ${lamps.filter(lamp=>lamp.room!=='living').map(lamp=>{
        const [x,y]=lamp.position;
        const glyph=lamp.type==='monitor'
          ? `<g class="house-monitor" transform="translate(${x} ${y})"><path class="house-lamp-furniture" d="M0 4v7m-11 0h22"/><rect class="house-monitor-frame" x="-24" y="-26" width="48" height="30" rx="2"/><rect class="house-monitor-screen" x="-21" y="-23" width="42" height="24" rx="1"/><g class="house-monitor-image"><path d="M-19-20h38v3h-38Z" fill="#9999ff"/><rect x="-18" y="-14" width="12" height="12" rx="1" fill="#587eaa"/><path d="M-3-13h19m-19 4h13m-13 4h17" stroke="#a7d5ff" stroke-width="1.2"/><path d="M-20-10h40M-20-6h40M-20-2h40" stroke="#d8edff" stroke-opacity=".12" stroke-width=".6"/></g><circle class="house-monitor-led" cx="19" cy="3" r=".8"/></g>`
          : lamp.type==='kugel'
          ? ` ${lamp.outdoor?'':lamp.onDresser?`<path class="house-lamp-furniture" d="M${x-24} ${y+10}h48v17h-48ZM${x} ${y+10}v17m-20 0v3m40-3v3"/>`:`<path class="house-lamp-furniture" d="M${x-15} ${y+10}h30v3h-30ZM${x-11} ${y+13}v17m22-17v17"/>`}<circle class="house-bulb" cx="${x}" cy="${y}" r="7.5"/><path d="M${x-4} ${y+8}h8" stroke="#cc99cc"/>`
          : lamp.type==='spot'
          ? `<path class="house-lamp-furniture" d="M${x-9} ${y+5}h18m-9 0v-7"/><path class="house-bulb" d="M${x-7} ${y}l3-6h8l3 6Z"/>`
          : lamp.type==='tischlampe'
          ? `<path class="house-lamp-furniture" d="M${x} ${y}v11m-8 0h16"/><path class="house-bulb" d="M${x-8} ${y}l4-8h8l4 8Z"/>`
          : lamp.type==='kommode'
          ? `<path class="house-bulb" d="M${x-24} ${y}H${x+24}" stroke-width="3"/><path class="house-lamp-furniture" d="M${x-27} ${y+4}h54v14h-54ZM${x} ${y+4}v14m-23 0v4m46-4v4"/>`
          : lamp.type==='schrank'
          ? `<rect class="house-lamp-furniture" x="${x-25}" y="${y-23}" width="50" height="20" rx="1"/><path class="house-lamp-furniture" d="M${x} ${y-23}v20m-4-10v3m8-3v3"/><path class="house-bulb" d="M${x-23} ${y}H${x+23}" stroke-width="4" stroke-linecap="round"/>`
          : lamp.type==='streifen'
          ? `<path class="house-bulb" d="M${x-23} ${y}H${x+23}" stroke-width="4" stroke-linecap="round"/>`
          : lamp.type==='stehlampe'
          ? `<path d="M${x} ${y}v28m-8 0h16" stroke="#cc99cc"/><path class="house-bulb" d="M${x-9} ${y+2}l4-10h10l4 10Z"/>`
          : `<path d="M${x} ${y-6}v6" stroke="#cc99cc"/><rect class="house-bulb" x="${x-5}" y="${y}" width="10" height="5" rx="2"/>`;
        return `<g class="house-lamp" data-house-lamp="${esc(lamp.id)}" data-house-lamp-type="${lamp.type}" data-house-owner="${lamp.room}" ${attrs('house-light:'+lamp.id)}><title>${esc(lamp.name)}</title><circle class="house-lamp-hit" cx="${x}" cy="${y}" r="42" fill="transparent" pointer-events="all"/>${glyph}</g>`;
      }).join('')}
      <g clip-path="url(#house-outline)" class="house-scan"><rect x="400" y="-40" width="480" height="40" fill="url(#house-scan)"/></g>
      ${livingMarkup(rooms.find(room=>room.key==='living'),this.config.living_detail)}
      <g class="house-devices">
        ${rooms.some(room=>room.key==='roof')?`<g class="house-mini-core" clip-path="url(#house-room-roof)" aria-label="Dachspitz · kleiner pulsierender Warp-Kern"><ellipse class="house-mini-core-aura" cx="640" cy="275" rx="31" ry="35" fill="url(#house-core-aura)"/><path d="M632 245v58m16-58v58" stroke="#547695" stroke-width="1.5"/><rect x="636" y="245" width="8" height="58" rx="4" fill="#18293a"/><g class="house-mini-core-energy">${Array.from({length:6},(_,i)=>`<rect class="house-core-coil" style="--coil-delay:${i*-.22}s" x="629" y="${249+i*9}" width="22" height="6" rx="3" fill="${i%2?'#d8efff':'#99ccff'}"/>`).join('')}<rect x="623" y="273" width="34" height="7" rx="2" fill="#ffcc99"/><circle cx="640" cy="276.5" r="7" fill="#111" stroke="#ff9966" stroke-width="2"/><circle cx="640" cy="276.5" r="3" fill="#99ccff"/></g><path d="M631 245h18m-18 58h18" stroke="#cc99cc" stroke-width="3" stroke-linecap="round"/></g>`:''}
        ${rooms.some(room=>room.key==='utility')?`<g class="house-server-rack" aria-label="Technikraum · Serverschrank mit dekorativen Statuslämpchen"><rect x="644" y="328" width="47" height="79" rx="2" fill="#0c1018" stroke="#cc99cc" stroke-width="1.5"/><path d="M649 331v72m37-72v72" stroke="#4c435b"/>${Array.from({length:5},(_,i)=>`<g><rect x="650" y="${335+i*12}" width="35" height="9" rx="1" fill="#202432" stroke="#6f6682" stroke-width=".7"/><path d="M653 ${338+i*12}h15m-15 3h15" stroke="#74859c" stroke-width=".8"/><circle class="house-server-led" style="--led-delay:${i*-.37}s;--led-period:${1.1+i*.23}s" cx="675" cy="${339.5+i*12}" r="1.6" fill="#99ccff"/><circle class="house-server-led" style="--led-delay:${i*-.61-.4}s;--led-period:${1.9-i*.16}s" cx="681" cy="${339.5+i*12}" r="1.5" fill="${i%2?'#ff9966':'#cc99cc'}"/></g>`).join('')}<text x="667.5" y="403" text-anchor="middle" fill="#cc99cc" font-size="6">SERVER</text></g>`:''}
      </g>
      <g class="house-floor-labels" transform="translate(0 0)">${[0,1,2,3].map((floor,i)=>`<text x="590" y="${[618,510,404,301][floor]}" text-anchor="middle">Etage ${floor}</text>`).join('')}</g>
      <g class="house-washer" transform="translate(-55 0)" data-house-washer aria-label="Waschmaschine"><rect x="700" y="467" width="36" height="43" rx="2"/><path d="M700 475h36m-30-4h4m5 0h3"/><circle cx="718" cy="491" r="13"/><g class="house-washer-drum"><path d="M709 486q6-7 10 0t8 3q-1 9-8 8t-10-11Z"/><path d="M711 495q6-9 12-9"/></g></g>
      ${labels}
      <g class="house-metrics"><text x="75" y="730" fill="#e8806a">Etagen: 4</text><text x="333" y="730" fill="#ffcc99" data-house-lights-count>Lichter: —</text><text x="655" y="730" fill="#99ccff" data-house-roof>Warp-Kern: —</text><text x="1000" y="730" fill="#ff9966" data-house-inside>Ø Innen: —</text></g>
    </svg>`;
  }

  update(main) {
    const svg=main.querySelector('.house-section');
    if (!svg || !this.current) return;
    if (this.svg!==svg) {
      clearTimeout(this.startTimer);
      this.startTimer=setTimeout(()=>svg.classList.remove('house-start'),4500);
    }
    this.svg=svg;
    const data=this.current;
    const text=(selector,value)=>svg.querySelectorAll(selector).forEach(node=>{if(node.textContent!==value)node.textContent=value;});
    this.acoustics.update(svg,this.panel.demo?[{playing:true,volume:.6},{playing:true,volume:.6}]:livingSonos(this.panel.circuits.registry,this.panel.ha?.states,this.config.living_detail?.sonos_entities));
    text('[data-house-cpu-value]',Number.isFinite(data.cpu)?'CPU · '+Math.round(data.cpu)+' %':'CPU · —');
    svg.querySelector('[data-house-cpu-path]')?.setAttribute('d',cpuSparkline(data.cpuRows ?? []));
    text('[data-house-inverter-output]','Leistung · '+inverterReading(this.panel.state?.('sensor.inverter_wirkleistung'))+' · Heute · '+inverterReading(this.panel.state?.('sensor.inverter_tagesertrag')));
    const washer=data.washer ?? {available:false,running:false};
    svg.querySelector('[data-house-washer]')?.classList.toggle('running',washer.running);
    svg.querySelector('[data-house-washer]')?.classList.toggle('offline',!washer.available);
    text('[data-house-washer-status]','Waschmaschine · '+(!washer.available?'Keine Daten':washer.running?'Läuft':'Ruhe'));
    data.rooms.forEach(room=>{
      const group=svg.querySelector(`[data-house-room="${room.key}"]`);
      if (!group) return;
      const color=houseTemperatureColor(room.temperature);
      group.querySelector('.house-room-fill').setAttribute('fill',color);
      group.querySelector('.house-room-glow').style.opacity=String(room.outdoor?0:room.glow);
      svg.querySelectorAll(`[data-house-owner="${room.key}"]`).forEach(node=>node.classList.toggle('selected',this.selected===room.key));
      text(`[data-house-room-temp="${room.key}"]`,fmt(room.temperature)+(room.key==='roof' && Number.isFinite(room.temperature)?'C':''));
      svg.querySelectorAll(`[data-house-room-temp="${room.key}"]`).forEach(node=>node.setAttribute('fill',color));
      text(`[data-house-room-floor="${room.key}"]`,String(room.floor));
      text(`[data-house-room-missing="${room.key}"]`,Array.isArray(room.light_entities) && !room.light_entities.length ? 'Keine Lampen ausgewählt' : room.matched?'Licht · nicht erfasst':'Keine HA-Zuordnung');
      room.lamps.forEach(lamp=>{
        const elements=[...svg.querySelectorAll('[data-house-lamp],[data-house-lamp-label],[data-house-glow]')].filter(node=>[node.dataset.houseLamp,node.dataset.houseLampLabel,node.dataset.houseGlow].includes(lamp.id));
        elements.forEach(node=>{node.classList.toggle('on',lamp.on);node.classList.toggle('offline',!lamp.available);node.setAttribute('aria-label',lamp.name+' · '+labelStatus(lamp));if(node.hasAttribute('data-action'))node.setAttribute('aria-disabled',String(!lamp.available || this.pending.has(lamp.id)));});
        elements.filter(node=>node.hasAttribute('data-house-glow')).forEach(glow=>glow.style.setProperty('--light-opacity',String(lamp.on ? .35+.65*lamp.brightness/100 : 0)));
        const value=lamp.name+' · '+labelStatus(lamp);
        [...svg.querySelectorAll('[data-house-lamp-text]')].filter(node=>node.dataset.houseLampText===lamp.id).forEach(row=>{if(row.textContent!==value)row.textContent=value;});
        [...svg.querySelectorAll('[data-house-leader]')].filter(node=>node.dataset.houseLeader===lamp.id).forEach(leader=>leader.classList.toggle('on',lamp.on));
      });
    });
    data.floors.forEach(floor=>{
      const active=floor.lamps.filter(lamp=>lamp.on).length;
      text(`[data-house-floor-value="${floor.level}"]`,fmt(floor.temperature));
      text(`[data-house-floor-lights="${floor.level}"]`,floor.lamps.length?`Licht ${active} / ${floor.lamps.length}`:'Licht · —');
      svg.querySelectorAll(`[data-house-floor-temp="${floor.level}"]`).forEach((node,i)=>node.setAttribute('fill',Number.isFinite(floor.temperature) && i<Math.round(Math.max(0,Math.min(1,(floor.temperature-10)/15))*10)?houseTemperatureColor(floor.temperature):'#262626'));
      svg.querySelectorAll(`[data-house-floor-value="${floor.level}"]`).forEach(node=>node.setAttribute('fill',houseTemperatureColor(floor.temperature)));
      svg.querySelectorAll(`[data-house-floor-lamp="${floor.level}"]`).forEach((node,i)=>node.setAttribute('fill',floor.lamps[i]?.on?'#ffcc99':'#262626'));
    });
    text('[data-house-lights-count]',`Lichter: ${data.active} / ${data.lamps.length}`);
    text('[data-house-roof]','Warp-Kern: '+fmt(data.roof)+(Number.isFinite(data.roof)?'C':''));
    text('[data-house-inside]','Ø Innen: '+fmt(data.inside));
    if (this.boundMain!==main) {
      this.boundMain=main;
      main.addEventListener('keydown',event=>{
        const target=event.target.closest('.house-section [data-action]');
        if (!target || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));
      });
    }
  }

  refreshCPU() {
    if(this.panel.demo || !this.panel.ha?.callApi || this.cpuPending || Date.now()<(this.nextCPUFetch ?? 0))return;
    this.nextCPUFetch=Date.now()+5*60000;
    const start=new Date(Date.now()-30*60000).toISOString();
    this.cpuPending=true;
    this.panel.ha.callApi('GET',`history/period/${start}?filter_entity_id=sensor.ap_dg_cpu_utilization&minimal_response=1&no_attributes=1&significant_changes_only=0`).then(([rows])=>{this.cpuRows=rows ?? [];}).catch(()=>{}).finally(()=>{this.cpuPending=false;if(this.panel.page===housePageIndex)this.panel.render();});
  }

  close() {
    this.acoustics.destroy();
    clearTimeout(this.startTimer);
    this.svg = null;
  }

  updateNumbers() {
    if (this.panel.page!==housePageIndex || !this.svg?.isConnected || document.hidden) return;
    const numbers=[...this.svg.querySelectorAll('[data-house-number]')];
    for(let i=0;i<3;i++) { const node=numbers[Math.floor(Math.random()*numbers.length)]; if(node)node.textContent=String(Math.floor(Math.random()*100)).padStart(2,'0'); }
  }

  async act(action,id) {
    if (action==='room') {this.selected=this.selected===id?null:id;this.update(this.panel.shadowRoot.querySelector('main'));return;}
    const lamp=this.current?.lamps.find(lamp=>lamp.id===id);
    if (action!=='light' || !lamp?.available || this.pending.has(id)) return;
    this.pending.add(id);
    try {
      if (this.panel.demo) {this.demoLights ??= new Map();this.demoLights.set(id,lamp.on?'off':'on');}
      else await this.panel.call(id,'toggle');
    } catch {this.panel.notify('Licht konnte nicht geschaltet werden.');}
    finally {this.pending.delete(id);this.panel.render();}
  }
}
