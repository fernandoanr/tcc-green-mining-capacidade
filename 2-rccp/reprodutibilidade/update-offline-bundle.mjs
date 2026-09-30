import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");
const OFFLINE_PATH = path.join(
  PROJECT_DIR,
  "calculadora-rccp-offline.html"
);
const ARRIVAL_PROFILE_PATH = path.join(
  PROJECT_DIR,
  "src",
  "arrival-profile-2025.js"
);
const BASELINE_PATH = path.join(
  PROJECT_DIR,
  "src",
  "rccp-baseline.js"
);
const MODEL_PATH = path.join(
  PROJECT_DIR,
  "src",
  "rccp-model.js"
);
const INTERFACE_PATH = path.join(
  PROJECT_DIR,
  "src",
  "index.html"
);

const MANIFEST_TYPE = "__bundler/manifest";
const TEMPLATE_TYPE = "__bundler/template";
const NOTICE_TITLE = "Demandas e visitas editáveis por centro";
const NOTICE_MARKER = 'data-baseline-notice="1"';
const LEGACY_NOTICE_MARKER = "Massa e visitas permanecem independentes";
const MIX_NOTE_MARKER = 'data-baseline-mix-note="1"';
const LEGACY_MIX_NOTE_MARKER = "A porcentagem diz quanto de cada material chega naquele centro";
const EFFICIENCY_NOTE_CONFIGS = [
  {
    marker: 'data-efficiency-note="collection-centers"',
    legacyMarker: "Ninguém trabalha 100% do tempo",
  },
  {
    marker: 'data-efficiency-note="glossary"',
    legacyMarker: "Ninguém produz 100% do tempo",
  },
];
const DENSITY_RESULT_MARKER = 'data-density-result="weighted-mix-density"';
const DENSITY_CALCULATION_MARKER = 'data-density-calculation="1"';
const SUMMARY_SCREEN_MARKER = 'data-screen-label="Resumo geral"';
const CAPACITY_GAP_CHART_MARKER = 'data-capacity-gap-chart="1"';
const FLOW_SCREEN_MARKER = 'data-screen-label="Fluxo do processo"';
const HUB_SCREEN_MARKER = 'data-screen-label="Hub"';
const HUB_EXPEDITION_CARD_MARKER = 'data-hub-expedition-card="1"';
const HUB_TRIAGE_CONTROLS_MARKER = 'data-hub-triage-controls="1"';
const HUB_TRIAGE_LABEL = "Triagem de cargas vindas dos CCs";
const LEGACY_HUB_TRIAGE_LABEL = "Triagem externa adicional";
const REMOVED_DENSITY_TOOLTIP_SENTENCE = "Não existe mais um parâmetro global para editar.";
const DC_SCRIPT_TYPE = "text/x-dc";
const CENTER_GRID_ANCHOR =
  '  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px">\n' +
  '    <sc-for list="{{ centers }}" as="cc" hint-placeholder-count="4">';

const FORBIDDEN_ACTIVE_REFERENCE_PATTERNS = [
  {
    label: "referência à fonte tabular antiga",
    pattern: new RegExp(["Tabela", "1"].join("\\s+"), "i"),
  },
  {
    label: "contagem antiga de registros",
    pattern: /contagem de todos os registros locais válidos/i,
  },
  {
    label: "observação sobre procedência das densidades",
    pattern: /densidades de origem|calibração feita no SIMUL8/i,
  },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoForbiddenActiveReferences(text, label) {
  for (const item of FORBIDDEN_ACTIVE_REFERENCE_PATTERNS) {
    invariant(!item.pattern.test(text), `${label} ainda contém ${item.label}.`);
  }
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locateScriptPayload(html, type) {
  const pattern = new RegExp(
    `(<script\\b(?=[^>]*\\btype="${escapeRegExp(type)}")[^>]*>)([\\s\\S]*?)(<\\/script\\s*>)`,
    "gi"
  );
  const matches = Array.from(html.matchAll(pattern));
  invariant(matches.length === 1, `Esperado exatamente um script ${type}; encontrados ${matches.length}.`);
  const match = matches[0];
  const payloadStart = match.index + match[1].length;
  return {
    payload: match[2],
    payloadStart,
    payloadEnd: payloadStart + match[2].length,
  };
}

function parseBundle(html) {
  const manifestLocation = locateScriptPayload(html, MANIFEST_TYPE);
  const templateLocation = locateScriptPayload(html, TEMPLATE_TYPE);
  let manifest;
  let template;
  try {
    manifest = JSON.parse(manifestLocation.payload);
  } catch (error) {
    throw new Error(`Manifest inválido: ${error.message}`);
  }
  try {
    template = JSON.parse(templateLocation.payload);
  } catch (error) {
    throw new Error(`Template inválido: ${error.message}`);
  }
  invariant(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Manifest não é um objeto.");
  invariant(typeof template === "string", "Template decodificado não é texto.");
  return { manifest, template };
}

function decodeResource(entry, id) {
  invariant(entry && typeof entry === "object", `Recurso ${id} inválido.`);
  invariant(typeof entry.data === "string", `Recurso ${id} sem data em base64.`);
  invariant(
    entry.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(entry.data),
    `Base64 inválido no recurso ${id}.`
  );
  const packed = Buffer.from(entry.data, "base64");
  invariant(packed.toString("base64") === entry.data, `Base64 não canônico no recurso ${id}.`);
  if (!entry.compressed) return packed;
  try {
    return zlib.gunzipSync(packed);
  } catch (error) {
    throw new Error(`Falha ao descompactar o recurso ${id}: ${error.message}`);
  }
}

function validateAndDecodeManifest(manifest) {
  const decoded = new Map();
  const entries = Object.entries(manifest);
  invariant(entries.length > 0, "Manifest vazio.");
  for (const [id, entry] of entries) decoded.set(id, decodeResource(entry, id));
  return decoded;
}

function locateBaselineResource(manifest, decoded, template) {
  const signature = "root.RCCPBaseline = { create: create, MODEL_VERSION: MODEL_VERSION };";
  const candidates = Object.entries(manifest).filter(([id, entry]) => {
    if (!entry.compressed || !/javascript/i.test(String(entry.mime || ""))) return false;
    return decoded.get(id).toString("utf8").includes(signature);
  });
  invariant(
    candidates.length === 1,
    `Esperado um recurso compactado de rccp-baseline.js; encontrados ${candidates.length}.`
  );
  const [id, entry] = candidates[0];
  invariant(
    countOccurrences(template, `src="${id}"`) === 1,
    `O recurso de baseline ${id} não é referenciado exatamente uma vez pelo template.`
  );
  return { id, entry };
}

function locateArrivalProfileResource(manifest, decoded, template) {
  const signature = "root.RCCPArrivalProfile = profile;";
  const candidates = Object.entries(manifest).filter(([id, entry]) => {
    if (!entry.compressed || !/javascript/i.test(String(entry.mime || ""))) return false;
    return decoded.get(id).toString("utf8").includes(signature);
  });
  invariant(
    candidates.length === 1,
    `Esperado um recurso compactado de arrival-profile-2025.js; encontrados ${candidates.length}.`
  );
  const [id, entry] = candidates[0];
  invariant(
    countOccurrences(template, `src="${id}"`) === 1,
    `O perfil de chegadas ${id} não é referenciado exatamente uma vez pelo template.`
  );
  return { id, entry };
}

function locateModelResource(manifest, decoded, template) {
  const signature = "root.RCCPModel = api;";
  const candidates = Object.entries(manifest).filter(([id, entry]) => {
    if (!entry.compressed || !/javascript/i.test(String(entry.mime || ""))) return false;
    return decoded.get(id).toString("utf8").includes(signature);
  });
  invariant(
    candidates.length === 1,
    `Esperado um recurso compactado de rccp-model.js; encontrados ${candidates.length}.`
  );
  const [id, entry] = candidates[0];
  invariant(
    countOccurrences(template, `src="${id}"`) === 1,
    `O recurso do modelo ${id} não é referenciado exatamente uma vez pelo template.`
  );
  return { id, entry };
}

function extractContainingTag(text, marker, tagName) {
  invariant(countOccurrences(text, marker) === 1, `Marcador não único: ${marker}`);
  const markerIndex = text.indexOf(marker);
  const start = text.lastIndexOf(`<${tagName}`, markerIndex);
  const close = `</${tagName}>`;
  const endStart = text.indexOf(close, markerIndex);
  invariant(start >= 0 && endStart >= markerIndex, `Não foi possível isolar <${tagName}> para ${marker}.`);
  return {
    start,
    end: endStart + close.length,
    text: text.slice(start, endStart + close.length),
  };
}

function transitionExactly(text, before, after, label) {
  const beforeCount = countOccurrences(text, before);
  const afterCount = countOccurrences(text, after);
  if (beforeCount === 1 && afterCount === 0) return text.replace(before, after);
  if (beforeCount === 0 && afterCount === 1) return text;
  throw new Error(
    `Estado ambíguo em ${label}: ocorrências antigas=${beforeCount}, novas=${afterCount}.`
  );
}

function updateInputField(template, config) {
  const marker = `data-path="${config.dataPath}"`;
  const field = extractContainingTag(template, marker, "label");
  let updated = field.text;
  updated = transitionExactly(updated, config.oldLabel, config.newLabel, `${config.dataPath}: rótulo`);
  updated = transitionExactly(
    updated,
    `step="${config.oldStep}"`,
    `step="${config.newStep}"`,
    `${config.dataPath}: step`
  );
  updated = transitionExactly(
    updated,
    `>${config.oldUnit}</span>`,
    `>${config.newUnit}</span>`,
    `${config.dataPath}: unidade`
  );
  return template.slice(0, field.start) + updated + template.slice(field.end);
}

function normalizeSourceFragmentForBundle(fragment) {
  return fragment
    .replace(/\bonChange=/g, "sc-camel-on-change=")
    .replace(/\bonClick=/g, "sc-camel-on-click=")
    .replace(/\bonInput=/g, "sc-camel-on-input=")
    .replace(/\s+\/>/g, ">");
}

function replaceContainingTag(template, marker, tagName, replacement, label) {
  const current = extractContainingTag(template, marker, tagName);
  invariant(replacement && replacement.includes(marker), `Fragmento-fonte inválido em ${label}.`);
  return template.slice(0, current.start) + replacement + template.slice(current.end);
}

function replaceMigratingTag(template, currentMarker, replacementMarker, tagName, replacement, label) {
  const current = extractContainingTag(template, currentMarker, tagName);
  invariant(
    replacement && replacement.includes(replacementMarker),
    `Fragmento-fonte inválido em ${label}.`
  );
  return template.slice(0, current.start) + replacement + template.slice(current.end);
}

function replaceInlineScriptPayload(template, type, payload) {
  const location = locateScriptPayload(template, type);
  return template.slice(0, location.payloadStart) + payload + template.slice(location.payloadEnd);
}

function verifySourceInterface(sourceInterface) {
  assertNoForbiddenActiveReferences(sourceInterface, "A interface-fonte");
  invariant(
    countOccurrences(sourceInterface, NOTICE_MARKER) === 1,
    "Aviso neutro do cenário-base ausente ou duplicado."
  );
  const notice = extractContainingTag(sourceInterface, NOTICE_MARKER, "section").text;
  invariant(notice.includes(NOTICE_TITLE), "Título neutro do aviso do cenário-base ausente.");
  invariant(
    countOccurrences(sourceInterface, MIX_NOTE_MARKER) === 1,
    "Explicação neutra do mix ausente ou duplicada."
  );
  const mixNote = extractContainingTag(sourceInterface, MIX_NOTE_MARKER, "p").text;
  const efficiencyNotes = EFFICIENCY_NOTE_CONFIGS.map((config) => {
    invariant(
      countOccurrences(sourceInterface, config.marker) === 1,
      `Texto de eficiência ausente ou duplicado: ${config.marker}.`
    );
    return normalizeSourceFragmentForBundle(
      extractContainingTag(sourceInterface, config.marker, "p").text
    );
  });
  const fields = [
    {
      dataPath: "{{ cc.pDemand }}",
      label: "Demanda atual",
      step: "0.01",
      unit: "kg/sem",
    },
    {
      dataPath: "hub.directWeeklyMass",
      label: "Demanda direta atual",
      step: "0.01",
      unit: "kg/sem",
    },
  ];
  const inputFields = [];
  for (const config of fields) {
    const field = extractContainingTag(sourceInterface, `data-path="${config.dataPath}"`, "label").text;
    invariant(field.includes(config.label), `Rótulo esperado ausente na interface-fonte: ${config.label}.`);
    invariant(field.includes(`step="${config.step}"`), `Step esperado ausente para ${config.dataPath}.`);
    invariant(field.includes(`>${config.unit}</span>`), `Unidade esperada ausente para ${config.dataPath}.`);
    inputFields.push(normalizeSourceFragmentForBundle(field));
  }
  const visitFields = ["{{ cc.pVisits }}", "hub.directVisitsPerWeek"].map((dataPath) => {
    const field = extractContainingTag(sourceInterface, `data-path="${dataPath}"`, "label").text;
    invariant(field.includes("Visitas atuais"), `Rótulo de visitas ausente em ${dataPath}.`);
    invariant(!field.includes("(editável)"), `Rótulo de visitas ainda contém “editável” em ${dataPath}.`);
    invariant(field.includes('step="0.01"'), `Step de visitas incorreto em ${dataPath}.`);
    invariant(field.includes(">vis./sem</span>"), `Unidade de visitas ausente em ${dataPath}.`);
    return normalizeSourceFragmentForBundle(field);
  });
  invariant(countOccurrences(sourceInterface, 'data-path="mixDensity"') === 0, "A interface-fonte ainda expõe mixDensity.");
  invariant(countOccurrences(sourceInterface, DENSITY_RESULT_MARKER) === 1, "Resultado automático de densidade ausente ou duplicado.");
  const densityResult = normalizeSourceFragmentForBundle(
    extractContainingTag(sourceInterface, DENSITY_RESULT_MARKER, "div").text
  );
  invariant(
    !densityResult.includes(REMOVED_DENSITY_TOOLTIP_SENTENCE),
    "A frase removida ainda aparece no card explicativo de densidade."
  );
  invariant(
    countOccurrences(densityResult, DENSITY_CALCULATION_MARKER) === 1,
    "O cálculo não está dentro do card explicativo de densidade."
  );
  invariant(
    countOccurrences(densityResult, "{{ v.trg.mixDensityFormula }}") === 1,
    "A fórmula dinâmica de densidade está ausente ou duplicada."
  );
  invariant(
    densityResult.includes("Peso de 1 m³ do mix transportado"),
    "O rótulo do peso de 1 m³ do mix transportado está ausente."
  );
  const summaryScreen = normalizeSourceFragmentForBundle(
    extractContainingTag(sourceInterface, SUMMARY_SCREEN_MARKER, "main").text
  );
  invariant(
    countOccurrences(summaryScreen, CAPACITY_GAP_CHART_MARKER) === 1,
    "O gráfico de demanda, capacidade e gap está ausente ou duplicado."
  );
  for (const binding of [
    "{{ v.chart.utilization }}",
    "{{ v.chart.demand }}",
    "{{ v.chart.capacity }}",
    "{{ v.chart.gap }}",
    "{{ v.chart.primarySegment }}",
    "{{ v.chart.secondarySegment }}",
    "{{ is.chartSurplus }}",
    "{{ is.chartDeficit }}",
    "{{ is.chartBalanced }}",
  ]) {
    invariant(summaryScreen.includes(binding), `Binding do gráfico de capacidade ausente: ${binding}.`);
  }
  const flowScreen = normalizeSourceFragmentForBundle(
    extractContainingTag(sourceInterface, FLOW_SCREEN_MARKER, "main").text
  );
  invariant(
    flowScreen.includes("A equipe faz o atendimento e encaminha o material para a fila da prensa."),
    "A descrição concisa da entrega direta está ausente na aba Fluxo."
  );
  invariant(
    !flowScreen.includes("Esse fluxo pula"),
    "A explicação operacional excessiva ainda aparece na aba Fluxo."
  );
  const hubScreen = normalizeSourceFragmentForBundle(
    extractContainingTag(sourceInterface, HUB_SCREEN_MARKER, "main").text
  );
  invariant(
    countOccurrences(hubScreen, HUB_EXPEDITION_CARD_MARKER) === 1,
    "O card de expedição do Hub está ausente ou duplicado."
  );
  invariant(
    countOccurrences(hubScreen, HUB_TRIAGE_CONTROLS_MARKER) === 1,
    "Os controles de triagem do Hub estão ausentes ou duplicados."
  );
  invariant(hubScreen.includes(HUB_TRIAGE_LABEL), "O nome vigente da triagem do Hub está ausente.");
  invariant(!hubScreen.includes(LEGACY_HUB_TRIAGE_LABEL), "O nome antigo da triagem ainda aparece na aba Hub.");
  for (const binding of [
    'data-path="hub.externalTriageEnabled"',
    'data-path="hub.triageMinutesPerLoad"',
    'data-path="hub.triagePeople"',
  ]) {
    invariant(hubScreen.includes(binding), `Controle de triagem ausente: ${binding}.`);
  }
  for (const binding of [
    "{{ v.hubg.expeditionPeople }}",
    "{{ v.hubg.expeditionMinutes }}",
    "{{ v.hubg.expeditionWorkload }}",
    "{{ hubExpeditionRows }}",
    "{{ row.minimumBales }}",
    "{{ row.withdrawalMass }}",
  ]) {
    invariant(hubScreen.includes(binding), `Binding do card de expedição ausente: ${binding}.`);
  }
  const dcScriptPayload = locateScriptPayload(sourceInterface, DC_SCRIPT_TYPE).payload;
  invariant(
    !dcScriptPayload.includes(LEGACY_HUB_TRIAGE_LABEL),
    "O nome antigo da triagem ainda aparece na lógica da interface."
  );
  invariant(
    dcScriptPayload.includes('n(s.collectionTriggerVolume, 0) + " m³"'),
    "O fluxo dos Centros de Coleta não exibe o gatilho operacional do cenário."
  );
  return {
    notice: normalizeSourceFragmentForBundle(notice),
    mixNote: normalizeSourceFragmentForBundle(mixNote),
    efficiencyNotes,
    inputFields,
    visitFields,
    densityResult,
    summaryScreen,
    flowScreen,
    hubScreen,
    dcScriptPayload,
    glossaryScreen: extractContainingTag(sourceInterface, 'data-screen-label="Metodologia de cálculo"', "main").text,
    pressSection: extractContainingTag(sourceInterface, 'data-adv="press"', "section").text,
  };
}

function updateTemplate(template, sourceParts) {
  let updated = template;
  const noticeMarkerCount = countOccurrences(updated, NOTICE_MARKER);
  invariant(noticeMarkerCount <= 1, "Aviso neutro do cenário-base duplicado no template offline.");
  if (noticeMarkerCount === 1) {
    updated = replaceContainingTag(
      updated,
      NOTICE_MARKER,
      "section",
      sourceParts.notice,
      "aviso neutro do cenário-base"
    );
  } else if (countOccurrences(updated, LEGACY_NOTICE_MARKER) === 1) {
    updated = replaceMigratingTag(
      updated,
      LEGACY_NOTICE_MARKER,
      NOTICE_MARKER,
      "section",
      sourceParts.notice,
      "migração do aviso do cenário-base"
    );
  } else {
    invariant(
      countOccurrences(updated, CENTER_GRID_ANCHOR) === 1,
      "Não foi possível localizar de forma única o início dos cartões dos Centros de Coleta."
    );
    updated = updated.replace(CENTER_GRID_ANCHOR, `${sourceParts.notice}\n\n${CENTER_GRID_ANCHOR}`);
  }

  updated = replaceContainingTag(
    updated,
    'data-path="{{ cc.pDemand }}"',
    "label",
    sourceParts.inputFields[0],
    "demanda dos Centros de Coleta"
  );
  const directWeeklyMarker = 'data-path="hub.directWeeklyMass"';
  if (countOccurrences(updated, directWeeklyMarker) === 1) {
    updated = replaceContainingTag(
      updated,
      directWeeklyMarker,
      "label",
      sourceParts.inputFields[1],
      "demanda direta semanal do Hub"
    );
  } else {
    const legacyDirectAnnualMarker = 'data-path="hub.directAnnualMass"';
    invariant(
      countOccurrences(updated, legacyDirectAnnualMarker) === 1,
      "Não foi possível localizar de forma única a demanda direta do Hub."
    );
    updated = replaceMigratingTag(
      updated,
      legacyDirectAnnualMarker,
      directWeeklyMarker,
      "label",
      sourceParts.inputFields[1],
      "migração da demanda direta semanal do Hub"
    );
  }
  if (countOccurrences(updated, MIX_NOTE_MARKER) === 1) {
    updated = replaceContainingTag(
      updated,
      MIX_NOTE_MARKER,
      "p",
      sourceParts.mixNote,
      "explicação neutra do mix"
    );
  } else {
    invariant(
      countOccurrences(updated, LEGACY_MIX_NOTE_MARKER) === 1,
      "Não foi possível localizar de forma única a explicação do mix."
    );
    updated = replaceMigratingTag(
      updated,
      LEGACY_MIX_NOTE_MARKER,
      MIX_NOTE_MARKER,
      "p",
      sourceParts.mixNote,
      "migração da explicação do mix"
    );
  }
  EFFICIENCY_NOTE_CONFIGS.forEach((config, index) => {
    if (countOccurrences(updated, config.marker) === 1) {
      updated = replaceContainingTag(
        updated,
        config.marker,
        "p",
        sourceParts.efficiencyNotes[index],
        `texto de eficiência ${index + 1}`
      );
    } else {
      invariant(
        countOccurrences(updated, config.legacyMarker) === 1,
        `Não foi possível localizar de forma única o texto de eficiência ${index + 1}.`
      );
      updated = replaceMigratingTag(
        updated,
        config.legacyMarker,
        config.marker,
        "p",
        sourceParts.efficiencyNotes[index],
        `migração do texto de eficiência ${index + 1}`
      );
    }
  });
  updated = replaceContainingTag(
    updated,
    'data-path="{{ cc.pVisits }}"',
    "label",
    sourceParts.visitFields[0],
    "visitas dos Centros de Coleta"
  );
  updated = replaceContainingTag(
    updated,
    'data-path="hub.directVisitsPerWeek"',
    "label",
    sourceParts.visitFields[1],
    "visitas diretas do Hub"
  );
  if (countOccurrences(updated, 'data-path="mixDensity"') === 1) {
    const legacyDensity = extractContainingTag(updated, 'data-path="mixDensity"', "label");
    updated = updated.slice(0, legacyDensity.start) + sourceParts.densityResult + updated.slice(legacyDensity.end);
  } else {
    invariant(countOccurrences(updated, DENSITY_RESULT_MARKER) === 1, "Estado ambíguo do resultado automático de densidade.");
    updated = replaceContainingTag(
      updated,
      DENSITY_RESULT_MARKER,
      "div",
      sourceParts.densityResult,
      "resultado automático de densidade"
    );
  }
  updated = replaceContainingTag(
    updated,
    SUMMARY_SCREEN_MARKER,
    "main",
    sourceParts.summaryScreen,
    "aba Resumo geral e gráfico de capacidade"
  );
  updated = replaceContainingTag(
    updated,
    FLOW_SCREEN_MARKER,
    "main",
    sourceParts.flowScreen,
    "aba Fluxo do processo"
  );
  updated = replaceContainingTag(
    updated,
    HUB_SCREEN_MARKER,
    "main",
    sourceParts.hubScreen,
    "aba Hub e card de expedição"
  );
  updated = updated.includes('data-screen-label="Metodologia de cálculo"')
    ? replaceContainingTag(updated, 'data-screen-label="Metodologia de cálculo"', "main", sourceParts.glossaryScreen, "metodologia de prensagem")
    : replaceMigratingTag(updated, 'data-screen-label="Como calculamos"', 'data-screen-label="Metodologia de cálculo"', "main", sourceParts.glossaryScreen, "metodologia de prensagem");
  updated = replaceContainingTag(updated, 'data-adv="press"', "section", sourceParts.pressSection, "mix de prensagem dos CCs");
  updated = replaceInlineScriptPayload(updated, DC_SCRIPT_TYPE, sourceParts.dcScriptPayload);
  return updated;
}

function verifyUpdatedTemplate(template, sourceParts) {
  assertNoForbiddenActiveReferences(template, "O template offline");
  invariant(
    countOccurrences(template, NOTICE_MARKER) === 1,
    "Aviso neutro do cenário-base ausente ou duplicado."
  );
  invariant(countOccurrences(template, NOTICE_TITLE) === 1, "Título neutro do aviso ausente ou duplicado.");
  invariant(template.includes(sourceParts.notice), "Aviso neutro não corresponde à interface-fonte.");
  invariant(
    countOccurrences(template, MIX_NOTE_MARKER) === 1,
    "Explicação neutra do mix ausente ou duplicada."
  );
  invariant(template.includes(sourceParts.mixNote), "Explicação neutra do mix diverge da interface-fonte.");
  EFFICIENCY_NOTE_CONFIGS.forEach((config, index) => {
    invariant(
      countOccurrences(template, config.marker) === 1,
      `Texto de eficiência ${index + 1} ausente ou duplicado.`
    );
    invariant(
      template.includes(sourceParts.efficiencyNotes[index]),
      `Texto de eficiência ${index + 1} diverge da interface-fonte.`
    );
  });
  const expectations = [
    ["{{ cc.pDemand }}", "Demanda atual", "0.01", "kg/sem"],
    ["hub.directWeeklyMass", "Demanda direta atual", "0.01", "kg/sem"],
  ];
  for (const [dataPath, label, step, unit] of expectations) {
    const field = extractContainingTag(template, `data-path="${dataPath}"`, "label").text;
    invariant(field.includes(label), `Rótulo final ausente: ${label}.`);
    invariant(field.includes(`step="${step}"`), `Step final incorreto em ${dataPath}.`);
    invariant(field.includes(`>${unit}</span>`), `Unidade final incorreta em ${dataPath}.`);
  }
  for (const dataPath of ["{{ cc.pVisits }}", "hub.directVisitsPerWeek"]) {
    const field = extractContainingTag(template, `data-path="${dataPath}"`, "label").text;
    invariant(field.includes("Visitas atuais"), `Rótulo final de visitas incorreto em ${dataPath}.`);
    invariant(!field.includes("(editável)"), `Rótulo final de visitas ainda contém “editável” em ${dataPath}.`);
    invariant(field.includes('step="0.01"'), `Step final de visitas incorreto em ${dataPath}.`);
    invariant(field.includes(">vis./sem</span>"), `Unidade final de visitas incorreta em ${dataPath}.`);
  }
  invariant(countOccurrences(template, 'data-path="mixDensity"') === 0, "Input global mixDensity permaneceu no template.");
  invariant(countOccurrences(template, DENSITY_RESULT_MARKER) === 1, "Resultado automático de densidade ausente ou duplicado.");
  invariant(!template.includes(REMOVED_DENSITY_TOOLTIP_SENTENCE), "A frase removida permaneceu no template offline.");
  invariant(countOccurrences(template, DENSITY_CALCULATION_MARKER) === 1, "Cálculo de densidade ausente ou duplicado no card explicativo offline.");
  invariant(template.includes(sourceParts.densityResult), "Resultado automático de densidade diverge da interface-fonte.");
  invariant(countOccurrences(template, SUMMARY_SCREEN_MARKER) === 1, "Aba Resumo geral ausente ou duplicada.");
  invariant(
    countOccurrences(template, CAPACITY_GAP_CHART_MARKER) === 1,
    "Gráfico de demanda, capacidade e gap ausente ou duplicado no offline."
  );
  invariant(template.includes(sourceParts.summaryScreen), "Aba Resumo geral diverge da interface-fonte.");
  invariant(countOccurrences(template, FLOW_SCREEN_MARKER) === 1, "Aba Fluxo do processo ausente ou duplicada.");
  invariant(template.includes(sourceParts.flowScreen), "Aba Fluxo do processo diverge da interface-fonte.");
  invariant(countOccurrences(template, HUB_SCREEN_MARKER) === 1, "Aba Hub ausente ou duplicada.");
  invariant(
    countOccurrences(template, HUB_EXPEDITION_CARD_MARKER) === 1,
    "Card de expedição ausente ou duplicado no offline."
  );
  invariant(
    countOccurrences(template, HUB_TRIAGE_CONTROLS_MARKER) === 1,
    "Controles de triagem ausentes ou duplicados no offline."
  );
  invariant(template.includes(sourceParts.hubScreen), "Aba Hub diverge da interface-fonte.");
  invariant(
    locateScriptPayload(template, DC_SCRIPT_TYPE).payload === sourceParts.dcScriptPayload,
    "Lógica text/x-dc do offline diverge da interface-fonte."
  );
}

function safeScriptJson(value) {
  const serialized = JSON.stringify(value)
    .replace(/<\//g, "<\\u002F")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  invariant(!/<\/script/i.test(serialized), "Serialização contém fechamento </script> inseguro.");
  return serialized;
}

function replaceScriptPayload(html, type, serialized) {
  const location = locateScriptPayload(html, type);
  return html.slice(0, location.payloadStart) + `\n${serialized}\n  ` + html.slice(location.payloadEnd);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function validateCandidate(
  html,
  expectedArrivalProfile,
  expectedBaseline,
  expectedModel,
  expectedTemplate,
  arrivalProfileId,
  baselineId,
  modelId,
  sourceParts
) {
  const parsed = parseBundle(html);
  const decoded = validateAndDecodeManifest(parsed.manifest);
  invariant(decoded.has(arrivalProfileId), `Perfil de chegadas ${arrivalProfileId} desapareceu do manifest final.`);
  invariant(
    decoded.get(arrivalProfileId).equals(expectedArrivalProfile),
    "Perfil de chegadas final não é byte a byte igual ao fonte."
  );
  invariant(decoded.has(baselineId), `Recurso ${baselineId} desapareceu do manifest final.`);
  invariant(decoded.get(baselineId).equals(expectedBaseline), "Baseline final não é byte a byte igual ao fonte.");
  invariant(decoded.has(modelId), `Recurso ${modelId} desapareceu do manifest final.`);
  invariant(decoded.get(modelId).equals(expectedModel), "Modelo final não é byte a byte igual ao fonte.");
  invariant(parsed.template === expectedTemplate, "Template final diverge do template validado em memória.");
  verifyUpdatedTemplate(parsed.template, sourceParts);
  return parsed;
}

function writeAtomically(filePath, contents, mode) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, contents, "utf8");
    fs.chmodSync(temporaryPath, mode);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function main() {
  const originalStat = fs.statSync(OFFLINE_PATH);
  const originalHtml = fs.readFileSync(OFFLINE_PATH, "utf8");
  const arrivalProfileSource = fs.readFileSync(ARRIVAL_PROFILE_PATH);
  const baselineSource = fs.readFileSync(BASELINE_PATH);
  const modelSource = fs.readFileSync(MODEL_PATH);
  const sourceInterface = fs.readFileSync(INTERFACE_PATH, "utf8");
  const sourceParts = verifySourceInterface(sourceInterface);

  const originalBundle = parseBundle(originalHtml);
  const originalDecoded = validateAndDecodeManifest(originalBundle.manifest);
  const arrivalProfileResource = locateArrivalProfileResource(
    originalBundle.manifest,
    originalDecoded,
    originalBundle.template
  );
  const baselineResource = locateBaselineResource(
    originalBundle.manifest,
    originalDecoded,
    originalBundle.template
  );
  const modelResource = locateModelResource(
    originalBundle.manifest,
    originalDecoded,
    originalBundle.template
  );

  const updatedManifest = structuredClone(originalBundle.manifest);
  updatedManifest[arrivalProfileResource.id].data = zlib
    .gzipSync(arrivalProfileSource, { level: zlib.constants.Z_BEST_COMPRESSION, mtime: 0 })
    .toString("base64");
  updatedManifest[baselineResource.id].data = zlib
    .gzipSync(baselineSource, { level: zlib.constants.Z_BEST_COMPRESSION, mtime: 0 })
    .toString("base64");
  updatedManifest[modelResource.id].data = zlib
    .gzipSync(modelSource, { level: zlib.constants.Z_BEST_COMPRESSION, mtime: 0 })
    .toString("base64");
  const updatedTemplate = updateTemplate(originalBundle.template, sourceParts);
  verifyUpdatedTemplate(updatedTemplate, sourceParts);

  const manifestJson = safeScriptJson(updatedManifest);
  const templateJson = safeScriptJson(updatedTemplate);
  let candidateHtml = replaceScriptPayload(originalHtml, MANIFEST_TYPE, manifestJson);
  candidateHtml = replaceScriptPayload(candidateHtml, TEMPLATE_TYPE, templateJson);

  validateCandidate(
    candidateHtml,
    arrivalProfileSource,
    baselineSource,
    modelSource,
    updatedTemplate,
    arrivalProfileResource.id,
    baselineResource.id,
    modelResource.id,
    sourceParts
  );

  const changed = candidateHtml !== originalHtml;
  if (changed) writeAtomically(OFFLINE_PATH, candidateHtml, originalStat.mode);

  const finalHtml = fs.readFileSync(OFFLINE_PATH, "utf8");
  validateCandidate(
    finalHtml,
    arrivalProfileSource,
    baselineSource,
    modelSource,
    updatedTemplate,
    arrivalProfileResource.id,
    baselineResource.id,
    modelResource.id,
    sourceParts
  );
  console.log(`Bundle offline ${changed ? "atualizado" : "já estava sincronizado"}.`);
  console.log(`Recurso do perfil de chegadas: ${arrivalProfileResource.id}`);
  console.log(`Perfil de chegadas SHA-256: ${sha256(arrivalProfileSource)}`);
  console.log(`Recurso do baseline: ${baselineResource.id}`);
  console.log(`Baseline SHA-256: ${sha256(baselineSource)}`);
  console.log(`Modelo SHA-256: ${sha256(modelSource)}`);
  console.log(`Template: Resumo com gráfico de capacidade; Hub com triagem e expedição; peso de 1 m³ do mix transportado; lógica text/x-dc sincronizada.`);
}

try {
  main();
} catch (error) {
  console.error(`Falha segura: ${error.message}`);
  process.exitCode = 1;
}
