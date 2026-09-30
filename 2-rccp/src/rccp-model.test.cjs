"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./rccp-model.js");
const arrivalProfile = require("./arrival-profile-2025.js");
globalThis.RCCPArrivalProfile = arrivalProfile;
require("./rccp-baseline.js");

function approximately(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message || "valor"}: esperado ${expected}, obtido ${actual}`
  );
}

function baseScenario() {
  return globalThis.RCCPBaseline.create();
}

test("calendários separam 480 min do Transporte de 540 min dos CCs e Hub", () => {
  assert.equal(model.weeklyCalendarMinutes(baseScenario().calendar), 2940);
  assert.equal(model.weeklyTransportCalendarMinutes(baseScenario().calendar), 2640);
  assert.equal(
    model.weeklyTransportCalendarMinutes({
      weekdayMinutes: 540,
      saturdayMinutes: 240,
      weekdaysPerWeek: 5,
      saturdaysPerWeek: 1,
    }),
    2640
  );
});

test("dias trabalhados anualizam somente a capacidade e preservam a demanda anual de 52 semanas", () => {
  const baselineScenario = baseScenario();
  const baseline = model.calculateIntegrated(baselineScenario);
  assert.equal(baseline.annualization.workingDaysPerYear, 312);
  assert.equal(baseline.annualization.factor, 52);
  assert.equal(baseline.annualization.baselineWeeksPerYear, 52);
  approximately(
    baseline.annualization.transport.annualDemandKg,
    baseline.transport.totalDemand * 52,
    1e-9
  );
  approximately(
    baseline.annualization.transport.annualCapacityKg,
    baseline.transport.effectiveCapacity * 52,
    1e-9
  );
  approximately(
    baseline.annualization.integrated.annualUtilization,
    baseline.indicativeBottleneck.value,
    1e-9
  );
  assert.ok(baseline.annualization.integrated.annualSlackKg > 0);
  approximately(
    baseline.annualization.integrated.annualSlackKg,
    baseline.annualization.integrated.annualCapacityKg -
      baseline.annualization.integrated.annualDemandKg,
    1e-9,
    "gap positivo = capacidade − demanda"
  );

  const exactCapacityScenario = baseScenario();
  exactCapacityScenario.workingDaysPerYear =
    (6 * baseline.annualization.integrated.annualDemandKg) /
    baseline.annualization.integrated.weeklyCapacityKg;
  const exactCapacity = model.calculateIntegrated(exactCapacityScenario);
  approximately(exactCapacity.annualization.integrated.annualSlackKg, 0, 1e-9, "gap zero");
  approximately(exactCapacity.annualization.integrated.annualUtilization, 100, 1e-9);

  const halfDaysScenario = baseScenario();
  halfDaysScenario.workingDaysPerYear = 156;
  const halfDays = model.calculateIntegrated(halfDaysScenario);
  assert.equal(halfDays.annualization.factor, 26);
  assert.equal(
    halfDays.annualization.integrated.annualDemandKg,
    baseline.annualization.integrated.annualDemandKg
  );
  approximately(
    halfDays.annualization.integrated.annualCapacityKg,
    baseline.annualization.integrated.annualCapacityKg / 2,
    1e-9
  );
  approximately(
    halfDays.annualization.integrated.annualUtilization,
    baseline.annualization.integrated.annualUtilization * 2,
    1e-9
  );
  assert.ok(halfDays.annualization.integrated.annualSlackKg < 0);
  approximately(
    halfDays.annualization.integrated.annualSlackKg,
    halfDays.annualization.integrated.annualCapacityKg -
      halfDays.annualization.integrated.annualDemandKg,
    1e-9,
    "gap negativo = capacidade − demanda"
  );
  assert.equal(
    halfDays.annualization.collectionCenters.annualVisits[0].annualDemandVisits,
    baseline.annualization.collectionCenters.annualVisits[0].annualDemandVisits
  );
  approximately(
    halfDays.annualization.collectionCenters.annualVisits[0].annualCapacityVisits,
    baseline.annualization.collectionCenters.annualVisits[0].annualCapacityVisits / 2,
    1e-9
  );

  const legacyScenario = baseScenario();
  delete legacyScenario.workingDaysPerYear;
  assert.equal(
    model.calculateIntegrated(legacyScenario).annualization.workingDaysPerYear,
    model.DEFAULT_WORKING_DAYS_PER_YEAR
  );
});

test("regressão do transporte usa densidade por CC, ciclo agregado e partidas semanais", () => {
  const scenario = baseScenario();
  const densityByCenter = Object.fromEntries(
    scenario.routes.map((route) => [
      route.name,
      Object.fromEntries(route.materials.map((material) => [material.name, material.density])),
    ])
  );
  densityByCenter["Santo Amaro"] = Object.fromEntries(
    scenario.hub.directMaterials.map((material) => [material.name, material.density])
  );
  assert.deepEqual(densityByCenter, {
    Pinheiros: { "Papelão": 64.82, "Plástico": 34.54, "Longa vida": 92.11 },
    Jabaquara: { "Papelão": 49.2, "Plástico": 73.13, "Longa vida": 61.64 },
    "Paraisópolis": { "Papelão": 31.12, "Plástico": 14.46, "Longa vida": 38.57 },
    Brooklin: { "Papelão": 17, "Plástico": 33.63, "Longa vida": 89.68 },
    "Embu das Artes": { "Papelão": 73.92, "Plástico": 0, "Longa vida": 83.96 },
    "Santo Amaro": { "Papelão": 49.74, "Plástico": 32.73, "Longa vida": 65.66 },
  });
  const result = model.calculateTransport(scenario);
  approximately(result.tripCapacity, 461.49821502299216, 1e-9, "capacidade por viagem");
  approximately(result.weightedCycle, 116.96214457615923, 1e-9, "ciclo ponderado por viagens");
  approximately(result.simpleTravelMinutes, 29, 1e-9, "tempo simples por sentido");
  approximately(result.demandWeightedTravelMinutes, 32.7811609968, 1e-9, "tempo ponderado pela massa");
  approximately(result.capacityWeightedTravelMinutes, 30.132479877944004, 1e-9, "tempo ponderado pelas viagens");
  assert.equal(result.returnToHub, true);
  assert.equal(result.nominalWeekdayTrips, 4);
  assert.equal(result.nominalSaturdayTrips, 2);
  assert.equal(result.nominalTrips, 22);
  approximately(result.effectiveTripsUnrounded, 22, 1e-12);
  assert.equal(result.effectiveTrips, 22);
  assert.equal(result.transportWeekdayMinutes, 480);
  assert.equal(result.effectiveMinutes, 2640);
  approximately(result.effectiveCapacity, 10152.960730505827, 1e-6, "capacidade semanal");
  approximately(result.effectiveUtilization, 72.43362687507708, 1e-9, "utilização semanal");
});

test("eficiência do transporte reduz partidas semanais sem criar uma viagem por dia artificial", () => {
  const full = baseScenario();
  full.efficiency.transport = 100;
  const ninety = baseScenario();
  ninety.efficiency.transport = 90;
  const one = baseScenario();
  one.efficiency.transport = 1;
  assert.equal(model.calculateTransport(full).effectiveTrips, 22);
  assert.equal(model.calculateTransport(ninety).effectiveTrips, 19);
  assert.equal(model.calculateTransport(one).effectiveTrips, 0);
});

test("cada eficiência altera somente a disponibilidade do próprio grupo", () => {
  const original = baseScenario();
  const baseline = model.calculateIntegrated(original);

  const lowerCc = baseScenario();
  lowerCc.efficiency.collectionCenters = 50;
  const ccResult = model.calculateIntegrated(lowerCc);
  assert.equal(ccResult.transport.effectiveCapacity, baseline.transport.effectiveCapacity);
  assert.equal(ccResult.hub.effectiveMinutes, baseline.hub.effectiveMinutes);
  assert.ok(ccResult.collectionCenters.maxUtilization > baseline.collectionCenters.maxUtilization);

  const lowerHub = baseScenario();
  lowerHub.efficiency.hub = 50;
  const hubResult = model.calculateIntegrated(lowerHub);
  assert.equal(hubResult.transport.effectiveCapacity, baseline.transport.effectiveCapacity);
  assert.equal(hubResult.collectionCenters.maxUtilization, baseline.collectionCenters.maxUtilization);
  assert.ok(hubResult.hub.utilization > baseline.hub.utilization);

  const lowerTransport = baseScenario();
  lowerTransport.efficiency.transport = 50;
  const transportResult = model.calculateIntegrated(lowerTransport);
  assert.ok(transportResult.transport.effectiveCapacity < baseline.transport.effectiveCapacity);
  assert.equal(transportResult.hub.effectiveMinutes, baseline.hub.effectiveMinutes);
  assert.equal(
    transportResult.collectionCenters.centerResults[0].effectiveMinutes,
    baseline.collectionCenters.centerResults[0].effectiveMinutes
  );
});

test("eficiência reduz disponibilidade uma vez e não muda tempos de tarefa", () => {
  const scenario = baseScenario();
  const result = model.calculateIntegrated(scenario);
  assert.equal(scenario.modelVersion, "aggregate-rccp-as-is-v16");
  assert.deepEqual(scenario.efficiency, {
    transport: 100,
    collectionCenters: 100,
    hub: 100,
  });
  assert.deepEqual(scenario.service, {
    receptionMinutes: 0.5,
    weighingMinutes: 0.5,
    registrationMinutes: 1,
    segregationMinutes: 2,
  });
  assert.equal(result.collectionCenters.serviceMinutesPerVisit, 4);
  assert.equal(result.collectionCenters.centerResults[0].loadingMinutes, 20);
  assert.equal(scenario.unloadingMinutes, 30);
  assert.equal(result.collectionCenters.centerResults[0].effectiveMinutes, 5880);
  assert.equal(result.hub.effectiveMinutes, 17640);
});

test("perfil oficial consolida as chegadas por centro e material", () => {
  assert.equal(arrivalProfile.schemaVersion, "arrival-profile-v3");
  assert.equal(arrivalProfile.source.file, "Base Geral de Parâmetros.xlsx");
  assert.equal(arrivalProfile.source.sheet, "Volumes e Mixing");
  assert.equal(arrivalProfile.source.entryType, "chegada consolidada");
  assert.equal(
    arrivalProfile.source.visitRule,
    "quantidade oficial de chegadas por centro e material, somada por unidade e dividida por 52 semanas"
  );
  assert.equal(arrivalProfile.source.dateBasis, "ano-calendário de 2025");
  assert.equal(arrivalProfile.quality.rows2025, 22043);
  assert.equal(arrivalProfile.quality.localRows2025, 22043);
  assert.equal(arrivalProfile.quality.transferRows2025, 0);
  assert.equal(arrivalProfile.quality.inScopeRows, 22043);
  assert.equal(arrivalProfile.totals.collectionCenterVisits, 21388);
  assert.equal(arrivalProfile.totals.hubDirectVisits, 655);
  assert.equal(arrivalProfile.totals.allVisits, 22043);
  approximately(arrivalProfile.totals.selectedAnnualMassKg, 397079.9, 1e-9);
  assert.equal(arrivalProfile.quality.exactDuplicateRowsInScope, 0);
  assert.equal(arrivalProfile.quality.duplicateMassKgInScope, 0);
  assert.equal(arrivalProfile.centers.Brooklin.exactDuplicateRowsRetained, 0);
});

test("perfil preserva a massa oficial por família para sensibilidades auditáveis", () => {
  const pinheiros = arrivalProfile.centers.Pinheiros;
  const paraisopolis = arrivalProfile.centers.Paraisópolis;
  const hub = arrivalProfile.hubDirect;
  approximately(
    Object.values(pinheiros.observedMassKgBySelectedFamily).reduce((sum, value) => sum + value, 0),
    pinheiros.observedMassKgSelectedFamilies,
    1e-9,
    "massa selecionada de Pinheiros"
  );
  approximately(
    paraisopolis.observedMassKgBySelectedFamily.papelao,
    14817.1,
    1e-9,
    "papelão transacional de Paraisópolis"
  );
  approximately(
    Object.values(hub.observedMassKgBySelectedFamily).reduce((sum, value) => sum + value, 0),
    hub.observedMassKgSelectedFamilies,
    1e-9,
    "massa selecionada direta do Hub"
  );
});

test("baseline de demanda reconcilia a planilha oficial sem reduzir as visitas operacionais", () => {
  const scenario = baseScenario();
  const familyKeyByName = {
    "Papelão": "papelao",
    "Plástico": "plastico",
    "Longa vida": "longa vida",
  };
  let externalAnnualMass = 0;

  scenario.routes.forEach((route, index) => {
    const evidence = arrivalProfile.centers[route.name];
    const annualDemand = route.demand * 52;
    const materialMass = route.materials.reduce(
      (sum, material) => sum + material.annualMass,
      0
    );

    approximately(
      annualDemand,
      evidence.observedMassKgSelectedFamilies,
      1e-6,
      `demanda anual de ${route.name}`
    );
    approximately(materialMass, annualDemand, 1e-6, `mix anual de ${route.name}`);
    route.materials.forEach((material) => {
      approximately(
        material.annualMass,
        evidence.observedMassKgBySelectedFamily[familyKeyByName[material.name]],
        1e-6,
        `${route.name} / ${material.name}`
      );
    });
    approximately(
      scenario.centers[index].visitsPerWeek,
      evidence.visitsPerCalendarWeek,
      1e-12,
      `visitas operacionais de ${route.name}`
    );
    externalAnnualMass += annualDemand;
  });

  approximately(externalAnnualMass, 382416.2, 1e-6, "massa externa anual");
  approximately(
    scenario.hub.directWeeklyMass,
    arrivalProfile.hubDirect.observedMassKgSelectedFamilies / 52,
    1e-6,
    "massa direta semanal"
  );
  assert.equal(Object.hasOwn(scenario.hub, "directAnnualMass"), false);
  approximately(
    scenario.hub.directMaterials.reduce((sum, material) => sum + material.annualMass, 0),
    14663.7,
    1e-6,
    "mix direto anual"
  );
  approximately(
    scenario.hub.directVisitsPerWeek,
    arrivalProfile.hubDirect.visitsPerCalendarWeek,
    1e-12,
    "visitas diretas operacionais"
  );

  const result = model.calculateIntegrated(scenario);
  approximately(
    result.annualization.integrated.annualDemandKg,
    397079.9,
    1e-6,
    "massa total anual oficial"
  );
  approximately(
    result.transport.calculatedMixDensity,
    48.57875947610444,
    1e-9,
    "densidade reconciliada"
  );

  const expectedHubMass = {
    "Papelão": 327013.29,
    "Plástico": 58803.45,
    "Longa vida": 11263.16,
  };
  result.hub.materialResults.forEach((material) => {
    approximately(
      material.weeklyMass * 52,
      expectedHubMass[material.name],
      1e-6,
      `massa anual do Hub / ${material.name}`
    );
  });
});

test("perfil oficial reconcilia as chegadas e massas por material de Brooklin", () => {
  const brooklin = arrivalProfile.centers.Brooklin;
  assert.equal(brooklin.materialArrivals["longa vida"].arrivals, 695);
  assert.equal(brooklin.materialArrivals.papelao.arrivals, 1591);
  assert.equal(brooklin.materialArrivals.plastico.arrivals, 1111);
  assert.equal(brooklin.visitCount, 3397);
  assert.equal(brooklin.coverage.firstDate, "2025-01-01");
  assert.equal(brooklin.coverage.lastDate, "2025-12-31");
  assert.equal(brooklin.coverage.weeks, 52);
  approximately(
    brooklin.visitsPerObservedCoverageWeek,
    3397 / 52,
    1e-12,
    "chegadas semanais de Brooklin"
  );
  approximately(
    brooklin.visitsPerCalendarWeek,
    3397 / 52,
    1e-12,
    "chegadas anualizadas de Brooklin"
  );
  approximately(
    Object.values(brooklin.observedMassKgBySelectedFamily).reduce((sum, value) => sum + value, 0),
    19129.19,
    1e-9,
    "massa anual de Brooklin"
  );
});

test("helper operacional preserva o gatilho oficial de 15 m³ fora do cálculo RCCP", () => {
  assert.equal(model.shouldRequestCollection(14.999, false, 15), false);
  assert.equal(model.shouldRequestCollection(15, false, 15), true);
  assert.equal(model.shouldRequestCollection(15, true, 15), false);
});

test("dois operadores no carregamento consomem a carga oficial do CC", () => {
  const scenario = baseScenario();
  const result = model.calculateIntegrated(scenario);
  const jabaquara = result.collectionCenters.centerResults.find(
    (center) => center.name === "Jabaquara"
  );
  approximately(
    jabaquara.loadingWorkload,
    jabaquara.equivalentTrips * 30 * 2,
    1e-9,
    "carga de dois operadores"
  );
  assert.equal(jabaquara.loadingOperators, 2);
  assert.equal(jabaquara.effectiveMinutes, 2 * 2940);
});

test("entrega direta no Hub consome 4 min e não gera descarga nem triagem", () => {
  const withoutDirect = baseScenario();
  withoutDirect.hub.directVisitsPerWeek = 0;
  const baseline = model.calculateIntegrated(withoutDirect);
  const withDirect = baseScenario();
  withDirect.hub.directVisitsPerWeek = 10;
  const result = model.calculateIntegrated(withDirect);
  assert.equal(result.hub.directServiceWorkload, 40);
  assert.equal(result.hub.triageWorkload, baseline.hub.triageWorkload);
  assert.equal(result.hub.triageLoadsPerWeek, baseline.hub.triageLoadsPerWeek);
  assert.equal(result.hub.directTriageLoadsPerWeek, 0);
  assert.equal(result.hub.externalUnloadWorkload, baseline.hub.externalUnloadWorkload);
  assert.equal(result.hub.knownWorkload - baseline.hub.knownWorkload, 40);
  assert.equal(result.hub.externalTriageEnabled, true);
  assert.equal(result.hub.triageMinutesPerLoad, 0);
  assert.equal(result.hub.triagePeople, 1);
  assert.equal(result.hub.triageWorkload, 0);

  const withTriage = baseScenario();
  withTriage.hub.triageMinutesPerLoad = 10;
  withTriage.hub.triagePeople = 2;
  const triageResult = model.calculateIntegrated(withTriage);
  approximately(
    triageResult.hub.triageWorkload,
    triageResult.hub.triageLoadsPerWeek * 10 * 2,
    1e-9,
    "carga de triagem simulada"
  );
  assert.ok(triageResult.hub.knownWorkload > result.hub.knownWorkload);
});

test("mix do Hub acompanha a massa editada e conserva o balanço semanal", () => {
  const scenario = baseScenario();
  const baseline = model.calculateIntegrated(scenario);
  const baselinePressing = baseline.hub.pressingWorkload;
  scenario.routes.forEach((route) => {
    route.demand *= 2;
  });
  const result = model.calculateIntegrated(scenario);
  const materialMass = result.hub.materialResults.reduce(
    (sum, material) => sum + material.weeklyMass,
    0
  );
  approximately(
    materialMass,
    result.transport.totalDemand + result.hub.directWeeklyMass,
    1e-9,
    "massa do mix no Hub"
  );
  approximately(result.hub.materialMassBalanceDifference, 0, 1e-9, "diferença do balanço");
  assert.ok(result.hub.pressingWorkload > baselinePressing);
});

test("mix calibrado por unidade reconcilia exatamente o mix processado no Hub", () => {
  const result = model.calculateIntegrated(baseScenario());
  result.transport.routeResults.forEach((route) => {
    assert.equal(route.mixValid, true);
    approximately(route.mixPercentTotal, 100, 1e-9, "total do mix de " + route.name);
    approximately(
      route.materialResults.reduce((sum, material) => sum + material.weeklyMass, 0),
      route.demand,
      1e-9,
      "massa fixa de " + route.name
    );
  });
  assert.equal(result.hub.directMixValid, true);
  approximately(result.hub.directMixPercentTotal, 100, 1e-9, "mix direto");
  const expectedAnnualMass = {
    "Papelão": 327013.29,
    "Plástico": 58803.45,
    "Longa vida": 11263.16,
  };
  result.hub.materialResults.forEach((material) =>
    approximately(
      material.weeklyMass,
      expectedAnnualMass[material.name] / 52,
      1e-9,
      "massa semanal no Hub de " + material.name
    )
  );
  approximately(result.hub.materialMassBalanceDifference, 0, 1e-9);
});

test("editar o mix de um CC mantém sua massa e recalcula volume, viagens e Hub", () => {
  const scenario = baseScenario();
  const baseline = model.calculateIntegrated(scenario);
  scenario.routes[0].materials[0].mixPercent = 0;
  scenario.routes[0].materials[1].mixPercent = 100;
  scenario.routes[0].materials[2].mixPercent = 0;
  const result = model.calculateIntegrated(scenario);
  const baselineRoute = baseline.transport.routeResults[0];
  const changedRoute = result.transport.routeResults[0];

  assert.equal(changedRoute.mixValid, true);
  approximately(
    changedRoute.materialResults.reduce((sum, material) => sum + material.weeklyMass, 0),
    baselineRoute.demand,
    1e-9,
    "massa semanal fixa do CC"
  );
  assert.notEqual(changedRoute.weeklyVolumeDemand, baselineRoute.weeklyVolumeDemand);
  assert.notEqual(changedRoute.equivalentTrips, baselineRoute.equivalentTrips);
  assert.equal(result.transport.totalDemand, baseline.transport.totalDemand);
  assert.notEqual(result.transport.effectiveCapacity, baseline.transport.effectiveCapacity);
  assert.ok(
    result.hub.materialResults.find((material) => material.name === "Plástico").weeklyMass >
      baseline.hub.materialResults.find((material) => material.name === "Plástico").weeklyMass
  );
  approximately(result.hub.materialMassBalanceDifference, 0, 1e-9);
});

test("editar o mix direto altera volume e Hub sem criar triagem nem afetar Transporte", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const scenario = baseScenario();
  scenario.hub.directMaterials[0].mixPercent = 0;
  scenario.hub.directMaterials[1].mixPercent = 0;
  scenario.hub.directMaterials[2].mixPercent = 100;
  const result = model.calculateIntegrated(scenario);

  assert.equal(result.transport.effectiveCapacity, baseline.transport.effectiveCapacity);
  assert.equal(result.hub.totalWeeklyMass, baseline.hub.totalWeeklyMass);
  assert.equal(result.hub.triageWorkload, baseline.hub.triageWorkload);
  assert.notEqual(
    result.hub.directMaterialProfile.weeklyVolumeDemand,
    baseline.hub.directMaterialProfile.weeklyVolumeDemand
  );
  assert.ok(
    result.hub.materialResults.find((material) => material.name === "Longa vida").weeklyMass >
      baseline.hub.materialResults.find((material) => material.name === "Longa vida").weeklyMass
  );
  approximately(result.hub.materialMassBalanceDifference, 0, 1e-9);
});

test("mix inválido mantém massa total para cálculo e gera erro físico com tolerância clara", () => {
  const scenario = baseScenario();
  scenario.routes[0].materials[0].mixPercent = 60;
  scenario.routes[0].materials[1].mixPercent = 30;
  scenario.routes[0].materials[2].mixPercent = 10.06;
  const result = model.calculateIntegrated(scenario);
  const route = result.transport.routeResults[0];

  assert.equal(route.mixValid, false);
  approximately(route.mixPercentTotal, 100.06, 1e-9);
  approximately(
    route.materialResults.reduce((sum, material) => sum + material.weeklyMass, 0),
    route.demand,
    1e-9,
    "massa preservada mesmo com erro de soma"
  );
  assert.ok(
    result.physicalConstraints.issues.some(
      (issue) =>
        issue.code === "MATERIAL_MIX_INVALID" && issue.center === "Pinheiros"
    )
  );

  scenario.routes[0].materials[2].mixPercent = 10.04;
  const withinTolerance = model.calculateIntegrated(scenario);
  assert.equal(withinTolerance.transport.routeResults[0].mixValid, true);
  assert.equal(
    withinTolerance.physicalConstraints.issues.some(
      (issue) => issue.code === "MATERIAL_MIX_INVALID"
    ),
    false
  );
});

test("demanda positiva com disponibilidade zero nunca aparece como zero por cento", () => {
  const noTransport = baseScenario();
  noTransport.efficiency.transport = 0;
  const transportResult = model.calculateIntegrated(noTransport);
  assert.equal(transportResult.transport.effectiveCapacity, 0);
  assert.equal(transportResult.transport.effectiveUtilization, Infinity);
  assert.equal(transportResult.transport.hasValidCapacity, false);

  const noCc = baseScenario();
  noCc.efficiency.collectionCenters = 0;
  const ccResult = model.calculateIntegrated(noCc);
  assert.equal(ccResult.collectionCenters.maxUtilization, Infinity);

  const noHub = baseScenario();
  noHub.efficiency.hub = 0;
  const hubResult = model.calculateIntegrated(noHub);
  assert.equal(hubResult.hub.utilization, Infinity);
});

test("viagem precisa terminar dentro da jornada para contar na capacidade", () => {
  const scenario = baseScenario();
  // Campo legado não pode reativar a antiga contagem por teto.
  scenario.allowFinishAfterClose = true;
  const result = model.calculateTransport(scenario);
  assert.equal(result.nominalWeekdayTrips, 4);
  assert.equal(result.nominalSaturdayTrips, 2);
  assert.equal(result.nominalTrips, 22);
});

test("densidades por centro e material dirigem o volume agregado dos CCs", () => {
  const result = model.calculateIntegrated(baseScenario());
  const byName = new Map(
    result.collectionCenters.centerResults.map((center) => [center.name, center])
  );
  approximately(byName.get("Pinheiros").apparentDensity, 56.60495148803662, 1e-9);
  approximately(byName.get("Jabaquara").apparentDensity, 52.85623749146676, 1e-9);
  approximately(byName.get("Brooklin").apparentDensity, 18.394975715695633, 1e-9);
  approximately(byName.get("Pinheiros").weeklyVolumeProxy, 50.0000904144554, 1e-9);
  approximately(result.transport.calculatedMixDensity, 48.57875947610444, 1e-9);
  const routes = new Map(result.transport.routeResults.map((route) => [route.name, route]));
  assert.ok(routes.get("Pinheiros").tripCapacity > routes.get("Brooklin").tripCapacity);
  approximately(routes.get("Pinheiros").equivalentTrips, 5.263167412047936, 1e-9);
  approximately(routes.get("Brooklin").equivalentTrips, 2.105088763293187, 1e-9);
});

test("estoque compartilhado do Hub disponibiliza os mesmos 493 m³ a soltos e fardos", () => {
  const scenario = baseScenario();
  const hub = model.calculateIntegrated(scenario).hub;
  assert.equal(scenario.hub.storageMode, "shared");
  assert.equal(hub.storageMode, "shared");
  assert.equal(hub.sharedStorage, true);
  assert.equal(hub.totalStorage, 493);
  assert.equal(hub.intermediateStorage, 493);
  assert.equal(hub.baleStorage, 493);
  assert.match(hub.storagePolicy, /estoque compartilhado/);
  assert.ok(hub.storageCoverageDaysProxy > 0);
  assert.ok(hub.baleStorageCoverageDaysProxy > 0);
});

test("Hub expõe capacidade e aplica a expedição oficial por fardos inteiros", () => {
  const scenario = baseScenario();
  const hub = model.calculateIntegrated(scenario).hub;
  approximately(hub.equivalentMassCapacity, 46635.892663908555, 1e-9);
  approximately(hub.massSlack, 38999.740740831636, 1e-9);
  assert.equal(hub.limitingResource.resource, "Equipe compartilhada");
  assert.ok(hub.operatorUtilization > hub.largePressUtilization);
  assert.ok(hub.largePressUtilization > hub.smallPressUtilization);
  assert.equal(scenario.hub.expeditionReferenceMinutes, 30);
  assert.equal(scenario.hub.expeditionPeople, 6);
  const officialExpedition = {
    "Papelão": { threshold: 6400, baleWeight: 200, minimumBales: 32 },
    "Plástico": { threshold: 1900, baleWeight: 100, minimumBales: 19 },
    "Longa vida": { threshold: 6480, baleWeight: 120, minimumBales: 54 },
  };
  hub.materialResults.forEach((material) => {
    const expected = officialExpedition[material.name];
    assert.equal(material.withdrawalThreshold, expected.threshold);
    assert.equal(material.baleWeight, expected.baleWeight);
    assert.equal(material.minimumBales, expected.minimumBales);
    assert.equal(material.effectiveWithdrawalMass, expected.threshold);
  });
  approximately(
    hub.expeditionWorkload,
    hub.equivalentWithdrawals * 30 * 6,
    1e-9,
    "carga oficial de expedição"
  );
});

test("retirada carrega todo o estoque que couber por volume e peso", () => {
  const belowCapacity = model.calculatePickupLoad({
    availableMass: 300,
    apparentDensity: 35,
    truckVolume: 15,
    volumeOccupancy: 100,
    weightLimit: 1800,
  });
  assert.equal(belowCapacity.loadedMass, 300);
  assert.equal(belowCapacity.remainingMass, 0);

  const volumeLimited = model.calculatePickupLoad({
    availableMass: 1000,
    apparentDensity: 35,
    truckVolume: 15,
    volumeOccupancy: 100,
    weightLimit: 1800,
  });
  assert.equal(volumeLimited.loadedMass, 525);
  assert.equal(volumeLimited.remainingMass, 475);

  const weightLimited = model.calculatePickupLoad({
    availableMass: 2500,
    apparentDensity: 200,
    truckVolume: 15,
    volumeOccupancy: 100,
    weightLimit: 1800,
  });
  assert.equal(weightLimited.loadedMass, 1800);
});

test("prioridade estática ordena pelo maior percentual de ocupação", () => {
  const ranked = model.rankByStorageOccupancy([
    { name: "A", stockVolume: 20, storageCapacity: 30 },
    { name: "B", stockVolume: 25, storageCapacity: 33 },
    { name: "C", stockVolume: 6, storageCapacity: 10 },
  ]);
  assert.deepEqual(ranked.map((center) => center.name), ["B", "A", "C"]);
});

test("monitoramento visual não consome capacidade, mas o espaço continua restritivo", () => {
  const result = model.calculateIntegrated(baseScenario());
  result.collectionCenters.centerResults.forEach((center) => {
    assert.equal(center.stockMonitoringWorkload, 0);
  });
  const invalid = baseScenario();
  invalid.centers[0].storageCapacity = 0;
  assert.equal(model.calculateIntegrated(invalid).physicalConstraints.valid, false);
});

test("estoques, cargas e saldos calculados permanecem não negativos", () => {
  const result = model.calculateIntegrated(baseScenario());
  result.collectionCenters.centerResults.forEach((center) => {
    assert.ok(center.knownWorkload >= 0);
    assert.ok(center.storageCoverageDaysProxy >= 0);
    assert.ok(center.residualVisitCapacity >= 0);
  });
  assert.ok(result.hub.totalWeeklyMass >= 0);
  assert.ok(result.hub.totalWeeklyVolumeProxy >= 0);
});

test("configurações físicas impossíveis bloqueiam a leitura integrada", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  assert.equal(baseline.physicalConstraints.valid, true);

  const invalid = baseScenario();
  invalid.centers[0].scaleCount = 0;
  invalid.centers[1].storageCapacity = 0;
  invalid.centers[2].loadingOperators = 3;
  invalid.hub.totalStorage = 0;
  const result = model.calculateIntegrated(invalid);
  assert.equal(result.physicalConstraints.valid, false);
  assert.deepEqual(
    result.physicalConstraints.issues.map((issue) => issue.code),
    [
      "CC_SCALE_UNAVAILABLE",
      "CC_STORAGE_UNAVAILABLE",
      "CC_LOADING_STAFF_EXCEEDED",
      "HUB_STORAGE_UNAVAILABLE",
      "HUB_BALE_STORAGE_UNAVAILABLE",
    ]
  );
});

test("limites físicos do Hub validam equipe simultânea e disponibilidade das prensas", () => {
  const triageDisabled = baseScenario();
  triageDisabled.hub.externalTriageEnabled = false;
  triageDisabled.hub.triageMinutesPerLoad = 10;
  triageDisabled.hub.triagePeople = 99;
  const disabledResult = model.calculateIntegrated(triageDisabled);
  assert.equal(disabledResult.hub.externalTriageEnabled, false);
  assert.equal(disabledResult.hub.triageLoadsPerWeek, 0);
  assert.equal(disabledResult.hub.triageWorkload, 0);
  assert.equal(
    disabledResult.physicalConstraints.issues.some(
      (issue) => issue.code === "HUB_TRIAGE_STAFF_EXCEEDED"
    ),
    false
  );

  const invalid = baseScenario();
  invalid.hub.externalTriageEnabled = true;
  invalid.hub.triageMinutesPerLoad = 10;
  invalid.hub.triagePeople = 7;
  invalid.hub.largePressCount = 0;
  invalid.hub.smallPressCount = 0;

  const result = model.calculateIntegrated(invalid);
  assert.equal(result.physicalConstraints.valid, false);
  assert.deepEqual(
    result.physicalConstraints.issues.map((issue) => issue.code),
    [
      "HUB_LARGE_PRESS_UNAVAILABLE",
      "HUB_SMALL_PRESS_UNAVAILABLE",
      "HUB_TRIAGE_STAFF_EXCEEDED",
    ]
  );
});

test("limite de peso é aplicado por material antes da equivalência da rota", () => {
  const scenario = baseScenario();
  scenario.truckVolume = 1;
  scenario.volumeOccupancy = 100;
  scenario.weightLimit = 200;
  scenario.routes = [
    {
      id: "R-X",
      name: "Rota sintética",
      demand: 1000,
      optimistic: 1,
      likely: 1,
      pessimistic: 1,
      loadingMinutes: 0,
      materials: [
        { name: "Leve", annualMass: 500, density: 100 },
        { name: "Denso", annualMass: 500, density: 1000 },
      ],
    },
  ];
  scenario.centers = [];

  const transport = model.calculateTransport(scenario);
  approximately(transport.routeResults[0].equivalentTrips, 7.5, 1e-12);
  approximately(transport.routeResults[0].tripCapacity, 1000 / 7.5, 1e-12);
  assert.equal(transport.routeResults[0].materialResults[0].tripCapacity, 100);
  assert.equal(transport.routeResults[0].materialResults[1].tripCapacity, 200);
  assert.equal(transport.limitingMode, "mixed");
});

test("peso automático de 1 m³ usa média harmônica ponderada do mix e ignora parâmetros globais legados", () => {
  const scenario = baseScenario();
  scenario.routes = [
    {
      name: "Rota A",
      demand: 100,
      optimistic: 1,
      likely: 1,
      pessimistic: 1,
      loadingMinutes: 0,
      materials: [
        { name: "Leve", mixPercent: 25, density: 10 },
        { name: "Denso", mixPercent: 75, density: 30 },
      ],
    },
    {
      name: "Rota B",
      demand: 300,
      optimistic: 1,
      likely: 1,
      pessimistic: 1,
      loadingMinutes: 0,
      materials: [{ name: "Único", mixPercent: 100, density: 50 }],
    },
  ];
  scenario.centers = [];
  const automatic = model.calculateTransport(scenario);
  approximately(automatic.calculatedMixDensity, 400 / 11, 1e-12);
  assert.equal(automatic.automaticMixDensity, automatic.calculatedMixDensity);
  assert.equal(automatic.densityMethod, "arrival-mix-weighted-harmonic");
  approximately(automatic.densityWeightTotal, 1, 1e-12);

  scenario.mixDensity = 999;
  scenario.referenceMixDensity = 1;
  approximately(
    model.calculateTransport(scenario).calculatedMixDensity,
    automatic.calculatedMixDensity,
    1e-12
  );

  scenario.routes[0].materials[0].density = 0;
  const invalid = model.calculateIntegrated(scenario);
  assert.equal(invalid.physicalConstraints.valid, false);
  assert.ok(
    invalid.physicalConstraints.issues.some(
      (issue) => issue.code === "MATERIAL_DENSITY_INVALID"
    )
  );
});

test("quatro tempos locais somam o ciclo usado nos CCs e nas entregas diretas", () => {
  const scenario = baseScenario();
  scenario.service = {
    receptionMinutes: 2,
    weighingMinutes: 1,
    registrationMinutes: 1,
    segregationMinutes: 4,
  };
  const result = model.calculateIntegrated(scenario);
  assert.equal(result.collectionCenters.serviceMinutesPerVisit, 8);
  assert.equal(
    result.collectionCenters.centerResults[0].serviceWorkload,
    result.collectionCenters.centerResults[0].visitsPerWeek * 8
  );
  assert.equal(
    result.hub.directServiceWorkload,
    result.hub.directVisitsPerWeek * 8
  );
});

test("visitas editáveis alteram a carga local sem mudar massa nem Transporte", () => {
  const baselineScenario = baseScenario();
  const editedScenario = baseScenario();
  editedScenario.centers[0].visitsPerWeek += 10;
  editedScenario.hub.directVisitsPerWeek += 10;

  const baseline = model.calculateIntegrated(baselineScenario);
  const edited = model.calculateIntegrated(editedScenario);
  approximately(
    edited.collectionCenters.centerResults[0].serviceWorkload -
      baseline.collectionCenters.centerResults[0].serviceWorkload,
    40,
    1e-12
  );
  approximately(
    edited.hub.directServiceWorkload - baseline.hub.directServiceWorkload,
    40,
    1e-12
  );
  approximately(edited.transport.totalDemand, baseline.transport.totalDemand, 1e-12);
  approximately(edited.transport.tripCapacity, baseline.transport.tripCapacity, 1e-12);
  approximately(edited.transport.effectiveCapacity, baseline.transport.effectiveCapacity, 1e-12);
  approximately(edited.hub.directWeeklyMass, baseline.hub.directWeeklyMass, 1e-12);
});

test("quatro tempos locais zero produzem capacidade ilimitada de visitas, não capacidade zero", () => {
  const scenario = baseScenario();
  scenario.service = {
    receptionMinutes: 0,
    weighingMinutes: 0,
    registrationMinutes: 0,
    segregationMinutes: 0,
  };
  const result = model.calculateIntegrated(scenario);
  const center = result.collectionCenters.centerResults[0];
  assert.equal(center.serviceWorkload, 0);
  assert.equal(center.visitCapacity, Infinity);
  assert.equal(center.visitSlack, Infinity);
  assert.ok(Number.isFinite(center.utilization));
});

test("recursos discretos fracionários ou extremos tornam o cenário inválido", () => {
  const scenario = baseScenario();
  scenario.truckCount = 0.5;
  scenario.centers[0].staff = 1.5;
  scenario.hub.largePressCount = 1e308;
  const result = model.calculateIntegrated(scenario);
  assert.equal(result.physicalConstraints.valid, false);
  assert.ok(
    result.physicalConstraints.issues.filter(
      (issue) => issue.code === "RESOURCE_COUNT_INVALID"
    ).length >= 3
  );
  assert.equal(result.transport.effectiveCapacity, 0);
});

test("ocupação média na coleta controla a capacidade agregada", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const lowerPickupOccupancy = baseScenario();
  lowerPickupOccupancy.volumeOccupancy = 70;
  assert.ok(
    model.calculateIntegrated(lowerPickupOccupancy).transport.effectiveCapacity <
      baseline.transport.effectiveCapacity
  );
});

test("massa direta editada altera o Hub sem alterar a demanda do Transporte", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const scenario = baseScenario();
  scenario.hub.directWeeklyMass *= 2;
  const result = model.calculateIntegrated(scenario);
  assert.equal(result.transport.totalDemand, baseline.transport.totalDemand);
  assert.ok(result.hub.totalWeeklyMass > baseline.hub.totalWeeklyMass);
  assert.ok(result.hub.pressingWorkload > baseline.hub.pressingWorkload);

  const legacy = baseScenario();
  legacy.hub.directAnnualMass = legacy.hub.directWeeklyMass * 52;
  delete legacy.hub.directWeeklyMass;
  approximately(
    model.calculateIntegrated(legacy).hub.totalWeeklyMass,
    baseline.hub.totalWeeklyMass,
    1e-9,
    "cenário legado com massa direta anual"
  );
});

test("exportação auditável preserva valores não finitos de forma explícita", () => {
  const serialized = model.stringifyAuditableJson(
    { semCapacidade: Infinity, negativo: -Infinity, indefinido: NaN },
    2
  );
  assert.deepEqual(JSON.parse(serialized), {
    semCapacidade: "Infinity",
    negativo: "-Infinity",
    indefinido: "NaN",
  });
});

test("prensa local desligada, ausente ou sem materiais preserva o as-is exatamente", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const disabled = baseScenario();
  disabled.centers.forEach((center) => {
    center.localPress = { enabled: false, pressCount: 1, materials: ["Papelão"] };
  });
  const emptyMaterials = baseScenario();
  emptyMaterials.centers.forEach((center) => {
    center.localPress = { enabled: true, pressCount: 1, materials: [] };
  });
  [disabled, emptyMaterials].forEach((scenario) => {
    const result = model.calculateIntegrated(scenario);
    approximately(
      result.transport.effectiveUtilization,
      baseline.transport.effectiveUtilization,
      1e-12,
      "utilização do transporte"
    );
    approximately(
      result.collectionCenters.maxUtilization,
      baseline.collectionCenters.maxUtilization,
      1e-12,
      "utilização máxima dos CCs"
    );
    approximately(result.hub.utilization, baseline.hub.utilization, 1e-12, "utilização do Hub");
    approximately(
      result.transport.equivalentTripsRequired,
      baseline.transport.equivalentTripsRequired,
      1e-12,
      "viagens equivalentes"
    );
    assert.equal(result.physicalConstraints.valid, true);
    result.collectionCenters.centerResults.forEach((center) => {
      assert.equal(center.localPressEnabled, false);
      assert.equal(center.localPressWorkload, 0);
    });
  });
});

test("prensa local ativa enfarda o transporte, carrega o CC e alivia a prensagem do Hub", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const scenario = baseScenario();
  scenario.centers[0].localPress = { enabled: true, pressCount: 1, materials: ["Papelão"] };
  scenario.centers[1].localPress = { enabled: true, pressCount: 1, materials: ["Papelão"] };
  const result = model.calculateIntegrated(scenario);

  // Transporte: papelão de Pinheiros/Jabaquara viaja na densidade do fardo (200 kg ÷ 0,539 m³)
  const pinheiros = result.transport.routeResults[0];
  const papelaoPinheiros = pinheiros.materialResults.find((material) => material.name === "Papelão");
  approximately(papelaoPinheiros.effectiveDensity, 200 / 0.539, 1e-9, "densidade enfardada");
  assert.equal(papelaoPinheiros.pressedAtCenter, true);
  assert.ok(result.transport.equivalentTripsRequired < baseline.transport.equivalentTripsRequired);
  assert.ok(result.transport.tripCapacity > baseline.transport.tripCapacity);
  // Com fardo denso o limite de peso passa a valer para esse material
  assert.equal(papelaoPinheiros.isVolumeLimited, false);

  // CC: fardos e carga de movimentação + prensagem entram na equipe local
  const pinheirosCenter = result.collectionCenters.centerResults[0];
  const expectedBales = papelaoPinheiros.weeklyMass / 200;
  approximately(
    pinheirosCenter.localPressWorkload,
    expectedBales * (10 + 20),
    1e-9,
    "carga local de prensagem"
  );
  assert.ok(pinheirosCenter.knownWorkload > baseline.collectionCenters.centerResults[0].knownWorkload);
  assert.ok(pinheirosCenter.localPressMachineUtilization > 0);
  assert.ok(pinheirosCenter.utilization >= pinheirosCenter.staffUtilization);

  // Hub: massa pré-prensada não repete movimentação nem prensagem; fardos e retiradas permanecem
  assert.ok(result.hub.pressingWorkload < baseline.hub.pressingWorkload);
  assert.ok(result.hub.largePressWorkload < baseline.hub.largePressWorkload);
  approximately(
    result.hub.prePressedWeeklyMass,
    papelaoPinheiros.weeklyMass +
      result.transport.routeResults[1].materialResults.find(
        (material) => material.name === "Papelão"
      ).weeklyMass,
    1e-9,
    "massa pré-prensada no Hub"
  );
  approximately(
    result.hub.equivalentWithdrawals,
    baseline.hub.equivalentWithdrawals,
    1e-9,
    "retiradas equivalentes"
  );
  approximately(
    result.hub.weeklyBaleVolume,
    baseline.hub.weeklyBaleVolume +
      result.transport.routeResults[1].materialResults.find((m) => m.name === "Papelão").weeklyMass * (0.247 / 92 - 0.539 / 200),
    1e-9,
    "volume semanal conserva o tamanho dos fardos da pequena no CC"
  );
  assert.equal(result.physicalConstraints.valid, true);
});

test("eficiência dos CCs aplica-se uma única vez à prensa local e valida prensas indisponíveis", () => {
  const scenario = baseScenario();
  scenario.centers[0].localPress = { enabled: true, pressCount: 1, materials: ["Papelão"] };
  const result = model.calculateIntegrated(scenario);
  const center = result.collectionCenters.centerResults[0];
  approximately(
    center.localPressMachineAvailableMinutes,
    2940,
    1e-9,
    "disponibilidade da prensa local"
  );
  approximately(
    center.localPressMachineUtilization,
    (center.localPressMachineWorkload / 2940) * 100,
    1e-9,
    "utilização da prensa local"
  );

  const noPress = baseScenario();
  noPress.centers[0].localPress = { enabled: true, pressCount: 0, materials: ["Papelão"] };
  const invalid = model.calculateIntegrated(noPress);
  assert.equal(invalid.physicalConstraints.valid, false);
  assert.ok(
    invalid.physicalConstraints.issues.some(
      (issue) => issue.code === "CC_LOCAL_PRESS_UNAVAILABLE"
    )
  );

  const fractional = baseScenario();
  fractional.centers[0].localPress = { enabled: true, pressCount: 1.5, materials: ["Papelão"] };
  const fractionalResult = model.calculateIntegrated(fractional);
  assert.equal(fractionalResult.physicalConstraints.valid, false);
  assert.ok(
    fractionalResult.physicalConstraints.issues.some(
      (issue) => issue.code === "RESOURCE_COUNT_INVALID"
    )
  );
});

test("densidade solta editada por unidade altera volume e viagens sem tocar em massa nem visitas", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const scenario = baseScenario();
  const papelao = scenario.routes[3].materials.find((material) => material.name === "Papelão");
  papelao.density = papelao.density * 2; // Brooklin: papelão mais denso
  const result = model.calculateIntegrated(scenario);
  assert.equal(result.transport.totalDemand, baseline.transport.totalDemand);
  const brooklin = result.transport.routeResults[3];
  const brooklinBaseline = baseline.transport.routeResults[3];
  assert.ok(brooklin.weeklyVolumeDemand < brooklinBaseline.weeklyVolumeDemand);
  assert.ok(brooklin.equivalentTrips < brooklinBaseline.equivalentTrips);
  assert.equal(
    result.collectionCenters.centerResults[3].visitsPerWeek,
    baseline.collectionCenters.centerResults[3].visitsPerWeek
  );
  assert.ok(result.transport.effectiveUtilization < baseline.transport.effectiveUtilization);
});

const INTER_CENTER_TRAVEL_TEST = Object.freeze({
  "Brooklin|Jabaquara": 20,
  "Brooklin|Paraisópolis": 18,
  "Brooklin|Pinheiros": 22,
  "Jabaquara|Paraisópolis": 35,
  "Jabaquara|Pinheiros": 45,
  "Paraisópolis|Pinheiros": 25,
  "Brooklin|Embu das Artes": 40,
  "Embu das Artes|Jabaquara": 55,
  "Embu das Artes|Paraisópolis": 35,
  "Embu das Artes|Pinheiros": 45,
});

test("consolidação desligada, ausente ou com grupo unitário preserva o as-is exatamente", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const disabled = baseScenario();
  disabled.consolidation = { enabled: false, assignments: { Jabaquara: "A", Brooklin: "A" } };
  disabled.interCenterTravel = { ...INTER_CENTER_TRAVEL_TEST };
  const single = baseScenario();
  single.consolidation = { enabled: true, assignments: { Jabaquara: "A" } };
  single.interCenterTravel = { ...INTER_CENTER_TRAVEL_TEST };
  [disabled, single].forEach((scenario) => {
    const result = model.calculateIntegrated(scenario);
    approximately(result.transport.weightedCycle, baseline.transport.weightedCycle, 1e-12, "ciclo ponderado");
    approximately(
      result.transport.effectiveUtilization,
      baseline.transport.effectiveUtilization,
      1e-12,
      "utilização do transporte"
    );
    approximately(
      result.collectionCenters.maxUtilization,
      baseline.collectionCenters.maxUtilization,
      1e-12,
      "utilização dos CCs"
    );
    assert.equal(result.transport.consolidation.groups.length, 0);
    assert.equal(result.physicalConstraints.valid, true);
  });
});

test("consolidação ativa monta o tour de menor deslocamento e preserva viagens equivalentes", () => {
  const baseline = model.calculateIntegrated(baseScenario());
  const scenario = baseScenario();
  scenario.consolidation = { enabled: true, assignments: { Jabaquara: "A", Brooklin: "A" } };
  scenario.interCenterTravel = { ...INTER_CENTER_TRAVEL_TEST };
  const result = model.calculateIntegrated(scenario);
  const group = result.transport.consolidation.groups[0];

  // Deslocamento esperado: 27,667 (Hub→Jab) + 20 × 1,1 (perna CC↔CC) + 16,333 (Bro→Hub) = 66
  approximately(group.tourTravelMinutes, 66, 1e-6, "deslocamento do tour");
  // Ciclo: 66 + carregamentos 30 + 30 + descarga 30 = 156
  approximately(group.cycleMinutes, 156, 1e-6, "ciclo do tour");
  approximately(
    result.transport.equivalentTripsRequired,
    baseline.transport.equivalentTripsRequired,
    1e-9,
    "viagens equivalentes preservadas"
  );
  approximately(result.transport.tripCapacity, baseline.transport.tripCapacity, 1e-9, "kg por tour");
  assert.ok(result.transport.weightedCycle > baseline.transport.weightedCycle);

  // Cada CC do grupo carrega em todos os tours do grupo
  const jabaquara = result.collectionCenters.centerResults[1];
  approximately(
    jabaquara.loadingStopsPerWeek,
    group.equivalentTrips,
    1e-9,
    "paradas de carregamento de Jabaquara"
  );
  assert.ok(jabaquara.loadingWorkload > baseline.collectionCenters.centerResults[1].loadingWorkload);
  // Hub continua com uma descarga por tour equivalente
  approximately(
    result.hub.externalUnloadWorkload,
    baseline.hub.externalUnloadWorkload,
    1e-9,
    "descarga do Hub"
  );
  assert.equal(result.physicalConstraints.valid, true);
});

test("cenário de trânsito aplica o fator documentado às pernas CC↔CC e valida perna ausente", () => {
  const scenario = baseScenario();
  scenario.trafficScenario = "optimistic";
  scenario.consolidation = { enabled: true, assignments: { Jabaquara: "A", Brooklin: "A" } };
  scenario.interCenterTravel = { ...INTER_CENTER_TRAVEL_TEST };
  const optimistic = model.calculateIntegrated(scenario);
  // Otimista: 18 (Hub→Jab) + 20 × 0,7 + 10 (Bro→Hub) = 42
  approximately(
    optimistic.transport.consolidation.groups[0].tourTravelMinutes,
    42,
    1e-9,
    "fator otimista na perna CC↔CC"
  );

  const missing = baseScenario();
  missing.consolidation = { enabled: true, assignments: { Jabaquara: "A", Brooklin: "A" } };
  missing.interCenterTravel = {};
  const invalid = model.calculateIntegrated(missing);
  assert.equal(invalid.physicalConstraints.valid, false);
  assert.ok(
    invalid.physicalConstraints.issues.some(
      (issue) => issue.code === "CONSOLIDATION_LEG_MISSING"
    )
  );
});


test("mix 25/75 divide todos os materiais entre as duas prensas e conserva massa e fardos", () => {
  const scenario = baseScenario();
  const hubBefore = JSON.stringify(scenario.hub);
  scenario.centers[0].localPress = { enabled: true, largePressCount: 1, smallPressCount: 1,
    materials: ["Papelão", "Plástico", "Longa vida"],
    largePercent: { "Papelão": 25, "Plástico": 25, "Longa vida": 25 } };
  const result = model.calculateIntegrated(scenario);
  const center = result.collectionCenters.centerResults[0];
  const weights = { "Papelão": [200, 92], "Plástico": [115, 53], "Longa vida": [260, 120] };
  for (const m of result.transport.routeResults[0].materialResults) {
    const [large, small] = weights[m.name];
    const rows = center.localPressMaterialResults.filter((r) => r.name === m.name);
    approximately(rows.reduce((sum, r) => sum + r.weeklyMass, 0), m.weeklyMass, 1e-9);
    approximately(m.weeklyVolume, m.weeklyMass * (0.25 * 0.539 / large + 0.75 * 0.247 / small), 1e-9);
    approximately(m.prePressedBales, m.weeklyMass * (0.25 / large + 0.75 / small), 1e-9);
    for (const r of rows) {
      assert.equal(r.pressMinutes, r.pressType === "large" ? 20 : 8);
      assert.equal(r.setupMinutes, 0);
      approximately(r.machineWorkload, r.bales * r.pressMinutes, 1e-9);
    }
    const h = result.hub.materialResults.find((r) => r.name === m.name);
    approximately(h.prePressedWeeklyMass, m.weeklyMass, 1e-9);
    approximately(h.balesRequired, h.balesToPressAtHub + m.prePressedBales, 1e-9);
    approximately(h.weeklyBaleVolume, h.balesToPressAtHub * h.baleVolume + m.weeklyVolume, 1e-9);
  }
  assert.equal(JSON.stringify(scenario.hub), hubBefore);
  const baseline = model.calculateIntegrated(baseScenario());
  assert.deepEqual(result.hub.directMaterialProfile, baseline.hub.directMaterialProfile);
  assert.equal(result.hub.directServiceWorkload, baseline.hub.directServiceWorkload);
  approximately(center.localPressMachineUtilization, Math.max(...center.localPressResources.map((r) => r.utilization)), 1e-9);
});

test("mix extremo e prensa ausente: sem capacidade cruzada entre máquinas", () => {
  for (const percent of [0, 100]) {
    const s = baseScenario();
    Object.assign(s.centers[0].localPress, { enabled: true, largePressCount: 1, smallPressCount: 1,
      largePercent: { "Papelão": percent, "Plástico": percent, "Longa vida": percent } });
    const r = model.calculateIntegrated(s).collectionCenters.centerResults[0];
    assert.equal(r.localPressMaterialResults.length, 3);
    assert.ok(r.localPressMaterialResults.every((m) => m.pressType === (percent === 100 ? "large" : "small")));
  }
  const s = baseScenario();
  Object.assign(s.centers[0].localPress, { enabled: true, largePressCount: 2, smallPressCount: 0,
    largePercent: { "Papelão": 50, "Plástico": 50, "Longa vida": 50 } });
  const r = model.calculateIntegrated(s);
  assert.equal(r.collectionCenters.centerResults[0].localPressMachineUtilization, Infinity);
  assert.equal(r.physicalConstraints.valid, false);
  s.centers[0].localPress.enabled = false;
  const off = model.calculateIntegrated(s);
  const base = model.calculateIntegrated(baseScenario());
  assert.deepEqual(off.hub, base.hub);
  assert.deepEqual(off.transport, base.transport);
});

test("mix inválido não passa por configuração física válida", () => {
  const s = baseScenario();
  s.centers[0].localPress.enabled = true;
  s.centers[0].localPress.largePercent["Papelão"] = 101;
  assert.equal(model.calculateIntegrated(s).physicalConstraints.valid, false);
});
