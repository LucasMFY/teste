import {useStore} from '../lib/store';
import {TeamEditor} from '../components/TeamEditor';

export function MyTeam() {
  const {data, setPlayerTeam} = useStore();
  return (
    <div className="stack">
      <h1>Meu time</h1>
      <p className="muted small">
        Campos omitidos recebem os padrões do Showdown (Nv. 100, IVs 31, EVs 0, natureza Serious, 1ª habilidade).
        Gênero não informado é sorteado e gravado — assim você e a IA veem exatamente o mesmo time.
      </p>
      <TeamEditor value={data.player.teamText} onSave={setPlayerTeam} />
    </div>
  );
}
