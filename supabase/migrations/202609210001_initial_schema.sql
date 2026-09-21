create extension if not exists pgcrypto;
create extension if not exists postgis;

create type public.app_role as enum ('participant', 'reviewer', 'admin');
create type public.incident_category as enum (
  'foam', 'discolouration', 'litter', 'wildlife', 'odour', 'flow', 'erosion', 'other'
);
create type public.evidence_status as enum (
  'early_signal', 'needs_verification', 'community_supported_concern',
  'expert_review_recommended', 'resolved_or_explained'
);
create type public.safety_state as enum ('normal', 'review_required', 'missions_paused');
create type public.mission_type as enum (
  'upstream_comparison', 'downstream_comparison', 'repeat_observation',
  'clearer_photo', 'unaffected_comparison', 'safe_viewpoint', 'unsafe_access_report'
);
create type public.mission_state as enum ('open', 'completed', 'paused', 'cancelled');
create type public.assessment_state as enum ('pending', 'complete', 'failed', 'superseded');
create type public.review_decision as enum (
  'request_more_evidence', 'recommend_expert_review', 'resolved', 'explained'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role public.app_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  flow_geometry geography(linestring, 4326),
  is_curated boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid references public.streams(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  category public.incident_category not null,
  location geography(point, 4326) not null,
  location_label text,
  evidence_status public.evidence_status not null default 'early_signal',
  status_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(status_reasons) = 'array'),
  safety_state public.safety_state not null default 'normal',
  evidence_revision integer not null default 1 check (evidence_revision > 0),
  is_demo boolean not null default false,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index incidents_location_idx on public.incidents using gist(location);
create index incidents_matching_idx on public.incidents(category, opened_at desc)
  where resolved_at is null;

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  type public.mission_type not null,
  state public.mission_state not null default 'open',
  evidence_gap text not null,
  instructions text not null,
  safety_message text not null,
  target_location geography(point, 4326),
  available_from timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index missions_incident_idx on public.missions(incident_id, state);
create index missions_target_location_idx on public.missions using gist(target_location);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  author_id uuid not null references public.profiles(id),
  category public.incident_category not null,
  observed_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  location geography(point, 4326) not null,
  description text not null check (char_length(description) between 1 and 2000),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  safety_flags text[] not null default '{}',
  idempotency_key text not null,
  is_potential_duplicate boolean not null default false,
  invalidated_at timestamptz,
  unique(author_id, idempotency_key)
);

create index observations_incident_idx on public.observations(incident_id, submitted_at);
create index observations_location_idx on public.observations using gist(location);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  object_path text not null unique,
  sha256 text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  processing_state text not null default 'pending'
    check (processing_state in ('pending', 'ready', 'rejected')),
  created_at timestamptz not null default now()
);

create index media_hash_idx on public.media(sha256);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  evidence_revision integer not null check (evidence_revision > 0),
  state public.assessment_state not null default 'pending',
  result jsonb,
  failure_code text,
  model_provider text,
  model_name text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(incident_id, evidence_revision)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision public.review_decision not null,
  explanation text not null check (char_length(explanation) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.impact_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id),
  observation_id uuid references public.observations(id) on delete set null,
  gap_key text not null,
  points integer not null check (points in (-10, -5, 0, 5, 10)),
  reason text not null,
  reverses_event_id uuid references public.impact_events(id),
  created_at timestamptz not null default now()
);

create unique index impact_award_once_idx
  on public.impact_events(incident_id, contributor_id, gap_key)
  where reverses_event_id is null and points > 0;

create table public.incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index incident_events_timeline_idx
  on public.incident_events(incident_id, created_at, id);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('reviewer', 'admin'), false);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'AquaRelay participant'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role is distinct from new.role and auth.role() <> 'service_role' then
    raise exception 'Only the service role may change application roles';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger protect_profile_role_before_update
  before update on public.profiles
  for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.streams enable row level security;
alter table public.incidents enable row level security;
alter table public.missions enable row level security;
alter table public.observations enable row level security;
alter table public.media enable row level security;
alter table public.assessments enable row level security;
alter table public.reviews enable row level security;
alter table public.impact_events enable row level security;
alter table public.incident_events enable row level security;

create policy "authenticated users read profiles" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "authenticated users read streams" on public.streams
  for select to authenticated using (true);
create policy "reviewers manage streams" on public.streams
  for all to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

create policy "authenticated users read incidents" on public.incidents
  for select to authenticated using (true);
create policy "users create incidents" on public.incidents
  for insert to authenticated with check (created_by = auth.uid());
create policy "reviewers update incidents" on public.incidents
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

create policy "authenticated users read missions" on public.missions
  for select to authenticated using (true);
create policy "reviewers manage missions" on public.missions
  for all to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

create policy "authenticated users read observations" on public.observations
  for select to authenticated using (true);
create policy "users submit own observations" on public.observations
  for insert to authenticated with check (author_id = auth.uid());
create policy "reviewers invalidate observations" on public.observations
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

create policy "authenticated users read media metadata" on public.media
  for select to authenticated using (true);
create policy "users create own media metadata" on public.media
  for insert to authenticated with check (owner_id = auth.uid());
create policy "reviewers update media metadata" on public.media
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

create policy "authenticated users read assessments" on public.assessments
  for select to authenticated using (true);

create policy "authenticated users read reviews" on public.reviews
  for select to authenticated using (true);
create policy "reviewers create reviews" on public.reviews
  for insert to authenticated with check (public.is_reviewer() and reviewer_id = auth.uid());

create policy "users read own impact events" on public.impact_events
  for select to authenticated using (contributor_id = auth.uid() or public.is_reviewer());

create policy "authenticated users read incident events" on public.incident_events
  for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'observation-media', 'observation-media', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "users upload to own media folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'observation-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners and reviewers read observation media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'observation-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_reviewer())
  );
