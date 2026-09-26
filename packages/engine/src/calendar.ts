/**
 * Horloge simulée (SPEC §7.1) : 1 tick = 1 jour. Les dates civiles (calendrier grégorien) sont
 * calculées par arithmétique entière, sans `Date` (interdit dans le moteur, CLAUDE.md règle 2).
 * Algorithme « days from civil » de Howard Hinnant (domaine public).
 */

export interface CivilDate {
  year: number;
  /** 1 à 12. */
  month: number;
  /** 1 à 31. */
  day: number;
}

/** Jours écoulés depuis le 1970-01-01 (négatif avant). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Date civile d'un nombre de jours depuis le 1970-01-01. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Date ISO (`AAAA-MM-JJ`, `AAAA-MM` ou `AAAA`) → date civile (jour 1 et mois 1 par défaut). */
export function parseIsoDate(iso: string): CivilDate {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(iso.trim());
  if (!m) throw new Error(`Date ISO invalide : ${iso}`);
  const date = { year: Number(m[1]), month: Number(m[2] ?? 1), day: Number(m[3] ?? 1) };
  const back = civilFromDays(daysFromCivil(date.year, date.month, date.day));
  if (back.year !== date.year || back.month !== date.month || back.day !== date.day) {
    throw new Error(`Date inexistante : ${iso}`);
  }
  return date;
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function formatIsoDate(d: CivilDate): string {
  return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
}

/** Calendrier d'une partie : tick 0 = date de départ. */
export class Calendar {
  readonly startDays: number;
  readonly start: CivilDate;

  constructor(startIso: string) {
    this.start = parseIsoDate(startIso);
    this.startDays = daysFromCivil(this.start.year, this.start.month, this.start.day);
  }

  dateAt(tick: number): CivilDate {
    return civilFromDays(this.startDays + tick);
  }

  isoAt(tick: number): string {
    return formatIsoDate(this.dateAt(tick));
  }

  /** Tick d'une date ISO (négatif si elle précède le départ). */
  tickOf(iso: string): number {
    const d = parseIsoDate(iso);
    return daysFromCivil(d.year, d.month, d.day) - this.startDays;
  }

  /** Le tick tombe-t-il le premier jour d'un mois (pas des systèmes mensuels) ? */
  isMonthStart(tick: number): boolean {
    return this.dateAt(tick).day === 1;
  }

  /** Années écoulées depuis le départ (365,25 jours par an). */
  yearsAt(tick: number): number {
    return tick / 365.25;
  }
}
