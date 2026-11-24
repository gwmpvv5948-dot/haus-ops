export function nightDisplayOff(date, states = {}, registry, configured = [], timeZone = 'Europe/Berlin') {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', hourCycle: 'h23',
  }).format(date));
  if (hour >= 6 && hour < 22) return false;
  let ids = configured;
  if (!ids?.length) {
    if (!registry) return false;
    const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const floors = new Set(registry.floors.filter(floor =>
      ['eg', 'erdgeschoss', 'erdgescho'].includes(normalize(floor.name))).map(floor => floor.floor_id));
    const areas = new Set(registry.areas.filter(area => floors.has(area.floor_id)).map(area => area.area_id));
    const devices = new Map(registry.devices.map(device => [device.id, device]));
    ids = registry.entities.filter(entity => !entity.disabled_by && entity.entity_id.startsWith('light.') &&
      areas.has(entity.area_id ?? devices.get(entity.device_id)?.area_id)).map(entity => entity.entity_id);
  }
  ids = ids.filter(id => ['on', 'off'].includes(states[id]?.state) && !states[id]?.attributes?.restored);
  return ids.length > 0 && ids.every(id => states[id]?.state === 'off');
}
