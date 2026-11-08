import {Battle, PRNG} from '@pkmn/sim';
import type {Side} from '@pkmn/sim';
import {estimateDamage, matchup} from './estimate';
import type {SideID} from './engine';

/**
 * IA com visão total (vê seu time inteiro, igual você vê o dela).
 *
 * - Fácil: heurística de dano estimado, com bastante aleatoriedade.
 * - Normal: simula 1 turno à frente no motor real para cada par (ação dela × sua ação), 1 amostra,
 *           e escolhe com algum ruído.
 * - Difícil: o mesmo com 2 amostras por par, sem ruído, e ao trocar após um nocaute ela simula
 *            o turno seguinte para cada candidato.
 *
 * Cada simulação roda num clone com um PRNG novo: a IA não "enxerga" críticos/rolagens futuras.
 */
export type {Difficulty} from '../lib/storage';
import type {Difficulty} from '../lib/storage';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facil: 'Fácil',
  normal: 'Normal',
  dificil: 'Difícil',
};

const other = (s: SideID): SideID => (s === 'p1' ? 'p2' : 'p1');

/* ---------- opções ---------- */

function options(side: Side, movesOnly = false): string[] {
  const req = side.activeRequest as any;
  const kind = side.requestState;
  if (!req || !kind || req.wait) return [];
  const out: string[] = [];
  const switches = () =>
    side.pokemon.forEach((p, i) => {
      if (i > 0 && !p.fainted && p.hp > 0 && !p.isActive) out.push(`switch ${i + 1}`);
    });
  if (kind === 'switch') {
    switches();
    return out;
  }
  if (kind === 'move') {
    const act = req.active?.[0];
    (act?.moves ?? []).forEach((m: any, i: number) => {
      if (!m.disabled) out.push(`move ${i + 1}`);
    });
    if (!out.length) out.push('move 1'); // Struggle / recarga
    if (!movesOnly && !act?.trapped && !act?.maybeTrapped) switches();
  }
  return out;
}

/* ---------- avaliação ---------- */

const STATUS_PENALTY: Record<string, number> = {slp: 0.45, frz: 0.55, par: 0.3, brn: 0.3, tox: 0.3, psn: 0.15};
const BOOST_WEIGHT: Record<string, number> = {atk: 0.15, spa: 0.15, spe: 0.15, def: 0.1, spd: 0.1, accuracy: 0.05, evasion: 0.1};

function sideValue(side: Side): number {
  let v = 0;
  let alive = 0;
  for (const p of side.pokemon) {
    if (p.fainted || p.hp <= 0) continue;
    alive++;
    v += 1 + p.hp / p.maxhp - (STATUS_PENALTY[p.status] ?? 0);
    if (p.isActive) {
      for (const [k, b] of Object.entries(p.boosts)) v += (BOOST_WEIGHT[k] ?? 0) * (b as number);
      if (p.volatiles.substitute) v += 0.2;
      if (p.volatiles.leechseed) v -= 0.15;
      if (p.volatiles.confusion) v -= 0.15;
      if (p.volatiles.perishsong) v -= 0.4;
      if (p.volatiles.taunt || p.volatiles.encore) v -= 0.1;
    }
  }
  const sc = side.sideConditions as Record<string, any>;
  const benched = Math.max(0, alive - 1);
  if (sc.stealthrock) v -= 0.08 * benched;
  if (sc.spikes) v -= 0.05 * sc.spikes.layers * benched;
  if (sc.toxicspikes) v -= 0.06 * sc.toxicspikes.layers * benched;
  if (sc.reflect) v += 0.15;
  if (sc.lightscreen) v += 0.15;
  if (sc.tailwind) v += 0.1;
  return v;
}

function evaluate(b: Battle, me: SideID): number {
  if (b.ended) {
    if (!b.winner) return 0;
    return b.winner === b[me].name ? 100 : -100;
  }
  let v = sideValue(b[me]) - sideValue(b[other(me)]);
  // horizonte de 1 turno não enxerga "quem ameaça quem" depois: soma o confronto que fica em campo
  const a = b[me].active[0];
  const f = b[other(me)].active[0];
  if (a && f && !a.fainted && !f.fainted && a.hp > 0 && f.hp > 0) {
    v += MATCHUP_WEIGHT * matchupNow(a, f);
  }
  return v;
}

let MATCHUP_WEIGHT = 0.35;
/** só para experimentos */
export const _setMatchupWeight = (w: number) => (MATCHUP_WEIGHT = w);

/** Confronto considerando o HP atual: dano que cada um tira do HP restante do outro. */
function matchupNow(a: Battle['p1']['active'][0], f: Battle['p1']['active'][0]): number {
  const dealt = Math.min(1, (bestDamageFrac(a, f) * f.maxhp) / f.hp);
  const taken = Math.min(1, (bestDamageFrac(f, a) * a.maxhp) / a.hp);
  const aSpe = a.getStat('spe', false, false);
  const fSpe = f.getStat('spe', false, false);
  const faster = aSpe > fSpe ? 1 : aSpe < fSpe ? -1 : 0;
  return dealt - taken + 0.25 * faster * (dealt >= 1 || taken >= 1 ? 1 : 0.4);
}

function bestDamageFrac(att: Battle['p1']['active'][0], def: Battle['p1']['active'][0]): number {
  let best = 0;
  for (const m of att.moveSlots) {
    if (m.pp <= 0 || m.disabled) continue;
    best = Math.max(best, estimateDamage(att, def, m.id) * boostMult(att, def, m.id));
  }
  return best;
}

const stageMult = (s: number) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
function boostMult(att: Battle['p1']['active'][0], def: Battle['p1']['active'][0], moveId: string) {
  const cat = att.battle.dex.moves.get(moveId).category;
  if (cat === 'Physical') return stageMult(att.boosts.atk) / stageMult(def.boosts.def);
  if (cat === 'Special') return stageMult(att.boosts.spa) / stageMult(def.boosts.spd);
  return 1;
}

/* ---------- simulação ---------- */

function simulate(json: string, me: SideID, mine: string | null, theirs: string | null): Battle | null {
  const c = Battle.fromJSON(json);
  c.prng = new PRNG();
  if (mine && !c.choose(me, mine)) return null;
  if (theirs && !c.choose(other(me), theirs)) return null;
  return c;
}

const yieldNow = () => new Promise<void>(r => setTimeout(r, 0));

interface Ctx {
  me: SideID;
  difficulty: Difficulty;
  deadline: number;
  cancelled: () => boolean;
  lastYield: number;
}

async function maybeYield(ctx: Ctx) {
  if (performance.now() - ctx.lastYield > 25) {
    await yieldNow();
    ctx.lastYield = performance.now();
  }
  if (ctx.cancelled()) throw new Error('cancelled');
}

/** Matriz [minhas opções][opções dele] -> valor para mim. */
async function payoff(json: string, mine: string[], theirs: (string | null)[], samples: number, ctx: Ctx) {
  const M: number[][] = [];
  for (const a of mine) {
    const row: number[] = [];
    for (const t of theirs) {
      let sum = 0;
      let n = 0;
      for (let s = 0; s < samples; s++) {
        if (s > 0 && performance.now() > ctx.deadline) break;
        const c = simulate(json, ctx.me, a, t);
        await maybeYield(ctx);
        if (!c) continue;
        sum += evaluate(c, ctx.me);
        n++;
      }
      row.push(n ? sum / n : NaN);
    }
    M.push(row);
  }
  return M;
}

/** Valor de cada linha: mistura do pior caso com a média ponderada pela resposta provável do oponente. */
function rowValues(M: number[][]): number[] {
  const cols = M[0]?.length ?? 0;
  // utilidade de cada coluna para o oponente = -média das linhas; softmax para estimar o que ele fará
  const colScore: number[] = [];
  for (let j = 0; j < cols; j++) {
    const vals = M.map(r => r[j]).filter(v => !Number.isNaN(v));
    colScore.push(vals.length ? -vals.reduce((a, b) => a + b, 0) / vals.length : -Infinity);
  }
  const maxC = Math.max(...colScore);
  const w = colScore.map(s => (Number.isFinite(s) ? Math.exp((s - maxC) * 4) : 0));
  const wSum = w.reduce((a, b) => a + b, 0) || 1;
  return M.map(row => {
    let worst = Infinity;
    let exp = 0;
    row.forEach((v, j) => {
      if (Number.isNaN(v)) return;
      worst = Math.min(worst, v);
      exp += (w[j] / wSum) * v;
    });
    return worst === Infinity ? -Infinity : 0.45 * worst + 0.55 * exp;
  });
}

function pick(choices: string[], values: number[], noise: number): string {
  let best = 0;
  let bestV = -Infinity;
  values.forEach((v, i) => {
    const nv = v + (noise ? (Math.random() - 0.5) * noise : 0);
    if (nv > bestV) {
      bestV = nv;
      best = i;
    }
  });
  return choices[best];
}

/* ---------- decisões ---------- */

function chooseLead(b: Battle, me: SideID, difficulty: Difficulty): string {
  const mine = b[me].pokemon;
  const theirs = b[other(me)].pokemon;
  if (difficulty === 'facil') return `team ${1 + Math.floor(Math.random() * mine.length)}`;
  const scores = mine.map(a => theirs.reduce((s, t) => s + matchup(a, t), 0) / theirs.length);
  const noise = difficulty === 'normal' ? 0.3 : 0.05;
  const idx = scores.map((s, i) => [s + (Math.random() - 0.5) * noise, i]).sort((x, y) => y[0] - x[0])[0][1];
  return `team ${idx + 1}`;
}

function easyChoice(b: Battle, me: SideID, opts: string[]): string {
  const side = b[me];
  const foe = b[other(me)].active[0];
  const act = side.active[0];
  if (side.requestState === 'switch' || !act || !foe) {
    // troca para quem tem o melhor confronto, com ruído
    const sw = opts.filter(o => o.startsWith('switch'));
    if (!foe) return sw[Math.floor(Math.random() * sw.length)];
    const sc = sw.map(o => matchup(side.pokemon[+o.split(' ')[1] - 1], foe) + Math.random() * 0.8);
    return sw[sc.indexOf(Math.max(...sc))];
  }
  const moves = opts.filter(o => o.startsWith('move'));
  if (Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
  const req = side.activeRequest as any;
  const dmg = moves.map(o => {
    const id = req?.active?.[0]?.moves?.[+o.split(' ')[1] - 1]?.id;
    return id ? estimateDamage(act, foe, id) : 0;
  });
  if (Math.max(...dmg) === 0) return moves[Math.floor(Math.random() * moves.length)];
  return moves[dmg.indexOf(Math.max(...dmg))];
}

/** Valor de mandar cada candidato numa troca forçada: simula a troca e o turno seguinte (só golpes). */
async function forcedSwitch(json: string, mine: string[], theirs: (string | null)[], ctx: Ctx): Promise<number[]> {
  const values: number[] = [];
  for (const a of mine) {
    let total = 0;
    let n = 0;
    for (const t of theirs) {
      const c = simulate(json, ctx.me, a, t);
      await maybeYield(ctx);
      if (!c) continue;
      const me = c[ctx.me];
      const foe = c[other(ctx.me)];
      if (c.ended || me.requestState !== 'move' || foe.requestState !== 'move' || performance.now() > ctx.deadline) {
        // fallback barato: confronto estimado
        const act = me.active[0];
        const fa = foe.active[0];
        total += evaluate(c, ctx.me) + (act && fa ? matchup(act, fa) : 0);
      } else {
        const j2 = JSON.stringify(c.toJSON());
        const M = await payoff(j2, options(me, true), options(foe, true), 1, ctx);
        const rv = rowValues(M);
        total += Math.max(...rv.filter(Number.isFinite), evaluate(c, ctx.me) - 1);
      }
      n++;
    }
    values.push(n ? total / n : -Infinity);
  }
  return values;
}

/**
 * Decide a escolha da IA para o lado `me` a partir de um estado serializado.
 * Retorna uma string de escolha do Showdown ("move 2", "switch 3", "team 1").
 */
export async function chooseAI(
  json: string,
  me: SideID,
  difficulty: Difficulty,
  cancelled: () => boolean = () => false,
): Promise<string> {
  const b = Battle.fromJSON(json);
  const side = b[me];
  const foe = b[other(me)];

  if (side.requestState === 'teampreview') return chooseLead(b, me, difficulty);

  const mine = options(side);
  if (!mine.length) return 'default';
  if (mine.length === 1) return mine[0];

  if (difficulty === 'facil') return easyChoice(b, me, mine);

  const ctx: Ctx = {
    me,
    difficulty,
    deadline: performance.now() + (difficulty === 'dificil' ? 4000 : 1500),
    cancelled,
    lastYield: performance.now(),
  };
  const theirs: (string | null)[] = foe.requestState ? options(foe) : [null];
  if (!theirs.length) theirs.push(null);

  try {
    if (side.requestState === 'switch' && difficulty === 'dificil') {
      return pick(mine, await forcedSwitch(json, mine, theirs, ctx), 0);
    }
    const samples = difficulty === 'dificil' ? 2 : 1;
    const values = rowValues(await payoff(json, mine, theirs, samples, ctx));
    return pick(mine, values, difficulty === 'normal' ? 0.35 : 0);
  } catch (e) {
    if ((e as Error).message === 'cancelled') throw e;
    console.error('IA falhou, usando heurística', e);
    return easyChoice(b, me, mine);
  }
}

