# -*- coding: utf-8 -*-
"""
tratamento_base_chegadas.py

Pipeline consolidado para o TCC - RECORTE EXCLUSIVO DE 2025.

Regras principais:
- TODOS os cálculos usam somente registros com DataHora em 2025.
- 2022, 2023 e 2024 são excluídos antes de auditorias, agrupamentos,
  estatísticas, ajustes de distribuição, gráficos e exportações.
- HUB de chegada = Destino.
- Famílias: Papelão, Plástico e Longa Vida.
- Evento = Hub_Chegada + Família + DataHora.
- Peso do evento = soma dos registros do mesmo evento.
- Intervalos intradiários = diferenças positivas entre eventos consecutivos
  do mesmo HUB + Família, somente dentro do mesmo dia.
- Esses intervalos selecionam a família estatística e sua forma/variabilidade,
  mas NÃO são usados diretamente como frequência anual no SIMUL8.
- Distribuições candidatas: Exponencial, Gamma, Weibull, Lognormal e Normal.
- Menor AIC define a família estatística; KS e CV são diagnósticos.
- O parâmetro temporal final é recalibrado pela frequência observada em 2025:
  média efetiva alvo = Results Collection Period / N_Chegadas.
- Weibull/Gamma preservam shape; Lognormal preserva sigma; Exponencial recebe
  a nova média. Lognormal é exportada ao SIMUL8 como Average + Std Dev.
- Peso do SIMUL8 = peso médio observado por evento de chegada.
- Duplicidades exatas são auditadas dentro de 2025 e não removidas por padrão.

Uso:
    python tratamento_base_chegadas.py --input /caminho/Base_Chegadas.xlsx

Saídas (por padrão na pasta de saída informada):
- dashboard_chegadas_TCC_SIMUL8_2025_final.html
- resultado_estatistico_hub_familia_2025_final.csv
- parametros_simul8_hub_familia_2025_calibrados.csv
- resumo_geral_hubs_2025_final.csv
- base_eventos_agrupados_2025_final.csv
- auditoria_filtros_2025_final.txt
"""

from __future__ import annotations

import argparse
import html as htmlmod
import math
import os
import re
import unicodedata
from datetime import time as dt_time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
import plotly.graph_objects as go
import plotly.express as px
from plotly.offline import get_plotlyjs


# -----------------------------------------------------------------------------
# CONFIGURAÇÃO DO RECORTE DO TCC
# -----------------------------------------------------------------------------
STUDY_YEAR = 2025
REMOVE_EXACT_DUPLICATES = False

HUBS_MODELO = [
    "Brooklin", "Embu", "Jabaquara", "Paraisópolis", "Pinheiros", "Santo Amaro"
]
FAMILIAS_MODELO = ["Papelão", "Plástico", "Longa Vida"]

DIST_MODELS = {
    "Exponencial": stats.expon,
    "Gamma": stats.gamma,
    "Weibull": stats.weibull_min,
    "Lognormal": stats.lognorm,
    "Normal": stats.norm,
}
FREE_PARAMETER_COUNT = {
    "Exponencial": 1,
    "Gamma": 2,
    "Weibull": 2,
    "Lognormal": 2,
    "Normal": 2,
}
FIT_MIN_N = 5

# Horizonte efetivo utilizado no modelo durante a validação.
# Deve ser igual ao Results Collection Period do SIMUL8.
DEFAULT_RESULTS_COLLECTION_MIN = 140399.4999

# Referência documental: 2025 sem feriados, com 261 dias de 540 min
# e 52 sábados de 240 min, totalizaria 153.420 min.
NOMINAL_2025_OPERATION_MIN = 153420.0


# -----------------------------------------------------------------------------
# MAPEAMENTO E NORMALIZAÇÃO DE COLUNAS
# -----------------------------------------------------------------------------
def norm(s):
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s)


CANDIDATES = {
    "data": ["data", "datahora", "data hora", "data/hora"],
    "horario": ["horario", "hora"],
    "material": ["material"],
    "familia": ["familia", "família", "familia material"],
    "peso": ["peso (kg)", "peso_kg", "peso", "peso kg"],
    "destino": ["destino"],
    "coletor": ["coletor"],
    "status": ["status"],
    "origem": ["origem"],
    "lancamento": ["lancamento", "lançamento"],
    "ctr": ["n. de ctr", "ctr", "n ctr"],
}


def map_columns(df):
    norm_cols = {norm(c): c for c in df.columns}
    mapping, log = {}, []
    for key, cands in CANDIDATES.items():
        found = None
        cands_norm = [norm(c) for c in cands]
        for cand in cands_norm:
            if cand in norm_cols:
                found = norm_cols[cand]
                break
        if found is None:
            for nc, orig in norm_cols.items():
                if any(c and (c in nc or nc in c) for c in cands_norm):
                    found = orig
                    break
        mapping[key] = found
        log.append(f"Campo lógico '{key}' -> coluna original '{found}'")
    return mapping, log


def _time_to_timedelta(value):
    if pd.isna(value):
        return pd.NaT
    if isinstance(value, dt_time):
        return pd.Timedelta(
            hours=value.hour, minutes=value.minute,
            seconds=value.second, microseconds=value.microsecond
        )
    if isinstance(value, (int, float, np.integer, np.floating)):
        v = float(value)
        if 0 <= v < 1:
            return pd.to_timedelta(v, unit="D")
    s = str(value).strip()
    if not s or s.lower() in {"nan", "none", "nat"}:
        return pd.NaT
    td = pd.to_timedelta(s, errors="coerce")
    if pd.notna(td):
        return td
    parsed = pd.to_datetime(s, errors="coerce")
    if pd.notna(parsed):
        return pd.Timedelta(
            hours=parsed.hour, minutes=parsed.minute,
            seconds=parsed.second, microseconds=parsed.microsecond
        )
    return pd.NaT


def parse_datetime_columns(df, data_col, horario_col=None):
    base = pd.to_datetime(df[data_col], errors="coerce", dayfirst=True)
    if horario_col is None:
        return base

    # Só adiciona Horário quando Data não possui componente de hora.
    sem_hora = (
        base.notna()
        & base.dt.hour.eq(0)
        & base.dt.minute.eq(0)
        & base.dt.second.eq(0)
    )
    if sem_hora.any():
        td = df.loc[sem_hora, horario_col].apply(_time_to_timedelta)
        valid = td.notna()
        idx = td.index[valid]
        base.loc[idx] = base.loc[idx].dt.normalize() + td.loc[idx]
    return base


def canonical_family(value):
    n = norm(value)
    if not n:
        return None
    if "papelao" in n:
        return "Papelão"
    if "plastico" in n:
        return "Plástico"
    if "longa vida" in n or "longavida" in n:
        return "Longa Vida"
    return None


def extract_hub_name(value):
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    if not s or s.lower() in ("nan", "none"):
        return None

    m = re.search(r"HUB\s*:\s*PJ\s*:\s*(.+?)\s*\(", s, flags=re.IGNORECASE)
    if m:
        s = m.group(1).strip()
    else:
        m = re.search(r"HUB\s*:\s*(.+?)\s*\(", s, flags=re.IGNORECASE)
        if m:
            s = m.group(1).strip()

    n = norm(s)
    alias_map = [
        (("pinheiros",), "Pinheiros"),
        (("jabaquara",), "Jabaquara"),
        (("paraisopolis",), "Paraisópolis"),
        (("brooklin", "brooklyn"), "Brooklin"),
        (("embu",), "Embu"),
        (("santo amaro", "santamaro"), "Santo Amaro"),
        (("belem",), "Belém"),
        (("carapicuiba",), "Carapicuiba"),
        (("rio de janeiro",), "Rio de Janeiro"),
        (("camacari",), "Camaçari"),
    ]
    for aliases, canonical in alias_map:
        if any(a in n for a in aliases):
            return canonical
    return s


# -----------------------------------------------------------------------------
# LEITURA, FILTRO 2025 E PREPARAÇÃO
# -----------------------------------------------------------------------------
def process(input_path):
    log_filtros = []
    xls = pd.ExcelFile(input_path)
    sheet_name = "Consolidado" if "Consolidado" in xls.sheet_names else xls.sheet_names[0]
    df_raw = pd.read_excel(input_path, sheet_name=sheet_name)
    n_base_total = len(df_raw)
    log_filtros.append(f"Aba lida: {sheet_name}")
    log_filtros.append(f"Linhas carregadas da planilha original: {n_base_total}")

    mapping, col_log = map_columns(df_raw)
    log_filtros.extend(col_log)
    for required in ("data", "destino", "familia", "peso"):
        if mapping.get(required) is None:
            raise ValueError(f"Coluna obrigatória não encontrada para '{required}'.")

    # Constrói DataHora ANTES de qualquer análise, exclusivamente para aplicar
    # o recorte temporal. Tudo que não for 2025 é eliminado daqui em diante.
    data_col = mapping["data"]
    horario_col = mapping.get("horario")
    datahora_raw = parse_datetime_columns(df_raw, data_col, horario_col)
    n_data_invalida = int(datahora_raw.isna().sum())
    mask_2025 = datahora_raw.dt.year.eq(STUDY_YEAR)
    n_fora_2025 = int((~mask_2025 & datahora_raw.notna()).sum())

    df_raw = df_raw.loc[mask_2025].copy()
    df_raw["__DataHora_2025"] = datahora_raw.loc[mask_2025]
    n_2025_bruto = len(df_raw)

    log_filtros.append(f"Linhas com DataHora inválida na base original: {n_data_invalida}")
    log_filtros.append(f"Linhas excluídas por estarem fora de {STUDY_YEAR}: {n_fora_2025}")
    log_filtros.append(f"Linhas brutas mantidas no recorte {STUDY_YEAR}: {n_2025_bruto}")
    log_filtros.append(
        f"REGRA TCC: todos os cálculos, auditorias e ajustes abaixo usam somente {STUDY_YEAR}."
    )

    # Duplicidades agora são auditadas SOMENTE dentro de 2025.
    audit_cols = [c for c in df_raw.columns if c != "__DataHora_2025"]
    n_duplicadas_exatas = int(df_raw.duplicated(subset=audit_cols).sum())
    log_filtros.append(
        f"Duplicidades exatas detectadas dentro de {STUDY_YEAR} (auditoria): {n_duplicadas_exatas}"
    )
    if REMOVE_EXACT_DUPLICATES and n_duplicadas_exatas > 0:
        df_raw = df_raw.drop_duplicates(subset=audit_cols).copy()
        log_filtros.append("Duplicidades exatas removidas por configuração explícita.")
    else:
        log_filtros.append("Duplicidades exatas não removidas automaticamente.")

    df = df_raw.copy()
    rename_map = {v: k for k, v in mapping.items() if v is not None}
    df = df.rename(columns=rename_map)
    for optional in ("horario", "coletor", "status", "origem", "lancamento", "ctr", "material"):
        if optional not in df.columns:
            df[optional] = np.nan

    # Usa a DataHora já validada no recorte temporal.
    df["DataHora"] = df["__DataHora_2025"]
    df = df.drop(columns=["__DataHora_2025"])

    df["Hub_Chegada"] = df["destino"].apply(extract_hub_name)
    df["Hub_Coletor"] = df["coletor"].apply(extract_hub_name)
    df["Familia_Tratada"] = df["familia"].apply(canonical_family)
    df["Peso_Kg"] = pd.to_numeric(df["peso"], errors="coerce")

    for c in ("status", "origem", "lancamento", "ctr"):
        df[c] = df[c].replace({"": np.nan})

    mask_validas = (
        df["DataHora"].notna()
        & df["DataHora"].dt.year.eq(STUDY_YEAR)  # defesa adicional
        & df["Hub_Chegada"].notna()
        & df["Familia_Tratada"].isin(FAMILIAS_MODELO)
        & df["Peso_Kg"].notna()
        & (df["Peso_Kg"] > 0)
        & df["Hub_Chegada"].isin(HUBS_MODELO)
    )
    log_filtros.append(
        f"Linhas removidas pelos filtros de HUB/família/peso dentro de {STUDY_YEAR}: "
        f"{int((~mask_validas).sum())}"
    )
    df = df.loc[mask_validas].copy()

    df["Data_dt"] = df["DataHora"].dt.date
    df["Ano"] = STUDY_YEAR
    df["Mes"] = df["DataHora"].dt.month
    df["AnoMes"] = df["DataHora"].dt.strftime("%Y-%m")
    dias_semana_pt = {
        0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta",
        4: "Sexta", 5: "Sábado", 6: "Domingo"
    }
    df["DiaSemana_num"] = df["DataHora"].dt.weekday
    df["DiaSemana"] = df["DiaSemana_num"].map(dias_semana_pt)
    df["Hora"] = df["DataHora"].dt.hour

    def faixa_horaria(h):
        if 0 <= h < 6:
            return "00h-06h"
        if 6 <= h < 12:
            return "06h-12h"
        if 12 <= h < 18:
            return "12h-18h"
        return "18h-24h"

    df["Faixa_Horaria"] = df["Hora"].apply(faixa_horaria)

    def tipo_fluxo(row):
        hc, hd = row["Hub_Coletor"], row["Hub_Chegada"]
        if pd.isna(hc) or str(hc).strip() == "":
            return "Coletor não identificado"
        return (
            "Entrada local / coleta própria"
            if norm(hc) == norm(hd)
            else "Transferência / chegada de outro HUB"
        )

    df["Tipo_Fluxo"] = df.apply(tipo_fluxo, axis=1)
    log_filtros.append(f"Linhas finais no escopo do TCC ({STUDY_YEAR}): {len(df)}")

    criterios_modelo = pd.DataFrame({
        "Item": [
            "Recorte temporal", "HUB de chegada", "Famílias", "Evento de chegada",
            "Duplicidades exatas", "Intervalo intradiário", "Peso médio por chegada",
            "Escolha da família probabilística", "Calibração da frequência",
            "Lognormal no SIMUL8", "Dependência do horizonte"
        ],
        "Resultado": [
            f"Somente {STUDY_YEAR}. Registros de 2022, 2023 e 2024 são excluídos antes de todos os cálculos.",
            "Definido por Destino; Coletor permanece como origem operacional.",
            "Papelão, Plástico e Longa Vida.",
            "Hub_Chegada + Família + DataHora; pesos do mesmo evento são somados.",
            f"Auditadas somente dentro de {STUDY_YEAR}; sem remoção automática na configuração padrão.",
            "Diferença positiva entre eventos consecutivos do mesmo Hub + Família, apenas dentro do mesmo dia; usada para fitting da forma, não como frequência anual direta.",
            "Peso total dos eventos / número de eventos por Hub + Família.",
            "Menor AIC entre Exponencial, Gamma, Weibull, Lognormal e Normal; CV e KS são diagnósticos.",
            "Média efetiva alvo = Results Collection Period / N_Chegadas de 2025; preserva-se shape/sigma e reescala-se o parâmetro temporal.",
            "O fitting SciPy usa sigma + scale, mas a janela do SIMUL8 recebe Average + Std Dev equivalentes.",
            "Qualquer alteração do Results Collection Period ou do calendário operacional exige nova calibração dos parâmetros temporais."
        ]
    })

    info = {
        "study_year": STUDY_YEAR,
        "n_base_total": n_base_total,
        "n_2025_bruto": n_2025_bruto,
        "n_duplicadas_exatas_2025": n_duplicadas_exatas,
        "hubs_considerados": HUBS_MODELO,
        "familias_consideradas": FAMILIAS_MODELO,
    }
    return df, log_filtros, criterios_modelo, info


# -----------------------------------------------------------------------------
# EVENTOS E AJUSTE ESTATÍSTICO
# -----------------------------------------------------------------------------
def _mode_or_nan(s):
    m = s.dropna().mode()
    return m.iloc[0] if not m.empty else np.nan


def build_eventos(df):
    eventos = (
        df.groupby(["Hub_Chegada", "Familia_Tratada", "DataHora"], as_index=False)
        .agg(
            Peso_Kg=("Peso_Kg", "sum"),
            N_Linhas_Originais=("Peso_Kg", "size"),
            Hub_Coletor=("Hub_Coletor", _mode_or_nan),
            Tipo_Fluxo=("Tipo_Fluxo", _mode_or_nan),
            Origem=("origem", _mode_or_nan),
            Ano=("Ano", "first"),
            Mes=("Mes", "first"),
            AnoMes=("AnoMes", "first"),
            DiaSemana=("DiaSemana", "first"),
            DiaSemana_num=("DiaSemana_num", "first"),
            Hora=("Hora", "first"),
            Faixa_Horaria=("Faixa_Horaria", "first"),
            Data_dt=("Data_dt", "first"),
        )
    )
    return eventos.sort_values(
        ["Hub_Chegada", "Familia_Tratada", "DataHora"]
    ).reset_index(drop=True)


def fit_best_distribution(values):
    x = np.asarray(values, dtype=float)
    x = x[np.isfinite(x) & (x > 0)]
    result = {
        "n_intervalos": len(x), "distribuicoes": {}, "melhor_aic": None,
        "melhor_dist": None, "melhor_params": None, "ks_pvalue": None,
        "ks_stat": None, "media_ajustada": None
    }
    if len(x) < FIT_MIN_N:
        return result

    best_aic = np.inf
    for name, dist in DIST_MODELS.items():
        try:
            if name in ("Exponencial", "Gamma", "Weibull", "Lognormal"):
                params = dist.fit(x, floc=0)
            else:
                params = dist.fit(x)

            logpdf = dist.logpdf(x, *params)
            if not np.all(np.isfinite(logpdf)):
                continue
            loglik = float(np.sum(logpdf))
            k = FREE_PARAMETER_COUNT[name]
            aic = 2 * k - 2 * loglik
            ks_stat, ks_p = stats.kstest(x, dist.cdf, args=params)
            media_ajustada = float(dist.mean(*params))

            result["distribuicoes"][name] = {
                "params": tuple(float(p) for p in params),
                "aic": float(aic),
                "ks_p": float(ks_p),
                "ks_stat": float(ks_stat),
                "k_livres": k,
                "media_ajustada": media_ajustada,
            }
            if np.isfinite(aic) and aic < best_aic:
                best_aic = aic
                result.update({
                    "melhor_aic": float(aic),
                    "melhor_dist": name,
                    "melhor_params": tuple(float(p) for p in params),
                    "ks_pvalue": float(ks_p),
                    "ks_stat": float(ks_stat),
                    "media_ajustada": media_ajustada,
                })
        except Exception:
            continue
    return result


def _param_fields(dist_name, params):
    if not dist_name or params is None:
        return None, np.nan, None, np.nan
    if dist_name == "Exponencial":
        _, scale = params
        return "Mean", scale, None, np.nan
    if dist_name in ("Gamma", "Weibull"):
        shape, _, scale = params
        return "Shape", shape, "Scale", scale
    if dist_name == "Lognormal":
        sigma, _, scale = params
        return "Sigma", sigma, "Scale", scale
    if dist_name == "Normal":
        mean, std = params
        return "Mean", mean, "Std", std
    return None, np.nan, None, np.nan


def format_distribution_params(dist_name, params, unit="h"):
    if not dist_name or params is None:
        return "Dados insuficientes"
    if dist_name == "Exponencial":
        _, scale = params
        return f"Exponential(mean={scale:.4f} {unit})"
    if dist_name == "Gamma":
        shape, _, scale = params
        return f"Gamma(shape={shape:.4f}, scale={scale:.4f} {unit})"
    if dist_name == "Weibull":
        shape, _, scale = params
        return f"Weibull(shape={shape:.4f}, scale={scale:.4f} {unit})"
    if dist_name == "Lognormal":
        sigma, _, scale = params
        return f"Lognormal(sigma={sigma:.4f}, scale={scale:.4f} {unit})"
    if dist_name == "Normal":
        mean, std = params
        return f"Normal(mean={mean:.4f} {unit}, std={std:.4f} {unit})"
    return "Dados insuficientes"


def parametro_simul8(fit_result):
    """Representação do fitting intradiário, mantida para auditoria."""
    best = fit_result.get("melhor_dist")
    params = fit_result.get("melhor_params")
    if not best or params is None:
        return "Dados insuficientes", "Dados insuficientes", (None, np.nan, None, np.nan)
    return best, format_distribution_params(best, params), _param_fields(best, params)


def calibrate_simul8_distribution(fit_result, n_chegadas, results_collection_min):
    """
    Converte o fitting intradiário em parâmetros finais do SIMUL8.

    O fitting feito apenas com intervalos positivos do mesmo dia não contém:
    - a espera até a primeira chegada do dia;
    - dias sem ocorrência daquela combinação HUB + família;
    - intervalos noturnos e demais períodos fechados.

    Portanto, a família/forma vem do fitting, mas a frequência global é
    calibrada pela contagem observada em 2025:

        mean_target_min = Results Collection Period / N_Chegadas

    Para preservar a variabilidade relativa:
    - Exponencial: mean = mean_target_min;
    - Weibull: preserva shape e recalcula scale;
    - Gamma: preserva shape e recalcula scale;
    - Lognormal: preserva sigma e exporta Average + Std Dev para o SIMUL8;
    - Normal: preserva o CV do fitting e recalcula mean/std.
    """
    best = fit_result.get("melhor_dist")
    params = fit_result.get("melhor_params")
    if not best or params is None or not n_chegadas or n_chegadas <= 0:
        return {
            "dist": best or "Dados insuficientes",
            "mean_target_min": np.nan,
            "parametro_simul8": "Dados insuficientes",
            "p1_nome": None, "p1_valor": np.nan,
            "p2_nome": None, "p2_valor": np.nan,
            "scipy_params_calibrados": None,
        }

    mean_target = float(results_collection_min) / float(n_chegadas)

    if best == "Exponencial":
        return {
            "dist": best,
            "mean_target_min": mean_target,
            "parametro_simul8": f"Exponential(mean={mean_target:.4f} min)",
            "p1_nome": "Mean", "p1_valor": mean_target,
            "p2_nome": None, "p2_valor": np.nan,
            "scipy_params_calibrados": (0.0, mean_target),
        }

    if best == "Weibull":
        shape, _, _ = params
        shape = float(shape)
        scale = mean_target / math.gamma(1.0 + 1.0 / shape)
        return {
            "dist": best,
            "mean_target_min": mean_target,
            "parametro_simul8": f"Weibull(shape={shape:.4f}, scale={scale:.4f} min)",
            "p1_nome": "Shape", "p1_valor": shape,
            "p2_nome": "Scale", "p2_valor": float(scale),
            "scipy_params_calibrados": (shape, 0.0, float(scale)),
        }

    if best == "Gamma":
        shape, _, _ = params
        shape = float(shape)
        scale = mean_target / shape
        return {
            "dist": best,
            "mean_target_min": mean_target,
            "parametro_simul8": f"Gamma(shape={shape:.4f}, scale={scale:.4f} min)",
            "p1_nome": "Shape", "p1_valor": shape,
            "p2_nome": "Scale", "p2_valor": float(scale),
            "scipy_params_calibrados": (shape, 0.0, float(scale)),
        }

    if best == "Lognormal":
        sigma, _, _ = params
        sigma = float(sigma)
        std_target = mean_target * np.sqrt(np.exp(sigma ** 2) - 1.0)
        scale_equiv = mean_target / np.exp((sigma ** 2) / 2.0)
        return {
            "dist": best,
            "mean_target_min": mean_target,
            "parametro_simul8": (
                f"Log Normal(Average={mean_target:.4f} min, "
                f"Std Dev={std_target:.4f} min)"
            ),
            "p1_nome": "Average", "p1_valor": mean_target,
            "p2_nome": "Std Dev", "p2_valor": float(std_target),
            "scipy_params_calibrados": (sigma, 0.0, float(scale_equiv)),
        }

    if best == "Normal":
        raw_mean, raw_std = params
        raw_mean, raw_std = float(raw_mean), float(raw_std)
        cv_fit = abs(raw_std / raw_mean) if raw_mean != 0 else 0.0
        std_target = mean_target * cv_fit
        return {
            "dist": best,
            "mean_target_min": mean_target,
            "parametro_simul8": (
                f"Normal(mean={mean_target:.4f} min, std={std_target:.4f} min)"
            ),
            "p1_nome": "Mean", "p1_valor": mean_target,
            "p2_nome": "Std Dev", "p2_valor": float(std_target),
            "scipy_params_calibrados": (mean_target, float(std_target)),
        }

    return {
        "dist": best,
        "mean_target_min": mean_target,
        "parametro_simul8": "Dados insuficientes",
        "p1_nome": None, "p1_valor": np.nan,
        "p2_nome": None, "p2_valor": np.nan,
        "scipy_params_calibrados": None,
    }


def compute_intervalos_mesmo_dia(sub):
    sub = sub.sort_values("DataHora").copy()
    sub["Data_dt"] = sub["DataHora"].dt.date
    intervalos = []
    for _, g in sub.groupby("Data_dt"):
        t = g["DataHora"].sort_values().values
        if len(t) > 1:
            diffs_h = np.diff(t).astype("timedelta64[s]").astype(float) / 3600.0
            intervalos.extend(diffs_h.tolist())
    arr = np.asarray(intervalos, dtype=float)
    return arr[np.isfinite(arr) & (arr > 0)]


def build_stats_table(eventos, results_collection_min=DEFAULT_RESULTS_COLLECTION_MIN):
    rows = []
    for (hub, fam), g in eventos.groupby(["Hub_Chegada", "Familia_Tratada"]):
        g = g.sort_values("DataHora")
        pesos = g["Peso_Kg"].astype(float)
        n_chegadas = len(g)
        n_linhas_originais = int(g["N_Linhas_Originais"].sum())
        kg_total = float(pesos.sum())
        kg_medio = float(kg_total / n_chegadas) if n_chegadas else np.nan
        kg_medio_por_linha = float(kg_total / n_linhas_originais) if n_linhas_originais else np.nan

        intervalos_h = compute_intervalos_mesmo_dia(g)
        n_int = len(intervalos_h)
        if n_int:
            int_media = float(np.mean(intervalos_h))
            int_mediana = float(np.median(intervalos_h))
            int_std = float(np.std(intervalos_h, ddof=1)) if n_int > 1 else np.nan
            cv = float(int_std / int_media) if np.isfinite(int_std) and int_media > 0 else np.nan
        else:
            int_media = int_mediana = int_std = cv = np.nan

        fit_result = fit_best_distribution(intervalos_h)
        dist_fit, parametro_fit, _ = parametro_simul8(fit_result)
        calib = calibrate_simul8_distribution(
            fit_result, n_chegadas, results_collection_min
        )

        periodo_ini = g["DataHora"].min()
        periodo_fim = g["DataHora"].max()
        dias_com_chegada = int(g["DataHora"].dt.date.nunique())
        dias_periodo = max((periodo_fim - periodo_ini).days, 1)
        meses_periodo = max(dias_periodo / 30.44, 1 / 30.44)

        dists = fit_result.get("distribuicoes", {})
        row = {
            "Ano_Recorte": STUDY_YEAR,
            "Hub_Chegada": hub,
            "Familia_Tratada": fam,
            "N_Linhas_Originais": n_linhas_originais,
            "N_Chegadas": n_chegadas,
            "Kg_Total": kg_total,
            "Kg_Medio_por_Linha": kg_medio_por_linha,
            "Kg_Medio": kg_medio,
            "Kg_Mediano": float(pesos.median()) if n_chegadas else np.nan,
            "Kg_P90": float(pesos.quantile(0.90)) if n_chegadas else np.nan,
            "N_Intervalos": n_int,
            "Intervalo_Medio_h": int_media,
            "Intervalo_Mediano_h": int_mediana,
            "Media_Distribuicao_Ajustada_h": fit_result.get("media_ajustada"),
            "Desvio_Padrao_h": int_std,
            "CV": cv,
            "Dias_Com_Chegada": dias_com_chegada,
            "Chegadas_Por_Dia": n_chegadas / dias_com_chegada if dias_com_chegada else np.nan,
            "Chegadas_Por_Mes": n_chegadas / meses_periodo,
            "Periodo_Inicio": periodo_ini,
            "Periodo_Fim": periodo_fim,
            "Melhor_Dist_AIC": fit_result.get("melhor_dist"),
            "AIC": fit_result.get("melhor_aic"),
            "KS_pvalue": fit_result.get("ks_pvalue"),
            "KS_stat": fit_result.get("ks_stat"),
            "Distribuicao_Fit_Intradiario": dist_fit,
            "Parametro_Fit_Intradiario": parametro_fit,
            "Results_Collection_Min": float(results_collection_min),
            "Media_Efetiva_Alvo_min": calib["mean_target_min"],
            "Distribuicao_SIMUL8": calib["dist"],
            "Parametro_SIMUL8": calib["parametro_simul8"],
            "Parametro_1_Nome": calib["p1_nome"],
            "Parametro_1_Valor": calib["p1_valor"],
            "Parametro_2_Nome": calib["p2_nome"],
            "Parametro_2_Valor": calib["p2_valor"],
            "Kg_Esperado_Calibracao": kg_medio * n_chegadas,
            "_scipy_params_calibrados": calib["scipy_params_calibrados"],
            "_intervalos_h": intervalos_h,
        }
        for name in DIST_MODELS:
            row[f"AIC_{name}"] = dists.get(name, {}).get("aic", np.nan)
        rows.append(row)

    return pd.DataFrame(rows).sort_values(
        ["Hub_Chegada", "Familia_Tratada"]
    ).reset_index(drop=True)


# -----------------------------------------------------------------------------
# DASHBOARD HTML 2025
# -----------------------------------------------------------------------------
PREMIUM_GREEN_DARK = "#0B3D2E"
PREMIUM_GREEN = "#146356"
PREMIUM_GOLD = "#C9A227"
RAINBOW = [
    "#E63946", "#F4A261", "#E9C46A", "#2A9D8F", "#588157",
    "#7209B7", "#F72585", "#3A86FF", "#FFB703", "#06D6A0"
]
HUB_THEME = {
    "Jabaquara": "#0F9D58", "Pinheiros": "#00897B", "Embu": "#6A994E",
    "Brooklin": "#1B5E20", "Paraisópolis": "#00695C", "Santo Amaro": "#386641",
}
BG = "#FAFCF9"
GRID = "#E3EDE6"
FONT = "IBM Plex Sans, Segoe UI, Arial, sans-serif"


def hub_color(hub, idx=0):
    fallback = ["#2E7D32", "#00796B", "#558B2F", "#004D40", "#33691E", "#004225"]
    return HUB_THEME.get(hub, fallback[idx % len(fallback)])


def palette_for(offset=0, n=None):
    rot = RAINBOW[offset % len(RAINBOW):] + RAINBOW[:offset % len(RAINBOW)]
    return rot if n is None else rot[:n]


def _to_rgba(hexcolor, alpha):
    h = hexcolor.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


def style(fig, title=None, height=380):
    fig.update_layout(
        font=dict(family=FONT, size=12, color=PREMIUM_GREEN_DARK),
        paper_bgcolor=BG, plot_bgcolor=BG,
        margin=dict(l=50, r=30, t=60, b=40),
        legend=dict(bgcolor="rgba(0,0,0,0)"),
        xaxis=dict(gridcolor=GRID, zeroline=False),
        yaxis=dict(gridcolor=GRID, zeroline=False),
        height=height, colorway=RAINBOW,
    )
    if title:
        fig.update_layout(title=dict(
            text=title, x=0.02, xanchor="left",
            font=dict(size=15, color=PREMIUM_GREEN_DARK)
        ))
    return fig


def fig_div(fig, div_id):
    return fig.to_html(
        include_plotlyjs=False, full_html=False, div_id=div_id,
        config={"displaylogo": False, "modeBarButtonsToRemove": ["lasso2d", "select2d"]}
    )


def empty_msg(msg="Dados insuficientes para este gráfico."):
    return f'<div class="empty-chart">{htmlmod.escape(msg)}</div>'


def bar_counts(df, group_col, value_col=None, agg="count", title="", cid="", color=None):
    if value_col is None:
        s = df.groupby(group_col).size().sort_values(ascending=False)
        y_title = "Nº de chegadas"
    else:
        s = (
            df.groupby(group_col)[value_col].sum()
            if agg == "sum"
            else df.groupby(group_col)[value_col].mean()
        ).sort_values(ascending=False)
        y_title = "Kg" if agg == "sum" else value_col
    if s.empty:
        return empty_msg()
    pal = palette_for(0)
    colors = [color or pal[i % len(pal)] for i in range(len(s))]
    fig = go.Figure(go.Bar(
        x=s.index.astype(str), y=s.values,
        marker=dict(color=colors, line=dict(color="rgba(255,255,255,.6)", width=1)),
        text=[f"{v:,.0f}" for v in s.values], textposition="outside"
    ))
    fig.update_yaxes(title=y_title)
    return fig_div(style(fig, title), cid)


def line_evolution(df, period_col, title, cid, value_col=None, color=None):
    if value_col is None:
        s = df.groupby(period_col).size()
        y_title = "Nº de chegadas"
    else:
        s = df.groupby(period_col)[value_col].sum()
        y_title = "Kg"
    s = s.sort_index()
    if s.empty:
        return empty_msg()
    line_color = color or PREMIUM_GREEN
    fig = go.Figure(go.Scatter(
        x=s.index.astype(str), y=s.values, mode="lines+markers",
        line=dict(color=line_color, width=3, shape="spline"),
        marker=dict(size=7, color=PREMIUM_GOLD),
        fill="tozeroy", fillcolor=_to_rgba(line_color, 0.18)
    ))
    fig.update_yaxes(title=y_title)
    return fig_div(style(fig, title), cid)


def heatmap_dow_hour(df, title, cid):
    dow_order = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    pivot = df.pivot_table(
        index="DiaSemana", columns="Hora", values="Peso_Kg", aggfunc="count", fill_value=0
    ).reindex(dow_order)
    for h in range(24):
        if h not in pivot.columns:
            pivot[h] = 0
    pivot = pivot[sorted(pivot.columns)]
    if pivot.empty:
        return empty_msg()
    greenscale = [[0.0, "#F3FBF5"], [0.5, "#52B788"], [1.0, "#081C15"]]
    fig = go.Figure(go.Heatmap(
        z=pivot.values, x=[f"{h}h" for h in pivot.columns], y=pivot.index,
        colorscale=greenscale, colorbar=dict(title="Nº chegadas")
    ))
    return fig_div(style(fig, title), cid)


def pie_tipo_fluxo(df, title, cid):
    s = df["Tipo_Fluxo"].value_counts()
    if s.empty:
        return empty_msg()
    fig = go.Figure(go.Pie(
        labels=s.index, values=s.values, hole=0.45,
        marker=dict(colors=palette_for(3), line=dict(color="#FAFCF9", width=2))
    ))
    return fig_div(style(fig, title), cid)


def box_intervalos(eventos, hub, title, cid):
    sub = eventos[eventos["Hub_Chegada"] == hub]
    fig = go.Figure()
    any_data = False
    for i, fam in enumerate(sorted(sub["Familia_Tratada"].unique())):
        vals = compute_intervalos_mesmo_dia(sub[sub["Familia_Tratada"] == fam])
        if len(vals) >= 2:
            any_data = True
            fig.add_trace(go.Box(
                y=vals, name=fam, marker_color=palette_for(i)[0], boxmean=True
            ))
    if not any_data:
        return empty_msg()
    fig.update_yaxes(title="Intervalo entre chegadas (h) — mesmo dia")
    return fig_div(style(fig, title, 410), cid)


def hist_intervalos_distribuicao(eventos, hub, title, cid):
    sub = eventos[eventos["Hub_Chegada"] == hub]
    fig = go.Figure()
    any_data = False
    for i, fam in enumerate(sorted(sub["Familia_Tratada"].unique())):
        vals = compute_intervalos_mesmo_dia(sub[sub["Familia_Tratada"] == fam])
        if len(vals) < FIT_MIN_N:
            continue
        any_data = True
        color = RAINBOW[i % len(RAINBOW)]
        fig.add_trace(go.Histogram(
            x=vals, name=f"{fam} — observado", histnorm="probability density",
            opacity=0.55, marker=dict(color=color), nbinsx=min(35, max(10, len(vals)//5))
        ))
        fit = fit_best_distribution(vals)
        best, params = fit.get("melhor_dist"), fit.get("melhor_params")
        if best and params is not None:
            dist = DIST_MODELS[best]
            x_curve = np.linspace(max(vals.min(), 1e-3), vals.max(), 240)
            fig.add_trace(go.Scatter(
                x=x_curve, y=dist.pdf(x_curve, *params), mode="lines",
                name=f"{fam} — {best}", line=dict(color=color, width=3)
            ))
    if not any_data:
        return empty_msg()
    fig.update_layout(barmode="overlay")
    fig.update_xaxes(title="Intervalo entre chegadas (h) — mesmo dia")
    fig.update_yaxes(title="Densidade")
    return fig_div(style(fig, title, 440), cid)


def box_kg_cargas(eventos, hub, title, cid):
    sub = eventos[eventos["Hub_Chegada"] == hub]
    fig = go.Figure()
    any_data = False
    for i, fam in enumerate(sorted(sub["Familia_Tratada"].unique())):
        pesos = sub.loc[sub["Familia_Tratada"] == fam, "Peso_Kg"].astype(float)
        pesos = pesos[np.isfinite(pesos) & (pesos > 0)]
        if len(pesos) >= 2:
            any_data = True
            fig.add_trace(go.Box(
                y=pesos, name=fam, marker_color=RAINBOW[i % len(RAINBOW)], boxmean=True
            ))
    if not any_data:
        return empty_msg()
    fig.update_yaxes(title="Kg por chegada agrupada")
    return fig_div(style(fig, title, 410), cid)


def hist_kg_observado(eventos, hub, title, cid):
    sub = eventos[eventos["Hub_Chegada"] == hub]
    fig = go.Figure()
    any_data = False
    for i, fam in enumerate(sorted(sub["Familia_Tratada"].unique())):
        pesos = sub.loc[sub["Familia_Tratada"] == fam, "Peso_Kg"].astype(float).values
        pesos = pesos[np.isfinite(pesos) & (pesos > 0)]
        if len(pesos) >= 2:
            any_data = True
            fig.add_trace(go.Histogram(
                x=pesos, name=fam, opacity=0.60,
                marker=dict(color=RAINBOW[i % len(RAINBOW)]),
                nbinsx=min(35, max(10, len(pesos)//5))
            ))
    if not any_data:
        return empty_msg()
    fig.update_layout(barmode="overlay")
    fig.update_xaxes(title="Kg por chegada agrupada")
    fig.update_yaxes(title="Frequência")
    return fig_div(style(fig, title, 440), cid)


def stats_table_html(stats_df, table_id, hub=None):
    d = stats_df.copy()
    if hub:
        d = d[d["Hub_Chegada"] == hub]
    cols = [
        "Hub_Chegada", "Familia_Tratada", "N_Linhas_Originais", "N_Chegadas",
        "Kg_Medio_por_Linha", "Kg_Medio", "Intervalo_Medio_h", "CV",
        "Distribuicao_Fit_Intradiario", "Parametro_Fit_Intradiario",
        "Media_Efetiva_Alvo_min", "Distribuicao_SIMUL8", "Parametro_SIMUL8",
        "Kg_Esperado_Calibracao", "AIC", "KS_pvalue"
    ]
    labels = {
        "Hub_Chegada": "HUB", "Familia_Tratada": "Família",
        "N_Linhas_Originais": "Linhas da base", "N_Chegadas": "Chegadas alvo",
        "Kg_Medio_por_Linha": "Média por linha (kg)",
        "Kg_Medio": "Peso médio/chegada (kg)",
        "Intervalo_Medio_h": "Intervalo intradiário médio (h)", "CV": "CV",
        "Distribuicao_Fit_Intradiario": "Família selecionada (AIC)",
        "Parametro_Fit_Intradiario": "Fitting intradiário (auditoria)",
        "Media_Efetiva_Alvo_min": "Média efetiva alvo (min)",
        "Distribuicao_SIMUL8": "Distribuição SIMUL8",
        "Parametro_SIMUL8": "Parâmetro final no SIMUL8",
        "Kg_Esperado_Calibracao": "Kg alvo",
        "AIC": "AIC", "KS_pvalue": "KS p-value"
    }
    header = "".join(f"<th>{labels[c]}</th>" for c in cols)
    rows_html = []
    for _, r in d[cols].iterrows():
        cells = []
        for c in cols:
            v = r[c]
            if isinstance(v, (float, np.floating)):
                if pd.isna(v):
                    txt = "-"
                elif c == "KS_pvalue":
                    txt = f"{v:.5f}".replace(".", ",")
                elif c in ("Kg_Medio_por_Linha", "Kg_Medio", "Intervalo_Medio_h", "CV"):
                    txt = f"{v:.4f}".replace(".", ",")
                elif c == "Media_Efetiva_Alvo_min":
                    txt = f"{v:.4f}".replace(".", ",")
                elif c in ("Kg_Esperado_Calibracao", "AIC"):
                    txt = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                else:
                    txt = f"{v:.4f}".replace(".", ",")
            else:
                txt = str(v)
            cells.append(f"<td>{htmlmod.escape(txt)}</td>")
        rows_html.append("<tr>" + "".join(cells) + "</tr>")
    return (
        f'<div class="table-wrap"><table id="{table_id}" class="data-table">'
        f'<thead><tr>{header}</tr></thead><tbody>{"".join(rows_html)}</tbody></table></div>'
    )

def selected_distribution_chart(stats_df, title, cid):
    s = stats_df["Distribuicao_SIMUL8"].value_counts()
    if s.empty:
        return empty_msg()
    fig = go.Figure(go.Bar(
        x=s.index.astype(str), y=s.values,
        marker=dict(color=palette_for(6, len(s)), line=dict(color="rgba(255,255,255,.7)", width=1)),
        text=[str(int(v)) for v in s.values], textposition="outside"
    ))
    fig.update_yaxes(title="Combinações HUB × família", dtick=1)
    return fig_div(style(fig, title), cid)


def kpi_card(label, value, accent=None):
    style_attr = f' style="border-left:4px solid {accent};"' if accent else ""
    return (
        f'<div class="kpi-card"{style_attr}><div class="kpi-label">{htmlmod.escape(label)}</div>'
        f'<div class="kpi-value">{htmlmod.escape(str(value))}</div></div>'
    )


def fmt_kg(v):
    return f"{v:,.0f} kg".replace(",", ".")


def fmt_int(v):
    return f"{v:,.0f}".replace(",", ".")


def fmt_pct(v):
    return f"{v:.1f}%".replace(".", ",")


def slug(s):
    s2 = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Za-z0-9]+", "_", s2).strip("_")


def build_geral_tab(df, eventos, stats_df):
    n_chegadas = len(eventos)
    kg_total = eventos["Peso_Kg"].sum()
    periodo_ini = df["DataHora"].min().strftime("%d/%m/%Y")
    periodo_fim = df["DataHora"].max().strftime("%d/%m/%Y")
    pct_local = (df["Tipo_Fluxo"] == "Entrada local / coleta própria").mean() * 100
    pct_transf = (df["Tipo_Fluxo"] == "Transferência / chegada de outro HUB").mean() * 100

    reducao_agrupamento = (1 - n_chegadas / len(df)) * 100 if len(df) else 0
    kpis = "".join([
        kpi_card("Ano do TCC", STUDY_YEAR),
        kpi_card("Linhas válidas da base", fmt_int(len(df))),
        kpi_card("Chegadas agrupadas", fmt_int(n_chegadas)),
        kpi_card("Redução pelo agrupamento", fmt_pct(reducao_agrupamento)),
        kpi_card("Kg total recebido", fmt_kg(kg_total)),
        kpi_card("HUBs analisados", fmt_int(df["Hub_Chegada"].nunique())),
        kpi_card("Famílias analisadas", fmt_int(df["Familia_Tratada"].nunique())),
        kpi_card("Período efetivo", f"{periodo_ini} – {periodo_fim}"),
        kpi_card("Entrada local", fmt_pct(pct_local)),
        kpi_card("Transferência", fmt_pct(pct_transf)),
    ])

    charts = [
        bar_counts(eventos, "Hub_Chegada", title="Chegadas por HUB — 2025", cid="g_hub_n"),
        bar_counts(eventos, "Hub_Chegada", "Peso_Kg", "sum", "Kg recebido por HUB — 2025", "g_hub_kg"),
        bar_counts(eventos, "Familia_Tratada", title="Chegadas por Família — 2025", cid="g_fam_n"),
        bar_counts(eventos, "Familia_Tratada", "Peso_Kg", "sum", "Kg recebido por Família — 2025", "g_fam_kg"),
        line_evolution(eventos, "AnoMes", "Evolução mensal das chegadas — 2025", "g_mes_n"),
        line_evolution(eventos, "AnoMes", "Evolução mensal do Kg recebido — 2025", "g_mes_kg", "Peso_Kg"),
        heatmap_dow_hour(eventos, "Heatmap Dia da semana × Hora — 2025", "g_heat"),
        pie_tipo_fluxo(df, "Participação por Tipo de Fluxo — 2025", "g_fluxo"),
        selected_distribution_chart(stats_df, "Distribuições selecionadas por menor AIC — 2025", "g_dist_count"),
    ]
    chart_html = "".join(f'<div class="chart-card">{c}</div>' for c in charts)
    return f"""
    <div id="tab-geral" class="tab-content active">
      <div class="scope-banner"><b>Recorte oficial:</b> somente 2025. <b>Chegada</b> = HUB + família + DataHora. O fitting dos intervalos do mesmo dia seleciona a família e a forma; os parâmetros finais do SIMUL8 são <b>recalibrados pela frequência observada</b> e pelo Results Collection Period configurado.</div>
      <div class="kpi-grid">{kpis}</div>
      <div class="chart-grid two-col">{chart_html}</div>
      <h3 class="section-title">Fitting intradiário e parâmetros calibrados para o SIMUL8 — 2025</h3>
      {stats_table_html(stats_df, "g_stats")}
    </div>
    """


def build_hub_tab(hub, df, eventos, stats_df, idx=0):
    d = df[df["Hub_Chegada"] == hub]
    ev = eventos[eventos["Hub_Chegada"] == hub]
    sid = slug(hub)
    accent = hub_color(hub, idx)
    if d.empty:
        return f'<div id="tab-{sid}" class="tab-content">{empty_msg()}</div>'

    periodo_ini = d["DataHora"].min().strftime("%d/%m/%Y")
    periodo_fim = d["DataHora"].max().strftime("%d/%m/%Y")
    pct_local = (d["Tipo_Fluxo"] == "Entrada local / coleta própria").mean() * 100
    kpis = "".join([
        kpi_card("Ano", STUDY_YEAR, accent),
        kpi_card("Linhas válidas", fmt_int(len(d)), accent),
        kpi_card("Chegadas agrupadas", fmt_int(len(ev)), accent),
        kpi_card("Kg total", fmt_kg(ev["Peso_Kg"].sum()), accent),
        kpi_card("Período", f"{periodo_ini} – {periodo_fim}", accent),
        kpi_card("Entrada local", fmt_pct(pct_local), accent),
    ])
    charts = [
        bar_counts(ev, "Familia_Tratada", title=f"Chegadas por Família — {hub} — 2025", cid=f"{sid}_n"),
        bar_counts(ev, "Familia_Tratada", "Peso_Kg", "sum", f"Kg por Família — {hub} — 2025", f"{sid}_kg"),
        line_evolution(ev, "Data_dt", f"Evolução diária — {hub} — 2025", f"{sid}_dia", color=accent),
        line_evolution(ev, "AnoMes", f"Evolução mensal — {hub} — 2025", f"{sid}_mes", color=accent),
        heatmap_dow_hour(ev, f"Dia da semana × Hora — {hub} — 2025", f"{sid}_heat"),
        box_intervalos(eventos, hub, f"Intervalos por Família — {hub} — 2025", f"{sid}_box_int"),
        hist_intervalos_distribuicao(eventos, hub, f"Intervalos × distribuição ajustada — {hub} — 2025", f"{sid}_hist_int"),
        box_kg_cargas(eventos, hub, f"Kg por chegada agrupada — {hub} — 2025", f"{sid}_box_kg"),
        hist_kg_observado(eventos, hub, f"Histograma de Kg observados — {hub} — 2025", f"{sid}_hist_kg"),
    ]
    chart_html = "".join(f'<div class="chart-card">{c}</div>' for c in charts)
    return f"""
    <div id="tab-{sid}" class="tab-content">
      <div class="scope-banner"><b>{hub}:</b> o fitting intradiário é exibido para auditoria, mas a coluna <b>Parâmetro final no SIMUL8</b> já incorpora a calibração de frequência ao horizonte de coleta.</div>
      <div class="kpi-grid">{kpis}</div>
      <div class="chart-grid two-col">{chart_html}</div>
      <h3 class="section-title">Parâmetros calibrados do SIMUL8 — {hub} — 2025</h3>
      {stats_table_html(stats_df, f"{sid}_stats", hub=hub)}
    </div>
    """


CSS = r"""
:root{--green-dark:#0B3D2E;--green:#146356;--gold:#C9A227;--gray:#4B5D55;--bg:#F2F7F3;--card:#fff;--border:#DCEBE1;}
*{box-sizing:border-box}body{margin:0;font-family:'IBM Plex Sans',Segoe UI,Arial,sans-serif;background:var(--bg);color:#0B241B}
header{background:linear-gradient(120deg,#0B3D2E,#146356 55%,#1B7A5C);color:#fff;padding:28px 36px;box-shadow:0 6px 18px rgba(11,61,46,.25)}
header h1{margin:0 0 6px;font-size:27px}header p{margin:0;font-size:14px;opacity:.94}.year-chip{display:inline-block;margin-top:12px;padding:6px 10px;border-radius:999px;background:#fff;color:#0B3D2E;font-weight:700}
.methodology{background:#fff;margin:18px 36px 0;padding:16px 20px;border-left:5px solid var(--gold);border-radius:8px;font-size:13.5px;color:var(--gray);box-shadow:0 4px 14px rgba(11,61,46,.10)}
nav{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--border);display:flex;gap:4px;padding:0 36px;overflow-x:auto;z-index:50;box-shadow:0 2px 8px rgba(11,61,46,.06)}
nav button{--accent:#146356;background:none;border:none;padding:14px 18px;font-size:14px;font-weight:500;color:var(--gray);cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}nav button.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:700}
main{padding:24px 36px 60px}.tab-content{display:none}.tab-content.active{display:block}.scope-banner{background:#fff8db;border:1px solid #ead58d;padding:12px 14px;border-radius:9px;margin-bottom:18px;color:#5c4a05}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:22px}.kpi-card{background:linear-gradient(160deg,#fff,#F3FAF6);border:1px solid var(--border);border-radius:10px;padding:14px 16px;box-shadow:0 4px 12px rgba(11,61,46,.08)}.kpi-label{font-size:12px;color:var(--gray);margin-bottom:6px}.kpi-value{font-size:19px;font-weight:700;color:var(--green-dark)}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.chart-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px;box-shadow:0 10px 24px rgba(11,61,46,.08)}.empty-chart{padding:60px 20px;text-align:center;color:var(--gray)}.section-title{margin:28px 0 12px;font-size:16px;color:var(--green-dark)}
.table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 6px 16px rgba(11,61,46,.08)}table.data-table{border-collapse:collapse;width:100%;font-size:12.5px}table.data-table th{background:linear-gradient(180deg,#EAF6EF,#DFF0E6);color:var(--green-dark);text-align:left;padding:9px 10px;position:sticky;top:0;white-space:nowrap}table.data-table td{padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}table.data-table tr:hover td{background:#F3FAF6}
footer{padding:20px 36px;font-size:12px;color:var(--gray);text-align:center}@media(max-width:900px){.chart-grid{grid-template-columns:1fr}}
"""

JS = r"""
function resizeVisiblePlots(root){if(typeof Plotly==='undefined'||!root)return;root.querySelectorAll('.plotly-graph-div').forEach(function(gd){try{Plotly.Plots.resize(gd);}catch(e){}});}
function showTab(id,btn){document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));document.querySelectorAll('nav button').forEach(el=>el.classList.remove('active'));var target=document.getElementById('tab-'+id);target.classList.add('active');btn.classList.add('active');window.scrollTo({top:0,behavior:'instant'});setTimeout(()=>resizeVisiblePlots(target),80);}
window.addEventListener('load',function(){setTimeout(()=>resizeVisiblePlots(document.querySelector('.tab-content.active')),100);});
"""


def generate_html(df, eventos, stats_df, criterios_modelo, log_filtros, info, output_path, results_collection_min=DEFAULT_RESULTS_COLLECTION_MIN):
    hubs = sorted(df["Hub_Chegada"].unique())
    nav_buttons = ['<button class="active" onclick="showTab(\'geral\',this)">Geral</button>']
    hub_tabs = []
    for i, hub in enumerate(hubs):
        sid = slug(hub)
        nav_buttons.append(
            f'<button onclick="showTab(\'{sid}\',this)" style="--accent:{hub_color(hub,i)};">{htmlmod.escape(hub)}</button>'
        )
        hub_tabs.append(build_hub_tab(hub, df, eventos, stats_df, i))

    criterios_rows = "".join(
        f"<tr><td>{htmlmod.escape(str(r['Item']))}</td><td>{htmlmod.escape(str(r['Resultado']))}</td></tr>"
        for _, r in criterios_modelo.iterrows()
    )
    # Exemplo de auditoria que motivou a distinção entre linha e chegada agrupada.
    ex = stats_df[(stats_df["Hub_Chegada"] == "Paraisópolis") & (stats_df["Familia_Tratada"] == "Papelão")]
    if not ex.empty:
        er = ex.iloc[0]
        exemplo_auditoria = (
            f"Paraisópolis + Papelão: {int(er['N_Linhas_Originais'])} linhas da base → "
            f"{int(er['N_Chegadas'])} chegadas agrupadas; "
            f"média por linha = {er['Kg_Medio_por_Linha']:.3f} kg e "
            f"peso médio por chegada = {er['Kg_Medio']:.3f} kg."
        ).replace(".", ",")
    else:
        exemplo_auditoria = "Exemplo Paraísópolis + Papelão não disponível no recorte."

    criterios_html = f"""
    <div id="tab-criterios" class="tab-content">
      <div class="scope-banner"><b>Auditoria temporal:</b> 2022, 2023 e 2024 não entram em nenhuma métrica, gráfico, distribuição ou arquivo exportado.</div>
      <h3 class="section-title">Auditoria da unidade observacional</h3><div class="scope-banner">{htmlmod.escape(exemplo_auditoria)}</div>
      <h3 class="section-title">Critérios do modelo — recorte 2025</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Item</th><th>Resultado</th></tr></thead><tbody>{criterios_rows}</tbody></table></div>
      <h3 class="section-title">Log de processamento</h3><ul>{''.join(f'<li>{htmlmod.escape(x)}</li>' for x in log_filtros)}</ul>
    </div>
    """
    nav_buttons.append('<button onclick="showTab(\'criterios\',this)">Critérios / auditoria</button>')

    html_out = f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard de Chegadas — 2025 — SIMUL8 calibrado</title><style>{CSS}</style><script>{get_plotlyjs()}</script></head>
<body><header><h1>Dashboard de Chegadas — HUBs de Coleta</h1><p>Fitting intradiário, calibração de frequência e parâmetros finais para o SIMUL8.</p><span class="year-chip">Somente {STUDY_YEAR}</span></header>
<div class="methodology"><b>Regra temporal:</b> o pipeline elimina todos os registros fora de <b>{STUDY_YEAR}</b> antes de qualquer cálculo. Portanto, 2022, 2023 e 2024 não participam da calibração.<br><br><b>Unidade observacional:</b> uma chegada é definida por <b>Destino (HUB) + Família + DataHora</b>. Linhas coincidentes são agregadas e seus pesos são somados. O peso do SIMUL8 é a média por chegada agrupada.<br><br><b>Fitting intradiário:</b> os intervalos positivos entre eventos do mesmo HUB + família são calculados <b>somente dentro do mesmo dia</b>. Eles servem para selecionar a família probabilística e caracterizar sua forma/variabilidade. O menor AIC escolhe a família; KS e CV são diagnósticos.<br><br><b>Calibração de frequência:</b> os parâmetros do fitting intradiário <b>não são inseridos diretamente</b> no Start Point, porque não incorporam a primeira chegada do dia, dias sem evento e demais lacunas. Para o SIMUL8, a média efetiva é recalibrada por <b>Results Collection Period / número de chegadas observadas</b>. O horizonte desta versão é <b>{results_collection_min:,.4f} min</b>. Weibull/Gamma preservam shape; Lognormal preserva sigma, mas é convertida para os campos <b>Average</b> e <b>Std Dev</b> do SIMUL8; Exponencial recebe a nova média. Se o Results Collection Period mudar, os parâmetros temporais devem ser recalculados.<br><br><b>Meta de validação:</b> 22.043 eventos agrupados e aproximadamente 397.079,90 kg no recorte de 2025. Duplicidades exatas permanecem auditadas, sem remoção automática.</div>
<nav>{''.join(nav_buttons)}</nav><main>{build_geral_tab(df,eventos,stats_df)}{''.join(hub_tabs)}{criterios_html}</main>
<footer>Dashboard TCC — recorte {STUDY_YEAR} — gerado em Python (pandas, scipy, plotly)</footer><script>{JS}</script></body></html>"""
    Path(output_path).write_text(html_out, encoding="utf-8")


# -----------------------------------------------------------------------------
# EXPORTAÇÕES
# -----------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Dashboard SIMUL8 - recorte exclusivo 2025")
    parser.add_argument(
        "--input", default="dados/Base_Chegadas.xlsx",
        help="Caminho da planilha Base_Chegadas.xlsx"
    )
    parser.add_argument(
        "--out-dir", default="saidas",
        help="Diretório de saída"
    )
    parser.add_argument(
        "--results-collection-min", type=float,
        default=DEFAULT_RESULTS_COLLECTION_MIN,
        help=(
            "Results Collection Period efetivo do SIMUL8, em minutos. "
            "A calibração de frequência depende deste valor."
        )
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not input_path.exists():
        raise FileNotFoundError(
            f"Base não encontrada: {input_path}. Informe o caminho com --input."
        )

    print(f"Processando somente {STUDY_YEAR}: {input_path}")
    df, log_filtros, criterios, info = process(input_path)
    eventos = build_eventos(df)
    stats_df = build_stats_table(eventos, args.results_collection_min)

    html_path = out_dir / "dashboard_chegadas_TCC_SIMUL8_2025_final.html"
    generate_html(df, eventos, stats_df, criterios, log_filtros, info, html_path, args.results_collection_min)

    stats_out = stats_df.drop(columns=["_intervalos_h", "_scipy_params_calibrados"]).copy()
    stats_out.to_csv(out_dir / "resultado_estatistico_hub_familia_2025_final.csv", index=False, encoding="utf-8-sig")

    parametros_out = stats_out[[
        "Ano_Recorte", "Hub_Chegada", "Familia_Tratada", "N_Linhas_Originais", "N_Chegadas",
        "Kg_Medio_por_Linha", "Kg_Medio", "Intervalo_Medio_h", "Media_Distribuicao_Ajustada_h",
        "Distribuicao_Fit_Intradiario", "Parametro_Fit_Intradiario",
        "Results_Collection_Min", "Media_Efetiva_Alvo_min",
        "Distribuicao_SIMUL8", "Parametro_SIMUL8",
        "Parametro_1_Nome", "Parametro_1_Valor", "Parametro_2_Nome", "Parametro_2_Valor",
        "Kg_Esperado_Calibracao", "AIC", "KS_stat", "KS_pvalue"
    ]].copy().rename(columns={
        "Kg_Medio_por_Linha": "Peso_Medio_kg_por_linha",
        "Kg_Medio": "Peso_Medio_kg_por_chegada",
        "Intervalo_Medio_h": "Intervalo_Medio_Observado_h",
        "Media_Distribuicao_Ajustada_h": "Media_Teorica_Distribuicao_h",
    })
    parametros_out.to_csv(out_dir / "parametros_simul8_hub_familia_2025_calibrados.csv", index=False, encoding="utf-8-sig")

    resumo = eventos.groupby("Hub_Chegada").agg(
        N_Chegadas=("Peso_Kg", "count"), Kg_Total=("Peso_Kg", "sum")
    ).reset_index()
    resumo.insert(0, "Ano_Recorte", STUDY_YEAR)
    resumo.to_csv(out_dir / "resumo_geral_hubs_2025_final.csv", index=False, encoding="utf-8-sig")

    eventos.to_csv(out_dir / "base_eventos_agrupados_2025_final.csv", index=False, encoding="utf-8-sig")
    (out_dir / "auditoria_filtros_2025_final.txt").write_text("\n".join(log_filtros), encoding="utf-8")

    print(f"HTML: {html_path}")
    print(f"Eventos 2025: {len(eventos)}")
    print(f"Linhas finais 2025: {len(df)}")
    print(f"Results Collection Period usado: {args.results_collection_min:.4f} min")
    print(f"Kg alvo da calibração: {stats_df['Kg_Esperado_Calibracao'].sum():.2f} kg")


if __name__ == "__main__":
    main()


