# 1. Dashboard de chegadas e parametrização do SIMUL8

Esta pasta contém a rotina em Python que trata a base de chegadas da Green Mining, forma os
eventos de chegada, ajusta as distribuições de intervalo entre chegadas e gera o dashboard
interativo usado para auditar os dados de entrada do modelo de simulação. Esse conteúdo
corresponde às seções 3.6.3 e 4.3 do TCC.

## Arquivos

| Arquivo | O que é |
|---|---|
| `tratamento_base_chegadas.py` | Rotina completa de leitura, limpeza, padronização, filtro do recorte de 2025, agrupamento em eventos, ajuste de distribuições pelo critério AIC, recalibração da frequência e geração do dashboard |
| `publicar_dashboard.py` | Prepara a versão pública do dashboard, substituindo os valores individuais dos boxplots e histogramas por estatísticas agregadas |
| `requirements.txt` | Bibliotecas Python e versões usadas na reprodução |
| `dashboard_chegadas_2025.html` | Dashboard publicado, que abre em qualquer navegador sem instalação |
| `resultados/parametros_simul8_hub_familia_2025_calibrados.csv` | Distribuição e parâmetros de chegada adotados no SIMUL8 para cada combinação de unidade e família de material |
| `resultados/resultado_estatistico_hub_familia_2025_final.csv` | Resultado do ajuste intradiário, com as cinco distribuições candidatas, AIC, KS e CV |
| `resultados/resumo_geral_hubs_2025_final.csv` | Chegadas e massa de 2025 por unidade |
| `resultados/auditoria_filtros_2025_final.txt` | Registro de cada filtro aplicado e do número de linhas afetadas |

## Regras do tratamento

- O recorte é exclusivamente o ano de 2025, aplicado antes de qualquer cálculo.
- A unidade de chegada é definida pelo campo Destino.
- Um evento de chegada é a combinação de unidade, família de material e data e hora. Os pesos
  de registros coincidentes são somados.
- As distribuições candidatas são Exponencial, Gamma, Weibull, Lognormal e Normal. O menor AIC
  define a família, e KS e CV servem de diagnóstico.
- O parâmetro temporal final é recalibrado pela frequência observada em 2025, ou seja, a média
  efetiva é o *Results Collection Period* dividido pelo número de chegadas.

## Resultado reproduzido

| Indicador | Valor |
|---|---|
| Registros na base original | 116.816 |
| Registros de 2025 | 55.613 |
| Registros no escopo do modelo | 32.348 |
| Eventos de chegada em 2025 | 22.043 |
| Massa recebida em 2025 | 397.079,90 kg |

## Como executar

```bash
pip install -r requirements.txt
python tratamento_base_chegadas.py --input Base_Chegadas.xlsx --out-dir saida
python publicar_dashboard.py --entrada saida/dashboard_chegadas_TCC_SIMUL8_2025_final.html \
                             --saida dashboard_chegadas_2025.html
```

A planilha `Base_Chegadas.xlsx` não está no repositório por conter registros individuais (ver o
README principal). A rotina também grava `base_eventos_agrupados_2025_final.csv`, com um evento
por linha. Esse arquivo é de uso interno e não deve ser publicado.

## Diferença entre o dashboard gerado e o publicado

O dashboard gerado diretamente pela rotina embute, nos boxplots e histogramas, o peso e o
intervalo de cada chegada. Na versão publicada, os boxplots trazem quartis, mediana, média e
limites de 1,5 vez o intervalo interquartil, e os histogramas trazem as classes já agrupadas.
A única diferença visível é que os pontos atípicos, desenhados um a um no original, não
aparecem na versão publicada, porque cada um corresponde a uma chegada individual. As séries
diárias e mensais, os mapas de calor, as tabelas e os parâmetros calibrados são idênticos nas
duas versões.
