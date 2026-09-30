(function (root, factory) {
  "use strict";
  const profile = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = profile;
  } else {
    root.RCCPArrivalProfile = profile;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const family = (arrivals, annualMass, meanIntervalMinutes, distribution) => ({
    arrivals,
    annualMass,
    meanIntervalMinutes,
    distribution,
  });

  const center = (name, materialArrivals) => {
    const visitCount = Object.values(materialArrivals).reduce(
      (sum, item) => sum + item.arrivals,
      0
    );
    const massByFamily = Object.fromEntries(
      Object.entries(materialArrivals).map(([key, item]) => [key, item.annualMass])
    );
    const selectedMass = Object.values(massByFamily).reduce(
      (sum, value) => sum + value,
      0
    );
    return {
      name,
      visitCount,
      coverage: {
        firstDate: "2025-01-01",
        lastDate: "2025-12-31",
        weeks: 52,
      },
      visitsPerWeek: visitCount / 52,
      visitsPerObservedCoverageWeek: visitCount / 52,
      visitsPerCalendarWeek: visitCount / 52,
      p90DailyVisits: 0,
      maxDailyVisits: 0,
      sourceRecordCount: visitCount,
      exactDuplicateRowsRetained: 0,
      duplicateMassKgRetained: 0,
      observedMassKgAllFamilies: selectedMass,
      observedMassKgSelectedFamilies: selectedMass,
      observedMassKgBySelectedFamily: massByFamily,
      materialArrivals,
    };
  };

  const centers = {
    Brooklin: center("Brooklin", {
      "longa vida": family(695, 395.95, 81.3, "Exponential(mean = 81.6 min)"),
      papelao: family(1591, 16448.58, 49.8, "Weibull(shape = 0.80; scale = 43.8 min)"),
      plastico: family(1111, 2284.66, 64, "Exponential(mean = 64.2 min)"),
    }),
    "Embu das Artes": center("Embu das Artes", {
      "longa vida": family(239, 1255.61, 112, "Exponential(mean = 112.2 min)"),
      papelao: family(1446, 81117.92, 57.4, "Weibull(shape = 0.78; scale = 49.2 min)"),
      plastico: family(0, 0, 0, "Não modelada"),
    }),
    Jabaquara: center("Jabaquara", {
      "longa vida": family(1141, 3209.76, 66.7, "Exponential(mean = 66.6 min)"),
      papelao: family(4439, 85463.69, 34.5, "Weibull(shape = 0.79; scale = 29.4 min)"),
      plastico: family(3173, 21259.44, 40.5, "Weibull(shape = 0.81; scale = 35.4 min)"),
    }),
    "Paraisópolis": center("Paraisópolis", {
      "longa vida": family(79, 1338.8, 159.7, "Exponential(mean = 159.6 min)"),
      papelao: family(328, 14817.1, 84.4, "Weibull(shape = 0.79; scale = 73.2 min)"),
      plastico: family(316, 7651.55, 81.8, "Weibull(shape = 0.75; scale = 68.4 min)"),
    }),
    Pinheiros: center("Pinheiros", {
      "longa vida": family(492, 3885.39, 135.8, "Exponential(mean = 135.6 min)"),
      papelao: family(3795, 117610.53, 36.9, "Weibull(shape = 0.84; scale = 33.6 min)"),
      plastico: family(2543, 25677.22, 51.2, "Exponential(mean = 51.0 min)"),
    }),
  };

  const hubDirect = center("Santo Amaro direto", {
    "longa vida": family(139, 1177.65, 123.3, "Exponential(mean = 123.6 min)"),
    papelao: family(279, 11555.47, 97.1, "Exponential(mean = 97.2 min)"),
    plastico: family(237, 1930.58, 107.1, "Exponential(mean = 107.4 min)"),
  });

  const collectionCenterVisits = Object.values(centers).reduce(
    (sum, item) => sum + item.visitCount,
    0
  );

  return Object.freeze({
    schemaVersion: "arrival-profile-v3",
    source: {
      file: "Base Geral de Parâmetros.xlsx",
      sheet: "Volumes e Mixing",
      year: 2025,
      entryType: "chegada consolidada",
      visitRule:
        "quantidade oficial de chegadas por centro e material, somada por unidade e dividida por 52 semanas",
      dateBasis: "ano-calendário de 2025",
      allFamiliesForServiceWorkload: false,
      exactDuplicatesRetainedForVisitsAndMass: false,
    },
    quality: {
      rows2025: 22043,
      localRows2025: 22043,
      transferRows2025: 0,
      inScopeRows: 22043,
      invalidInScopeRows: 0,
      excludedOutOfScopeRows: 0,
      excludedDestinations: {},
      exactDuplicateRowsInScope: 0,
      duplicateMassKgInScope: 0,
    },
    totals: {
      collectionCenterVisits,
      hubDirectVisits: hubDirect.visitCount,
      allVisits: collectionCenterVisits + hubDirect.visitCount,
      selectedAnnualMassKg: 397079.9,
    },
    centers,
    hubDirect,
  });
});
