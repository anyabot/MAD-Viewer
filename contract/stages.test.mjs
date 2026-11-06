import { it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIFFICULTY_LABEL, ENCOUNTER_LABEL, EVENT_LABEL, MISSION_ICON, TRIGGER_LABEL, enemyCodes,
  groupLabel, groupSlots, levelRange, missionCheck, modeLabel, stageById, stageName,
  subMissionText, subMissionsOf, stageGroups, groupWindow, groupIsLive, zoneOf,
  modeSummaries, groupByKey, stageDrops,
  CHANNEL_ORDER, DROP_ICON_GROUPS, GROUP_ICON_GROUPS, dropAmount, dropChance, dropName,
} from '../lib/stages.ts';
import { typeIcons, typeLabel } from '../lib/characters.ts';

it('stages.json, characters.json and icons.json agree', () => {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const data = read('public/data/stages.json');
  const charData = read('public/data/characters.json');
  const icons = read('public/data/icons.json').groups;
  const { characters, skillSets, types } = charData;
  const has = (group, n) => !!n && icons[group].includes(n);
  const anyOf = (group, names) => names.some((n) => has(group, n));
  const { stages, zones, enemies, modes, subMissions, drops, groups: allGroups } = data;

  assert.ok(stages.length > 0, 'stages present');
  const modeKeys = new Set(modes.map((m) => m.key));
  for (const m of modes) {
    assert.ok(m.label.en && m.label.ko, `mode ${m.key} is labelled in both languages`);
  }

  const ids = new Set();
  for (const stage of stages) {
    assert.ok(!ids.has(stage.id), `stage id ${stage.id} is unique`);
    ids.add(stage.id);
    assert.ok(modeKeys.has(stage.mode), `stage ${stage.id} names a listed mode`);
    assert.ok(Array.isArray(stage.waves), `stage ${stage.id} has a wave list`);
    if (stage.mode === 'story') {
      assert.ok(zones[String(stage.zoneId)], `story stage ${stage.id} resolves its zone`);
    }
    if (stage.subMissionGroup) {
      assert.ok(subMissions[stage.subMissionGroup],
        `stage ${stage.id} resolves sub-mission group ${stage.subMissionGroup}`);
    }
  }

  const noWaves = stages.filter((s) => s.waves.length === 0);
  assert.equal(noWaves.length, 0,
    `every stage has wave rows; missing on ${noWaves.map((s) => s.id).join(', ')}`);

  let slots = 0;
  const usedCodes = new Set();
  for (const stage of stages) {
    for (const wave of stage.waves) {
      assert.ok(wave.enemies.length > 0, `stage ${stage.id} wave ${wave.sequence} is populated`);
      for (const slot of wave.enemies) {
        slots += 1;
        assert.ok(slot.code, `stage ${stage.id} wave ${wave.sequence} slot resolves a code`);
        assert.ok(enemies[slot.code], `${slot.code} is in the enemy table`);
        usedCodes.add(slot.code);
      }
      if (wave.bossCode) {
        assert.ok(enemies[wave.bossCode], `boss ${wave.bossCode} is in the enemy table`);
      }
    }
  }
  assert.deepEqual([...usedCodes].sort(), Object.keys(enemies).sort(),
    'the enemy table carries exactly the codes the waves field');

  for (const [code, enemy] of Object.entries(enemies)) {
    assert.equal(enemy.code, code, `${code} is keyed by its own code`);
    assert.ok(enemy.name, `${code} has a Korean name`);
  }

  const linked = Object.keys(enemies).filter((c) => characters[c]);
  assert.ok(linked.length > 0, 'some enemies link to a character page');

  const withKit = Object.entries(enemies).filter(([code, enemy]) => {
    const group = characters[code]?.skillSetGroup ?? enemy.skillSetGroup;
    return group != null && skillSets[String(group)];
  });
  assert.ok(withKit.length > Object.keys(enemies).length * 0.5,
    `most enemies carry a readable kit: ${withKit.length} of ${Object.keys(enemies).length}`);
  for (const [code, enemy] of withKit) {
    const group = characters[code]?.skillSetGroup ?? enemy.skillSetGroup;
    const grades = Object.values(skillSets[String(group)]);
    assert.ok(grades.length > 0, `${code} skill set ${group} has at least one grade`);
    for (const list of grades) {
      for (const id of list) {
        assert.ok(charData.skills[String(id)], `${code} skill ${id} is published`);
      }
    }
  }

  const iconable = Object.values(enemies).filter(
    (e) => icons.char.includes(e.iconPath) || icons.char.includes(`Icon_${e.code}`));
  assert.ok(iconable.length > 0, 'some enemies resolve portrait art');

  const cutins = new Set();
  for (const stage of stages) {
    for (const wave of stage.waves) {
      for (const event of wave.events ?? []) {
        assert.ok(event.kind, 'every scripted beat names its kind');
        for (const line of event.lines ?? []) {
          assert.ok(line.text?.ko, 'every battle-dialogue line carries Korean text');
          if (line.icon) cutins.add(line.icon);
        }
      }
    }
  }
  for (const name of cutins) {
    assert.ok(icons.cutin.includes(name), `battle dialogue cut-in ${name} is published`);
  }

  for (const stage of stages) {
    assert.ok(allGroups[stage.group], `stage ${stage.id} resolves group ${stage.group}`);
    assert.equal(allGroups[stage.group].mode, stage.mode,
      `stage ${stage.id} group agrees on the mode`);
  }
  const usedGroups = new Set(stages.map((s) => s.group));
  assert.deepEqual([...usedGroups].sort(), Object.keys(allGroups).sort(),
    'every group is used and every used group is declared');

  const byMode = (m) => Object.values(allGroups).filter((g) => g.mode === m);
  assert.equal(byMode('story').length, 15, 'story splits into 15 chapters');
  for (const g of byMode('story')) {
    assert.ok(g.chapter != null, `story group ${g.key} carries a chapter number`);
    const kinds = new Set(stages.filter((s) => s.group === g.key)
      .map((s) => (s.nameTemplate?.en ?? '').split(' ')[0]));
    assert.ok(kinds.has('NORMAL') && kinds.has('HARD'),
      `story chapter ${g.chapter} holds both difficulties`);
  }
  for (const m of ['event', 'nemesis']) {
    const gs = byMode(m);
    assert.ok(gs.length > 1, `${m} splits into more than one group`);
    for (const g of gs) {
      assert.ok(g.name?.ko, `${m} group ${g.key} is named`);
      assert.ok(g.from && g.to, `${m} group ${g.key} carries its run window`);
    }
  }
  assert.equal(byMode('nemesis').length, 4, 'four Nemesis seasons carry waves');
  const live = byMode('nemesis').filter((g) => groupIsLive(g, new Date(`${g.from}T00:00:00Z`)));
  assert.equal(live.length, byMode('nemesis').length, 'each season is live on its own opening day');

  const summaries = modeSummaries(data);
  assert.deepEqual(summaries.map((m) => m.key), modes.map((m) => m.key),
    'the hub lists every mode that has stages');
  assert.equal(summaries.reduce((n, m) => n + m.stages, 0), stages.length,
    'the hub counts every stage exactly once');
  for (const m of summaries) {
    assert.ok(m.groups > 0, `${m.key} has at least one list`);
    if (m.image) {
      assert.ok(GROUP_ICON_GROUPS.some((g) => has(g, m.image)),
        `${m.key} group art ${m.image} is published`);
    }
    if (m.tile) assert.ok(has('tile', m.tile), `${m.key} tile ${m.tile} is published`);
    if (m.live) assert.equal(m.live.mode, m.key, `${m.key} live group belongs to it`);
  }
  assert.ok(!modes.some((m) => m.key === 'narrative'), 'narrative is gone');

  const tiled = summaries.filter((m) => m.tile);
  assert.ok(tiled.length >= 5, `most modes carry a tile: ${tiled.length}`);
  const bannered = Object.values(allGroups).filter((g) => g.banner);
  assert.ok(bannered.length > 0, 'some group carries a page banner');
  const events = Object.values(allGroups).filter((g) => g.mode === 'event');
  assert.ok(events.every((g) => g.banner), 'every event carries its own logo');
  for (const m of summaries) {
    if (m.tile || !m.banner) continue;
    assert.ok(has('banner', m.banner), `${m.key} stand-in banner ${m.banner} is published`);
  }
  for (const g of bannered) {
    assert.ok(has('banner', g.banner), `group ${g.key} banner ${g.banner} is published`);
  }
  assert.ok(modes.some((m) => m.key === 'daily') && modes.some((m) => m.key === 'flurry'),
    'the daily dungeons split into supply run and flurry zone');

  for (const key of Object.keys(allGroups)) {
    const g = groupByKey(data, key);
    assert.ok(g, `group ${key} is reachable by key`);
    assert.ok(g.stages.length > 0, `group ${key} has stages`);
  }

  let previewed = 0;
  for (const stage of stages) {
    const ds = stageDrops(stage);
    const refs = new Set(ds.map((d) => d.ref));
    assert.equal(refs.size, ds.length, `stage ${stage.id} drop preview is deduped`);
    const all = Object.values(stage.rewards ?? {}).flat();
    assert.ok(ds.length <= all.length, `stage ${stage.id} preview is a subset`);
    for (const d of ds) assert.ok(drops[d.ref], `preview drop ${d.ref} resolves`);
    for (const code of enemyCodes(stage)) {
      const e = enemies[code];
      assert.ok(has('char', e.iconPath) || has('char', `Icon_${code}`) || code === 'NP8201',
        `enemy preview art for ${code}`);
    }
    previewed += 1;
  }
  assert.equal(previewed, stages.length, 'every stage renders both previews');

  let payouts = 0;
  const channels = new Set();
  const dropTypes = new Set();
  for (const stage of stages) {
    if (!stage.rewards) continue;
    for (const [channel, entries] of Object.entries(stage.rewards)) {
      assert.ok(CHANNEL_ORDER.includes(channel), `stage ${stage.id} channel ${channel}`);
      channels.add(channel);
      for (const drop of entries) {
        payouts += 1;
        dropTypes.add(drop.drop);
        assert.ok(Number.isInteger(drop.id) && drop.id > 0,
          `stage ${stage.id} drop id is a whole number: ${drop.id}`);
        assert.ok(!/^\d+$/.test(drop.type), `stage ${stage.id} drop type is named: ${drop.type}`);
        assert.ok(drop.amount.length > 0 && drop.amount.every(Number.isInteger),
          `stage ${stage.id} drop carries whole amounts`);
        assert.ok(dropAmount(drop), `stage ${stage.id} drop renders an amount`);
        assert.ok(drop.chance == null || (drop.chance > 0 && drop.chance <= 1),
          `stage ${stage.id} drop chance is a fraction: ${drop.chance}`);
        assert.equal(drop.chance == null, dropChance(drop) === null,
          `stage ${stage.id} a certain drop shows no chance`);
        assert.ok(drop.ref, `stage ${stage.id} drop ${drop.type} ${drop.id} names a lookup`);
        const entry = drops[drop.ref];
        assert.ok(entry, `${drop.ref} is in the drop table`);
        assert.ok(entry.name, `${drop.ref} has a Korean name`);
        assert.equal(dropName(data, drop, 'ko'), entry.name);
        assert.equal(dropName(data, drop, 'en'), entry.nameEn ?? entry.name);
        assert.ok(DROP_ICON_GROUPS.some((g) => has(g, entry.icon)),
          `${drop.ref} resolves published art: ${entry.icon}`);
      }
    }
  }
  assert.ok(payouts > 0, 'drops render');
  assert.deepEqual([...channels].sort(), ['first', 'repeat', 'star']);

  const usedRefs = new Set(stages.flatMap(
    (s) => Object.values(s.rewards ?? {}).flat().map((d) => d.ref)));
  const entryRefs = new Set(stages.flatMap((s) => (s.entry ? [s.entry.ref] : [])));
  assert.deepEqual([...new Set([...usedRefs, ...entryRefs])].sort(), Object.keys(drops).sort(),
    'the drop table carries exactly the refs the stages name');

  const entryCurrency = new Map();
  for (const stage of stages) {
    if (!stage.entry) continue;
    const entry = drops[stage.entry.ref];
    assert.ok(entry?.name, `${stage.id} names its entry currency`);
    assert.ok(DROP_ICON_GROUPS.some((g) => has(g, entry.icon)),
      `${stage.entry.ref} resolves published art: ${entry.icon}`);
    assert.ok(stage.entry.amount > 0, `${stage.id} costs something to enter`);
    entryCurrency.set(stage.mode,
      (entryCurrency.get(stage.mode) ?? new Set()).add(stage.entry.ref));
  }
  assert.ok(entryRefs.size > 1, 'more than one entry currency exists');
  assert.notDeepEqual([...(entryCurrency.get('story') ?? [])],
    [...(entryCurrency.get('daily') ?? [])],
    'story and the daily dungeons do not spend the same currency');

  for (const ref of Object.keys(drops)) {
    const [kind, id] = ref.split(':');
    assert.ok(kind && /^\d+$/.test(id), `drop ref ${ref} is <type>:<id>`);
  }

  const firstStory = stages.find((s) => s.mode === 'story');
  const firstZone = zoneOf(data, firstStory);
  assert.ok(firstZone, 'a story stage resolves its zone');
  assert.equal(stageName(data, firstStory, 'en'),
    `NORMAL ${firstZone.order} - ${firstStory.order}`);
  for (const stage of stages) {
    const name = stageName(data, stage, 'en');
    assert.ok(name, `stage ${stage.id} renders a name`);
    assert.ok(!/\{\d\}/.test(name), `stage ${stage.id} fills every template slot: ${name}`);
  }

  assert.deepEqual(
    groupSlots([{ code: 'A', level: 1 }, { code: 'A', level: 1 }, { code: 'B', level: 2 },
      { code: 'A', level: 1 }]),
    [{ code: 'A', id: undefined, level: 1, count: 2 },
      { code: 'B', id: undefined, level: 2, count: 1 },
      { code: 'A', id: undefined, level: 1, count: 1 }]);

  for (const stage of stages) {
    const total = stage.waves.reduce(
      (n, w) => n + groupSlots(w.enemies).reduce((m, g) => m + g.count, 0), 0);
    const raw = stage.waves.reduce((n, w) => n + w.enemies.length, 0);
    assert.equal(total, raw, `stage ${stage.id} loses no slot to grouping`);
    const range = levelRange(stage);
    if (range) assert.ok(range[0] <= range[1], `stage ${stage.id} level range is ordered`);
    assert.ok(enemyCodes(stage).length > 0, `stage ${stage.id} fields a named enemy`);
    assert.equal(stageById(data, stage.id), stage, `stage ${stage.id} is findable by id`);
  }

  let grouped = 0;
  let zoneArt = 0;
  for (const key of modeKeys) {
    const groups = stageGroups(data, key);
    grouped += groups.reduce((n, g) => n + g.stages.length, 0);
    for (const { group } of groups) {
      assert.equal(group.mode, key, `group ${group.key} belongs to ${key}`);
      const heading = groupLabel(data, group, 'en');
      assert.ok(heading, `a ${key} group renders a heading`);
      assert.ok(!/\{\d\}/.test(heading), `${key} heading fills its template: ${heading}`);
      if (group.image) {
        assert.ok(GROUP_ICON_GROUPS.some((g) => has(g, group.image)),
          `group ${group.key} art ${group.image} is published`);
        zoneArt += 1;
      }
      assert.equal(!!group.from, !!group.to, `group ${group.key} window is complete`);
      if (group.from) {
        assert.ok(group.from <= group.to, `group ${group.key} window is ordered`);
        assert.ok(groupWindow(group), `group ${group.key} renders its window`);
      }
    }
    assert.ok(modeLabel(data, key, 'en'), `${key} has an English label`);
  }
  assert.equal(grouped, stages.length, 'every stage lands in exactly one zone group');

  const name = (table, value) => typeLabel(types[table][String(value)] ?? null, 'ko');
  let missions = 0;
  let checks = 0;
  const missionTypes = new Map();
  for (const stage of stages) {
    for (const mission of subMissionsOf(data, stage)) {
      missions += 1;
      missionTypes.set(mission.type, !!mission.checkTable);
      const text = subMissionText(mission, 'ko', name);
      assert.ok(text, `sub-mission ${mission.id} renders`);
      assert.ok(!/\[\d\]/.test(text), `sub-mission ${mission.id} fills its values: ${text}`);

      const check = missionCheck(mission);
      if (!check) continue;
      checks += 1;
      const row = types[check.table]?.[String(check.value)];
      assert.ok(row, `sub-mission ${mission.id} resolves ${check.table} ${check.value}`);
      assert.ok(text.startsWith(name(check.table, check.value)),
        `sub-mission ${mission.id} names its ${check.table}: ${text}`);
      assert.ok(anyOf('ui', typeIcons(row)),
        `sub-mission ${mission.id} resolves ${check.table} art`);
    }
  }
  assert.ok(missions > 0 && checks > 0, 'sub-missions and party checks render');

  for (const [type, checked] of missionTypes) {
    if (checked) continue;
    const icon = MISSION_ICON[type];
    if (icon) assert.ok(has('ui', icon), `sub-mission type ${type} art ${icon} is published`);
    else assert.equal(type, 10, `sub-mission type ${type} either has a mark or is the known gap`);
  }

  for (const zone of Object.values(zones)) {
    if (zone.difficulty) {
      assert.ok(DIFFICULTY_LABEL[zone.difficulty], `difficulty ${zone.difficulty} is labelled`);
    }
  }
  for (const stage of stages) {
    for (const wave of stage.waves) {
      if (wave.encounter) {
        assert.ok(ENCOUNTER_LABEL[wave.encounter], `encounter ${wave.encounter} is labelled`);
      }
      for (const event of wave.events ?? []) {
        if (event.trigger) {
          assert.ok(TRIGGER_LABEL[event.trigger], `trigger ${event.trigger} is labelled`);
        }
        assert.ok(EVENT_LABEL[event.kind] || /^\d+$/.test(event.kind),
          `event kind ${event.kind} is labelled or a raw constant`);
      }
    }
  }

  const waves = stages.reduce((n, s) => n + s.waves.length, 0);
});
