/**
 * Title-card badges (platform badges, 2026-10-07).
 * Derived from the public review contract — never throws; missing data
 * degrades to "no badges".
 */
import { getLatestReviews } from "./seo/content";

export interface TitleBadges {
  reviewed: boolean;
  platformPick: boolean;
}

const NONE: TitleBadges = { reviewed: false, platformPick: false };

export function getTitleBadges(tmdbId: number): TitleBadges {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return NONE;
  try {
    const match = getLatestReviews(1000).find((r) => r.tmdbId === tmdbId);
    if (!match) return NONE;
    return { reviewed: true, platformPick: match.platformPick === true };
  } catch {
    return NONE;
  }
}
