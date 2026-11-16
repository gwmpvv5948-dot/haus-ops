const groups = {
  solar: ['pv_ost_power', 'pv_west_power', 'pv_garage_power', 'pv_schuppen_power'],
  battery: ['battery_power', 'battery_soc', 'battery_energy', 'battery_temperature'],
  grid: ['grid_power', 'grid_frequency', 'grid_voltage_l1', 'grid_voltage_l2', 'grid_voltage_l3'],
  house: ['house_power_l1', 'house_power_l2', 'house_power_l3'],
  daily: ['solar_energy_today', 'house_energy_today', 'grid_import_today', 'grid_export_today', 'battery_charge_today', 'battery_discharge_today'],
  engineering: ['battery_voltage', 'inverter_status'],
  loads: ['wama_power', 'spueli_power', 'hvac_power', 'ev_power'],
};
export const energyFields = Object.values(groups).flat().map(key => ['energy.' + key, key, ['sensor']]);
const known = Number.isFinite;
const fmt = (value, digits = 0) => known(value) ? value.toLocaleString('de-DE', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const power = value => Math.abs(value) >= 1000 ? fmt(Math.abs(value)/1000, 2) + ' kW' : fmt(Math.abs(value)) + ' W';
const sum = values => values.every(known) ? values.reduce((a,b) => a+b,0) : NaN;
const ratio = (part, total) => known(part) && total > 0 ? Math.max(0, Math.min(100, 100*(1-part/total))) : NaN;
const band = (label, color) => `<h2 class="band" style="--band:var(--${color})">${label}</h2>`;
const demo = {solar:[0,0,0,0],battery:[0,24,1.2,39.6],grid:[-280,49.97,237,235,238],house:[22,112,146],daily:[10.3,22.9,13.4,.1,4.2,3.2],engineering:[748.7,NaN],loads:[0,1,2,0]};

export function energyView(panel, engineering = false) {
  const read = key => {
    const sensor = panel.state(panel.config?.energy?.[key] || 'sensor.' + key);
    const value = sensor?.state?.trim() ? Number(sensor.state) : NaN;
    const unit = sensor?.attributes?.unit_of_measurement;
    return /_power(?:_l[123])?$/.test(key) && unit === 'kW' ? value*1000
      : (key.endsWith('_today') || key === 'battery_energy') && unit === 'Wh' ? value/1000 : value;
  };
  const [pv,[battery,soc,stored,temp],[rawGrid,hz,...volts], phases,[yieldToday,use,imp,exp,charge,discharge],[batteryVoltage],loads] =
    Object.entries(groups).map(([group, keys]) => panel.demo ? (engineering ? engineeringDemo[group] ?? demo[group] : demo[group]) : keys.map(read));
  const solar = sum(pv.map(value => Math.max(0,value)));
  const grid = -rawGrid;
  const house = sum(phases);
  if (engineering) {
    const inverter = panel.demo ? 'running' : panel.state(
      panel.config?.energy?.inverter_status || 'sensor.inverter_status'
    )?.state?.trim().toLowerCase();
    return engineeringView({
      pv, solar, battery, batteryVoltage, soc, temp, grid, hz, volts, phases, house,
      yieldToday, use, imp, exp, charge, discharge, inverter,
    }, panel.demo);
  }
  const source = (name,color,value,chip,details) => `<article class="energy-source ${value === 0 ? 'idle' : ''}" style="--source:var(--${color})">
    <div><strong>${name}</strong><small>${known(value) ? chip : 'Keine Daten'}</small></div>
    <p>${power(value).replace(/ (k?W)$/, ' <small>$1</small>')}</p><aside>${details}</aside></article>`;
  const suppliers = [[ 'Solar', 'solar', Math.max(0,solar-Math.max(0,-battery)-Math.max(0,-grid)) ],['Akku','battery',Math.max(0,battery)],['Netz','purple',Math.max(0,grid)]];
  const supplied = sum(suppliers.map(item=>item[2]));
  const segments = suppliers.map(([name,color,watts]) => {
    const share = supplied > 0 ? watts/supplied*100 : 0;
    return `<span data-energy-flow="${color}" style="--flow:var(--${color});--share:${share}%" title="${name} ${fmt(share)} % · ${power(watts)}">${share >= 15 ? `${name} ${fmt(share)} % · ${power(watts)}` : ''}</span>`;
  }).join('');
  const balance = [
    ['Solar','solar', fmt(yieldToday,1),'kWh'], ['Haus','peach',fmt(use,1),'kWh'],
    ['Netz ↓ / ↑','purple',fmt(imp,1),'/ '+fmt(exp,1)], ['Akku + / −','battery',fmt(charge,1),'/ '+fmt(discharge,1)],
    ['Autark · Eigenv.','blue',fmt(ratio(imp,use)),'% · '+fmt(ratio(exp,yieldToday))+' %'],
  ];
  const warnings = [soc < 10 && 'Akku unter 10 %', (hz < 49.8 || hz > 50.2) && 'Netzfrequenz außerhalb des Bereichs',
    ![solar,battery,grid,house,hz,soc].every(known) && 'Sensordaten fehlen',
    [house,solar,battery,grid].every(known) && Math.abs(house-solar-battery-grid)>Math.max(100,house*.15) && 'Leistungsbilanz prüfen'].filter(Boolean);
  const status = warnings.join(' · ') || `${grid < 0 ? 'Einspeisung' : 'Netzbezug'} ${power(grid)} · Akku ${fmt(soc)} % · PV ${solar ? power(solar) : 'inaktiv'}`;
  return {hz: known(hz) ? fmt(hz,2)+' Hz' : '— Hz', status, warning:warnings.length>0, layout:`<section class="energy-page">
    <div class="eng-heading">${band('Leistung jetzt','peach')}<button data-energy-mode aria-pressed="false">Energiekern</button></div><div class="energy-sources">
    ${source('Solar','solar',solar,solar>0?'Erzeugt':panel.state('sun.sun')?.state==='above_horizon'?'Inaktiv':'Nacht',`Ost ${fmt(pv[0])} · West ${fmt(pv[1])}<br>Garage ${fmt(pv[2])} · Schuppen ${fmt(pv[3])} W`)}
    ${source('Akku','battery',battery,battery>0?'Entlädt':battery<0?'Lädt':'Ruht',`<div class="energy-soc" style="--soc:${soc<20?'var(--red)':'var(--battery)'}">${Array.from({length:10},(_,i)=>`<i class="${soc >= (i+1)*10?'filled':''}"></i>`).join('')}</div>${fmt(soc)} % · ${fmt(stored,2)} kWh · ${fmt(temp,1)}°`)}
    ${source('Netz','purple',grid,grid>0?'Bezug':grid<0?'Einspeisung':'Ruht',`DREWAG<br>${volts.map(v=>fmt(v)).join(' · ')} V`)}
    ${source('Haus','peach',house,'Verbrauch',phases.map((v,i)=>`L${i+1} ${fmt(v)}`).join(' · ')+' W')}</div>
    ${band('Hausversorgung','purple')}<div class="energy-flow">${segments}${supplied > 0 ? '' : known(supplied) ? 'Keine Last' : 'Keine Daten'}</div>
    ${band('Bilanz heute','pink')}<div class="energy-balance">${balance.map(([name,color,primary,secondary])=>`<article style="--source:var(--${color})"><small>${name}</small><div>${primary} <span>${secondary}</span></div></article>`).join('')}</div>
    <div class="energy-loads">${['Wama','Spüli','HVAC','EV'].map((name,i)=>`<span class="${loads[i]>5?'active':''}">${name}<strong>${power(loads[i])}</strong></span>`).join('')}</div></section>`};
}

const engineeringDemo = {
  solar:[1800,1500,600,400], battery:[-1800,63,1.2,39.6],
  grid:[1600,49.97,237.1,234.5,237.6], house:[310,420,170],
};

function engineeringView(data, demoMode) {
  const {pv, solar, battery, batteryVoltage, soc, temp, grid, hz, volts, phases, house,
    yieldToday, use, imp, exp, charge, discharge, inverter} = data;
  const validInverter = Boolean(inverter && !['unavailable', 'unknown'].includes(inverter));
  const throughput = known(solar) && known(battery) ? solar + Math.abs(battery) : NaN;
  const period = throughput > 0 ? Math.max(.6, 2.4 - throughput / 2500) : 3.2;
  const warn = soc < 10 || hz < 49.8 || hz > 50.2 || (validInverter && inverter !== 'running');
  const missing = !validInverter || ![solar,battery,house,grid,soc,hz].every(known);
  const status = warn ? 'Rot' : missing ? 'Daten fehlen' : grid > 0 ? 'Bezug' : 'Grün';
  const value = (number, unit, digits = 0) => known(number) ? fmt(number,digits) + unit : '—';
  const watts = number => known(number) ? power(number) : '—';
  const row = (label, display, available) => `<div class="eng-row"><b class="${available ? '' : 'eng-missing'}">${label}</b><span>${display}</span></div>`;
  const direction = grid > 0 ? 'Bezug' : grid < 0 ? 'Einspeisung' : 'Ruht';
  const batteryDirection = battery > 0 ? 'Entlädt' : battery < 0 ? 'Lädt' : 'Ruht';
  const rail = (label, modifier = '') => `<h2 class="eng-rail ${modifier}"><span>${label}</span></h2>`;
  const lines = [
    ['solar', solar, solar > 0, false],
    ['battery', battery, Boolean(battery), battery < 0],
    ['house', house, house > 0, false],
    ['grid', grid, Boolean(grid), grid > 0],
  ];
  const date = new Date();
  const day = Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) -
    Date.UTC(date.getFullYear(),0,0)) / 86400000);
  const coreStatus = known(throughput) ? (throughput ? 'Online · ' + watts(throughput) : 'Standby') : 'Keine Daten';

  return {
    hz: value(hz,' Hz',2), status: `Sternzeit ${fmt(80000 + day * 2.74,1)} · Status · ${status}`,
    warning: warn || missing,
    layout: `<section class="engineering">
      <div class="eng-heading">${rail('Energiekern · Wechselrichter 1')}
        <button data-energy-mode aria-pressed="true">Zur Bilanz</button></div>
      <div class="eng-body">
        <div class="eng-data">
          <h3>PV-Erzeuger</h3>
          ${['Ost','West','Garage','Schuppen'].map((label,index) => row(label, watts(pv[index]), known(pv[index]))).join('')}
          ${row('Solar heute', value(yieldToday,' kWh',1), known(yieldToday))}
          <h3>Akku</h3>
          ${row('Ladestand', value(soc,' %'), known(soc))}
          ${row('Leistung', known(battery) ? watts(battery) + ' ' + batteryDirection : '—', known(battery))}
          ${row('Spannung', value(batteryVoltage,' V',1), known(batteryVoltage))}
          ${row('Temperatur', value(temp,'°',1), known(temp))}
          ${row('Heute + / −', value(charge,'',1) + ' / ' + value(discharge,'',1), known(charge) && known(discharge))}
        </div>
        <div class="eng-diagram">
          ${lines.map(([name, number, active, reverse]) => `<div data-eng-motion="${name}" class="eng-line eng-${name} ${known(number) && active ? 'flowing' : ''} ${reverse ? 'reverse' : ''}">
            <span>${known(number) && active ? watts(number) : ''}</span><i></i></div>`).join('')}
          <svg data-eng-motion="core" class="eng-core ${throughput > 0 ? '' : 'standby'} ${battery < 0 ? 'charging' : ''}" style="--period:${period}s" viewBox="0 0 112 332" aria-hidden="true">
            <path class="eng-tracks" d="M30 19V313M82 19V313"/>
            <path class="eng-bridges" d="M16 14H96M16 318H96"/>
            <rect class="eng-cap" x="6" width="100" height="10" rx="5"/>
            <rect class="eng-cap" x="6" y="322" width="100" height="10" rx="5"/>
            ${[0,1].flatMap(half => Array.from({length:7}, (_,index) =>
              `<rect class="eng-segment ${half ? 'lower' : 'upper'}" style="--segment:${index}" x="22" y="${half ? 299-index*17 : 21+index*17}" width="68" height="14" rx="7"/>`)).join('')}
            <rect class="eng-cap" y="154" width="112" height="24" rx="4"/>
            <circle class="eng-ring" cx="56" cy="166" r="20"/>
            <text x="56" y="166">WR</text>
          </svg>
        </div>
        <div class="eng-details">
          <article class="eng-house"><header><b class="${known(house) ? '' : 'eng-missing'}">Haus</b><i></i><b>Verbrauch</b></header>
            <strong>${watts(house).replace(/ (k?W)$/, ' <small>$1</small>')}</strong>
            <div>${phases.map((phase,index)=>`L${index+1} ${fmt(phase)}`).join(' · ')} W</div>
            <div>Heute ${value(use,' kWh',1)}</div>
          </article>
          <article class="eng-grid"><header><b class="${known(grid) ? '' : 'eng-missing'}">Netz · Drewag</b><i></i><b>${known(grid) ? direction : 'Keine Daten'}</b></header>
            <strong>${watts(grid).replace(/ (k?W)$/, ' <small>$1</small>')}</strong>
            <div>${volts.map(voltage=>fmt(voltage,1)).join(' · ')} V · ${value(hz,' Hz',2)}</div>
            <div>↓ ${fmt(imp,1)} · ↑ ${fmt(exp,1)} kWh heute</div>
          </article>
          <div class="eng-ratios">${row('Autark',value(ratio(imp,use),' %'),known(ratio(imp,use)))}
            ${row('Eigenv.',value(ratio(exp,yieldToday),' %'),known(ratio(exp,yieldToday)))}</div>
        </div>
      </div>
      ${rail(`Kern · ${coreStatus}${demoMode ? ' · Demo' : ''}`,'eng-bottom')}
    </section>`,
  };
}
