import {Teams} from '@pkmn/sim';
import {dex, parseTeam} from '../lib/dex';
import type {FullSet, Gender} from '../lib/dex';

/**
 * Modo "time aleatório": monta um time de 6 a partir dos sets do arquivo pokemons_feitos.txt.
 *
 * Peso: cada bloco do arquivo conta 1 para a sua espécie. Espécies repetidas no arquivo
 * aparecem com mais frequência, porque repetir um Pokémon no arquivo foi intencional.
 * Depois de sortear a espécie, um dos sets válidos dela é escolhido com chance igual.
 * Blocos inválidos (sem golpes, item inexistente…) contam no peso, mas não viram set.
 */

export interface PoolEntry {
  species: string;
  types: string[];
  weight: number; // nº de blocos no arquivo
  sets: {set: FullSet; genderGiven: boolean}[];
}

export interface Pool {
  entries: PoolEntry[];
  totalBlocks: number;
  invalid: {header: string; errors: string[]}[];
}

export function buildPool(text: string): Pool {
  const blocks = text.replace(/\r/g, '').split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean);
  const by = new Map<string, PoolEntry>();
  const invalid: Pool['invalid'] = [];

  for (const block of blocks) {
    const header = block.split('\n')[0].trim();
    const raw = Teams.import(block)?.[0];
    const sp = dex.species.get(raw?.species ?? '');
    if (!sp.exists) {
      invalid.push({header, errors: ['espécie desconhecida']});
      continue;
    }
    let e = by.get(sp.name);
    if (!e) by.set(sp.name, (e = {species: sp.name, types: [...sp.types], weight: 0, sets: []}));
    e.weight++;

    const p = parseTeam(block);
    if (p.errors.length || p.sets.length !== 1) {
      invalid.push({header, errors: p.errors});
      continue;
    }
    e.sets.push({set: p.sets[0], genderGiven: raw?.gender === 'M' || raw?.gender === 'F'});
  }

  return {entries: [...by.values()].filter(e => e.sets.length), totalBlocks: blocks.length, invalid};
}

/* ----- critérios ----- */

const has = (team: FullSet[], fn: (s: FullSet, types: readonly string[]) => boolean) =>
  team.some(s => fn(s, dex.species.get(s.species).types));

/** Chance mínima de o time ter um Dragão. */
export const DRAGON_CHANCE = 0.8;
const TEAM_SIZE = 6;
const MAX_SAME_TYPE = 3;

/** Lista o que falta no time (vazio = time aceito). */
export function teamProblems(team: FullSet[], requireDragon: boolean): string[] {
  const out: string[] = [];
  if (new Set(team.map(s => s.species)).size !== team.length) out.push('Pokémon repetido');
  const count: Record<string, number> = {};
  for (const s of team) for (const t of dex.species.get(s.species).types) count[t] = (count[t] ?? 0) + 1;
  for (const [t, n] of Object.entries(count)) if (n > MAX_SAME_TYPE) out.push(`${n} do tipo ${t}`);
  if (!has(team, (_, t) => t.includes('Steel'))) out.push('sem Steel');
  if (!has(team, (_, t) => t.includes('Water'))) out.push('sem Water');
  if (!has(team, (_, t) => t.includes('Electric') || t.includes('Ground'))) out.push('sem Electric/Ground');
  if (!has(team, (s, t) => t.includes('Flying') || s.ability === 'Levitate')) out.push('sem Flying/Levitate');
  if (requireDragon && !has(team, (_, t) => t.includes('Dragon'))) out.push('sem Dragon');
  return out;
}

/* ----- sorteio ----- */

type Rng = () => number;

function weightedPick<T extends {weight: number}>(list: T[], rng: Rng): number {
  const total = list.reduce((a, x) => a + x.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].weight;
    if (r < 0) return i;
  }
  return list.length - 1;
}

function rollGender(species: string, rng: Rng): Gender {
  const sp = dex.species.get(species);
  if (sp.gender) return sp.gender as Gender;
  return rng() < (sp.genderRatio?.M ?? 0.5) ? 'M' : 'F';
}

/** 6 espécies diferentes, cada uma sorteada pelo peso entre as que ainda não saíram. */
function draw(pool: Pool, rng: Rng): FullSet[] {
  const left = [...pool.entries];
  const team: FullSet[] = [];
  while (team.length < TEAM_SIZE && left.length) {
    const [e] = left.splice(weightedPick(left, rng), 1);
    const pick = e.sets[Math.floor(rng() * e.sets.length)];
    team.push({...pick.set, gender: pick.genderGiven ? pick.set.gender : rollGender(e.species, rng)});
  }
  return team;
}

/**
 * Sorteia até achar um time que atenda os critérios (rejeição: mantém as proporções do arquivo
 * entre os times válidos). Em 80% dos sorteios exige um Dragão; nos outros 20% um Dragão ainda
 * pode sair naturalmente, então a chance total fica acima de 80%.
 */
export function randomTeam(pool: Pool, rng: Rng = Math.random, maxTries = 20000): FullSet[] {
  if (pool.entries.length < TEAM_SIZE) {
    throw new Error(`O arquivo tem só ${pool.entries.length} espécie(s) com set válido; são necessárias ${TEAM_SIZE}.`);
  }
  const requireDragon = rng() < DRAGON_CHANCE;
  for (let i = 0; i < maxTries; i++) {
    const team = draw(pool, rng);
    if (!teamProblems(team, requireDragon).length) return team;
  }
  throw new Error('Não consegui montar um time que atenda todos os critérios com os Pokémon do arquivo.');
}
