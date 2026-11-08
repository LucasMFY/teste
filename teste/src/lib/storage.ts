/**
 * Persistência local. Tudo fica no navegador (localStorage), por dispositivo,
 * e sobrevive a fechar o app. Para levar os dados entre PC e celular:
 *  - exportar/importar um arquivo .json (backup), ou
 *  - carregar de uma URL pública (ex.: JSON "raw" num repositório do GitHub) — somente leitura.
 */

export type Difficulty = 'facil' | 'normal' | 'dificil';
export type Result = 'win' | 'loss' | 'draw';

export interface Trainer {
  id: string;
  name: string;
  teamText: string; // time no formato Showdown, com todos os campos explícitos
  notes: string;
  aiLevel: Difficulty;
  createdAt: number;
  updatedAt: number;
}

export interface MonSummary {
  species: string;
  name: string;
  hp: number;
  maxhp: number;
  status: string;
}

export interface BattleRecord {
  id: string;
  opponentId: string;
  opponentName: string;
  playerName: string;
  mode: BattleMode;
  aiLevel: Difficulty;
  result: Result;
  forfeit: boolean;
  turns: number;
  myTeam: MonSummary[];
  oppTeam: MonSummary[];
  log: {kind: string; text: string; side?: string}[];
  date: number;
}

export type BattleMode = 'single' | 'gauntlet' | 'random';

/** Batalha (ou sequência) em andamento — guardada à parte, fora do backup. */
export interface BattleSession {
  id: string;
  mode: BattleMode;
  queue: string[]; // ids dos adversários
  index: number;
  results: Result[];
  inputLog: string[]; // seed + times + escolhas: reconstrói a batalha exatamente
  opponentId: string;
  opponentName: string;
  aiLevel: Difficulty;
  recorded: boolean;
  forfeited?: boolean;
  oppTeamText?: string; // modo aleatório: o time sorteado (fica fixo na revanche)
}

export const MAX_HISTORY = 300;

export interface AppData {
  version: 1;
  player: {name: string; teamText: string};
  opponents: Trainer[]; // a ordem aqui é a ordem do modo "todos em sequência"
  history: BattleRecord[];
  settings: {syncUrl: string};
}

const KEY = 'lenda:data:v1';

export const emptyData = (): AppData => ({
  version: 1,
  player: {name: '', teamText: ''},
  opponents: [],
  history: [],
  settings: {syncUrl: ''},
});

export function uid(): string {
  // crypto.randomUUID só existe em contexto seguro (https/localhost); no celular via IP local não.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Valida/normaliza um objeto qualquer (arquivo importado, URL) para AppData. */
export function coerceData(input: unknown): AppData {
  if (!input || typeof input !== 'object') throw new Error('O conteúdo não é um objeto JSON.');
  const o = input as Record<string, any>;
  const base = emptyData();
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const now = Date.now();

  if (o.player && typeof o.player === 'object') {
    base.player.name = str(o.player.name);
    base.player.teamText = str(o.player.teamText);
  }
  if (Array.isArray(o.opponents)) {
    base.opponents = o.opponents
      .filter((t: any) => t && typeof t === 'object')
      .map((t: any) => ({
        id: str(t.id) || uid(),
        name: str(t.name, 'Sem nome'),
        teamText: str(t.teamText),
        notes: str(t.notes),
        aiLevel: (['facil', 'normal', 'dificil'].includes(t.aiLevel) ? t.aiLevel : 'dificil') as Difficulty,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : now,
        updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : now,
      }));
  }
  if (Array.isArray(o.history)) {
    base.history = o.history
      .filter((h: any) => h && typeof h === 'object' && typeof h.id === 'string' && Array.isArray(h.log))
      .slice(0, MAX_HISTORY);
  }
  if (o.settings && typeof o.settings === 'object') base.settings.syncUrl = str(o.settings.syncUrl);
  return base;
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerceData(JSON.parse(raw)) : emptyData();
  } catch (e) {
    console.error('Falha ao ler dados salvos', e);
    return emptyData();
  }
}

export function saveData(d: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    console.error('Falha ao salvar', e);
    return false;
  }
}

const SESSION_KEY = 'lenda:session:v1';

export function loadSession(): BattleSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && Array.isArray(s.inputLog) ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: BattleSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.error('Falha ao salvar a batalha', e);
  }
}

/** Pede ao navegador para não apagar os dados quando faltar espaço (importante no celular). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function downloadJson(d: AppData) {
  const blob = new Blob([JSON.stringify(d, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `lenda-backup-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Converte links "blob" do GitHub para "raw" automaticamente. */
export function normalizeGithubUrl(url: string): string {
  const m = url.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url.trim();
}

export async function fetchDataFromUrl(url: string): Promise<AppData> {
  const res = await fetch(normalizeGithubUrl(url), {cache: 'no-store'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return coerceData(await res.json());
}
