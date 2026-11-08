import {Dex, Teams} from '@pkmn/sim';
import type {StatID, StatsTable} from '@pkmn/sim';
import {Sprites} from '@pkmn/img';

/** Dados da Gen 5 (BW2) — o mod "gen5" do Showdown já desfaz as mudanças das gerações seguintes
 *  (tipos Fada, base stats alterados na Gen 6+, etc.). Tudo vem empacotado: funciona offline. */
export const dex = Dex.forGen(5);

type ImportedSet = NonNullable<ReturnType<typeof Teams.import>>[number];

export const STATS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABEL: Record<StatID, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export type Gender = 'M' | 'F' | 'N';

/** Set com todos os campos preenchidos (sem "padrões implícitos"), para exibir e para a IA ver tudo. */
export interface FullSet {
  name: string; // apelido (vazio = nome da espécie)
  species: string;
  item: string;
  ability: string;
  moves: string[];
  nature: string;
  gender: Gender;
  level: number;
  evs: StatsTable;
  ivs: StatsTable;
  shiny: boolean;
  happiness: number;
}

export interface TeamParseResult {
  sets: FullSet[];
  errors: string[];
  warnings: string[];
}

const fill = (v: number, partial?: Partial<StatsTable>): StatsTable => {
  const out = {} as StatsTable;
  for (const s of STATS) out[s] = partial?.[s] ?? v;
  return out;
};

const isGen5 = (e: {exists: boolean; isNonstandard?: string | null; gen: number}) =>
  e.exists && e.gen <= 5 && e.isNonstandard !== 'Future';

/** Sorteio "estável": mesma espécie/apelido/posição => mesmo gênero (a prévia não muda a cada tecla). */
function pickGender(speciesName: string, seed: string): Gender {
  const sp = dex.species.get(speciesName);
  if (sp.gender) return sp.gender as Gender;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const roll = (h >>> 0) / 2 ** 32;
  return roll < (sp.genderRatio?.M ?? 0.5) ? 'M' : 'F';
}

/**
 * Lê um time no formato de exportação do Showdown.
 * Não verifica legalidade (learnset, cláusulas…), só se as coisas existem na Gen 5,
 * porque o motor gen5 não sabe lidar com espécies/moves/itens de gerações futuras.
 */
export function parseTeam(text: string): TeamParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = text.trim() ? Teams.import(text) ?? [] : [];
  const sets: FullSet[] = [];

  if (!raw.length) errors.push('Nenhum Pokémon encontrado no texto.');
  if (raw.length > 6) errors.push(`O time tem ${raw.length} Pokémon (máximo 6).`);

  raw.forEach((r: ImportedSet, i) => {
    const label = `#${i + 1} ${r.species || '?'}`;
    const sp = dex.species.get(r.species);
    if (!sp.exists) {
      errors.push(`${label}: espécie desconhecida.`);
      return;
    }
    if (!isGen5(sp)) errors.push(`${label}: ${sp.name} não existe na Gen 5.`);

    let ability = r.ability ?? '';
    if (!ability) {
      ability = sp.abilities[0];
      warnings.push(`${label}: sem habilidade — usando ${ability}.`);
    } else {
      const ab = dex.abilities.get(ability);
      if (!ab.exists) errors.push(`${label}: habilidade "${ability}" desconhecida.`);
      else if (!isGen5(ab)) errors.push(`${label}: habilidade ${ab.name} não existe na Gen 5.`);
      else ability = ab.name;
    }

    let item = r.item ?? '';
    if (item) {
      const it = dex.items.get(item);
      if (!it.exists) errors.push(`${label}: item "${item}" desconhecido.`);
      else if (!isGen5(it)) errors.push(`${label}: item ${it.name} não existe na Gen 5.`);
      else item = it.name;
    }

    const moves: string[] = [];
    for (const m of r.moves ?? []) {
      const mv = dex.moves.get(m);
      if (!mv.exists) errors.push(`${label}: golpe "${m}" desconhecido.`);
      else if (!isGen5(mv)) errors.push(`${label}: golpe ${mv.name} não existe na Gen 5.`);
      moves.push(mv.exists ? mv.name : m);
    }
    if (!moves.length) errors.push(`${label}: precisa de pelo menos 1 golpe.`);
    if (moves.length > 4) errors.push(`${label}: tem ${moves.length} golpes (máximo 4).`);

    let nature = r.nature ?? '';
    if (!nature) nature = 'Serious';
    else {
      const n = dex.natures.get(nature);
      if (!n.exists) errors.push(`${label}: natureza "${nature}" desconhecida.`);
      else nature = n.name;
    }

    const level = r.level || 100;
    if (level < 1 || level > 100) errors.push(`${label}: level ${level} inválido.`);

    const evs = fill(0, r.evs);
    const ivs = fill(31, r.ivs);
    const evTotal = STATS.reduce((a, s) => a + evs[s], 0);
    if (STATS.some(s => evs[s] < 0 || evs[s] > 255)) errors.push(`${label}: cada EV deve ficar entre 0 e 255.`);
    if (evTotal > 510) warnings.push(`${label}: total de EVs ${evTotal} (> 510).`);
    if (STATS.some(s => ivs[s] < 0 || ivs[s] > 31)) errors.push(`${label}: cada IV deve ficar entre 0 e 31.`);

    let gender = (r.gender as Gender) || '';
    if (sp.gender) {
      if (gender && gender !== sp.gender) warnings.push(`${label}: ${sp.name} só pode ser ${sp.gender}.`);
      gender = sp.gender as Gender;
    } else if (gender !== 'M' && gender !== 'F') {
      // sorteia agora e grava no time, para os dois lados verem o gênero exato antes da batalha
      gender = pickGender(sp.name, `${i}|${sp.id}|${r.name}`);
      warnings.push(`${label}: gênero não informado — definido como ${gender === 'M' ? '♂' : '♀'}.`);
    }

    sets.push({
      name: r.name && r.name !== sp.name ? r.name : '',
      species: sp.name,
      item,
      ability,
      moves,
      nature,
      gender: gender as Gender,
      level,
      evs,
      ivs,
      shiny: !!r.shiny,
      happiness: r.happiness ?? 255,
    });
  });

  return {sets, errors, warnings};
}

/** Exporta de volta para texto Showdown, com todos os campos explícitos. */
export function exportTeam(sets: FullSet[]): string {
  return sets
    .map(s => {
      const head = `${s.name ? `${s.name} (${s.species})` : s.species}${s.gender !== 'N' ? ` (${s.gender})` : ''}${s.item ? ` @ ${s.item}` : ''}`;
      const evs = STATS.filter(k => s.evs[k]).map(k => `${s.evs[k]} ${STAT_LABEL[k]}`);
      const ivs = STATS.filter(k => s.ivs[k] !== 31).map(k => `${s.ivs[k]} ${STAT_LABEL[k]}`);
      return [
        head,
        `Ability: ${s.ability}`,
        s.level !== 100 ? `Level: ${s.level}` : '',
        s.shiny ? 'Shiny: Yes' : '',
        s.happiness !== 255 ? `Happiness: ${s.happiness}` : '',
        evs.length ? `EVs: ${evs.join(' / ')}` : '',
        `${s.nature} Nature`,
        ivs.length ? `IVs: ${ivs.join(' / ')}` : '',
        ...s.moves.map(m => `- ${m}`),
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/** Fórmula de stats da Gen 3+ (igual à Gen 5). */
export function calcStats(s: FullSet): StatsTable {
  const sp = dex.species.get(s.species);
  const nat = dex.natures.get(s.nature);
  const out = {} as StatsTable;
  for (const k of STATS) {
    const base = sp.baseStats[k];
    const core = Math.floor(((2 * base + s.ivs[k] + Math.floor(s.evs[k] / 4)) * s.level) / 100);
    if (k === 'hp') {
      out.hp = sp.id === 'shedinja' ? 1 : core + s.level + 10;
    } else {
      const mod = nat.plus === k ? 1.1 : nat.minus === k ? 0.9 : 1;
      out[k] = Math.floor((core + 5) * mod);
    }
  }
  return out;
}

export function speciesInfo(name: string) {
  const sp = dex.species.get(name);
  return {name: sp.name, types: sp.types, baseStats: sp.baseStats, num: sp.num};
}

export function moveInfo(name: string) {
  const m = dex.moves.get(name);
  return {name: m.name, type: m.type, category: m.category, basePower: m.basePower, accuracy: m.accuracy, pp: m.pp};
}

export function natureInfo(name: string) {
  const n = dex.natures.get(name);
  return {plus: n.plus as StatID | undefined, minus: n.minus as StatID | undefined};
}

export function spriteUrl(species: string, shiny = false, back = false) {
  return Sprites.getPokemon(species, {gen: 'gen5', shiny, side: back ? 'p1' : 'p2'}).url;
}
