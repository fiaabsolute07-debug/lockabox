-- LAB §7.6 / AC-069: every admin action is written to an append-only audit log; abusive accounts can be locked.
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,                 -- who did it (the name the admin gives with the shared token), or 'system'
  action text not null,                -- kill | unkill | campaign.approve | campaign.reject | blocklist.add | blocklist.remove | user.lock | user.unlock
  target text not null,                -- asset id, campaign id, symbol or user id
  detail jsonb not null default '{}'
);
create index audit_log_at on audit_log (at desc);
create trigger audit_log_append_only before update or delete on audit_log for each row execute function lab_forbid_change();

-- A locked account can still open free cases as a guest would, but can't claim tasks, spend points or accept invites.
alter table users add column locked_at timestamptz;
alter table users add column locked_reason text;
