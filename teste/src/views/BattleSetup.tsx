import {useMemo, useState} from 'react';
import {useStore} from '../lib/store';
import {parseTeam} from '../lib/dex';
import {go} from '../lib/router';
import type {BattleSession, Difficulty} from '../lib/storage';
import {DIFFICULTY_LABEL} from '../battle/ai';
import {buildRandomSession, buildSession, sessionStatus, validOpponents} from '../battle/session';
import {DRAGON_CHANCE} from '../battle/random';
import {randomPool} from '../battle/poolData';
import {TeamStrip} from '../components/Pokemon';
import {ConfirmButton} from '../components/ConfirmButton';

const RAND_LEVEL_KEY = 'lenda:randomAi';

export function BattleSetup() {
  const {data, session, setSession} = useStore();
  const [err, setErr] = useState('');
  const mine = useMemo(() => parseTeam(data.player.teamText), [data.player.teamText]);
  const valid = useMemo(() => validOpponents(data), [data]);
  const myOk = mine.sets.length > 0 && mine.errors.length === 0;
  const status = session ? sessionStatus(session) : null;
  // uma batalha encerrada não bloqueia começar outra (ela é só substituída)
  const blocked = !myOk || status === 'playing' || status === 'next';

  const start = (mode: BattleSession['mode'], queue: string[]) => {
    try {
      setSession(buildSession(data, mode, queue, 0, []));
      go('batalha');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const pool = useMemo(() => randomPool(), []);
  const [randLevel, setRandLevel] = useState<Difficulty>(() => {
    try {
      const v = localStorage.getItem(RAND_LEVEL_KEY);
      if (v && v in DIFFICULTY_LABEL) return v as Difficulty;
    } catch {}
    return 'dificil';
  });
  const pickLevel = (d: Difficulty) => {
    setRandLevel(d);
    try {
      localStorage.setItem(RAND_LEVEL_KEY, d);
    } catch {}
  };
  const startRandom = () => {
    try {
      setSession(buildRandomSession(data, randLevel));
      go('batalha');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // retrospecto contra cada adversário
  const record = useMemo(() => {
    const r: Record<string, {w: number; l: number}> = {};
    for (const h of data.history) {
      const x = (r[h.opponentId] ??= {w: 0, l: 0});
      if (h.result === 'win') x.w++;
      else if (h.result === 'loss') x.l++;
    }
    return r;
  }, [data.history]);

  return (
    <div className="stack">
      <h1>Batalhar</h1>

      {session && (
        <section className={`card stack ${status === 'done' ? '' : 'highlight'}`}>
          <h2>{status === 'playing' ? 'Batalha em andamento' : status === 'next' ? 'Sequência em andamento' : 'Última batalha encerrada'}</h2>
          <p className="small">
            {status === 'next' ? 'Última vitória contra ' : 'Contra '}
            <strong>{session.opponentName}</strong>
            {session.mode === 'gauntlet' && ` — sequência, batalha ${session.index + 1} de ${session.queue.length}`}
            {session.mode === 'random' && ' — time aleatório'}
          </p>
          <div className="row wrap gap-s">
            <a className="btn primary" href="#/batalha">{status === 'done' ? 'Ver resultado' : 'Continuar'}</a>
            {status === 'playing' && (
              <ConfirmButton onConfirm={() => setSession(null)} confirmLabel="Abandonar mesmo?">
                Abandonar (sem registrar)
              </ConfirmButton>
            )}
            {status === 'next' && (
              <ConfirmButton onConfirm={() => setSession(null)} confirmLabel="Encerrar mesmo?">
                Encerrar sequência
              </ConfirmButton>
            )}
            {status === 'done' && <button className="btn" onClick={() => setSession(null)}>Fechar</button>}
          </div>
        </section>
      )}

      {!myOk && (
        <section className="card">
          <p className="warn">Seu time está vazio ou tem erros.</p>
          <a className="btn" href="#/time">Ajustar meu time</a>
        </section>
      )}

      <section className="card stack">
        <div className="row between wrap gap-s">
          <h2>Todos em sequência</h2>
          <button className="btn primary" disabled={blocked || valid.length < 1} onClick={() => start('gauntlet', valid.map(o => o.id))}>
            Começar ({valid.length})
          </button>
        </div>
        <p className="muted small">
          Enfrenta os adversários na ordem da lista. Seu time entra curado em cada batalha. Se perder, pode tentar de novo
          a mesma batalha ou encerrar.
        </p>
      </section>

      <section className="card stack">
        <div className="row between wrap gap-s">
          <h2>Time aleatório</h2>
          <button className="btn primary" disabled={blocked || pool.entries.length < 6} onClick={startRandom}>
            Sortear e batalhar
          </button>
        </div>
        <p className="muted small">
          Seis Pokémon diferentes sorteados de <code>pokemons_feitos.txt</code> ({pool.entries.length} espécies,{' '}
          {pool.totalBlocks} sets; os repetidos saem mais). O time tem no máximo 3 do mesmo tipo e pelo menos um Steel,
          um Water, um Electric ou Ground e um Flying ou com Levitate. Em pelo menos {Math.round(DRAGON_CHANCE * 100)}%
          dos times sai um Dragon.
        </p>
        <div className="segmented">
          {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map(d => (
            <button key={d} className={randLevel === d ? 'on' : ''} onClick={() => pickLevel(d)}>
              IA {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
        {pool.invalid.length > 0 && (
          <details>
            <summary className="muted small">{pool.invalid.length} set(s) do arquivo ignorado(s) por erro</summary>
            <ul className="small">
              {pool.invalid.map((x, i) => (
                <li key={i}>
                  <strong>{x.header}</strong>: {x.errors.join(' ')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <h2>Individual</h2>
      {data.opponents.length === 0 && (
        <p className="muted">
          Nenhum adversário. <a className="link" href="#/adversarios/novo">Criar um</a>
        </p>
      )}
      <ol className="opp-list">
        {data.opponents.map(o => {
          const p = parseTeam(o.teamText);
          const ok = p.sets.length > 0 && p.errors.length === 0;
          const r = record[o.id];
          return (
            <li key={o.id} className="card">
              <div className="row between wrap gap-s">
                <div>
                  <div className="opp-name">{o.name}</div>
                  <div className="muted small">
                    IA {DIFFICULTY_LABEL[o.aiLevel]}
                    {r && ` · ${r.w}V ${r.l}D`}
                    {!ok && <span className="err"> · time inválido</span>}
                  </div>
                </div>
                <button className="btn primary" disabled={blocked || !ok} onClick={() => start('single', [o.id])}>
                  Batalhar
                </button>
              </div>
              <TeamStrip sets={p.sets} size={40} />
            </li>
          );
        })}
      </ol>
      {(status === 'playing' || status === 'next') && (
        <p className="muted small">Termine ou abandone a batalha atual para começar outra.</p>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
