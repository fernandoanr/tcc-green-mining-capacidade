"use strict";

const model = require("./rccp-model.js");
const arrivals = require("./arrival-profile-2025.js");
const { scenario: baselineScenario } = require("./rccp-current-scenario.cjs");

const externalCenters = [
  "Pinheiros",
  "Jabaquara",
  "Paraisópolis",
  "Brooklin",
  "Embu das Artes",
];

const familyKeyByName = {
  "Papelão": "papelao",
  "Plástico": "plastico",
  "Longa vida": "longa vida",
};

function cloneBaseline() {
  return structuredClone(baselineScenario);
}

function applyVisitBasis(scenario, basis) {
  for (const center of scenario.centers) {
    const profile = arrivals.centers[center.name];
    center.visitsPerWeek = basis === "calendar52"
      ? profile.visitsPerCalendarWeek
      : profile.visitsPerObservedCoverageWeek;
  }
  scenario.hub.directVisitsPerWeek = basis === "calendar52"
    ? arrivals.hubDirect.visitsPerCalendarWeek
    : arrivals.hubDirect.visitsPerObservedCoverageWeek;
}

function weeklyMassByFamily(profile, basis) {
  const denominator = basis === "calendar52" ? 52 : profile.coverage.weeks;
  return Object.fromEntries(
    Object.entries(profile.observedMassKgBySelectedFamily).map(([family, annualMass]) => [
      family,
      annualMass / denominator,
    ])
  );
}

function applyTransactionalMassBasis(scenario, basis) {
  const hubWeeklyMassByFamily = { papelao: 0, plastico: 0, "longa vida": 0 };

  for (const centerName of externalCenters) {
    const route = scenario.routes.find((item) => item.name === centerName);
    const weeklyByFamily = weeklyMassByFamily(arrivals.centers[centerName], basis);
    const routeWeeklyMass = Object.values(weeklyByFamily).reduce(
      (sum, value) => sum + value,
      0
    );
    route.demand = routeWeeklyMass;
    route.materials = route.materials.map((material) => {
      const key = familyKeyByName[material.name];
      hubWeeklyMassByFamily[key] += weeklyByFamily[key];
      return {
        ...material,
        annualMass: weeklyByFamily[key] * 52,
        mixPercent:
          routeWeeklyMass > 0 ? (weeklyByFamily[key] / routeWeeklyMass) * 100 : 0,
      };
    });
  }

  const directWeeklyByFamily = weeklyMassByFamily(arrivals.hubDirect, basis);
  const directWeeklyMass = Object.values(directWeeklyByFamily).reduce(
    (sum, value) => sum + value,
    0
  );
  scenario.hub.directWeeklyMass = directWeeklyMass;
  scenario.hub.directMaterials = scenario.hub.directMaterials.map((material) => {
    const key = familyKeyByName[material.name];
    hubWeeklyMassByFamily[key] += directWeeklyByFamily[key];
    return {
      ...material,
      annualMass: directWeeklyByFamily[key] * 52,
      mixPercent:
        directWeeklyMass > 0
          ? (directWeeklyByFamily[key] / directWeeklyMass) * 100
          : 0,
    };
  });
  scenario.hub.materials = scenario.hub.materials.map((material) => {
    const key = familyKeyByName[material.name];
    return { ...material, annualMass: hubWeeklyMassByFamily[key] * 52 };
  });
}

function summarize(name, visitBasis, massBasis, mutateScenario) {
  const scenario = cloneBaseline();
  applyVisitBasis(scenario, visitBasis);
  if (massBasis !== "table1") applyTransactionalMassBasis(scenario, massBasis);
  if (typeof mutateScenario === "function") mutateScenario(scenario);
  const result = model.calculateIntegrated(scenario);
  return {
    name,
    visitBasis,
    massBasis,
    transport: {
      weeklyDemandKg: result.transport.totalDemand,
      weeklyCapacityKg: result.transport.effectiveCapacity,
      utilizationPercent: result.transport.effectiveUtilization,
      tripsPerWeek: result.transport.effectiveTrips,
      equivalentTripsRequired: result.transport.equivalentTripsRequired,
      tripCapacityKg: result.transport.tripCapacity,
      tripWeightedTravelMinutesOneWay: result.transport.capacityWeightedTravelMinutes,
      cycleMinutes: result.transport.weightedCycle,
    },
    collectionCenters: result.collectionCenters.centerResults.map((center) => ({
      name: center.name,
      visitsPerWeek: center.visitsPerWeek,
      weeklyDemandKg: center.weeklyDemand,
      utilizationPercent: center.utilization,
    })),
    hub: {
      directVisitsPerWeek: result.hub.directVisitsPerWeek,
      totalWeeklyMassKg: result.hub.totalWeeklyMass,
      knownWorkloadMinutes: result.hub.knownWorkload,
      utilizationPercent: result.hub.utilization,
      equivalentMassCapacityKg: result.hub.equivalentMassCapacity,
      massSlackKg: result.hub.massSlack,
    },
    annualization: result.annualization,
    indicativeBottleneck: result.indicativeBottleneck,
    physicalConstraints: result.physicalConstraints,
  };
}

const comparisons = [
  summarize("Baseline oficial v16 — Base Geral ÷ 52", "calendar52", "table1"),
  summarize("Checagem — cobertura oficial anual equivale a 52 semanas", "activeCoverage", "table1"),
  summarize("Sensibilidade histórica — eficiências de 85%", "calendar52", "table1", (scenario) => {
    scenario.efficiency = { transport: 85, collectionCenters: 85, hub: 85 };
  }),
  summarize("Sensibilidade — dois caminhões", "calendar52", "table1", (scenario) => {
    scenario.truckCount = 2;
  }),
  summarize("Sensibilidade — demanda e chegadas +20%", "calendar52", "table1", (scenario) => {
    scenario.routes.forEach((route) => {
      route.demand *= 1.2;
      route.materials.forEach((material) => { material.annualMass *= 1.2; });
    });
    scenario.centers.forEach((center) => { center.visitsPerWeek *= 1.2; });
    scenario.hub.directVisitsPerWeek *= 1.2;
    scenario.hub.directWeeklyMass *= 1.2;
    scenario.hub.directMaterials.forEach((material) => { material.annualMass *= 1.2; });
    scenario.hub.materials.forEach((material) => { material.annualMass *= 1.2; });
  }),
];

const comparisonReport = {
  source: arrivals.source,
  comparisons,
};

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(comparisonReport, null, 2)}\n`);
}

module.exports = {
  applyTransactionalMassBasis,
  applyVisitBasis,
  comparisonReport,
  comparisons,
  summarize,
};
