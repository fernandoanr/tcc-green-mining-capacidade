# 2. Planejamento agregado de capacidade (RCCP)

Esta pasta contém a calculadora de capacidade desenvolvida no trabalho. A ferramenta compara,
na mesma semana, a carga exigida e a capacidade disponível do transporte, das equipes dos
centros de coleta e da equipe e das prensas do hub, e aponta o gargalo e a folga de cada
recurso. Esse conteúdo corresponde às seções 3.6.5, 4.5.1 e 4.5.4 do TCC.

Modelo vigente: `aggregate-rccp-as-is-v16`.

## Como usar a calculadora

- **Online** — <https://fernandoanr.github.io/tcc-green-mining-capacidade/2-rccp/calculadora-rccp-offline.html>
- **Offline** — baixe `calculadora-rccp-offline.html` e abra com duplo clique. Não é preciso
  instalar nada, e nenhum dado é enviado a servidor.
- **Cenários do TCC** — cada arquivo de `cenarios/` pode ser importado na calculadora para
  reproduzir os resultados de 2026 a 2030.

## Arquivos

| Caminho | Camada | O que é |
|---|---|---|
| `calculadora-rccp-offline.html` | Distribuição | As camadas abaixo compiladas em um arquivo único |
| `src/arrival-profile-2025.js` | Dados | Chegadas e massa de 2025 por centro e família de material |
| `src/rccp-baseline.js` | Parâmetros | Cenário-base, com equipes, calendários, tempos, densidades, caminhão, prensas e armazenagem |
| `src/rccp-model.js` | Cálculo | Motor do RCCP, com carga, capacidade, utilização, folga e gargalo por módulo |
| `src/index.html` e `src/support.js` | Apresentação | Interface com abas, tabelas, gráficos e painéis de cenário |
| `src/rccp-model.test.cjs` | Verificação | 48 testes automatizados do motor |
| `src/rccp-current-scenario.cjs` | Auditoria | Reprodução programática do cenário-base |
| `src/rccp-sensitivity-audit.cjs` | Auditoria | Comparação reproduzível das bases de visitas e massa usadas nas sensibilidades |
| `reprodutibilidade/update-offline-bundle.mjs` | Reprodutibilidade | Recompila `calculadora-rccp-offline.html` a partir de `src/` |
| `cenarios/*.json` | Cenários | Os 23 cenários do capítulo 4, no formato que a calculadora importa |
| `cenarios/resumo-cenarios-tcc.csv` | Cenários | Resumo dos 23 cenários, com separador ";" |
| `cenarios/cenarios-tcc-navegador.json` | Cenários | Os mesmos cenários no formato de cópia de segurança do navegador |
| `dados/base-geral-de-parametros.xlsx` | Dados | Planilha de parâmetros da operação, com volumes, densidades, rotas e tempos |
| `dados/dicionario-auditavel-de-dados-e-premissas.xlsx` | Dados | Uma linha por parâmetro, com valor, unidade, fórmula, origem, confiança e status |
| `docs/cenario-base-oficial.md` | Documentação | Ficha canônica do cenário-base, com todos os parâmetros e resultados |
| `docs/metodologia-do-simulador.md` | Documentação | Como a ferramenta foi construída e como funciona |
| `docs/cenario-de-prensagem-nos-ccs.md` | Documentação | Regras do cenário de prensas nos centros de coleta |

## Como verificar

É preciso ter o Node.js 18 ou superior.

```bash
cd 2-rccp/src
node --test rccp-model.test.cjs        # esperado: 48 aprovados, 0 falhas
node rccp-current-scenario.cjs         # reproduz o cenário-base
node rccp-sensitivity-audit.cjs        # reproduz as sensibilidades
```

Os testes rodam automaticamente a cada atualização do repositório, conforme o selo no README
principal.

Para abrir a interface a partir do código-fonte, sirva a pasta por HTTP local. Essa versão
carrega o React de uma CDN e por isso precisa de internet, ao contrário do arquivo offline.

```bash
cd 2-rccp/src
python3 -m http.server 8000             # depois abra http://localhost:8000
```

Para recompilar o arquivo único depois de alterar `src/`, use o comando abaixo.

```bash
node 2-rccp/reprodutibilidade/update-offline-bundle.mjs
```

## Resultados do cenário-base de 2025

| Indicador | Valor |
|---|---|
| Demanda integrada | 7.636,15 kg por semana (397.079,90 kg por ano) |
| Carga por viagem | 461,50 kg, limitada por volume |
| Ciclo agregado do caminhão | 116,96 min |
| Viagens possíveis por semana | 22 |
| Capacidade de transporte | 10.152,96 kg por semana |
| Utilização do transporte | 72,43%, recurso determinante |
| Utilização das equipes dos centros | de 3,00% a 15,75% |
| Utilização da equipe do hub | 16,37% |

## Limites da ferramenta

O RCCP trabalha com valores esperados e não gera fila, agenda, horário de partida, sequência de
rota nem trajetória temporal de estoque. Esses fenômenos pertencem ao modelo de simulação, na
pasta [`3-simul8/`](../3-simul8/).

## Observação sobre as fontes

A planilha `dados/base-geral-de-parametros.xlsx` arredonda a massa de cada combinação de centro
e família para duas casas decimais, e a soma dá 397.079,59 kg. O perfil de chegadas usado pelo
motor, em `src/arrival-profile-2025.js`, preserva o total de 397.079,90 kg obtido diretamente no
tratamento da base. A diferença de 0,31 kg por ano não altera nenhum resultado apresentado.
