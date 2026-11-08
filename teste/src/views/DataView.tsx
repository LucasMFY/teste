import {useEffect, useRef, useState} from 'react';
import {useStore} from '../lib/store';
import {coerceData, downloadJson, fetchDataFromUrl, requestPersistence} from '../lib/storage';
import type {AppData} from '../lib/storage';
import {ConfirmButton} from '../components/ConfirmButton';

type Msg = {kind: 'ok' | 'err'; text: string} | null;

export function DataView() {
  const {data, replaceAll, setSyncUrl, saveOk} = useStore();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const summary = (d: AppData) =>
    `${d.player.name || 'sem nome'}, ${d.player.teamText ? 'com time' : 'sem time'}, ${d.opponents.length} adversário(s), ${d.history.length} batalha(s)`;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(coerceData(JSON.parse(await f.text())));
      setMsg(null);
    } catch (e) {
      setMsg({kind: 'err', text: `Arquivo inválido: ${(e as Error).message}`});
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const fromUrl = async () => {
    setLoading(true);
    try {
      setPending(await fetchDataFromUrl(data.settings.syncUrl));
      setMsg(null);
    } catch (e) {
      setMsg({kind: 'err', text: `Não foi possível carregar: ${(e as Error).message}`});
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!pending) return;
    // mantém a URL configurada neste dispositivo
    replaceAll({...pending, settings: {...pending.settings, syncUrl: data.settings.syncUrl}});
    setPending(null);
    setMsg({kind: 'ok', text: 'Dados substituídos.'});
  };

  return (
    <div className="stack">
      <h1>Dados e backup</h1>

      <section className="card stack">
        <h2>Neste dispositivo</h2>
        <p className="small">
          Tudo é salvo automaticamente no navegador e continua lá depois de fechar o app.
          {!saveOk && <strong className="err"> Atenção: o último salvamento falhou (armazenamento cheio ou bloqueado).</strong>}
        </p>
        <p className="small muted">Atual: {summary(data)}.</p>
        <p className="small">
          Armazenamento persistente:{' '}
          {persisted === true ? <span className="ok">ativo</span> : persisted === false ? <span className="warn">não garantido</span> : 'desconhecido'}
          {persisted !== true && (
            <button className="btn small-btn" onClick={async () => setPersisted(await requestPersistence())}>Pedir ao navegador</button>
          )}
        </p>
        <p className="small muted">
          No celular, instale o app ("Adicionar à tela inicial") — apps instalados raramente têm os dados apagados.
        </p>
      </section>

      <section className="card stack">
        <h2>Backup em arquivo</h2>
        <p className="small muted">Exporte num aparelho e importe no outro para levar seus times entre PC e celular.</p>
        <div className="row wrap gap-s">
          <button className="btn primary" onClick={() => downloadJson(data)}>Exportar .json</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar .json</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
        </div>
      </section>

      <section className="card stack">
        <h2>Carregar de uma URL (GitHub)</h2>
        <p className="small muted">
          Coloque o backup .json num repositório público e cole o link do arquivo (o link normal do GitHub é convertido para
          "raw" automaticamente). Somente leitura: edições feitas aqui não voltam para o GitHub.
        </p>
        <label className="field">
          <span>URL do JSON</span>
          <input
            value={data.settings.syncUrl}
            onChange={e => setSyncUrl(e.target.value)}
            placeholder="https://github.com/usuario/repo/blob/main/lenda.json"
            inputMode="url"
            autoCapitalize="off"
          />
        </label>
        <div>
          <button className="btn" disabled={!data.settings.syncUrl.trim() || loading} onClick={fromUrl}>
            {loading ? 'Carregando…' : 'Carregar da URL'}
          </button>
        </div>
      </section>

      {pending && (
        <section className="card stack highlight">
          <h2>Substituir dados?</h2>
          <p className="small">Novo: {summary(pending)}.</p>
          <p className="small warn">Isso apaga os dados atuais deste dispositivo. Exporte um backup antes, se quiser.</p>
          <div className="row gap-s">
            <ConfirmButton className="btn danger" onConfirm={apply} confirmLabel="Toque de novo para confirmar">Substituir</ConfirmButton>
            <button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'err'}>{msg.text}</p>}
    </div>
  );
}
