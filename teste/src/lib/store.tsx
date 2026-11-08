import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {MAX_HISTORY, loadData, loadSession, saveData, saveSession, uid} from './storage';
import type {AppData, BattleRecord, BattleSession, Trainer} from './storage';

interface Store {
  data: AppData;
  saveOk: boolean;
  setPlayerName(name: string): void;
  setPlayerTeam(teamText: string): void;
  addOpponent(t: Pick<Trainer, 'name' | 'teamText' | 'notes' | 'aiLevel'>): string;
  updateOpponent(id: string, patch: Partial<Pick<Trainer, 'name' | 'teamText' | 'notes' | 'aiLevel'>>): void;
  deleteOpponent(id: string): void;
  moveOpponent(id: string, delta: -1 | 1): void;
  setSyncUrl(url: string): void;
  replaceAll(d: AppData): void;
  addHistory(r: BattleRecord): void;
  deleteHistory(id: string): void;
  clearHistory(): void;
  session: BattleSession | null;
  setSession(s: BattleSession | null): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({children}: {children: ReactNode}) {
  const [data, setData] = useState<AppData>(loadData);
  const [saveOk, setSaveOk] = useState(true);
  const [session, setSessionState] = useState<BattleSession | null>(loadSession);
  const setSession = useCallback((s: BattleSession | null) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  // salva a cada alteração
  useEffect(() => setSaveOk(saveData(data)), [data]);

  // se o app estiver aberto em duas abas, mantém sincronizado
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('lenda:data')) setData(loadData());
      if (e.key?.startsWith('lenda:session')) setSessionState(loadSession());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const patch = useCallback((fn: (d: AppData) => AppData) => setData(d => fn(d)), []);

  const store = useMemo<Store>(
    () => ({
      data,
      saveOk,
      setPlayerName: name => patch(d => ({...d, player: {...d.player, name}})),
      setPlayerTeam: teamText => patch(d => ({...d, player: {...d.player, teamText}})),
      addOpponent: t => {
        const id = uid();
        const now = Date.now();
        patch(d => ({...d, opponents: [...d.opponents, {...t, id, createdAt: now, updatedAt: now}]}));
        return id;
      },
      updateOpponent: (id, p) =>
        patch(d => ({
          ...d,
          opponents: d.opponents.map(o => (o.id === id ? {...o, ...p, updatedAt: Date.now()} : o)),
        })),
      deleteOpponent: id => patch(d => ({...d, opponents: d.opponents.filter(o => o.id !== id)})),
      moveOpponent: (id, delta) =>
        patch(d => {
          const list = [...d.opponents];
          const i = list.findIndex(o => o.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= list.length) return d;
          [list[i], list[j]] = [list[j], list[i]];
          return {...d, opponents: list};
        }),
      setSyncUrl: url => patch(d => ({...d, settings: {...d.settings, syncUrl: url}})),
      replaceAll: nd => setData(nd),
      addHistory: r => patch(d => ({...d, history: [r, ...d.history.filter(h => h.id !== r.id)].slice(0, MAX_HISTORY)})),
      deleteHistory: id => patch(d => ({...d, history: d.history.filter(h => h.id !== id)})),
      clearHistory: () => patch(d => ({...d, history: []})),
      session,
      setSession,
    }),
    [data, saveOk, patch, session, setSession],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}
