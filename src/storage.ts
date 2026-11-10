export type Session = {
  id: string;
  completedAt: string;
  minutes: number;
  task: string;
};

export type Preferences = {
  sound: boolean;
  notifications: boolean;
  reducedMotion: boolean;
  dailyGoal: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  notifications: false,
  reducedMotion: false,
  dailyGoal: 4,
};

const PREFIX = 'monoflow:v1:';

export function loadValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveValue<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private or storage-restricted browsers may not persist changes.
  }
}

export function localDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function lastSevenDays(sessions: Session[]): { day: string; count: number; minutes: number; date: string }[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    const date = localDate(day);
    const daySessions = sessions.filter((session) => localDate(session.completedAt) === date);
    return {
      day: day.toLocaleDateString(undefined, { weekday: 'short' }),
      count: daySessions.length,
      minutes: daySessions.reduce((sum, session) => sum + session.minutes, 0),
      date,
    };
  });
}

export function calculateStreak(sessions: Session[]): number {
  const completedDays = new Set(sessions.map((session) => localDate(session.completedAt)));
  if (completedDays.size === 0) return 0;
  const date = new Date();
  if (!completedDays.has(localDate(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (completedDays.has(localDate(date))) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.completedAt === 'string' &&
    !Number.isNaN(Date.parse(s.completedAt)) && typeof s.task === 'string' &&
    typeof s.minutes === 'number' && Number.isFinite(s.minutes) && s.minutes > 0 && s.minutes <= 1440;
}
