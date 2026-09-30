# Planejamento agregado de capacidade na logística reversa da Green Mining

Repositório de códigos e materiais de apoio do Trabalho de Conclusão de Curso
**"Planejamento agregado em sistemas de logística reversa: aplicação a Green Mining"**,
apresentado à Escola de Engenharia Mauá do Centro Universitário do Instituto Mauá de
Tecnologia (IMT), curso de Engenharia de Produção, em 2026.

**Autores:** Fernando Andrade Rodrigues, Gabriel Camargo Pinceli, Isabella Ascenção e Kaio Rocha Barbosa
**Orientadora:** Profa. Dra. Joyce Zampirolli Scrivano

[![Testes do RCCP](https://github.com/fernandoanr/tcc-green-mining-capacidade/actions/workflows/testes.yml/badge.svg)](https://github.com/fernandoanr/tcc-green-mining-capacidade/actions/workflows/testes.yml)

## Objetivo

O trabalho investiga se a capacidade instalada da rede de logística reversa da Green Mining,
com cinco centros de coleta e um hub central em Santo Amaro, atende à demanda projetada até 2030.
A análise combina duas camadas de modelagem. A primeira é o planejamento agregado de
capacidade (RCCP, *Rough-Cut Capacity Planning*), e a segunda é a simulação de eventos
discretos (SED) no SIMUL8.

Este repositório reúne os códigos citados no Apêndice C do trabalho. O objetivo é permitir que
leitores e avaliadores inspecionem, executem e reproduzam as etapas descritas no texto sem que
o código precise ser transcrito no documento.

## Acesso rápido

| Ferramenta | Abrir no navegador |
|---|---|
| Calculadora de capacidade (RCCP) | <https://fernandoanr.github.io/tcc-green-mining-capacidade/2-rccp/calculadora-rccp-offline.html> |
| Dashboard de chegadas de 2025 | <https://fernandoanr.github.io/tcc-green-mining-capacidade/1-dashboard-chegadas/dashboard_chegadas_2025.html> |

Os dois arquivos também funcionam offline. Basta baixá-los e abrir com duplo clique.

## Estrutura

| Pasta | Conteúdo | Seções do TCC |
|---|---|---|
| [`1-dashboard-chegadas/`](1-dashboard-chegadas/) | Tratamento da base de chegadas em Python, ajuste das distribuições de intervalo entre chegadas, parâmetros calibrados para o SIMUL8 e dashboard interativo | 3.6.3 e 4.3 |
| [`2-rccp/`](2-rccp/) | Calculadora de capacidade em HTML e JavaScript, motor de cálculo, 48 testes automatizados, rotinas de auditoria, cenários de 2026 a 2030 e documentação do cenário-base | 3.6.5, 4.5.1 e 4.5.4 |
| [`3-simul8/`](3-simul8/) | Lógica do modelo de simulação exportada do SIMUL8 (*Visual Logic*), documentação técnica do modelo e rastreabilidade dos indicadores | 3.6.5, 4.5.2 e 4.5.3 |

Cada pasta tem um README próprio, que explica os arquivos e como executá-los.

## Versão citada no trabalho

A versão usada no TCC corresponde à *tag* [`v1.0.0`](https://github.com/fernandoanr/tcc-green-mining-capacidade/releases/tag/v1.0.0).
O modelo de capacidade vigente nessa versão é o `aggregate-rccp-as-is-v16`.

## Dados e confidencialidade

Os dados operacionais foram cedidos pela Green Mining para uso acadêmico. Este repositório
publica apenas **parâmetros e resultados agregados**, isto é, totais por centro e família de
material, médias, distribuições ajustadas e premissas de cenário.

- A base de chegadas original **não** é publicada. Ela contém registros individuais com nomes
  de pessoas físicas e de parceiros comerciais.
- O dashboard publicado foi preparado por `publicar_dashboard.py`. A rotina substitui os valores
  individuais de peso e de intervalo dos boxplots e histogramas por estatísticas agregadas.
- O arquivo do modelo SIMUL8 (`.S8`) e os *logs* da simulação não estão no repositório por
  causa do tamanho, pois o modelo tem cerca de 470 MB.

Para executar `tratamento_base_chegadas.py` é preciso ter a planilha `Base_Chegadas.xlsx`, que
pode ser solicitada aos autores mediante autorização da empresa.

## Como citar

> RODRIGUES, Fernando Andrade; PINCELI, Gabriel Camargo; ASCENÇÃO, Isabella; BARBOSA, Kaio Rocha.
> **Planejamento agregado de capacidade na logística reversa da Green Mining**: códigos e materiais de apoio do TCC.
> Versão 1.0.0. São Caetano do Sul: Instituto Mauá de Tecnologia, 2026. Disponível em:
> https://github.com/fernandoanr/tcc-green-mining-capacidade.

Os metadados de citação também estão em [`CITATION.cff`](CITATION.cff).

## Licença

O código é distribuído sob a licença MIT (ver [`LICENSE`](LICENSE)). Os dados e parâmetros da
Green Mining permanecem de titularidade da empresa e são disponibilizados apenas para fins
acadêmicos de verificação do trabalho.
