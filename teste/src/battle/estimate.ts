import type {Pokemon} from '@pkmn/sim';
import {dex} from '../lib/dex';

const ABILITY_IMMUNE: Record<string, string> = {
  levitate: 'Ground',
  flashfire: 'Fire',
  waterabsorb: 'Water',
  stormdrain: 'Water',
  dryskin: 'Water',
  voltabsorb: 'Electric',
  lightningrod: 'Electric',
  motordrive: 'Electric',
  sapsipper: 'Grass',
};

/** Multiplicador de tipo (com imunidades de habilidade comuns). */
export function typeMultiplier(moveType: string, defTypes: string[], defAbility = ''): number {
  if (ABILITY_IMMUNE[defAbility] === moveType) return 0;
  if (!dex.getImmunity(moveType, defTypes)) return 0;
  const mult = 2 ** dex.getEffectiveness(moveType, defTypes);
  if (defAbility === 'wonderguard' && mult <= 1) return 0;
  return mult;
}

/** Fração esperada do HP máximo do defensor que o golpe tira (aproximação; ignora boosts e clima). */
export function estimateDamage(att: Pokemon, def: Pokemon, moveId: string): number {
  const move = dex.moves.get(moveId);
  if (!move.exists || move.category === 'Status') return 0;
  let type = move.type;
  let bp = move.basePower;
  if (move.id === 'hiddenpower') {
    type = att.hpType;
    bp = att.hpPower;
  }
  const defTypes = def.getTypes();
  const mult = typeMultiplier(type, defTypes, def.ability);
  if (!mult) return 0;
  if (move.id === 'seismictoss' || move.id === 'nightshade') return att.level / def.maxhp;
  if (move.ohko) return 0.3;
  if (!bp) bp = 60; // golpes de poder variável (Gyro Ball, Low Kick, ...)

  const physical = move.category === 'Physical';
  let A = physical ? att.storedStats.atk : att.storedStats.spa;
  const D = physical ? def.storedStats.def : def.storedStats.spd;
  if (physical && (att.ability === 'hugepower' || att.ability === 'purepower')) A *= 2;

  const base = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * bp * A) / D) / 50) + 2;
  const stab = att.getTypes().includes(type) ? (att.ability === 'adaptability' ? 2 : 1.5) : 1;
  let itemMod = 1;
  if (att.item === 'choiceband' && physical) itemMod = 1.5;
  else if (att.item === 'choicespecs' && !physical) itemMod = 1.5;
  else if (att.item === 'lifeorb') itemMod = 1.3;
  else if (att.item === 'expertbelt' && mult > 1) itemMod = 1.2;
  const acc = move.accuracy === true ? 1 : move.accuracy / 100;
  const hits = Array.isArray(move.multihit) ? 3 : typeof move.multihit === 'number' ? move.multihit : 1;
  return (base * stab * mult * itemMod * 0.925 * acc * hits) / def.maxhp;
}

export function bestDamage(att: Pokemon, def: Pokemon): number {
  return Math.max(0, ...att.moveSlots.map(m => estimateDamage(att, def, m.id)));
}

/** Quão bom é "a" contra "b" (positivo = bom para "a"). */
export function matchup(a: Pokemon, b: Pokemon): number {
  const dealt = Math.min(1, bestDamage(a, b));
  const taken = Math.min(1, bestDamage(b, a));
  const faster = a.storedStats.spe > b.storedStats.spe;
  return dealt * (faster ? 1.25 : 1) - taken * (faster ? 1 : 1.25);
}
