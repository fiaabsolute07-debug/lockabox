-- Keep historical asset IDs and immutable roll/pool proofs; duplicate IDs become aliases.
alter table assets add column merged_into bigint references assets(id);
alter table assets add constraint assets_not_self_alias check (merged_into is null or merged_into <> id);
create temporary table asset_merge on commit drop as
select a.id, first_value(a.id) over (
  partition by a.chain_id, case when ch.family = 'evm' then lower(a.address) else a.address end
  order by (a.address = lower(a.address)) desc, a.id
) as canonical_id
from assets a join chains ch on ch.id = a.chain_id;

-- Copy the freshest snapshot, not whichever address happened to be inserted first.
insert into asset_snapshots
select (jsonb_populate_record(null::asset_snapshots, to_jsonb(s) || jsonb_build_object('asset_id', m.canonical_id))).*
from (select distinct on (m.canonical_id) m.canonical_id, s.asset_id
      from asset_merge m join asset_snapshots s on s.asset_id = m.id
      order by m.canonical_id, s.taken_at desc, s.asset_id) best
join asset_snapshots s on s.asset_id = best.asset_id
join asset_merge m on m.id = best.asset_id
where best.asset_id <> m.canonical_id
on conflict (asset_id) do update set
 taken_at=excluded.taken_at, price_usd=excluded.price_usd, market_cap=excluded.market_cap, fdv=excluded.fdv,
 liquidity_usd=excluded.liquidity_usd, volume_24h=excluded.volume_24h, change_m5=excluded.change_m5,
 change_h1=excluded.change_h1, change_h6=excluded.change_h6, change_h24=excluded.change_h24,
 pair_address=excluded.pair_address, dex_id=excluded.dex_id, pair_created_at=excluded.pair_created_at,
 boosts_active=excluded.boosts_active, dexscreener_url=excluded.dexscreener_url,
 websites=excluded.websites, socials=excluded.socials, price_source=excluded.price_source;

-- Preserve any failed safety gate and any kill across all spellings.
insert into gate_results (asset_id, gate, passed, reason, checked_at)
select distinct on (m.canonical_id, g.gate) m.canonical_id, g.gate, g.passed, g.reason, g.checked_at
from asset_merge m join gate_results g on g.asset_id=m.id
order by m.canonical_id, g.gate, g.passed asc, g.checked_at desc
on conflict (asset_id,gate) do update set passed=excluded.passed, reason=excluded.reason, checked_at=excluded.checked_at;
insert into moderation (asset_id, reason, actor, created_at)
select distinct on (m.canonical_id) m.canonical_id, x.reason, x.actor, x.created_at
from asset_merge m join moderation x on x.asset_id=m.id order by m.canonical_id, x.created_at desc
on conflict (asset_id) do update set reason=excluded.reason, actor=excluded.actor, created_at=excluded.created_at;

update assets a set sources = coalesce((select array_agg(distinct source)
  from asset_merge m join assets x on x.id=m.id cross join unnest(x.sources) source
  where m.canonical_id=a.id), '{}'),
 first_seen_at = (select min(x.first_seen_at) from asset_merge m join assets x on x.id=m.id where m.canonical_id=a.id)
where a.id in (select canonical_id from asset_merge);
update assets a set symbol=coalesce(a.symbol, b.symbol), name=coalesce(a.name,b.name),
 image_url=coalesce(a.image_url,b.image_url), decimals=coalesce(a.decimals,b.decimals)
from (select m.canonical_id,
      (array_agg(x.symbol order by s.taken_at desc nulls last, x.id) filter(where nullif(x.symbol,'') is not null))[1] as symbol,
      (array_agg(x.name order by s.taken_at desc nulls last, x.id) filter(where nullif(x.name,'') is not null))[1] as name,
      (array_agg(x.image_url order by s.taken_at desc nulls last, x.id) filter(where x.image_url is not null))[1] as image_url,
      (array_agg(x.decimals order by s.taken_at desc nulls last, x.id) filter(where x.decimals is not null))[1] as decimals
      from asset_merge m join assets x on x.id=m.id left join asset_snapshots s on s.asset_id=x.id
      group by m.canonical_id) b where a.id=b.canonical_id;
update assets a set merged_into=m.canonical_id from asset_merge m where a.id=m.id and m.id<>m.canonical_id;
update assets a set address=lower(a.address) from chains ch
where a.chain_id=ch.id and ch.family='evm' and a.merged_into is null;

-- Enforce identity at the database boundary, including callers other than the worker.
create function lab_normalize_asset_address() returns trigger language plpgsql as $$
begin
 if new.merged_into is null and exists(select 1 from chains where id=new.chain_id and family='evm') then
   new.address := lower(new.address);
 end if;
 return new;
end $$;
create trigger assets_normalize_address before insert or update of address, chain_id on assets
for each row execute function lab_normalize_asset_address();
create index assets_canonical on assets(chain_id,id) where merged_into is null;

alter table assets add column refresh_attempted_at timestamptz;
alter table assets add column next_refresh_at timestamptz not null default now();
alter table assets add column refresh_failures int not null default 0;
alter table assets add column refresh_error text;
alter table assets add column discovered_pair_at timestamptz;
create index assets_refresh_due on assets(next_refresh_at,chain_id) where merged_into is null;

-- Cursors/watermarks and pacing survive worker restarts; no in-memory 15-minute reset.
create table discovery_state (
 chain_id text primary key references chains(id), cursor text, watermark timestamptz,
 scan_head timestamptz, scan_started_at timestamptz, last_polled_at timestamptz,
 last_head_at timestamptz, last_was_head boolean not null default false,
 next_poll_at timestamptz not null default now(), failures int not null default 0,
 last_page_size int not null default 0, pages int not null default 0, last_error text
);
create table discovery_requests (
 id bigserial primary key, chain_id text not null references chains(id), requested_at timestamptz not null default now(),
 accounted boolean not null default false
);
create index discovery_requests_time on discovery_requests(requested_at);

alter table cases drop constraint cases_kind_check;
alter table cases add constraint cases_kind_check check(kind in ('discover','trending','new','meta','cto','sponsored'));
insert into cases(id,kind,title,sort) values('discover','discover','Discover',0);
