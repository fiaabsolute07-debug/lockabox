-- Owner request 2026-10-01: "Pick 1 of 3". Three different coins are drawn from the committed seed (cursors 0, 1, 2, … skipping
-- repeats) and the face-down card the user chose (0–2, sent before anything is drawn) decides which one is theirs. The three
-- asset ids are stored so the other two can be shown and the whole draw can be verified (DECISIONS #27).
alter table rolls drop constraint if exists rolls_odds_mode_check;
alter table rolls add constraint rolls_odds_mode_check check (odds_mode in ('tiers', 'uniform', 'pick3'));
alter table rolls add column if not exists pick smallint check (pick between 0 and 2);
alter table rolls add column if not exists candidates jsonb;
alter table rolls add constraint rolls_pick3_complete check ((odds_mode = 'pick3') = (pick is not null and candidates is not null));
