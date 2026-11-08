import type {Battle} from '@pkmn/sim';
import {exportTeam, parseTeam} from '../lib/dex';
import type {FullSet} from '../lib/dex';
import {uid} from '../lib/storage';
import type {AppData, BattleRecord, BattleSession, Difficulty, MonSummary, Result} from '../lib/storage';
import {createBattle} from './engine';
import {formatLog} from './log';
import {randomTeam} from './random';
import {randomPool} from './poolData';

export const playerDisplayName = (d: AppData) => d.player.name.trim() || 'Você';

/** Adversários com time válido, na ordem da lista. */
export function validOpponents(d: AppData) {
  return d.opponents.filter(o => {
    const p = parseTeam(o.teamText);
    return p.sets.length > 0 && p.errors.length === 0;
  });
}

/**
 * Cria a sessão para a batalha `index` da fila. O time do jogador é lido de novo do texto salvo,
 * então ele sempre começa curado (HP, PP e status completos).
 */
export function buildSession(
  d: AppData,
  mode: BattleSession['mode'],
  queue: string[],
  index: number,
  results: Result[],
): BattleSession {
  const opp = d.opponents.find(o => o.id === queue[index]);
  if (!opp) throw new Error('Adversário não encontrado.');
  const theirs = parseTeam(opp.teamText);
  if (!theirs.sets.length || theirs.errors.length) throw new Error(`O time de ${opp.name} é inválido.`);
  return {...makeSession(d, opp.name, theirs.sets, opp.aiLevel), mode, queue, index, results, opponentId: opp.id};
}

export const RANDOM_TRAINER = 'Treinador Aleatório';

/** Modo aleatório: sem `teamText`, sorteia um time novo; com ele, repete o mesmo time (revanche). */
export function buildRandomSession(d: AppData, aiLevel: Difficulty, teamText?: string): BattleSession {
  const sets = teamText ? parseTeam(teamText).sets : randomTeam(randomPool());
  const s = makeSession(d, RANDOM_TRAINER, sets, aiLevel);
  return {...s, mode: 'random', queue: [], index: 0, results: [], opponentId: 'random', oppTeamText: exportTeam(sets)};
}

function makeSession(d: AppData, oppName: string, oppSets: FullSet[], aiLevel: Difficulty) {
  const mine = parseTeam(d.player.teamText);
  if (!mine.sets.length || mine.errors.length) throw new Error('Seu time está vazio ou inválido.');
  const p1Name = playerDisplayName(d);
  // nomes iguais confundiriam o "vencedor" do motor
  const p2Name = oppName.trim() === p1Name ? `${oppName} (IA)` : oppName.trim() || 'Treinador';
  const battle = createBattle({name: p1Name, team: mine.sets}, {name: p2Name, team: oppSets});
  return {
    id: uid(),
    inputLog: [...battle.inputLog],
    opponentName: p2Name,
    aiLevel,
    recorded: false,
  };
}

export function battleResult(b: Battle, forfeit: boolean): Result {
  if (forfeit) return 'loss';
  if (!b.winner) return 'draw';
  return b.winner === b.p1.name ? 'win' : 'loss';
}

const summary = (b: Battle, side: 'p1' | 'p2'): MonSummary[] =>
  b[side].pokemon.map(p => ({
    species: p.species.name,
    name: p.name,
    hp: p.hp,
    maxhp: p.maxhp,
    status: p.fainted ? 'fnt' : p.status,
  }));

export function buildRecord(b: Battle, s: BattleSession, forfeit: boolean): BattleRecord {
  const log = formatLog(b.log, {p1: b.p1.name, p2: b.p2.name}).map(e => ({kind: e.kind, text: e.text, side: e.side}));
  if (forfeit) log.push({kind: 'win', text: `${b.p1.name} desistiu. ${b.p2.name} venceu a batalha!`, side: undefined});
  return {
    id: s.id,
    opponentId: s.opponentId,
    opponentName: s.opponentName,
    playerName: b.p1.name,
    mode: s.mode,
    aiLevel: s.aiLevel,
    result: battleResult(b, forfeit),
    forfeit,
    turns: b.turn,
    myTeam: summary(b, 'p1'),
    oppTeam: summary(b, 'p2'),
    log,
    date: Date.now(),
  };
}

/** 'playing' = batalha rolando; 'next' = sequência com próxima batalha pendente; 'done' = encerrada. */
export function sessionStatus(s: BattleSession): 'playing' | 'next' | 'done' {
  if (!s.recorded) return 'playing';
  const last = s.results[s.results.length - 1];
  if (s.mode === 'gauntlet' && last === 'win' && s.index < s.queue.length - 1) return 'next';
  return 'done';
}
