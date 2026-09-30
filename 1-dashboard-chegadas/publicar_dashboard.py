# -*- coding: utf-8 -*-
"""
publicar_dashboard.py

Prepara a versão pública do dashboard de chegadas.

O dashboard gerado por tratamento_base_chegadas.py embute, nos boxplots e nos
histogramas, os valores individuais de cada chegada (peso e intervalo). Esta
rotina substitui esses valores por estatísticas agregadas, sem alterar o que o
leitor vê:

- boxplot  -> quartis, mediana, média e limites de 1,5 x IQR pré-calculados;
- histograma -> barras com as contagens (ou densidades) já agrupadas em classes.

Nenhum gráfico, tabela ou parâmetro calibrado é recalculado. O arquivo final não
contém registros individuais, datas/horários de chegadas isoladas, nomes de
pessoas ou de clientes.

Uso:
    python publicar_dashboard.py --entrada dashboard_chegadas_TCC_SIMUL8_2025_final.html \
                                 --saida dashboard_chegadas_2025.html
"""

from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path

import numpy as np

DTYPES = {"f8": "<f8", "f4": "<f4", "i4": "<i4", "i2": "<i2", "i1": "i1",
          "u1": "u1", "u2": "<u2", "u4": "<u4", "i8": "<i8"}


def valores(v) -> np.ndarray:
    """Converte a série do Plotly (lista ou bdata) em vetor numérico."""
    if isinstance(v, dict) and "bdata" in v:
        return np.frombuffer(base64.b64decode(v["bdata"]), dtype=DTYPES[v["dtype"]]).astype(float)
    return np.asarray([x for x in v if x is not None], dtype=float)


def agregar_box(t: dict) -> dict:
    eixo = "y" if "y" in t else "x"
    a = valores(t[eixo])
    a = a[np.isfinite(a)]
    novo = {k: v for k, v in t.items() if k not in ("x", "y", "boxpoints")}
    if a.size == 0:
        return novo
    q1, med, q3 = np.percentile(a, [25, 50, 75])
    iqr = q3 - q1
    lo = float(a[a >= q1 - 1.5 * iqr].min())
    hi = float(a[a <= q3 + 1.5 * iqr].max())
    cat = "x" if eixo == "y" else "y"
    novo.update({cat: [t.get("name", "")], "q1": [q1], "median": [med], "q3": [q3],
                 "lowerfence": [lo], "upperfence": [hi], "mean": [float(a.mean())],
                 "boxpoints": False})
    return novo


def agregar_histograma(t: dict) -> dict:
    a = valores(t["x"])
    a = a[np.isfinite(a)]
    nb = int(t.get("nbinsx") or 30)
    densidade = t.get("histnorm") in ("probability density", "density")
    prob = t.get("histnorm") in ("probability", "percent")
    cont, bordas = np.histogram(a, bins=nb, density=densidade)
    if prob:
        cont = cont / max(a.size, 1) * (100 if t.get("histnorm") == "percent" else 1)
    largura = float(bordas[1] - bordas[0]) if len(bordas) > 1 else 1.0
    novo = {k: v for k, v in t.items() if k not in ("x", "nbinsx", "histnorm", "type", "xbins")}
    novo.update({"type": "bar", "x": ((bordas[:-1] + bordas[1:]) / 2).tolist(),
                 "y": cont.tolist(), "width": largura})
    return novo


def main() -> None:
    ap = argparse.ArgumentParser(description="Versão pública do dashboard, sem registros individuais")
    ap.add_argument("--entrada", required=True)
    ap.add_argument("--saida", required=True)
    args = ap.parse_args()

    html = Path(args.entrada).read_text(encoding="utf-8")
    dec = json.JSONDecoder()
    partes, pos, n_box, n_hist = [], 0, 0, 0
    for m in re.finditer(r"Plotly\.newPlot\(\s*\"[^\"]+\",\s*", html):
        ini = m.end()
        if ini < pos:
            continue
        data, tam = dec.raw_decode(html[ini:])
        for i, t in enumerate(data):
            if t.get("type") == "box":
                data[i] = agregar_box(t); n_box += 1
            elif t.get("type") == "histogram":
                data[i] = agregar_histograma(t); n_hist += 1
        partes.append(html[pos:ini])
        partes.append(json.dumps(data, ensure_ascii=False))
        pos = ini + tam
    partes.append(html[pos:])
    Path(args.saida).write_text("".join(partes), encoding="utf-8")
    print(f"Boxplots agregados: {n_box} | histogramas agrupados: {n_hist}")


if __name__ == "__main__":
    main()
