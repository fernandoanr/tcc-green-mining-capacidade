# 3. Modelo de simulação de eventos discretos (SIMUL8)

Esta pasta contém a lógica do modelo de simulação do cenário As Is 2025, construído no SIMUL8.
Nele, cada família de material em cada centro de coleta tem um ponto de entrada próprio, e a
armazenagem, a coleta, o transporte, a descarga, a triagem, a prensagem e a expedição são
representadas por filas e atividades encadeadas. Esse conteúdo corresponde às seções 3.6.5,
4.5.2 e 4.5.3 do TCC.

## Arquivos

| Arquivo | O que é |
|---|---|
| `visual-logic-as-is-2025.txt` | Exportação integral do *Visual Logic* do modelo, com 76 seções de lógica que tratam do chamado do caminhão, reserva e retirada de estoque, conversão entre massa e volume, triagem, prensagem, expedição, *warm-up* e registros de *log* |
| `docs/documentacao-modelo-as-is-2025.md` | Documentação técnica do modelo, com objetos, recursos, regras implementadas, saídas e cálculo dos indicadores |
| `docs/rastreabilidade-kpis-as-is-2025.md` | Separação entre o que sai diretamente do SIMUL8, o que vem dos *logs* do modelo e o que é calculado fora do software |
| `imagens/visao-geral-do-modelo.png` | Visão geral do modelo no SIMUL8 |
| `imagens/cc-jabaquara.png` | Detalhe de um centro de coleta (Jabaquara) |
| `imagens/hub-santo-amaro.png` | Detalhe do hub central de Santo Amaro |

## Parâmetros de entrada

Os parâmetros de chegada, que são distribuição, média efetiva e peso médio por chegada de cada
combinação de unidade e família, estão em
[`../1-dashboard-chegadas/resultados/parametros_simul8_hub_familia_2025_calibrados.csv`](../1-dashboard-chegadas/resultados/parametros_simul8_hub_familia_2025_calibrados.csv).
Os demais parâmetros operacionais, como tempos, equipes, densidades e rotas, estão em
[`../2-rccp/dados/base-geral-de-parametros.xlsx`](../2-rccp/dados/base-geral-de-parametros.xlsx).

## O que não está no repositório

O arquivo do modelo (`.S8`, com cerca de 470 MB) excede o limite de arquivos do GitHub. Os *logs*
gerados pela simulação (`Log caminhão.xlsx`, `Log entradas.xlsx`, `Log Estoque.xlsx` e
`Estoque inicial.xlsx`), citados na documentação, também não foram publicados. Ambos podem ser
solicitados aos autores. Para abrir o `.S8` é preciso ter uma licença do SIMUL8.
