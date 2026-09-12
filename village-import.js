export const normalizeName = (value='') => String(value)
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/builders/g, 'builder')
  .replace(/[^a-z0-9]/g, '');

export function indexItems(items=[]) {
  const byKey = new Map();
  for (const item of items) {
    if (item.dataId != null) byKey.set(`dataId:${Number(item.dataId)}`, item);
    byKey.set(`${item.category}:${normalizeName(item.name)}`, item);
    const n = normalizeName(item.name);
    if (!byKey.has(`*:${n}`)) byKey.set(`*:${n}`, item);
  }
  return byKey;
}

export function findItem(itemsIndex, mapEntry, dataId=null) {
  if (dataId != null) {
    const direct = itemsIndex.get(`dataId:${Number(dataId)}`);
    if (direct) return direct;
  }
  if (!mapEntry) return null;
  const n = normalizeName(mapEntry.name);
  const aliases = [n,
    n.replace('builderhut','buildershut'),
    n.replace('buildershut','builderhut'),
    n.replace('townhall','townhall'),
    n.replace('xbow','xbow')
  ];
  for (const a of aliases) {
    const exact = itemsIndex.get(`${mapEntry.category}:${a}`);
    if (exact) return exact;
  }
  for (const a of aliases) {
    const any = itemsIndex.get(`*:${a}`);
    if (any) return any;
  }
  return null;
}

const asArray = v => Array.isArray(v) ? v : [];
const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function parseVillageExport(raw, exportMap, items) {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Der Inhalt ist kein gültiges Village-JSON-Objekt.');
  if (!Array.isArray(obj.buildings) && !Array.isArray(obj.units) && !Array.isArray(obj.heroes)) {
    throw new Error('Das JSON sieht nicht wie der Clash-of-Clans-Village-Export aus. Erwartet werden z. B. buildings, units oder heroes.');
  }

  const exportedAtMs = num(obj.timestamp) > 1e12 ? num(obj.timestamp) : num(obj.timestamp) * 1000;
  const effectiveTimestamp = exportedAtMs || Date.now();
  const elapsedMs = Math.max(0, Date.now() - effectiveTimestamp);
  const idx = indexItems(items);
  const result = {
    tag: String(obj.tag || '').trim(),
    timestamp: effectiveTimestamp,
    th: 0,
    progress: {},
    running: {},
    instances: {},
    unknown: [],
    stats: { imported: 0, running: 0, unknown: 0, structures: 0 }
  };

  const registerUnknown = (section, rec) => {
    result.unknown.push({ section, data: rec?.data, lvl: rec?.lvl, cnt: rec?.cnt, timer: rec?.timer });
    result.stats.unknown++;
  };

  const pushStructure = (item, rec, running=false) => {
    if (!result.instances[item.id]) result.instances[item.id] = [];
    const level = Math.max(0, num(rec.lvl));
    const instance = { level };
    if (running && num(rec.timer) > 0) {
      const remainingMs = Math.max(0, num(rec.timer) * 1000 - elapsedMs);
      instance.running = {
        from: level,
        to: level + 1,
        start: effectiveTimestamp,
        end: Date.now() + remainingMs,
        imported: true
      };
      result.stats.running++;
    }
    result.instances[item.id].push(instance);
    result.stats.structures++;
    result.stats.imported++;
  };

  const importStructures = (section, records) => {
    for (const rec of asArray(records)) {
      if (!rec || rec.data == null) continue;
      const mapEntry = exportMap[String(rec.data)];
      if (!mapEntry) { registerUnknown(section, rec); continue; }
      // Gear-up marker rows are metadata about an existing building, not another copy.
      if (rec.gear_up && rec.timer == null && rec.cnt == null) continue;
      const item = findItem(idx, mapEntry, rec.data);
      if (!item) { registerUnknown(section, rec); continue; }
      if (String(rec.data) === '1000001') result.th = Math.max(result.th, num(rec.lvl));
      if (num(rec.timer) > 0) {
        pushStructure(item, rec, true);
      } else {
        const count = Math.max(1, Math.floor(num(rec.cnt, 1)));
        for (let i=0;i<count;i++) pushStructure(item, rec, false);
      }
    }
  };

  const importSingletons = (section, records) => {
    for (const rec of asArray(records)) {
      if (!rec || rec.data == null) continue;
      const mapEntry = exportMap[String(rec.data)];
      if (!mapEntry) { registerUnknown(section, rec); continue; }
      const item = findItem(idx, mapEntry, rec.data);
      if (!item) { registerUnknown(section, rec); continue; }
      const level = Math.max(0, num(rec.lvl));
      result.progress[item.id] = level;
      result.stats.imported++;
      if (num(rec.timer) > 0) {
        const remainingMs = Math.max(0, num(rec.timer) * 1000 - elapsedMs);
        result.running[item.id] = {
          from: level,
          to: level + 1,
          start: effectiveTimestamp,
          end: Date.now() + remainingMs,
          imported: true
        };
        result.stats.running++;
      }
    }
  };

  importStructures('buildings', obj.buildings);
  importStructures('traps', obj.traps);
  importSingletons('units', obj.units);
  importSingletons('siege_machines', obj.siege_machines);
  importSingletons('heroes', obj.heroes);
  importSingletons('spells', obj.spells);
  importSingletons('pets', obj.pets);

  if (!result.th) {
    const thItem = items.find(i => normalizeName(i.name) === 'townhall');
    const thInstances = thItem ? result.instances[thItem.id] : null;
    if (thInstances?.length) result.th = Math.max(...thInstances.map(x => x.level));
  }
  if (!result.th) throw new Error('Rathaus-Level konnte im Export nicht erkannt werden.');
  return result;
}
