import {useEffect} from 'react';
import {useRoute} from './lib/router';
import {useStore} from './lib/store';
import {requestPersistence} from './lib/storage';
import {Home} from './views/Home';
import {MyTeam} from './views/MyTeam';
import {OpponentEdit, OpponentList} from './views/Opponents';
import {DataView} from './views/DataView';
import {BattleSetup} from './views/BattleSetup';
import {BattleView} from './views/BattleView';
import {HistoryDetail, HistoryList} from './views/History';

export function App() {
  const route = useRoute();
  const {data} = useStore();

  useEffect(() => {
    requestPersistence();
  }, []);

  let view;
  const [a, b] = route;
  if (a === 'time') view = <MyTeam />;
  else if (a === 'adversarios' && b) view = <OpponentEdit key={b} id={b} />;
  else if (a === 'adversarios') view = <OpponentList />;
  else if (a === 'dados') view = <DataView />;
  else if (a === 'batalhar') view = <BattleSetup />;
  else if (a === 'batalha') view = <BattleView />;
  else if (a === 'historico' && b) view = <HistoryDetail id={b} />;
  else if (a === 'historico') view = <HistoryList />;
  else view = <Home />;

  return (
    <>
      <header className="topbar">
        {route.length > 0 ? (
          <button className="btn ghost back" onClick={() => history.length > 1 ? history.back() : (location.hash = '#/')}>
            ‹ Voltar
          </button>
        ) : (
          <span />
        )}
        <a href="#/" className="brand">Lenda</a>
        <span className="muted small player">{data.player.name}</span>
      </header>
      <main className={a === 'batalha' ? 'container wide' : 'container'}>{view}</main>
    </>
  );
}
