# Rastreabilidade dos KPIs — SIMUL8 — Cenário **As Is 2025**

## 1. Objetivo deste documento

Este documento registra, de forma rastreável, **o que saiu diretamente do SIMUL8**, **quais logs foram gerados pelo modelo**, **quais dados eram apenas entradas/condições iniciais** e **quais cálculos ou manipulações foram feitos fora do SIMUL8** para chegar aos KPIs finais utilizados na planilha de validação do TCC.

O objetivo é evitar que um indicador calculado posteriormente seja apresentado como se tivesse sido fornecido diretamente pelo software.

A classificação usada ao longo do documento é:

- **[SIMUL8 — nativo]**: resultado fornecido diretamente por uma tela de resultados do SIMUL8, principalmente o **Results Manager**.
- **[SIMUL8 — variável]**: valor acumulado ou estado final de uma variável global do modelo.
- **[SIMUL8 — log customizado]**: informação gravada por Visual Logic em uma spreadsheet interna e posteriormente exportada para Excel.
- **[Entrada do modelo]**: parâmetro, estoque inicial ou capacidade informada ao modelo.
- **[Pós-processamento]**: cálculo efetuado a partir dos outputs anteriores.
- **[Reconstrução/estimativa]**: indicador que exigiu reconstrução temporal porque o log não registrava diretamente todos os estados necessários.

---

## 2. Rodada documentada

Esta documentação refere-se à rodada corrigida do cenário **As Is 2025**, após o ajuste do parâmetro que havia sido identificado como incorreto.

### 2.1. Horizonte de simulação

Valores observados no modelo:

- `Warm Up Period = 100000 min`
- `Results Collection Period = 140399,4999 min`
- `Simulation Time final = 240399,4999 min`
- início de registro pós-aquecimento: aproximadamente `100020 min`, conforme `gv_TesteZeraWarmUp` e lógica de zeragem dos contadores.

O **warm-up não deve ser misturado aos KPIs anuais**, pois o propósito dele é colocar o sistema em uma condição operacional antes da coleta oficial de resultados.

### 2.2. Calendário operacional adotado

Foi considerado:

- segunda a sexta: `5 × 540 = 2700 min/semana`;
- sábado: `240 min/semana`;
- domingo: sem operação;
- tempo operacional disponível por semana:  
  `2700 + 240 = 2940 min/semana`.

> Observação: em uma etapa anterior apareceu o número 2.950 min/semana em texto, mas a soma correta de 2.700 + 240 é **2.940 min/semana**. Foi esse valor que foi usado no cálculo de viagens teoricamente possíveis por semana.

### 2.3. Configurações estruturais relevantes

- Capacidade do caminhão: `10 m³` (`gv_CapacidadeCaminhao = 10`).
- Percentual de chamada: `150%` (`gv_PercentualChamada = 150`).
- Capacidade de estoque:
  - Pinheiros: `30 m³`;
  - Jabaquara: `33 m³`;
  - Paraisópolis: `33 m³`;
  - Brooklin: `33 m³`;
  - Embu das Artes: `33 m³`;
  - Hub Santo Amaro: `493 m³`.
- Capacidade instalada total nos cinco centros externos:  
  `30 + 33 + 33 + 33 + 33 = 162 m³`.

---

# 3. O que o SIMUL8 efetivamente “cuspiu”

Os resultados usados no TCC vieram de **quatro grupos de saída** diferentes.

## 3.1. Results Manager — saída nativa do SIMUL8

O Results Manager forneceu diretamente os percentuais de utilização dos recursos selecionados no modelo.

Na rodada corrigida, foram usados:

| Recurso / indicador | Resultado utilizado | Origem |
|---|---:|---|
| Caminhão | **79,58%** | Results Manager |
| Equipe mais carregada dos centros — Jabaquara | **18,83%** | Results Manager |
| Equipe compartilhada — Santo Amaro | **17,58%** | Results Manager |
| Prensa grande — Santo Amaro | **24,87%** | Results Manager |
| Prensa pequena — Santo Amaro | **7,14%** | Results Manager |

Esses valores foram tratados como **outputs nativos**, sem recalcular a utilização manualmente.

### Importante: utilização do caminhão ≠ ocupação volumétrica do caminhão

No snapshot das variáveis aparecem:

- `gv_MediaOcupacaoCaminhao = 100`
- `gv_SomaOcupacaoCaminhao = 78000`
- `gv_QtdViagensHub = 780`

Isso indica que a lógica customizada registrou **100% de ocupação volumétrica média das viagens** consideradas: cada viagem descarregou 10 m³.

Por outro lado, os **79,58% do Results Manager** representam a **utilização temporal do recurso caminhão**.

Portanto:

- **100%** = ocupação/carga volumétrica da viagem;
- **79,58%** = utilização do recurso ao longo do tempo disponível.

Esses dois percentuais não devem ser confundidos.

---

## 3.2. Snapshot das variáveis globais — estado/cumuladores finais do modelo

Ao término da simulação foi extraída a lista de variáveis globais. Ela é uma fotografia do estado do modelo e também contém diversos acumuladores.

Os principais grupos usados ou verificados foram:

### Transporte

- `gv_QtdViagensHub = 780`
- `gv_CapacidadeCaminhao = 10`
- `gv_M3Coletado_Pinheiros = 2600`
- `gv_M3Coletado_Jabaquara = 2080`
- `gv_M3Coletado_Paraisopolis = 1040`
- `gv_M3Coletado_Brooklin = 1040`
- `gv_M3Coletado_Embu = 1040`

Massa coletada acumulada:

- `gv_KgColetado_Pinheiros = 133993,21374 kg`
- `gv_KgColetado_Jabaquara = 113921,31213 kg`
- `gv_KgColetado_Paraisopolis = 22950,86196 kg`
- `gv_KgColetado_Brooklin = 17545,89263 kg`
- `gv_KgColetado_Embu = 77018,86896 kg`

### Demanda gerada em volume

- `gv_M3Gerado_Pinheiros = 2599,86384 m³`
- `gv_M3Gerado_Jabaquara = 2078,38213 m³`
- `gv_M3Gerado_Paraisopolis = 1042,42196 m³`
- `gv_M3Gerado_Brooklin = 1041,00690 m³`
- `gv_M3Gerado_Embu = 1040,87250 m³`
- `gv_M3Gerado_SantoAmaro = 268,41178 m³`

### Recusas

Todos os acumuladores finais ficaram zerados:

- `gv_KgRecusado_* = 0`
- `gv_M3Recusado_* = 0`
- `gv_QtdRecusada_* = 0`

### Hub

- `gv_CapEstoqueM3_SantoAmaro = 493`
- `gv_M3TotalDescargadoHub = 8068,41178 m³`
- `gv_QtdViagensExpedicao_SantoAmaro = 108`

### Estoque final

As variáveis `gv_EstoqueM3_*`, `gv_EstoqueKg_*` e `gv_EstoqueQtd_*` fornecem o **estado no instante final**, não a média anual.

Por esse motivo, elas **não foram usadas sozinhas para calcular estoque médio**.

---

# 4. Logs customizados gerados pelo modelo

Os logs abaixo não são “relatórios automáticos” do SIMUL8. Eles foram construídos no próprio modelo por **Visual Logic**, gravando eventos em spreadsheets internas. Após a execução, essas planilhas foram exportadas para Excel.

## 4.1. `Log caminhão.xlsx`

### Finalidade

Rastrear cada viagem e cada etapa do ciclo logístico do caminhão.

### Informações gravadas

A lógica do modelo registra, entre outros campos:

1. linha do log;
2. ID da viagem (`lbl_IDViagemCaminhao`);
3. código do centro/rota (`lbl_CentroRota`);
4. código da etapa (`lbl_EtapaCaminhao`);
5. nome da atividade — por exemplo, `Transporte Pinheiros`, `Transporte Jabaquara`, `Descarga_SantoAmaro`;
6. instante de início da etapa;
7. instante de término da etapa;
8. duração realizada da etapa;
9. duração esperada;
10. diferença entre realizado e esperado;
11. dia calculado da simulação;
12. semana calculada da simulação;
13. instante de início da viagem;
14. tempo total desde a chamada/início da viagem.

### KPIs derivados deste log

- ciclo médio do caminhão;
- quantidade de viagens concluídas;
- viagens por centro;
- viagens por semana;
- rastreamento de atrasos e etapas de viagem.

### Filtro aplicado

Para os KPIs pós-warm-up foram consideradas as viagens válidas após a zeragem do período de aquecimento, evitando contabilizar uma viagem que tivesse iniciado antes do corte e terminado depois dele.

---

## 4.2. `Log entradas.xlsx`

### Finalidade

Registrar cada evento de chegada de material à rede.

### Estrutura utilizada na análise

O log contém, para cada chegada:

- instante da chegada na escala da simulação;
- identificação/linha do registro;
- centro;
- material;
- massa em kg;
- volume em m³;
- quantidade de itens;
- rota/status do evento.

### KPIs derivados deste log

- chegadas na rede por ano;
- chegadas na rede por semana;
- massa recebida por ano;
- massa recebida por semana;
- chegadas por centro e material;
- massa por centro e material.

Esse log foi especialmente importante porque a entrada do modelo passou a reproduzir o **perfil de chegadas da planilha**, preservando os momentos e pesos dos eventos simulados.

---

## 4.3. `Log Estoque.xlsx`

### Finalidade

Registrar o estado do estoque associado aos eventos do modelo.

### Informações relevantes disponíveis

O log contém campos relacionados a:

- tempo da simulação;
- centro;
- capacidade do centro;
- espaço disponível;
- estoque reservado;
- estoque físico em m³;
- ocupação física percentual;
- quantidade de itens;
- geração acumulada;
- retirada/coleta acumulada;
- recusa acumulada;
- material do evento;
- massa do evento;
- volume do evento;
- rota/status;
- tipo de registro.

### KPIs derivados/reconstruídos

- estoque máximo nos centros;
- evolução do estoque;
- apoio à reconstrução do estoque médio;
- verificação de capacidade e ocupação.

### Limitação do log

O log é **orientado a eventos**, e não uma amostragem periódica completa de todos os estoques. Portanto, uma média aritmética simples das linhas do arquivo não representa corretamente o estoque médio no tempo.

---

## 4.4. `Estoque inicial.xlsx`

Esse arquivo **não é um output**. Ele representa a condição inicial usada pelo modelo e foi utilizado como ponto de partida para reconstruções temporais de estoque.

Sua importância no pós-processamento é garantir que a integral do estoque ao longo do tempo comece do nível correto.

---

# 5. Rastreabilidade de cada KPI final

## 5.1. Transporte

| KPI | Resultado final | Fonte bruta | Tratamento realizado |
|---|---:|---|---|
| Utilização do caminhão | **79,58%** | Results Manager | Nenhum; output nativo |
| Carga média por viagem | **468,50 kg/viagem** | variáveis `gv_KgColetado_*` + `gv_QtdViagensHub` | soma das massas coletadas ÷ viagens |
| Viagens necessárias por semana | **15,00** | `gv_QtdViagensHub = 780` | `780 ÷ 52` |
| Viagens possíveis por semana | **19,65** | ciclo médio + calendário | `2940 ÷ 149,59` |
| Ciclo médio do caminhão | **149,59 min** | `Log caminhão.xlsx` | média do tempo total das viagens válidas concluídas pós-warm-up |
| Massa transportada/semana | **7.027,50 kg** | `gv_KgColetado_*` | soma anual coletada ÷ 52 |
| Hub–Pinheiros | **5,00 viagens/semana** | `Log caminhão.xlsx` | 260 viagens ÷ 52 |
| Hub–Jabaquara | **4,00 viagens/semana** | `Log caminhão.xlsx` | 208 ÷ 52 |
| Hub–Paraisópolis | **2,00 viagens/semana** | `Log caminhão.xlsx` | 104 ÷ 52 |
| Hub–Brooklin | **2,00 viagens/semana** | `Log caminhão.xlsx` | 104 ÷ 52 |
| Hub–Embu | **2,00 viagens/semana** | `Log caminhão.xlsx` | 104 ÷ 52 |

### Carga média por viagem

Massa externa efetivamente coletada:

```text
Pinheiros       133.993,21374 kg
Jabaquara       113.921,31213 kg
Paraisópolis     22.950,86196 kg
Brooklin         17.545,89263 kg
Embu             77.018,86896 kg
--------------------------------
Total           365.430,14942 kg
```

Cálculo:

```text
365.430,14942 / 780 = 468,50019 kg/viagem
```

Resultado reportado:

**468,50 kg/viagem**.

### Massa transportada por semana

```text
365.430,14942 / 52 = 7.027,50287 kg/semana
```

Resultado reportado:

**7.027,50 kg/semana**.

### Viagens possíveis por semana

O valor não foi “cuspido” diretamente pelo SIMUL8.

Ele foi calculado como uma **capacidade teórica**, supondo que o caminhão pudesse encadear ciclos médios durante todo o tempo operacional disponível:

```text
2940 min/semana / 149,59 min/ciclo ≈ 19,65 viagens/semana
```

Esse KPI deve ser interpretado como capacidade teórica baseada no **ciclo médio**, não como número de viagens efetivamente realizadas.

---

## 5.2. Demanda da rede

| KPI | Resultado | Fonte | Tratamento |
|---|---:|---|---|
| Chegadas/ano | **21.295 eventos** | `Log entradas.xlsx` | contagem de registros |
| Chegadas/semana | **409,52 eventos** | `Log entradas.xlsx` | `21.295 ÷ 52` |
| Massa recebida/ano | **377.974,20 kg** | `Log entradas.xlsx` | soma da massa de todas as chegadas |
| Massa recebida/semana | **7.268,73 kg** | `Log entradas.xlsx` | massa anual ÷ 52 |

### Diferença entre massa recebida e massa transportada

Esses dois indicadores não representam a mesma coisa:

- **377.974,20 kg/ano recebidos na rede** = toda demanda/entrada registrada, incluindo Santo Amaro direto;
- **365.430,15 kg/ano transportados pelo caminhão entre centros externos e Hub** = material efetivamente coletado nos cinco centros externos.

Portanto, não se deve esperar igualdade entre os dois números.

---

## 5.3. Demanda por centro e material

Os valores abaixo foram obtidos por **agrupamento do `Log entradas.xlsx`** por centro e material.

### Número de chegadas no ano

| Centro | Papelão | Plástico | Longa Vida |
|---|---:|---:|---:|
| Pinheiros | 3.468 | 2.268 | 460 |
| Jabaquara | 4.543 | 3.442 | 1.161 |
| Paraisópolis | 338 | 277 | 58 |
| Brooklin | 1.454 | 1.047 | 619 |
| Embu das Artes | 1.353 | 0 | 225 |
| Santo Amaro | 235 | 233 | 114 |

### Massa anual por centro e material

| Centro | Papelão (kg) | Plástico (kg) | Longa Vida (kg) |
|---|---:|---:|---:|
| Pinheiros | 107.473,32 | 22.906,80 | 3.634,00 |
| Jabaquara | 87.452,75 | 23.061,40 | 3.262,41 |
| Paraisópolis | 15.267,46 | 6.706,17 | 983,10 |
| Brooklin | 15.034,36 | 2.156,82 | 352,83 |
| Embu das Artes | 75.903,30 | 0,00 | 1.181,25 |
| Santo Amaro | 9.733,70 | 1.898,95 | 965,58 |

Nenhum desses valores foi digitado manualmente na planilha final: eles resultam do agrupamento dos eventos do log.

---

# 6. KPIs dos centros de coleta

## 6.1. Utilização da equipe mais carregada

Resultado usado:

**Jabaquara = 18,83%**.

Classificação:

**[SIMUL8 — nativo]**.

Foi utilizado o percentual de utilização do recurso/equipe apresentado no **Results Manager**.

Não foi calculado manualmente como `tempo trabalhando ÷ 140.399,5`, pois os operadores possuem disponibilidade, shifts e intervalos. O denominador relevante é o tempo em que o recurso está disponível segundo as configurações do modelo.

---

## 6.2. Utilização da prensa mais carregada nos centros

No cenário As Is 2025 foi registrado:

**Não aplicável**.

Motivo: o cenário base representa a operação atual **sem prensas nos centros externos**. Assim, não existe recurso de prensa dos centros cuja utilização possa ser medida.

---

## 6.3. Estoque médio nos centros

Resultado reportado:

**58,19 m³**, correspondente ao estoque médio simultâneo total nos cinco centros externos.

Aproximação por centro usada na análise:

| Centro | Estoque médio aproximado |
|---|---:|
| Pinheiros | **13,03 m³** |
| Jabaquara | **12,34 m³** |
| Paraisópolis | **10,87 m³** |
| Brooklin | **10,99 m³** |
| Embu das Artes | **10,96 m³** |
| **Total médio** | **58,19 m³** |

### Como foi calculado

Esse valor **não veio diretamente do Results Manager**.

Foi feita uma reconstrução temporal usando:

1. estoque inicial;
2. volume e tempo das chegadas do `Log entradas.xlsx`;
3. tempo das coletas do `Log caminhão.xlsx`;
4. volume coletado pelo caminhão;
5. horizonte oficial pós-warm-up.

A média foi obtida como uma **média ponderada pelo tempo**:

```text
Estoque médio = Σ (nível de estoque_i × duração_i) / duração total
```

Ou, de forma contínua:

```text
E_médio = (1/T) × ∫ E(t) dt
```

Isso evita o erro de tirar simplesmente a média das linhas do `Log Estoque`, pois momentos com muitas chegadas produziriam mais registros e ficariam artificialmente super-representados.

Classificação:

**[Pós-processamento / reconstrução temporal]**.

---

## 6.4. Estoque máximo nos centros

Resultado reportado:

**29,92 m³**.

Foi obtido a partir da evolução/reconstrução dos níveis de estoque dos centros durante o horizonte pós-warm-up, verificando o maior nível atingido entre os cinco centros.

Como Pinheiros possui capacidade de 30 m³, esse máximo representa uma aproximação bastante próxima da ocupação física total daquele centro, mas ainda sem ultrapassá-la.

Classificação:

**[Pós-processamento a partir dos logs]**.

---

## 6.5. Capacidade instalada de armazenagem

Resultado:

**162 m³**.

Cálculo:

```text
Pinheiros       30
Jabaquara       33
Paraisópolis    33
Brooklin        33
Embu            33
---------------
Total          162 m³
```

Origem:

**[Entrada do modelo / variáveis de capacidade]**.

Não é resultado de desempenho da simulação; é uma característica física informada ao modelo.

---

## 6.6. Cobertura mínima do estoque

Resultado reportado:

**3,60 dias**.

Esse valor também **não é um output direto do SIMUL8**.

Foi calculado para cada centro como:

```text
Cobertura do centro = Capacidade instalada do centro / geração média diária em volume
```

Como foram consideradas 52 semanas e seis dias operacionais por semana:

```text
Dias operacionais no ano = 52 × 6 = 312 dias
```

Assim:

```text
Geração média diária = volume anual gerado / 312
```

### Pinheiros — centro limitante

```text
Volume anual = 2.599,86384 m³
Média diária = 2.599,86384 / 312 = 8,3329 m³/dia
Cobertura = 30 / 8,3329 = 3,60 dias
```

Coberturas aproximadas:

| Centro | Capacidade | Volume anual gerado | Cobertura |
|---|---:|---:|---:|
| Pinheiros | 30 m³ | 2.599,86 m³ | **3,60 dias** |
| Jabaquara | 33 m³ | 2.078,38 m³ | **4,95 dias** |
| Paraisópolis | 33 m³ | 1.042,42 m³ | **9,88 dias** |
| Brooklin | 33 m³ | 1.041,01 m³ | **9,89 dias** |
| Embu das Artes | 33 m³ | 1.040,87 m³ | **9,89 dias** |

O KPI da planilha usa o **mínimo**, portanto:

**Cobertura mínima = 3,60 dias — Pinheiros**.

### Interpretação correta

Esse indicador é, na prática, uma **cobertura da capacidade instalada em relação ao fluxo médio diário gerado**.

Ele não representa quantos dias o **estoque médio real** duraria. Para isso seria necessário usar estoque médio no numerador, produzindo um indicador diferente.

Classificação:

**[Pós-processamento]**.

---

# 7. KPIs do Hub Santo Amaro

## 7.1. Utilização da equipe compartilhada

Resultado:

**17,58%**.

Origem:

**[SIMUL8 — nativo / Results Manager]**.

---

## 7.2. Utilização da prensa grande

Resultado:

**24,87%**.

Origem:

**[SIMUL8 — nativo / Results Manager]**.

---

## 7.3. Utilização da prensa pequena

Resultado:

**7,14%**.

Origem:

**[SIMUL8 — nativo / Results Manager]**.

---

## 7.4. Estoque médio no Hub

Resultado utilizado:

**29,45 m³**.

Classificação:

**[Reconstrução/estimativa a partir do Log Estoque]**.

### Por que é uma estimativa e não um output exato

No Hub, o estoque muda por diversos eventos:

- entrada direta em Santo Amaro;
- descarga de viagens dos centros;
- triagem/processamento;
- prensagem;
- expedição de fardos.

O `Log Estoque` disponível não registra uma fotografia periódica completa após **toda** mudança de estado do Hub. Dessa forma, não foi possível tratar o arquivo como uma série temporal perfeitamente completa.

Para chegar ao valor utilizado, os registros disponíveis foram ordenados no tempo e foi calculada uma média temporal aproximada, utilizando também a condição inicial/final disponível.

Assim, **29,45 m³ deve ser identificado metodologicamente como uma estimativa de estoque médio do Hub**, e não como um valor diretamente retornado pelo Results Manager.

### Como tornar esse KPI exato em versões futuras

Adicionar ao modelo um **Time Check** periódico, por exemplo a cada 30 minutos, gravando:

```text
Simulation Time
gv_EstoqueM3_SantoAmaro_Total
```

Com isso seria possível calcular uma média temporal direta e uniforme do Hub.

---

## 7.5. Capacidade de armazenagem do Hub

Resultado:

**493 m³**.

Origem:

`gv_CapEstoqueM3_SantoAmaro = 493`.

Classificação:

**[Entrada do modelo]**.

---

# 8. KPIs de recusa

Na rodada corrigida:

- `gv_KgRecusado_Brooklin = 0`
- `gv_KgRecusado_Embu = 0`
- `gv_KgRecusado_Jabaquara = 0`
- `gv_KgRecusado_Paraisopolis = 0`
- `gv_KgRecusado_Pinheiros = 0`
- `gv_KgRecusado_SantoAmaro = 0`

Também ficaram zerados os equivalentes em volume e quantidade.

Por isso:

### Chegadas recusadas por semana

```text
0 eventos / 52 = 0 eventos/semana
```

### Material recusado por semana

```text
0 kg / 52 = 0 kg/semana
```

### Material recusado sobre a demanda

```text
0 / 377.974,20 × 100 = 0,00%
```

Classificação:

**[SIMUL8 — variáveis acumuladas] + [pós-processamento para indicadores semanais/%]**.

---

# 9. Resumo executivo: o que veio direto e o que foi calculado

## 9.1. Veio diretamente do SIMUL8, sem cálculo externo

### Results Manager

- utilização temporal do caminhão: **79,58%**;
- utilização da equipe de Jabaquara: **18,83%**;
- utilização da equipe compartilhada de Santo Amaro: **17,58%**;
- utilização da prensa grande: **24,87%**;
- utilização da prensa pequena: **7,14%**.

### Variáveis acumuladas / snapshot

- 780 viagens Hub;
- massa coletada acumulada por centro;
- volume coletado por centro;
- volume gerado por centro;
- recusas acumuladas;
- estoques finais;
- capacidade configurada;
- expedições acumuladas;
- ocupação volumétrica média das viagens registrada pela lógica.

---

## 9.2. Veio dos logs customizados do modelo

### `Log caminhão.xlsx`

- etapas e tempos das viagens;
- centro de destino/origem;
- IDs de viagem;
- ciclo total;
- contagem de viagens por rota.

### `Log entradas.xlsx`

- todas as chegadas;
- centro;
- material;
- kg;
- m³;
- quantidade;
- momento da chegada;
- rota/status.

### `Log Estoque.xlsx`

- nível de estoque nos eventos registrados;
- capacidade;
- ocupação;
- reserva;
- acumuladores e dados do evento.

---

## 9.3. Foi calculado após a simulação

- carga média por viagem;
- viagens por semana;
- viagens possíveis por semana;
- ciclo médio a partir das viagens concluídas;
- massa transportada por semana;
- chegadas por semana;
- massa recebida por semana;
- agrupamentos por centro/material;
- estoque médio temporal dos centros;
- estoque máximo dos centros;
- capacidade total dos centros;
- cobertura mínima;
- indicadores semanais e percentual de recusa;
- estimativa do estoque médio do Hub.

---

# 10. Quadro final de linhagem dos KPIs

| KPI | Fonte primária | Tipo de resultado | Grau de transformação |
|---|---|---|---|
| Utilização caminhão | Results Manager | SIMUL8 nativo | Nenhum |
| Carga média/viagem | variáveis de kg coletado + viagens | Derivado | Divisão |
| Viagens necessárias/semana | `gv_QtdViagensHub` | Derivado | ÷ 52 |
| Viagens possíveis/semana | Log caminhão + calendário | Derivado | 2940 ÷ ciclo médio |
| Ciclo médio | Log caminhão | Derivado | média filtrada pós-warm-up |
| Massa transportada/semana | variáveis de coleta | Derivado | soma ÷ 52 |
| Viagens por rota/semana | Log caminhão | Derivado | contagem por centro ÷ 52 |
| Chegadas/ano | Log entradas | Log | contagem |
| Chegadas/semana | Log entradas | Derivado | contagem ÷ 52 |
| Massa recebida/ano | Log entradas | Log | soma |
| Massa recebida/semana | Log entradas | Derivado | soma ÷ 52 |
| Demanda por centro/material | Log entradas | Derivado | agrupamento |
| Equipe Jabaquara | Results Manager | SIMUL8 nativo | Nenhum |
| Prensa nos centros | configuração do cenário | Não aplicável | — |
| Estoque médio centros | estoque inicial + Log entradas + Log caminhão | Reconstruído | integral temporal |
| Estoque máximo centros | série reconstruída/log | Derivado | máximo |
| Capacidade dos centros | parâmetros do modelo | Entrada | soma |
| Cobertura mínima | capacidade + volume gerado | Derivado | capacidade ÷ m³/dia |
| Equipe Santo Amaro | Results Manager | SIMUL8 nativo | Nenhum |
| Prensa grande | Results Manager | SIMUL8 nativo | Nenhum |
| Prensa pequena | Results Manager | SIMUL8 nativo | Nenhum |
| Estoque médio Hub | Log Estoque + condição inicial/final | Estimativa | média temporal aproximada |
| Capacidade Hub | variável de capacidade | Entrada | Nenhum |
| Recusas | variáveis de recusa | SIMUL8 variável | agregação/÷52/% |

---

# 11. Cuidados metodológicos para o texto do TCC

1. **Não chamar todo KPI de “resultado direto do SIMUL8”.**  
   Parte dos indicadores foi obtida por pós-processamento dos logs.

2. **Separar utilização temporal de ocupação volumétrica.**  
   O caminhão teve 79,58% de utilização temporal e 100% de ocupação volumétrica média das viagens registradas.

3. **Não usar `Simulation Time = 240399,4999` como denominador dos KPIs anuais.**  
   Esse valor contém os 100.000 minutos de warm-up.

4. **Para contadores anuais, considerar somente o período oficial de resultados ou os acumuladores zerados após warm-up.**

5. **Estoque final não é estoque médio.**  
   Os valores `gv_EstoqueM3_*` do snapshot representam somente o instante final da rodada.

6. **O estoque médio dos centros foi ponderado pelo tempo.**  
   Não foi usada média simples das linhas do log.

7. **O estoque médio do Hub é atualmente uma estimativa.**  
   Para maior rigor, recomenda-se criar amostragem periódica na próxima versão do modelo.

8. **A cobertura de 3,60 dias usa capacidade física, não estoque médio.**  
   Portanto, o nome metodologicamente mais preciso seria “cobertura da capacidade instalada em relação à geração média diária”.

9. **Uma rodada não deve ser confundida com uma análise de variabilidade entre replicações.**  
   Os números aqui documentados correspondem à rodada analisada. Caso o TCC utilize múltiplas replicações, os resultados devem ser consolidados com média e, idealmente, intervalo de confiança.

---

# 12. Formulação sugerida para o TCC

> Os indicadores de desempenho foram obtidos por duas fontes complementares. Alguns resultados, principalmente os percentuais de utilização de recursos, foram coletados diretamente do Results Manager do SIMUL8. Outros indicadores foram derivados de logs customizados implementados em Visual Logic, responsáveis por registrar eventos de chegada, movimentação do caminhão e evolução dos estoques. A partir desses registros foram realizados procedimentos de pós-processamento, tais como agrupamento por centro e material, cálculo de médias, conversão de totais anuais em valores semanais e reconstrução temporal dos níveis de estoque. Dessa forma, os KPIs finais não correspondem exclusivamente a resultados nativos do software, mas a uma combinação entre saídas diretas do modelo e indicadores calculados a partir dos registros gerados durante a simulação. Essa distinção foi mantida para garantir a rastreabilidade dos resultados e permitir a reprodução dos cálculos.

---

# 13. Arquivos e evidências utilizados na análise

- `Log caminhão.xlsx` — log customizado das viagens e etapas do caminhão;
- `Log entradas.xlsx` — log customizado das chegadas de material;
- `Log Estoque.xlsx` — log customizado dos estados/eventos de estoque;
- `Estoque inicial.xlsx` — condição inicial do modelo;
- snapshot das variáveis globais ao final da simulação;
- Results Manager da rodada corrigida;
- Visual Logic do modelo, responsável pela geração dos logs e acumuladores.

## Referências metodológicas do projeto

- CHWIF, Leonardo et al. *Introdução ao SIMUL8: um guia prático*.
- CHWIF, Leonardo; MEDINA, Afonso C. *Modelagem e Simulação de Eventos Discretos: Teoria & Prática*.
- Simul8 Corporation. *Simul8 101 — Building Effective and Efficient Simulations*.

