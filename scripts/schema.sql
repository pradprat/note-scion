-- Storage for note-scion. Safe to re-run.
create table if not exists notes_pages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references notes_pages(id) on delete cascade,
  title text not null default '',
  icon text,
  content jsonb,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_pages_parent_idx on notes_pages (parent_id, position);

-- Trash. A deleted page and the sub-pages it took with it share one deleted_at value,
-- which is how a restore knows what to bring back. Purged after 30 days.
alter table notes_pages add column if not exists deleted_at timestamptz;
create index if not exists notes_pages_deleted_idx on notes_pages (deleted_at) where deleted_at is not null;

-- OAuth 2.1 for the notes MCP endpoint. Secrets, codes and tokens are stored as
-- SHA-256 hashes only.
create table if not exists oauth_clients (
  client_id text primary key,
  client_secret_hash text,
  client_name text,
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now()
);

create table if not exists oauth_codes (
  code_hash text primary key,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null
);

create table if not exists oauth_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  family_id uuid not null,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  scope text not null,
  resource text,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_tokens_family_idx on oauth_tokens (family_id);

-- When the client's first authorization was approved. Registration is open, so clients
-- that never got this far are cleared after a day; approved ones are kept.
alter table oauth_clients add column if not exists authorized_at timestamptz;
update oauth_clients c set authorized_at = c.created_at
where c.authorized_at is null
  and exists (select 1 from oauth_tokens t where t.client_id = c.client_id);
