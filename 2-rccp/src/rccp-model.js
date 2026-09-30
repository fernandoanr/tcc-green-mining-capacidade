(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.RCCPModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPSILON = 1e-9;
  const MAX_RESOURCE_COUNT = 100;
  const MIX_PERCENT_TOLERANCE = 0.05;
  const DEFAULT_WORKING_DAYS_PER_YEAR = 312;
  const OPERATING_DAYS_PER_WEEK = 6;
  const BASELINE_WEEKS_PER_YEAR = 52;

  function finiteNonNegative(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function boundedPercent(value, fallback) {
    return Math.min(100, finiteNonNegative(value, fallback));
  }

  function finitePositive(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function isValidResourceCount(value) {
    const parsed = Number(value);
    return (
      Number.isSafeInteger(parsed) &&
      parsed >= 0 &&
      parsed <= MAX_RESOURCE_COUNT
    );
  }

  function finiteResourceCount(value, fallback) {
    if (value === undefined || value === null || value === "") {
      return isValidResourceCount(fallback) ? Number(fallback) : 0;
    }
    return isValidResourceCount(value) ? Number(value) : 0;
  }

  function localServiceProfile(scenario) {
    const defaults = {
      receptionMinutes: 0.5,
      weighingMinutes: 0.5,
      registrationMinutes: 1,
      segregationMinutes: 2,
    };
    const source = scenario && scenario.service;
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const components = {
        receptionMinutes: finiteNonNegative(
          source.receptionMinutes,
          defaults.receptionMinutes
        ),
        weighingMinutes: finiteNonNegative(
          source.weighingMinutes,
          defaults.weighingMinutes
        ),
        registrationMinutes: finiteNonNegative(
          source.registrationMinutes,
          defaults.registrationMinutes
        ),
        segregationMinutes: finiteNonNegative(
          source.segregationMinutes,
          defaults.segregationMinutes
        ),
      };
      return {
        ...components,
        totalMinutes: Object.values(components).reduce(
          (sum, value) => sum + value,
          0
        ),
      };
    }

    const totalMinutes = finiteNonNegative(
      scenario && scenario.centerServiceMinutes,
      4
    );
    const scale = totalMinutes / 4;
    return {
      receptionMinutes: defaults.receptionMinutes * scale,
      weighingMinutes: defaults.weighingMinutes * scale,
      registrationMinutes: defaults.registrationMinutes * scale,
      segregationMinutes: defaults.segregationMinutes * scale,
      totalMinutes,
    };
  }

  function localPressSettings(center, hubMaterials) {
    const source = center && center.localPress;
    const requested = Boolean(source && source.enabled === true);
    const defaultLarge = center && center.name === "Pinheiros";
    const counts = {
      large: finiteResourceCount(source && source.largePressCount, defaultLarge ? finiteResourceCount(source && source.pressCount, 1) : 0),
      small: finiteResourceCount(source && source.smallPressCount, defaultLarge ? 0 : finiteResourceCount(source && source.pressCount, 1)),
    };
    const paramsByName = new Map((hubMaterials || []).map((m) => [m.name, m]));
    const materials = requested && Array.isArray(source.materials)
      ? source.materials.filter((name) => paramsByName.has(name)) : [];
    const allocationsFor = (name) => {
      const largeFraction = boundedPercent(source && source.largePercent && source.largePercent[name], defaultLarge ? 100 : 0) / 100;
      return ["large", "small"].map((pressType) => {
        const weights = pressType === "large"
          ? { "Papelão": 200, "Plástico": 115, "Longa vida": 260 }
          : { "Papelão": 92, "Plástico": 53, "Longa vida": 120 };
        const reference = paramsByName.get(pressType === "large" ? "Papelão" : "Plástico") || {};
        return { ...(paramsByName.get(name) || {}), pressType,
          fraction: pressType === "large" ? largeFraction : 1 - largeFraction,
          baleWeight: weights[name], baleVolume: pressType === "large" ? 0.539 : 0.247,
          pressMinutes: finiteNonNegative(reference.pressMinutes, 0), setupMinutes: 0 };
      }).filter((entry) => entry.fraction > 0);
    };
    const volumePerKgFor = (name) => allocationsFor(name).reduce((sum, m) => sum + m.fraction * m.baleVolume / m.baleWeight, 0);
    const balesPerKgFor = (name) => allocationsFor(name).reduce((sum, m) => sum + m.fraction / m.baleWeight, 0);
    return { requested, enabled: requested && materials.length > 0,
      pressCount: counts.large + counts.small, counts, materials, allocationsFor,
      baledDensityFor: (name) => 1 / volumePerKgFor(name), balesPerKgFor };
  }

  function normalizeCalendar(calendar) {
    const source = calendar || {};
    const weekdayMinutes = finiteNonNegative(source.weekdayMinutes, 540);
    return {
      weekdayMinutes,
      transportWeekdayMinutes: finiteNonNegative(
        source.transportWeekdayMinutes,
        480
      ),
      saturdayMinutes: finiteNonNegative(source.saturdayMinutes, 240),
      weekdaysPerWeek: finiteNonNegative(source.weekdaysPerWeek, 5),
      saturdaysPerWeek: finiteNonNegative(source.saturdaysPerWeek, 1),
    };
  }

  function weeklyCalendarMinutes(calendar) {
    const value = normalizeCalendar(calendar);
    return (
      value.weekdaysPerWeek * value.weekdayMinutes +
      value.saturdaysPerWeek * value.saturdayMinutes
    );
  }

  function weeklyTransportCalendarMinutes(calendar) {
    const value = normalizeCalendar(calendar);
    return (
      value.weekdaysPerWeek * value.transportWeekdayMinutes +
      value.saturdaysPerWeek * value.saturdayMinutes
    );
  }

  function effectiveResourceMinutes(calendar, efficiencyPercent, resourceCount) {
    return (
      weeklyCalendarMinutes(calendar) *
      (boundedPercent(efficiencyPercent, 0) / 100) *
      finiteNonNegative(resourceCount, 0)
    );
  }

  function calculateAnnualization(scenario, transport, collectionCenters, hub, bottleneck) {
    const workingDaysPerYear = finiteNonNegative(
      scenario && scenario.workingDaysPerYear,
      DEFAULT_WORKING_DAYS_PER_YEAR
    );
    const factor = workingDaysPerYear / OPERATING_DAYS_PER_WEEK;
    const annualizeCapacity = (value) => {
      if (factor <= EPSILON) return 0;
      if (value === Infinity || value === -Infinity) return value;
      return Number.isFinite(value) ? value * factor : NaN;
    };
    const annualizeDemand = (value) => {
      if (value === Infinity || value === -Infinity) return value;
      return Number.isFinite(value) ? value * BASELINE_WEEKS_PER_YEAR : NaN;
    };
    const utilizationPercent = (demand, capacity) => {
      if (demand <= EPSILON) return 0;
      if (capacity <= EPSILON) return Infinity;
      return (demand / capacity) * 100;
    };
    const limitingUtilization = bottleneck ? bottleneck.value : 0;
    const integratedWeeklyCapacity =
      hub.totalWeeklyMass <= 0
        ? 0
        : limitingUtilization === Infinity
          ? 0
          : Number.isFinite(limitingUtilization) && limitingUtilization > EPSILON
            ? hub.totalWeeklyMass / (limitingUtilization / 100)
            : Infinity;
    const annualDemand = annualizeDemand(hub.totalWeeklyMass);
    const integratedAnnualCapacity = annualizeCapacity(integratedWeeklyCapacity);
    const transportAnnualDemand = annualizeDemand(transport.totalDemand);
    const transportAnnualCapacity = annualizeCapacity(transport.effectiveCapacity);
    const hubAnnualCapacity = annualizeCapacity(hub.equivalentMassCapacity);

    return {
      workingDaysPerYear,
      operatingDaysPerWeek: OPERATING_DAYS_PER_WEEK,
      baselineWeeksPerYear: BASELINE_WEEKS_PER_YEAR,
      factor,
      weeklyPattern: "5 dias úteis + sábado",
      methodology:
        "Capacidade anual = capacidade semanal × dias trabalhados ÷ 6. A demanda anual permanece o cenário-base oficial de 52 semanas (massas e quantidades de chegadas de 2025), sem depender dos dias trabalhados. Não representa sazonalidade, filas ou sequência operacional.",
      integrated: {
        limitingGroup: bottleneck ? bottleneck.group : null,
        limitingUtilization,
        weeklyDemandKg: hub.totalWeeklyMass,
        weeklyCapacityKg: integratedWeeklyCapacity,
        annualDemandKg: annualDemand,
        annualCapacityKg: integratedAnnualCapacity,
        annualSlackKg: integratedAnnualCapacity - annualDemand,
        annualUtilization: utilizationPercent(annualDemand, integratedAnnualCapacity),
        interpretation:
          "Capacidade indicativa: throughput total do Hub sob o mix atual dividido pela maior utilização conhecida entre Transporte, CCs e Hub; os CCs são comparados pela carga de visitas.",
      },
      transport: {
        annualDemandKg: transportAnnualDemand,
        annualCapacityKg: transportAnnualCapacity,
        annualSlackKg: transportAnnualCapacity - transportAnnualDemand,
        annualUtilization: utilizationPercent(transportAnnualDemand, transportAnnualCapacity),
      },
      collectionCenters: {
        annualVisits: collectionCenters.centerResults.map((center) => {
          const annualDemandVisits = annualizeDemand(center.visitsPerWeek);
          const annualCapacityVisits = annualizeCapacity(center.visitCapacity);
          return {
            id: center.id,
            name: center.name,
            annualDemandVisits,
            annualCapacityVisits,
            annualSlackVisits: annualCapacityVisits - annualDemandVisits,
            annualUtilization: utilizationPercent(
              annualDemandVisits,
              annualCapacityVisits
            ),
          };
        }),
      },
      hub: {
        annualDemandKg: annualDemand,
        annualCapacityKg: hubAnnualCapacity,
        annualSlackKg: hubAnnualCapacity - annualDemand,
        annualUtilization: utilizationPercent(annualDemand, hubAnnualCapacity),
      },
    };
  }

  function selectedTravelTime(route, trafficScenario) {
    if (trafficScenario === "optimistic") return route.optimistic;
    if (trafficScenario === "likely") return route.likely;
    if (trafficScenario === "pessimistic") return route.pessimistic;
    return (route.optimistic + route.likely + route.pessimistic) / 3;
  }

  // Pernas CC↔CC usam o "mais provável" da matriz e a regra documentada da
  // distribuição triangular de tempos: otimista = ×0,70; pessimista = ×1,60;
  // valor esperado = (0,70 + 1,00 + 1,60) ÷ 3 = ×1,10.
  function interCenterTravelFactor(trafficScenario) {
    if (trafficScenario === "optimistic") return 0.7;
    if (trafficScenario === "likely") return 1;
    if (trafficScenario === "pessimistic") return 1.6;
    return (0.7 + 1 + 1.6) / 3;
  }

  function interCenterKey(nameA, nameB) {
    return [String(nameA), String(nameB)].sort().join("|");
  }

  function interCenterMinutes(interCenterTravel, nameA, nameB) {
    const table = interCenterTravel && typeof interCenterTravel === "object"
      ? interCenterTravel
      : {};
    const value = Number(table[interCenterKey(nameA, nameB)]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function permutations(items) {
    if (items.length <= 1) return [items];
    const result = [];
    items.forEach((item, index) => {
      const rest = items.slice(0, index).concat(items.slice(index + 1));
      permutations(rest).forEach((tail) => result.push([item, ...tail]));
    });
    return result;
  }

  function consolidationSettings(scenario) {
    const source = scenario && scenario.consolidation;
    const enabled = Boolean(source && source.enabled === true);
    const assignments = source && typeof source.assignments === "object" && source.assignments
      ? source.assignments
      : {};
    return { enabled, assignments };
  }

  function buildConsolidationGroups(scenario, routes) {
    const settings = consolidationSettings(scenario);
    if (!settings.enabled) return { groups: [], missingLegs: [], memberGroupByName: new Map() };
    const byGroup = new Map();
    routes.forEach((route) => {
      const assignment = String(settings.assignments[route.name] || "").trim();
      if (!assignment) return;
      if (!byGroup.has(assignment)) byGroup.set(assignment, []);
      byGroup.get(assignment).push(route);
    });
    const factor = interCenterTravelFactor(scenario.trafficScenario);
    const missingLegs = [];
    const memberGroupByName = new Map();
    const groups = [];
    byGroup.forEach((members, groupId) => {
      if (members.length < 2) return; // grupo com um único CC não altera o as-is
      let best = null;
      permutations(members).forEach((order) => {
        let travel = selectedTravelTime(order[0], scenario.trafficScenario);
        let valid = true;
        for (let index = 0; index < order.length - 1; index++) {
          const leg = interCenterMinutes(
            scenario.interCenterTravel,
            order[index].name,
            order[index + 1].name
          );
          if (leg === null) {
            valid = false;
            missingLegs.push(interCenterKey(order[index].name, order[index + 1].name));
            break;
          }
          travel += leg * factor;
        }
        if (!valid) return;
        travel += selectedTravelTime(order[order.length - 1], scenario.trafficScenario);
        if (!best || travel < best.travelMinutes) {
          best = { order: order.map((route) => route.name), travelMinutes: travel };
        }
      });
      if (!best) return;
      const loadingMinutes = members.reduce(
        (sum, route) => sum + finiteNonNegative(route.loadingMinutes, 0),
        0
      );
      const cycleMinutes =
        best.travelMinutes +
        finiteNonNegative(scenario.centerWait, 0) * members.length +
        loadingMinutes +
        finiteNonNegative(scenario.hubWait, 0) +
        finiteNonNegative(scenario.unloadingMinutes, 0);
      const group = {
        id: groupId,
        members: members.map((route) => route.name),
        tourOrder: best.order,
        tourTravelMinutes: best.travelMinutes,
        loadingMinutes,
        cycleMinutes,
        interCenterFactor: factor,
      };
      groups.push(group);
      members.forEach((route) => memberGroupByName.set(route.name, group));
    });
    return {
      groups,
      missingLegs: Array.from(new Set(missingLegs)),
      memberGroupByName,
    };
  }

  function calculateRouteMaterialProfile(route, weeklyDemand, fallbackDensity, densityOverrides) {
    const materials = Array.isArray(route && route.materials) ? route.materials : [];
    const overrideFor = (name) => {
      if (!densityOverrides || typeof densityOverrides.get !== "function") return 0;
      const entry = densityOverrides.get(name);
      return typeof entry === "object" ? entry : { density: finitePositive(entry, 0), fraction: 1 };
    };
    const configuredMass = materials.reduce(
      (sum, material) => sum + finiteNonNegative(material.annualMass, 0),
      0
    );
    if (!materials.length) {
      const density = finitePositive(fallbackDensity, 0);
      return {
        materialResults: [],
        weeklyVolumeDemand: density > 0 ? weeklyDemand / density : 0,
        apparentDensity: density,
        mixPercentTotal: 100,
        mixValid: true,
        mixTolerance: MIX_PERCENT_TOLERANCE,
        mixSource: "densityFallback",
      };
    }
    const hasExplicitMix = materials.some((material) =>
      Object.prototype.hasOwnProperty.call(material, "mixPercent")
    );
    const explicitMixValues = materials.map((material) => Number(material.mixPercent));
    const allExplicitMixValuesAreFinite =
      hasExplicitMix && explicitMixValues.every((value) => Number.isFinite(value));
    const allExplicitMixValuesAreNonNegative =
      allExplicitMixValuesAreFinite && explicitMixValues.every((value) => value >= 0);
    const explicitMixTotal = allExplicitMixValuesAreFinite
      ? explicitMixValues.reduce((sum, value) => sum + value, 0)
      : NaN;
    const mixValid = hasExplicitMix
      ? allExplicitMixValuesAreNonNegative &&
        Math.abs(explicitMixTotal - 100) <= MIX_PERCENT_TOLERANCE
      : configuredMass > 0;
    const useExplicitMix =
      allExplicitMixValuesAreNonNegative && explicitMixTotal > EPSILON;
    const mixWeights = materials.map((material, index) =>
      useExplicitMix
        ? explicitMixValues[index]
        : finiteNonNegative(material.annualMass, 0)
    );
    const mixWeightTotal = mixWeights.reduce((sum, value) => sum + value, 0);
    const materialResults = materials.map((material, index) => {
      const share = mixWeightTotal > 0 ? mixWeights[index] / mixWeightTotal : 0;
      const sourceDensity = finitePositive(material.density, 0);
      const override = overrideFor(material.name) || {};
      const overrideDensity = finitePositive(override.density, 0);
      const pressedFraction = overrideDensity > 0 ? boundedPercent(override.fraction * 100, 100) / 100 : 0;
      const weeklyMass = weeklyDemand * share;
      const pressedWeeklyMass = weeklyMass * pressedFraction;
      const looseWeeklyMass = weeklyMass - pressedWeeklyMass;
      const weeklyVolume = (overrideDensity > 0 ? pressedWeeklyMass / overrideDensity : 0) +
        (sourceDensity > 0 ? looseWeeklyMass / sourceDensity : 0);
      const effectiveDensity = weeklyVolume > 0 ? weeklyMass / weeklyVolume : sourceDensity;
      return {
        ...material,
        share,
        mixPercent: hasExplicitMix && Number.isFinite(explicitMixValues[index])
          ? explicitMixValues[index]
          : share * 100,
        sourceDensity,
        effectiveDensity,
        pressedAtCenter: pressedFraction > 0,
        pressedFraction,
        pressedWeeklyMass,
        prePressedBales: pressedWeeklyMass * (override.balesPerKg || 0),
        prePressedVolume: overrideDensity > 0 ? pressedWeeklyMass / overrideDensity : 0,
        weeklyMass,
        weeklyVolume,
      };
    });
    const weeklyVolumeDemand = materialResults.reduce(
      (sum, material) => sum + material.weeklyVolume,
      0
    );
    return {
      materialResults,
      weeklyVolumeDemand,
      apparentDensity:
        weeklyVolumeDemand > 0 ? weeklyDemand / weeklyVolumeDemand : 0,
      mixPercentTotal: hasExplicitMix ? explicitMixTotal : 100,
      mixValid,
      mixTolerance: MIX_PERCENT_TOLERANCE,
      mixSource: hasExplicitMix ? "explicitPercent" : "annualMassFallback",
    };
  }

  function calculateTransport(scenario) {
    const calendar = normalizeCalendar(scenario.calendar);
    const transportEfficiency = boundedPercent(
      scenario.efficiency && scenario.efficiency.transport,
      100
    );
    const truckCount = finiteResourceCount(scenario.truckCount, 0);
    const routes = Array.isArray(scenario.routes) ? scenario.routes : [];
    const totalDemand = routes.reduce(
      (sum, route) => sum + finiteNonNegative(route.demand, 0),
      0
    );
    const centersByName = new Map(
      (Array.isArray(scenario.centers) ? scenario.centers : []).map((center) => [
        center && center.name,
        center,
      ])
    );
    const hubMaterials = scenario.hub && scenario.hub.materials;
    const preliminaryRoutes = routes.map((route) => {
      const travelMinutes = selectedTravelTime(route, scenario.trafficScenario);
      const demand = finiteNonNegative(route.demand, 0);
      const localPress = localPressSettings(
        centersByName.get(route.name),
        hubMaterials
      );
      const densityOverrides = localPress.enabled
        ? new Map(
            localPress.materials.map((name) => [name, {
              density: localPress.baledDensityFor(name), fraction: 1,
              balesPerKg: localPress.balesPerKgFor(name),
            }])
          )
        : null;
      const materialProfile = calculateRouteMaterialProfile(
        route,
        demand,
        0,
        densityOverrides
      );
      const cycleMinutes =
        2 * travelMinutes +
        finiteNonNegative(scenario.centerWait, 0) +
        finiteNonNegative(route.loadingMinutes, 0) +
        finiteNonNegative(scenario.hubWait, 0) +
        finiteNonNegative(scenario.unloadingMinutes, 0);
      return {
        ...route,
        demand,
        travelMinutes,
        cycleMinutes,
        share: totalDemand > 0 ? demand / totalDemand : 0,
        localPressActive: localPress.enabled,
        localPressMaterials: localPress.materials,
        ...materialProfile,
      };
    });
    const totalWeeklyVolumeDemand = preliminaryRoutes.reduce(
      (sum, route) => sum + route.weeklyVolumeDemand,
      0
    );
    const densityComponents = preliminaryRoutes.flatMap((route) =>
      route.materialResults.map((material) => ({
        route: route.name,
        material: material.name,
        routeShare: totalDemand > 0 ? route.demand / totalDemand : 0,
        materialShare: material.share,
        arrivalMixWeight:
          totalDemand > 0 ? material.weeklyMass / totalDemand : 0,
        sourceDensity: material.sourceDensity,
        density: material.effectiveDensity,
      }))
    );
    const densityWeightTotal = densityComponents.reduce(
      (sum, component) => sum + component.arrivalMixWeight,
      0
    );
    const hasInvalidWeightedDensity = densityComponents.some(
      (component) =>
        component.arrivalMixWeight > EPSILON &&
        finitePositive(component.density, 0) <= 0
    );
    const hasIncompleteDensityWeight =
      totalDemand > EPSILON && Math.abs(densityWeightTotal - 1) > 1e-6;
    const weightedSpecificVolume = densityComponents.reduce(
      (sum, component) =>
        finitePositive(component.density, 0) > 0
          ? sum + component.arrivalMixWeight / component.density
          : sum,
      0
    );
    const arrivalWeightedSpecificVolume = densityComponents.reduce(
      (sum, component) =>
        finitePositive(component.sourceDensity, 0) > 0
          ? sum + component.arrivalMixWeight / component.sourceDensity
          : sum,
      0
    );
    const calculatedMixDensity =
      !hasInvalidWeightedDensity &&
      !hasIncompleteDensityWeight &&
      weightedSpecificVolume > EPSILON
        ? densityWeightTotal / weightedSpecificVolume
        : 0;
    const arrivalMixDensity =
      !hasIncompleteDensityWeight && arrivalWeightedSpecificVolume > EPSILON
        ? densityWeightTotal / arrivalWeightedSpecificVolume
        : 0;
    const usableTruckVolume =
      finiteNonNegative(scenario.truckVolume, 0) *
      (boundedPercent(scenario.volumeOccupancy, 0) / 100);
    const weightCapacity = finiteNonNegative(scenario.weightLimit, 0);
    const volumeCapacity = usableTruckVolume * calculatedMixDensity;
    const routeResultsWithoutShares = preliminaryRoutes.map((route) => {
      const routeVolumeCapacity = usableTruckVolume * route.apparentDensity;
      const materialCapacityResults = route.materialResults.map((material) => {
        const materialVolumeCapacity =
          usableTruckVolume * finiteNonNegative(material.effectiveDensity, 0);
        const materialTripCapacity = Math.min(
          materialVolumeCapacity,
          weightCapacity
        );
        return {
          ...material,
          volumeCapacity: materialVolumeCapacity,
          tripCapacity: materialTripCapacity,
          equivalentTrips:
            materialTripCapacity > 0
              ? finiteNonNegative(material.weeklyMass, 0) / materialTripCapacity
              : 0,
          isVolumeLimited: materialVolumeCapacity <= weightCapacity,
        };
      });
      const materialEquivalentTrips = materialCapacityResults.reduce(
        (sum, material) => sum + material.equivalentTrips,
        0
      );
      const fallbackTripCapacity = Math.min(
        routeVolumeCapacity,
        weightCapacity
      );
      const routeTripCapacity = materialCapacityResults.length
        ? materialEquivalentTrips > 0
          ? route.demand / materialEquivalentTrips
          : 0
        : fallbackTripCapacity;
      return {
        ...route,
        materialResults: materialCapacityResults,
        volumeCapacity: routeVolumeCapacity,
        tripCapacity: routeTripCapacity,
        isVolumeLimited: materialCapacityResults.length
          ? materialCapacityResults.every((material) => material.isVolumeLimited)
          : routeVolumeCapacity <= weightCapacity,
        equivalentTrips:
          materialCapacityResults.length
            ? materialEquivalentTrips
            : routeTripCapacity > 0
              ? route.demand / routeTripCapacity
              : 0,
      };
    });
    const equivalentTripsRequired = routeResultsWithoutShares.reduce(
      (sum, route) => sum + route.equivalentTrips,
      0
    );
    const consolidation = buildConsolidationGroups(
      scenario,
      routeResultsWithoutShares
    );
    const groupResults = consolidation.groups.map((group) => {
      const memberRoutes = routeResultsWithoutShares.filter((route) =>
        group.members.includes(route.name)
      );
      const equivalentTrips = memberRoutes.reduce(
        (sum, route) => sum + route.equivalentTrips,
        0
      );
      const demand = memberRoutes.reduce((sum, route) => sum + route.demand, 0);
      return { ...group, equivalentTrips, demand };
    });
    const groupByMemberName = new Map();
    groupResults.forEach((group) =>
      group.members.forEach((name) => groupByMemberName.set(name, group))
    );
    const routeResults = routeResultsWithoutShares.map((route) => {
      const group = groupByMemberName.get(route.name) || null;
      return {
        ...route,
        tripShare:
          equivalentTripsRequired > 0
            ? route.equivalentTrips / equivalentTripsRequired
            : 0,
        consolidationGroup: group ? group.id : null,
        groupCycleMinutes: group ? group.cycleMinutes : null,
        loadingTripsForWorkload: group
          ? group.equivalentTrips
          : route.equivalentTrips,
      };
    });
    const tripCapacity =
      equivalentTripsRequired > 0
        ? totalDemand / equivalentTripsRequired
        : Math.min(volumeCapacity, weightCapacity);
    // Classes de tour: cada grupo consolidado pondera o ciclo do tour completo;
    // rotas fora de grupo mantêm o próprio ciclo Hub → CC → Hub.
    const tourClasses = groupResults
      .map((group) => ({
        equivalentTrips: group.equivalentTrips,
        cycleMinutes: group.cycleMinutes,
        oneWayTravelMinutes: group.tourTravelMinutes / 2,
      }))
      .concat(
        routeResults
          .filter((route) => !route.consolidationGroup)
          .map((route) => ({
            equivalentTrips: route.equivalentTrips,
            cycleMinutes: route.cycleMinutes,
            oneWayTravelMinutes: route.travelMinutes,
          }))
      );
    const weightedCycle = tourClasses.reduce(
      (sum, tour) =>
        sum +
        (equivalentTripsRequired > 0
          ? tour.equivalentTrips / equivalentTripsRequired
          : 0) *
          tour.cycleMinutes,
      0
    );
    const capacityWeightedTravelMinutes = tourClasses.reduce(
      (sum, tour) =>
        sum +
        (equivalentTripsRequired > 0
          ? tour.equivalentTrips / equivalentTripsRequired
          : 0) *
          tour.oneWayTravelMinutes,
      0
    );
    const demandWeightedTravelMinutes = routeResults.reduce(
      (sum, route) => sum + route.share * route.travelMinutes,
      0
    );
    const simpleTravelMinutes = routeResults.length
      ? routeResults.reduce((sum, route) => sum + route.travelMinutes, 0) /
        routeResults.length
      : 0;
    const materialLimitFlags = routeResults.flatMap((route) =>
      route.materialResults.length
        ? route.materialResults.map((material) => material.isVolumeLimited)
        : [route.isVolumeLimited]
    );
    const hasVolumeLimitedMaterials = materialLimitFlags.some(Boolean);
    const hasWeightLimitedMaterials = materialLimitFlags.some(
      (isVolumeLimited) => !isVolumeLimited
    );
    const limitingMode = hasVolumeLimitedMaterials && hasWeightLimitedMaterials
      ? "mixed"
      : hasWeightLimitedMaterials
        ? "weight"
        : "volume";
    const hasValidCycle = weightedCycle > 0;
    const efficiencyFactor = transportEfficiency / 100;
    const weekdayEffectiveMinutes =
      calendar.transportWeekdayMinutes * efficiencyFactor;
    const saturdayEffectiveMinutes = calendar.saturdayMinutes * efficiencyFactor;
    const nominalStartsForDay = (minutes) => {
      if (!hasValidCycle || minutes <= 0) return 0;
      // Capacidade representa ciclos completos dentro da jornada. Uma viagem
      // que ultrapassa o fechamento não entra no teto nominal do dia.
      const tripsPerTruck = Math.floor((minutes + EPSILON) / weightedCycle);
      return tripsPerTruck * truckCount;
    };

    const nominalWeekdayTrips = nominalStartsForDay(
      calendar.transportWeekdayMinutes
    );
    const nominalSaturdayTrips = nominalStartsForDay(calendar.saturdayMinutes);
    const nominalTrips =
      calendar.weekdaysPerWeek * nominalWeekdayTrips +
      calendar.saturdaysPerWeek * nominalSaturdayTrips;
    const effectiveTripsUnrounded = nominalTrips * efficiencyFactor;
    const effectiveTrips = Math.floor(effectiveTripsUnrounded + EPSILON);
    const effectiveWeekdayTrips = nominalWeekdayTrips * efficiencyFactor;
    const effectiveSaturdayTrips = nominalSaturdayTrips * efficiencyFactor;
    const nominalCapacity = nominalTrips * tripCapacity;
    const effectiveCapacity = effectiveTrips * tripCapacity;
    const effectiveSlack = effectiveCapacity - totalDemand;
    const effectiveUtilization =
      effectiveCapacity > 0
        ? (totalDemand / effectiveCapacity) * 100
        : totalDemand > 0
          ? Infinity
          : 0;

    return {
      routeResults,
      totalDemand,
      consolidation: {
        enabled: consolidationSettings(scenario).enabled,
        groups: groupResults,
        missingLegs: consolidation.missingLegs,
        interCenterFactor: interCenterTravelFactor(scenario.trafficScenario),
        policy:
          "Consolidação não reduz viagens equivalentes (limites do caminhão); altera o ciclo do tour, as paradas de carregamento e deve ser comparada a cenários de chamada antecipada via ocupação média.",
      },
      weightedCycle,
      weightedTravelMinutes: demandWeightedTravelMinutes,
      demandWeightedTravelMinutes,
      capacityWeightedTravelMinutes,
      simpleTravelMinutes,
      returnToHub: scenario.returnToHub !== false,
      transportEfficiency,
      weeklyCalendarMinutes: weeklyTransportCalendarMinutes(calendar),
      transportWeekdayMinutes: calendar.transportWeekdayMinutes,
      effectiveMinutes:
        calendar.weekdaysPerWeek * weekdayEffectiveMinutes +
        calendar.saturdaysPerWeek * saturdayEffectiveMinutes,
      weekdayEffectiveMinutes,
      saturdayEffectiveMinutes,
      nominalWeekdayTrips,
      effectiveWeekdayTrips,
      nominalSaturdayTrips,
      effectiveSaturdayTrips,
      nominalTrips,
      effectiveTrips,
      effectiveTripsUnrounded,
      volumeCapacity,
      usableTruckVolume,
      weightCapacity,
      tripCapacity,
      automaticMixDensity: calculatedMixDensity,
      arrivalMixDensity,
      calculatedMixDensity,
      densityMethod: "arrival-mix-weighted-harmonic",
      densityComponents,
      densityWeightTotal,
      weightedSpecificVolume,
      arrivalWeightedSpecificVolume,
      hasInvalidWeightedDensity,
      hasIncompleteDensityWeight,
      totalWeeklyVolumeDemand,
      equivalentTripsRequired,
      nominalCapacity,
      effectiveCapacity,
      effectiveSlack,
      effectiveUtilization,
      isVolumeLimited: limitingMode === "volume",
      hasVolumeLimitedMaterials,
      hasWeightLimitedMaterials,
      limitingMode,
      efficiencyApplication:
        "A eficiência reduz proporcionalmente as partidas nominais semanais; o resultado efetivo é arredondado para baixo para manter viagens inteiras.",
      hasValidCapacity:
        hasValidCycle &&
        truckCount > 0 &&
        tripCapacity > 0 &&
        (totalDemand <= 0 || effectiveCapacity > 0),
    };
  }

  function calculateCenters(scenario, transport) {
    const calendar = normalizeCalendar(scenario.calendar);
    const efficiency = boundedPercent(
      scenario.efficiency && scenario.efficiency.collectionCenters,
      100
    );
    const serviceProfile = localServiceProfile(scenario);
    const serviceMinutesPerVisit = serviceProfile.totalMinutes;
    const centers = Array.isArray(scenario.centers) ? scenario.centers : [];
    const routesByName = new Map(
      transport.routeResults.map((route) => [route.name, route])
    );

    const centerResults = centers.map((center) => {
      const route = routesByName.get(center.name);
      const weeklyDemand = route ? route.demand : finiteNonNegative(center.weeklyDemand, 0);
      const visitsPerWeek = finiteNonNegative(center.visitsPerWeek, 0);
      const staff = finiteResourceCount(center.staff, 0);
      const loadingOperators = finiteResourceCount(center.loadingOperators, 1);
      const loadingMinutes = route
        ? finiteNonNegative(route.loadingMinutes, 0)
        : finiteNonNegative(center.loadingMinutes, 0);
      const equivalentTrips =
        route
          ? finiteNonNegative(route.equivalentTrips, 0)
          : 0;
      const loadingStopsPerWeek = route
        ? finiteNonNegative(
            route.loadingTripsForWorkload !== undefined
              ? route.loadingTripsForWorkload
              : route.equivalentTrips,
            0
          )
        : 0;
      const serviceWorkload = visitsPerWeek * serviceMinutesPerVisit;
      const loadingWorkload =
        loadingStopsPerWeek * loadingMinutes * loadingOperators;
      const localPress = localPressSettings(center, scenario.hub && scenario.hub.materials);
      const localPressMaterialResults = localPress.enabled && route
        ? route.materialResults
            .filter((material) => localPress.materials.includes(material.name))
            .flatMap((material) => localPress.allocationsFor(material.name).map((params) => {
              const weeklyMass = material.weeklyMass * params.fraction;
              const bales = params.baleWeight > 0 ? weeklyMass / params.baleWeight : 0;
              const movementMinutes = finiteNonNegative(params.movementMinutes, 0);
              return { name: material.name, weeklyMass, bales,
                pressType: params.pressType, baleWeight: params.baleWeight,
                baleVolume: params.baleVolume, pressMinutes: params.pressMinutes,
                movementMinutes, setupMinutes: 0,
                operatorWorkload: bales * (movementMinutes + params.pressMinutes),
                machineWorkload: bales * params.pressMinutes };
            }))
        : [];
      const localPressWorkload = localPressMaterialResults.reduce(
        (sum, material) => sum + material.operatorWorkload,
        0
      );
      const localPressMachineWorkload = localPressMaterialResults.reduce(
        (sum, material) => sum + material.machineWorkload,
        0
      );
      const localPressMachineAvailableMinutes =
        weeklyCalendarMinutes(calendar) * (efficiency / 100) * localPress.pressCount;
      const localPressResources = ["large", "small"].map((pressType) => {
        const count = localPress.counts[pressType];
        const workload = localPressMaterialResults.filter((m) => m.pressType === pressType)
          .reduce((sum, m) => sum + m.machineWorkload, 0);
        const availableMinutes = weeklyCalendarMinutes(calendar) * (efficiency / 100) * count;
        return { pressType, count, workload, availableMinutes,
          utilization: availableMinutes > 0 ? workload / availableMinutes * 100 : workload > 0 ? Infinity : 0 };
      });
      const localPressMachineUtilization = Math.max(...localPressResources.map((r) => r.utilization));
      const knownWorkload = serviceWorkload + loadingWorkload + localPressWorkload;
      const grossMinutes = weeklyCalendarMinutes(calendar) * staff;
      const effectiveMinutes = effectiveResourceMinutes(calendar, efficiency, staff);
      const staffUtilization =
        effectiveMinutes > 0
          ? (knownWorkload / effectiveMinutes) * 100
          : knownWorkload > 0
            ? Infinity
            : 0;
      const utilization = localPress.enabled
        ? Math.max(staffUtilization, localPressMachineUtilization)
        : staffUtilization;
      const residualVisitCapacity =
        serviceMinutesPerVisit > 0
          ? Math.max(
              0,
              (effectiveMinutes - loadingWorkload - localPressWorkload) /
                serviceMinutesPerVisit
            )
          : effectiveMinutes + EPSILON >= loadingWorkload + localPressWorkload
            ? Infinity
            : 0;
      const visitSlack = residualVisitCapacity - visitsPerWeek;
      const weeklyVolumeProxy = route
        ? finiteNonNegative(route.weeklyVolumeDemand, 0)
        : finitePositive(transport.calculatedMixDensity, 0) > 0
          ? weeklyDemand / finitePositive(transport.calculatedMixDensity, 0)
          : 0;
      const operatingDays =
        calendar.weekdaysPerWeek + calendar.saturdaysPerWeek;
      const dailyVolumeProxy =
        operatingDays > 0 ? weeklyVolumeProxy / operatingDays : 0;
      const storageCapacity = finiteNonNegative(center.storageCapacity, 0);
      const storageCoverageDaysProxy =
        dailyVolumeProxy > 0 ? storageCapacity / dailyVolumeProxy : null;

      return {
        ...center,
        weeklyDemand,
        visitsPerWeek,
        efficiency,
        grossMinutes,
        effectiveMinutes,
        serviceMinutesPerVisit,
        serviceWorkload,
        equivalentTrips,
        loadingStopsPerWeek,
        consolidationGroup: route ? route.consolidationGroup || null : null,
        loadingMinutes,
        loadingWorkload,
        localPressEnabled: localPress.enabled,
        localPressMaterials: localPress.materials,
        localPressCount: localPress.enabled ? localPress.pressCount : 0,
        localPressMaterialResults,
        localPressResources,
        localPressWorkload,
        localPressMachineWorkload,
        localPressMachineAvailableMinutes: localPress.enabled
          ? localPressMachineAvailableMinutes
          : 0,
        localPressMachineUtilization: localPress.enabled
          ? localPressMachineUtilization
          : 0,
        staffUtilization,
        knownWorkload,
        utilization,
        residualVisitCapacity,
        visitCapacity: residualVisitCapacity,
        visitSlack,
        weeklyVolumeProxy,
        apparentDensity:
          route && finitePositive(route.apparentDensity, 0) > 0
            ? route.apparentDensity
            : finitePositive(transport.calculatedMixDensity, 0),
        materialResults: route ? route.materialResults : [],
        stockMonitoringWorkload: 0,
        stockMonitoringRule:
          "Acompanhamento visual estimado pelos operadores; não limita a capacidade RCCP.",
        storageCoverageDaysProxy,
      };
    });

    return {
      efficiency,
      serviceMinutesPerVisit,
      serviceProfile,
      centerResults,
      maxUtilization: centerResults.reduce(
        (maximum, center) => Math.max(maximum, center.utilization),
        0
      ),
    };
  }

  function calculateHub(scenario, transport) {
    const calendar = normalizeCalendar(scenario.calendar);
    const efficiency = boundedPercent(
      scenario.efficiency && scenario.efficiency.hub,
      100
    );
    const hub = scenario.hub || {};
    const staff = finiteResourceCount(hub.staff, 6);
    const effectiveMinutes = effectiveResourceMinutes(calendar, efficiency, staff);
    const externalUnloadPeople = finiteResourceCount(hub.unloadingPeople, 3);
    const externalTripsRequired = finiteNonNegative(
      transport.equivalentTripsRequired,
      0
    );
    const externalUnloadWorkload =
      externalTripsRequired *
      finiteNonNegative(scenario.unloadingMinutes, 0) *
      externalUnloadPeople;
    const directVisitsPerWeek = finiteNonNegative(hub.directVisitsPerWeek, 0);
    const directServiceMinutes = localServiceProfile(scenario).totalMinutes;
    const directServiceWorkload = directVisitsPerWeek * directServiceMinutes;
    const externalTriageEnabled = hub.externalTriageEnabled === true;
    const triageMinutesPerLoad = externalTriageEnabled
      ? finiteNonNegative(hub.triageMinutesPerLoad, 0)
      : 0;
    const triagePeople = externalTriageEnabled
      ? finiteResourceCount(hub.triagePeople, 0)
      : 0;
    const triageLoadsPerWeek = externalTriageEnabled ? externalTripsRequired : 0;
    const triageWorkload =
      triageLoadsPerWeek * triageMinutesPerLoad * triagePeople;
    const materials = Array.isArray(hub.materials) ? hub.materials : [];
    const directWeeklyMass = Object.prototype.hasOwnProperty.call(
      hub,
      "directWeeklyMass"
    )
      ? finiteNonNegative(hub.directWeeklyMass, 0)
      : finiteNonNegative(hub.directAnnualMass, 0) / 52;
    const totalWeeklyMass = transport.totalDemand + directWeeklyMass;
    const directMaterialProfile = calculateRouteMaterialProfile(
      {
        name: "Santo Amaro direto",
        materials: Array.isArray(hub.directMaterials) ? hub.directMaterials : [],
      },
      directWeeklyMass,
      finitePositive(transport.calculatedMixDensity, 0)
    );
    const configuredAnnualMass = materials.reduce(
      (sum, material) => sum + finiteNonNegative(material.annualMass, 0),
      0
    );
    const incomingWeeklyMassByMaterial = new Map();
    const addIncomingMaterial = (material) => {
      const name = String(material && material.name || "");
      incomingWeeklyMassByMaterial.set(
        name,
        (incomingWeeklyMassByMaterial.get(name) || 0) +
          finiteNonNegative(material && material.weeklyMass, 0)
      );
    };
    transport.routeResults.forEach((route) =>
      route.materialResults.forEach(addIncomingMaterial)
    );
    directMaterialProfile.materialResults.forEach(addIncomingMaterial);
    const prePressedWeeklyMassByMaterial = new Map();
    const prePressedBalesByMaterial = new Map();
    const prePressedVolumeByMaterial = new Map();
    transport.routeResults.forEach((route) => {
      route.materialResults.forEach((material) => {
        if (!material.pressedAtCenter) return;
        const name = String(material && material.name || "");
        prePressedWeeklyMassByMaterial.set(
          name,
          (prePressedWeeklyMassByMaterial.get(name) || 0) +
            finiteNonNegative(material.pressedWeeklyMass, 0)
        );
        prePressedBalesByMaterial.set(name, (prePressedBalesByMaterial.get(name) || 0) + material.prePressedBales);
        prePressedVolumeByMaterial.set(name, (prePressedVolumeByMaterial.get(name) || 0) + material.prePressedVolume);
      });
    });
    const technicalMaterialNames = new Set(
      materials.map((material) => String(material.name || ""))
    );
    const mappedIncomingMass = Array.from(incomingWeeklyMassByMaterial.entries())
      .filter(([name]) => technicalMaterialNames.has(name))
      .reduce((sum, [, mass]) => sum + mass, 0);
    const unmappedMaterialMass = Array.from(incomingWeeklyMassByMaterial.entries())
      .filter(([name]) => !technicalMaterialNames.has(name))
      .reduce((sum, [, mass]) => sum + mass, 0);
    const massWithoutMaterialProfile = Math.max(
      0,
      totalWeeklyMass - mappedIncomingMass
    );

    const materialResults = materials.map((material) => {
      const fallbackMaterialShare =
        configuredAnnualMass > 0
          ? finiteNonNegative(material.annualMass, 0) / configuredAnnualMass
          : 0;
      const weeklyMass =
        finiteNonNegative(incomingWeeklyMassByMaterial.get(material.name), 0) +
        massWithoutMaterialProfile * fallbackMaterialShare;
      const materialShare = totalWeeklyMass > 0 ? weeklyMass / totalWeeklyMass : 0;
      const baleWeight = finiteNonNegative(material.baleWeight, 0);
      const prePressedWeeklyMass = Math.min(
        weeklyMass,
        finiteNonNegative(prePressedWeeklyMassByMaterial.get(material.name), 0)
      );
      const massToPressAtHub = Math.max(0, weeklyMass - prePressedWeeklyMass);
      const balesToPressAtHub =
        baleWeight > 0 ? massToPressAtHub / baleWeight : 0;
      const prePressedBales = prePressedBalesByMaterial.get(material.name) || 0;
      const balesRequired = balesToPressAtHub + prePressedBales;
      const operatorMinutesPerBale =
        finiteNonNegative(material.movementMinutes, 0) +
        finiteNonNegative(material.pressMinutes, 0);
      const pressingWorkload = balesToPressAtHub * operatorMinutesPerBale;
      const withdrawalThreshold = finiteNonNegative(
        material.withdrawalThreshold,
        0
      );
      const minimumBales =
        baleWeight > 0 ? Math.ceil(withdrawalThreshold / baleWeight) : 0;
      const effectiveWithdrawalMass = minimumBales * baleWeight;
      const equivalentWithdrawals =
        effectiveWithdrawalMass > 0 ? weeklyMass / effectiveWithdrawalMass : 0;
      const baleVolume = finiteNonNegative(material.baleVolume, 0);
      const weeklyBaleVolume = balesToPressAtHub * baleVolume +
        (prePressedVolumeByMaterial.get(material.name) || 0);
      const pressType =
        material.pressType === "large" || material.pressType === "small"
          ? material.pressType
          : String(material.name || "").toLowerCase().includes("papel")
            ? "large"
            : "small";
      const machineWorkload =
        balesToPressAtHub * finiteNonNegative(material.pressMinutes, 0);
      return {
        ...material,
        pressType,
        materialShare,
        weeklyMass,
        balesRequired,
        prePressedWeeklyMass,
        massToPressAtHub,
        balesToPressAtHub,
        operatorMinutesPerBale,
        pressingWorkload,
        minimumBales,
        effectiveWithdrawalMass,
        equivalentWithdrawals,
        baleVolume,
        weeklyBaleVolume,
        machineWorkload,
      };
    });
    const pressingWorkload = materialResults.reduce(
      (sum, material) => sum + material.pressingWorkload,
      0
    );
    const equivalentWithdrawals = materialResults.reduce(
      (sum, material) => sum + material.equivalentWithdrawals,
      0
    );
    const expeditionReferenceMinutes = finiteNonNegative(
      hub.expeditionReferenceMinutes,
      30
    );
    const expeditionPeople = finiteResourceCount(hub.expeditionPeople, 6);
    const expeditionWorkload =
      equivalentWithdrawals * expeditionReferenceMinutes * expeditionPeople;
    const weeklyBaleVolume = materialResults.reduce(
      (sum, material) => sum + material.weeklyBaleVolume,
      0
    );
    const knownWorkload =
      pressingWorkload +
      expeditionWorkload +
      externalUnloadWorkload +
      directServiceWorkload +
      triageWorkload;
    const operatorUtilization =
      effectiveMinutes > 0
        ? (knownWorkload / effectiveMinutes) * 100
        : knownWorkload > 0
          ? Infinity
          : 0;
    const machineMinutesPerPress =
      weeklyCalendarMinutes(calendar) * (efficiency / 100);
    const largePressCount = finiteResourceCount(hub.largePressCount, 2);
    const smallPressCount = finiteResourceCount(hub.smallPressCount, 4);
    const largePressWorkload = materialResults
      .filter((material) => material.pressType === "large")
      .reduce((sum, material) => sum + material.machineWorkload, 0);
    const smallPressWorkload = materialResults
      .filter((material) => material.pressType === "small")
      .reduce((sum, material) => sum + material.machineWorkload, 0);
    const largePressAvailableMinutes = machineMinutesPerPress * largePressCount;
    const smallPressAvailableMinutes = machineMinutesPerPress * smallPressCount;
    const utilizationFor = (workload, available) =>
      available > 0
        ? (workload / available) * 100
        : workload > 0
          ? Infinity
          : 0;
    const capacityFactorFor = (workload, available) =>
      workload > 0 ? available / workload : Infinity;
    const largePressUtilization = utilizationFor(
      largePressWorkload,
      largePressAvailableMinutes
    );
    const smallPressUtilization = utilizationFor(
      smallPressWorkload,
      smallPressAvailableMinutes
    );
    const operatorCapacityFactor = capacityFactorFor(knownWorkload, effectiveMinutes);
    const largePressCapacityFactor = capacityFactorFor(
      largePressWorkload,
      largePressAvailableMinutes
    );
    const smallPressCapacityFactor = capacityFactorFor(
      smallPressWorkload,
      smallPressAvailableMinutes
    );
    const capacityFactor = Math.min(
      operatorCapacityFactor,
      largePressCapacityFactor,
      smallPressCapacityFactor
    );
    const equivalentMassCapacity =
      totalWeeklyMass > 0 && Number.isFinite(capacityFactor)
        ? totalWeeklyMass * capacityFactor
        : totalWeeklyMass > 0 && capacityFactor === Infinity
          ? Infinity
          : 0;
    const massSlack = equivalentMassCapacity - totalWeeklyMass;
    const resourceUtilizations = [
      { resource: "Equipe compartilhada", value: operatorUtilization },
      { resource: "Prensas grandes", value: largePressUtilization },
      { resource: "Prensas pequenas", value: smallPressUtilization },
    ];
    const limitingResource = resourceUtilizations.reduce(
      (current, candidate) =>
        candidate.value > current.value ? candidate : current,
      resourceUtilizations[0]
    );
    const utilization = limitingResource.value;
    const totalWeeklyVolumeProxy =
      finiteNonNegative(transport.totalWeeklyVolumeDemand, 0) +
      finiteNonNegative(directMaterialProfile.weeklyVolumeDemand, 0);
    const operatingDays =
      calendar.weekdaysPerWeek + calendar.saturdaysPerWeek;
    const dailyVolumeProxy =
      operatingDays > 0 ? totalWeeklyVolumeProxy / operatingDays : 0;
    const totalStorage = finiteNonNegative(hub.totalStorage, 493);
    const storageMode = hub.storageMode === "shared" ? "shared" : "allocated";
    const intermediateStorage = storageMode === "shared"
      ? totalStorage
      : finiteNonNegative(hub.intermediateStorage, 0);
    const baleStorage = storageMode === "shared"
      ? totalStorage
      : Math.max(0, totalStorage - intermediateStorage);
    const dailyBaleVolume = operatingDays > 0 ? weeklyBaleVolume / operatingDays : 0;

    return {
      efficiency,
      staff,
      effectiveMinutes,
      externalTripsRequired,
      externalUnloadWorkload,
      directVisitsPerWeek,
      directServiceWorkload,
      triageMinutesPerLoad,
      triagePeople,
      triageLoadsPerWeek,
      externalTriageEnabled,
      triageWorkload,
      directTriageLoadsPerWeek: 0,
      triagePolicy: externalTriageEnabled
        ? "Cada carga vinda dos CCs usa o tempo e a equipe informados."
        : "Sem triagem de cargas vindas dos CCs.",
      directMaterialProfile,
      directMixPercentTotal: directMaterialProfile.mixPercentTotal,
      directMixValid: directMaterialProfile.mixValid,
      materialResults,
      prePressedWeeklyMass: materialResults.reduce(
        (sum, material) => sum + material.prePressedWeeklyMass,
        0
      ),
      localPressPolicy:
        "Massa prensada nos CCs viaja na densidade do fardo e não repete movimentação nem prensagem no Hub; fardos, retiradas e expedição permanecem contabilizados no Hub.",
      pressingWorkload,
      equivalentWithdrawals,
      expeditionWorkload,
      weeklyBaleVolume,
      knownWorkload,
      utilization,
      operatorUtilization,
      largePressUtilization,
      smallPressUtilization,
      machineMinutesPerPress,
      largePressCount,
      smallPressCount,
      largePressWorkload,
      smallPressWorkload,
      largePressAvailableMinutes,
      smallPressAvailableMinutes,
      operatorCapacityFactor,
      largePressCapacityFactor,
      smallPressCapacityFactor,
      capacityFactor,
      equivalentMassCapacity,
      massSlack,
      limitingResource,
      pendingWorkloads: [
        "Limpeza e rotinas não mapeadas",
      ],
      capacityBoundary:
        "Capacidade equivalente por equipe e prensas; estoques são buffers de cobertura e exigem tempo de permanência/retirada para limitar throughput.",
      directWeeklyMass,
      totalWeeklyMass,
      configuredAnnualMass,
      incomingWeeklyMassByMaterial: Object.fromEntries(
        incomingWeeklyMassByMaterial
      ),
      unmappedMaterialMass,
      materialMassBalanceDifference:
        materialResults.reduce((sum, material) => sum + material.weeklyMass, 0) -
        totalWeeklyMass,
      totalWeeklyVolumeProxy,
      directWeeklyVolume: directMaterialProfile.weeklyVolumeDemand,
      intermediateStorage,
      totalStorage,
      baleStorage,
      storageMode,
      sharedStorage: storageMode === "shared",
      storagePolicy: storageMode === "shared"
        ? "Os 493 m³ formam um único estoque compartilhado entre material solto e fardos, alocado conforme a necessidade. As coberturas por tipo são cenários isolados e não parcelas simultâneas."
        : "O estoque total é dividido entre material intermediário e fardos.",
      storageCoverageDaysProxy:
        dailyVolumeProxy > 0 ? intermediateStorage / dailyVolumeProxy : null,
      baleStorageCoverageDaysProxy:
        dailyBaleVolume > 0 ? baleStorage / dailyBaleVolume : null,
    };
  }

  function calculateIntegrated(scenario) {
    const transport = calculateTransport(scenario);
    const collectionCenters = calculateCenters(scenario, transport);
    const hub = calculateHub(scenario, transport);
    const physicalIssues = [];
    const addInvalidResourceIssue = (group, center, field, value) => {
      if (isValidResourceCount(value)) return;
      physicalIssues.push({
        code: "RESOURCE_COUNT_INVALID",
        group,
        center,
        message:
          field + " deve ser um número inteiro entre 0 e " +
          MAX_RESOURCE_COUNT + "; recebido: " + String(value) + ".",
      });
    };
    addInvalidResourceIssue(
      "Transporte",
      "Frota",
      "Caminhões ativos",
      scenario.truckCount
    );
    if (
      transport.totalDemand > 0 &&
      finitePositive(transport.calculatedMixDensity, 0) <= 0
    ) {
      physicalIssues.push({
        code: "AUTOMATIC_MIX_DENSITY_INVALID",
        group: "Transporte",
        center: "Rede externa",
        message:
          "O peso automático de 1 m³ não pôde ser calculado. Informe densidades maiores que zero para todo material com participação positiva no mix de chegada.",
      });
    }
    transport.routeResults.forEach((route) => {
      route.materialResults.forEach((material) => {
        if (
          finiteNonNegative(material.weeklyMass, 0) <= EPSILON ||
          finitePositive(material.effectiveDensity, 0) > 0
        ) return;
        physicalIssues.push({
          code: "MATERIAL_DENSITY_INVALID",
          group: "Transporte",
          center: route.name,
          message:
            route.name + " / " + material.name +
            ": informe densidade maior que zero para este material, que possui participação positiva no mix de chegada.",
        });
      });
    });
    if (transport.consolidation.enabled && transport.consolidation.missingLegs.length) {
      transport.consolidation.missingLegs.forEach((leg) => {
        physicalIssues.push({
          code: "CONSOLIDATION_LEG_MISSING",
          group: "Transporte",
          center: "Consolidação multi-CC",
          message:
            "Tempo CC↔CC ausente ou inválido para a perna " +
            leg.split("|").join(" ↔ ") +
            "; informe o valor da matriz de roteirização.",
        });
      });
    }
    const addMaterialMixIssue = (group, center, profile, hasFlow) => {
      if (!hasFlow || profile.mixValid) return;
      const totalLabel = Number.isFinite(profile.mixPercentTotal)
        ? profile.mixPercentTotal.toFixed(2) + "%"
        : "inválido";
      physicalIssues.push({
        code: "MATERIAL_MIX_INVALID",
        group,
        center,
        message:
          center + ": o mix de chegada soma " + totalLabel +
          ". Use percentuais não negativos que somem 100,00% " +
          "(tolerância ±" + profile.mixTolerance.toFixed(2) + " p.p.).",
      });
    };
    transport.routeResults.forEach((route) =>
      addMaterialMixIssue(
        "Centros de Coleta",
        route.name,
        route,
        route.demand > 0
      )
    );
    addMaterialMixIssue(
      "Hub",
      "Santo Amaro direto",
      hub.directMaterialProfile,
      hub.directWeeklyMass > 0
    );
    if (hub.unmappedMaterialMass > EPSILON) {
      physicalIssues.push({
        code: "HUB_MATERIAL_UNMAPPED",
        group: "Hub",
        center: "Santo Amaro",
        message:
          "Há massa de chegada sem parâmetros técnicos correspondentes no Hub.",
      });
    }
    collectionCenters.centerResults.forEach((center) => {
      const hasFlow = center.weeklyDemand > 0 || center.visitsPerWeek > 0;
      const scaleCount = finiteResourceCount(center.scaleCount, 0);
      const storageCapacity = finiteNonNegative(center.storageCapacity, 0);
      const staff = finiteResourceCount(center.staff, 0);
      const loadingOperators = finiteResourceCount(center.loadingOperators, 0);
      addInvalidResourceIssue(
        "Centros de Coleta",
        center.name,
        "Operadores do centro",
        center.staff
      );
      addInvalidResourceIssue(
        "Centros de Coleta",
        center.name,
        "Balanças do centro",
        center.scaleCount
      );
      addInvalidResourceIssue(
        "Centros de Coleta",
        center.name,
        "Operadores no carregamento",
        center.loadingOperators
      );
      if (hasFlow && scaleCount < 1) {
        physicalIssues.push({
          code: "CC_SCALE_UNAVAILABLE",
          group: "Centros de Coleta",
          center: center.name,
          message: center.name + " possui fluxo positivo e nenhuma balança disponível.",
        });
      }
      if (hasFlow && storageCapacity <= EPSILON) {
        physicalIssues.push({
          code: "CC_STORAGE_UNAVAILABLE",
          group: "Centros de Coleta",
          center: center.name,
          message: center.name + " possui fluxo positivo e nenhum estoque disponível.",
        });
      }
      if (loadingOperators > staff) {
        physicalIssues.push({
          code: "CC_LOADING_STAFF_EXCEEDED",
          group: "Centros de Coleta",
          center: center.name,
          message: center.name + " reserva mais operadores no carregamento do que possui.",
        });
      }
      if (center.localPressEnabled) {
        (center.localPressResources || []).forEach((resource) => {
          const key = resource.pressType === "large" ? "largePressCount" : "smallPressCount";
          const label = resource.pressType === "large" ? "grande" : "pequena";
          addInvalidResourceIssue("Centros de Coleta", center.name, "Prensa " + label,
            center.localPress[key] !== undefined ? center.localPress[key] : center.localPress.pressCount !== undefined ? center.localPress.pressCount : resource.count);
          if (resource.workload > EPSILON && resource.count < 1) physicalIssues.push({
            code: "CC_LOCAL_PRESS_UNAVAILABLE", group: "Centros de Coleta", center: center.name,
            message: center.name + ": o mix destina material à prensa " + label + ", mas sua quantidade é zero." });
        });
        Object.entries(center.localPress.largePercent || {}).forEach(([name, value]) => {
          if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) physicalIssues.push({
            code: "CC_PRESS_MIX_INVALID", group: "Centros de Coleta", center: center.name,
            message: center.name + ": o percentual de " + name + " na prensa grande deve estar entre 0 e 100%." });
        });
      }
    });
    if (hub.totalWeeklyMass > 0 && hub.intermediateStorage <= 0) {
      physicalIssues.push({
        code: "HUB_STORAGE_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "O Hub possui fluxo positivo e nenhum estoque intermediário disponível.",
      });
    }
    if (!hub.sharedStorage && hub.totalStorage + EPSILON < hub.intermediateStorage) {
      physicalIssues.push({
        code: "HUB_STORAGE_ALLOCATION_INVALID",
        group: "Hub",
        center: "Santo Amaro",
        message:
          "O estoque intermediário não pode exceder o estoque físico total do Hub.",
      });
    }
    if (hub.weeklyBaleVolume > 0 && hub.baleStorage <= 0) {
      physicalIssues.push({
        code: "HUB_BALE_STORAGE_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message:
          "Há produção de fardos e nenhuma parcela do estoque total destinada a fardos prensados.",
      });
    }
    const hubResourceFields = [
      ["Equipe compartilhada do Hub", scenario.hub?.staff],
      ["Pessoas na descarga", scenario.hub?.unloadingPeople],
      ["Pessoas na triagem de cargas vindas dos CCs", scenario.hub?.triagePeople],
      ["Pessoas na expedição", scenario.hub?.expeditionPeople],
      ["Prensas grandes", scenario.hub?.largePressCount],
      ["Prensas pequenas", scenario.hub?.smallPressCount],
    ];
    hubResourceFields.forEach(([field, value]) =>
      addInvalidResourceIssue("Hub", "Santo Amaro", field, value)
    );
    if (hub.externalTripsRequired > 0 && finiteResourceCount(scenario.hub?.unloadingPeople, 3) <= 0) {
      physicalIssues.push({
        code: "HUB_UNLOADING_STAFF_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "Há cargas vindas dos CCs e nenhuma pessoa alocada à descarga.",
      });
    }
    if (
      hub.externalTriageEnabled &&
      hub.triageLoadsPerWeek > 0 &&
      hub.triageMinutesPerLoad > 0 &&
      hub.triagePeople <= 0
    ) {
      physicalIssues.push({
        code: "HUB_TRIAGE_STAFF_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "Há cargas vindas dos CCs para triagem e nenhuma pessoa alocada à atividade.",
      });
    }
    if (hub.equivalentWithdrawals > 0 && finiteResourceCount(scenario.hub?.expeditionPeople, 6) <= 0) {
      physicalIssues.push({
        code: "HUB_EXPEDITION_STAFF_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "Há retiradas de fardos e nenhuma pessoa alocada à expedição.",
      });
    }
    if (hub.largePressWorkload > 0 && hub.largePressCount <= 0) {
      physicalIssues.push({
        code: "HUB_LARGE_PRESS_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "Há papelão para prensar e nenhuma prensa grande disponível.",
      });
    }
    if (hub.smallPressWorkload > 0 && hub.smallPressCount <= 0) {
      physicalIssues.push({
        code: "HUB_SMALL_PRESS_UNAVAILABLE",
        group: "Hub",
        center: "Santo Amaro",
        message: "Há plástico ou longa vida para prensar e nenhuma prensa pequena disponível.",
      });
    }
    const hubStaff = finiteResourceCount(scenario.hub?.staff, 6);
    for (const [code, people, activity] of [
      ["HUB_UNLOADING_STAFF_EXCEEDED", finiteResourceCount(scenario.hub?.unloadingPeople, 3), "descarga"],
      ["HUB_TRIAGE_STAFF_EXCEEDED", hub.triagePeople, "triagem de cargas vindas dos CCs"],
      ["HUB_EXPEDITION_STAFF_EXCEEDED", finiteResourceCount(scenario.hub?.expeditionPeople, 6), "expedição"],
    ]) {
      if (people > hubStaff) {
        physicalIssues.push({
          code,
          group: "Hub",
          center: "Santo Amaro",
          message: `A atividade de ${activity} exige mais pessoas simultâneas do que a equipe do Hub possui.`,
        });
      }
    }
    const knownUtilizations = [
      { group: "Transporte", value: transport.effectiveUtilization },
      { group: "Centros de Coleta", value: collectionCenters.maxUtilization },
      { group: "Hub (carga conhecida)", value: hub.utilization },
    ];
    const indicativeBottleneck = knownUtilizations.reduce(
      (current, candidate) =>
        candidate.value > current.value ? candidate : current,
      knownUtilizations[0]
    );
    const annualization = calculateAnnualization(
      scenario,
      transport,
      collectionCenters,
      hub,
      indicativeBottleneck
    );
    const suppliedWorkingDays = Number(scenario.workingDaysPerYear);
    if (
      scenario.workingDaysPerYear !== undefined &&
      (!Number.isFinite(suppliedWorkingDays) || suppliedWorkingDays < 0 || suppliedWorkingDays > 366)
    ) {
      physicalIssues.push({
        code: "ANNUAL_WORKING_DAYS_INVALID",
        group: "Calendário",
        center: "Rede integrada",
        message: "Dias trabalhados no ano deve estar entre 0 e 366.",
      });
    }
    return {
      transport,
      collectionCenters,
      hub,
      annualization,
      physicalConstraints: {
        valid: physicalIssues.length === 0,
        issues: physicalIssues,
        note:
          physicalIssues.length === 0
            ? "Configuração física mínima coerente para o RCCP agregado; filas e dinâmica temporal devem ser validadas no SIMUL8."
            : "Cenário fisicamente impossível antes da validação dinâmica no SIMUL8.",
      },
      indicativeBottleneck,
      integratedStatus: "aggregate-rccp",
    };
  }

  function shouldRequestCollection(stockVolume, requestPending, triggerVolume) {
    if (requestPending) return false;
    const threshold = finiteNonNegative(triggerVolume, 0);
    return finiteNonNegative(stockVolume, 0) + EPSILON >= threshold;
  }

  function calculatePickupLoad(options) {
    const source = options || {};
    const availableMass = finiteNonNegative(source.availableMass, 0);
    const density = finitePositive(source.apparentDensity, 0);
    const usableVolume =
      finiteNonNegative(source.truckVolume, 0) *
      (boundedPercent(source.volumeOccupancy, 100) / 100);
    const volumeMassLimit = density > 0 ? usableVolume * density : 0;
    const weightLimit = finiteNonNegative(source.weightLimit, 0);
    const loadedMass = Math.min(availableMass, volumeMassLimit, weightLimit);
    return {
      availableMass,
      usableVolume,
      volumeMassLimit,
      weightLimit,
      loadedMass,
      loadedVolume: density > 0 ? loadedMass / density : 0,
      remainingMass: Math.max(0, availableMass - loadedMass),
      policy: "Retirar todo o estoque disponível que couber nos limites práticos de volume e peso.",
    };
  }

  function rankByStorageOccupancy(centers) {
    return (Array.isArray(centers) ? centers : [])
      .map((center, index) => {
        const stockVolume = finiteNonNegative(center.stockVolume, 0);
        const storageCapacity = finiteNonNegative(center.storageCapacity, 0);
        return {
          ...center,
          storageOccupancy:
            storageCapacity > 0 ? stockVolume / storageCapacity : stockVolume > 0 ? Infinity : 0,
          _sourceIndex: index,
        };
      })
      .sort(
        (left, right) =>
          right.storageOccupancy - left.storageOccupancy ||
          left._sourceIndex - right._sourceIndex
      )
      .map(({ _sourceIndex, ...center }) => center);
  }

  function stringifyAuditableJson(value, spacing) {
    return JSON.stringify(
      value,
      (_key, item) => {
        if (item === Infinity) return "Infinity";
        if (item === -Infinity) return "-Infinity";
        if (typeof item === "number" && Number.isNaN(item)) return "NaN";
        return item;
      },
      spacing
    );
  }

  return {
    MIX_PERCENT_TOLERANCE,
    DEFAULT_WORKING_DAYS_PER_YEAR,
    OPERATING_DAYS_PER_WEEK,
    BASELINE_WEEKS_PER_YEAR,
    weeklyCalendarMinutes,
    weeklyTransportCalendarMinutes,
    effectiveResourceMinutes,
    calculateAnnualization,
    selectedTravelTime,
    calculateTransport,
    calculateCenters,
    calculateHub,
    calculateIntegrated,
    shouldRequestCollection,
    calculatePickupLoad,
    rankByStorageOccupancy,
    stringifyAuditableJson,
  };
});
