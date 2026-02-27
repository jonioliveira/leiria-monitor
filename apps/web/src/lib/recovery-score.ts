interface ScoreInput {
  electricityScore: number; // 0-100: 100 = no outages
  occurrencesScore: number; // 0-100: 100 = no active occurrences
  weatherScore: number; // 0-100: 100 = no warnings
  scheduledWorkBonus?: number; // 0-10: bonus for active scheduled repairs
}

export function calculateRecoveryScore(input: ScoreInput): number {
  const {
    electricityScore,
    occurrencesScore,
    weatherScore,
    scheduledWorkBonus = 0,
  } = input;

  // Weights: 40% electricity + 30% occurrences + 20% weather + 10% scheduled work
  const raw =
    electricityScore * 0.4 +
    occurrencesScore * 0.3 +
    weatherScore * 0.2 +
    Math.min(scheduledWorkBonus, 10) * 1.0; // Max 10 points from scheduled work

  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function deriveElectricityScore(totalOutages: number): number {
  if (totalOutages === 0) return 100;
  if (totalOutages <= 2) return 85;
  if (totalOutages <= 5) return 70;
  if (totalOutages <= 10) return 50;
  if (totalOutages <= 20) return 30;
  return 10;
}

export function deriveOccurrencesScore(activeCount: number): number {
  if (activeCount === 0) return 100;
  if (activeCount <= 2) return 80;
  if (activeCount <= 5) return 60;
  if (activeCount <= 10) return 40;
  return 20;
}

export function deriveWeatherScore(
  warnings: { level: string }[]
): number {
  const hasRed = warnings.some((w) => w.level === "red");
  const hasOrange = warnings.some((w) => w.level === "orange");
  const hasYellow = warnings.some((w) => w.level === "yellow");

  if (hasRed) return 20;
  if (hasOrange) return 50;
  if (hasYellow) return 75;
  return 100;
}

export function deriveScheduledWorkBonus(scheduledWorkCount: number): number {
  // More scheduled work = active recovery effort = bonus points
  if (scheduledWorkCount === 0) return 0;
  if (scheduledWorkCount <= 3) return 3;
  if (scheduledWorkCount <= 10) return 6;
  return 10;
}
