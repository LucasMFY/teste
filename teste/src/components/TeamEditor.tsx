import {useMemo, useRef, useState} from 'react';
import {exportTeam, parseTeam} from '../lib/dex';
import {PokemonCard} from './Pokemon';

const EXAMPLE = `Kyogre @ Choice Specs
Ability: Drizzle
EVs: 4 HP / 252 SpA / 252 Spe
Modest Nature
IVs: 0 Atk
- Water Spout
- Surf
- Ice Beam
- Thunder`;

interface Props {
  /** texto salvo atualmente (vazio = sem time) */
  value: string;
  /** recebe o texto normalizado (todos os campos explícitos) */
  onSave(text: string): void;
  startEditing?: boolean;
}

export function TeamEditor({value, onSave, startEditing}: Props) {
  const [editing, setEditing] = useState(startEditing ?? !value);
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saved = useMemo(() => parseTeam(value), [value]);
  const preview = useMemo(() => parseTeam(draft), [draft]);
  const shown = editing ? preview : saved;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setDraft(await f.text());
    setEditing(true);
  };

  const save = () => {
    onSave(exportTeam(preview.sets));
    setEditing(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem permissão de clipboard */
    }
  };

  return (
    <section className="team-editor">
      {editing ? (
        <>
          <label className="field">
            <span>Cole o time no formato de exportação do Showdown</span>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={EXAMPLE}
              rows={14}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <div className="row wrap gap-s">
            <button className="btn primary" disabled={!!preview.errors.length} onClick={save}>
              Salvar time
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Carregar arquivo .txt
            </button>
            {value && (
              <button className="btn ghost" onClick={() => { setDraft(value); setEditing(false); }}>
                Cancelar
              </button>
            )}
            <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={e => onFile(e.target.files?.[0])} />
          </div>
          {draft.trim() !== '' && <Messages errors={preview.errors} warnings={preview.warnings} />}
        </>
      ) : (
        <div className="row wrap gap-s">
          <button className="btn" onClick={() => { setDraft(value); setEditing(true); }}>
            {value ? 'Editar time' : 'Adicionar time'}
          </button>
          {value && <button className="btn ghost" onClick={copy}>{copied ? 'Copiado!' : 'Copiar texto'}</button>}
        </div>
      )}

      {shown.sets.length > 0 && (
        <>
          {editing && <h3 className="section-label">Prévia</h3>}
          <div className="poke-grid">
            {shown.sets.map((s, i) => <PokemonCard key={i} set={s} />)}
          </div>
        </>
      )}
    </section>
  );
}

function Messages({errors, warnings}: {errors: string[]; warnings: string[]}) {
  if (!errors.length && !warnings.length) return <p className="ok small">Time válido para a Gen 5.</p>;
  return (
    <div className="messages">
      {errors.map((e, i) => <p key={'e' + i} className="err small">✖ {e}</p>)}
      {warnings.map((w, i) => <p key={'w' + i} className="warn small">⚠ {w}</p>)}
    </div>
  );
}
