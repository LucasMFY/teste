import {useEffect, useRef} from 'react';
import {dex} from '../lib/dex';
import {TYPE_COLOR} from '../lib/types';
import type {FieldView, MonView, MoveView, SideView} from '../battle/engine';
import type {LogEntry} from '../battle/log';
import {PokemonCard, Sprite, TypeBadge} from './Pokemon';

export const STATUS_LABEL: Record<string, [string, string]> = {
  brn: ['QUE', '#e2703a'],
  par: ['PAR', '#c9a400'],
  slp: ['DOR', '#8c8c8c'],
  frz: ['CON', '#3db8e0'],
  psn: ['ENV', '#9b4fc4'],
  tox: ['TOX', '#7a2fa8'],
  fnt: ['KO', '#555'],
};

const BOOST_LABEL: Record<string, string> = {
  atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Prec', evasion: 'Eva',
};

const WEATHER_LABEL: Record<string, string> = {
  raindance: 'Chuva', sunnyday: 'Sol forte', sandstorm: 'Tempestade de areia', hail: 'Granizo',
};

const HIDDEN_VOLATILES = new Set(['stall', 'lockedmove', 'twoturnmove', 'mustrecharge']);

const condName = (id: string) => dex.conditions.get(id).name || id;

export function StatusBadge({status}: {status: string}) {
  const s = STATUS_LABEL[status];
  if (!s) return null;
  return <span className="status" style={{background: s[1]}}>{s[0]}</span>;
}

export function HpBar({hp, maxhp, big}: {hp: number; maxhp: number; big?: boolean}) {
  const pct = maxhp ? Math.max(0, Math.min(100, (hp / maxhp) * 100)) : 0;
  const color = pct > 50 ? 'var(--hp-good)' : pct > 20 ? 'var(--hp-mid)' : 'var(--hp-low)';
  return (
    <div className={`hp ${big ? 'hp-big' : ''}`} title={`${hp}/${maxhp}`}>
      <div style={{width: `${pct}%`, background: color}} />
    </div>
  );
}

export function ActiveMon({mon, back, onInspect}: {mon: MonView | null; back?: boolean; onInspect(m: MonView): void}) {
  if (!mon) return <div className="active empty muted small">Nenhum Pokémon em campo</div>;
  return (
    <button className="active" onClick={() => onInspect(mon)}>
      <Sprite species={mon.species} shiny={mon.shiny} size={96} back={back} />
      <div className="active-info">
        <div className="row wrap gap-s">
          <strong>{mon.name}</strong>
          {mon.gender !== 'N' && <span className={`gender g-${mon.gender}`}>{mon.gender === 'M' ? '♂' : '♀'}</span>}
          <span className="lv">Nv. {mon.level}</span>
          <StatusBadge status={mon.status} />
        </div>
        <HpBar hp={mon.hp} maxhp={mon.maxhp} big />
        <div className="row between small">
          <span className="strong">{mon.hp}/{mon.maxhp} HP</span>
          <span className="muted">{Math.round((mon.hp / mon.maxhp) * 100)}%</span>
        </div>
        <div className="row wrap gap-s">
          {mon.types.map(t => <TypeBadge key={t} type={t} />)}
          {Object.entries(mon.boosts).map(([k, v]) => (
            <span key={k} className={`chip ${v > 0 ? 'chip-up' : 'chip-down'}`}>
              {v > 0 ? '+' : ''}{v} {BOOST_LABEL[k] ?? k}
            </span>
          ))}
          {mon.volatiles.filter(v => !HIDDEN_VOLATILES.has(v)).map(v => (
            <span key={v} className="chip">{condName(v)}</span>
          ))}
        </div>
        <div className="muted small">{mon.item || 'sem item'} · {mon.ability}</div>
      </div>
    </button>
  );
}

export function Bench({side, onInspect}: {side: SideView; onInspect(m: MonView): void}) {
  return (
    <div className="bench">
      {side.mons.map(m => (
        <button
          key={m.slot}
          className={`bench-mon ${m.fainted ? 'fainted' : ''} ${m.active ? 'is-active' : ''}`}
          onClick={() => onInspect(m)}
          title={`${m.name} ${m.hp}/${m.maxhp}`}
        >
          <Sprite species={m.species} shiny={m.shiny} size={40} />
          <HpBar hp={m.hp} maxhp={m.maxhp} />
          {m.status && m.status !== 'fnt' && <StatusBadge status={m.status} />}
        </button>
      ))}
    </div>
  );
}

export function SideHeader({side, foe}: {side: SideView; foe?: boolean}) {
  const left = side.mons.filter(m => !m.fainted).length;
  return (
    <div className="row between wrap gap-s side-header">
      <div className="row gap-s">
        <strong>{side.name}</strong>
        <span className="muted small">{foe ? 'IA' : 'você'} · {left}/{side.mons.length} de pé</span>
      </div>
      <div className="row wrap gap-s">
        {side.conditions.map(c => (
          <span key={c.id} className="chip chip-hazard">
            {c.name}{c.layers > 1 ? ` ×${c.layers}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FieldBar({field}: {field: FieldView}) {
  return (
    <div className="field-bar row wrap gap-s">
      <strong>Turno {field.turn}</strong>
      {field.weather && <span className="chip">{WEATHER_LABEL[field.weather] ?? condName(field.weather)}</span>}
      {field.pseudo.map(p => <span key={p} className="chip">{condName(p)}</span>)}
    </div>
  );
}

const effLabel = (m: number | undefined) =>
  m === undefined ? '' : m === 0 ? 'Imune' : m >= 4 ? '4×' : m >= 2 ? '2×' : m <= 0.25 ? '¼×' : m <= 0.5 ? '½×' : '';

export function MoveButton({
  move,
  eff,
  estimate,
  disabled,
  onClick,
}: {
  move: MoveView;
  eff?: number;
  estimate?: number;
  disabled: boolean;
  onClick(): void;
}) {
  const isStatus = move.category === 'Status';
  const label = isStatus ? '' : effLabel(eff);
  return (
    <button
      className="move-btn"
      style={{borderColor: TYPE_COLOR[move.type] ?? '#777', ['--tc' as any]: TYPE_COLOR[move.type] ?? '#777'}}
      disabled={disabled || move.disabled || move.pp <= 0}
      onClick={onClick}
    >
      <span className="move-name">{move.name}</span>
      <span className="move-meta">
        <span>{move.type}</span>
        <span>{isStatus ? 'Status' : `${move.category === 'Physical' ? 'Fís' : 'Esp'} ${move.basePower || '—'}`}</span>
        <span>PP {move.pp}/{move.maxpp}</span>
      </span>
      {(label || (estimate !== undefined && !isStatus)) && (
        <span className="move-eff">
          {label && <span className={`eff eff-${label === 'Imune' ? 0 : eff! > 1 ? 'up' : 'down'}`}>{label}</span>}
          {estimate !== undefined && !isStatus && eff !== 0 && (
            <span className="muted" title="Estimativa aproximada (sem crítico, clima ou boosts)">
              {estimate >= 1 ? '≥100%' : `≈${Math.round(estimate * 100)}%`}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

export function LogPanel({entries, className = ''}: {entries: LogEntry[]; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  return (
    <div className={`log ${className}`} ref={ref}>
      {entries.map((e, i) => (
        <div key={i} className={`log-${e.kind} ${e.side ? `log-${e.side}` : ''}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

/** Ficha completa + estado atual em batalha. */
export function InspectModal({mon, onClose}: {mon: MonView; onClose(): void}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row between">
          <h2>{mon.name}</h2>
          <button className="btn ghost" onClick={onClose}>Fechar</button>
        </div>
        <div className="card live">
          <div className="row wrap gap-s">
            <span className="strong">{mon.hp}/{mon.maxhp} HP</span>
            <StatusBadge status={mon.status} />
            {mon.active && <span className="chip">em campo</span>}
          </div>
          <HpBar hp={mon.hp} maxhp={mon.maxhp} />
          <div className="small">
            Item atual: <strong>{mon.item || '—'}</strong> · Habilidade: <strong>{mon.ability}</strong>
          </div>
          <div className="small">
            Golpes: {mon.moves.map(m => `${m.name} (${m.pp}/${m.maxpp})`).join(' · ')}
          </div>
          {Object.keys(mon.boosts).length > 0 && (
            <div className="small">
              Modificadores:{' '}
              {Object.entries(mon.boosts).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${BOOST_LABEL[k] ?? k}`).join(', ')}
            </div>
          )}
        </div>
        <PokemonCard set={mon.set} />
      </div>
    </div>
  );
}
