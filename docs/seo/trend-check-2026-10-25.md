# Trend check 2026-10-25: TMDB trending vs real search demand

Question: which films TMDB flags as trending actually have search demand behind them, verified with
Google Trends (Semrush API is unavailable: `SEMRUSH_TOKEN` has no API entitlement, `ERROR 120` on
api.semrush.com; the UI pull `data/legacy/semrush-keywords-2026-10-21.csv` covers only the 20
published titles).

## Method

- TMDB `/3/trending/movie/day` + `/week`, en-US, read 2026-10-25.
- Google Trends via its JSON API (`api/explore` + `api/widgetdata/multiline`), window `today 3-m`,
  executed from inside a real browser session. Plain HTTP access returns **429**; the in-browser
  same-origin path works. Per group the scale is normalized to 100 = that group's window max, so
  levels compare within a group only; `rise` = mean(last 7 days) / mean(prior 28 days) is
  scale-invariant and valid per term.
- Generic titles carry non-film noise, so ambiguous ones were re-queried as `"<title> movie"`.
- Corroboration: trade box office + review aggregate via live search.

## Verified against real demand

| Title | TMDB day/week | Trends US | Trends IN | Corroboration | Site |
|---|---|---|---|---|---|
| Clayface | #2 / #1 | 48, rise **9.0x**, at 100 peak | 8.6, rise 20x (peak 17) | #1 opener $24M, A- CinemaScore, full trade coverage | **no review (top gap)** |
| You Can See Everything | not top 12 | 69, rise 4.4x, peak 100 | 8.3, rise 4.1x | $20M second weekend, awards buzz (A24 doc) | covered |
| Street Fighter | #11 week | 42 (34.6 movie-specific), rise ~1.8x, peak 100 | 27.9, rise 1.8x, peak 100 | $31M opener, -73% second weekend | covered |
| Wildwood | #11 / #12 | 28.3, rise **3.4x**, at peak | 2, negligible | trailer 90M views, #3 opener $4.3M Fri, A CinemaScore, 100% RT | **no review (gap)** |
| Hope | #6 / #3 | 46.6 flat (movie-specific 6.3 flat) | movie-specific 15.7, rise 2.8x | strong TMDB engagement | covered |
| Avengers: Doomsday | #9 / #9 | 8.6, rise 1.1x (peak 31) | 35.1, rise 2.3x, peak 100 | Dec 16 release, trailer cycle | **no review (preview gap)** |
| Obsession | #10 / #8 | 26.4, rise 1.4x (movie-specific 10.7, 1.2x) | 9.3 flat | mild | no review |
| Tenzing | #6 week | 4.7, rise 3.3x (peak 11) | 3.7, rise 3.3x | Oct 9 release | no review (small) |
| Moana | #10 / #10 | 20.9, rise 2.0x (movie-specific 3.6) | 4.6, rise 3.2x | live-action 2026 | no review |
| Masterplan | #7 week | 1.4, peak 3 | 2.3, rise 3.2x | negligible US | covered; keywords CSV already marks it deferred |
| Whalefall | not top 12 | 8.3, rise 1.7x | 5.4, rise 2.1x | — | covered (50 vol / KD 16 measured) |
| Spider-Man: Brand New Day | high popularity | 1.0, decayed (peak 24) | 1.0 | released 2026-07-29 | covered (1000 vol measured) |
| The Weight | not top 12 | 32.6 flat raw; movie-specific 3.3 | 0 | — | no review |
| The Cycle | #1 day | 14, rise 0.95x | 4.7, rise 0.9x | — | no review |
| Bad Apples | #5 week | 1.4, peak 2 | 0.3 | — | no review |

## Conclusion

- TMDB trending is a weak demand proxy. It ranks titles with essentially zero Google demand
  (The Cycle at #1 on the day list, Bad Apples, plus LA BOLA NEGRA, Gajab Raat, Surviving
  Hurricane Otis) and under-ranks real demand (You Can See Everything is not in TMDB's top 12 while
  being the single most explosive trend in the set). TMDB measures TMDB page activity, not searches.
- Genuinely trending right now: Clayface (explosive), You Can See Everything (explosive),
  Wildwood (strong rise), Street Fighter (still elevated), with Avengers: Doomsday rising in India
  ahead of its December release.
- Coverage gaps, in priority order: **Clayface** (time-critical, opening weekend), **Wildwood**,
  **Avengers: Doomsday** (preview, IN demand), then Obsession and Tenzing (small).
- Already covered, which the timing validates: You Can See Everything, Street Fighter, Hope,
  Whalefall.