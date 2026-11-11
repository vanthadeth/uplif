// Plan facts the dashboard shows until billing exists. There is no subscription table yet: every company is on
// the 14-day trial of Growth, counted from the day the company was created.
export const TRIAL_DAYS = 14;
export const GROWTH = { seats: 15, slots: 5 } as const;
export const STARTER = { seats: 5, slots: 3, priceUsd: 10 } as const;

const DAY = 86_400_000;

/** Whole days of the trial left (0 once it has ended). */
export const trialDaysLeft = (createdAt: string, now = Date.now()) =>
  Math.max(0, TRIAL_DAYS - Math.floor((now - Date.parse(createdAt)) / DAY));

/** Pending invitations hold a seat; suspended and removed users do not. */
export const seatsUsed = (activeUsers: number, pendingInvitations: number) => activeUsers + pendingInvitations;
