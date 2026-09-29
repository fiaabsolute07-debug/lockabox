-- Owner decision 2026-09-29 (DECISIONS #19): only Discover, Trending and New keep a case tab.
-- The worker no longer creates or re-activates meta cases; their tokens still reach Discover.
update cases set active = false where kind in ('meta', 'cto');
