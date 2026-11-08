import {useMemo} from 'react';
import {useStore} from '../lib/store';
import {parseTeam} from '../lib/dex';
import {TeamStrip} from '../components/Pokemon';
import {sessionStatus} from '../battle/session';

export function Home() {
  const {data, setPlayerName, session} = useStore();
  const myTeam = useMemo(() => parseTeam(data.player.teamText).sets, [data.player.teamText]);

  return (
    <div className="stack">
      <section className="card">
        <label className="field">
          <span>Seu nome de treinador</span>
          <input
            value={data.player.name}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Ex.: Rafael"
            maxLength={24}
          />
        </label>
      </section>

      <a className="card link-card" href="#/time">
        <div className="row between">
          <h2>Meu time</h2>
          <span className="muted">{myTeam.length}/6 ›</span>
        </div>
        <TeamStrip sets={myTeam} />
      </a>

      <a className="card link-card" href="#/adversarios">
        <div className="row between">
          <h2>Adversários</h2>
          <span className="muted">{data.opponents.length} ›</span>
        </div>
        <p className="muted small">Crie, edite, exclua e ordene os treinadores da IA.</p>
      </a>

      {session && sessionStatus(session) !== 'done' && (
        <a className="card link-card highlight" href="#/batalha">
          <div className="row between">
            <h2>{sessionStatus(session) === 'next' ? 'Continuar sequência' : 'Continuar batalha'}</h2>
            <span className="muted">›</span>
          </div>
          <p className="muted small">Contra {session.opponentName}</p>
        </a>
      )}

      <a className="card link-card" href="#/batalhar">
        <div className="row between">
          <h2>Batalhar</h2>
          <span className="muted">›</span>
        </div>
        <p className="muted small">Individual, todos em sequência ou contra um time aleatório, com seu time curado entre as batalhas.</p>
      </a>

      <a className="card link-card" href="#/historico">
        <div className="row between">
          <h2>Histórico</h2>
          <span className="muted">{data.history.length} ›</span>
        </div>
        <p className="muted small">Resultados e o registro de cada turno.</p>
      </a>

      <a className="card link-card" href="#/dados">
        <div className="row between">
          <h2>Dados e backup</h2>
          <span className="muted">›</span>
        </div>
        <p className="muted small">Exportar/importar, carregar de uma URL do GitHub.</p>
      </a>
    </div>
  );
}
