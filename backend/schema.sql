create table if not exists batches (
  id text primary key,
  produce_type text not null,
  weight_kg numeric not null check (weight_kg > 0),
  harvest_date date not null,
  freshness_score integer not null check (freshness_score between 0 and 100),
  grade text not null check (grade in ('A','B','C')),
  shelf_life_days numeric not null check (shelf_life_days >= 0),
  destination text not null check (destination in ('NGO_RESCUE','QUICK_COMMERCE','RETAIL_EXPORT')),
  destination_label text not null,
  facility text not null,
  urgency text not null check (urgency in ('CRITICAL','HIGH','NORMAL')),
  suggested_price numeric not null,
  value_recovered numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','routed','listed','claimed','delivered')),
  cold_storage_block text,
  temp_celsius numeric,
  humidity_pct numeric,
  confidence numeric,
  defects jsonb default '[]'::jsonb,
  signals jsonb default '[]'::jsonb,
  recommendation text,
  rerouted_from text,
  rerouted_reason text,
  origin text,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id text primary key,
  type text not null check (type in ('temperature','shelf_life','humidity','route_confirmed','claim')),
  severity text not null check (severity in ('critical','warning','info')),
  title text not null,
  message text not null,
  auto_action text,
  location text,
  affected_batch_ids text[] default '{}',
  impact jsonb,
  timeline jsonb not null default '[]'::jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists marketplace (
  id text primary key,
  batch_id text not null references batches(id) on delete cascade,
  produce_type text not null,
  weight_kg numeric not null,
  days_left numeric not null,
  price_per_kg numeric not null default 0,
  buyer_types text[] not null default '{}',
  location text,
  distance_km numeric,
  is_free boolean not null default false,
  claimed boolean not null default false,
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_batches_urgency on batches(urgency);
create index if not exists idx_batches_status on batches(status);
create index if not exists idx_batches_created on batches(created_at desc);
create index if not exists idx_batches_block on batches(cold_storage_block);
create index if not exists idx_alerts_resolved on alerts(resolved, created_at desc);
create index if not exists idx_market_claimed on marketplace(claimed, created_at desc);
