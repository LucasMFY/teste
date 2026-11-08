import {useStore} from '../lib/store';
import {go} from '../lib/router';
import type {BattleRecord, MonSummary} from '../lib/storage';
import {DIFFICULTY_LABEL} from '../battle/ai';
import {HpBar, LogPanel} from '../components/BattleParts';
import {Sprite} from '../components/Pokemon';
import {ConfirmButton} from '../components/ConfirmButton';
import type {LogEntry} from '../battle/log';

const RESULT: Record<BattleRecord['result'], [string, string]> = {
  win: ['Vitória', 'ok'],
  loss: ['Derrota', 'err'],
  draw: ['Empate', 'muted'],
};

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'});

export function HistoryList() {
  const {data, clearHistory} = useStore();
  const h = data.history;
  const w = h.filter(x => x.result === 'win').length;
  const l = h.filter(x => x.result === 'loss').length;
  return (
    <div className="stack">
      <div className="row between wrap gap-s">
        <h1>Histórico</h1>
        {h.length > 0 && (
          <ConfirmButton onConfirm={clearHistory} confirmLabel="Apagar tudo mesmo?">Apagar histórico</ConfirmButton>
        )}
      </div>
      {h.length === 0 ? (
        <p className="muted">Nenhuma batalha ainda.</p>
      ) : (
        <p className="small">
          {h.length} batalha(s) · <span className="ok">{w} vitória(s)</span> · <span className="err">{l} derrota(s)</span>
        </p>
      )}
      <ul className="opp-list">
        {h.map(r => (
          <li key={r.id}>
            <a className="card link-card hist-row" href={`#/historico/${r.id}`}>
              <div className="row between wrap gap-s">
                <strong>{r.opponentName}</strong>
                <span className={RESULT[r.result][1]}>{RESULT[r.result][0]}{r.forfeit ? ' (desistência)' : ''}</span>
              </div>
              <div className="muted small">
                {fmtDate(r.date)} · {r.turns} turno(s) · {r.mode === 'gauntlet' ? 'sequência' : r.mode === 'random' ? 'aleatório' : 'individual'} · IA{' '}
                {DIFFICULTY_LABEL[r.aiLevel] ?? r.aiLevel}
              </div>
              <div className="row wrap gap-s">
                <MiniTeam team={r.myTeam} />
                <span className="muted">×</span>
                <MiniTeam team={r.oppTeam} />
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniTeam({team}: {team: MonSummary[]}) {
  return (
    <div className="strip">
      {team.map((m, i) => (
        <span key={i} className={`mini ${m.status === 'fnt' ? 'fainted' : ''}`} title={`${m.name} ${m.hp}/${m.maxhp}`}>
          <Sprite species={m.species} size={32} />
        </span>
      ))}
    </div>
  );
}

export function HistoryDetail({id}: {id: string}) {
  const {data, deleteHistory} = useStore();
  const r = data.history.find(x => x.id === id);
  if (!r) {
    return (
      <div className="stack">
        <p>Batalha não encontrada.</p>
        <a className="btn" href="#/historico">Voltar</a>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row between wrap gap-s">
        <div>
          <h1>{r.playerName} × {r.opponentName}</h1>
          <p className="small">
            <span className={RESULT[r.result][1]}>{RESULT[r.result][0]}{r.forfeit ? ' (desistência)' : ''}</span>
            <span className="muted"> · {fmtDate(r.date)} · {r.turns} turno(s) · IA {DIFFICULTY_LABEL[r.aiLevel] ?? r.aiLevel}</span>
          </p>
        </div>
        <ConfirmButton
          onConfirm={() => {
            deleteHistory(r.id);
            go('historico');
          }}
          confirmLabel="Excluir mesmo?"
        >
          Excluir
        </ConfirmButton>
      </div>
      <div className="hist-teams">
        <FinalTeam title={r.playerName} team={r.myTeam} />
        <FinalTeam title={r.opponentName} team={r.oppTeam} />
      </div>
      <section className="card">
        <h3 className="section-label">Histórico de movimentos</h3>
        <LogPanel entries={r.log as LogEntry[]} className="log-full" />
      </section>
    </div>
  );
}

function FinalTeam({title, team}: {title: string; team: MonSummary[]}) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {team.map((m, i) => (
        <div key={i} className={`final-mon ${m.status === 'fnt' ? 'fainted' : ''}`}>
          <Sprite species={m.species} size={40} />
          <div className="grow">
            <div className="row between small">
              <strong>{m.name}</strong>
              <span>{m.status === 'fnt' ? 'KO' : `${m.hp}/${m.maxhp}`}</span>
            </div>
            <HpBar hp={m.hp} maxhp={m.maxhp} />
          </div>
        </div>
      ))}
    </section>
  );
}
