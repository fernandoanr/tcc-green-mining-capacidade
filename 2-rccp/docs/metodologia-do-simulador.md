# Metodologia do simulador RCCP em HTML — como foi construído e como funciona

> **Versão:** 1.6 — entradas semanais alinhadas entre CCs e Santo Amaro / modelo `aggregate-rccp-as-is-v16`
> **Data:** 19 de agosto de 2026
> **Artefato descrito:** `calculadora-rccp-offline.html` (arquivo único, na pasta `2-rccp`)
> **Código-fonte:** subpasta `2-rccp/src`
> **Finalidade deste documento:** descrever a construção e o funcionamento da ferramenta de planejamento agregado de capacidade usada no TCC.

---

## 1. Papel da ferramenta no TCC

O TCC trabalha com duas camadas de análise. A primeira é o **planejamento agregado de capacidade (RCCP — *Rough-Cut Capacity Planning*)**, que compara, em um mesmo horizonte semanal, a carga requerida e a capacidade disponível de cada grupo de recurso, para localizar o gargalo e medir folga. A segunda é a **simulação de eventos discretos no SIMUL8**, que trata variabilidade, filas, sequenciamento e políticas dinâmicas.

O artefato descrito aqui pertence à primeira camada. Ele é uma **calculadora agregada RCCP**, não um simulador de eventos: não gera fila, agenda, horário de partida, trajetória temporal de estoque nem sequência ótima de rota. Essa fronteira é explícita na própria interface e é o que permite usar os dois instrumentos sem sobreposição.

A função da ferramenta no trabalho é tripla:

1. **tornar o cálculo auditável** — cada indicador exibido pode ser rastreado até um parâmetro de entrada e até a linha correspondente do dicionário de dados;
2. **permitir cenários** — comparar a operação atual (*as-is*) com alternativas de melhoria sem reconstruir o modelo;
3. **comunicar o resultado** — apresentar carga, capacidade, utilização e gargalo em linguagem operacional, para discussão com a empresa.

---

## 2. Por que uma aplicação HTML local

A escolha da tecnologia foi metodológica, não estética. Os requisitos eram: rodar sem instalação e sem servidor no computador da empresa e da banca; manter todo o cálculo visível e verificável; permitir edição de parâmetros por quem conhece a operação, não apenas por quem programa; e não depender de licença de software.

| Alternativa avaliada | Limitação para este uso |
|---|---|
| Planilha eletrônica | A `Base Geral de Parâmetros.xlsx` é a **fonte oficial**; a planilha auditável é seu espelho de rastreabilidade. A calculadora permanece como interface para cenários e regras condicionais. |
| Simulador de eventos (SIMUL8) | Adequado a fila, variabilidade e sequenciamento, mas exige licença, tem tempo de execução por experimento e não é o instrumento correto para uma leitura agregada rápida de gargalo. Permanece como camada complementar. |
| Aplicação web com servidor/banco | Introduziria infraestrutura, dependência de rede e custo de manutenção incompatíveis com um TCC e com a operação atual da empresa. |

A solução adotada foi uma **página HTML autocontida**, com todo o modelo de cálculo em JavaScript executado no próprio navegador. O arquivo final não faz requisição de rede, não guarda dados em servidor e funciona offline com um duplo clique. Isso também tem consequência metodológica desejável: o artefato entregue é **reprodutível** — qualquer pessoa, em qualquer máquina, obtém os mesmos números a partir do mesmo arquivo.

---

## 3. Arquitetura do artefato

A ferramenta foi construída em quatro camadas, deliberadamente separadas para que dados, regras de cálculo e apresentação pudessem ser auditados de forma independente.

| Arquivo | Camada | Responsabilidade |
|---|---|---|
| `arrival-profile-2025.js` | Dados | Perfil oficial de 2025; as **22.043 chegadas consolidadas por centro/material** dimensionam a carga dos Centros de Coleta e do Hub direto. |
| `rccp-baseline.js` | Parâmetros | Cenário-base com massas, quantidades e demais parâmetros da `Base Geral de Parâmetros.xlsx`, além das 18 densidades específicas da etapa Caminhão fornecidas em 19/08/2026. |
| `rccp-model.js` | Cálculo | Motor do RCCP: converte parâmetros em carga requerida, capacidade disponível, utilização, folga e gargalo, por módulo (Transporte, Centros de Coleta, Hub) e por cenário. Não contém formatação nem texto de interface. |
| `index.html` | Apresentação | Interface: abas, tabelas, barras de utilização, painéis de cenário, textos explicativos e impressão. Lê apenas o resultado do motor. |
| `support.js` | Runtime | Camada de suporte para renderização da interface. |

O arquivo distribuído — `calculadora-rccp-offline.html` — é a **compilação dessas camadas em um único arquivo**, para uso e arquivamento, gerada por `reprodutibilidade/update-offline-bundle.mjs`. O código-fonte separado permanece em `src/` para inspeção e para futuras alterações.

**Consequência de auditoria:** um número exibido na tela nunca é digitado na camada de apresentação. Ele vem do motor, que vem do baseline implementado a partir da Base Geral oficial. O Dicionário Auditável espelha essa cadeia. Nenhum resultado calculado é editável na interface — apenas as entradas.

---

## 4. Lógica de cálculo implementada

### 4.1 Estrutura geral

O modelo compara, **na mesma semana operacional**, três grupos de recurso:

```text
utilização(grupo) = carga requerida(grupo) ÷ capacidade disponível(grupo)
gargalo           = grupo com a maior utilização entre os comparáveis
```

Capacidades de etapas sequenciais **não são somadas**: a capacidade do sistema é limitada pelo elo mais crítico. O calendário é semanal (segunda a sábado) e a anualização é feita apenas sobre a capacidade.

### 4.2 Transporte

```text
capacidade por volume(CC, material)  = volume útil × ocupação média na coleta × densidade aparente(CC, material)
capacidade por viagem(CC, material)  = menor(capacidade por volume, limite de peso do veículo)
viagens equivalentes(CC)             = Σ demanda(CC, material) ÷ capacidade por viagem(CC, material)
peso de 1 m³ do mix transportado   = 1 ÷ Σ[participação mássica(CC, material) ÷ densidade específica(CC, material)]
ciclo da rota(CC)                    = 2 × deslocamento esperado + carregamento no CC + descarga no Hub
ciclo agregado                       = Σ (participação das viagens equivalentes × ciclo da rota)
partidas nominais/semana             = 5 × piso(480 ÷ ciclo) + piso(240 ÷ ciclo)
viagens efetivas/semana              = piso(partidas nominais × eficiência do Transporte)
capacidade semanal                   = viagens efetivas × massa equivalente por viagem
```

Três decisões metodológicas estão embutidas aqui e são visíveis na aba *Como Calculamos*:

- o **piso** conta somente ciclos completos que terminam dentro da janela diária; viagens que ultrapassariam o fechamento não são iniciadas;
- a **eficiência é aplicada uma única vez ao total nominal da semana**, com piso final em viagens inteiras. Isso evita o artefato de preservar uma viagem por dia em eficiências muito baixas: com 1%, `piso(28 × 0,01) = 0`;
- a ponderação do ciclo usa **viagens equivalentes**, não massa, porque a capacidade de cada viagem depende da densidade aparente do par CC/material. A média da matriz ponderada pela massa é mantida em separado, apenas para reporte;
- o **peso de 1 m³ do mix transportado** é um resultado automático. Como o mix é informado em massa, o motor usa a média harmônica ponderada das densidades específicas, com a participação de cada par CC/material no total externo. Não existe campo de entrada nem escala global de densidade.

A demanda semanal inicial deriva da massa anual oficial por `massa anual ÷ 52`. Na interface, cada CC externo e Santo Amaro direto expõem o total editável em kg/semana, e o mix percentual é editável por material. Os cinco CCs e Santo Amaro direto também expõem **chegadas por semana editáveis**, iniciadas pelas quantidades oficiais consolidadas por centro/material ÷52; editar chegadas altera a carga de atendimento, mas não a massa. A massa e o mix diretos de Santo Amaro alimentam somente o Hub. O disparo operacional vigente é **15 m³**; ele não entra nas equações agregadas de carga, capacidade ou utilização e permanece como política do baseline/SIMUL8. O antigo 80% = 12 m³ é histórico superado.

### 4.3 Centros de Coleta

Cada centro é um módulo próprio. Cada chegada usa `0,5 + 0,5 + 1 + 2 = 4` operador-minutos para receber, pesar, registrar e segregar/armazenar, além da carga de apoio ao caminhão:

```text
tempo-homem requerido(CC) = atendimento + pesagem + registro + segregação/armazenagem
                          + solicitação + preparação + carregamento + baixa/reconciliação
tempo-homem disponível(CC) = operadores × calendário do CC × eficiência dos CCs
```

O carregamento tem **leitura dupla e simultânea**: os mesmos 20 min (Pinheiros) ou 30 min (demais) ocupam o caminhão no ciclo de transporte e consomem dois operadores locais no mesmo intervalo. A duração física não é duplicada; os consumos de caminhão e equipe são registrados em módulos diferentes.

O espaço físico dos centros é apresentado como **cobertura e folga de buffer**, não como limite de *throughput*: sem estoque inicial observado, tempo de permanência e política de retirada, converter m³ em capacidade semanal seria uma inferência sem base.

### 4.4 Hub Santo Amaro

O Hub possui seis pessoas compartilhadas e seis prensas. A descarga das cargas vindas dos CCs usa três pessoas por 30 min. A triagem dessas cargas permanece ativa como controle de cenário, com 0 min/carga e uma pessoa de referência no baseline:

```text
operador-minutos requeridos = recebimento/descarga
                            + atendimento direto
                            + cargas vindas dos CCs × tempo de triagem × pessoas na triagem
                            + movimentação das bateladas até a prensa + prensagem
                            + expedição com 6 pessoas × 30 min/retirada
minutos-máquina requeridos  = Σ (tempo por fardo(material) × fardos(material))
```

A elegibilidade das prensas é uma restrição implementada explicitamente: papelão só nas duas prensas grandes; plástico e longa vida compartilham as quatro pequenas. Por isso as capacidades isoladas de plástico e longa vida **não são somáveis** — são alternativas de uso do mesmo conjunto de máquinas.

A eficiência do Hub reduz **uma única vez** a disponibilidade humana e a disponibilidade de máquina; nunca altera os tempos de tarefa. No baseline oficial, as três eficiências são 100%.

O armazenamento do Hub é um único espaço de **493 m³ compartilhado** entre material solto e fardos. As coberturas isoladas de cada tipo são leituras alternativas do mesmo espaço, não parcelas somáveis. A divisão histórica 60 + 433 m³ foi superada.

---

## 5. Organização da interface

A ferramenta tem seis abas, cada uma respondendo a uma pergunta distinta:

| Aba | Pergunta que responde |
|---|---|
| **Resumo Geral** | Qual é o gargalo e como demanda, capacidade e gap se comparam na mesma semana. |
| **Centros de Coleta** | Como está cada centro em carga humana, ocupação física, viagens e demanda. |
| **Transporte** | Quantas viagens cabem na semana, qual o ciclo por rota e o que limita cada carga. |
| **Hub** | Como as seis pessoas e as seis prensas se dividem entre recebimento, atendimento direto, triagem das cargas vindas dos CCs, movimentação, prensagem e expedição. |
| **Fluxo do Processo** | Onde cada etapa está no fluxo ponta a ponta e qual seu estado de carga no cenário vigente. |
| **Como Calculamos** | Fórmula, origem e fronteira de cada número, em linguagem operacional. |

Três regras de experiência foram seguidas em toda a interface: a **unidade acompanha o valor**; resultados calculados não são editáveis, enquanto massas, mix, densidades específicas e chegadas semanais são entradas editáveis; e cada bloco declara sua **fronteira** — o que o cálculo não afirma. O peso de 1 m³ aparece deliberadamente como resultado. O Resumo Geral inclui um gráfico semanal na mesma escala, com `gap = capacidade − demanda`; na aba Hub, um card específico deixa explícitos os parâmetros de expedição: seis pessoas, 30 min e disparos de 32/19/54 fardos. Explicações pontuais aparecem em marcadores `(i)` junto ao dado.

A ferramenta imprime em **A4 retrato**, com quebras controladas, para anexação direta ao TCC.

---

## 6. Cenários implementados

Os cenários não substituem o *as-is*: são aplicados sobre ele e podem ser revertidos. A seleção é separada da aplicação — o usuário escolhe a configuração e confirma em **Aplicar** —, para que a comparação seja deliberada e o estado exibido nunca seja ambíguo.

### 6.1 Prensagem local nos Centros de Coleta

Liga uma prensa pequena em um ou mais centros e escolhe **quais materiais** ela processa. Por padrão, a prensa entra **desligada e sem material selecionado**: prensar no CC é hipótese de melhoria, não prática atual. Ao ativar, o modelo passa a considerar, naquele centro, os minutos-máquina, o operador dedicado, os fardos produzidos e o efeito da densificação sobre o volume transportado — e a ocupação do centro é recalculada à vista.

### 6.2 Consolidação de vários centros na mesma viagem

Agrupa centros em um tour com múltiplas paradas. O ciclo deixa de ser `Hub → CC → Hub` e passa a incluir as pernas entre centros. No RCCP vigente, a consolidação **preserva as viagens equivalentes requeridas**, porque os limites de 10 m³ e 1.800 kg continuam valendo por tour, e **alonga o ciclo de cada saída**. O efeito líquido sobre a utilização do Transporte é o objeto do cenário — e pode ser adverso, o que a ferramenta mostra sem suavizar.

No fluxo do processo, as etapas afetadas por cada cenário (prensagem no CC e roteirização com múltiplas paradas) ficam destacadas quando o cenário está ativo, para que a leitura do diagrama corresponda ao estado do cálculo.

---

## 7. Resultado do cenário-base

| Indicador | Valor |
|---|---:|
| Demanda externa oficial | 382.416,20 kg/ano = 7.354,157692 kg/semana |
| Santo Amaro direto | 14.663,70 kg/ano = 281,994231 kg/semana |
| Demanda total do Hub | 397.079,90 kg/ano = 7.636,151923 kg/semana |
| Mix anual do Hub — papelão / plástico / longa vida | 327.013,29 / 58.803,45 / 11.263,16 kg |
| Peso de 1 m³ do mix transportado | 48,57875948 kg/m³ |
| Massa equivalente consolidada por viagem | 461,498215 kg/viagem |
| Ciclo agregado de capacidade | 116,962145 min/viagem |
| Partidas nominais | 22/semana |
| Viagens efetivas | 22/semana |
| Capacidade de transporte | 10.152,960731 kg/semana |
| Folga do Transporte | 2.798,803038 kg/semana |
| **Utilização do Transporte** | **72,433627%** |
| Maior utilização entre os CCs (Jabaquara) | 15,7470% |
| Utilização da equipe do Hub | 16,373980% |
| Utilização das prensas grandes / pequenas | 10,6951% / 0,8921% |
| Capacidade anual integrada / folga | 548.198,284596 / 151.118,384596 kg/ano |

**Leitura:** no cenário-base, o **Transporte é o gargalo indicativo**. Os parâmetros estão confirmados para o baseline, mas vários tempos ainda não foram cronometrados em campo. A capacidade só poderá ser tratada como *demonstrada* após a validação estruturada com os operadores.

---

## 8. Verificação realizada

A ferramenta foi verificada em três frentes, sem que nenhuma delas substitua a validação de campo:

1. **Consistência interna** — reprodução dos valores do cenário-base a partir da Base Geral oficial e do baseline; conferência de que cada eficiência atua uma única vez; triagem de cargas vindas dos CCs ativa com carga zerada; espaço compartilhado de 493 m³; e cargas de descarga, movimentação/prensagem e expedição sem dupla contagem.
2. **Comportamento de cenário** — verificação de que ligar a prensa local sem selecionar material não altera o resultado (situação que a interface passou a sinalizar com aviso explícito), e de que a consolidação preserva as viagens equivalentes, escolhe o tour mínimo e alonga o ciclo.
3. **Inspeção de uso** — percurso completo das seis abas com acionamento dos controles, conferindo unidades, rótulos, textos, cenários e impressão.

A suíte de aceite do motor contém **48 testes automatizados**, executados por `rccp-model.test.cjs`. O `v16` passa em **48/48, sem falhas**, cobrindo a Base Geral oficial, entradas semanais de massa e chegadas, migração de cenários anteriores, densidade harmônica, recursos físicos, triagem de cargas vindas dos CCs ativa com valor zero e cenários com tempo positivo, estoque compartilhado, expedição, prensa local e consolidação multi-CC.

Os números exibidos devem ser sempre relidos na ferramenta após qualquer edição de parâmetro: o documento cita o cenário-base, não um resultado fixo.

---

## 9. Limites declarados

A ferramenta **não**:

- gera fila, agenda, horário de partida ou sequência ótima de rota;
- reconstrói a trajetória temporal de estoque nos centros ou no Hub;
- converte espaço físico (m³) em *throughput* semanal sem tempo de permanência e política de retirada;
- incorpora variabilidade estocástica — trabalha com valores esperados;
- declara capacidade demonstrada: entrega capacidade **nominal e efetiva**, e sinaliza o que falta para chegar à sustentável.

Todos esses fenômenos permanecem no SIMUL8, por decisão de escopo do trabalho.

---

## 10. Rastreabilidade e nomenclatura de origem

Cada parâmetro do cenário-base parte da `Base Geral de Parâmetros.xlsx`, é implementado em `rccp-baseline.js` e deve corresponder a uma linha do `Dicionário Auditável de Dados e Premissas - RCCP.xlsx`, com valor, unidade, fórmula, classificação, origem, escopo, confiança, status e data. A ficha canônica é `Cenário-Base Oficial — 12 de agosto de 2026.md`. As classificações usadas são:

- **Observado** — medido ou registrado em fonte operacional/histórica;
- **Calculado** — obtido por fórmula explícita a partir de entradas rastreáveis;
- **Informado pela empresa nas entrevistas e observado nas visitas técnicas** — parâmetro levantado junto à equipe da Green Mining nas entrevistas e nas visitas técnicas às unidades, ainda sujeito a medição formal quando aplicável;
- **Cenário** — escolha de cálculo ou sensibilidade, que não deve ser lida como desempenho observado.

Essa distinção é o que sustenta o rigor do trabalho: ela impede que uma premissa de cenário seja apresentada como evidência de campo.
