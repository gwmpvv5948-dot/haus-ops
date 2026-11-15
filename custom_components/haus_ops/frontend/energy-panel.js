const groups = {
  solar: ['pv_ost_power', 'pv_west_power', 'pv_garage_power', 'pv_schuppen_power'],
  battery: ['battery_power', 'battery_soc', 'battery_energy', 'battery_temperature'],
  grid: ['grid_power', 'grid_frequency', 'grid_voltage_l1', 'grid_voltage_l2', 'grid_voltage_l3'],
  house: ['house_power_l1', 'house_power_l2', 'house_power_l3'],
  daily: ['solar_energy_today', 'house_energy_today', 'grid_import_today', 'grid_export_today', 'battery_charge_today', 'battery_discharge_today'],
  loads: ['wama_power', 'spueli_power', 'hvac_power', 'ev_power'],
};
export const energyFields = Object.values(groups).flat().map(key => ['energy.' + key, key, ['sensor']]);
const known = Number.isFinite;
const fmt = (value, digits = 0) => known(value) ? value.toLocaleString('de-DE', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const power = value => Math.abs(value) >= 1000 ? fmt(Math.abs(value)/1000, 2) + ' kW' : fmt(Math.abs(value)) + ' W';
const sum = values => values.every(known) ? values.reduce((a,b) => a+b,0) : NaN;
const ratio = (part, total) => known(part) && total > 0 ? Math.max(0, Math.min(100, 100*(1-part/total))) : NaN;
const band = (label, color) => `<h2 class="band" style="--band:var(--${color})">${label}</h2>`;
const demo = {solar:[0,0,0,0],battery:[0,24,1.2,39.6],grid:[-280,49.97,237,235,238],house:[22,112,146],daily:[10.3,22.9,13.4,.1,4.2,3.2],loads:[0,1,2,0]};

export function energyView(panel) {
  const read = key => {
    const sensor = panel.state(panel.config?.energy?.[key] || 'sensor.' + key);
    const value = sensor?.state?.trim() ? Number(sensor.state) : NaN;
    const unit = sensor?.attributes?.unit_of_measurement;
    return /_power(?:_l[123])?$/.test(key) && unit === 'kW' ? value*1000
      : (key.endsWith('_today') || key === 'battery_energy') && unit === 'Wh' ? value/1000 : value;
  };
  const [pv,[battery,soc,stored,temp],[rawGrid,hz,...volts], phases,[yieldToday,use,imp,exp,charge,discharge],loads] =
    Object.entries(groups).map(([group, keys]) => panel.demo ? demo[group] : keys.map(read));
  const solar = sum(pv.map(value => Math.max(0,value)));
  const grid = -rawGrid;
  const house = sum(phases);
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
    ${band('Leistung jetzt','peach')}<div class="energy-sources">
    ${source('Solar','solar',solar,solar>0?'Erzeugt':panel.state('sun.sun')?.state==='above_horizon'?'Inaktiv':'Nacht',`Ost ${fmt(pv[0])} · West ${fmt(pv[1])}<br>Garage ${fmt(pv[2])} · Schuppen ${fmt(pv[3])} W`)}
    ${source('Akku','battery',battery,battery>0?'Entlädt':battery<0?'Lädt':'Ruht',`<div class="energy-soc" style="--soc:${soc<20?'var(--red)':'var(--battery)'}">${Array.from({length:10},(_,i)=>`<i class="${soc >= (i+1)*10?'filled':''}"></i>`).join('')}</div>${fmt(soc)} % · ${fmt(stored,2)} kWh · ${fmt(temp,1)}°`)}
    ${source('Netz','purple',grid,grid>0?'Bezug':grid<0?'Einspeisung':'Ruht',`DREWAG<br>${volts.map(v=>fmt(v)).join(' · ')} V`)}
    ${source('Haus','peach',house,'Verbrauch',phases.map((v,i)=>`L${i+1} ${fmt(v)}`).join(' · ')+' W')}</div>
    ${band('Hausversorgung','purple')}<div class="energy-flow">${segments}${supplied > 0 ? '' : known(supplied) ? 'Keine Last' : 'Keine Daten'}</div>
    ${band('Bilanz heute','pink')}<div class="energy-balance">${balance.map(([name,color,primary,secondary])=>`<article style="--source:var(--${color})"><small>${name}</small><div>${primary} <span>${secondary}</span></div></article>`).join('')}</div>
    <div class="energy-loads">${['Wama','Spüli','HVAC','EV'].map((name,i)=>`<span class="${loads[i]>5?'active':''}">${name}<strong>${power(loads[i])}</strong></span>`).join('')}</div></section>`};
}
