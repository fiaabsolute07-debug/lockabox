create table asset_image_cache (
  asset_id bigint primary key references assets(id) on delete cascade,
  source_url text not null,
  cached_url text,
  bytes integer not null default 0,
  state text not null default 'pending' check(state in ('pending','ready','broken','unsupported')),
  failures integer not null default 0,
  checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_error text
);

-- All feeds share the same assets row. Retain a known cached image while refreshing
-- a changed upstream source; never let ordinary price ingestion undo caching.
create function retain_cached_avatar() returns trigger language plpgsql as $$
declare c asset_image_cache%rowtype;
begin
  select * into c from asset_image_cache where asset_id=new.id;
  if found then
    if new.image_url is not null and new.image_url is distinct from c.cached_url and new.image_url is distinct from c.source_url then
      update asset_image_cache set source_url=new.image_url,next_check_at=now(),state='pending' where asset_id=new.id;
    end if;
    if c.cached_url is not null then new.image_url=c.cached_url; end if;
  end if;
  return new;
end $$;
create trigger assets_keep_cached_avatar before update of image_url on assets
  for each row execute function retain_cached_avatar();
