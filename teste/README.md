# Lenda — batalhas Pokémon Gen 5 (BW2 Ubers) contra IA

App web estático (React + Vite + TypeScript), instalável como PWA no PC e no celular.
Motor e dados: [`@pkmn/sim`](https://github.com/pkmn/ps) (o simulador do Pokémon Showdown empacotado
para navegador), usando `Dex.forGen(5)`: tipos, base stats, golpes e itens exatamente como na Gen 5.
Nenhum servidor: tudo roda no navegador. Só as sprites vêm da internet (e ficam em cache depois).

## Rodar no PC
```
npm install
npm run dev        # abre em http://localhost:5173
```
`npm run dev` também mostra um endereço de rede (ex.: `http://192.168.0.10:5173`) para abrir no celular
na mesma Wi-Fi, só para testes (a instalação como app exige https).

## Publicar de graça (GitHub Pages) — recomendado para usar no celular
1. Crie um repositório no GitHub e envie este projeto para a branch `main`.
2. Em *Settings → Pages*, escolha **Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` faz o build e publica em `https://<usuario>.github.io/<repo>/`.
4. No celular, abra o link e use "Adicionar à tela inicial". Depois da primeira visita funciona offline.

Os seus dados **não** vão para o GitHub com isso; continuam guardados em cada aparelho.

## Persistência
- **Automática (por aparelho):** tudo é salvo no `localStorage` a cada alteração, e o app pede ao navegador
  armazenamento persistente.
- **Backup .json:** *Dados e backup → Exportar/Importar*. É o jeito de levar os dados entre PC e celular.
- **URL pública (somente leitura):** suba o backup `.json` num repositório público e cole o link em
  *Dados e backup*; o app baixa e substitui os dados locais.

## Batalhas
- **Formato:** `[Gen 5] Ubers` do Showdown: mecânicas de BW2, Team Preview e Sleep Clause Mod. O app não valida
  learnsets nem cláusulas de montagem de time.
- **Visibilidade total:** no Team Preview você vê o time inteiro da IA (golpes, nível, gênero, EVs, IVs,
  natureza, item). A IA também vê tudo do seu. Na batalha, o HP aparece em números exatos para os dois lados.
  Toque num Pokémon para ver a ficha e o estado atual.
- **Modos:** individual, ou todos em sequência (na ordem da lista de adversários). Seu time entra sempre curado,
  porque cada batalha é criada a partir do time salvo. Numa derrota da sequência você pode tentar de novo ou encerrar.
- **Batalha salva a cada turno:** o app guarda a semente e as escolhas (`inputLog`) e reconstrói a batalha
  exatamente ao reabrir.
- **Histórico:** cada batalha encerrada (inclusive desistência) vai para o histórico, com o resultado, o estado final
  dos dois times e o log completo em português. O histórico entra no backup `.json`.

## Time aleatório

Em **Batalhar → Time aleatório**, a IA recebe 6 Pokémon diferentes sorteados de `pokemons_feitos.txt`:

- **Peso:** cada bloco do arquivo conta 1 para a sua espécie, então os repetidos saem mais. Depois de sortear a espécie, um dos sets dela é escolhido.
- **Regras do time:** no máximo 3 Pokémon do mesmo tipo; pelo menos um Steel, um Water, um Electric ou Ground e um Flying (ou com Levitate). Pelo menos 80% dos times têm um Dragon.
- **Sets com erro** (sem golpes, item inexistente…) contam no peso, mas não são usados. A lista deles aparece na tela.
- **Atualização:** o arquivo entra no app na hora do build. Depois de editá-lo, rode `npm run dev` ou `npm run build` de novo, ou faça push para publicar.

## IA (dificuldade por adversário)
- **Fácil:** usa o golpe com mais dano estimado, com bastante aleatoriedade.
- **Normal:** para cada par (ação da IA × sua ação), simula o turno no motor real do Showdown, avalia o resultado
  (HP, nocautes, status, boosts, hazards, confronto em campo) e escolhe com algum ruído.
- **Difícil:** o mesmo com 2 amostras por par e sem ruído. Ao trocar após um nocaute, ela também simula o turno
  seguinte para cada candidato.

Cada simulação roda num clone com uma semente aleatória nova, então a IA não "vê" críticos nem rolagens futuras.
Ela começa a pensar assim que o turno abre, enquanto você escolhe, usando o estado anterior à sua escolha.

## Formato do time
O formato de exportação do Showdown. Campos omitidos recebem os padrões do Showdown (Nv. 100, IVs 31, EVs 0,
Serious, 1ª habilidade). Gênero omitido é sorteado e gravado no time. Não é verificada legalidade
(learnset/cláusulas), só se cada coisa existe na Gen 5.
