# Letterboxd diary entries · the 20 newest published reviews

**Nothing here is published.** Every entry is to be logged by hand on the profile at
https://letterboxd.com/extramovies/ . Nothing is automated, no account details appear in
this file, and nothing is posted without the owner pressing the button.

Source of truth: the 20 published reviews in `seeds/extramovies/`. Every title, year and
rating below is read from those files. **No rating here is invented, and no rating is
adjusted.** If a number below does not match the review on extramovies.org, the review
wins and this file is wrong.

---

## How to log one entry

1. On Letterboxd, search the film by title. Pick the entry whose year matches the year
   column below. If Letterboxd lists the title differently or under a different year
   (this happens with sequel and series titles), use the version Letterboxd shows and
   note it. A wrong year attaches the entry to the wrong film and the entry is wasted.
2. Choose **Watched**, set the date to the log date in the table.
3. Set the stars to the Letterboxd stars column. The mapping is our published rating out
   of ten, divided by two, rounded to the nearest half star. It is the same mapping used
   in the `docs/parasite/*/letterboxd.md` packages.
4. Paste the body from the matching block below. No spoilers. No link in the body: the
   site link lives in the profile bio and the website field, where it counts for every
   entry instead of one.
5. Post. Do not add a second entry for the same film. Do not edit the date afterwards.

---

## The sheet

| # | Film | Year | Our rating | Stars | Log date | Canonical URL |
|---|---|---|---|---|---|---|
| 1 | Animals | 2026 | 4.5 / 10 | 2.5 | 2026-10-20 | https://extramovies.org/reviews/animals-2026-review |
| 2 | Avengers: Endgame | 2019 | 8.4 / 10 | 4.0 | 2026-10-20 | https://extramovies.org/reviews/avengers-endgame-2019-review |
| 3 | Digger | 2026 | 5.5 / 10 | 3.0 | 2026-10-20 | https://extramovies.org/reviews/digger-2026-review |
| 4 | Fall 2: Deadpoint | 2026 | 5.5 / 10 | 3.0 | 2026-10-20 | https://extramovies.org/reviews/fall-2-deadpoint-2026-review |
| 5 | Hope | 2026 | 6.9 / 10 | 3.5 | 2026-10-20 | https://extramovies.org/reviews/hope-2026-review |
| 6 | Insidious: Out of the Further | 2026 | 5.8 / 10 | 3.0 | 2026-10-20 | https://extramovies.org/reviews/insidious-out-of-the-further-2026-review |
| 7 | Masterplan | 2026 | 5.0 / 10 | 2.5 | 2026-10-20 | https://extramovies.org/reviews/masterplan-2026-review |
| 8 | Other Mommy | 2026 | 4.5 / 10 | 2.5 | 2026-10-20 | https://extramovies.org/reviews/other-mommy-2026-review |
| 9 | Practical Magic 2 | 2026 | 4.5 / 10 | 2.5 | 2026-10-20 | https://extramovies.org/reviews/practical-magic-2-2026-review |
| 10 | Resident Evil | 2026 | 7.5 / 10 | 4.0 | 2026-10-20 | https://extramovies.org/reviews/resident-evil-2026-review |
| 11 | Runner | 2026 | 6.5 / 10 | 3.5 | 2026-10-21 | https://extramovies.org/reviews/runner-2026-review |
| 12 | Sense and Sensibility | 2026 | 7.0 / 10 | 3.5 | 2026-10-21 (already logged, edit in place) | https://extramovies.org/reviews/sense-and-sensibility-2026-review |
| 13 | Spider-Man: Brand New Day | 2026 | 7.0 / 10 | 3.5 | 2026-10-21 | https://extramovies.org/reviews/spider-man-brand-new-day-2026-review |
| 14 | Street Fighter | 2026 | 5.5 / 10 | 3.0 | 2026-10-21 | https://extramovies.org/reviews/street-fighter-2026-review |
| 15 | The Fix | 2026 | 4.0 / 10 | 2.0 | 2026-10-21 | https://extramovies.org/reviews/the-fix-2026-review |
| 16 | The Odyssey | 2026 | 8.0 / 10 | 4.0 | 2026-10-21 | https://extramovies.org/reviews/the-odyssey-2026-review |
| 17 | The Social Reckoning | 2026 | 6.0 / 10 | 3.0 | 2026-10-21 (already logged, edit in place) | https://extramovies.org/reviews/the-social-reckoning-2026-review |
| 18 | Toy Story 5 | 2026 | 7.4 / 10 | 3.5 | 2026-10-21 | https://extramovies.org/reviews/toy-story-5-2026-review |
| 19 | Whalefall | 2026 | 6.5 / 10 | 3.5 | 2026-10-21 | https://extramovies.org/reviews/whalefall-2026-review |
| 20 | You Can See Everything | 2026 | 8.8 / 10 | 4.5 | 2026-10-21 (already logged, edit in place) | https://extramovies.org/reviews/you-can-see-everything-2026-review |

### Two things about the dates

**Why two dates.** Entries 1 to 10 carry 2026-10-20 and entries 11 to 20 carry
2026-10-21. Twenty entries posted in one minute is the profile pattern that gets a
Letterboxd account flagged and read as a spam profile, and the 45 entries already on
the profile are spread across weeks, so the profile as a whole has to keep looking like
it was built over time. Two days of ten each does that. After these 20, the cadence is
one entry per published review, on the day the review publishes.

**Two published reviews are deliberately not in this batch.** *Jailer 2* and *Matchbox
the Movie* were published on 2026-10-17, so they are not among the 20 newest published
reviews. They are not missing from the sheet by accident. Log them after these 20 if
you want them on the profile, and give them their own dates.

**Three entries are edits, not new posts.** The 2026-10-21 SERP audit recorded the
profile's recent diary entries (dated 2026-10-17) and among them were *Sense and
Sensibility*, *You Can See Everything* and *The Social Reckoning*. If those three are
still there, **do not post them a second time.** Open the existing entry, replace the
body with the one below, set the stars to the value in the table, and leave the original
2026-10-17 date alone. A duplicate entry on the same film is worse than a stale one.
Check the profile before posting: the list of entries on 2026-10-17 also contained
titles that are not ours, so confirm each film before editing.

---

## Bodies to paste

Each body is 2 or 3 sentences, in the site's voice: verdict first, no spoilers, no
em-dashes, no marketing adjectives, and no link. All 20 are adaptations of the
spoiler-free verdict on the corresponding review, not the review itself.

### 1. Animals (2026) · 4.5 out of 10 · 2.5 stars · 2026-10-20

```
A kidnapping premise worth the ticket, a performance from Gillian Anderson worth the
evening, and a script that will not let a single idea sit still. Ben Affleck's
106-minute Netflix thriller runs on the tension between those three things. Our rating
is 4.5 out of 10.
```

### 2. Avengers: Endgame (2019) · 8.4 out of 10 · 4.0 stars · 2026-10-20

```
Worth watching, and the 2026 encore edition is a good reason to put it back on a
cinema screen. An 181-minute finale that earns most of its length, carried by Robert
Downey Jr. and Chris Evans. Our rating is 8.4 out of 10.
```

### 3. Digger (2026) · 5.5 out of 10 · 3.0 stars · 2026-10-20

```
Watch it for Tom Cruise, who is spectacular, and for the images, which are
extraordinary. Skip it if you need a satire that argues its case instead of announcing
it, because Iñárritu's 129-minute comedy-drama does the announcing. Our rating is 5.5
out of 10.
```

### 4. Fall 2: Deadpoint (2026) · 5.5 out of 10 · 3.0 stars · 2026-10-20

```
Watch it for the height, skip it for the characters. The Spierig brothers' 98-minute
survival thriller was shot in a quarry and it shows in every frame, even if the people
on the ledges never arrive. Our rating is 5.5 out of 10.
```

### 5. Hope (2026) · 6.9 out of 10 · 3.5 stars · 2026-10-20

```
Watch it, and see it in a cinema if you can. Na Hong-jin's 157-minute Korean monster
movie earns its length in the first hour and then leans on Hwang Jung-min, Hoyeon and
Michael Fassbender for the rest. Our rating is 6.9 out of 10.
```

### 6. Insidious: Out of the Further (2026) · 5.8 out of 10 · 3.0 stars · 2026-10-20

```
Watch it for the pillow fort and for Amelia Eve, skip it if you want a story. Jacob
Chase's 106-minute horror sequel delivers the best set piece in the franchise and a
mythology that does not hold up. Our rating is 5.8 out of 10.
```

### 7. Masterplan (2026) · 5.0 out of 10 · 2.5 stars · 2026-10-20

```
Worth watching if you are here for Stanley Tucci and pulpy heist business, and you can
stop watching before the twist arrives. Thomas Vincent's 110-minute Prime Video caper
has momentum for an hour and then turns into nonsense. Our rating is 5.0 out of 10.
```

### 8. Other Mommy (2026) · 4.5 out of 10 · 2.5 stars · 2026-10-20

```
Skip it unless you are here for the two leads. Rob Savage's 93-minute horror movie has
Jessica Chastain playing both a mother and the thing pretending to be her, and the
jump scares add up to nothing. Our rating is 4.5 out of 10.
```

### 9. Practical Magic 2 (2026) · 4.5 out of 10 · 2.5 stars · 2026-10-20

```
Watch it if you loved the first one and you want the company of Bullock and Kidman.
Susanne Bier's 130-minute fantasy comedy has the two of them carrying a script that
cannot keep up. Our rating is 4.5 out of 10.
```

### 10. Resident Evil (2026) · 7.5 out of 10 · 4.0 stars · 2026-10-20

```
Watch it. Zach Cregger's 95-minute horror comedy has creature effects you can feel, an
Austin Abrams performance running on panic and pratfalls, and a body count that earns
its scares. Our rating is 7.5 out of 10.
```

### 11. Runner (2026) · 6.5 out of 10 · 3.5 stars · 2026-10-21

```
Worth it for the action, and only for the action. Scott Waugh's 97-minute buddy
thriller was shot in Brisbane and the Gold Coast, with Alan Ritchson and Owen Wilson
selling a partnership the script never earns. Our rating is 6.5 out of 10.
```

### 12. Sense and Sensibility (2026) · 7.0 out of 10 · 3.5 stars · edit the 2026-10-17 entry

```
Watch it. Georgia Oakley's 132-minute adaptation is faithful to the novel, shot in Flat
1.66:1, and carried by Daisy Edgar-Jones and Esmé Creed-Miles, even if the wit thins
out in the middle. Our rating is 7.0 out of 10.
```

### 13. Spider-Man: Brand New Day (2026) · 7.0 out of 10 · 3.5 stars · 2026-10-21

```
Watch it, and give it the time it takes, because the last stretch is where the picture
earns its sadness. Destin Daniel Cretton's 145-minute superhero drama has Tom Holland
playing a 30-year-old Spider-Man and Zendaya holding the film up. Our rating is 7.0
out of 10.
```

### 14. Street Fighter (2026) · 5.5 out of 10 · 3.0 stars · 2026-10-21

```
Watch it if you want the games filmed properly and can forgive a plot with no pulse.
Kitao Sakurai's 120-minute adaptation gets Ken, Chun-Li and Blanka right and runs four
plotlines at once. Our rating is 5.5 out of 10.
```

### 15. The Fix (2026) · 4.0 out of 10 · 2.0 stars · 2026-10-21

```
Watch it for Liam Neeson, for Quincy Isaiah, and for one flashback that explains why a
heist is not really a heist. Guy Moshe's 142-minute action thriller is mud outside that
sequence. Our rating is 4.0 out of 10.
```

### 16. The Odyssey (2026) · 8.0 out of 10 · 4.0 stars · 2026-10-21

```
Watch it, and pay for the best screen you can find. Christopher Nolan's 173-minute
epic was shot entirely on IMAX film and is carried by Matt Damon, even if it stays
strangely cold and never explains itself. Our rating is 8.0 out of 10.
```

### 17. The Social Reckoning (2026) · 6.0 out of 10 · 3.0 stars · edit the 2026-10-17 entry

```
Watch it for the leads. Aaron Sorkin's first film as director runs 113 minutes with
Mikey Madison and Jeremy Allen White arguing a case the audience finished years ago.
Our rating is 6.0 out of 10.
```

### 18. Toy Story 5 (2026) · 7.4 out of 10 · 3.5 stars · 2026-10-21

```
Worth it, especially for a family. Andrew Stanton's 102-minute Pixar comedy gives the
franchise a new lead in Joan Cusack's Jessie and a subject it has never had, screen
time against play, and then repeats itself. Our rating is 7.4 out of 10.
```

### 19. Whalefall (2026) · 6.5 out of 10 · 3.5 stars · 2026-10-21

```
Watch it. Brian Duffield's 106-minute survival thriller has Austin Abrams swallowed by
a practical 12-foot whale, a sound mix doing half the directing, and flashbacks that
drag. Our rating is 6.5 out of 10.
```

### 20. You Can See Everything (2026) · 8.8 out of 10 · 4.5 stars · edit the 2026-10-17 entry

```
Watch it in a cinema, with your phone in a pocket. Nathan Fielder and Lance Oppenheim's
174-minute A24 documentary is built on three years with Elizabeth Holmes and Billy
Evans, and it refuses to give her a verdict, which is the achievement. Our rating is
8.8 out of 10.
```

---

## Owner notes

**The rating is the point of these entries.** A Letterboxd entry with no stars is a
watch log. A Letterboxd entry with stars and a short verdict is a review, and a review
is what makes a profile legible to a search engine as a source of opinions. Twenty
ratings that match our published ratings are also twenty independent statements of the
same numbers, spread across a domain Google already trusts.

**No spoilers.** A spoiler in a Letterboxd body costs more than the click is worth, and
the ending is the part the criticism hangs on for most of these films. If you want to
add a spoiler, add it as a separate paragraph under a spoiler warning, or use
Letterboxd's own spoiler markup. Do not edit the body above to include one.

**No link in the body.** The site link belongs in the profile bio and the website field.
A link repeated in twenty entries reads as a link farm and can get the profile
restricted.

**Do not copy the review text.** These bodies are 2 or 3 sentences. The full argument,
the critic quotes, the numbers and the spoiler section stay on extramovies.org. That is
also what keeps the Letterboxd copy from outranking our own page for the film title,
which would be a bad trade.

**Check for the duplicate-film trap.** Letterboxd will not let you log the same film
twice on the same day, and it will let you log it twice on different days. If an entry
rejects, check the existing entries on that film before trying again.
