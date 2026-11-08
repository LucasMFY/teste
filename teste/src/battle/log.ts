/** Converte o protocolo do Showdown (battle.log) em mensagens em português. */

export type LogKind = 'turn' | 'move' | 'switch' | 'damage' | 'heal' | 'faint' | 'status' | 'effect' | 'minor' | 'win';

export interface LogEntry {
  kind: LogKind;
  text: string;
  side?: 'p1' | 'p2';
}

const STAT: Record<string, string> = {
  atk: 'Ataque', def: 'Defesa', spa: 'Ataque Especial', spd: 'Defesa Especial', spe: 'Velocidade',
  accuracy: 'Precisão', evasion: 'Evasão',
};

const STATUS_GOT: Record<string, string> = {
  brn: 'foi queimado!', par: 'foi paralisado!', slp: 'adormeceu!', frz: 'foi congelado!',
  psn: 'foi envenenado!', tox: 'foi gravemente envenenado!',
};
const STATUS_CURED: Record<string, string> = {
  brn: 'não está mais queimado.', par: 'não está mais paralisado.', slp: 'acordou!', frz: 'descongelou!',
  psn: 'não está mais envenenado.', tox: 'não está mais envenenado.',
};
const CANT: Record<string, string> = {
  slp: 'está dormindo.', par: 'está paralisado! Não consegue se mover!', frz: 'está congelado!',
  flinch: 'recuou e não conseguiu se mover!', recharge: 'precisa recarregar!', nopp: 'não tem PP para esse golpe!',
  Truant: 'está vadiando…', 'ability: Truant': 'está vadiando…', Attract: 'está apaixonado e não ataca!',
  'Focus Punch': 'perdeu a concentração e não conseguiu se mover!',
};
const WEATHER_START: Record<string, string> = {
  RainDance: 'Começou a chover!', SunnyDay: 'O sol ficou forte!', Sandstorm: 'Uma tempestade de areia começou!',
  Hail: 'Começou a cair granizo!',
};
const WEATHER_UPKEEP: Record<string, string> = {
  RainDance: 'A chuva continua.', SunnyDay: 'O sol continua forte.', Sandstorm: 'A tempestade de areia continua.',
  Hail: 'O granizo continua.',
};
const EFFECT_PT: Record<string, string> = {
  psn: 'veneno', tox: 'veneno', brn: 'queimadura', Recoil: 'recuo', recoil: 'recuo', confusion: 'confusão',
  Sandstorm: 'tempestade de areia', sandstorm: 'tempestade de areia', Hail: 'granizo', hail: 'granizo',
  drain: 'drenagem', partiallytrapped: 'aprisionamento',
};

const strip = (e: string) => e.replace(/^(item|ability|move|condition): /, '');
const effect = (e: string) => EFFECT_PT[strip(e)] ?? strip(e);

function parseHP(s: string | undefined): {hp: number; max: number} | null {
  if (!s) return null;
  const [frac] = s.split(' ');
  const [hp, max] = frac.split('/').map(Number);
  if (Number.isNaN(hp)) return null;
  return {hp, max: max || 0};
}

export function formatLog(lines: string[], names: {p1: string; p2: string}): LogEntry[] {
  const out: LogEntry[] = [];
  const hp = new Map<string, {hp: number; max: number}>();

  const key = (ident: string) => ident.replace(/^(p[12])[a-z]?: /, '$1: ');
  const sideOf = (ident: string) => (ident.startsWith('p2') ? 'p2' : 'p1') as 'p1' | 'p2';
  const mon = (ident: string | undefined) => {
    if (!ident) return '';
    const m = ident.match(/^(p[12])[a-z]?: (.*)$/);
    if (!m) return ident;
    return m[1] === 'p1' ? m[2] : `${m[2]} adversário`;
  };
  const sideLabel = (s: string) => (s.startsWith('p1') ? `time de ${names.p1}` : `time de ${names.p2}`);
  const push = (kind: LogKind, text: string, side?: 'p1' | 'p2') => out.push({kind, text, side});

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('|split|')) {
      // linha secreta (HP exato) seguida da pública (em %) — usamos a exata: visão total
      line = lines[i + 1] ?? '';
      i += 2;
      if (!line) continue;
    }
    if (!line.startsWith('|')) continue;
    const parts = line.slice(1).split('|');
    const cmd = parts[0];
    const args: string[] = [];
    const kw: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const m = p.match(/^\[(\w+)\]\s?(.*)$/);
      if (m) kw[m[1]] = m[2];
      else args.push(p);
    }
    const from = kw.from ? effect(kw.from) : '';
    const of = kw.of ? mon(kw.of) : '';
    const [a0, a1, a2] = args;
    const s = a0 ? sideOf(a0) : undefined;

    switch (cmd) {
      case 'turn':
        push('turn', `Turno ${a0}`);
        break;
      case 'switch':
      case 'drag': {
        const h = parseHP(a2);
        if (h) hp.set(key(a0), h);
        const species = a1?.split(',')[0];
        const name = a0.replace(/^p[12][a-z]?: /, '');
        const label = species && species !== name ? `${name} (${species})` : name;
        if (cmd === 'drag') push('switch', `${mon(a0)} foi arrastado para a batalha!`, s);
        else if (s === 'p1') push('switch', `Vai, ${label}!`, s);
        else push('switch', `${names.p2} enviou ${label}!`, s);
        break;
      }
      case 'replace':
        push('effect', `A ilusão acabou! Era ${mon(a0)}!`, s);
        break;
      case 'move': {
        const extra = from && from !== 'lockedmove' ? ` (${from})` : '';
        push('move', `${mon(a0)} usou ${a1}!${extra}`, s);
        break;
      }
      case 'cant': {
        const reason = CANT[a1] ?? CANT[strip(a1)];
        if (reason) push('status', `${mon(a0)} ${reason}`, s);
        else push('status', `${mon(a0)} não pode usar ${a2 || 'o golpe'} (${effect(a1)}).`, s);
        break;
      }
      case '-damage': {
        const prev = hp.get(key(a0));
        const now = parseHP(a1);
        if (!now) break;
        const max = now.max || prev?.max || 1;
        const lost = prev ? prev.hp - now.hp : 0;
        hp.set(key(a0), {hp: now.hp, max});
        const pct = Math.round((lost / max) * 100);
        const amount = lost > 0 ? ` perdeu ${lost} HP (${pct}%)` : ' foi atingido';
        const left = ` — ${now.hp}/${max}`;
        if (kw.from === 'confusion') push('damage', `${mon(a0)} se feriu na confusão e${amount}.${left}`, s);
        else if (from) push('damage', `${mon(a0)}${amount} por ${from}${of ? ` de ${of}` : ''}.${left}`, s);
        else push('damage', `${mon(a0)}${amount}.${left}`, s);
        break;
      }
      case '-heal': {
        const prev = hp.get(key(a0));
        const now = parseHP(a1);
        if (!now) break;
        const max = now.max || prev?.max || 1;
        const gained = prev ? now.hp - prev.hp : 0;
        hp.set(key(a0), {hp: now.hp, max});
        const pct = Math.round((gained / max) * 100);
        push('heal', `${mon(a0)} recuperou ${gained} HP (${pct}%)${from ? ` com ${from}` : ''}. — ${now.hp}/${max}`, s);
        break;
      }
      case '-sethp': {
        const now = parseHP(a1);
        if (now) hp.set(key(a0), now);
        push('effect', `O HP de ${mon(a0)} agora é ${now?.hp ?? a1}.`, s);
        break;
      }
      case 'faint':
        push('faint', `${mon(a0)} desmaiou!`, s);
        break;
      case '-status':
        push('status', `${mon(a0)} ${STATUS_GOT[a1] ?? `recebeu ${a1}`}${from ? ` (${from})` : ''}`, s);
        break;
      case '-curestatus':
        push('status', `${mon(a0)} ${STATUS_CURED[a1] ?? 'se curou.'}${from ? ` (${from})` : ''}`, s);
        break;
      case '-cureteam':
        push('status', `O time de ${mon(a0)} foi curado!`, s);
        break;
      case '-boost':
      case '-unboost': {
        const n = Number(a2);
        const st = STAT[a1] ?? a1;
        let verb: string;
        if (n === 0) verb = cmd === '-boost' ? 'não pode aumentar mais!' : 'não pode diminuir mais!';
        else if (cmd === '-boost') verb = n >= 3 ? 'aumentou drasticamente!' : n === 2 ? 'aumentou muito!' : 'aumentou!';
        else verb = n >= 3 ? 'diminuiu drasticamente!' : n === 2 ? 'diminuiu muito!' : 'diminuiu!';
        push('effect', `${st} de ${mon(a0)} ${verb}${from ? ` (${from})` : ''}`, s);
        break;
      }
      case '-setboost':
        push('effect', `${STAT[a1] ?? a1} de ${mon(a0)} agora é +${a2}${from ? ` (${from})` : ''}.`, s);
        break;
      case '-clearboost':
      case '-clearpositiveboost':
      case '-clearnegativeboost':
        push('effect', `As mudanças de atributo de ${mon(a0)} foram removidas.`, s);
        break;
      case '-clearallboost':
        push('effect', 'Todas as mudanças de atributo foram removidas!');
        break;
      case '-swapboost':
      case '-copyboost':
      case '-invertboost':
        push('effect', `${mon(a0)}: mudanças de atributo alteradas${from ? ` (${from})` : ''}.`, s);
        break;
      case '-weather':
        if (a0 === 'none') push('minor', 'O clima voltou ao normal.');
        else if ('upkeep' in kw) push('minor', WEATHER_UPKEEP[a0] ?? `${a0} continua.`);
        else push('effect', `${WEATHER_START[a0] ?? `${a0} começou!`}${from ? ` (${from}${of ? ` de ${of}` : ''})` : ''}`);
        break;
      case '-fieldstart':
        push('effect', `${effect(a0)} começou!`);
        break;
      case '-fieldend':
        push('effect', `${effect(a0)} acabou.`);
        break;
      case '-sidestart': {
        const e = effect(a1);
        const msg: Record<string, string> = {
          'Stealth Rock': `Pedras pontiagudas flutuam ao redor do ${sideLabel(a0)}!`,
          Spikes: `Espinhos foram espalhados ao redor do ${sideLabel(a0)}!`,
          'Toxic Spikes': `Espinhos venenosos foram espalhados ao redor do ${sideLabel(a0)}!`,
        };
        push('effect', msg[e] ?? `${e} protege o ${sideLabel(a0)}!`, sideOf(a0));
        break;
      }
      case '-sideend':
        push('effect', `${effect(a1)} acabou no ${sideLabel(a0)}${from ? ` (${from})` : ''}.`, sideOf(a0));
        break;
      case '-start': {
        const e = effect(a1);
        const msg: Record<string, string> = {
          confusion: 'ficou confuso!',
          Substitute: 'criou um substituto!',
          'Leech Seed': 'foi semeado!',
          Taunt: 'caiu na provocação!',
          Encore: 'recebeu um bis!',
          Yawn: 'ficou sonolento!',
          'Focus Energy': 'está se concentrando!',
          Attract: 'se apaixonou!',
          Curse: `foi amaldiçoado${of ? ` por ${of}` : ''}!`,
          'Magnet Rise': 'levitou com eletromagnetismo!',
          Torment: 'está sendo atormentado!',
          'Perish Song': 'ouviu a canção da morte!',
          Ingrain: 'fincou raízes!',
          'Aqua Ring': 'se envolveu num véu de água!',
          'Flash Fire': 'teve seus golpes de Fogo fortalecidos!',
          Stockpile: `acumulou energia (${a2 ?? ''})!`,
          Embargo: 'não pode usar itens!',
          'Heal Block': 'não pode se curar!',
          Nightmare: 'começou a ter pesadelos!',
          Charge: 'começou a carregar energia!',
          'Slow Start': 'não consegue se esforçar!',
        };
        if (e === 'typechange') push('effect', `${mon(a0)} agora é do tipo ${a2}!`, s);
        else if (/^perish\d$/.test(a1)) push('effect', `Contagem da Perish Song de ${mon(a0)}: ${a1.slice(-1)}`, s);
        else if (e === 'Disable') push('effect', `${a2} de ${mon(a0)} foi desabilitado!`, s);
        else push('effect', `${mon(a0)} ${msg[e] ?? `está sob efeito de ${e}.`}`, s);
        break;
      }
      case '-end': {
        const e = effect(a1);
        if (e === 'Substitute') push('effect', `O substituto de ${mon(a0)} se desfez!`, s);
        else if (e === 'confusion') push('effect', `${mon(a0)} não está mais confuso!`, s);
        else push('minor', `${mon(a0)}: ${e} terminou.`, s);
        break;
      }
      case '-item':
        if (kw.from?.includes('Frisk')) push('effect', `${of || 'O adversário'} identificou ${a1} de ${mon(a0)}.`, s);
        else push('effect', `${mon(a0)} obteve ${a1}${from ? ` (${from})` : ''}!`, s);
        break;
      case '-enditem':
        if ('eat' in kw) push('effect', `${mon(a0)} comeu ${a1}!`, s);
        else if (from) push('effect', `${mon(a0)} perdeu ${a1} (${from}).`, s);
        else push('effect', `${a1} de ${mon(a0)} foi usado.`, s);
        break;
      case '-ability':
        if (kw.from?.includes('Trace')) push('effect', `${mon(a0)} copiou ${a1} de ${of}!`, s);
        else push('effect', `[${a1} de ${mon(a0)}]`, s);
        break;
      case '-endability':
        push('effect', `A habilidade de ${mon(a0)} foi suprimida.`, s);
        break;
      case '-transform':
        push('effect', `${mon(a0)} se transformou em ${mon(a1)}!`, s);
        break;
      case '-formechange':
      case 'detailschange':
        push('effect', `${mon(a0)} mudou para ${a1.split(',')[0]}!`, s);
        break;
      case '-supereffective':
        push('minor', 'É super efetivo!');
        break;
      case '-resisted':
        push('minor', 'Não é muito efetivo…');
        break;
      case '-immune':
        push('minor', `Não afeta ${mon(a0)}…${from ? ` (${from})` : ''}`);
        break;
      case '-crit':
        push('minor', `Golpe crítico em ${mon(a0)}!`);
        break;
      case '-miss':
        push('minor', `O ataque de ${mon(a0)} errou!`);
        break;
      case '-fail':
        push('minor', 'Mas falhou!');
        break;
      case '-notarget':
        push('minor', 'Mas não havia alvo…');
        break;
      case '-nothing':
        push('minor', 'Mas nada aconteceu!');
        break;
      case '-ohko':
        push('minor', 'É um nocaute de um golpe só!');
        break;
      case '-hitcount':
        push('minor', `Acertou ${a1} vez(es)!`);
        break;
      case '-prepare':
        push('effect', `${mon(a0)} está se preparando para ${a1}!`, s);
        break;
      case '-singleturn':
      case '-singlemove':
        if (/Protect|Detect/.test(a1)) push('effect', `${mon(a0)} se protegeu!`, s);
        else push('minor', `${mon(a0)}: ${effect(a1)}.`, s);
        break;
      case '-activate': {
        const e = effect(a1);
        if (/Protect|Detect/.test(e)) push('effect', `${mon(a0)} se protegeu!`, s);
        else if (e === 'Substitute') push('effect', 'O substituto recebeu o dano!', s);
        else if (e === 'confusion') push('status', `${mon(a0)} está confuso!`, s);
        else if (e === 'Sturdy' || e === 'Focus Sash' || e === 'Endure') push('effect', `${mon(a0)} aguentou o golpe (${e})!`, s);
        else if (e === 'trapped') push('effect', `${mon(a0)} não pode escapar!`, s);
        else push('minor', `${mon(a0)}: ${e}${a2 ? ` (${a2})` : ''}`, s);
        break;
      }
      case '-message':
      case 'message':
        push('minor', a0);
        break;
      case '-hint':
        push('minor', `Dica: ${a0}`);
        break;
      case 'win':
        push('win', `${a0} venceu a batalha!`);
        break;
      case 'tie':
        push('win', 'Empate!');
        break;
      case 'error':
        push('minor', `Erro: ${a0}`);
        break;
      default:
        break; // linhas de controle (t:, gametype, player, poke, upkeep, ...)
    }
  }
  return out;
}
