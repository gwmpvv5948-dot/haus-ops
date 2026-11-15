export const roomNames = ['Wohnzimmer', 'Alwin', 'Arbeitszimmer', 'Carla', 'Flur', 'Schlafzimmer'];
const shortNames = ['Wohnzimmer', 'Alwin', 'Arbeitszi.', 'Carla', 'Flur', 'Schlafzi.'];
const demo = [[21,20.5,18,0,'21:00'],[20.9,17,19.5,0,'06:30'],[19.9,19,18,0,'21:00'],
  [21.3,21.5,19,7,'21:30'],[18.4,17.5,16.5,0,'21:30'],[19.9,null,null,null,null]];
const format = new Intl.NumberFormat('de-DE', {minimumFractionDigits:1, maximumFractionDigits:1});
const number = value => value == null || value === '' ? NaN : Number(value);
const clock = value => {
  if (typeof value !== 'string') return '';
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '';
};
const available = entity => entity && !['unknown','unavailable'].includes(entity.state);

function managerRoom(panel, name) {
  const roomId = name.toLowerCase();
  const record = Object.values(panel.ha?.states ?? {}).find(entity => {
    const data = entity.attributes;
    return data?.entry_id && data.config?.room_id === roomId && Array.isArray(data.plan);
  });
  if (!record) return null;
  const data = record.attributes;
  const cfg = data.config;
  const controller = panel.state(cfg.radiators);
  const underlying = controller?.attributes.vtherm_over_climate?.underlying_entities;
  const radiators = Array.isArray(underlying) && underlying.length ? underlying : [cfg.radiators].filter(Boolean);
  const valves = radiators.filter(id => available(panel.state(id))).map(id => {
    const closing = number(panel.state('number.' + id.split('.')[1] + '_valve_closing_degree')?.state);
    return Number.isFinite(closing) ? 100 - closing
      : radiators.length === 1 ? number(controller?.attributes.valve_open_percent) : NaN;
  }).filter(value => value >= 0 && value <= 100);
  const current = available(record) ? number(data.temperature) : NaN;
  const target = number(data.target);
  const managed = roomId !== 'schlafzimmer' && data.mode !== 'Temperaturanzeige';
  const active = [...radiators, cfg.heat_pump].some(id => {
    const device = panel.state(id);
    return available(device) && device.state !== 'off' && device.attributes.hvac_action === 'heating';
  });
  const fallback = ![...radiators, cfg.heat_pump].some(id => panel.state(id)?.attributes.hvac_action);
  const difference = target - current;
  const state = !managed ? 'sensor' : active || (fallback && difference > .3) ? 'heizt'
    : !Number.isFinite(difference) ? 'unbekannt' : difference >= -.3 ? 'hält' : 'ruht';
  const phase = data.plan[0];
  const next = data.plan.find(row => row.phase_key && row.phase_key !== phase?.phase_key && Date.parse(row.time) > Date.now());
  const source = panel.state(cfg.temperature_sensor);
  const secondary = panel.state(cfg.secondary_temperature_sensor);
  const ages = [source,secondary].filter(Boolean).map(sensor => Date.parse(sensor.last_reported ?? sensor.last_updated)).filter(Number.isFinite);
  return {
    name, current, managed, state, shown: target, valve: valves.length ? Math.max(...valves) : null,
    stale: ages.length > 0 && Date.now() - Math.max(...ages) >= 1800000,
    nextTime: clock(next?.time), nextTarget: number(next?.scheduled_target),
    override: clock(data.override?.until_iso), entryId: data.entry_id,
    planTarget: number(phase?.scheduled_target), min: 16, max: 24,
    ready: Boolean(managed && available(record) && Number.isFinite(target) &&
      !data.error && panel.ha?.connection?.connected !== false && panel.ha?.user?.is_admin),
  };
}

export class ClimatePanel {
  pending = new Map();
  overrides = new Map();

  constructor(panel) { this.panel = panel; }

  room(index) {
    const panel = this.panel;
    const name = roomNames[index];
    const manager = !panel.demo && managerRoom(panel, name);
    if (manager) return {...manager, shown: this.pending.get(index)?.value ?? manager.shown};
    const cfg = panel.config ?? {};
    const sensor = panel.state(cfg.climate?.find(entry => entry.name === name)?.entity);
    const thermostat = panel.state(cfg.thermostats?.find(entry => entry.name === name)?.entity);
    const schedule = panel.state(cfg.schedules?.find(entry => entry.name === name)?.entity);
    const attrs = thermostat?.attributes ?? {};
    const plan = available(schedule) ? schedule.attributes : {};
    const sensorValue = available(sensor) ? number(sensor.state) : NaN;
    const sensorC = sensor?.attributes.unit_of_measurement === '°F' ? (sensorValue - 32) * 5/9 : sensorValue;
    const reported = Date.parse(sensor?.last_reported ?? sensor?.last_updated);
    const stale = Boolean(Number.isFinite(sensorC) && Date.now()-reported >= 1800000);
    const valveIds = cfg.valves?.[name] ?? [];
    const valves = valveIds.map(id => panel.state(id)).filter(available)
      .map(entity => number(entity.state)).filter(value => value >= 0 && value <= 100);
    const current = panel.demo ? demo[index][0] : Number.isFinite(sensorC) ? sensorC : number(attrs.current_temperature);
    const target = panel.demo ? demo[index][1] : available(thermostat) ? number(attrs.temperature) : NaN;
    const managed = panel.demo ? target !== null : Boolean(thermostat);
    const shown = this.pending.get(index)?.value ?? this.overrides.get(index)?.value ?? target;
    const nextTime = panel.demo ? demo[index][4] : clock(plan.next_change);
    const nextTarget = panel.demo ? demo[index][2] : number(plan.next_temperature);
    const override = this.overrides.has(index) ? this.overrides.get(index).until
      : panel.demo ? ([0,2].includes(index) ? '21:00' : '') : clock(plan.override_until);
    const valve = panel.demo ? demo[index][3] : valves.length ? Math.max(...valves) : null;
    const diff = target - current;
    const action = attrs.hvac_action;
    const state = !managed ? 'sensor' : action === 'heating' ? 'heizt'
      : ['off','cooling','drying','fan'].includes(action) || thermostat?.state === 'off' ? 'ruht'
      : !Number.isFinite(diff) ? 'unbekannt' : !action && diff > .3 ? 'heizt'
      : diff >= -.3 ? 'hält' : 'ruht';
    const future = Number.isFinite(Date.parse(plan.next_change)) && Date.parse(plan.next_change) > Date.now();
    const ready = panel.demo || Boolean(Number.isFinite(target) && future &&
      Number.isFinite(number(plan.plan_temperature)) && available(panel.state(cfg.override_script)) &&
      available(panel.state(cfg.cancel_script)));
    return { name, current, stale, shown, managed, nextTime, nextTarget, override, valve,
      state, ready, thermostat, plan };
  }

  render() {
    return '<div class="room-grid">'+roomNames.map((_, index) => {
      const room = this.room(index);
      const [whole, fraction] = Number.isFinite(room.current) ? format.format(room.current).split(',') : ['—'];
      const disabled = room.ready ? '' : 'disabled';
      const target = Number.isFinite(room.shown) ? format.format(room.shown)+'°' : '—';
      const next = room.nextTime && Number.isFinite(room.nextTarget)
        ? room.nextTime+' → '+format.format(room.nextTarget)+'°' : 'PLAN —';
      const footer = room.stale ? '<span class="room-stale">Sensor still</span>'
        : !room.managed ? '' : room.override
          ? `<span class="override">Manuell bis ${room.override}</span><button aria-label="Übersteuerung ${room.name} beenden" data-action="climate-cancel:${index}" ${disabled}>×</button>`
          : `<span>${next}</span><span class="valve">Ventil ${room.valve === null ? '—' : room.valve+' %'}</span>`;
      return `<section class="room ${room.state}"><div class="room-head"><h2 title="${room.name}">${shortNames[index]}</h2><span>${room.state}</span></div>
        <div class="room-middle"><strong class="room-temp ${room.stale ? 'room-stale' : ''}">${whole}<small>${fraction ? ','+fraction+'°' : ''}</small></strong>
        ${!room.managed ? '<span class="sensor-label">Nur<br>Anzeige</span>' :
          `<div class="room-step"><button aria-label="${room.name} wärmer" data-action="climate-plus:${index}" ${disabled}>+</button>
          <span>${target}</span><button aria-label="${room.name} kälter" data-action="climate-minus:${index}" ${disabled}>−</button></div>`}</div>
        <div class="room-foot">${footer}</div></section>`;
    }).join('')+'</div>';
  }

  change(index, direction) {
    const room = this.room(index);
    if (!room.ready) return;
    const previous = this.pending.get(index);
    clearTimeout(previous?.timer);
    if (!direction) {
      this.pending.delete(index);
      this.commit(index, null);
      return;
    }
    const value = Math.min(room.max ?? 25, Math.max(room.min ?? 12, Math.round((room.shown + direction * .5)*2)/2));
    const timer = setTimeout(() => {
      this.pending.delete(index);
      this.commit(index, value);
    }, 1000);
    this.pending.set(index, {value,timer});
    this.panel.render();
  }

  async commit(index, target) {
    const room = this.room(index);
    const panel = this.panel;
    if (!room.ready) { panel.render(); return; }
    const plan = room.entryId ? room.planTarget : number(room.plan.plan_temperature);
    const cancel = target === null || target === plan;
    if (panel.demo) {
      this.overrides.set(index, {value:cancel ? demo[index][1] : target,until:cancel ? '' : room.nextTime});
      panel.render();
      return;
    }
    try {
      if (room.entryId) {
        await panel.ha.callWS({type:'heizungsmanager/override', entry_id:room.entryId,
          action:cancel ? 'clear' : 'set', ...(cancel ? {} : {temperature:target, duration:'schedule'})});
      } else await panel.call(cancel ? panel.config.cancel_script : panel.config.override_script, 'turn_on', {
        variables: {thermostat:room.thermostat.entity_id, temperature:cancel ? plan : target,
          plan_temperature:plan, expires_at:room.plan.next_change},
      });
    } catch { panel.notify('Heizungsaktion fehlgeschlagen'); }
    panel.render();
  }
}
