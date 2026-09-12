import { home } from 'https://cdn.jsdelivr.net/npm/clash-of-clans-data@0.16.0/+esm';

const seconds = (t={}) =>
  Number(t.days || 0) * 86400 +
  Number(t.hours || 0) * 3600 +
  Number(t.minutes || 0) * 60 +
  Number(t.seconds || 0);

const camel = (id='') => String(id).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function levelShape(level, category, heroTownHall=0) {
  let cost = 0;
  let resource = '';
  let duration = 0;

  if (['troops', 'spells', 'siege'].includes(category)) {
    cost = Number(level.researchCost || 0);
    resource = level.researchCostResource || '';
    duration = seconds(level.researchTime);
  } else if (['heroes', 'pets'].includes(category)) {
    cost = Number(level.upgradeCost || 0);
    resource = level.upgradeCostResource || '';
    duration = seconds(level.upgradeTime);
  } else {
    cost = Number(level.buildCost || 0);
    resource = level.buildCostResource || '';
    duration = seconds(level.buildTime);
  }

  return {
    level: Number(level.level || 0),
    townHallRequired: Number(level.townHallRequired || heroTownHall || 0),
    cost,
    resource,
    durationSeconds: duration
  };
}

function uniq(list) {
  const out = new Map();
  for (const item of list.flat().filter(Boolean)) {
    if (!item?.id || !Array.isArray(item.levels)) continue;
    const old = out.get(item.id);
    if (!old || item.levels.length > old.levels.length) out.set(item.id, item);
  }
  return [...out.values()];
}

function get(q) {
  try { return q?.get?.() || []; } catch { return []; }
}

export async function loadUpgradeData() {
  const h = home();
  const army = h.armyBuildings();
  const resources = h.resourceBuildings();
  const other = h.otherBuildings();

  const heroHall = army.heroHall?.().first?.();
  const heroCaps = heroHall?.levels || [];
  const heroTownHallForLevel = (hero, level) => {
    const key = camel(hero.id);
    const eligible = heroCaps
      .filter(x => Number(x?.heroLevelCaps?.[key] || 0) >= Number(level || 0))
      .sort((a,b) => Number(a.townHallRequired || 0) - Number(b.townHallRequired || 0));
    return Number(eligible[0]?.townHallRequired || 0);
  };

  const grouped = [
    ['buildings', uniq([
      get(h.defenses()),
      get(h.guardians()),
      get(resources),
      get(resources.clanCastle?.()),
      get(army),
      get(army.barracks?.()),
      get(army.darkBarracks?.()),
      get(army.laboratory?.()),
      get(army.spellFactory?.()),
      get(army.darkSpellFactory?.()),
      get(army.heroHall?.()),
      get(army.blacksmith?.()),
      get(army.workshop?.()),
      get(army.petHouse?.()),
      get(other),
      get(other.helperHut?.()),
      get(h.townHall())
    ])],
    ['traps', get(h.traps())],
    ['walls', get(h.walls())],
    ['troops', get(h.troops())],
    ['spells', get(h.spells())],
    ['siege', get(h.siegeMachines())],
    ['heroes', get(h.heroes())],
    ['pets', get(h.pets())]
  ];

  const items = [];
  for (const [category, entries] of grouped) {
    for (const obj of entries) {
      const levels = (obj.levels || []).map(level => {
        const th = category === 'heroes' ? heroTownHallForLevel(obj, level.level) : 0;
        return levelShape(level, category, th);
      }).filter(x => x.level > 0);
      if (!levels.length) continue;
      items.push({
        id: String(obj.id),
        dataId: obj.dataId != null ? Number(obj.dataId) : null,
        name: obj.name || obj.id,
        category,
        levels
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'clash-of-clans-data@0.16.0 via jsDelivr (MIT)',
    items: items.sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  };
}
