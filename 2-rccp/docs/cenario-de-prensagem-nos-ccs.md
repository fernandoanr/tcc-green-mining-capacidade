# Cenário de prensagem nos CCs — 14/09/2026

Cenário opcional, desligado no baseline. Santo Amaro mantém seus parâmetros operacionais, materiais e demanda direta.

Cada CC permite informar quantidades separadas de prensas grandes e pequenas e, por material, a porcentagem mássica destinada à grande. A pequena recebe 100% menos essa porcentagem. As três porcentagens são independentes; cada material totaliza 100% entre as máquinas. Ambas prensam papelão, plástico e longa vida, sem setup.

| Material | Grande (kg/fardo) | Pequena (kg/fardo) |
|---|---:|---:|
| Papelão | 200 | 92 |
| Plástico | 115 | 53 |
| Longa vida | 260 | 120 |

Volumes: grande 0,539 m³/fardo; pequena 0,247 m³/fardo. Pesos de fardo levantados pela equipe do trabalho e arredondados para kg inteiros. São premissas de cenário, sem substituir os parâmetros do Hub ou a fonte histórica.

Tempo de prensagem por fardo: grande usa a referência vigente de papelão (20 min); pequena usa a referência vigente de plástico, igual à de longa vida (8 min). Movimentação mantém o tempo já parametrizado por material (papelão 10 min, plástico/longa vida 5 min); não há tempo de setup.

Pinheiros inicia com uma grande e nenhuma pequena; Jabaquara inicia com uma pequena e nenhuma grande. Os demais CCs usam uma pequena como hipótese inicial de cenário editável. Para dividir a produção, informar quantidade positiva para os dois tipos. Sem máquina para uma parcela positiva, o cenário é sinalizado como fisicamente inválido.

Fardos por material e prensa = massa semanal × fração da prensa ÷ peso do fardo. Volume de transporte = soma dos volumes dos fardos produzidos. A ocupação é calculada separadamente por tipo; a maior entre equipe, prensa grande e pequena limita o CC. Fardos já produzidos no CC não são prensados novamente no Hub e conservam peso e volume de origem para contagem e armazenagem. A regra de retirada por massa do Hub permanece vigente.

Validação: 48 testes do motor aprovados, incluindo balanço de massa, fardos e volumes com mix 25/75, extremos 0/100, falta de máquina, mix inválido e cenário desligado.
