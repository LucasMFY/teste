import {Battle} from '@pkmn/sim';
import type {Pokemon, Side} from '@pkmn/sim';
import {dex} from '../lib/dex';
import type {FullSet, Gender} from '../lib/dex';

/** Formato do Showdown: [Gen 5] Ubers — mecânicas de BW2, Team Preview e Sleep Clause Mod.
 *  As regras de montagem de time (cláusulas, learnsets) só existem no validador, que não usamos. */
export const FORMAT = 'gen5ubers';

export type SideID = 'p1' | 'p2';
export type RequestKind = 'teampreview' | 'move' | 'switch' | '';

export function toSimSet(s: FullSet) {
  return {
    name: s.name || s.species,
    species: s.species,
    item: s.item,
    ability: s.ability,
    moves: s.moves,
    nature: s.nature,
    gender: s.gender === 'N' ? '' : s.gender,
    level: s.level,
    evs: s.evs,
    ivs: s.ivs,
    shiny: s.shiny,
    happiness: s.happiness,
  };
}

export function createBattle(p1: {name: string; team: FullSet[]}, p2: {name: string; team: FullSet[]}): Battle {
  const b = new Battle({formatid: FORMAT as any});
  b.setPlayer('p1', {name: p1.name, team: p1.team.map(toSimSet) as any});
  b.setPlayer('p2', {name: p2.name, team: p2.team.map(toSimSet) as any});
  return b;
}

/** Reconstrói a batalha a partir do inputLog (seed + times + escolhas). Determinístico. */
export function replayBattle(inputLog: string[]): Battle {
  let b: Battle | null = null;
  for (const line of inputLog) {
    let m: RegExpMatchArray | null;
    if (line.startsWith('>start ')) b = new Battle(JSON.parse(line.slice(7)));
    else if (!b) continue;
    else if ((m = line.match(/^>player (p[12]) (.*)$/))) b.setPlayer(m[1] as SideID, JSON.parse(m[2]));
    else if ((m = line.match(/^>(p[12]) (.*)$/))) b.choose(m[1] as SideID, m[2]);
  }
  if (!b) throw new Error('inputLog sem ">start"');
  return b;
}

export function cloneBattle(b: Battle): string {
  return JSON.stringify(b.toJSON());
}

export const requestKind = (side: Side): RequestKind => (side.requestState || '') as RequestKind;

/* ---------- visão (o que a interface mostra) ---------- */

export interface MoveView {
  slot: number; // 1-based, para "move N"
  id: string;
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  pp: number;
  maxpp: number;
  disabled: boolean;
}

export interface MonView {
  slot: number; // 1-based na ordem atual do lado (para "switch N")
  name: string;
  species: string;
  level: number;
  gender: Gender;
  shiny: boolean;
  hp: number;
  maxhp: number;
  status: string;
  fainted: boolean;
  active: boolean;
  types: string[];
  item: string;
  ability: string;
  boosts: Record<string, number>;
  volatiles: string[];
  stats: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>;
  /** golpes escolhíveis agora ("move N" = slot). Pode ter só 1 quando travado. */
  moves: MoveView[];
  /** os golpes que o Pokémon conhece, com PP atual */
  knownMoves: MoveView[];
  set: FullSet;
}

export interface SideView {
  id: SideID;
  name: string;
  mons: MonView[];
  active: MonView | null;
  conditions: {id: string; name: string; layers: number}[];
  request: RequestKind;
  trapped: boolean;
}

export interface FieldView {
  turn: number;
  weather: string;
  pseudo: string[];
}

function setOf(p: Pokemon): FullSet {
  const s = p.set as any;
  return {
    name: s.name && s.name !== s.species ? s.name : '',
    species: s.species,
    item: s.item ? dex.items.get(s.item).name : '',
    ability: dex.abilities.get(s.ability).name,
    moves: (s.moves as string[]).map(m => dex.moves.get(m).name),
    nature: s.nature || 'Serious',
    gender: (p.gender || 'N') as Gender,
    level: s.level || 100,
    evs: s.evs,
    ivs: s.ivs,
    shiny: !!s.shiny,
    happiness: s.happiness ?? 255,
  };
}

function moveView(p: Pokemon, id: string, slot: number, disabled: boolean, fallbackName?: string): MoveView {
  const ms = p.moveSlots.find(m => m.id === id);
  const mv = dex.moves.get(id);
  const isHP = id === 'hiddenpower';
  return {
    slot,
    id,
    name: isHP ? `Hidden Power ${p.hpType}` : ms?.move ?? (mv.exists ? mv.name : fallbackName ?? id),
    type: isHP ? p.hpType : mv.type,
    category: mv.category,
    basePower: isHP ? p.hpPower : mv.basePower,
    accuracy: mv.accuracy,
    pp: ms?.pp ?? 0,
    maxpp: ms?.maxpp ?? 0,
    disabled,
  };
}

function monView(p: Pokemon, slot: number, req?: any): MonView {
  const reqMoves: any[] | undefined = p.isActive ? req?.active?.[0]?.moves : undefined;
  // Quando há um pedido de golpe, os botões seguem a lista do pedido: o "move N" do Showdown é o índice
  // NESSA lista, que encolhe para 1 item quando o Pokémon está travado (Outrage, recarga, 2 turnos, Struggle).
  const knownMoves = p.moveSlots.map((ms, i) => moveView(p, ms.id, i + 1, !!ms.disabled));
  const moves: MoveView[] = reqMoves
    ? reqMoves.map((r, i) => moveView(p, r.id, i + 1, !!r.disabled, r.move))
    : knownMoves;
  const boosts: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.boosts)) if (v) boosts[k] = v;
  return {
    slot,
    name: p.name,
    species: p.species.name,
    level: p.level,
    gender: (p.gender || 'N') as Gender,
    shiny: !!p.set.shiny,
    hp: p.hp,
    maxhp: p.maxhp,
    status: p.fainted ? 'fnt' : p.status,
    fainted: p.fainted || p.hp <= 0,
    active: p.isActive,
    types: p.getTypes(),
    item: p.item ? dex.items.get(p.item).name : '',
    ability: dex.abilities.get(p.ability).name,
    boosts,
    volatiles: p.isActive ? Object.keys(p.volatiles) : [],
    stats: {...p.storedStats},
    moves,
    knownMoves,
    set: setOf(p),
  };
}

export function sideView(b: Battle, id: SideID): SideView {
  const side = b[id];
  const req = side.activeRequest as any;
  const mons = side.pokemon.map((p, i) => monView(p, i + 1, req));
  const conditions = Object.entries(side.sideConditions).map(([cid, st]: [string, any]) => ({
    id: cid,
    name: dex.conditions.get(cid).name || cid,
    layers: st.layers ?? 0,
  }));
  return {
    id,
    name: side.name,
    mons,
    active: mons.find(m => m.active && !m.fainted) ?? null,
    conditions,
    request: requestKind(side),
    trapped: !!(req?.active?.[0]?.trapped || req?.active?.[0]?.maybeTrapped),
  };
}

export function fieldView(b: Battle): FieldView {
  return {
    turn: b.turn,
    weather: b.field.weather,
    // regras do formato (ex.: Sleep Clause Mod) também ficam em pseudoWeather; mostramos só efeitos reais
    pseudo: Object.keys(b.field.pseudoWeather).filter(id => !dex.formats.get(id).exists),
  };
}
