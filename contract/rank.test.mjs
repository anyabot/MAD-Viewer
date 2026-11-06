import { it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyPlan, isHardStage, needsOf, planStar, unitBill } from '../lib/farm.ts';
import {
  HARD_RUNS_PER_DAY, baseStar, exchangeCost, ladderFor, memoryPlan, memoryRef,
  memorySources, sellsMemory, starCap, stepCost, unlockCost,
} from '../lib/rank.ts';

it('star ranks cost what growth.json says and land on the farm bill', () => {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const growth = read('public/data/growth.json');
  const charData = read('public/data/characters.json');
  const stageData = read('public/data/stages.json');

  const star = growth.star;
  const playable = Object.values(charData.characters)
    .filter((e) => e.characterType === 1 && e.defaultStar != null && e.skillMaterialGroup);

  assert.ok(star, 'growth.json carries a star block');
  assert.equal(starCap(star), star.max, 'the cap reads back');
  assert.ok(star.max >= 2, 'and is a real cap');
  for (let s = 1; s < star.max; s += 1) {
    assert.ok(star.upgrade[String(s)] > 0, `${s}->${s + 1} costs memories`);
  }
  assert.equal(star.upgrade[String(star.max)], undefined, 'the top star has no step');
  assert.equal(star.upgradeFee, null, 'a star step charges no currency in this pack');

  for (const [code, ref] of Object.entries(star.pieces)) {
    assert.ok(growth.materials[ref], `${code}'s memory resolves a material`);
    assert.equal(growth.materials[ref].kind, 'piece', `${code}'s memory is a piece`);
  }
  for (const entry of playable) {
    assert.ok(memoryRef(star, entry.code), `${entry.code} has a memory item`);
    assert.ok(unlockCost(star, entry) > 0, `${entry.code} has an unlock cost`);
  }

  const toMax = (from) => {
    let sum = 0;
    for (let s = from; s < star.max; s += 1) sum += star.upgrade[String(s)];
    return sum;
  };
  assert.equal(stepCost(star, 1, 1), 0, 'standing still is free');
  assert.equal(stepCost(star, star.max, 1), 0, 'a backwards span costs nothing');
  assert.equal(stepCost(star, star.max, star.max), 0, 'a maxed unit needs nothing');
  assert.equal(stepCost(undefined, 1, 5), 0, 'no star block prices nothing');
  for (let from = 1; from <= star.max; from += 1) {
    assert.equal(stepCost(star, from, star.max), toMax(from), `${from}★ to the cap sums`);
  }

  for (const entry of playable) {
    const base = baseStar(entry);
    assert.equal(planStar(undefined, entry), base,
      `${entry.code} with no record sits at her release star`);
    assert.equal(planStar(emptyPlan(), entry), base,
      `${entry.code} with an empty plan sits there too`);
    assert.equal(planStar({ ...emptyPlan(), star: 0 }, entry), base,
      `${entry.code} cannot be planned below her release star`);
    assert.equal(planStar({ ...emptyPlan(), star: star.max }, entry), star.max,
      `${entry.code} reads back a real star`);
  }

  const exchange = star.exchange;
  assert.ok(exchange, 'the memory shop resolved');
  assert.ok(growth.materials[exchange.ref], 'the shop currency resolves a material');
  assert.equal(exchange.resets, false, 'the purchase count is lifetime');
  assert.ok(exchange.tiers.length > 1, 'the price escalates');
  let last = 0;
  for (const [i, tier] of exchange.tiers.entries()) {
    assert.ok(tier.price > 0, 'a rung has a price');
    if (i) assert.ok(tier.price > exchange.tiers[i - 1].price, 'the price only rises');
    if (tier.through != null) {
      assert.ok(tier.through > last, 'the thresholds are cumulative and rising');
      last = tier.through;
    } else {
      assert.equal(i, exchange.tiers.length - 1, 'only the last rung is uncapped');
    }
  }
  for (const code of exchange.codes) {
    assert.ok(star.pieces[code], `${code} is sold and has a memory item`);
    assert.ok(sellsMemory(star, code), `${code} reads back as sold`);
    assert.deepEqual(ladderFor(star, code), exchange.ladders?.[code] ?? exchange.tiers,
      `${code} resolves her own ladder`);
  }

  const tiers = exchange.tiers;
  const rung = tiers[0];
  assert.equal(exchangeCost(tiers, 0, 0), 0, 'buying nothing is free');
  assert.equal(exchangeCost(tiers, 0, 1), rung.price, 'the first purchase is the first rung');
  assert.equal(exchangeCost(tiers, 0, rung.through), rung.through * rung.price,
    'the first rung holds through its threshold');
  assert.equal(exchangeCost(tiers, 0, rung.through + 1),
    rung.through * rung.price + tiers[1].price, 'one more crosses to the next rung');
  assert.equal(exchangeCost(tiers, rung.through, 1), tiers[1].price,
    'a record already past the first rung pays the second');
  const wholeLadder = tiers.filter((t) => t.through != null)
    .reduce((sum, t, i, all) => sum + (t.through - (i ? all[i - 1].through : 0)) * t.price, 0);
  const capped = tiers[tiers.length - 2].through;
  assert.equal(exchangeCost(tiers, 0, capped), wholeLadder, 'the capped rungs sum');
  assert.equal(exchangeCost(tiers, 0, capped + 10),
    wholeLadder + 10 * tiers[tiers.length - 1].price, 'the last rung is flat and open');
  assert.equal(exchangeCost([{ through: 5, price: 1 }], 0, 6), null,
    'a ladder that runs out cannot price the purchase');
  assert.equal(exchangeCost([], 0, 1), null, 'an absent ladder prices nothing');

  const hard = stageData.stages.filter(isHardStage);
  assert.ok(hard.length > 0, 'the pack ships hard stages');
  const withMemory = new Map();
  for (const entry of playable) {
    const sources = memorySources(hard, memoryRef(star, entry.code));
    if (sources.length) withMemory.set(entry.code, sources);
    for (const source of sources) {
      assert.ok(source.perRun > 0, `${entry.code}'s stage pays a memory`);
      assert.ok(isHardStage(source.stage), `${entry.code}'s memory drops on a hard stage`);
    }
  }
  assert.ok(withMemory.size > 0, 'some unit has a memory route');
  const topStar = Math.max(...playable.map((e) => e.defaultStar));
  for (const entry of playable) {
    const has = withMemory.has(entry.code);
    if (entry.defaultStar === topStar) assert.ok(!has, `${entry.code} has no farm route`);
    else assert.ok(has, `${entry.code} has a farm route`);
  }
  assert.deepEqual(memorySources(hard, null), [], 'a unit with no memory item has no source');

  const sample = playable.find((e) => withMemory.has(e.code));
  const required = stepCost(star, baseStar(sample), star.max);
  const fresh = memoryPlan(star, sample.code, required, 0, 0, hard);
  assert.equal(fresh.required, required, 'the span is the release star to the cap');
  assert.equal(fresh.short, required, 'holding nothing is short the lot');
  assert.equal(fresh.buy, exchangeCost(ladderFor(star, sample.code), 0, required),
    'the exchange price follows the ladder');
  assert.ok(fresh.perDay > 0, 'and she farms');
  assert.equal(fresh.days, Math.ceil(required / fresh.perDay), 'days round up');

  const stocked = memoryPlan(star, sample.code, required, required, 0, hard);
  assert.equal(stocked.short, 0, 'holding the whole span leaves nothing short');
  assert.equal(stocked.buy, 0, 'and costs no currency');
  assert.equal(stocked.days, 0, 'and no farming');

  const partway = memoryPlan(star, sample.code, required, 0, rung.through, hard);
  assert.ok(partway.buy > fresh.buy,
    'a record already up the ladder pays more for the same memories');

  const topUnit = playable.find((e) => e.defaultStar === topStar);
  const noRoute = memoryPlan(star, topUnit.code, required, 0, 0, hard);
  assert.equal(noRoute.perDay, 0, `${topUnit.code} farms nothing`);
  assert.equal(noRoute.days, null, 'and reports no route rather than zero days');

  const unsold = playable.find((e) => !sellsMemory(star, e.code));
  if (unsold) {
    assert.equal(memoryPlan(star, unsold.code, 10, 0, 0, hard).buy, null,
      `${unsold.code} has no shop price`);
  }

  const flat = { current: emptyPlan(), target: emptyPlan() };
  const flatBill = unitBill(growth, sample, charData, flat);
  assert.equal(flatBill.materials[memoryRef(star, sample.code)], undefined,
    'a plan that raises no star owes no memory');

  const raised = {
    current: { ...emptyPlan(), star: baseStar(sample) },
    target: { ...emptyPlan(), star: star.max },
  };
  const raisedBill = unitBill(growth, sample, charData, raised);
  assert.equal(raisedBill.materials[memoryRef(star, sample.code)], required,
    'raising the star puts exactly the memory span on the bill');

  const need = needsOf(growth, raisedBill, {})
    .find((n) => n.key === memoryRef(star, sample.code));
  assert.ok(need, 'the memory is a need like any other');
  assert.equal(need.short, required, 'and is short the whole span with nothing held');
  const held = needsOf(growth, raisedBill, { [memoryRef(star, sample.code)]: 20 })
    .find((n) => n.key === memoryRef(star, sample.code));
  assert.equal(held.short, required - 20, 'inventory comes off it');

  const backwards = unitBill(growth, sample, charData, {
    current: { ...emptyPlan(), star: star.max },
    target: { ...emptyPlan(), star: baseStar(sample) },
  });
  assert.equal(backwards.materials[memoryRef(star, sample.code)], undefined,
    'a target under the current star owes nothing');

  const rosterMemories = playable.reduce((sum, entry) => sum
    + stepCost(star, baseStar(entry), star.max), 0);
});
