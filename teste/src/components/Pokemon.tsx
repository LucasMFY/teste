import {useState} from 'react';
import {STATS, STAT_LABEL, calcStats, moveInfo, natureInfo, speciesInfo, spriteUrl} from '../lib/dex';
import type {FullSet} from '../lib/dex';
import {TYPE_COLOR, TYPE_PT} from '../lib/types';

export function Sprite({species, shiny, size = 96, back}: {species: string; shiny?: boolean; size?: number; back?: boolean}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="sprite-fallback" style={{width: size, height: size}} title="Sprite indisponível offline">
        {species.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      className="sprite"
      src={spriteUrl(species, shiny, back)}
      alt={species}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function TypeBadge({type}: {type: string}) {
  return (
    <span className="type" style={{background: TYPE_COLOR[type] ?? '#777'}}>
      {TYPE_PT[type] ?? type}
    </span>
  );
}

const GENDER_ICON = {M: '♂', F: '♀', N: ''} as const;

/** Ficha completa: tudo o que os dois lados podem ver (regra de visibilidade total). */
export function PokemonCard({set}: {set: FullSet}) {
  const info = speciesInfo(set.species);
  const stats = calcStats(set);
  const nat = natureInfo(set.nature);

  return (
    <article className="poke">
      <header className="poke-head">
        <Sprite species={set.species} shiny={set.shiny} />
        <div className="poke-title">
          <h3>
            {set.name || set.species}
            {set.gender !== 'N' && <span className={`gender g-${set.gender}`}>{GENDER_ICON[set.gender]}</span>}
            {set.shiny && <span title="Shiny"> ★</span>}
          </h3>
          {set.name && <div className="muted">{set.species}</div>}
          <div className="row gap-s">
            <span className="lv">Nv. {set.level}</span>
            {info.types.map(t => <TypeBadge key={t} type={t} />)}
          </div>
        </div>
      </header>

      <dl className="poke-meta">
        <div><dt>Item</dt><dd>{set.item || '—'}</dd></div>
        <div><dt>Habilidade</dt><dd>{set.ability}</dd></div>
        <div>
          <dt>Natureza</dt>
          <dd>
            {set.nature}
            {nat.plus && nat.minus && (
              <span className="muted"> (+{STAT_LABEL[nat.plus]} −{STAT_LABEL[nat.minus]})</span>
            )}
          </dd>
        </div>
      </dl>

      <ul className="moves">
        {set.moves.map(m => {
          const mi = moveInfo(m);
          return (
            <li key={m} style={{borderLeftColor: TYPE_COLOR[mi.type] ?? '#777'}}>
              <span>{mi.name}</span>
              <span className="muted small">
                {mi.category === 'Status' ? 'Status' : `${mi.category === 'Physical' ? 'Fís.' : 'Esp.'} ${mi.basePower || '—'}`}
              </span>
            </li>
          );
        })}
      </ul>

      <table className="stats">
        <thead>
          <tr><th></th><th>Base</th><th>IV</th><th>EV</th><th>Total</th><th className="bar-col"></th></tr>
        </thead>
        <tbody>
          {STATS.map(k => {
            const cls = nat.plus === k ? 'up' : nat.minus === k ? 'down' : '';
            return (
              <tr key={k} className={cls}>
                <th>{STAT_LABEL[k]}</th>
                <td>{info.baseStats[k]}</td>
                <td>{set.ivs[k]}</td>
                <td>{set.evs[k]}</td>
                <td className="strong">{stats[k]}</td>
                <td className="bar-col">
                  <div className="bar"><div style={{width: `${Math.min(100, (stats[k] / (k === 'hp' ? 714 : 504)) * 100)}%`}} /></div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

/** Linha compacta de sprites (para listas). */
export function TeamStrip({sets, size = 48}: {sets: FullSet[]; size?: number}) {
  if (!sets.length) return <span className="muted small">Sem time</span>;
  return (
    <div className="strip">
      {sets.map((s, i) => (
        <Sprite key={i} species={s.species} shiny={s.shiny} size={size} />
      ))}
    </div>
  );
}
