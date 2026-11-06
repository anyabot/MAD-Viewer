import { it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUFF_CATEGORY, KIND_ICON, KIND_ORDER, OP_LABEL, SKILL_CATEGORY_LABEL, STAT_LABEL,
  INFUSION_PATHS, RAW_STAT_PCT, TYPE_FIELD, activeInfusion, birthdayText, colorRuns, computeStats,
  datePlacesOf, detailSummary, infusionNodes, infusionReach,
  equipmentGrants, equipmentSlotsOf, filterRows, gateSummary, giftsOf, isPlayable,
  labelOf, opAmounts, rosterNote, roundStat, skillGrades, skillsAtGrade,
  skinIconNames, skinsByCharacter, statAmount, statGrades, statText, typeIcons,
  typeLabel, typeOf, typeTint,
} from '../lib/characters.ts';
import { dropPlaceholderTiers } from '../lib/data.ts';

it('characters.json, icons.json and skin_list.json agree', () => {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const charData = dropPlaceholderTiers(read('public/data/characters.json'));
  const { characters, types, items, places, equipment, skills } = charData;
  const icons = read('public/data/icons.json').groups;
  const skins = read('public/data/skin_list.json').skins;

  const has = (group, name) => !!name && icons[group].includes(name);
  const anyOf = (group, names) => names.some((n) => has(group, n));

  for (const [table, rows] of Object.entries(types)) {
    assert.ok(Object.keys(rows).length > 0, `${table} has rows`);
    for (const [value, row] of Object.entries(rows)) {
      assert.ok(row.name, `${table}[${value}] has a display name`);
      assert.ok(row.en, `${table}[${value}] (${row.name}) has an English label`);
      assert.equal(typeLabel(row), row.en);
      assert.ok(anyOf('ui', typeIcons(row)),
        `${table}[${value}] (${row.name}) resolves an icon: ${typeIcons(row).join(', ')}`);
    }
  }

  for (const [value, row] of Object.entries(types.attribute)) {
    assert.match(typeTint(row) ?? '', /^#[0-9A-F]{6}$/i, `attribute[${value}] colour`);
  }
  for (const table of ['role', 'position', 'division', 'faction']) {
    for (const row of Object.values(types[table])) assert.equal(typeTint(row), null);
  }
  assert.deepEqual(
    Object.values(types.attribute).map((r) => r.en),
    ['All Attributes', 'Passion', 'Drive', 'Will', 'Reason']);

  assert.ok(!filterRows(types, 'attribute').some(([value]) => value === '0'));
  assert.equal(filterRows(types, 'attribute').length,
    Object.keys(types.attribute).length - 1);
  assert.equal(filterRows(types, 'faction').length, Object.keys(types.faction).length);
  assert.ok(!Object.values(characters).some((c) => c.attributeType === 0),
    'no character has attribute 0');
  assert.equal(types.role['1'].icon, 'Icon_Role_Tanker');
  assert.ok(!has('ui', 'Icon_Role_Tanker'));
  assert.ok(has('ui', 'Icon_Item_Role_Tanker'));

  assert.ok(has('ui', 'Slot_Icon_Star'));
  for (const kind of KIND_ORDER) assert.ok(has('ui', KIND_ICON[kind]), KIND_ICON[kind]);

  const playable = Object.values(characters).filter((c) => isPlayable(c) && !c.unreleased);
  assert.ok(playable.length >= 43, `playable characters: ${playable.length}`);

  for (const entry of playable) {
    assert.ok(entry.name, `${entry.code} has a name`);
    assert.ok(anyOf('char', [entry.iconPath, `Icon_${entry.code}`]),
      `${entry.code} has a portrait`);
    assert.ok(anyOf('cutin', [`Cut_${entry.code}`, `CUT_${entry.code}`]),
      `${entry.code} has cut-in art`);
    assert.ok(entry.defaultStar >= 1 && entry.defaultStar <= 3,
      `${entry.code} rarity ${entry.defaultStar}`);
    for (const table of Object.keys(TYPE_FIELD)) {
      assert.ok(typeOf(entry, types, table), `${entry.code} resolves ${table}`);
    }
    assert.match(birthdayText(entry) ?? '', /^[A-Z][a-z]+ \d+$/, `${entry.code} birthday`);
    assert.match(birthdayText(entry, 'ko') ?? '', /^\d+월 \d+일$/, `${entry.code} birthday ko`);
  }

  const unreleased = Object.values(characters).filter((c) => c.unreleased);
  assert.ok(unreleased.length > 0, 'unreleased characters are emitted');
  for (const entry of unreleased) {
    assert.equal(entry.defaultStar, undefined, `${entry.code} has no rarity`);
    assert.equal(entry.characterType, undefined, `${entry.code} has no base row`);
    assert.equal(entry.artist, null);
    for (const table of Object.keys(TYPE_FIELD)) {
      assert.equal(typeOf(entry, types, table), null, `${entry.code} has no ${table}`);
    }
  }
  assert.deepEqual(unreleased.filter((c) => has('char', c.iconPath)).map((c) => c.code),
    ['CH0003', 'CH0004', 'CH0008', 'CH0059']);
  for (const code of ['CH0033']) {
    assert.ok(skins.some((s) => s.character === code), `${code} has a shipped skin`);
  }
  assert.ok(!characters.CH0043.unreleased, 'CH0043 is released');
  assert.equal(characters.CH0043.defaultStar, 3, 'CH0043 is a 3-star');
  assert.ok(skins.filter((s) => s.character === 'CH0043').length >= 3,
    'CH0043 ships her skins');

  const npcs = Object.values(characters).filter((c) => !isPlayable(c) && !c.unreleased);
  assert.ok(npcs.length > 0);
  for (const npc of npcs) {
    assert.equal(npc.defaultStar, undefined, `${npc.code} has no rarity`);
    assert.equal(npc.birthday, undefined, `${npc.code} has no birthday`);
    assert.equal(birthdayText(npc), null);
  }
  assert.ok(npcs.some((c) => typeOf(c, types, 'faction') === null),
    'an unresolvable faction is tolerated');

  const byCharacter = skinsByCharacter(skins);
  assert.ok(byCharacter.size >= 63, `characters with skins: ${byCharacter.size}`);

  const unresolved = [];
  for (const [code, list] of byCharacter) {
    const entry = characters[code] ?? null;
    const order = list.map((s) => KIND_ORDER.indexOf(s.kind));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${code} skins ordered`);
    for (const skin of list) {
      const names = skinIconNames(skin, entry);
      if (!anyOf('skin', names.skin) && !anyOf('char', names.char)) unresolved.push(skin.key);
    }
  }
  assert.deepEqual(unresolved.sort(),
    ['pl_cutin_0001', 'pl_cutin_0002', 'pl_title_0001', 'st_np6028', 'st_sc0003_01', 'st_sc0213',
      'st_sc0214', 'st_sc3012']);

  const noPortrait = Object.values(characters)
    .filter((c) => !c.unreleased && !c.storyOnly && !has('char', c.iconPath))
    .map((c) => c.code);
  assert.deepEqual(noPortrait, ['NP0605', 'NP8201'],
    `released characters whose icon_path is in no atlas: ${noPortrait.join(', ')}`);
  assert.ok(has('char', characters.NP0199.iconPath));
  assert.equal(characters.NP0199.iconPath, 'Icon_Boss_Manageress');

  const storyOnly = Object.values(characters).filter((c) => c.storyOnly);
  assert.equal(storyOnly.length, 21, `story-only rigs: ${storyOnly.length}`);
  const unnamedRigs = [...new Set(skins.map((s) => s.character))]
    .filter((code) => /^(CH|NP|SC)\d{4}$/.test(code) && !characters[code]?.name);
  assert.deepEqual(unnamedRigs, [], `coded rigs with no name: ${unnamedRigs.join(', ')}`);
  for (const c of storyOnly) {
    assert.ok(c.name && c.actorId, `${c.code} has a script name and actor id`);
    assert.equal(c.characterType, undefined, `${c.code} has no master-data row`);
    assert.equal(rosterNote(c).label, 'STORY');
    assert.ok(byCharacter.has(c.code), `${c.code} is a rig in the skin list`);
  }
  assert.equal(characters.SC0002.name, '단델리온');
  assert.equal(characters.SC0002.actorId, 'dandelion');
  assert.equal(rosterNote(characters.CH0001), null);
  assert.equal(rosterNote(characters.NP0103).label, 'NPC');
  assert.equal(rosterNote(characters.CH0003).label, 'UNRELEASED');
  assert.equal(rosterNote(null), null);

  const withProfile = playable.filter((c) => c.hobby || c.specialty || c.likes);
  assert.ok(withProfile.length >= 40, `profiles: ${withProfile.length}`);
  for (const entry of Object.values(characters)) {
    for (const field of ['hobby', 'specialty', 'likes', 'comment', 'artist', 'cv']) {
      const value = entry[field];
      assert.ok(value == null || (!value.includes('준비중') && !value.startsWith('#####')),
        `${entry.code}.${field} is not a placeholder: ${value}`);
    }
  }

  const LATIN = /^[\x20-\x7E -ɏ‘’]+$/;
  for (const entry of playable) {
    assert.ok(entry.nameEn, `${entry.code} has an English name`);
    assert.ok(LATIN.test(entry.nameEn),
      `${entry.code} English name is Latin: ${entry.nameEn}`);
  }
  for (const npc of npcs) {
    assert.ok(npc.nameEn == null || LATIN.test(npc.nameEn),
      `${npc.code} English name is Latin or absent: ${npc.nameEn}`);
  }
  assert.equal(characters.CH0068.nameEn, 'Claire (Swimsuit)');
  assert.equal(characters.CH0035.nameEn, 'Yuria');
  for (const [code, en] of [['CH0030', 'Seven'], ['CH0031', 'Hinata'],
    ['CH0032', 'Suji'], ['CH0034', 'Theta']]) {
    assert.equal(characters[code].nameEn, en, `${code} English name`);
  }
  const byEn = playable.map((c) => c.nameEn);
  assert.equal(new Set(byEn).size, byEn.length, 'English names are unique');

  for (const entry of playable) {
    const gifts = giftsOf(entry, items);
    assert.equal(gifts.length, 3, `${entry.code} has three liked gifts`);
    for (const gift of gifts) {
      assert.ok(gift.name, `gift ${gift.id} has a name`);
      assert.ok(has('item', gift.icon), `gift ${gift.id} icon ${gift.icon}`);
    }
    assert.equal(entry.giftItems.some((id) => !items[String(id)]), false);
  }

  for (const entry of playable) {
    const regions = datePlacesOf(entry, places);
    assert.ok(regions.length > 0, `${entry.code} has a date region`);
    if (!entry.datePlaces) {
      assert.equal(entry.code, 'CH0058', `${entry.code} is the known pending date script`);
      continue;
    }
    assert.equal(entry.datePlaces?.length, 5, `${entry.code} scripted venues`);
    for (const { division, places: venues } of regions) {
      assert.ok(types.division[String(division)], `division ${division} resolves`);
      assert.deepEqual(venues.map((v) => v.id), entry.datePlaces,
        `${entry.code} shows the venues its script visits, in script order`);
      for (const venue of venues) {
        assert.ok((places[String(division)] ?? []).includes(venue),
          `venue ${venue.id} is in division ${division}`);
        assert.ok(venue.name, `venue ${venue.id} has a name`);
        assert.ok(has('place', venue.thumbnail), `venue ${venue.id} art ${venue.thumbnail}`);
      }
    }
  }
  const scripted = new Set(playable.flatMap((e) => e.datePlaces ?? []));
  assert.equal([...(places['1'] ?? [])].filter((p) => !scripted.has(p.id)).length, 5);

  for (const entry of playable) {
    const grades = skillGrades(entry, charData);
    assert.deepEqual(grades, [1, 2, 3, 4, 5].filter((g) => g >= entry.defaultStar),
      `${entry.code} (starts ${entry.defaultStar}★) skill grades`);
    const passiveAt = {};
    for (const grade of grades) {
      const list = skillsAtGrade(entry, charData, grade);
      assert.ok(list.length >= 4, `${entry.code} ${grade}★ has skills`);
      for (const skill of list) {
        assert.ok(skill.name, `${entry.code} skill ${skill.id} has a name`);
        assert.ok(SKILL_CATEGORY_LABEL[skill.categorize], `skill ${skill.id} category`);
        assert.ok(has('skill', skill.icon), `skill ${skill.id} icon ${skill.icon}`);
        assert.equal(skill.desc.length, skill.maxLevel,
          `skill ${skill.id} has one description per level`);
        for (const text of skill.desc) {
          assert.ok(text || skill.categorize === 5, `skill ${skill.id} description is not empty`);
          assert.ok(!/\[(effect|value_per|value|time|rate),?/.test(text),
            `skill ${skill.id} fully expanded: ${text}`);
        }
        if (skill.categorize === 4) passiveAt[grade] = skill.openStar;
      }
    }
    assert.deepEqual(passiveAt, { 3: 3, 4: 4, 5: 5 },
      `${entry.code} passive tiers unlock at 3/4/5★`);
  }
  for (const entry of playable) {
    const patterns = entry.battlePatterns;
    assert.ok(patterns, `${entry.code} has a rotation`);
    const own = new Set(Object.values(
      charData.skillSets[String(entry.skillSetGroup)]).flat());
    for (const key of ['start', 'repeat']) {
      for (const rot of patterns[key] ?? []) {
        assert.ok(rot.steps.length, `${entry.code} ${key} rotation is not empty`);
        for (const id of rot.steps) {
          assert.ok(own.has(id), `${entry.code} ${key} step ${id} is one of its skills`);
        }
      }
    }
    assert.ok((patterns.repeat ?? []).length, `${entry.code} has a looping rotation`);
    for (const key of ['start', 'repeat']) {
      const order = (patterns[key] ?? []).map((r) => r.order);
      assert.deepEqual(order, [...order].sort((a, b) => a - b),
        `${entry.code} ${key} rotations are in evaluation order`);
    }
  }
  assert.ok((characters.CH0068.battlePatterns.repeat ?? []).length > 1);

  assert.equal(Object.keys(equipment).length, 12);
  for (const [type, slot] of Object.entries(equipment)) {
    assert.ok(slot.name, `equipment ${type} has a name`);
    assert.ok(has('equip', slot.icon), `equipment ${type} icon ${slot.icon}`);
    for (const tier of slot.tiers ?? []) {
      assert.ok(has('equip', tier.icon),
        `equipment ${type} tier ${tier.tier} icon ${tier.icon}`);
    }
  }
  for (const entry of playable) {
    const slots = equipmentSlotsOf(entry, equipment);
    assert.equal(slots.length, 3, `${entry.code} has three equipment slots`);
    assert.deepEqual(slots.map((s) => Math.ceil(s.type / 4)), [1, 2, 3],
      `${entry.code} slots come one from each group of four: ${slots.map((s) => s.type)}`);
  }

  let buffed = 0;
  for (const skill of Object.values(skills)) {
    assert.equal(skill.buffs.length, skill.desc.length,
      'buff lists align with descriptions');
    for (const level of skill.buffs) {
      for (const buff of level) {
        buffed += 1;
        assert.ok(buff.name, 'buff has a name');
        assert.ok(has('buff', buff.icon), `buff icon ${buff.icon}`);
        assert.ok(BUFF_CATEGORY[buff.categorize] || buff.categorize === 0,
          `buff category ${buff.categorize}`);
        for (const text of [buff.name, buff.desc]) {
          assert.ok(!/\[(effect|value_per|value|time|rate),?/.test(text ?? ''),
            `buff text fully expanded: ${text}`);
        }
      }
    }
  }
  assert.ok(buffed > 0, 'skills apply buffs');
  const scaling = Object.values(skills).find(
    (s) => s.levelable && s.buffs[0].length
      && JSON.stringify(s.buffs[0]) !== JSON.stringify(s.buffs[s.buffs.length - 1]));
  assert.ok(scaling, 'a buff scales with skill level');

  const ch0068 = skillsAtGrade(characters.CH0068, charData, 5);
  const percents = (skill) => skill.desc.map(
    (t) => Number(/>([\d.]+)%</.exec(t)?.[1] ?? NaN));
  const wave = ch0068.find((s) => s.name === '파도 가르기');
  assert.deepEqual(percents(wave).slice(6), [148, 156, 164, 180]);
  const burst = ch0068.find((s) => s.categorize === 3);
  assert.deepEqual(percents(burst), [270, 278.1, 316.2, 324.3, 362.4]);
  const shield = ch0068.find((s) => s.buffs.some((lv) => lv.some((b) => b.seconds === 20)));
  assert.deepEqual(shield.buffs.map((lv) => lv[0].seconds),
    [5, 5, 5, 10, 10, 10, 15, 15, 15, 20]);

  const levelled = Object.values(skills).filter((s) => s.levelable);
  assert.ok(levelled.length > 0);
  assert.ok(levelled.some((s) => s.desc[0] !== s.desc[s.desc.length - 1]),
    'skill descriptions change with level');

  assert.deepEqual(colorRuns('a<color=#0094FF>b</color>c'),
    [{ text: 'a' }, { text: 'b', color: '#0094FF' }, { text: 'c' }]);
  assert.deepEqual(colorRuns('plain'), [{ text: 'plain' }]);

  let ops = 0;
  const seenOps = new Set();
  const NO_SKILL_DATA = new Set(['5000051', '5000061']);
  for (const [id, skill] of Object.entries(skills)) {
    const b = skill.behaviour;
    if (!b && NO_SKILL_DATA.has(id)) continue;
    assert.ok(b, `skill ${id} (${skill.name}) has a behaviour graph`);
    const passive = skill.categorize === 4 || skill.skillType === 13;
    assert.equal(!!(b.stats || b.triggers), passive,
      `skill ${id} routes through the ${passive ? 'passive' : 'active'} tables`);
    const opLists = [
      ...(b.hits ?? []).map((h) => h.ops),
      ...(b.triggers ?? []).map((t) => t.ops),
    ];
    for (const list of opLists) {
      for (const op of list) {
        ops += 1;
        assert.ok(op.op, `skill ${id} op names an operation`);
        assert.ok(op.kind === 'onetime' || op.kind === 'duration', 'op kind');
        seenOps.add(op.op);
        assert.notEqual(labelOf(OP_LABEL, op.op), op.op, `op ${op.op} has a label`);
        if (op.scale) {
          assert.notEqual(labelOf(STAT_LABEL, op.scale), op.scale,
            `stat ${op.scale} has a label`);
        }
      }
    }
    for (const stat of b.stats ?? []) {
      assert.ok(stat.stat, `skill ${id} stat grant names a stat`);
      assert.match(statAmount(stat), /^[+-]?[\d.]+%$|^×[\d.]+$/);
    }
  }
  assert.ok(ops > 0 && seenOps.size > 20, 'the corpus reaches a spread of operations');

  const waveHit = wave.behaviour.hits[0];
  assert.equal(waveHit.shape, 'CIRCLE');
  assert.ok(waveHit.count > 1, 'wave is multi-hit');
  assert.deepEqual(
    waveHit.ops.map((o) => [o.op, o.scale, o.scaleOf, o.team]),
    waveHit.ops.map(() => ['ADD_DAMAGE', 'PHYSICAL_ATTACK_RATE', 'CASTER', 'ENEMY']));
  assert.deepEqual(wave.behaviour.moves, ['MOVE_TO_TARGET']);

  const follower = skillsAtGrade(characters.CH0001, charData, 3)
    .find((s) => s.categorize === 4);
  assert.ok(!follower.behaviour.hits, 'a passive opens no hitbox');
  assert.deepEqual(
    follower.behaviour.stats.map((s) => [s.stat, statAmount(s)]),
    [['PHYSICS_ATTACK', '+5%'], ['HEAL', '+10%']]);

  const allOps = Object.values(skills).flatMap((s) => [
    ...(s.behaviour?.hits ?? []).flatMap((h) => h.ops),
    ...(s.behaviour?.triggers ?? []).flatMap((t) => t.ops),
  ]);
  const markers = allOps.filter((o) => o.op === 'MARKER');
  assert.ok(markers.length > 0 && markers.every((m) => m.kind === 'duration' && !m.scale));

  let agreed = 0;
  for (const skill of Object.values(skills)) {
    const damage = (skill.behaviour?.hits ?? []).flatMap((h) => h.ops)
      .filter((o) => (o.op === 'ADD_DAMAGE' || o.op === 'ADD_HEAL') && o.value);
    if (damage.length !== 1) continue;
    for (let lv = 1; lv <= skill.desc.length; lv += 1) {
      const printed = [...skill.desc[lv - 1].matchAll(/>([\d.]+)%</g)].map((m) => m[1]);
      if (printed.length !== 1) continue;
      const [computed] = opAmounts(damage[0], lv, skill.levelPeriod);
      assert.equal(computed, `${printed[0]}%`,
        `${skill.name} Lv${lv}: op says ${computed}, description says ${printed[0]}%`);
      agreed += 1;
    }
  }
  assert.ok(agreed > 100, `enough skills cross-check description against coefficient (${agreed})`);

  for (const op of allOps) {
    if (!op.scale && !(op.op in RAW_STAT_PCT)) assert.deepEqual(opAmounts(op, 1, 3), [], `${op.op} shows no amount`);
  }

  const dispel = allOps.find((o) => o.op === 'CLEAR_DURATION_DEFINE_ID' && o.detail);
  assert.equal(dispel.detail.kind, 'state');
  assert.ok(dispel.detail.values.length > 0);
  const lucia = skillsAtGrade(characters.CH0001, charData, 3)
    .flatMap((s) => (s.behaviour.hits ?? []).flatMap((h) => h.ops))
    .find((o) => o.op === 'CLEAR_DURATION_DEFINE_ID');
  assert.deepEqual(detailSummary(lucia.detail, 'ko'),
    ['<color=#0C9F14>지속 회복</color>']);
  assert.deepEqual(detailSummary(lucia.detail, 'en'),
    ['<color=#0C9F14>Continuous Recovery</color>']);

  const internal = allOps.flatMap((o) => o.detail?.values ?? []).filter((v) => !v.name);
  assert.ok(internal.length > 0 && internal.every((v) => v.id));
  for (const op of allOps) {
    for (const shown of detailSummary(op.detail ?? { kind: 'state', values: [] })) {
      assert.doesNotMatch(shown, /^define_|^ch\d{4}_/, `detail shows no raw id: ${shown}`);
    }
  }

  const gated = allOps.filter((o) => o.gate);
  assert.ok(gated.length > 100, `operations carry a gate (${gated.length})`);
  for (const op of gated) {
    const text = gateSummary(op.gate, charData);
    assert.ok(text, `gate ${op.gate.condition} renders`);
    assert.doesNotMatch(text, /^[A-Z_]+$/, `gate ${op.gate.condition} is not a raw constant`);
  }
  const midwenShield = skillsAtGrade(characters.CH0022, charData, 5)
    .find((s) => s.categorize === 3)
    .behaviour.hits.flatMap((h) => h.ops)
    .find((o) => o.op === 'BUFF_TOTAL_DAMAGE_BARRIER');
  assert.equal(midwenShield.gate.condition, 'CONDITION_CHECK_CHARACTER_FACTION');
  assert.equal(gateSummary(midwenShield.gate, charData), 'only Midwen Corporation');

  const withKit = npcs.filter((c) => c.skillSetGroup && skillGrades(c, charData).length);
  assert.ok(withKit.length > 50, `enemies carry skill sets (${withKit.length})`);
  const enemyOps = withKit.flatMap(
    (c) => skillsAtGrade(c, charData, skillGrades(c, charData).at(-1)))
    .flatMap((s) => (s.behaviour?.hits ?? []).flatMap((h) => h.ops));
  assert.ok(enemyOps.some((o) => o.op === 'ADD_DAMAGE' && o.value),
    'an enemy skill resolves damage with a coefficient');

  const { statTypes, statCaps, loveTitles } = charData;
  assert.equal(Object.keys(statTypes).length, 20, 'every STAT_TYPE has a row');
  for (const [stat, type] of Object.entries(statTypes)) {
    assert.ok(STAT_LABEL[stat], `${stat} has an English label`);
    assert.ok([0, 1, 2].includes(type.display), `${stat} display type`);
  }
  assert.equal(loveTitles.length, statCaps.love, 'a title per affection level');
  assert.ok(loveTitles.every(Boolean), 'every affection level is titled');

  const statted = playable.filter((c) => c.baseStats);
  assert.equal(statted.length, playable.length, 'every playable character has stats');
  for (const c of statted) {
    const grades = statGrades(c, charData);
    assert.deepEqual(grades, grades.filter((g) => g >= c.defaultStar && g <= statCaps.star));
    for (const block of [...Object.values(c.baseStats), ...Object.values(c.levelStats)]) {
      for (const stat of Object.keys(block)) assert.ok(statTypes[stat], `${stat} is known`);
    }
  }

  const loveGains = statted.map((c) => {
    const totals = {};
    for (const rank of c.loveStats.slice(0, statCaps.love)) {
      for (const [stat, value] of Object.entries(rank)) {
        totals[stat] = (totals[stat] ?? 0) + value;
        assert.equal(value, 1, `${c.code} affection gains 1 at a time`);
      }
    }
    return totals;
  });
  for (const totals of loveGains) {
    assert.deepEqual(Object.values(totals), [statCaps.love],
      'one stat, gaining the affection cap in total');
  }
  assert.ok(loveGains.some((t) => t.PHYSICS_ATTACK) && loveGains.some((t) => t.HEAL),
    'affection grows attack for some characters and healing for others');

  const sample = characters.CH0068;
  const top = statGrades(sample, charData).at(-1);
  const at1 = computeStats(sample, charData, { level: 1, star: top, love: 0, equipment: [] });
  for (const row of at1) {
    assert.equal(row.base, roundStat(row.display, sample.baseStats[top][row.stat] ?? 0));
    assert.equal(row.total, row.base, 'nothing but the base at level 1 with no gear');
  }
  const atMax = computeStats(sample, charData,
    { level: statCaps.level, star: top, love: 0, equipment: [] });
  for (const row of atMax) {
    const grown = (sample.baseStats[top][row.stat] ?? 0)
      + (sample.levelStats[top][row.stat] ?? 0) * (statCaps.level - 1);
    assert.equal(row.base, roundStat(row.display, grown), `${row.stat} at max level`);
  }
  assert.ok(atMax.find((r) => r.stat === 'PHYSICS_ATTACK').base
    > at1.find((r) => r.stat === 'PHYSICS_ATTACK').base * 5);

  assert.deepEqual(
    computeStats(sample, charData, { level: 9999, star: 9, love: 99, equipment: [] }),
    computeStats(sample, charData,
      { level: statCaps.level, star: statCaps.star, love: statCaps.love, equipment: [] }),
    'level, star and affection are all clamped to the cap');

  const gearSlots = equipmentSlotsOf(sample, equipment);
  assert.equal(gearSlots.length, 3);
  for (const slot of gearSlots) {
    assert.equal(slot.tiers.length, 5, `${slot.type} has five tiers`);
    for (const tier of slot.tiers) {
      assert.ok(tier.maxLevel > 0, `tier ${tier.tier} has a level cap`);
      for (const option of tier.options) {
        assert.ok(statTypes[option.stat], `${option.stat} is known`);
        assert.ok(['ADDTION', 'MULTIPLICATION'].includes(option.calc), option.calc);
      }
    }
  }
  const loadout = gearSlots.map((s) => ({
    type: s.type, tier: 5, level: s.tiers.at(-1).maxLevel,
  }));
  const geared = computeStats(sample, charData,
    { level: statCaps.level, star: top, love: statCaps.love, equipment: loadout });
  const grants = loadout.flatMap((s) => equipmentGrants(charData, s));
  for (const row of geared) {
    const flat = grants.filter((g) => g.stat === row.stat && g.calc === 'ADDTION')
      .reduce((a, g) => a + g.value, 0);
    const rate = grants.filter((g) => g.stat === row.stat && g.calc === 'MULTIPLICATION')
      .reduce((a, g) => a + g.value, 0);
    assert.equal(row.equipment, roundStat(row.display, flat + row.base * rate),
      `${row.stat} equipment term`);
    assert.equal(row.total, row.base + row.equipment + row.love, `${row.stat} total`);
  }
  const gearedAttack = geared.find((r) => r.stat === 'PHYSICS_ATTACK');
  assert.ok(gearedAttack.equipment > 0 && gearedAttack.love === statCaps.love,
    'a full loadout and max affection both land on attack');
  assert.equal(statText(1, 438), '438');
  assert.equal(statText(2, 1.5), '150%');

  const readings = [
    { code: 'CH0015', stat: 'PHYSICS_DEFENSE', star: 3, tiers: [3, 2, 2], love: 1, want: 168 },
    { code: 'CH0023', stat: 'MAX_LIFE', star: 1, tiers: [2, 2, 2], love: 1, want: 15780 },
    { code: 'CH0046', stat: 'MAX_LIFE', star: 3, tiers: [2, 3, 2], love: 1, want: 15305 },
  ];
  for (const { code, stat, star, tiers, love, want } of readings) {
    const c = characters[code];
    const slots = c.equipmentSlots.map((type, i) => {
      const tier = equipment[String(type)].tiers.find((t) => t.tier === tiers[i]);
      return { type, tier: tiers[i], level: tier.maxLevel };
    });
    const row = computeStats(c, charData, { level: 33, star, love, equipment: slots })
      .find((r) => r.stat === stat);
    assert.equal(row.total, want, `${code} ${stat} at ${star}★ Lv33 reads ${want} in game`);
  }

  const infused = Object.values(characters).filter((e) => e.infusion);
  assert.ok(infused.length >= 48, `${infused.length} playable characters carry a tree`);
  assert.ok(charData.infusion?.material?.ref, 'the surface path names its material');
  for (const entry of infused) {
    for (const path of INFUSION_PATHS) {
      const nodes = infusionNodes(entry, path);
      assert.deepEqual(nodes.map((n) => n.step), nodes.map((_, i) => i + 1),
        `${entry.code} ${path} steps run 1..n`);
      assert.ok(nodes.every((n) => n.cost > 0), `${entry.code} ${path} nodes cost something`);
    }
    assert.ok(entry.infusion.piece?.ref, `${entry.code} deep path names its memory`);
  }
  const infusedLucia = characters.CH0001;
  assert.equal(infusionReach(infusedLucia, 'deep', 4), 0, 'the deep path waits for 5 stars');
  assert.equal(infusionReach(infusedLucia, 'deep', 5), infusionNodes(infusedLucia, 'deep').length);
  assert.equal(activeInfusion(infusedLucia, { deep: 3 }, 4).length, 0, 'a locked node stays off');
  const plainStats = computeStats(infusedLucia, charData, { level: 60, star: 5, love: 1, equipment: [] });
  const deep1 = computeStats(infusedLucia, charData,
    { level: 60, star: 5, love: 1, equipment: [], infusion: { deep: 1 } });
  const firstDeep = infusionNodes(infusedLucia, 'deep')[0];
  for (const bonus of firstDeep.bonuses.filter((b) => !b.special && b.calc === 'MULTIPLICATION')) {
    const before = plainStats.find((r) => r.stat === bonus.stat);
    const after = deep1.find((r) => r.stat === bonus.stat);
    assert.equal(after.infusion,
      roundStat(charData.statTypes[bonus.stat].display, before.base * bonus.value),
      `${bonus.stat} infusion is a rounded fraction of the base block`);
    assert.equal(after.total, before.total + after.infusion);
  }
  assert.ok(deep1.every((r) => !/DAMAGE_RATE$/.test(r.stat) || !r.infusion),
    'a skill damage rate is not applied as a unit stat');
});
