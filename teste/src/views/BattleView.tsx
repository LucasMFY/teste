import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toID} from '@pkmn/sim';
import type {Battle} from '@pkmn/sim';
import {useStore} from '../lib/store';
import {go} from '../lib/router';
import type {BattleSession} from '../lib/storage';
import {chooseAI, DIFFICULTY_LABEL} from '../battle/ai';
import {cloneBattle, fieldView, replayBattle, sideView} from '../battle/engine';
import type {MonView} from '../battle/engine';
import {estimateDamage, typeMultiplier} from '../battle/estimate';
import {formatLog} from '../battle/log';
import {battleResult, buildRandomSession, buildRecord, buildSession} from '../battle/session';
import {ActiveMon, Bench, FieldBar, InspectModal, LogPanel, MoveButton, SideHeader} from '../components/BattleParts';
import {PokemonCard, Sprite} from '../components/Pokemon';
import {ConfirmButton} from '../components/ConfirmButton';

export function BattleView() {
  const {session} = useStore();
  if (!session) {
    return (
      <div className="stack">
        <p>Nenhuma batalha em andamento.</p>
        <a className="btn primary" href="#/batalhar">Escolher adversário</a>
      </div>
    );
  }
  return <BattleRunner key={session.id} />;
}

interface AiJob {
  key: number;
  promise: Promise<string>;
  token: {cancel: boolean};
}

function BattleRunner() {
  const {session: s, setSession, addHistory} = useStore();
  const session = s!;
  const sessionRef = useRef<BattleSession>(session);
  sessionRef.current = session;

  const battleRef = useRef<Battle | null>(null);
  if (!battleRef.current) battleRef.current = replayBattle(session.inputLog);
  const b = battleRef.current;

  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState<MonView | null>(null);
  const [lead, setLead] = useState<number | null>(null);
  const ai = useRef<AiJob | null>(null);

  // cancela a IA ao sair da tela
  useEffect(() => () => {
    if (ai.current) ai.current.token.cancel = true;
  }, []);

  const persist = useCallback(
    (patch: Partial<BattleSession> = {}) => setSession({...sessionRef.current, inputLog: [...b.inputLog], ...patch}),
    [b, setSession],
  );

  /** Inicia (ou reaproveita) o raciocínio da IA para o pedido atual. Ela usa um clone feito ANTES da sua escolha. */
  const ensureAI = useCallback((): Promise<string> | null => {
    if (b.ended || !b.p2.requestState) return null;
    const key = b.inputLog.length;
    if (ai.current?.key === key) return ai.current.promise;
    const token = {cancel: false};
    const json = cloneBattle(b);
    setThinking(true);
    const promise = chooseAI(json, 'p2', sessionRef.current.aiLevel, () => token.cancel).catch((e: Error) => {
      if (e.message === 'cancelled') throw e;
      console.error('Falha na IA; usando escolha padrão', e);
      return 'default'; // nunca trava a batalha
    });
    promise.finally(() => {
      if (ai.current?.token === token) setThinking(false);
    }).catch(() => {});
    ai.current = {key, promise, token};
    return promise;
  }, [b]);

  const commit = useCallback(
    (aiChoice: string | null, myChoice: string | null) => {
      if (aiChoice && b.p2.requestState && !b.choose('p2', aiChoice)) b.choose('p2', 'default');
      if (myChoice && b.p1.requestState && !b.choose('p1', myChoice)) {
        setError(`Escolha inválida: ${b.p1.choice.error || myChoice}`);
      }
      persist();
      bump();
    },
    [b, persist],
  );

  // quando só a IA precisa escolher (ex.: troca após nocaute dela), ela joga sozinha
  useEffect(() => {
    if (b.ended) return;
    const p = ensureAI();
    if (!p || b.p1.requestState) return;
    const len = b.inputLog.length;
    let alive = true;
    p.then(choice => {
      if (alive && b.inputLog.length === len) commit(choice, null);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  });

  // fim de batalha -> histórico (uma vez)
  useEffect(() => {
    if (!b.ended || session.recorded) return;
    addHistory(buildRecord(b, session, false));
    persist({recorded: true, results: [...session.results, battleResult(b, false)]});
  });

  const act = async (choice: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const p = ensureAI();
      const aiChoice = p ? await p : null;
      commit(aiChoice, choice);
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const forfeit = () => {
    if (ai.current) ai.current.token.cancel = true;
    addHistory(buildRecord(b, session, true));
    persist({recorded: true, forfeited: true, results: [...session.results, 'loss']});
  };

  /* ----- visão ----- */
  const me = sideView(b, 'p1');
  const foe = sideView(b, 'p2');
  const field = fieldView(b);
  const log = useMemo(() => formatLog(b.log, {p1: b.p1.name, p2: b.p2.name}), [b.log.length]); // eslint-disable-line
  const over = b.ended || !!session.forfeited;

  const header = (
    <div className="row between wrap gap-s">
      <div>
        <h1>{b.p1.name} × {b.p2.name}</h1>
        <p className="muted small">
          IA {DIFFICULTY_LABEL[session.aiLevel]}
          {session.mode === 'gauntlet' && ` · Sequência: batalha ${session.index + 1} de ${session.queue.length}`}
          {session.mode === 'random' && ' · Time aleatório'}
        </p>
      </div>
      {!over && (
        <ConfirmButton onConfirm={forfeit} confirmLabel="Desistir mesmo?">Desistir</ConfirmButton>
      )}
    </div>
  );

  if (b.p1.requestState === 'teampreview' && !over) {
    return (
      <div className="stack">
        {header}
        <TeamPreview
          me={me.mons}
          foe={foe.mons}
          foeName={b.p2.name}
          lead={lead}
          setLead={setLead}
          busy={busy || thinking}
          onStart={() => act(`team ${lead ?? 1}`)}
        />
      </div>
    );
  }

  // golpes: efetividade e dano estimado contra o Pokémon em campo do adversário
  const myActive = b.p1.active[0];
  const foeActive = b.p2.active[0];
  const moveHints = (me.active?.moves ?? []).map(m => ({
    eff: foe.active ? typeMultiplier(m.type, foe.active.types, toID(foe.active.ability)) : undefined,
    est: myActive && foeActive && !foeActive.fainted ? estimateDamage(myActive, foeActive, m.id) : undefined,
  }));
  const canSwitch = me.request === 'switch' || (me.request === 'move' && !me.trapped);
  const switchTargets = me.mons.filter(m => !m.active && !m.fainted);

  return (
    <div className="stack">
      {header}
      <div className="battle">
        <div className="battle-main stack">
          <FieldBar field={field} />
          <section className="side foe">
            <SideHeader side={foe} foe />
            <ActiveMon mon={foe.active} onInspect={setInspect} />
            <Bench side={foe} onInspect={setInspect} />
          </section>
          <section className="side mine">
            <SideHeader side={me} />
            <ActiveMon mon={me.active} back onInspect={setInspect} />
            <Bench side={me} onInspect={setInspect} />
          </section>

          {!over && (
            <section className="controls card">
              {me.request === 'move' && me.active && (
                <>
                  <h3 className="section-label">O que {me.active.name} vai fazer?</h3>
                  <div className="moves-grid">
                    {me.active.moves.map((m, i) => (
                      <MoveButton
                        key={m.slot}
                        move={m}
                        eff={moveHints[i]?.eff}
                        estimate={moveHints[i]?.est}
                        disabled={busy}
                        onClick={() => act(`move ${m.slot}`)}
                      />
                    ))}
                  </div>
                </>
              )}
              {me.request === 'switch' && <h3 className="section-label">Escolha quem entra</h3>}
              {canSwitch && switchTargets.length > 0 && (
                <>
                  {me.request === 'move' && <h3 className="section-label">Trocar</h3>}
                  <div className="switch-grid">
                    {switchTargets.map(m => (
                      <button key={m.slot} className="switch-btn" disabled={busy} onClick={() => act(`switch ${m.slot}`)}>
                        <Sprite species={m.species} shiny={m.shiny} size={40} />
                        <span>
                          <strong>{m.name}</strong>
                          <span className="muted small"> {m.hp}/{m.maxhp}{m.status ? ` · ${m.status.toUpperCase()}` : ''}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {me.request === 'move' && me.trapped && <p className="muted small">Você está preso e não pode trocar.</p>}
              {(busy || (!me.request && thinking)) && <p className="muted small thinking">A IA está pensando…</p>}
              {error && <p className="err small">{error}</p>}
            </section>
          )}

          {over && <EndPanel battle={b} session={session} />}
        </div>
        <aside className="battle-log card">
          <h3 className="section-label">Histórico</h3>
          <LogPanel entries={log} />
        </aside>
      </div>
      {inspect && <InspectModal mon={findFresh(inspect, me.mons, foe.mons)} onClose={() => setInspect(null)} />}
    </div>
  );
}

/** O modal guarda uma cópia antiga; troca pela versão atual do mesmo Pokémon. */
function findFresh(m: MonView, a: MonView[], b: MonView[]) {
  return [...a, ...b].find(x => x.name === m.name && x.species === m.species && x.set.moves.join() === m.set.moves.join()) ?? m;
}

function TeamPreview({
  me,
  foe,
  foeName,
  lead,
  setLead,
  busy,
  onStart,
}: {
  me: MonView[];
  foe: MonView[];
  foeName: string;
  lead: number | null;
  setLead(n: number): void;
  busy: boolean;
  onStart(): void;
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <h2>Escolha seu primeiro Pokémon</h2>
        <div className="lead-grid">
          {me.map(m => (
            <button
              key={m.slot}
              className={`lead-btn ${lead === m.slot ? 'on' : ''}`}
              onClick={() => setLead(m.slot)}
            >
              <Sprite species={m.species} shiny={m.shiny} size={64} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
        <div>
          <button className="btn primary" disabled={lead === null || busy} onClick={onStart}>
            {busy ? 'A IA está escolhendo…' : 'Começar batalha'}
          </button>
        </div>
      </section>

      <h2>Time de {foeName} (visível por completo)</h2>
      <div className="poke-grid">
        {foe.map(m => <PokemonCard key={m.slot} set={m.set} />)}
      </div>
      <details>
        <summary className="muted">Seu time (a IA também vê tudo isto)</summary>
        <div className="poke-grid" style={{marginTop: 12}}>
          {me.map(m => <PokemonCard key={m.slot} set={m.set} />)}
        </div>
      </details>
    </div>
  );
}

function EndPanel({battle, session}: {battle: Battle; session: BattleSession}) {
  const {data, setSession} = useStore();
  const [err, setErr] = useState('');
  const result = battleResult(battle, !!session.forfeited);
  const isLast = session.index >= session.queue.length - 1;

  const start = (index: number, results = session.results) => {
    try {
      // pula adversários que foram excluídos no meio da sequência
      let i = index;
      while (i < session.queue.length && !data.opponents.some(o => o.id === session.queue[i])) i++;
      if (i >= session.queue.length) {
        setSession(null);
        go('historico');
        return;
      }
      setSession(buildSession(data, session.mode, session.queue, i, results));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const retry = () => start(session.index, session.results.slice(0, -1));
  const random = (same: boolean) => {
    try {
      setSession(buildRandomSession(data, session.aiLevel, same ? session.oppTeamText : undefined));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const leave = () => {
    setSession(null);
    go('batalhar');
  };

  const title = result === 'win' ? 'Vitória!' : result === 'loss' ? (session.forfeited ? 'Você desistiu' : 'Derrota') : 'Empate';
  const wins = session.results.filter(r => r === 'win').length;

  return (
    <section className={`card stack end end-${result}`}>
      <h2>{title}</h2>
      {session.mode === 'gauntlet' && (
        <p className="small">
          Sequência: {wins} vitória(s) em {session.results.length} batalha(s) de {session.queue.length}.
        </p>
      )}
      <div className="row wrap gap-s">
        {session.mode === 'single' && (
          <>
            <button className="btn primary" onClick={retry}>Revanche</button>
            <button className="btn" onClick={leave}>Sair</button>
          </>
        )}
        {session.mode === 'random' && (
          <>
            <button className="btn primary" onClick={() => random(false)}>Novo time aleatório</button>
            <button className="btn" onClick={() => random(true)}>Revanche (mesmo time)</button>
            <button className="btn" onClick={leave}>Sair</button>
          </>
        )}
        {session.mode === 'gauntlet' && result === 'win' && !isLast && (
          <button className="btn primary" onClick={() => start(session.index + 1)}>
            Próximo: {data.opponents.find(o => o.id === session.queue[session.index + 1])?.name ?? '…'} (time curado)
          </button>
        )}
        {session.mode === 'gauntlet' && result === 'win' && isLast && (
          <>
            <strong className="ok">Sequência concluída!</strong>
            <button className="btn primary" onClick={leave}>Concluir</button>
          </>
        )}
        {session.mode === 'gauntlet' && result !== 'win' && (
          <>
            <button className="btn primary" onClick={retry}>Tentar de novo</button>
            <button className="btn" onClick={leave}>Encerrar sequência</button>
          </>
        )}
        <a className="btn ghost" href={`#/historico/${session.id}`}>Ver no histórico</a>
      </div>
      {err && <p className="err small">{err}</p>}
    </section>
  );
}
