"use strict";

const model = require("./rccp-model.js");
const arrivals = require("./arrival-profile-2025.js");
globalThis.RCCPArrivalProfile = arrivals;
require("./rccp-baseline.js");

const scenario = globalThis.RCCPBaseline.create();
const routeMaterials = Object.fromEntries(
  scenario.routes.map((route) => [route.name, route.materials])
);

const result = model.calculateIntegrated(scenario);
const summary = {
  transport: {
    weekdayMinutes: scenario.calendar.transportWeekdayMinutes,
    averageTravelSimpleMinutesOneWay: result.transport.simpleTravelMinutes,
    averageTravelWeightedMinutesOneWay: result.transport.weightedTravelMinutes,
    averageTravelWeightedByTripsMinutesOneWay: result.transport.capacityWeightedTravelMinutes,
    averageRoundTripTravelMinutes: result.transport.weightedTravelMinutes * 2,
    averageCycleMinutes: result.transport.weightedCycle,
    tripCapacityKg: result.transport.tripCapacity,
    tripsPerWeek: result.transport.effectiveTrips,
    weeklyCapacityKg: result.transport.effectiveCapacity,
    weeklyDemandKg: result.transport.totalDemand,
    utilizationPercent: result.transport.effectiveUtilization,
    slackKg: result.transport.effectiveSlack,
  },
  collectionCenters: result.collectionCenters.centerResults.map((item) => ({
    name: item.name,
    visitsPerWeek: item.visitsPerWeek,
    apparentDensityKgM3: item.apparentDensity,
    weeklyVolumeM3: item.weeklyVolumeProxy,
    teamEffectiveMinutes: item.effectiveMinutes,
    serviceWorkloadMinutes: item.serviceWorkload,
    loadingWorkloadMinutes: item.loadingWorkload,
    utilizationPercent: item.utilization,
    storageCapacityM3: item.storageCapacity,
    visitCapacityPerWeek: item.visitCapacity,
    visitSlackPerWeek: item.visitSlack,
    storageCoverageDaysAtAverageFlow: item.storageCoverageDaysProxy,
  })),
  hub: {
    effectiveMinutes: result.hub.effectiveMinutes,
    unloadWorkloadMinutes: result.hub.externalUnloadWorkload,
    directServiceWorkloadMinutes: result.hub.directServiceWorkload,
    triageLoadsPerWeek: result.hub.triageLoadsPerWeek,
    triageWorkloadMinutes: result.hub.triageWorkload,
    pressingWorkloadMinutes: result.hub.pressingWorkload,
    expeditionWorkloadMinutes: result.hub.expeditionWorkload,
    knownWorkloadMinutes: result.hub.knownWorkload,
    utilizationPercent: result.hub.utilization,
    limitingResource: result.hub.limitingResource,
    equivalentMassCapacityKg: result.hub.equivalentMassCapacity,
    equivalentMassSlackKg: result.hub.massSlack,
    operatorUtilizationPercent: result.hub.operatorUtilization,
    largePressUtilizationPercent: result.hub.largePressUtilization,
    smallPressUtilizationPercent: result.hub.smallPressUtilization,
    totalStorageM3: result.hub.totalStorage,
    intermediateStorageM3: result.hub.intermediateStorage,
    baleStorageM3: result.hub.baleStorage,
    intermediateCoverageDaysProxy: result.hub.storageCoverageDaysProxy,
    weeklyBaleVolumeM3: result.hub.weeklyBaleVolume,
    baleCoverageDaysProxy: result.hub.baleStorageCoverageDaysProxy,
  },
  indicativeBottleneck: result.indicativeBottleneck,
  annualization: result.annualization,
  physicalConstraints: result.physicalConstraints,
};

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

module.exports = { routeMaterials, scenario, result, summary };
