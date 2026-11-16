const sensors = {
  meter: ['Wasserzähler', 'sensor.wasserzaehler'],
  today: ['Verbrauch heute', 'sensor.wassermanager_verbrauch_heute'],
  year: ['Verbrauch seit Januar', 'sensor.wassermanager_verbrauch_seit_januar'],
  average: ['Durchschnitt 14 Tage', 'sensor.wassermanager_durchschnitt_14_tage'],
  flow: ['Durchfluss (L/min)', 'sensor.wasser_durchfluss'],
  leak: ['Dauerfluss-Warnung', 'binary_sensor.wasser_dauerfluss'],
};
export const waterFields = Object.entries(sensors).map(([key, [label, entity]]) =>
  ['water.' + key, label, [entity.split('.')[0]]]);
const format = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString('de-DE', {minimumFractionDigits: digits, maximumFractionDigits: digits})
  : '—';
const numeric = value => value?.trim() ? Number(value) : NaN;
const dayKey = date => date.toLocaleDateString('sv-SE');
const weekdays = new Intl.DateTimeFormat('de-DE', {weekday: 'short'});
const band = (label, color) => `<h2 class="band" style="--band:var(--${color})">${label}</h2>`;
const demoDays = [168,192,145,210,176,188,231,159,174,201,163,187,149];

export class WaterPanel {
  constructor(panel) { this.panel = panel; }

  entity(key) { return this.panel.config?.water?.[key] || sensors[key][1]; }

  refresh(today) {
    const panel = this.panel;
    const entity = this.entity('today');
    const source = panel.state(entity);
    if (panel.demo || !panel.ha?.callApi || !source) return;
    const key = entity + '/' + dayKey(today);
    if (this.historyKey === key && Date.now() < this.nextFetch) return;
    if (this.historyKey !== key) this.history = [];
    this.historyKey = key;
    this.nextFetch = Date.now() + 600000;
    const start = new Date(today);
    start.setDate(start.getDate() - 13);
    const published = source.attributes.daily_liters ?? {};
    const complete = Array.from({length:13}, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return Number.isFinite(published[dayKey(date)]);
    }).every(Boolean);
    if (complete && Array.isArray(source.attributes.today_points) && source.attributes.today_points.length) return;
    const query = new URLSearchParams({
      filter_entity_id: entity, end_time: new Date().toISOString(),
      minimal_response: '1', no_attributes: '1', significant_changes_only: '0',
    });
    const request = panel.ha.callApi('GET', `history/period/${start.toISOString()}?${query}`);
    this.request = request;
    request.then(([rows]) => {
      if (this.request !== request || this.historyKey !== key) return;
      const factor = source.attributes.unit_of_measurement === 'm³' ? 1000 : 1;
      this.history = (rows ?? []).map(row => ({
        date: new Date(row.last_changed || row.last_updated), liters: numeric(row.state) * factor,
      })).filter(row => Number.isFinite(row.liters) && Number.isFinite(row.date.getTime()));
      panel.render();
    }).catch(() => {
      if (this.request !== request || this.historyKey !== key) return;
      this.nextFetch = Date.now() + 60000;
    });
  }

  update(main, layout) {
    const template = document.createElement('template');
    template.innerHTML = layout;
    const next = template.content;
    const page = main.querySelector('.water-page');
    page.className = next.querySelector('.water-page').className;
    for (const selector of ['.water-level', '.water-total', '.water-percent', '.water-scale',
      '.water-average-line', '.water-meter', '.water-chart', '.water-column', '.water-average',
      '.water-rate', '.water-duration', '.water-year']) {
      const current = [...page.querySelectorAll(selector)];
      const incoming = [...next.querySelectorAll(selector)];
      if (selector === '.water-meter') {
        const reels = current[0]?.querySelectorAll('.water-reel > span');
        const digits = incoming[0]?.querySelectorAll('.water-reel > span');
        if (reels?.length && reels.length === digits?.length) {
          current[0].setAttribute('aria-label', incoming[0].getAttribute('aria-label'));
          reels.forEach((reel, index) => {
            reel.style.setProperty('--digit', digits[index].style.getPropertyValue('--digit'));
          });
          continue;
        }
      }
      current.forEach((node, index) => {
        const replacement = incoming[index];
        if (node.isEqualNode(replacement)) return;
        if (selector === '.water-level') node.setAttribute('style', replacement.getAttribute('style'));
        else if (selector === '.water-column') {
          node.setAttribute('style', replacement.getAttribute('style'));
          node.firstElementChild.textContent = replacement.firstElementChild.textContent;
          node.parentElement.className = replacement.parentElement.className;
        } else node.replaceWith(replacement);
      });
    }
    page.querySelectorAll('.water-day small').forEach((node, index) => {
      node.textContent = next.querySelectorAll('.water-day small')[index].textContent;
    });
  }

  view() {
    const demo = this.panel.demo;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    this.refresh(midnight);
    const meterState = this.panel.state(this.entity('meter'));
    const read = (key, liters = false) => {
      const sensor = this.panel.state(this.entity(key));
      const value = numeric(sensor?.state);
      if (liters) return value * (sensor?.attributes?.unit_of_measurement === 'm³' ? 1000 : 1);
      return value / (sensor?.attributes?.unit_of_measurement?.toLowerCase() === 'l' ? 1000 : 1);
    };
    const meter = demo ? 852.554 : read('meter');
    const published = this.panel.state(this.entity('today'))?.attributes;
    const fallbackMeter = published?.meter_entity === this.entity('meter') ? published.last_meter_m3 : null;
    const shownMeter = Number.isFinite(meter) ? meter : fallbackMeter;
    const used = demo ? 107 : read('today', true);
    const year = demo ? 79.255 : read('year');
    const flow = demo ? 0 : read('flow', true);
    const age = Date.now() - Date.parse(meterState?.last_reported || meterState?.last_updated);
    const stale = !demo && (!Number.isFinite(meter) || age > 1800000);
    const flowing = flow > 0;
    if (!flowing) this.flowStart = undefined;
    else this.flowStart ??= {time: now.getTime(), meter};
    const elapsed = this.flowStart ? Math.floor((now.getTime() - this.flowStart.time) / 1000) : 0;
    const volume = this.flowStart && !stale ? Math.round((meter - this.flowStart.meter) * 1000) : 0;
    const limits = this.panel.config?.water;
    const alarm = !demo && (this.panel.state(this.entity('leak'))?.state === 'on' || elapsed >= (limits?.leak_minutes ?? 30) * 60 || volume >= (limits?.leak_liters ?? 300));
    const days = new Map();
    const minute = date => date.getHours() * 60 + date.getMinutes();
    const points = [];
    const day = dayKey(now);
    for (const row of this.history ?? []) {
      const key = dayKey(row.date);
      if (key === day) points.push([minute(row.date), row.liters]);
      else days.set(key, Math.max(days.get(key) ?? 0, row.liters));
    }
    const key = this.entity('today') + '/' + day;
    if (this.liveKey !== key) {
      this.liveKey = key;
      this.live = [];
    }
    if (Number.isFinite(used) && this.live.at(-1)?.[1] !== used) this.live.push([minute(now), used]);
    const previous = Array.from({length: 13}, (_, index) => {
      const date = new Date(midnight);
      date.setDate(date.getDate() - 13 + index);
      return [weekdays.format(date).replace('.', ''), demo ? demoDays[index] : published?.daily_liters?.[dayKey(date)] ?? days.get(dayKey(date))];
    });
    const available = previous.map(([, value]) => value).filter(Number.isFinite);
    const publishedAverage = read('average', true);
    const average = !demo && Number.isFinite(publishedAverage) ? publishedAverage
      : available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : NaN;
    const maximum = Math.max(260, Number.isFinite(used) ? used : 0, ...available);
    const trend = demo ? [[60,54],[330,62],[415,96],[430,100],[500,107]] :
      [...(published?.today_points?.length ? published.today_points : points), ...this.live].sort((a,b) => a[0]-b[0]);
    const status = alarm ? 'Warnung · Dauerfluss erkannt · Leck prüfen' : stale ? (Number.isFinite(shownMeter) ? 'Zähler · letzter gültiger Stand' : 'Zähler keine Daten')
      : flowing ? `Wasser fließt · ${format(flow,1)} L/min` : `Wasser OK · heute ${format(used)} L · Ø ${format(average)} L`;
    return {
      status, alarm, stale,
      layout: `<section class="water-page ${flowing ? 'water-flowing' : ''}">
        <section class="water-left">${band('Heute','--blue')}
          ${tank(used, maximum, average)}
          ${band('Durchfluss','--purple')}
          <div class="water-pipe" aria-hidden="true"></div>
          <div class="water-rate"><strong>${format(flow,1)} <small>L/min</small></strong><b>${flowing ? 'Fließt' : Number.isFinite(flow) ? 'Ruhe' : 'Keine Daten'}</b></div>
          <small class="water-duration ${alarm ? 'warn' : ''}">Dauerfluss ${elapsed >= 60 ? Math.floor(elapsed/60)+' min' : elapsed+' s'} · ${alarm ? 'Prüfen!' : Number.isFinite(flow) ? 'OK' : '—'}</small>
        </section>
        <section class="water-right">
          <div class="water-stats"><article><small>Seit 1. Januar</small><strong class="water-year">${format(year,3)} <small>m³</small></strong></article>
            <article><small>Zählerstand</small>${odometer(shownMeter)}</article></div>
          ${band('Verlauf heute','--peach')}
          <div class="water-chart-reveal">${chart(trend, used, demo ? Math.max(510,minute(now)) : minute(now))}</div>
          ${band('Täglicher Verbrauch · 14 Tage','--pink')}
          ${columns([...previous, ['Heute',used]], maximum, average)}
        </section>
      </section>`,
    };
  }
}

function tank(used, max, average) {
  const level = 146 - Math.max(0, (Number.isFinite(used) ? used : 0) / max * 142);
  const wave = 'M-68 0 q17 -8 34 0t34 0t34 0t34 0t34 0t34 0t34 0 L170 155 H-68Z';
  return `<div class="water-tank">
    <svg viewBox="0 0 146 155" role="img" aria-label="Wassertank" data-water-motion="tank">
      <clipPath id="water-tank-clip"><rect x="4" y="4" width="102" height="142" rx="16"/></clipPath>
      <rect x="4" y="4" width="102" height="142" rx="16" fill="#0b1520" stroke="#99ccff" stroke-width="3"/>
      <g clip-path="url(#water-tank-clip)"><g class="water-level" style="--level:${level}px">
        <path class="water-wave back" d="${wave}"/><path class="water-wave" d="${wave}"/>
      </g>
      ${`<line class="water-average-line" visibility="${Number.isFinite(average) ? 'visible' : 'hidden'}" x1="4" x2="106" y1="${146-(Number.isFinite(average)?average:0)/max*142}" y2="${146-(Number.isFinite(average)?average:0)/max*142}" stroke="#cc99cc" stroke-dasharray="3 3"/>`}
      </g>
      ${[0,100,200].map(value=>`<text class="water-scale" x="113" y="${145-value/max*142}">${value}</text>`).join('')}
      <text class="water-total" x="55" y="36">${format(used)} L</text>
      <text class="water-percent" x="55" y="51">${average > 0 ? format(used/average*100)+' % von Ø '+format(average)+' L' : 'Ø —'}</text>
    </svg></div>`;
}

function odometer(value) {
  if (!Number.isFinite(value)) return '<div class="water-meter"><strong>— <small>m³</small></strong></div>';
  const [whole, fraction] = value.toFixed(3).split('.');
  const reel = digit => `<span class="water-reel"><span style="--digit:${digit}">${Array.from({length:10},(_,i)=>`<i>${i}</i>`).join('')}</span></span>`;
  return `<div class="water-meter" role="img" aria-label="${format(value,3)} Kubikmeter">${Array.from(whole.padStart(3,'0'), reel).join('')}<b>,</b>${Array.from(fraction,reel).join('')}<small>m³</small></div>`;
}

function chart(points, used, minute) {
  const max = Math.max(140, Math.ceil((Number.isFinite(used) ? used : 0) / 20 + 1) * 20,
    ...points.map(([,value]) => value));
  const x = time => 27 + time / 1440 * 444;
  const y = value => 90 - value / max * 78;
  const steps = points.map(([time,value]) => `H${x(time)}V${y(value)}`).join('');
  const line = Number.isFinite(used) ? `M27 90${steps}H${x(minute)}V${y(used)}` : '';
  return `<svg class="water-chart" viewBox="0 0 480 107" role="img" aria-label="Kumulierte Liter heute">
    ${[0,max/2,max].map(value=>`<text x="22" y="${y(value)+3}" text-anchor="end">${format(value)}</text><path d="M27 ${y(value)}H471" stroke="#2a2a2a"/>`).join('')}
    ${line ? `<path d="${line}V90H27Z" fill="#ff9966" opacity=".14"/>
      <path d="${line}" fill="none" stroke="#ff9966" stroke-width="3"/>
      <path d="M${x(minute)} 12V90" stroke="#99ccff" stroke-dasharray="3 3"/>
      <circle class="water-now" cx="${x(minute)}" cy="${y(used)}" r="4" fill="#99ccff"/>
      <text x="${x(minute)+(minute>1300?-7:7)}" y="${Math.max(9,y(used)-5)}" text-anchor="${minute>1300?'end':'start'}">${format(used)} L</text>` : ''}
    ${[0,6,12,18,24].map(hour=>`<text x="${x(hour*60)}" y="103" text-anchor="${hour===24?'end':hour===0?'start':'middle'}">${String(hour).padStart(2,'0')}:00</text>`).join('')}
  </svg>`;
}

function columns(days, max, average) {
  return `<div class="water-days">
    ${days.map(([label,value],index)=>`<div class="water-day ${index===13?'current':value>average*1.15?'high':''}">
      <div class="water-column" style="--amount:${Number.isFinite(value)?value/max*100:0}%"><span>${format(value)}</span><i></i></div><small>${label}</small></div>`).join('')}
    <div class="water-average" ${Number.isFinite(average) ? '' : 'hidden'} style="--average:${Number.isFinite(average)?average/max:0}"><span>Ø ${format(average)} L</span></div>
  </div>`;
}
