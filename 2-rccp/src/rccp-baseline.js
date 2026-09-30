/* Cenário-base RCCP — portado de Simulador_Capacidade_CC_Hub/app.js (baseScenario).
   Expõe window.RCCPBaseline.create() com o cenário as-is calibrado. */
(function (root) {
  "use strict";

  var MODEL_VERSION = "aggregate-rccp-as-is-v16";
  var DEFAULT_LOCAL_PRESS = { enabled: false, pressCount: 1, materials: [] };

  var INTER_CENTER_TRAVEL = {
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
  };

  function safeNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function arrivalEvidence(name) {
    var profile = root.RCCPArrivalProfile || null;
    var source = name === "Santo Amaro direto"
      ? profile && profile.hubDirect
      : profile && profile.centers && profile.centers[name];
    if (!source) {
      return {
        visitsPerWeek: 0, visitsPerCalendarWeek: 0, visitsPerObservedCoverageWeek: 0,
        arrivalVisits: 0, arrivalCoverageWeeks: 0, arrivalFirstDate: null,
        arrivalLastDate: null, p90DailyVisits: 0, maxDailyVisits: 0,
        arrivalEvidenceMode: "perfil indisponível ou inválido",
      };
    }
    return {
      visitsPerWeek: Number(source.visitsPerCalendarWeek),
      visitsPerCalendarWeek: Number(source.visitsPerCalendarWeek),
      visitsPerObservedCoverageWeek: Number(source.visitsPerObservedCoverageWeek),
      arrivalVisits: Number(source.visitCount),
      arrivalCoverageWeeks: Number(source.coverage.weeks),
      arrivalFirstDate: source.coverage.firstDate,
      arrivalLastDate: source.coverage.lastDate,
      p90DailyVisits: Number(source.p90DailyVisits),
      maxDailyVisits: Number(source.maxDailyVisits),
      arrivalEvidenceMode: "todos os registros anuais válidos divididos por 52 semanas",
    };
  }

  function withCalibratedMix(materials) {
    var total = materials.reduce(function (sum, m) { return sum + safeNumber(m.annualMass, 0); }, 0);
    return materials.map(function (m) {
      return Object.assign({}, m, {
        mixPercent: total > 0 ? (safeNumber(m.annualMass, 0) / total) * 100 : 0,
      });
    });
  }

  function press(pressType) {
    var large = pressType === "large";
    return { enabled: false, pressCount: 1,
      largePressCount: large ? 1 : 0, smallPressCount: large ? 0 : 1,
      materials: ["Papelão", "Plástico", "Longa vida"],
      largePercent: { "Papelão": large ? 100 : 0, "Plástico": large ? 100 : 0, "Longa vida": large ? 100 : 0 } };
  }

  function create() {
    var scenario = {
      modelVersion: MODEL_VERSION,
      calendar: {
        weekdayMinutes: 540,
        transportWeekdayMinutes: 480,
        saturdayMinutes: 240,
        weekdaysPerWeek: 5,
        saturdaysPerWeek: 1,
      },
      workingDaysPerYear: 312,
      efficiency: { transport: 100, collectionCenters: 100, hub: 100 },
      truckCount: 1,
      truckVolume: 10,
      weightLimit: 1800,
      volumeOccupancy: 95,
      trafficScenario: "expected",
      returnToHub: true,
      collectionPriority: "highestStorageOccupancy",
      pickupPolicy: "allAvailableThatFits",
      collectionTriggerVolume: 15,
      stockMonitoringWorkloadMinutes: 0,
      centerWait: 0,
      hubWait: 0,
      unloadingMinutes: 30,
      service: {
        receptionMinutes: 0.5,
        weighingMinutes: 0.5,
        registrationMinutes: 1,
        segregationMinutes: 2,
      },
      centerServiceMinutes: 4,
      routes: [
        {
          id: "R-001", name: "Pinheiros", demand: 147173.14 / 52,
          optimistic: 22, likely: 32, pessimistic: 51, loadingMinutes: 20,
          materials: [
            { name: "Papelão", annualMass: 117610.53, density: 64.82 },
            { name: "Plástico", annualMass: 25677.22, density: 34.54 },
            { name: "Longa vida", annualMass: 3885.39, density: 92.11 },
          ],
        },
        {
          id: "R-002", name: "Jabaquara", demand: 109932.89 / 52,
          optimistic: 18, likely: 25, pessimistic: 40, loadingMinutes: 30,
          materials: [
            { name: "Papelão", annualMass: 85463.69, density: 49.2 },
            { name: "Plástico", annualMass: 21259.44, density: 73.13 },
            { name: "Longa vida", annualMass: 3209.76, density: 61.64 },
          ],
        },
        {
          id: "R-003", name: "Paraisópolis", demand: 23807.45 / 52,
          optimistic: 15, likely: 22, pessimistic: 35, loadingMinutes: 30,
          materials: [
            { name: "Papelão", annualMass: 14817.1, density: 31.12 },
            { name: "Plástico", annualMass: 7651.55, density: 14.46 },
            { name: "Longa vida", annualMass: 1338.8, density: 38.57 },
          ],
        },
        {
          id: "R-004", name: "Brooklin", demand: 19129.19 / 52,
          optimistic: 10, likely: 15, pessimistic: 24, loadingMinutes: 30,
          materials: [
            { name: "Papelão", annualMass: 16448.58, density: 17 },
            { name: "Plástico", annualMass: 2284.66, density: 33.63 },
            { name: "Longa vida", annualMass: 395.95, density: 89.68 },
          ],
        },
        {
          id: "R-005", name: "Embu das Artes", demand: 82373.53 / 52,
          optimistic: 27, likely: 38, pessimistic: 61, loadingMinutes: 30,
          materials: [
            { name: "Papelão", annualMass: 81117.92, density: 73.92 },
            { name: "Plástico", annualMass: 0, density: 0 },
            { name: "Longa vida", annualMass: 1255.61, density: 83.96 },
          ],
        },
      ],
      centers: [
        Object.assign({ id: "CC-001", name: "Pinheiros" }, arrivalEvidence("Pinheiros"), { staff: 2, scaleCount: 1, storageCapacity: 30, loadingOperators: 2, referenceTripsPerWeek: 5, localPress: press("large") }),
        Object.assign({ id: "CC-002", name: "Jabaquara" }, arrivalEvidence("Jabaquara"), { staff: 2, scaleCount: 1, storageCapacity: 33, loadingOperators: 2, referenceTripsPerWeek: 4, localPress: press() }),
        Object.assign({ id: "CC-003", name: "Paraisópolis" }, arrivalEvidence("Paraisópolis"), { staff: 2, scaleCount: 1, storageCapacity: 33, loadingOperators: 2, referenceTripsPerWeek: 2, localPress: press() }),
        Object.assign({ id: "CC-004", name: "Brooklin" }, arrivalEvidence("Brooklin"), { staff: 2, scaleCount: 1, storageCapacity: 33, loadingOperators: 2, referenceTripsPerWeek: 2, localPress: press() }),
        Object.assign({ id: "CC-005", name: "Embu das Artes" }, arrivalEvidence("Embu das Artes"), { staff: 3, scaleCount: 1, storageCapacity: 33, loadingOperators: 2, referenceTripsPerWeek: 2, localPress: press() }),
      ],
      consolidation: {
        enabled: false,
        assignments: { "Pinheiros": "", "Jabaquara": "", "Paraisópolis": "", "Brooklin": "", "Embu das Artes": "" },
      },
      interCenterTravel: Object.assign({}, INTER_CENTER_TRAVEL),
      hub: {
        staff: 6,
        unloadingPeople: 3,
        directVisitsPerWeek: arrivalEvidence("Santo Amaro direto").visitsPerWeek,
        directWeeklyMass: 14663.7 / 52,
        directMaterials: [
          { name: "Papelão", annualMass: 11555.47, density: 49.74 },
          { name: "Plástico", annualMass: 1930.58, density: 32.73 },
          { name: "Longa vida", annualMass: 1177.65, density: 65.66 },
        ],
        storageMode: "shared",
        intermediateStorage: 493,
        totalStorage: 493,
        externalTriageEnabled: true,
        triageMinutesPerLoad: 0,
        triagePeople: 1,
        largePressCount: 2,
        smallPressCount: 4,
        expeditionReferenceMinutes: 30,
        expeditionPeople: 6,
        materials: [
          { name: "Papelão", pressType: "large", annualMass: 327013.29, baleWeight: 200, baleVolume: 0.539, movementMinutes: 10, pressMinutes: 20, withdrawalThreshold: 6400 },
          { name: "Plástico", pressType: "small", annualMass: 58803.45, baleWeight: 100, baleVolume: 0.247, movementMinutes: 5, pressMinutes: 8, withdrawalThreshold: 1900 },
          { name: "Longa vida", pressType: "small", annualMass: 11263.16, baleWeight: 120, baleVolume: 0.247, movementMinutes: 5, pressMinutes: 8, withdrawalThreshold: 6480 },
        ],
      },
    };
    scenario.routes.forEach(function (route) { route.materials = withCalibratedMix(route.materials); });
    scenario.hub.directMaterials = withCalibratedMix(scenario.hub.directMaterials);
    return scenario;
  }

  root.RCCPBaseline = { create: create, MODEL_VERSION: MODEL_VERSION };
})(typeof globalThis !== "undefined" ? globalThis : this);
