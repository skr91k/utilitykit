// Prayer Time Calculation Library - TypeScript Port
// Based on the Azan library for prayer time calculations

export interface Location {
  latitude: number;
  longitude: number;
  gmtOffset: number;
  dst: number;
  seaLevel?: number;
  pressure?: number;
  temperature?: number;
}

export interface PrayerTimes {
  fajr: Date;
  sunrise: Date;
  zuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export const Madhhab = {
  SHAFI: 1,
  HANAFI: 2,
} as const;

export type Madhhab = (typeof Madhhab)[keyof typeof Madhhab];

export interface CalculationMethod {
  name: string;
  fajrAngle: number;
  ishaAngle: number;
  ishaInterval?: number; // minutes after maghrib (used if ishaAngle is 0)
  madhhab: Madhhab;
}

// Predefined calculation methods
export const CALCULATION_METHODS: Record<string, CalculationMethod> = {
  KARACHI_SHAFI: {
    name: 'University of Islamic Sciences, Karachi (Shafi)',
    fajrAngle: 18,
    ishaAngle: 18,
    madhhab: Madhhab.SHAFI,
  },
  KARACHI_HANAFI: {
    name: 'University of Islamic Sciences, Karachi (Hanafi)',
    fajrAngle: 18,
    ishaAngle: 18,
    madhhab: Madhhab.HANAFI,
  },
  MUSLIM_LEAGUE: {
    name: 'Muslim World League',
    fajrAngle: 18,
    ishaAngle: 17,
    madhhab: Madhhab.SHAFI,
  },
  EGYPTIAN: {
    name: 'Egyptian General Authority',
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    madhhab: Madhhab.SHAFI,
  },
  ISNA: {
    name: 'Islamic Society of North America',
    fajrAngle: 15,
    ishaAngle: 15,
    madhhab: Madhhab.SHAFI,
  },
  UMM_AL_QURA: {
    name: 'Umm Al-Qura, Makkah',
    fajrAngle: 18.5,
    ishaAngle: 0,
    ishaInterval: 90,
    madhhab: Madhhab.SHAFI,
  },
  DUBAI: {
    name: 'Dubai (UAE)',
    fajrAngle: 18.2,
    ishaAngle: 18.2,
    madhhab: Madhhab.SHAFI,
  },
  QATAR: {
    name: 'Qatar',
    fajrAngle: 18,
    ishaAngle: 0,
    ishaInterval: 90,
    madhhab: Madhhab.SHAFI,
  },
  KUWAIT: {
    name: 'Kuwait',
    fajrAngle: 18,
    ishaAngle: 17.5,
    madhhab: Madhhab.SHAFI,
  },
  SINGAPORE: {
    name: 'Singapore',
    fajrAngle: 20,
    ishaAngle: 18,
    madhhab: Madhhab.SHAFI,
  },
  INDIA: {
    name: 'India (Hanafi)',
    fajrAngle: 18,
    ishaAngle: 18,
    madhhab: Madhhab.HANAFI,
  },
};

// Constants
const PI = Math.PI;
const DEG_TO_RAD = PI / 180;
const RAD_TO_DEG = 180 / PI;
const CENTER_OF_SUN_ANGLE = -0.8333; // Standard sun angle for sunrise/sunset

// VSOP87 Coefficients for Sun Position
const L0 = [[175347046.0, 0.0, 0.0], [3341656.0, 4.6692568, 6283.07585], [34894.0, 4.6261, 12566.1517], [3497.0, 2.7441, 5753.3849], [3418.0, 2.8289, 3.5231], [3136.0, 3.6277, 77713.7715], [2676.0, 4.4181, 7860.4194], [2343.0, 6.1352, 3930.2097], [1324.0, 0.7425, 11506.7698], [1273.0, 2.0371, 529.691], [1199.0, 1.1096, 1577.3435], [990.0, 5.233, 5884.927], [902.0, 2.045, 26.298], [857.0, 3.508, 398.149], [780.0, 1.179, 5223.694], [753.0, 2.533, 5507.553], [505.0, 4.583, 18849.228], [492.0, 4.205, 775.523], [357.0, 2.92, 0.067], [317.0, 5.849, 11790.629], [284.0, 1.899, 796.298], [271.0, 0.315, 10977.079], [243.0, 0.345, 5486.778], [206.0, 4.806, 2544.314], [205.0, 1.869, 5573.143], [202.0, 2.4458, 6069.777], [156.0, 0.833, 213.299], [132.0, 3.411, 2942.463], [126.0, 1.083, 20.775], [115.0, 0.645, 0.98], [103.0, 0.636, 4694.003], [102.0, 0.976, 15720.839], [102.0, 4.267, 7.114], [99.0, 6.21, 2146.17], [98.0, 0.68, 155.42], [86.0, 5.98, 161000.69], [85.0, 1.3, 6275.96], [85.0, 3.67, 71430.7], [80.0, 1.81, 17260.15], [79.0, 3.04, 12036.46], [71.0, 1.76, 5088.63], [74.0, 3.5, 3154.69], [74.0, 4.68, 801.82], [70.0, 0.83, 9437.76], [62.0, 3.98, 8827.39], [61.0, 1.82, 7084.9], [57.0, 2.78, 6286.6], [56.0, 4.39, 14143.5], [56.0, 3.47, 6279.55], [52.0, 0.19, 12139.55], [52.0, 1.33, 1748.02], [51.0, 0.28, 5856.48], [49.0, 0.49, 1194.45], [41.0, 5.37, 8429.24], [41.0, 2.4, 19651.05], [39.0, 6.17, 10447.39], [37.0, 6.04, 10213.29], [37.0, 2.57, 1059.38], [36.0, 1.71, 2352.87], [36.0, 1.78, 6812.77], [33.0, 0.59, 17789.85], [30.0, 0.44, 83996.85], [30.0, 2.74, 1349.87], [25.0, 3.16, 4690.48]];

const L1 = [[628331966747.0, 0.0, 0.0], [206059.0, 2.678235, 6283.07585], [4303.0, 2.6351, 12566.1517], [425.0, 1.59, 3.523], [119.0, 5.796, 26.298], [109.0, 2.966, 1577.344], [93.0, 2.59, 18849.23], [72.0, 1.14, 529.69], [68.0, 1.87, 398.15], [67.0, 4.41, 5507.55], [59.0, 2.89, 5223.69], [56.0, 2.17, 155.42], [45.0, 0.4, 796.3], [36.0, 0.47, 775.52], [29.0, 2.65, 7.11], [21.0, 5.34, 0.98], [19.0, 1.85, 5486.78], [19.0, 4.97, 213.3], [17.0, 2.99, 6275.96], [16.0, 0.03, 2544.31], [16.0, 1.43, 2146.17], [15.0, 1.21, 10977.08], [12.0, 2.83, 1748.02], [12.0, 3.26, 5088.63], [12.0, 5.27, 1194.45], [12.0, 2.08, 4694.0], [11.0, 0.77, 553.57], [10.0, 1.3, 3286.6], [10.0, 4.24, 1349.87], [9.0, 2.7, 242.73], [9.0, 5.64, 951.72], [8.0, 5.3, 2352.87], [6.0, 2.65, 9437.76], [6.0, 4.67, 4690.48]];

const L2 = [[52919.0, 0.0, 0.0], [8720.0, 1.0721, 6283.0758], [309.0, 0.867, 12566.152], [27.0, 0.05, 3.52], [16.0, 5.19, 26.3], [16.0, 3.68, 155.42], [10.0, 0.76, 18849.23], [9.0, 2.06, 77713.77], [7.0, 0.83, 775.52], [5.0, 4.66, 1577.34], [4.0, 1.03, 7.11], [4.0, 3.44, 5573.14], [3.0, 5.14, 796.3], [3.0, 6.05, 5507.55], [3.0, 1.19, 242.73], [3.0, 6.12, 529.69], [3.0, 0.31, 398.15], [3.0, 2.28, 553.57], [2.0, 4.38, 5223.69], [2.0, 3.75, 0.98]];

const L3 = [[289.0, 5.844, 6283.076], [35.0, 0.0, 0.0], [17.0, 5.49, 12566.15], [3.0, 5.2, 155.42], [1.0, 4.72, 3.52], [1.0, 5.3, 18849.23], [1.0, 5.97, 242.73]];

const L4 = [[114.0, 3.142, 0.0], [8.0, 4.13, 6283.08], [1.0, 3.84, 12566.15]];

const L5 = [[1.0, 3.14, 0.0]];

const B0 = [[280.0, 3.199, 84334.662], [102.0, 5.422, 5507.553], [80.0, 3.88, 5223.69], [44.0, 3.7, 2352.87], [32.0, 4.0, 1577.34]];

const B1 = [[9.0, 3.9, 5507.55], [6.0, 1.73, 5223.69]];

const R0 = [[100013989.0, 0.0, 0.0], [1670700.0, 3.0984635, 6283.07585], [13956.0, 3.05525, 12566.1517], [3084.0, 5.1985, 77713.7715], [1628.0, 1.1739, 5753.3849], [1576.0, 2.8469, 7860.4194], [925.0, 5.453, 11506.77], [542.0, 4.564, 3930.21], [472.0, 3.661, 5884.927], [346.0, 0.964, 5507.553], [329.0, 5.9, 5223.694], [307.0, 0.299, 5573.143], [243.0, 4.273, 11790.629], [212.0, 5.847, 1577.344], [186.0, 5.022, 10977.079], [175.0, 3.012, 18849.228], [110.0, 5.055, 5486.778], [98.0, 0.89, 6069.78], [86.0, 5.69, 15720.84], [86.0, 1.27, 161000.69], [85.0, 0.27, 17260.15], [63.0, 0.92, 529.69], [57.0, 2.01, 83996.85], [56.0, 5.24, 71430.7], [49.0, 3.25, 2544.31], [47.0, 2.58, 775.52], [45.0, 5.54, 9437.76], [43.0, 6.01, 6275.96], [39.0, 5.36, 4694.0], [38.0, 2.39, 8827.39], [37.0, 0.83, 19651.05], [37.0, 4.9, 12139.55], [36.0, 1.67, 12036.46], [35.0, 1.84, 2942.46], [33.0, 0.24, 7084.9], [32.0, 0.18, 5088.63], [32.0, 1.78, 398.15], [28.0, 1.21, 6286.6], [28.0, 1.9, 6279.55], [26.0, 4.59, 10447.39]];

const R1 = [[103019.0, 1.10749, 6283.07585], [1721.0, 1.0644, 12566.1517], [702.0, 3.142, 0.0], [32.0, 1.02, 18849.23], [31.0, 2.84, 5507.55], [25.0, 1.32, 5223.69], [18.0, 1.42, 1577.34], [10.0, 5.91, 10977.08], [9.0, 1.42, 6275.96], [9.0, 0.27, 5486.78]];

const R2 = [[4359.0, 5.7846, 6283.0758], [124.0, 5.579, 12566.152], [12.0, 3.14, 0.0], [9.0, 3.63, 77713.77], [6.0, 1.87, 5573.14], [3.0, 5.47, 18849.0]];

const R3 = [[145.0, 4.273, 6283.076], [7.0, 3.92, 12566.15]];

const R4 = [4.0, 2.56, 6283.08];

// Nutation coefficients
const PE = [[-171996.0, -174.2, 92025.0, 8.9], [-13187.0, -1.6, 5736.0, -3.1], [-2274.0, -0.2, 977.0, -0.5], [2062.0, 0.2, -895.0, 0.5], [1426.0, -3.4, 54.0, -0.1], [712.0, 0.1, -7.0, 0.0], [-517.0, 1.2, 224.0, -0.6], [-386.0, -0.4, 200.0, 0.0], [-301.0, 0.0, 129.0, -0.1], [217.0, -0.5, -95.0, 0.3], [-158.0, 0.0, 0.0, 0.0], [129.0, 0.1, -70.0, 0.0], [123.0, 0.0, -53.0, 0.0], [63.0, 0.0, 0.0, 0.0], [63.0, 0.1, -33.0, 0.0], [-59.0, 0.0, 26.0, 0.0], [-58.0, -0.1, 32.0, 0.0], [-51.0, 0.0, 27.0, 0.0], [48.0, 0.0, 0.0, 0.0], [46.0, 0.0, -24.0, 0.0], [-38.0, 0.0, 16.0, 0.0], [-31.0, 0.0, 13.0, 0.0], [29.0, 0.0, 0.0, 0.0], [29.0, 0.0, -12.0, 0.0], [26.0, 0.0, 0.0, 0.0], [-22.0, 0.0, 0.0, 0.0], [21.0, 0.0, -10.0, 0.0], [17.0, -0.1, 0.0, 0.0], [16.0, 0.0, -8.0, 0.0], [-16.0, 0.1, 7.0, 0.0], [-15.0, 0.0, 9.0, 0.0], [-13.0, 0.0, 7.0, 0.0], [-12.0, 0.0, 6.0, 0.0], [11.0, 0.0, 0.0, 0.0], [-10.0, 0.0, 5.0, 0.0], [-8.0, 0.0, 3.0, 0.0], [7.0, 0.0, -3.0, 0.0], [-7.0, 0.0, 0.0, 0.0], [-7.0, 0.0, 3.0, 0.0], [-7.0, 0.0, 3.0, 0.0], [6.0, 0.0, 0.0, 0.0], [6.0, 0.0, -3.0, 0.0], [6.0, 0.0, -3.0, 0.0], [-6.0, 0.0, 3.0, 0.0], [-6.0, 0.0, 3.0, 0.0], [5.0, 0.0, 0.0, 0.0], [-5.0, 0.0, 3.0, 0.0], [-5.0, 0.0, 3.0, 0.0], [-5.0, 0.0, 3.0, 0.0], [4.0, 0.0, 0.0, 0.0], [4.0, 0.0, 0.0, 0.0], [4.0, 0.0, 0.0, 0.0], [-4.0, 0.0, 0.0, 0.0], [-4.0, 0.0, 0.0, 0.0], [-4.0, 0.0, 0.0, 0.0], [3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0], [-3.0, 0.0, 0.0, 0.0]];

const SINCOEFF = [[0, 0, 0, 0, 1], [-2, 0, 0, 2, 2], [0, 0, 0, 2, 2], [0, 0, 0, 0, 2], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [-2, 1, 0, 2, 2], [0, 0, 0, 2, 1], [0, 0, 1, 2, 2], [-2, -1, 0, 2, 2], [-2, 0, 1, 0, 0], [-2, 0, 0, 2, 1], [0, 0, -1, 2, 2], [2, 0, 0, 0, 0], [0, 0, 1, 0, 1], [2, 0, -1, 2, 2], [0, 0, -1, 0, 1], [0, 0, 1, 2, 1], [-2, 0, 2, 0, 0], [0, 0, -2, 2, 1], [2, 0, 0, 2, 2], [0, 0, 2, 2, 2], [0, 0, 2, 0, 0], [-2, 0, 1, 2, 2], [0, 0, 0, 2, 0], [-2, 0, 0, 2, 0], [0, 0, -1, 2, 1], [0, 2, 0, 0, 0], [2, 0, -1, 0, 1], [-2, 2, 0, 2, 2], [0, 1, 0, 0, 1], [-2, 0, 1, 0, 1], [0, -1, 0, 0, 1], [0, 0, 2, -2, 0], [2, 0, -1, 2, 1], [2, 0, 1, 2, 2], [0, 1, 0, 2, 2], [-2, 1, 1, 0, 0], [0, -1, 0, 2, 2], [2, 0, 0, 2, 1], [2, 0, 1, 0, 0], [-2, 0, 2, 2, 2], [-2, 0, 1, 2, 1], [2, 0, -2, 0, 1], [2, 0, 0, 0, 1], [0, -1, 1, 0, 0], [-2, -1, 0, 2, 1], [-2, 0, 0, 0, 1], [0, 0, 2, 2, 1], [-2, 0, 2, 0, 1], [-2, 1, 0, 2, 1], [0, 0, 1, -2, 0], [-1, 0, 1, 0, 0], [-2, 1, 0, 0, 0], [1, 0, 0, 0, 0], [0, 0, 1, 2, 0], [0, 0, -2, 2, 2], [-1, -1, 1, 0, 0], [0, 1, 1, 0, 0], [0, -1, 1, 2, 2], [2, -1, -1, 2, 2], [0, 0, 3, 2, 2], [2, -1, 0, 2, 2]];

// Helper functions
function toRadians(deg: number): number {
  return deg * DEG_TO_RAD;
}

function toDegrees(rad: number): number {
  return rad * RAD_TO_DEG;
}

function limitAngle(angle: number): number {
  let limit = angle / 360;
  const limitFactor = limit - Math.floor(limit);
  if (limitFactor > 0) return 360 * limitFactor;
  if (limitFactor < 0) return 360 - 360 * limitFactor;
  return limit;
}

function limitAngle180(angle: number): number {
  let limit = angle / 180;
  const limitFactor = limit - Math.floor(limit);
  if (limitFactor > 0) return 180 * limitFactor;
  if (limitFactor < 0) return 180 - 180 * limitFactor;
  return limit;
}

function limitAngle111(L: number): number {
  let F = L - Math.floor(L);
  if (F < 0) F += 1;
  return F;
}

function limitAngle180between(L: number): number {
  const limit = L / 360;
  let limitFactor = (limit - Math.floor(limit)) * 360;
  if (limitFactor < -180) limitFactor += 360;
  else if (limitFactor > 180) limitFactor -= 360;
  return limitFactor;
}

// Get Julian Day
function getJulianDay(date: Date, gmtOffset: number): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let jdY = year;
  let jdM = month;

  if (month <= 2) {
    jdY--;
    jdM += 12;
  }

  let jdB = 0;
  if (year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 4)))) {
    jdB = 2 - Math.floor(jdY / 100) + Math.floor(jdY / 100 / 4);
  }

  return Math.floor(365.25 * (jdY + 4716)) + Math.floor(30.6001 * (jdM + 1)) + (day - gmtOffset / 24) + jdB - 1524.5;
}

// Compute astronomical values for a day
interface AstroDay {
  ra: number;
  dec: number;
  sidtime: number;
  rsum: number;
}

function computeAstroDay(JD: number): AstroDay {
  const JC = (JD - 2451545) / 36525;
  const JM = JC / 10;
  const JM2 = Math.pow(JM, 2);
  const JM3 = Math.pow(JM, 3);
  const JM4 = Math.pow(JM, 4);
  const JM5 = Math.pow(JM, 5);

  let L0sum = 0, L1sum = 0, L2sum = 0, L3sum = 0, L4sum = 0, L5sum = 0;
  let B0sum = 0, B1sum = 0;
  let R0sum = 0, R1sum = 0, R2sum = 0, R3sum = 0, R4sum = 0;

  for (let i = 0; i < 64; i++) L0sum += L0[i][0] * Math.cos(L0[i][1] + L0[i][2] * JM);
  for (let i = 0; i < 34; i++) L1sum += L1[i][0] * Math.cos(L1[i][1] + L1[i][2] * JM);
  for (let i = 0; i < 20; i++) L2sum += L2[i][0] * Math.cos(L2[i][1] + L2[i][2] * JM);
  for (let i = 0; i < 7; i++) L3sum += L3[i][0] * Math.cos(L3[i][1] + L3[i][2] * JM);
  for (let i = 0; i < 3; i++) L4sum += L4[i][0] * Math.cos(L4[i][1] + L4[i][2] * JM);
  L5sum = L5[0][0] * Math.cos(L5[0][1] + L5[0][2] * JM);

  const tL = (L0sum + L1sum * JM + L2sum * JM2 + L3sum * JM3 + L4sum * JM4 + L5sum * JM5) / Math.pow(10, 8);
  const L = limitAngle(toDegrees(tL));

  for (let i = 0; i < 5; i++) B0sum += B0[i][0] * Math.cos(B0[i][1] + B0[i][2] * JM);
  for (let i = 0; i < 2; i++) B1sum += B1[i][0] * Math.cos(B1[i][1] + B1[i][2] * JM);

  const tB = (B0sum + B1sum * JM) / Math.pow(10, 8);
  const B = toDegrees(tB);

  for (let i = 0; i < 40; i++) R0sum += R0[i][0] * Math.cos(R0[i][1] + R0[i][2] * JM);
  for (let i = 0; i < 10; i++) R1sum += R1[i][0] * Math.cos(R1[i][1] + R1[i][2] * JM);
  for (let i = 0; i < 6; i++) R2sum += R2[i][0] * Math.cos(R2[i][1] + R2[i][2] * JM);
  for (let i = 0; i < 2; i++) R3sum += R3[i][0] * Math.cos(R3[i][1] + R3[i][2] * JM);
  R4sum = R4[0] * Math.cos(R4[1] + R4[2] * JM);

  const R = (R0sum + R1sum * JM + R2sum * JM2 + R3sum * JM3 + R4sum * JM4) / Math.pow(10, 8);

  const G = limitAngle(L + 180);
  const Gg = -B;

  // Nutation calculation
  const X0 = 297.85036 + 445267.11148 * JC - 0.0019142 * Math.pow(JC, 2) + Math.pow(JC, 3) / 189474;
  const X1 = 357.52772 + 35999.05034 * JC - 0.0001603 * Math.pow(JC, 2) - Math.pow(JC, 3) / 300000;
  const X2 = 134.96298 + 477198.867398 * JC + 0.0086972 * Math.pow(JC, 2) + Math.pow(JC, 3) / 56250;
  const X3 = 93.27191 + 483202.017538 * JC - 0.0036825 * Math.pow(JC, 2) + Math.pow(JC, 3) / 327270;
  const X4 = 125.04452 - 1934.136261 * JC + 0.0020708 * Math.pow(JC, 2) + Math.pow(JC, 3) / 450000;

  let psi = 0, epsilon = 0;
  for (let i = 0; i < 63; i++) {
    const xsum = X0 * SINCOEFF[i][0] + X1 * SINCOEFF[i][1] + X2 * SINCOEFF[i][2] + X3 * SINCOEFF[i][3] + X4 * SINCOEFF[i][4];
    psi += (PE[i][0] + JC * PE[i][1]) * Math.sin(toRadians(xsum));
    epsilon += (PE[i][2] + JC * PE[i][3]) * Math.cos(toRadians(xsum));
  }

  const deltaPsi = psi / 36000000;
  const deltaEps = epsilon / 36000000;

  const U = JM / 10;
  const E0 = 84381.448 - 4680.93 * U - 1.55 * Math.pow(U, 2) + 1999.25 * Math.pow(U, 3) - 51.38 * Math.pow(U, 4) - 249.67 * Math.pow(U, 5) - 39.05 * Math.pow(U, 6) + 7.12 * Math.pow(U, 7) + 27.87 * Math.pow(U, 8) + 5.79 * Math.pow(U, 9) + 2.45 * Math.pow(U, 10);
  const E = E0 / 3600 + deltaEps;
  const lamda = G + deltaPsi + -20.4898 / (3600 * R);

  const V0 = 280.46061837 + 360.98564736629 * (JD - 2451545) + 0.000387933 * Math.pow(JC, 2) - Math.pow(JC, 3) / 38710000;
  const V = limitAngle(V0) + deltaPsi * Math.cos(toRadians(E));

  const RAn = Math.sin(toRadians(lamda)) * Math.cos(toRadians(E)) - Math.tan(toRadians(Gg)) * Math.sin(toRadians(E));
  const RAd = Math.cos(toRadians(lamda));
  const RA = limitAngle(toDegrees(Math.atan2(RAn, RAd)));

  const DEC = Math.asin(Math.sin(toRadians(Gg)) * Math.cos(toRadians(E)) + Math.cos(toRadians(Gg)) * Math.sin(toRadians(E)) * Math.sin(toRadians(lamda)));

  return { ra: RA, dec: DEC, sidtime: V, rsum: R };
}

// Get Fajr/Isha angle time
function getFajIsh(lat: number, dec: number, angle: number): number {
  const part1 = Math.cos(toRadians(lat)) * Math.cos(dec);
  const part2 = -Math.sin(toRadians(angle)) - Math.sin(toRadians(lat)) * Math.sin(dec);
  const part3 = part2 / part1;

  if (part3 <= -1 || part3 >= 1) return 99;
  return (1 / 15) * toDegrees(Math.acos(part3));
}

// Get Sunrise/Maghrib time
function getSunriseSunset(loc: Location, astro: { ra: number[]; dec: number[]; sid: number[]; rsum: number[] }, isSunrise: boolean): number {
  const lat = loc.latitude;
  const lon = loc.longitude;

  const part1 = Math.sin(toRadians(lat)) * Math.sin(toRadians(astro.dec[1]));
  const part2 = Math.sin(toRadians(CENTER_OF_SUN_ANGLE)) - part1;
  const part3 = Math.cos(toRadians(lat)) * Math.cos(toRadians(astro.dec[1]));
  const part4 = part2 / part3;

  if (part4 <= -1 || part4 >= 1) return 99;

  const lhour = limitAngle180(toDegrees(Math.acos(part4)));
  let M = (astro.ra[1] - lon - astro.sid[1]) / 360;

  if (isSunrise) M = M - lhour / 360;
  else M = M + lhour / 360;

  M = limitAngle111(M);

  const sidG = limitAngle(astro.sid[1] + 360.985647 * M);

  let ra0 = astro.ra[0];
  let ra2 = astro.ra[2];

  if (astro.ra[1] > 350 && astro.ra[2] < 10) ra2 += 360;
  if (astro.ra[0] > 350 && astro.ra[1] < 10) ra0 = 0;

  const A = astro.ra[1] + M * (astro.ra[1] - ra0 + (ra2 - astro.ra[1]) + (ra2 - astro.ra[1] - (astro.ra[1] - ra0)) * M) / 2;
  const B = astro.dec[1] + M * (astro.dec[1] - astro.dec[0] + (astro.dec[2] - astro.dec[1]) + (astro.dec[2] - astro.dec[1] - (astro.dec[1] - astro.dec[0])) * M) / 2;

  const H = limitAngle180between(sidG + lon - A);
  const tH = H;

  let sunAlt = toDegrees(Math.asin(Math.sin(toRadians(lat)) * Math.sin(toRadians(B)) + Math.cos(toRadians(lat)) * Math.cos(toRadians(B)) * Math.cos(toRadians(tH))));

  // Refraction correction
  const pressure = loc.pressure || 1010;
  const temperature = loc.temperature || 10;
  const refraction = (pressure / 1010) * (283 / (273 + temperature)) * (1.02 / (toDegrees(Math.tan(toRadians(sunAlt + 10.3 / (sunAlt + 5.11)))) + 0.0019279)) / 60;
  sunAlt += refraction;

  const seaLevel = loc.seaLevel || 0;
  const R = M + (sunAlt - CENTER_OF_SUN_ANGLE + 0.0347 * Math.pow(seaLevel, 0.5)) / (360 * Math.cos(toRadians(B)) * Math.cos(toRadians(lat)) * Math.sin(toRadians(tH)));

  return R * 24;
}

// Get Zuhr (Noon) time
function getZuhr(lon: number, astro: { ra: number[]; sid: number[] }): number {
  let M = (astro.ra[1] - lon - astro.sid[1]) / 360;
  M = limitAngle111(M);

  const sidG = astro.sid[1] + 360.985647 * M;

  let ra0 = astro.ra[0];
  let ra2 = astro.ra[2];

  if (astro.ra[1] > 350 && astro.ra[2] < 10) ra2 += 360;
  if (astro.ra[0] > 350 && astro.ra[1] < 10) ra0 = 0;

  const A = astro.ra[1] + M * (astro.ra[1] - ra0 + (ra2 - astro.ra[1]) + (ra2 - astro.ra[1] - (astro.ra[1] - ra0)) * M) / 2;
  const H = limitAngle180between(sidG + lon - A);

  return 24 * (M - H / 360);
}

// Get Asr time
function getAsr(lat: number, dec: number, madhhab: Madhhab): number {
  const mathhabValue = madhhab === Madhhab.SHAFI ? 1 : 2;

  let part1 = mathhabValue + Math.tan(toRadians(lat) - dec);
  if (part1 < 1 || lat < 0) {
    part1 = mathhabValue - Math.tan(toRadians(lat) - dec);
  }

  const part2 = PI / 2 - Math.atan(part1);
  const part3 = Math.sin(part2) - Math.sin(toRadians(lat)) * Math.sin(dec);
  const part4 = part3 / (Math.cos(toRadians(lat)) * Math.cos(dec));

  return (1 / 15) * toDegrees(Math.acos(part4));
}

// Convert decimal hours to time components
function decimalToTime(decimal: number, date: Date, dst: number): Date {
  if (decimal === 99) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  }

  decimal += dst;

  if (decimal >= 24) {
    decimal = decimal % 24;
  }
  if (decimal < 0) {
    decimal += 24;
  }

  const hours = Math.floor(decimal);
  const minutes = Math.floor((decimal - hours) * 60);
  const seconds = Math.floor(((decimal - hours) * 60 - minutes) * 60);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds);
}

// Main function to calculate prayer times
export function calculatePrayerTimes(
  date: Date,
  location: Location,
  method: CalculationMethod
): PrayerTimes {
  const julianDay = getJulianDay(date, location.gmtOffset);

  // Compute astronomical values for 3 days
  const astroYesterday = computeAstroDay(julianDay - 1);
  const astroToday = computeAstroDay(julianDay);
  const astroTomorrow = computeAstroDay(julianDay + 1);

  const astro = {
    ra: [astroYesterday.ra, astroToday.ra, astroTomorrow.ra],
    dec: [toDegrees(astroYesterday.dec), toDegrees(astroToday.dec), toDegrees(astroTomorrow.dec)],
    sid: [astroYesterday.sidtime, astroToday.sidtime, astroTomorrow.sidtime],
    rsum: [astroYesterday.rsum, astroToday.rsum, astroTomorrow.rsum],
  };

  const lat = location.latitude;
  const lon = location.longitude;
  const dec = toRadians(astro.dec[1]);

  // Calculate prayer times
  const fajrAngle = getFajIsh(lat, dec, method.fajrAngle);
  const sunrise = getSunriseSunset(location, astro, true);
  const zuhr = getZuhr(lon, astro);
  const asr = getAsr(lat, dec, method.madhhab);
  const maghrib = getSunriseSunset(location, astro, false);

  let isha: number;
  if (method.ishaInterval && method.ishaInterval > 0) {
    isha = maghrib + method.ishaInterval / 60;
  } else {
    const ishaAngle = getFajIsh(lat, dec, method.ishaAngle);
    isha = zuhr + ishaAngle;
  }

  const fajr = zuhr - fajrAngle;

  return {
    fajr: decimalToTime(fajr, date, location.dst),
    sunrise: decimalToTime(sunrise, date, location.dst),
    zuhr: decimalToTime(zuhr, date, location.dst),
    asr: decimalToTime(zuhr + asr, date, location.dst),
    maghrib: decimalToTime(maghrib, date, location.dst),
    isha: decimalToTime(isha, date, location.dst),
  };
}

// Get current location's timezone info
export function getTimezoneInfo(): { gmtOffset: number; dst: number } {
  const date = new Date();
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdTimezoneOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const isDST = date.getTimezoneOffset() < stdTimezoneOffset;

  const gmtOffset = -date.getTimezoneOffset() / 60;
  const dst = isDST ? 1 : 0;

  return { gmtOffset, dst };
}

// Format time to display string
export function formatTime(date: Date, use24Hour: boolean = false): string {
  if (use24Hour) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Get prayer name
export const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Zuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export const PRAYER_NAMES_ARABIC = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'] as const;

export type PrayerName = (typeof PRAYER_NAMES)[number];

// Get next prayer
export function getNextPrayer(prayerTimes: PrayerTimes): { name: PrayerName; time: Date; index: number } | null {
  const now = new Date();
  const times = [prayerTimes.fajr, prayerTimes.sunrise, prayerTimes.zuhr, prayerTimes.asr, prayerTimes.maghrib, prayerTimes.isha];

  for (let i = 0; i < times.length; i++) {
    if (times[i] > now) {
      return { name: PRAYER_NAMES[i], time: times[i], index: i };
    }
  }

  return null; // All prayers passed, next is tomorrow's Fajr
}

// Get current prayer
export function getCurrentPrayer(prayerTimes: PrayerTimes): { name: PrayerName; index: number } | null {
  const now = new Date();
  const times = [prayerTimes.fajr, prayerTimes.sunrise, prayerTimes.zuhr, prayerTimes.asr, prayerTimes.maghrib, prayerTimes.isha];

  for (let i = times.length - 1; i >= 0; i--) {
    if (now >= times[i]) {
      return { name: PRAYER_NAMES[i], index: i };
    }
  }

  return null;
}

// Calculate time difference
export function getTimeDifference(target: Date): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, totalSeconds };
}
