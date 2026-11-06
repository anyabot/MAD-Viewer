import { it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVELLABLE, MATERIAL_ICON_GROUPS, POOLS, applyPart, withPart, emptyBill, emptyPlan, farmPlan,
  farmStages, formatAmount, gearLevelCap, isFarmable, levellableSkills, mergeBills, needLabel,
  gearExp, needsOf, parseAmount, partBill, planParts, poolItems, skillCap, skillCost, spendBill,
  tierUpCost, unitBill, unitExp, equipExp, yieldPerRun, materialExchanges, exchangeHeld,
} from '../lib/farm.ts';
import { dropPlaceholderTiers } from '../lib/data.ts';

it('the farm planner resolves every material over growth, characters, stages, shops and icons', () => {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const growth = read('public/data/growth.json');
  const charData = dropPlaceholderTiers(read('public/data/characters.json'));
  const stageData = read('public/data/stages.json');
  const icons = read('public/data/icons.json').groups;
  const shopData = read('public/data/shops.json');

  const hasIcon = (name) => MATERIAL_ICON_GROUPS.some((g) => (icons[g] ?? []).includes(name));
  const missing = new Set(growth._noItemRow ?? []);

  const lateArt = [];

  assert.ok(Object.keys(growth.materials).length > 0, 'materials present');
  for (const [ref, material] of Object.entries(growth.materials)) {
    assert.match(ref, /^(item|goods):\d+$/, `${ref} is a <type>:<id> ref`);
    if (missing.has(ref)) continue;
    assert.ok(material.name, `${ref} is named`);
    assert.ok(material.kind, `${ref} carries a kind`);
    if (material.kind === 'piece' && !hasIcon(material.icon)) {
      lateArt.push(material.icon);
      continue;
    }
    assert.ok(hasIcon(material.icon), `${ref} resolves published art (${material.icon})`);
  }

  const bills = [
    ...Object.values(growth.skill.costs).flatMap((curve) => Object.values(curve)),
    ...Object.values(growth.equipment.tierUp).flatMap((slots) => Object.values(slots)),
  ];
  let lines = 0;
  for (const bill of bills) {
    for (const cost of bill) {
      assert.ok(growth.materials[cost.ref], `bill names a known material ${cost.ref}`);
      assert.ok(cost.amount > 0, `${cost.ref} costs a positive amount`);
      lines += 1;
    }
  }

  assert.deepEqual(Object.keys(growth.skill.maxLevel).map(Number).sort(),
    [...LEVELLABLE].sort(), 'every levellable categorize has a cap');
  for (const [categorize, cap] of Object.entries(growth.skill.maxLevel)) {
    for (const group of Object.values(growth.skill.groups)) {
      const curve = growth.skill.costs[String(group[categorize])];
      assert.ok(curve, `group ${group[categorize]} has a cost curve`);
      const levels = Object.keys(curve).map(Number).sort((a, b) => a - b);
      assert.deepEqual(levels, Array.from({ length: cap - 1 }, (_, i) => i + 1),
        `categorize ${categorize} pays every step up to ${cap}`);
    }
  }

  const tiers = Object.values(charData.equipment)[0].tiers.map((t) => t.tier);
  for (const tier of tiers.slice(1)) {
    const slots = growth.equipment.tierUp[String(tier)];
    assert.ok(slots, `tier ${tier} has tier-up bills`);
    assert.equal(Object.keys(slots).length, 12, `tier ${tier} covers all twelve slots`);
  }
  for (const table of [growth.unit.accumExp, growth.equipment.accumExp]) {
    const levels = Object.keys(table).map(Number).sort((a, b) => a - b);
    assert.equal(levels[0], 1, 'the exp curve starts at level 1');
    assert.equal(table['1'], 0, 'level 1 has cost nothing yet');
    for (let i = 1; i < levels.length; i += 1) {
      assert.ok(table[String(levels[i])] > table[String(levels[i - 1])],
        `the exp curve rises at level ${levels[i]}`);
    }
  }
  const balances = { unitExp: growth.unit.pool, equipExp: growth.equipment.pool };
  for (const pool of POOLS) {
    const items = poolItems(growth, pool);
    assert.ok(Object.keys(items).length > 1, `${pool} has a balance and feeding items`);
    for (const [ref, value] of Object.entries(items)) {
      assert.ok(growth.materials[ref], `${pool} item ${ref} is a known material`);
      assert.ok(value > 0, `${pool} item ${ref} is worth something`);
    }
    const balance = balances[pool];
    assert.equal(items[balance], 1, `${pool}'s stored balance is worth one each`);
    assert.equal(growth.materials[balance].kind, pool,
      `${pool}'s balance sorts with the items that feed it`);
  }

  const playable = Object.values(charData.characters)
    .filter((e) => e.characterType === 1 && !e.unreleased);
  assert.ok(playable.length > 0, 'playable roster present');
  let costed = 0;
  for (const entry of playable) {
    assert.ok(entry.skillMaterialGroup, `${entry.code} names a skill material group`);
    assert.ok(growth.skill.groups[String(entry.skillMaterialGroup)],
      `${entry.code} resolves material group ${entry.skillMaterialGroup}`);
    const skills = levellableSkills(entry, charData);
    assert.ok(skills.length > 0, `${entry.code} has a levellable skill`);
    for (const { skill } of skills) {
      const cap = skillCap(growth, skill);
      assert.equal(cap, skill.maxLevel,
        `${entry.code} agrees with the kit on its ${skill.categorize} cap`);
      const bill = skillCost(growth, entry.skillMaterialGroup, skill.categorize, 1, cap);
      assert.ok(bill.length > 0, `${entry.code} pays something to max that slot`);
    }
    for (const slot of entry.equipmentSlots ?? []) {
      assert.ok(tierUpCost(growth, slot, 1, tiers[tiers.length - 1]).length > 0,
        `${entry.code} slot ${slot} has a tier-up path`);
    }
    costed += 1;
  }

  const sample = playable.find((e) => (e.equipmentSlots ?? []).length === 3);
  const caps = charData.statCaps;
  const maxed = {
    level: caps.level,
    skills: Object.fromEntries(levellableSkills(sample, charData)
      .map(({ id, skill }) => [id, skillCap(growth, skill)])),
    gear: Object.fromEntries((sample.equipmentSlots ?? []).map((slot) => [slot, {
      tier: tiers[tiers.length - 1],
      level: gearLevelCap(growth, tiers[tiers.length - 1]),
    }])),
  };
  const fresh = unitBill(growth, sample, charData, { current: emptyPlan(), target: maxed });
  assert.ok(fresh.unitExp > 0, 'a level-1 unit needs unit exp');
  assert.ok(fresh.equipExp > 0, 'empty slots need equipment exp');
  assert.ok(Object.keys(fresh.materials).length > 0, 'the plan needs materials');
  assert.equal(fresh.unitExp, unitExp(growth, 1, caps.level), 'unit exp is the whole curve');
  assert.equal(fresh.equipExp,
    3 * tiers.reduce((sum, tier) => sum + equipExp(growth, 1, gearLevelCap(growth, tier)), 0),
    'three slots each pay every tier level curve independently');
  assert.deepEqual(tiers.map((tier) =>
    3 * equipExp(growth, 1, gearLevelCap(growth, tier))),
    [3966, 34989, 129189, 334755, 500088],
    'three-slot enhancement credit agrees with the checked per-tier totals');
  assert.equal(fresh.materials['goods:1'], 4291497,
    'fresh CH0001 max costs the checked total credits');

  const sampleSlot = sample.equipmentSlots[0];
  const priorTier = tiers[tiers.length - 2];
  const topTier = tiers[tiers.length - 1];
  const replacement = unitBill(growth, sample, charData, {
    current: { ...emptyPlan(), gear: { [sampleSlot]: {
      tier: priorTier, level: gearLevelCap(growth, priorTier),
    } } },
    target: { ...emptyPlan(), gear: { [sampleSlot]: {
      tier: topTier, level: gearLevelCap(growth, topTier),
    } } },
  });
  const replacementExp = equipExp(growth, 1, gearLevelCap(growth, topTier));
  assert.equal(replacement.equipExp, replacementExp,
    'the replacement tier starts its own EXP curve at level 1');
  assert.equal(replacement.materials[growth.equipment.levelFee.ref],
    replacementExp * growth.equipment.levelFee.perExp,
    'replacement-tier credit follows its independent tier EXP');
  assert.equal(gearExp(growth,
    { tier: 0, level: 1 }, { tier: topTier, level: gearLevelCap(growth, topTier) }),
    tiers.reduce((sum, tier) => sum + equipExp(growth, 1, gearLevelCap(growth, tier)), 0),
    'fresh equipment enhancement sums every independent tier curve');

  const noop = unitBill(growth, sample, charData, { current: maxed, target: maxed });
  assert.deepEqual(noop, emptyBill(), 'a met target costs nothing');
  const backwards = unitBill(growth, sample, charData,
    { current: maxed, target: emptyPlan() });
  assert.deepEqual(backwards, emptyBill(), 'a target below the current state costs nothing');

  assert.deepEqual(mergeBills([fresh, fresh]).materials,
    Object.fromEntries(Object.entries(fresh.materials).map(([k, v]) => [k, v * 2])),
    'two of the same plan cost twice as much');

  const whole = { current: emptyPlan(), target: maxed };
  const parts = planParts(sample, charData);
  assert.equal(parts.filter((p) => p.kind === 'gear').length, 3, 'every equipment slot is a part');
  assert.deepEqual(
    mergeBills(parts.map((part) => partBill(growth, sample, charData, whole, part))), fresh,
    'the parts of a plan cost exactly the whole plan');

  const levelPart = partBill(growth, sample, charData, whole, { kind: 'level' });
  assert.equal(levelPart.unitExp, fresh.unitExp, 'the level row carries all the unit exp');
  assert.equal(levelPart.equipExp, 0, 'the level row carries no equipment exp');

  const levelBanked = applyPart(whole, { kind: 'level' });
  assert.equal(levelBanked.current.level, caps.level, 'banking the level row moves that row up');
  assert.deepEqual(levelBanked.current.gear, {}, 'banking the level row moves nothing else');
  assert.deepEqual(unitBill(growth, sample, charData, levelBanked),
    mergeBills(parts.filter((part) => part.kind !== 'level')
      .map((part) => partBill(growth, sample, charData, whole, part))),
    'what is left owed is every other row');

  const gearPart = { kind: 'gear', slot: sampleSlot };
  const gearBanked = applyPart(whole, gearPart);
  const blank = { current: emptyPlan(), target: emptyPlan() };
  const oneRow = withPart(blank, whole, gearPart);
  assert.deepEqual(oneRow.target.gear[sampleSlot], whole.target.gear[sampleSlot], 'the row takes the draft target');
  assert.equal(oneRow.target.level, blank.target.level, 'no other row is taken from the draft');
  assert.deepEqual(partBill(growth, sample, charData, applyPart(oneRow, gearPart), gearPart), emptyBill(),
    'a row taken from the draft and banked owes nothing');
  assert.deepEqual(gearBanked.current.gear[sampleSlot], maxed.gear[sampleSlot],
    'banking an equipment row wears the target piece');
  assert.deepEqual(partBill(growth, sample, charData, gearBanked, gearPart), emptyBill(),
    'a banked row owes nothing');

  const pool = farmStages(growth, stageData);
  assert.ok(pool.length > 0, 'some stage pays a growth material every clear');
  const payable = new Set();
  for (const stage of pool) {
    for (const drop of stage.rewards.repeat ?? []) {
      if (drop.ref && growth.materials[drop.ref]) payable.add(drop.ref);
    }
  }
  const stored = new Set(Object.values(balances));
  const memories = new Set(Object.entries(growth.materials)
    .filter(([ref, m]) => m.kind === 'piece' || ref === growth.star?.exchange?.ref)
    .map(([ref]) => ref));
  const unreachable = Object.keys(growth.materials)
    .filter((ref) => !payable.has(ref) && !missing.has(ref) && !stored.has(ref)
      && !memories.has(ref));
  assert.deepEqual(unreachable, [],
    'every material a bill can name is farmable on repeat');

  const inventory = {};
  const clears = {};
  const reachable = (row) => !missing.has(row.need.key);
  const spend = (p) => Object.values(p.cost).reduce((n, v) => n + v, 0);

  const empty = farmPlan(growth, pool, fresh, inventory, clears, false);
  assert.equal(spend(empty), 0, 'nothing is farmable with no clears recorded');
  assert.ok(empty.blocked.length > 0, 'and every shortfall reports as blocked');
  for (const row of empty.needs) {
    assert.equal(row.need.have, 0, `${row.need.key} starts with nothing held`);
    assert.equal(row.need.short, row.need.required, `${row.need.key} is short the lot`);
    if (!reachable(row)) {
      assert.equal(row.sources.length, 0, `${row.need.key} is unreachable in this pack`);
      continue;
    }
    assert.ok(row.sources.length > 0, `${row.need.key} has a source somewhere`);
    assert.equal(row.locked, row.sources.length, `${row.need.key}'s sources are all locked`);
  }

  for (const stage of pool) clears[stage.id] = 1;
  const cleared = farmPlan(growth, pool, fresh, inventory, clears, false);
  assert.ok(spend(cleared) > 0, 'a cleared pool produces an entry-cost estimate');
  assert.deepEqual(cleared.blocked.map((r) => r.need.key).filter((k) => !missing.has(k)), [],
    'and nothing reachable is blocked');
  for (const row of cleared.needs.filter(reachable)) {
    assert.ok(row.best, `${row.need.key} has a best route`);
    assert.ok(row.best.open, 'the best route is one that is open');
    assert.ok(row.best.runs > 0, 'and it takes at least one run');
  }

  const perNeed = cleared.needs.reduce(
    (n, r) => n + (r.need.short > 0 && r.best ? r.best.runs : 0), 0);
  assert.ok(cleared.routes.length > 0, 'a cleared pool produces a run list');
  assert.ok(cleared.runs <= perNeed, 'the run list is never worse than a stage per need');
  const covered = {};
  for (const route of cleared.routes) {
    assert.ok(route.runs > 0, `${route.stage.id} is on the list for a reason`);
    assert.ok(isFarmable(clears[route.stage.id] ?? 0, false), 'every route is open');
    for (const [key, amount] of Object.entries(route.covers)) {
      covered[key] = (covered[key] ?? 0) + amount;
    }
  }
  for (const row of cleared.needs.filter(reachable)) {
    if (row.need.short <= 0) continue;
    assert.ok((covered[row.need.key] ?? 0) >= row.need.short - 1e-6,
      `${row.need.key} is closed by the run list`);
  }

  const fewest = farmPlan(growth, pool, fresh, inventory, clears, false, 'runs');
  assert.ok(fewest.runs <= cleared.runs, 'the fewest-runs list is never longer than the greedy one');
  const fewestCovered = {};
  for (const route of fewest.routes) {
    assert.ok(route.runs > 0 && isFarmable(clears[route.stage.id] ?? 0, false), 'every LP route is open and run');
    for (const [key, amount] of Object.entries(route.covers)) {
      fewestCovered[key] = (fewestCovered[key] ?? 0) + amount;
    }
  }
  for (const row of cleared.needs.filter(reachable)) {
    if (row.need.short <= 0) continue;
    assert.ok((fewestCovered[row.need.key] ?? 0) >= row.need.short - 1e-6,
      `${row.need.key} is closed by the fewest-runs list`);
  }
  const exchanges = materialExchanges(growth, shopData);
  assert.ok(exchanges.length > 0, 'the exchange shop yields material trades');
  for (const ex of exchanges) {
    assert.ok(growth.materials[ex.from] && growth.materials[ex.to], `${ex.from} -> ${ex.to} are materials`);
    assert.ok(ex.price > 0, 'every trade has a price');
  }
  const trade = exchanges[0];
  const spareStock = exchangeHeld({ materials: { [trade.to]: 2 }, unitExp: 0, equipExp: 0 },
    { [trade.from]: trade.price * 3 }, [trade]);
  assert.equal(spareStock.uses[0]?.count, 2, 'held spare is traded only up to the shortfall');
  assert.equal(spareStock.inventory[trade.from], trade.price, 'and the rest of the source stays held');
  const traded = farmPlan(growth, pool, fresh, inventory, clears, false, 'runs', exchanges);
  assert.ok(traded.runs <= fewest.runs, 'farming for the exchange never lengthens the fewest-runs list');
  const tradedCovered = {};
  for (const route of traded.routes) {
    for (const [key, amount] of Object.entries(route.covers)) tradedCovered[key] = (tradedCovered[key] ?? 0) + amount;
  }
  for (const use of traded.exchanges) {
    tradedCovered[use.from] = (tradedCovered[use.from] ?? 0) - use.count * use.price;
    tradedCovered[use.to] = (tradedCovered[use.to] ?? 0) + use.count;
  }
  for (const row of cleared.needs.filter(reachable)) {
    if (row.need.short <= 0 || row.need.kind !== 'material') continue;
    assert.ok((tradedCovered[row.need.key] ?? 0) >= row.need.short - 1e-6,
      `${row.need.key} is closed by the run list with trades`);
  }

  assert.ok(Object.keys(cleared.cost).length > 1,
    'the estimate is split across more than one entry currency');
  for (const [ref, amount] of Object.entries(cleared.cost)) {
    assert.ok(stageData.drops[ref]?.name, `${ref} is a named currency`);
    assert.ok(amount > 0, `${ref} costs something`);
  }

  const swept = farmPlan(growth, pool, fresh, inventory, clears, true);
  assert.equal(spend(swept), 0, '1★ clears sweep nothing');
  for (const stage of pool) clears[stage.id] = 3;
  const sweptFull = farmPlan(growth, pool, fresh, inventory, clears, true);
  assert.deepEqual(sweptFull.cost, cleared.cost, '3★ everywhere sweeps everything');
  assert.ok(isFarmable(1, false) && !isFarmable(1, true) && isFarmable(3, true),
    'the clear and sweep rules are what they say');

  const tierOneBracelet = farmPlan(growth, pool, {
    materials: { 'item:90103': 2 }, unitExp: 0, equipExp: 0,
  }, {}, clears, false);
  assert.equal(tierOneBracelet.needs[0].best.stage.id, 1001103,
    'equal-cost normal equipment stages beat hard character-card stages on useful drops');
  assert.equal(tierOneBracelet.routes[0].stage.id, 1001103,
    'the combined run list uses the same cost and useful-drop ranking');

  const stocked = {};
  for (const [ref, amount] of Object.entries(fresh.materials)) stocked[ref] = amount;
  for (const pool_ of POOLS) {
    const [ref, value] = Object.entries(poolItems(growth, pool_)).sort((a, b) => b[1] - a[1])[0];
    stocked[ref] = Math.ceil((pool_ === 'unitExp' ? fresh.unitExp : fresh.equipExp) / value);
  }
  const done = farmPlan(growth, pool, fresh, stocked, clears, false);
  assert.deepEqual(done.cost, {}, 'a full inventory needs no farming');
  assert.equal(done.runs, 0, 'and no runs');
  for (const row of done.needs) assert.equal(row.need.short, 0, `${row.need.key} is covered`);

  const after = spendBill(growth, fresh, stocked);
  for (const ref of Object.keys(fresh.materials)) {
    assert.equal(after[ref], 0, `${ref} is spent down to nothing`);
  }
  for (const pool_ of POOLS) {
    const owed = pool_ === 'unitExp' ? fresh.unitExp : fresh.equipExp;
    const items = poolItems(growth, pool_);
    const held = Object.entries(items)
      .reduce((n, [ref, value]) => n + (stocked[ref] ?? 0) * value, 0);
    const left = Object.entries(items)
      .reduce((n, [ref, value]) => n + (after[ref] ?? 0) * value, 0);
    assert.equal(left, held - owed, `${pool_}'s excess is banked, not lost`);
    assert.ok(after[balances[pool_]] >= 0, `${pool_}'s balance never goes negative`);
  }
  const banked = { [balances.unitExp]: fresh.unitExp };
  const spentBanked = spendBill(growth, { materials: {}, unitExp: fresh.unitExp, equipExp: 0 },
    banked);
  assert.equal(spentBanked[balances.unitExp], 0, 'the stored balance pays first');
  const broke = spendBill(growth, fresh, {});
  for (const value of Object.values(broke)) assert.ok(value >= 0, 'nothing goes negative');

  for (const [text, want] of [
    ['0', 0], ['', 0], ['12', 12], ['1,200', 1200], ['150k', 150_000], ['2.5m', 2_500_000],
    ['2.5M', 2_500_000], [' 1 k ', 1000], ['1b', 1_000_000_000], ['0.5k', 500],
  ]) {
    assert.equal(parseAmount(text), want, `"${text}" parses to ${want}`);
  }
  for (const text of ['abc', '1x', '--', '.', '1.2.3', '1k2']) {
    assert.equal(parseAmount(text), null, `"${text}" is not an amount`);
  }
  for (const [value, want] of [
    [0, '0'], [7, '7'], [9999, '9999'], [150_000, '150k'], [2_500_000, '2.5m'],
    [2_500_001, '2500001'],
  ]) {
    assert.equal(formatAmount(value), want, `${value} shows as ${want}`);
  }
  assert.equal(parseAmount(formatAmount(2_500_000)), 2_500_000, 'the pair round-trips');

  for (const row of cleared.needs.filter(reachable)) {
    for (const lang of ['en', 'ko']) {
      const label = needLabel(growth, row.need, lang);
      assert.ok(label.name, `${row.need.key} is labelled in ${lang}`);
      assert.ok(label.name !== row.need.key, `${row.need.key} is not shown raw in ${lang}`);
    }
  }

  const doubled = pool.find((stage) => {
    const seen = new Set();
    return (stage.rewards.repeat ?? []).some(
      (d) => d.ref && growth.materials[d.ref] && (seen.has(d.ref) || (seen.add(d.ref), false)));
  });
  if (doubled) {
    const ref = (doubled.rewards.repeat ?? []).find((d) => growth.materials[d.ref]).ref;
    const need = needsOf(growth, { materials: { [ref]: 1 }, unitExp: 0, equipExp: 0 }, {})[0];
    const entries = doubled.rewards.repeat.filter((d) => d.ref === ref);
    const expected = entries.reduce((n, d) => {
      const [min, max] = d.amount;
      return n + (max ? (min + max) / 2 : min) * (d.chance ?? 1);
    }, 0);
    assert.ok(Math.abs(yieldPerRun(growth, doubled, need) - expected) < 1e-9,
      'a repeated drop is summed, not deduped');
  }

  const sourcedStages = new Set(cleared.needs.flatMap((r) => r.sources.map((s) => s.stage.id)));

  {
    const entry = charData.characters.CH0001;
    const nodes = (path) => entry.infusion.nodes.filter((n) => n.path === path);
    const sum = (path) => nodes(path).reduce((a, n) => a + n.cost, 0);
    const pair = {
      current: { ...emptyPlan(60), star: 5 },
      target: { ...emptyPlan(60), star: 5, infusion: { surface: 10, deep: 10 } },
    };
    assert.ok(planParts(entry, charData).some((p) => p.kind === 'infusion'), 'infusion is a plan row');
    const surface = partBill(growth, entry, charData, pair, { kind: 'infusion', path: 'surface' });
    assert.deepEqual(surface.materials, { [growth.infusion.material]: sum('surface') });
    const deep = partBill(growth, entry, charData, pair, { kind: 'infusion', path: 'deep' });
    assert.deepEqual(deep.materials, { [growth.star.pieces.CH0001]: sum('deep') });
    const low = { ...pair, target: { ...pair.target, star: 4 } };
    assert.deepEqual(partBill(growth, entry, charData, low, { kind: 'infusion', path: 'deep' }).materials,
      {}, 'a deep node above the target star costs nothing');
    const banked = applyPart(pair, { kind: 'infusion', path: 'surface' });
    assert.equal(banked.current.infusion.surface, 10, 'banking moves the current side');
    assert.ok(stageData.stages && Object.values(stageData.stages).some((st) =>
      (st.rewards?.repeat ?? []).some((d) => d.ref === growth.infusion.material)),
      'some stage pays the infusion material every clear');
  }
});
