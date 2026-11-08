import {useMemo, useState} from 'react';
import {useStore} from '../lib/store';
import {parseTeam} from '../lib/dex';
import {go} from '../lib/router';
import {TeamStrip} from '../components/Pokemon';
import {TeamEditor} from '../components/TeamEditor';
import {ConfirmButton} from '../components/ConfirmButton';
import {DIFFICULTY_LABEL} from '../battle/ai';
import type {Difficulty} from '../lib/storage';

export function OpponentList() {
  const {data, deleteOpponent, moveOpponent} = useStore();
  const parsed = useMemo(
    () => Object.fromEntries(data.opponents.map(o => [o.id, parseTeam(o.teamText)])),
    [data.opponents],
  );

  return (
    <div className="stack">
      <div className="row between wrap gap-s">
        <h1>Adversários</h1>
        <a className="btn primary" href="#/adversarios/novo">+ Novo adversário</a>
      </div>
      {data.opponents.length === 0 && <p className="muted">Nenhum adversário ainda.</p>}
      {data.opponents.length > 1 && (
        <p className="muted small">A ordem da lista é a ordem do modo "todos em sequência".</p>
      )}
      <ol className="opp-list">
        {data.opponents.map((o, i) => {
          const p = parsed[o.id];
          const invalid = p.errors.length > 0;
          return (
            <li key={o.id} className="card">
              <div className="row between wrap gap-s">
                <a className="opp-name" href={`#/adversarios/${o.id}`}>
                  <span className="muted">{i + 1}.</span> {o.name}
                  {invalid && <span className="pill err-pill">time inválido</span>}
                </a>
                <div className="row gap-s">
                  <button className="btn icon" disabled={i === 0} onClick={() => moveOpponent(o.id, -1)} aria-label="Subir">↑</button>
                  <button className="btn icon" disabled={i === data.opponents.length - 1} onClick={() => moveOpponent(o.id, 1)} aria-label="Descer">↓</button>
                  <a className="btn" href={`#/adversarios/${o.id}`}>Editar</a>
                  <ConfirmButton onConfirm={() => deleteOpponent(o.id)} confirmLabel="Excluir mesmo?">Excluir</ConfirmButton>
                </div>
              </div>
              <TeamStrip sets={p.sets} size={40} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function OpponentEdit({id}: {id: string}) {
  const {data, addOpponent, updateOpponent, deleteOpponent} = useStore();
  const isNew = id === 'novo';
  const existing = data.opponents.find(o => o.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [aiLevel, setAiLevel] = useState<Difficulty>(existing?.aiLevel ?? 'dificil');

  if (!isNew && !existing) {
    return (
      <div className="stack">
        <p>Adversário não encontrado.</p>
        <a className="btn" href="#/adversarios">Voltar</a>
      </div>
    );
  }

  const saveTeam = (teamText: string) => {
    if (isNew) {
      const newId = addOpponent({name: name.trim() || 'Treinador', teamText, notes, aiLevel});
      go(`adversarios/${newId}`);
    } else {
      updateOpponent(id, {teamText});
    }
  };

  return (
    <div className="stack">
      <h1>{isNew ? 'Novo adversário' : existing!.name}</h1>
      <section className="card stack">
        <label className="field">
          <span>Nome do treinador</span>
          <input
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (!isNew) updateOpponent(id, {name: e.target.value});
            }}
            onBlur={() => !isNew && !name.trim() && updateOpponent(id, {name: 'Treinador'})}
            placeholder="Ex.: Campeão Iris"
            maxLength={32}
          />
        </label>
        <label className="field">
          <span>Notas (opcional)</span>
          <input
            value={notes}
            onChange={e => {
              setNotes(e.target.value);
              if (!isNew) updateOpponent(id, {notes: e.target.value});
            }}
            placeholder="Estratégia, lembretes…"
          />
        </label>
        <label className="field">
          <span>Dificuldade da IA</span>
          <div className="segmented">
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map(d => (
              <button
                key={d}
                className={aiLevel === d ? 'on' : ''}
                onClick={() => {
                  setAiLevel(d);
                  if (!isNew) updateOpponent(id, {aiLevel: d});
                }}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </label>
        {isNew && <p className="muted small">O adversário é criado quando você salvar o time.</p>}
      </section>

      <TeamEditor key={id} value={existing?.teamText ?? ''} onSave={saveTeam} startEditing={isNew} />

      {!isNew && (
        <div className="row gap-s">
          <a className="btn" href="#/adversarios">Concluído</a>
          <ConfirmButton
            onConfirm={() => {
              deleteOpponent(id);
              go('adversarios');
            }}
            confirmLabel="Excluir mesmo?"
          >
            Excluir adversário
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
