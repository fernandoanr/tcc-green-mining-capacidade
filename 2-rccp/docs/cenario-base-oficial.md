# Cenário-base oficial do RCCP — atualizado em 19 de agosto de 2026

> **Status:** referência numérica e operacional vigente do pacote RCCP  
> **Modelo:** `aggregate-rccp-as-is-v16`  
> **Data de corte:** 19 de agosto de 2026  
> **Fontes oficiais:** `Base Geral de Parâmetros.xlsx` para massas e quantidades; tabela da etapa Caminhão fornecida em 19/08/2026 para densidades aparentes.

## 1. Regra de prevalência e hierarquia das fontes

Este documento é a ficha canônica do cenário-base. Quando um número de cenário-base em outro documento divergir desta ficha, prevalece esta ficha. Valores anteriores a 19 de agosto de 2026 são históricos e estão listados na seção 8.

A hierarquia vigente é:

1. `dados/base-geral-de-parametros.xlsx`: fonte oficial e atualizada dos dados e parâmetros;
2. tabela da etapa Caminhão fornecida em 19/08/2026: fonte das 18 densidades aparentes vigentes;
3. `src/rccp-baseline.js`: implementação do cenário-base oficial;
4. `src/arrival-profile-2025.js`: perfil semanal derivado das quantidades oficiais de chegadas da aba `Volumes e Mixing`;
5. `src/rccp-model.js`: regras de cálculo;
6. `src/rccp-current-scenario.cjs`: reprodução auditável dos resultados consolidados;
7. `dados/dicionario-auditavel-de-dados-e-premissas.xlsx`: espelho operacional de rastreabilidade derivado das fontes acima, não substituto das fontes oficiais.

Os tempos e as políticas aqui registrados estão **confirmados para o cenário-base, mas ainda não cronometrados em campo**, salvo quando houver evidência observada específica. Esta formulação não declara uma validação de campo inexistente.

## 2. Fronteira do RCCP

O RCCP compara semanalmente a carga e a capacidade de Centros de Coleta, Transporte e Hub. O fluxo coberto é:

```text
receber → pesar → registrar → segregar/armazenar → solicitar coleta
→ carregar com apoio da equipe local → transportar ao Hub
→ descarregar → movimentar/prensar → armazenar → expedir
```

Filas, horários de partida, trajetória temporal do estoque e sequenciamento detalhado continuam pertencendo ao SIMUL8. O disparo da coleta em 15 m³ é uma política operacional do baseline/SIMUL8 e não entra nas equações agregadas de throughput do RCCP.

## 3. Parâmetros gerais e de Transporte

| Parâmetro | Valor oficial |
|---|---:|
| Semanas do baseline | 52 semanas/ano |
| Dias trabalhados | 312 dias/ano = 52 × 6 |
| Calendário do Transporte | 480 min/dia útil; 240 min/sábado; 5 dias úteis + 1 sábado |
| Calendário dos CCs e Hub | 540 min/dia útil; 240 min/sábado; 5 dias úteis + 1 sábado |
| Eficiência — Transporte / CCs / Hub | 100% / 100% / 100% |
| Caminhões ativos | 1 |
| Volume útil do caminhão | 10 m³ |
| Ocupação média na coleta | 95% |
| Limite de peso | 1.800 kg/viagem |
| Disparo operacional da coleta | 15 m³; fora do throughput RCCP |
| Política de coleta | retirar todo o estoque que couber por volume e peso |
| Prioridade | maior percentual de ocupação do CC |
| Ciclo as-is | Hub → um CC → Hub |
| Espera no CC / espera no Hub | 0 / 0 min |
| Descarga externa no Hub | 30 min/carga, com 3 pessoas |
| Término após fechamento | não; contam apenas ciclos completos dentro da janela |

Os tempos de deslocamento por sentido permanecem: Pinheiros 22/32/51 min; Jabaquara 18/25/40 min; Paraisópolis 15/22/35 min; Brooklin 10/15/24 min; Embu das Artes 27/38/61 min, respectivamente nos cenários otimista/provável/pessimista. O cenário-base usa o valor esperado triangular.

## 4. Centros de Coleta e chegadas oficiais

Cada chegada consome 4 operador-minutos:

```text
0,5 min receber + 0,5 min pesar + 1 min registrar + 2 min segregar/armazenar
```

| Centro | Chegadas/ano | Chegadas/semana | Equipe | Balanças | Estoque | Apoio ao carregamento | Tempo de carregamento |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pinheiros | 6.830 | 131,346154 | 2 | 1 | 30 m³ | 2 pessoas | 20 min |
| Jabaquara | 8.753 | 168,326923 | 2 | 1 | 33 m³ | 2 pessoas | 30 min |
| Paraisópolis | 723 | 13,903846 | 2 | 1 | 33 m³ | 2 pessoas | 30 min |
| Brooklin | 3.397 | 65,326923 | 2 | 1 | 33 m³ | 2 pessoas | 30 min |
| Embu das Artes | 1.685 | 32,403846 | 3 | 1 | 33 m³ | 2 pessoas | 30 min |
| Santo Amaro direto | 655 | 12,596154 | — | — | estoque compartilhado do Hub | — | atendimento local de 4 min |
| **Total** | **22.043** | **423,903846** | — | — | — | — | — |

As chegadas são as quantidades oficiais consolidadas por centro e material, divididas por 52. A regra anterior de 55.096 registros locais de todas as famílias foi substituída e não é fallback ativo.

### 4.1 Massa oficial por Centro de Coleta

| Centro | Massa anual | Demanda semanal |
|---|---:|---:|
| Pinheiros | 147.173,14 kg | 2.830,252692 kg/semana |
| Jabaquara | 109.932,89 kg | 2.114,094038 kg/semana |
| Paraisópolis | 23.807,45 kg | 457,835577 kg/semana |
| Brooklin | 19.129,19 kg | 367,869038 kg/semana |
| Embu das Artes | 82.373,53 kg | 1.584,106346 kg/semana |
| **Total externo** | **382.416,20 kg** | **7.354,157692 kg/semana** |

Santo Amaro direto adiciona 14.663,70 kg/ano, ou 281,994231 kg/semana. Assim, o Hub recebe 397.079,90 kg/ano, ou 7.636,151923 kg/semana.

## 5. Densidades aparentes vigentes — etapa Caminhão

As 18 combinações centro/material foram atualizadas pela tabela fornecida em 19 de agosto de 2026. As massas e as quantidades de chegadas permanecem as da Base Geral oficial.

| Centro | Papelão | Plástico | Longa vida |
|---|---:|---:|---:|
| Pinheiros | 64,82 | 34,54 | 92,11 |
| Jabaquara | 49,20 | 73,13 | 61,64 |
| Paraisópolis | 31,12 | 14,46 | 38,57 |
| Brooklin | 17,00 | 33,63 | 89,68 |
| Embu das Artes | 73,92 | 0,00 | 83,96 |
| Santo Amaro direto | 49,74 | 32,73 | 65,66 |

Unidade: kg/m³. Embu das Artes/Plástico permanece desativado, com massa e densidade iguais a zero. O **peso de 1 m³ do mix transportado** é calculado automaticamente pela média harmônica ponderada do mix; no baseline atual é **48,57875948 kg/m³**.

## 6. Hub e expedição

| Parâmetro | Valor oficial |
|---|---:|
| Equipe compartilhada | 6 pessoas |
| Pessoas na descarga externa | 3 |
| Descarga externa | 30 min/carga |
| Triagem de cargas vindas dos CCs | ativa; 0 min/carga e 1 pessoa de referência |
| Atendimento de Santo Amaro direto | 4 min/chegada; não passa pela triagem das cargas vindas dos CCs |
| Prensas | 2 grandes para papelão; 4 pequenas compartilhadas por plástico e longa vida |
| Armazenamento do Hub | 493 m³ compartilhados entre material solto e fardos |
| Expedição | 6 pessoas simultâneas por 30 min/retirada |
| Veículo do parceiro | não limitante no cenário-base |

Os 493 m³ são um único recurso compartilhado e flexível. As coberturas de material solto e de fardos são leituras isoladas do mesmo espaço; não podem ser somadas nem interpretadas como parcelas simultâneas de 493 + 493 m³. A decomposição anterior de 60 m³ intermediários + 433 m³ de fardos foi superada.

### 6.1 Processamento e disparos de expedição

| Material | Massa anual no Hub | Movimentação | Prensagem | Peso/fardo | Volume/fardo | Disparo | Fardos inteiros |
|---|---:|---:|---:|---:|---:|---:|---:|
| Papelão | 327.013,29 kg | 10 min/fardo | 20 min/fardo | 200 kg | 0,539 m³ | 6.400 kg | 32 |
| Plástico | 58.803,45 kg | 5 min/fardo | 8 min/fardo | 100 kg | 0,247 m³ | 1.900 kg | 19 |
| Longa vida | 11.263,16 kg | 5 min/fardo | 8 min/fardo | 120 kg | 0,247 m³ | 6.480 kg | 54 |

Os disparos, 6 pessoas e 30 min estão confirmados para o baseline, mas ainda não cronometrados em campo. A frequência média é calculada pela massa processada: 0,982612 retirada equivalente/semana de papelão, 0,595177 de plástico e 0,033426 de longa vida, totalizando 1,611214 retirada equivalente/semana. A carga de expedição resultante é 290,018606 operador-min/semana.

## 7. Resultados reproduzidos do cenário-base

### 7.1 Transporte

| Indicador | Resultado |
|---|---:|
| Ciclo agregado | 116,962145 min/viagem |
| Capacidade média por viagem | 461,498215 kg |
| Partidas efetivas | 22/semana |
| Capacidade | 10.152,960731 kg/semana |
| Demanda externa | 7.354,157692 kg/semana |
| Utilização | 72,433627% |
| Folga | 2.798,803038 kg/semana |

### 7.2 Centros de Coleta

| Centro | Utilização da equipe | Cobertura física média |
|---|---:|---:|
| Pinheiros | 12,5155% | 3,6000 dias |
| Jabaquara | 15,7470% | 4,9504 dias |
| Paraisópolis | 3,0941% | 9,9001 dias |
| Brooklin | 6,5921% | 9,9008 dias |
| Embu das Artes | 3,0013% | 9,2563 dias |

Jabaquara é o CC com maior utilização, mas não é o gargalo integrado.

### 7.3 Hub

| Indicador | Resultado |
|---|---:|
| Disponibilidade da equipe | 17.640 operador-min/semana |
| Descarga externa | 1.434,185812 operador-min/semana |
| Serviço direto | 50,384615 operador-min/semana |
| Triagem de cargas vindas dos CCs | 0 operador-min/semana |
| Movimentação + prensagem | 1.113,781109 operador-min/semana |
| Expedição | 290,018606 operador-min/semana |
| Carga conhecida total | 2.888,370142 operador-min/semana |
| Utilização da equipe | 16,373980% |
| Capacidade equivalente | 46.635,892664 kg/semana |
| Utilização das prensas grandes | 10,6951% |
| Utilização das prensas pequenas | 0,8921% |
| Cobertura isolada — material solto | 18,8009 dias |
| Cobertura isolada — fardos | 146,5293 dias |

### 7.4 Resultado integrado

| Indicador | Resultado |
|---|---:|
| Demanda integrada | 7.636,151923 kg/semana; 397.079,90 kg/ano |
| Capacidade integrada indicativa | 10.542,274704 kg/semana; 548.198,284596 kg/ano |
| Folga anual indicativa | 151.118,384596 kg/ano |
| Gargalo indicativo | Transporte, 72,433627% |
| Restrições físicas mínimas | válidas |
| Inconsistências físicas reportadas | nenhuma (`issues = []`) |

A capacidade integrada é indicativa e agregada. Não deve ser apresentada como capacidade demonstrada em campo. No Resumo Geral, o gráfico usa `gap = capacidade − demanda`: resultado positivo indica volume adicional disponível; negativo indica excesso sobre a capacidade; zero indica equilíbrio.

## 8. Valores históricos superados até 19 de agosto de 2026

Os seguintes conjuntos permanecem apenas como evidência da versão anterior e não devem alimentar o baseline atual:

- modelo `aggregate-rccp-as-is-v12`;
- eficiências iniciais de 85%; o baseline atual usa 100% nos três grupos;
- 55.096 visitas e suas taxas por unidade; o baseline atual usa 22.043 chegadas oficiais;
- serviço local de 1 + 0,5 + 0,5 + 2 min; a divisão atual é 0,5 + 0,5 + 1 + 2 min;
- três pessoas em Pinheiros e duas em Embu; o atual é duas em Pinheiros e três em Embu;
- um operador local no carregamento; o atual usa duas pessoas em todos os CCs;
- triagem externa de 10 min com uma pessoa; o atual inicia ativo em 0 min/carga, mantendo uma pessoa de referência para cenários;
- Hub com duas pessoas e eficiência de 85%; o atual usa seis pessoas e 100%;
- estoque repartido em 60 + 433 m³; o atual é um espaço compartilhado de 493 m³;
- expedição com duas pessoas por 45–60 min, referência 52,5 min, e disparos de 5.000/1.500/5.000 kg; o atual usa seis pessoas, 30 min e 6.400/1.900/6.480 kg, equivalentes a 32/19/54 fardos;
- gatilho de coleta de 80% = 12 m³; o disparo operacional atual é 15 m³;
- resultados de utilização, capacidade, folga, frequência de expedição e gargalo calculados com esses parâmetros anteriores.
- matriz anterior de densidades específicas, substituída integralmente pela tabela da etapa Caminhão de 19/08/2026.

## 9. Aceite e reprodução

O cenário-base deve ser reproduzido com:

```bash
cd 2-rccp/src
node rccp-current-scenario.cjs
node --test rccp-model.test.cjs
```

A suíte possui 48 casos de aceite alinhados ao `v16`, incluindo os três acrescentados com o cenário de prensagem nos CCs em 14/09/2026. O resultado reproduzido é **48/48 aprovados e nenhuma falha**, conferido automaticamente a cada atualização do repositório.
