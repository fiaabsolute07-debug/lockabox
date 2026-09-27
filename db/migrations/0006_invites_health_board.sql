-- R3/R6 additions: invites (LAB §8), Best pulls opt-out (AC-057), worker health for alerts (AC-080), pool retention.

-- Invites: one inviter per invitee, set once, never by the invitee themself. Points only through the 'invite' task.
alter table users add column invite_code text unique default encode(gen_random_bytes(5), 'hex');
update users set invite_code = encode(gen_random_bytes(5), 'hex') where invite_code is null;
alter table users alter column invite_code set not null;

create table invites (
  invitee_user_id uuid primary key references users(id),
  inviter_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  check (invitee_user_id <> inviter_user_id)
);
create index invites_inviter on invites (inviter_user_id);

insert into tasks (id, title, points, kind, goal, daily) values
  ('invite-friend', 'Invite a friend (counts after they sign in and open cases on 3 different days)', 100, 'invite', 1, false);

-- Best pulls: a user can hide their wallet from the board (their pulls then show as "anon").
alter table users add column hide_from_board boolean not null default false;

-- Worker health: one row per cycle, read by /api/health for alerts.
create table worker_runs (
  id bigserial primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  ds_calls int not null default 0,
  paprika_calls int not null default 0,
  jupiter_calls int not null default 0,
  note text
);
create index worker_runs_finished on worker_runs (finished_at desc);

-- Pool retention: pools stay immutable (no update), but old versions nobody rolled on may be deleted.
-- Pools referenced by a roll can't be deleted (rolls.pool_id foreign key); the latest version is kept by the pruner.
drop trigger case_pools_immutable on case_pools;
create trigger case_pools_immutable before update on case_pools for each row execute function lab_forbid_change();
