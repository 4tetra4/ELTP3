import type { Coverage, Product } from "./types";

export const GRID_MM = 368.75;
export const CATALOGUE_VERSION = 3;

const trunkData: [string, number, string, string, string, string][] = [
  ["L450", 4425, "8452500", "8450700", "8453900", "8453300"],
  ["L300", 2950, "8452200", "8450400", "8453800", "8453200"],
  ["L225", 2212.5, "8451900", "8450100", "8453700", "8453100"],
  ["L150", 1475, "8451600", "8449800", "8453600", "8453000"],
];

const trunking: Product[] = trunkData.flatMap(
  ([nominal, lengthMm, c13, c7, e13, e7]) =>
    ([13, 7] as const).flatMap((cores) =>
      [false, true].map((end) => ({
        id: `trunk-${nominal}-${cores}-${end ? "end" : "continuous"}`,
        category: "trunking" as const,
        name: `078 ${nominal}${end ? " E" : ""} ${cores}LV 01`,
        tk: "",
        toc: end ? (cores === 13 ? e13 : e7) : cores === 13 ? c13 : c7,
        lengthMm,
        widthMm: 68,
        cores,
        nominal,
        end,
        note: end
          ? "Last section, without mechanical coupling piece."
          : "Continuous section with mechanical coupling piece.",
      })),
    ),
);

const coverData: [string, number, string][] = [
  ["L225", 2212.5, "8481200"],
  ["L187", 1843.75, "8480900"],
  ["L150", 1475, "8480600"],
  ["L112", 1106.25, "8480300"],
  ["L75", 737.5, "8480000"],
  ["L37", 368.75, "8479700"],
];

const covers: Product[] = coverData.map(([nominal, lengthMm, toc]) => ({
  id: `cover-${lengthMm / GRID_MM}`,
  category: "cover",
  name: `078 BL ${nominal} 01`,
  tk: "",
  toc,
  lengthMm,
  widthMm: 39,
  nominal,
  protection: "IP20",
  note: "Uncut IP20 blank cover. All exposed gaps are covered.",
}));

const coverage = (
  shape: Coverage["shape"],
  minHeight: number,
  maxHeight: number,
  values: [number, number, number?, number?, number?][],
  estimated = false,
): Coverage => ({
  shape,
  minHeight,
  maxHeight,
  estimated,
  points: values.map(([height, tangential, radial, width, radialWidth]) => ({
    height,
    tangential,
    radial,
    width,
    radialWidth,
  })),
});

export const SENSORS: Product[] = [
  {
    id: "sensor-minis-lb",
    category: "sensor",
    name: "78 INS MiniS DA2 IPD LB L37 01",
    tk: "",
    toc: "8445600",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "Low-bay mini sensor for 2 to 5 m mounting height. Round coverage. Powered from the shared DALI line.",
    coverage: coverage("round", 2, 5, [
      [2, 6.4, 3],
      [2.5, 7.2, 3.4],
      [3, 8, 3.8],
      [3.5, 9, 3.8],
      [4, 10, 4.5],
      [4.5, 11, 5.5],
      [5, 12, 6.4],
    ]),
  },
  {
    id: "sensor-minir-hb",
    category: "sensor",
    name: "78IP50 INS MiniR DA2 IPD HB L37 01",
    tk: "",
    toc: "6001976500",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "High-bay sensor for 5 to 18 m mounting height. Round coverage. Powered from the shared DALI line.",
    coverage: coverage("round", 5, 18, [
      [5, 7, 5],
      [6, 10, 7],
      [8, 13, 9],
      [10, 16, 11],
      [12, 18, 13],
      [14, 20, 15],
      [16, 21, 17],
      [18, 22, 19],
    ]),
  },
  {
    id: "sensor-ins-lb",
    category: "sensor",
    name: "78 INS DA2 IPD LB L37 01",
    tk: "",
    toc: "6001975600",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "Low-bay sensor for 2 to 5 m mounting height. Round coverage. Powered from the shared DALI line.",
    coverage: coverage("round", 2, 5, [
      [2.5, 14, 7],
      [3, 17, 8],
      [3.5, 19, 8],
      [4, 20, 8],
      [4.5, 22, 10],
      [5, 25, 11],
    ]),
  },
  {
    id: "sensor-zb18-corridor",
    category: "sensor",
    name: "78IP50 INS ZB18 DA2 IPD HB Corr L37 01",
    tk: "",
    toc: "6001978000",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "High-bay corridor optic for 5 to 18 m mounting height. Elliptical coverage, the long axis follows the run. Powered from the shared DALI line.",
    coverage: coverage("ellipse", 5, 18, [
      [5, 14, 11, 6, 3.4],
      [6, 15, 13, 7, 4],
      [8, 18, 17, 10, 5],
      [10, 22, 20, 11, 6],
      [12, 25, 22, 14, 7],
      [14, 26, 24, 13, 8],
      [16, 27, 26, 12, 9],
      [18, 28, 28, 10, 10],
    ]),
  },
  {
    id: "sensor-quattro",
    category: "sensor",
    name: "78IP50 IR Quattro HD DA2 IPD L37 01",
    tk: "",
    toc: "8445700",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "Sensor for 2.5 to 10 m mounting height. Square coverage with rounded corners. Powered from the shared DALI line.",
    coverage: coverage("square", 2.5, 10, [
      [2.5, 18, 8],
      [2.8, 20, 7],
      [3, 22, 8],
      [3.5, 24, 8],
      [5, 24, 8],
      [10, 20, 7],
    ]),
  },
  {
    id: "sensor-is345",
    category: "sensor",
    name: "78IP50 IS 345 DA2 IPD R L37 01",
    tk: "",
    toc: "8922100",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "Rectangular aisle coverage for 2.5 to 5 m mounting height. Estimated height scaling from 23 x 6 m at 3.5 m.",
    coverage: coverage("rectangle", 2.5, 5, [[3.5, 23, 12, 6, 6]], true),
  },
  {
    id: "sensor-is345-hb",
    category: "sensor",
    name: "78IP50 IS 345 MX HB DA2 IPD L37 01",
    tk: "",
    toc: "8445900",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "High-bay rectangular aisle coverage for 4 to 16 m mounting height. The long axis follows the run.",
    coverage: coverage("rectangle", 4, 16, [
      [4, 10, undefined, 4],
      [6, 15, undefined, 4],
      [8, 20, undefined, 4],
      [10, 25, undefined, 4],
      [14, 30, undefined, 4],
      [16, 34, undefined, 4],
    ]),
  },
  {
    id: "sensor-is3360-hb",
    category: "sensor",
    name: "78IP50 IS 3360 MX HB DA2 IPD L37 01",
    tk: "",
    toc: "8445800",
    lengthMm: GRID_MM,
    widthMm: 62,
    note: "High-bay circular coverage for 6 to 14 m mounting height. Powered from the shared DALI line.",
    coverage: coverage("round", 6, 14, [
      [6, 32],
      [9, 28],
      [14, 20],
    ]),
  },
];

export const LEGACY_PRODUCT_IDS: Record<string, string> = {
  "sensor-minir-lb": "sensor-ins-lb",
};

export const EMERGENCY_MODULES: Product[] = [
  {
    id: "emergency-oa",
    category: "emergency",
    name: "78IP50 ERP 700 OA EM3 DST L75 01",
    tk: "10416770",
    toc: "",
    lengthMm: 737.5,
    widthMm: 62,
    emergencySystem: "Battery",
    note: "Standalone battery emergency, open-area optic. DST capable; also supports manual testing.",
  },
  {
    id: "emergency-co",
    category: "emergency",
    name: "78IP50 ERP 700 CO EM3 DST L75 01",
    tk: "10420413",
    toc: "",
    lengthMm: 737.5,
    widthMm: 62,
    emergencySystem: "Battery",
    note: "Standalone battery emergency, corridor optic. DST capable; also supports manual testing.",
  },
  {
    id: "emergency-cbs",
    category: "emergency",
    name: "LBLT039ML-PRO",
    tk: "10253081",
    toc: "",
    lengthMm: GRID_MM,
    widthMm: 62,
    emergencySystem: "CBS",
    factoryAuxPins: true,
    note: "CBS switchover relay. Green connector fitted at manufacture in auxiliary core positions 2 and 4.",
  },
];

const accessories: Product[] = [
  {
    id: "feed-13",
    category: "feed",
    name: "078 VF-13 vp",
    tk: "",
    toc: "8497600",
    cores: 13,
    note: "One per run; two for runs of 50 m or longer, one at each end.",
  },
  {
    id: "feed-7",
    category: "feed",
    name: "078 VF-7 vp",
    tk: "",
    toc: "8497500",
    cores: 7,
    note: "One per run; two for runs of 50 m or longer, one at each end.",
  },
  {
    id: "cap-IP20",
    category: "endCap",
    name: "078 Ks 01",
    tk: "",
    toc: "8497700",
    protection: "IP20",
    note: "Two per run. Smooth exterior, internal knock-out perforations.",
  },
  {
    id: "cap-IP50",
    category: "endCap",
    name: "078IP50 Ks 01",
    tk: "",
    toc: "8498000",
    protection: "IP50",
    note: "Two per run. Industrial end cap with external knock-out perforations.",
  },
  {
    id: "pin-grey",
    category: "pin",
    name: "078 Connector Twin Adapt S1/S2 grey vp",
    tk: "",
    toc: "8496700",
    note: "One two-pole accessory per luminaire for additional neutral cores, in auxiliary positions 6 and 8. Site fitting required.",
  },
  {
    id: "pin-green",
    category: "pin",
    name: "078 Connector Twin Adapt N'/L' green vp",
    tk: "",
    toc: "8496800",
    note: "Two-pole emergency connector in auxiliary positions 2 and 4. Contractor must fit and wire on site.",
  },
  {
    id: "suspension-1.5",
    category: "suspension",
    name: "A01DSX/1500 078",
    tk: "",
    toc: "8424600",
    suspensionM: 1.5,
    note: "1.5 m suspension kit. Includes one additional suspension at the start of each run.",
  },
  {
    id: "suspension-3",
    category: "suspension",
    name: "A01DSX/3000 078",
    tk: "",
    toc: "8424700",
    suspensionM: 3,
    note: "3 m suspension kit. Includes one additional suspension at the start of each run.",
  },
  {
    id: "suspension-5",
    category: "suspension",
    name: "A01DSX/5000 078",
    tk: "",
    toc: "8424800",
    suspensionM: 5,
    note: "5 m suspension kit. Includes one additional suspension at the start of each run.",
  },
];

export const EMERGENCY_CONVERSION: Product = {
  id: "emergency-conversion",
  category: "conversion",
  tk: "10392398",
  toc: "",
  name: "E-Line Luminaire integral emergency version",
  widthMm: 62,
  note: "Integral luminaire conversion with a battery pack or CBS switchover relay. Required main-side or auxiliary connectors are fitted during conversion.",
};
export const CATALOGUE: readonly Product[] = [
  ...trunking,
  ...covers,
  ...accessories,
  ...SENSORS,
  EMERGENCY_CONVERSION,
  ...EMERGENCY_MODULES,
];
export const PRODUCTS = Object.fromEntries(
  CATALOGUE.map((product) => [product.id, product]),
) as Record<string, Product>;
