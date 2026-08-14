const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-02" -> "fev 26" */
export function formatYearMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS_PT[Number(m) - 1] ?? m} ${year.slice(2)}`;
}
