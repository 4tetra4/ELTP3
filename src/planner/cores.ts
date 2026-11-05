import type { CoreCount, ElectricalPlan } from "./types";

export type CoreTone =
  | "live"
  | "emergency"
  | "neutral"
  | "earth"
  | "dali"
  | "grey"
  | "spare";

export interface BusbarCore {
  position: number;
  label: string;
  use: string;
  tone: CoreTone;
  available: boolean;
}

export interface TapPin {
  label: string;
  position: number | null;
  earth: boolean;
  active: boolean;
  tone: CoreTone;
}

export interface TapView {
  key: "luminaire" | "battery" | "cbs";
  title: string;
  info: string;
  aux: TapPin[] | null;
  main: TapPin[];
  notes: string[];
}

export interface CoreView {
  cores: CoreCount;
  busbar: BusbarCore[];
  taps: TapView[];
  emergencyPlaceholder: string | null;
  hasDali: boolean;
  legend: CoreTone[];
}

export const TONE_LABELS: Record<CoreTone, string> = {
  live: "Switched live",
  emergency: "Emergency",
  neutral: "Neutral",
  earth: "Earth",
  dali: "DALI",
  grey: "Grey connector",
  spare: "Spare",
};

export const DALI_NOTE =
  "Luminaires, sensors and DST monitoring share the same DALI pair. Sensors do not use live, neutral or earth.";
export const NO_DALI_NOTE =
  "DALI core positions retain their fixed designation and are not reassigned to live or neutral.";

const MAIN_LABELS = ["L1(1)", "L2(3)", "L3(5)", "", "DA(9)", "DA(11)", "N"];
const MAIN_POSITIONS = [1, 3, 5, 7, 9, 11, 13];
const AUX_LABELS = ["L1'(2)", "N1'(4)", "S1(6)", "S2(8)", "L2'(10)", "N2'(12)"];
const AUX_POSITIONS = [2, 4, 6, 8, 10, 12];

export function buildCoreView(electrical: ElectricalPlan): CoreView {
  const {
    settings,
    batteryEmergency,
    batteryMainEmergency,
    cbsAuxiliary,
    batteryAuxiliary,
    batteryAuxPair,
    hasEmergency,
    convertedBattery,
    batteryModules,
  } = electrical;
  const thirteen = settings.cores === 13;
  const hasDali =
    settings.control === "DALI" ||
    (settings.testing === "DST" && settings.emergency === "Battery");
  const auxPairOnTwo = batteryAuxiliary && batteryAuxPair[0] === 2;
  const busbar: BusbarCore[] = [
    { position: 1, label: "L1", use: "Live L1", tone: "live", available: true },
    {
      position: 2,
      label: "L1'",
      use: cbsAuxiliary
        ? "CBS live"
        : auxPairOnTwo
          ? "Non-switched live"
          : "Spare",
      tone: cbsAuxiliary || auxPairOnTwo ? "emergency" : "spare",
      available: thirteen,
    },
    {
      position: 3,
      label: "L2",
      use: batteryMainEmergency
        ? "Non-switched live"
        : settings.lives > 1
          ? "Live L2"
          : "Spare",
      tone: batteryMainEmergency
        ? "emergency"
        : settings.lives > 1
          ? "live"
          : "spare",
      available: true,
    },
    {
      position: 4,
      label: "N1'",
      use: cbsAuxiliary ? "CBS neutral" : "Spare",
      tone: cbsAuxiliary ? "emergency" : "spare",
      available: thirteen,
    },
    {
      position: 5,
      label: "L3",
      use:
        settings.lives === 3 || (batteryMainEmergency && settings.lives > 1)
          ? "Live L3"
          : "Spare",
      tone:
        settings.lives === 3 || (batteryMainEmergency && settings.lives > 1)
          ? "live"
          : "spare",
      available: true,
    },
    {
      position: 6,
      label: "S1",
      use: settings.neutrals > 1 ? "Neutral 2" : "Spare",
      tone: settings.neutrals > 1 ? "neutral" : "spare",
      available: thirteen,
    },
    { position: 7, label: "PE", use: "Earth", tone: "earth", available: true },
    {
      position: 8,
      label: "S2",
      use: settings.neutrals > 2 ? "Neutral 3" : "Spare",
      tone: settings.neutrals > 2 ? "neutral" : "spare",
      available: thirteen,
    },
    {
      position: 9,
      label: "DA",
      use: "DALI D+",
      tone: hasDali ? "dali" : "spare",
      available: true,
    },
    {
      position: 10,
      label: "L2'",
      use:
        batteryAuxiliary && batteryAuxPair[0] === 10
          ? "Non-switched live"
          : "Spare",
      tone:
        batteryAuxiliary && batteryAuxPair[0] === 10 ? "emergency" : "spare",
      available: thirteen,
    },
    {
      position: 11,
      label: "DA",
      use: "DALI D-",
      tone: hasDali ? "dali" : "spare",
      available: true,
    },
    {
      position: 12,
      label: "N2'",
      use: "Spare",
      tone: "spare",
      available: thirteen,
    },
    {
      position: 13,
      label: "N",
      use: "Neutral",
      tone: "neutral",
      available: true,
    },
  ];

  const mainPins = (nonSwitchedOnL2: boolean): TapPin[] =>
    MAIN_LABELS.map((label, index) => {
      const position = MAIN_POSITIONS[index];
      const earth = index === 3;
      const active =
        index === 0 ||
        index >= 3 ||
        (index === 1 && nonSwitchedOnL2);
      const tone: CoreTone =
        index === 0
          ? "live"
          : index === 1
            ? "emergency"
            : index === 2
              ? "live"
              : earth
                ? "earth"
                : index < 6
                  ? hasDali
                    ? "dali"
                    : "spare"
                  : "neutral";
      return { label, position, earth, active, tone };
    });

  const auxPins = (emergencyPositions: number[]): TapPin[] | null =>
    thirteen
      ? AUX_LABELS.map((label, index) => {
          const position = AUX_POSITIONS[index];
          const neutralPin = position === 6 || position === 8;
          const active = neutralPin
            ? settings.neutrals > 1
            : emergencyPositions.includes(position);
          return {
            label,
            position,
            earth: false,
            active,
            tone: neutralPin ? "grey" : "emergency",
          };
        })
      : null;

  const taps: TapView[] = [
    {
      key: "luminaire",
      title: "Luminaire tap",
      info: "The standard main-side tap has one movable live pin, earth, two DA pins and neutral. The DALI pair uses main-side cores 9 and 11, so DALI works on 7 and 13 core trunking. Additional neutrals use a grey connector at auxiliary positions 6 and 8.",
      aux: auxPins([]),
      main: mainPins(false),
      notes: [hasDali ? DALI_NOTE : NO_DALI_NOTE],
    },
  ];

  const mixed = cbsAuxiliary && batteryEmergency;
  if (batteryEmergency) {
    const notes: string[] = [];
    if (batteryAuxiliary) {
      notes.push(
        `All three main-side lives are switched, so the non-switched live uses a green connector at auxiliary positions ${batteryAuxPair[0]} and ${batteryAuxPair[1]}.`,
      );
      if (convertedBattery > 0)
        notes.push(
          "Converted luminaires receive this connector during conversion (special version, see the BOM comment).",
        );
      if (batteryModules > 0)
        notes.push(
          "Standalone battery modules need it fitted on site; it is included in the BOM.",
        );
    } else
      notes.push(
        "The non-switched live for charging and monitoring is taken from L2 by an extra single-pole main-side pin fitted at conversion or manufacture. The switched live is taken from L1 or L3. No auxiliary connector is needed.",
      );
    taps.push({
      key: "battery",
      title: mixed ? "Battery emergency tap" : "Emergency tap",
      info: "Battery conversions use a factory-fitted extra main-side live pin for L2 unless all three switched lives are required. With three switched lives the non-switched live moves to a green auxiliary connector.",
      aux: auxPins(batteryAuxiliary ? [...batteryAuxPair] : []),
      main: mainPins(batteryMainEmergency),
      notes,
    });
  }
  if (cbsAuxiliary)
    taps.push({
      key: "cbs",
      title: mixed ? "CBS emergency tap" : "Emergency tap",
      info: "CBS luminaires and LBLT039ML-PRO modules use the green auxiliary connector at positions 2 and 4. When battery emergency also needs auxiliary cores, its separate supply uses the 10 and 12 connector pair.",
      aux: auxPins([2, 4]),
      main: mainPins(false),
      notes: [
        "The CBS supply uses a green connector at auxiliary positions 2 and 4, fitted at conversion or manufacture. It is not counted separately in the BOM.",
        ...(mixed
          ? [
              "Keep the CBS supply and the battery-charging live on separate busbar cores.",
            ]
          : []),
      ],
    });

  const tones = new Set<CoreTone>();
  busbar.forEach((core) => core.available && tones.add(core.tone));
  taps.forEach((tap) =>
    [...tap.main, ...(tap.aux ?? [])].forEach(
      (pin) => pin.active && tones.add(pin.tone),
    ),
  );
  const order: CoreTone[] = [
    "live",
    "emergency",
    "neutral",
    "earth",
    "dali",
    "grey",
    "spare",
  ];
  return {
    cores: settings.cores,
    busbar,
    taps,
    hasDali,
    emergencyPlaceholder: hasEmergency
      ? null
      : "No emergency luminaires or standalone emergency modules in this BOM yet. The emergency tap is shown once they are added.",
    legend: order.filter((tone) => tones.has(tone)),
  };
}
