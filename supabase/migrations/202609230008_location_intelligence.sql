-- Relative spatial evidence, location provenance, retention and controlled reads.
begin;

alter table public.streams add column flow_direction_verified boolean not null default false;
alter table public.missions add column target_radius_meters integer not null default 250
  check(target_radius_meters between 50 and 2000);
alter table public.observations add column location_quality text
  check (location_quality in ('precise','approximate','low_accuracy','manually_selected','location_conflict'));
alter table public.observations add column location_conflicts text[] not null default '{}';
alter table public.observations add column spatial_facts jsonb not null default '{}'::jsonb
  check (jsonb_typeof(spatial_facts)='object');
alter table private.observation_locations add column captured_at timestamptz;
alter table private.observation_locations add column reported_stream_id uuid references public.streams(id);
alter table private.observation_locations add column reported_label text;
alter table private.observation_locations add column distance_from_origin_meters double precision;
alter table private.observation_locations alter column exact_location drop not null;
alter table private.observation_locations add column exact_removed_at timestamptz;
alter table private.incident_locations alter column exact_location drop not null;
alter table private.incident_locations add column exact_removed_at timestamptz;
alter table private.incident_locations add column retention_hold_until timestamptz;
alter table private.incident_locations add column retention_hold_reason text;
alter table private.incident_locations add column origin_observation_id uuid
  references public.observations(id) on delete set null;
alter table private.mission_locations alter column exact_location drop not null;
alter table private.mission_locations add column exact_removed_at timestamptz;

update private.incident_locations il set origin_observation_id=(
  select o.id from public.observations o where o.incident_id=il.incident_id
  order by o.submitted_at,o.id limit 1
);

update public.observations set location_quality='low_accuracy'
  where location_quality is null;
alter table public.observations alter column location_quality set default 'low_accuracy';
alter table public.observations alter column location_quality set not null;

create table private.location_audit (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  actor_id uuid,
  actor_role text not null,
  action text not null check(action in ('accessed','corrected','removed','hold_changed')),
  reason text,
  occurred_at timestamptz not null default now()
);
create index location_audit_incident_idx on private.location_audit(incident_id,occurred_at desc);
alter table private.location_audit enable row level security;
revoke all on private.location_audit from public,anon,authenticated;
grant all on private.location_audit to service_role;
grant usage,select on sequence private.location_audit_id_seq to service_role;
-- All participant/reviewer exact reads pass through audited functions below.
revoke select on private.incident_locations,private.observation_locations,private.mission_locations from authenticated;
drop policy incident_location_access on private.incident_locations;
drop policy observation_location_access on private.observation_locations;
drop policy mission_location_access on private.mission_locations;

create function private.location_is_retained(p_incident_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select i.resolved_at is null or i.resolved_at > now()-interval '90 days'
      or il.retention_hold_until > now()
  from public.incidents i join private.incident_locations il on il.incident_id=i.id
  where i.id=p_incident_id;
$$;

create function private.location_quality_for(p_source text,p_accuracy double precision,p_conflicts text[])
returns text language sql immutable set search_path='' as $$
  select case
    when cardinality(p_conflicts)>0 then 'location_conflict'
    when p_accuracy is null or p_accuracy>100 then 'low_accuracy'
    when p_source in ('map','search') then 'manually_selected'
    when p_accuracy<=25 then 'precise'
    else 'approximate' end;
$$;

create function private.nearest_curated_stream(p_point public.geography)
returns uuid language sql stable security definer set search_path='' as $$
  with candidates as (
    select s.id, public.st_distance(s.flow_geometry,p_point) as distance_meters,
           row_number() over(order by public.st_distance(s.flow_geometry,p_point),s.id) as rank
    from public.streams s
    where s.is_curated and s.flow_geometry is not null
      and public.st_dwithin(s.flow_geometry,p_point,175)
  )
  select first.id from candidates first left join candidates second on second.rank=2
  where first.rank=1 and first.distance_meters<=75
    and (second.id is null or second.distance_meters-first.distance_meters>=100);
$$;

create function private.spatial_facts_for(
  p_incident_id uuid,p_point public.geography,p_stream_id uuid,p_target public.geography default null,
  p_target_radius_meters integer default 250
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_origin public.geography;
  v_incident_stream uuid;
  v_flow public.geography;
  v_verified boolean;
  v_distance double precision;
  v_delta double precision;
  v_flow_relation text:='unknown';
  v_stream_relation text:='unknown';
begin
  select il.exact_location,i.stream_id,s.flow_geometry,s.flow_direction_verified
    into v_origin,v_incident_stream,v_flow,v_verified
    from public.incidents i
    join private.incident_locations il on il.incident_id=i.id
    left join public.streams s on s.id=i.stream_id
    where i.id=p_incident_id;
  v_distance := public.st_distance(v_origin,p_point);
  if p_stream_id is not null and v_incident_stream is not null then
    v_stream_relation:=case when p_stream_id=v_incident_stream then 'same' else 'different' end;
  end if;
  if v_verified and v_stream_relation='same' and v_flow is not null then
    v_delta:=(public.st_linelocatepoint(v_flow::public.geometry,p_point::public.geometry)
      -public.st_linelocatepoint(v_flow::public.geometry,v_origin::public.geometry))
      *public.st_length(v_flow);
    v_flow_relation:=case when v_delta>25 then 'downstream'
      when v_delta< -25 then 'upstream' else 'same_reach' end;
  end if;
  return jsonb_build_object(
    'distanceFromOrigin',case when v_distance is null then 'unknown'
      when v_distance<100 then 'within_100m' when v_distance<250 then 'within_250m'
      when v_distance<1000 then 'within_1km' else 'over_1km' end,
    'streamRelationship',v_stream_relation,
    'flowRelationship',v_flow_relation,
    'insideTargetRadius',case when p_target is null then null
      else public.st_dwithin(p_point,p_target,p_target_radius_meters) end
  );
end;
$$;

create function private.repeated_exact_point(p_point public.geography,p_reporter uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select count(distinct o.author_id)>=2 from private.observation_locations ol
    join public.observations o on o.id=ol.observation_id
   where ol.exact_location is not null and o.author_id<>p_reporter
     and o.submitted_at>now()-interval '7 days'
     and public.st_equals(ol.exact_location::public.geometry,p_point::public.geometry);
$$;

create function private.label_stream_conflict(p_label text,p_stream_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_label is not null and p_stream_id is not null and exists (
    select 1 from public.streams s where s.id<>p_stream_id
      and char_length(s.name)>=4
      and position(lower(s.name) in lower(p_label))>0);
$$;

create function private.validate_capture_time(p_captured_at timestamptz)
returns void language plpgsql set search_path='' as $$
begin
  if p_captured_at is null or p_captured_at>now()+interval '5 minutes'
    or p_captured_at<now()-interval '30 days' then
    raise exception 'Invalid location capture time' using errcode='22023';
  end if;
end;
$$;

create function private.audit_exact_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_incident_id uuid; v_observation_id uuid; v_mission_id uuid;
begin
  if tg_table_name='incident_locations' then v_incident_id:=new.incident_id;
  elsif tg_table_name='observation_locations' then
    v_observation_id:=new.observation_id;
    select incident_id into v_incident_id from public.observations where id=new.observation_id;
  else
    v_mission_id:=new.mission_id;
    select incident_id into v_incident_id from public.missions where id=new.mission_id;
  end if;
  if old.exact_location is distinct from new.exact_location and v_incident_id is not null then
    insert into private.location_audit(incident_id,observation_id,mission_id,actor_id,actor_role,action,reason)
    values(v_incident_id,v_observation_id,v_mission_id,
      auth.uid(),coalesce(auth.role(),'database'),
      case when new.exact_location is null then 'removed' else 'corrected' end,
      nullif(current_setting('aquarelay.location_change_reason',true),''));
  end if;
  return new;
end;
$$;
create trigger audit_exact_change after update of exact_location on private.incident_locations
  for each row execute function private.audit_exact_change();
create trigger audit_exact_change after update of exact_location on private.observation_locations
  for each row execute function private.audit_exact_change();
create trigger audit_exact_change after update of exact_location on private.mission_locations
  for each row execute function private.audit_exact_change();

-- Reads are volatile because they write an audit row. RLS cannot audit SELECT.
drop function public.get_observation_location(uuid);
create function public.get_observation_location(p_observation_id uuid)
returns table(latitude double precision,longitude double precision,accuracy_meters double precision,
  source text,captured_at timestamptz)
language plpgsql volatile security definer set search_path='' as $$
declare v_observation public.observations%rowtype; v_location private.observation_locations%rowtype;
begin
  select * into v_observation from public.observations where id=p_observation_id;
  if not found then return; end if;
  if auth.role() is distinct from 'service_role'
    and (auth.uid() is null or (v_observation.author_id<>auth.uid() and not public.is_reviewer())) then return; end if;
  if not private.location_is_retained(v_observation.incident_id) then return; end if;
  select * into v_location from private.observation_locations where observation_id=p_observation_id;
  if v_location.exact_location is null then return; end if;
  insert into private.location_audit(incident_id,observation_id,actor_id,actor_role,action)
  values(v_observation.incident_id,p_observation_id,auth.uid(),coalesce(auth.role(),'database'),'accessed');
  return query select public.st_y(v_location.exact_location::public.geometry),
    public.st_x(v_location.exact_location::public.geometry),v_location.accuracy_meters,
    v_location.source,v_location.captured_at;
end;
$$;

create function public.list_location_audit(p_incident_id uuid,p_limit integer default 100)
returns table(id bigint,observation_id uuid,mission_id uuid,actor_id uuid,actor_role text,
  action text,reason text,occurred_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_reviewer() then raise exception 'Reviewer access required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid audit limit'; end if;
  return query select a.id,a.observation_id,a.mission_id,a.actor_id,a.actor_role,a.action,a.reason,a.occurred_at
    from private.location_audit a where a.incident_id=p_incident_id order by a.occurred_at desc,a.id desc limit p_limit;
end;
$$;
revoke all on function public.get_observation_location(uuid) from public,anon;
grant execute on function public.get_observation_location(uuid) to authenticated,service_role;
revoke all on function public.list_location_audit(uuid,integer) from public,anon;
grant execute on function public.list_location_audit(uuid,integer) to authenticated;

create function private.refresh_observation_spatial(p_observation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_observation public.observations%rowtype;
  v_location private.observation_locations%rowtype;
  v_incident public.incidents%rowtype;
  v_target public.geography;
  v_conflicts text[]:='{}';
  v_flag text;
  v_distance double precision;
  v_radius integer:=250;
begin
  select * into v_observation from public.observations where id=p_observation_id;
  select * into v_location from private.observation_locations where observation_id=p_observation_id;
  if v_location.exact_location is null then return; end if;
  select * into v_incident from public.incidents where id=v_observation.incident_id;
  if v_location.reported_stream_id is not null and exists (
    select 1 from public.streams s where s.id=v_location.reported_stream_id
      and s.flow_geometry is not null
      and not public.st_dwithin(s.flow_geometry,v_location.exact_location,150)
  ) then v_conflicts:=array_append(v_conflicts,'reported_stream_far_from_point'); end if;
  if private.label_stream_conflict(v_location.reported_label,v_location.reported_stream_id) then
    v_conflicts:=array_append(v_conflicts,'label_stream_disagreement');
  end if;
  if private.label_coordinate_conflict(v_location.reported_label,v_location.exact_location) then
    v_conflicts:=array_append(v_conflicts,'label_coordinate_disagreement');
  end if;
  if v_observation.mission_id is not null then
    select target_radius_meters into v_radius from public.missions where id=v_observation.mission_id;
    select exact_location into v_target from private.mission_locations where mission_id=v_observation.mission_id;
    if v_target is null and exists (select 1 from public.missions
      where id=v_observation.mission_id and type in ('repeat_observation','clearer_photo','safe_viewpoint')) then
      select exact_location into v_target from private.incident_locations where incident_id=v_incident.id;
    end if;
    v_distance:=public.st_distance(v_target,v_location.exact_location);
    v_flag:=case when v_target is null then 'target_unknown'
      when v_distance>v_radius then 'far_from_target' else null end;
    if v_flag='far_from_target' then v_conflicts:=array_append(v_conflicts,'outside_target_radius'); end if;
    if v_location.reported_stream_id is not null and v_incident.stream_id is not null
      and v_location.reported_stream_id<>v_incident.stream_id then
      v_conflicts:=array_append(v_conflicts,'different_stream');
    end if;
  end if;
  if v_location.source='device' and v_location.captured_at is not null
    and abs(extract(epoch from v_location.captured_at-v_observation.observed_at))>3600 then
    v_conflicts:=array_append(v_conflicts,'capture_time_conflict');
  end if;
  if private.repeated_exact_point(v_location.exact_location,v_observation.author_id) then
    v_conflicts:=array_append(v_conflicts,'repeated_identical_point');
  end if;
  update private.observation_locations set
    target_distance_meters=v_distance,
    distance_from_origin_meters=public.st_distance(
      (select exact_location from private.incident_locations where incident_id=v_incident.id),
      v_location.exact_location)
    where observation_id=p_observation_id;
  update public.observations set location_quality_flag=v_flag,
    location_conflicts=v_conflicts,
    location_quality=private.location_quality_for(v_location.source,v_location.accuracy_meters,v_conflicts),
    spatial_facts=private.spatial_facts_for(v_incident.id,v_location.exact_location,
      v_location.reported_stream_id,v_target,v_radius)
    where id=p_observation_id;
end;
$$;

create function private.label_coordinate_conflict(p_label text,p_point public.geography)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_pair text[]; v_lat double precision; v_lon double precision;
begin
  if p_label is null then return false; end if;
  v_pair:=regexp_match(p_label,'([-+]?[0-9]{1,2}\.[0-9]+)[[:space:],;]+([-+]?[0-9]{1,3}\.[0-9]+)');
  if v_pair is null then return false; end if;
  v_lat:=v_pair[1]::double precision;
  v_lon:=v_pair[2]::double precision;
  if v_lat not between -90 and 90 or v_lon not between -180 and 180 then return false; end if;
  return not public.st_dwithin(
    public.st_setsrid(public.st_makepoint(v_lon,v_lat),4326)::public.geography,p_point,250);
end;
$$;

create function public.correct_observation_location(p_observation_id uuid,p_latitude double precision,
  p_longitude double precision,p_accuracy_meters double precision,p_location_source text,
  p_captured_at timestamptz,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_observation public.observations%rowtype; v_point public.geography;
  v_previous_point public.geography; v_other uuid;
begin
  if not public.is_reviewer() then raise exception 'Reviewer access required'; end if;
  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);
  perform private.validate_capture_time(p_captured_at);
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Reason required'; end if;
  select * into v_observation from public.observations where id=p_observation_id for update;
  if not found then raise exception 'Observation not found'; end if;
  if not private.location_is_retained(v_observation.incident_id) then raise exception 'Exact location retention expired'; end if;
  v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
  select exact_location into v_previous_point from private.observation_locations
    where observation_id=p_observation_id;
  perform set_config('aquarelay.location_change_reason',private.redact_location_text(p_reason),true);
  update public.observations set location=v_point where id=p_observation_id;
  update private.observation_locations set accuracy_meters=p_accuracy_meters,
    source=p_location_source,captured_at=p_captured_at where observation_id=p_observation_id;
  if p_observation_id=(select origin_observation_id from private.incident_locations
      where incident_id=v_observation.incident_id) then
    update public.incidents set location=v_point where id=v_observation.incident_id;
  end if;
  if public.st_equals(v_previous_point::public.geometry,v_point::public.geometry) then
    insert into private.location_audit(incident_id,observation_id,actor_id,actor_role,action,reason)
      values(v_observation.incident_id,p_observation_id,auth.uid(),coalesce(auth.role(),'database'),
        'corrected',private.redact_location_text(p_reason));
  end if;
  for v_other in select id from public.observations where incident_id=v_observation.incident_id loop
    perform private.refresh_observation_spatial(v_other);
  end loop;
end;
$$;
revoke all on function public.correct_observation_location(uuid,double precision,double precision,
  double precision,text,timestamptz,text) from public,anon;
grant execute on function public.correct_observation_location(uuid,double precision,double precision,
  double precision,text,timestamptz,text) to authenticated;

create function public.set_location_retention_hold(p_incident_id uuid,p_until timestamptz,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.current_app_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
  if p_until is null or p_until<=now() or p_until>now()+interval '5 years'
    or char_length(trim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'Valid hold date and justification required';
  end if;
  update private.incident_locations set retention_hold_until=p_until,
    retention_hold_reason=private.redact_location_text(p_reason) where incident_id=p_incident_id;
  if not found then raise exception 'Incident not found'; end if;
  insert into private.location_audit(incident_id,actor_id,actor_role,action,reason)
    values(p_incident_id,auth.uid(),coalesce(auth.role(),'database'),'hold_changed',private.redact_location_text(p_reason));
end;
$$;
revoke all on function public.set_location_retention_hold(uuid,timestamptz,text) from public,anon;
grant execute on function public.set_location_retention_hold(uuid,timestamptz,text) to authenticated;

create function private.purge_expired_exact_locations() returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  perform set_config('aquarelay.location_change_reason','retention_period_expired',true);
  update private.observation_locations ol set exact_location=null,exact_removed_at=now(),
      reported_label=null,target_distance_meters=null,distance_from_origin_meters=null,captured_at=null
    from public.observations o join public.incidents i on i.id=o.incident_id
    join private.incident_locations il on il.incident_id=i.id
    where ol.observation_id=o.id and ol.exact_location is not null
      and i.resolved_at<=now()-interval '90 days'
      and (il.retention_hold_until is null or il.retention_hold_until<=now());
  get diagnostics v_count=row_count;
  update private.mission_locations ml set exact_location=null,exact_removed_at=now()
    from public.missions m join public.incidents i on i.id=m.incident_id
    join private.incident_locations il on il.incident_id=i.id
    where ml.mission_id=m.id and ml.exact_location is not null
      and i.resolved_at<=now()-interval '90 days'
      and (il.retention_hold_until is null or il.retention_hold_until<=now());
  update private.incident_locations il set exact_location=null,exact_removed_at=now(),location_label=null
    from public.incidents i where il.incident_id=i.id and il.exact_location is not null
      and i.resolved_at<=now()-interval '90 days'
      and (il.retention_hold_until is null or il.retention_hold_until<=now());
  return v_count;
end;
$$;
create function public.purge_expired_exact_locations() returns integer
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  return private.purge_expired_exact_locations();
end;
$$;
revoke all on function public.purge_expired_exact_locations() from public,anon,authenticated;
grant execute on function public.purge_expired_exact_locations() to service_role;

create table private.location_read_quota(
  user_id uuid not null,scope text not null,window_start date not null,
  request_count integer not null default 0,
  primary key(user_id,scope,window_start)
);
alter table private.location_read_quota enable row level security;
revoke all on private.location_read_quota from public,anon,authenticated;
grant all on private.location_read_quota to service_role;
create function public.consume_location_read_quota(p_user_id uuid,p_scope text)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer; v_limit integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Authenticated user required'; end if;
  v_limit:=case p_scope when 'incidents' then 15 when 'incident_detail' then 100
    when 'missions' then 60 else null end;
  if v_limit is null then raise exception 'Invalid read scope'; end if;
  insert into private.location_read_quota(user_id,scope,window_start,request_count)
    values(p_user_id,p_scope,current_date,1)
    on conflict(user_id,scope,window_start) do update
      set request_count=private.location_read_quota.request_count+1
    returning request_count into v_count;
  if v_count>v_limit then raise exception 'Location read limit reached' using errcode='P0001'; end if;
end;
$$;
revoke all on function public.consume_location_read_quota(uuid,text) from public,anon;
grant execute on function public.consume_location_read_quota(uuid,text) to authenticated;

-- Direct PostgREST table queries otherwise bypass API pagination and quotas.
revoke select on public.incidents,public.observations,public.missions from anon,authenticated;
-- Service operations also use audited RPCs; SECURITY DEFINER functions retain
-- owner access to the private tables for matching, mission search and retention.
revoke all on all tables in schema private from service_role;
revoke all on all sequences in schema private from service_role;
revoke all on all functions in schema private from public,anon,authenticated;

-- Exact mission search is a service-only, bounded, audited RPC.
drop function public.list_available_missions(double precision,double precision,integer,public.mission_type,integer);
create function public.list_available_missions(
  p_requester_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer,
  p_type public.mission_type,
  p_limit integer
)
returns table (
  id uuid,
  incident_id uuid,
  type public.mission_type,
  evidence_gap text,
  instructions text,
  safety_message text,
  latitude double precision,
  longitude double precision,
  available_from timestamptz,
  due_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_row record;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_requester_id is null or not exists (select 1 from public.profiles pr where pr.id=p_requester_id)
    or p_latitude is null or p_longitude is null
    or p_radius_meters is null or p_radius_meters not between 1000 and 6000
    or p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid bounded mission search' using errcode='22023';
  end if;
  perform private.validate_location(p_latitude,p_longitude,null,'map');
  for v_row in select
    m.id,
    m.incident_id,
    m.type,
    m.evidence_gap,
    m.instructions,
    m.safety_message,
    public.st_y(coalesce(m.target_location, i.location)::public.geometry) as latitude,
    public.st_x(coalesce(m.target_location, i.location)::public.geometry) as longitude,
    m.available_from,
    m.due_at
  from public.missions m
  join public.incidents i on i.id = m.incident_id
  join private.incident_locations il on il.incident_id=i.id
  left join private.mission_locations ml on ml.mission_id=m.id
  where auth.role() = 'service_role' and not i.is_demo and i.resolved_at is null and m.state = 'open'
    and m.available_from <= now()
    and (m.due_at is null or m.due_at > now())
    and i.safety_state <> 'missions_paused'
    and (p_type is null or m.type = p_type)
    and public.st_dwithin(
        coalesce(ml.exact_location, il.exact_location),
        public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography,
        p_radius_meters
      )
  order by m.available_from, m.id
  limit p_limit loop
    insert into private.location_audit(incident_id,mission_id,actor_id,actor_role,action,reason)
      values(v_row.incident_id,v_row.id,p_requester_id,'service_role','accessed','nearby_mission_search');
    id:=v_row.id;
    incident_id:=v_row.incident_id;
    type:=v_row.type;
    evidence_gap:=v_row.evidence_gap;
    instructions:=v_row.instructions;
    safety_message:=v_row.safety_message;
    latitude:=v_row.latitude;
    longitude:=v_row.longitude;
    available_from:=v_row.available_from;
    due_at:=v_row.due_at;
    return next;
  end loop;
  return;
end;
$$;


revoke all on function public.list_available_missions(uuid,double precision,double precision,integer,public.mission_type,integer) from public,anon,authenticated;
grant execute on function public.list_available_missions(uuid,double precision,double precision,integer,public.mission_type,integer) to service_role;
-- Remove the prior signatures so callers cannot omit capture time or metadata.
drop function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,
  double precision,text,timestamptz,text,jsonb,text[],double precision,text);
drop function public.submit_mission_response(uuid,uuid,text,double precision,double precision,
  timestamptz,text,jsonb,text[],double precision,text);
create or replace function public.submit_observation(
  p_user_id uuid,
  p_idempotency_key text,
  p_stream_id uuid,
  p_category public.incident_category,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_observed_at timestamptz,
  p_description text,
  p_answers jsonb,
  p_safety_flags text[],
  p_accuracy_meters double precision,
  p_location_source text,
  p_captured_at timestamptz
)
returns table (
  incident_id uuid,
  observation_id uuid,
  created_incident boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident_id uuid;
  v_observation_id uuid;
  v_created_incident boolean := false;
  v_point public.geography(point, 4326);
  v_serious_safety boolean;
  v_stream_id uuid;
  v_conflicts text[] := '{}';
  v_facts jsonb;
  v_location_quality text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match submission author';
  end if;

  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);
  perform private.validate_capture_time(p_captured_at);

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
  );

  select o.incident_id, o.id
    into v_incident_id, v_observation_id
    from public.observations o
   where o.author_id = p_user_id
     and o.idempotency_key = p_idempotency_key;

  if v_observation_id is not null then
    return query select v_incident_id, v_observation_id, false, true;
    return;
  end if;

  v_point := public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography;
  v_stream_id := p_stream_id;
  if p_stream_id is not null and not exists (
    select 1 from public.streams s where s.id=p_stream_id
      and (s.flow_geometry is null or public.st_dwithin(s.flow_geometry,v_point,150))
  ) then
    v_conflicts:=array_append(v_conflicts,'reported_stream_far_from_point');
    v_stream_id:=null;
  elsif p_stream_id is null then
    v_stream_id:=private.nearest_curated_stream(v_point);
  end if;
  if private.label_stream_conflict(p_location_label,coalesce(v_stream_id,p_stream_id)) then
    v_conflicts:=array_append(v_conflicts,'label_stream_disagreement');
  end if;
  if private.label_coordinate_conflict(p_location_label,v_point) then
    v_conflicts:=array_append(v_conflicts,'label_coordinate_disagreement');
  end if;
  if p_location_source='device' and abs(extract(epoch from p_captured_at-p_observed_at))>3600 then
    v_conflicts:=array_append(v_conflicts,'capture_time_conflict');
  end if;
  if private.repeated_exact_point(v_point,p_user_id) then
    v_conflicts:=array_append(v_conflicts,'repeated_identical_point');
  end if;
  v_serious_safety := coalesce(p_safety_flags, '{}') && array[
    'strong_fumes', 'chemical_containers', 'mass_wildlife_death',
    'flooding', 'rapidly_changing_water'
  ];

  perform pg_advisory_xact_lock(hashtextextended('match:' || coalesce(v_stream_id::text,'unknown') || ':' || p_category::text,0));

  select i.id
    into v_incident_id
    from public.incidents i
    join private.incident_locations exact on exact.incident_id=i.id
   where not i.is_demo and i.category = p_category
     and i.resolved_at is null
     and i.opened_at >= now() - interval '24 hours'
     and (v_stream_id is not null and i.stream_id = v_stream_id)
     and public.st_dwithin(exact.exact_location, v_point, 250)
   order by public.st_distance(exact.exact_location, v_point), i.id
   limit 1;

  if v_incident_id is not null then
    insert into private.location_audit(incident_id,actor_id,actor_role,action,reason)
      values(v_incident_id,p_user_id,coalesce(auth.role(),'database'),'accessed','incident_matching');
  end if;
  if v_incident_id is null then
    insert into public.incidents (
      stream_id, created_by, category, location, location_label,
      evidence_status, status_reasons, safety_state
    )
    values (
      v_stream_id,
      p_user_id,
      p_category,
      v_point,
      p_location_label,
      case when v_serious_safety
        then 'expert_review_recommended'::public.evidence_status
        else 'early_signal'::public.evidence_status
      end,
      case when v_serious_safety
        then '["A reported safety hazard requires human review."]'::jsonb
        else '["This is the first observation in the investigation."]'::jsonb
      end,
      case when v_serious_safety
        then 'missions_paused'::public.safety_state
        else 'normal'::public.safety_state
      end
    )
    returning id into v_incident_id;
    v_created_incident := true;
  else
    update public.incidents
       set evidence_revision = evidence_revision + 1,
           safety_state = case when v_serious_safety
             then 'missions_paused'::public.safety_state else safety_state end,
           evidence_status = case when v_serious_safety
             then 'expert_review_recommended'::public.evidence_status else evidence_status end,
           status_reasons = case when v_serious_safety
             then status_reasons || '["A reported safety hazard requires human review."]'::jsonb
             else status_reasons end,
           updated_at = now()
     where id = v_incident_id;
  end if;

  insert into public.observations (
    incident_id, author_id, category, observed_at, location, description,
    answers, safety_flags, idempotency_key
  )
  values (
    v_incident_id, p_user_id, p_category, p_observed_at, v_point,
    p_description, coalesce(p_answers, '{}'::jsonb),
    coalesce(p_safety_flags, '{}'), p_idempotency_key
  )
  returning id into v_observation_id;

  v_facts:=private.spatial_facts_for(v_incident_id,v_point,coalesce(v_stream_id,p_stream_id));
  v_location_quality:=private.location_quality_for(p_location_source,p_accuracy_meters,v_conflicts);
  update private.observation_locations ol set accuracy_meters=p_accuracy_meters,source=p_location_source,
    captured_at=p_captured_at,reported_stream_id=p_stream_id,
    reported_label=p_location_label,
    distance_from_origin_meters=public.st_distance(
      (select il.exact_location from private.incident_locations il where il.incident_id=v_incident_id),v_point)
    where ol.observation_id=v_observation_id;
  update public.observations set location_quality=v_location_quality,
    location_conflicts=v_conflicts,spatial_facts=v_facts where id=v_observation_id;
  if v_created_incident then
    update private.incident_locations il set origin_observation_id=v_observation_id
      where il.incident_id=v_incident_id;
  end if;

  insert into public.incident_events (incident_id, actor_id, type, payload)
  values (
    v_incident_id,
    p_user_id,
    'observation_submitted',
    jsonb_build_object(
      'observationId', v_observation_id,
      'createdIncident', v_created_incident,
      'safetyReviewRequired', v_serious_safety
    )
  );

  return query select v_incident_id, v_observation_id, v_created_incident, false;
end;
$$;



create or replace function public.submit_mission_response(
  p_mission_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_observed_at timestamptz,
  p_description text,
  p_answers jsonb,
  p_safety_flags text[],
  p_accuracy_meters double precision,
  p_location_source text,
  p_captured_at timestamptz
)
returns table (
  incident_id uuid,
  observation_id uuid,
  evidence_revision integer,
  impact_points integer,
  replayed boolean,
  location_quality_flag text,
  location_quality text,
  spatial_facts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission public.missions%rowtype;
  v_incident public.incidents%rowtype;
  v_observation_id uuid;
  v_revision integer;
  v_points integer := 0;
  v_point public.geography(point, 4326);
  v_serious_safety boolean;
  v_target public.geography;
  v_distance double precision;
  v_quality text;
  v_location_quality text;
  v_stream_id uuid;
  v_conflicts text[]:='{}';
  v_facts jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match mission responder';
  end if;
  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);
  perform private.validate_capture_time(p_captured_at);

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select o.incident_id, o.id, i.evidence_revision
    into v_incident.id, v_observation_id, v_revision
    from public.observations o
    join public.incidents i on i.id = o.incident_id
   where o.author_id = p_user_id and o.idempotency_key = p_idempotency_key;
  if v_observation_id is not null then
    if not exists (select 1 from public.observations where id=v_observation_id and mission_id=p_mission_id) then
      raise exception 'Idempotency key already used for another submission';
    end if;
    select coalesce(sum(points), 0)::integer into v_points
      from public.impact_events e where e.observation_id = v_observation_id;
    select o.location_quality_flag into v_quality from public.observations o where o.id=v_observation_id;
    select o.location_quality,o.spatial_facts into v_location_quality,v_facts
      from public.observations o where o.id=v_observation_id;
    return query select v_incident.id,v_observation_id,v_revision,v_points,true,v_quality,v_location_quality,v_facts;
    return;
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  select * into v_incident from public.incidents where id = v_mission.incident_id for update;
  if v_incident.is_demo then raise exception 'Live responses cannot target demo incidents'; end if;
  if v_mission.available_from > now() or v_mission.due_at <= now() then raise exception 'Mission is not available'; end if;
  if v_mission.state <> 'open' then raise exception 'Mission is no longer open'; end if;
  if v_incident.safety_state = 'missions_paused' then raise exception 'Community missions are paused'; end if;

  v_point := public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography;
  select exact_location into v_target from private.mission_locations where mission_id=v_mission.id;
  if v_target is null and v_mission.type in ('repeat_observation','clearer_photo','safe_viewpoint') then
    select exact_location into v_target from private.incident_locations il where il.incident_id=v_incident.id;
  end if;
  if v_target is not null then
    insert into private.location_audit(incident_id,mission_id,actor_id,actor_role,action,reason)
      values(v_incident.id,v_mission.id,p_user_id,coalesce(auth.role(),'database'),'accessed','mission_distance_check');
  end if;
  v_distance := public.st_distance(v_target,v_point);
  v_quality := case when v_target is null then 'target_unknown'
    when v_distance > v_mission.target_radius_meters then 'far_from_target' else null end;
  v_stream_id:=private.nearest_curated_stream(v_point);
  if v_stream_id is not null and v_incident.stream_id is not null and v_stream_id<>v_incident.stream_id then
    v_conflicts:=array_append(v_conflicts,'different_stream');
  end if;
  if v_quality='far_from_target' then
    v_conflicts:=array_append(v_conflicts,'outside_target_radius');
  end if;
  if p_location_source='device' and abs(extract(epoch from p_captured_at-p_observed_at))>3600 then
    v_conflicts:=array_append(v_conflicts,'capture_time_conflict');
  end if;
  if private.repeated_exact_point(v_point,p_user_id) then
    v_conflicts:=array_append(v_conflicts,'repeated_identical_point');
  end if;
  v_location_quality:=private.location_quality_for(p_location_source,p_accuracy_meters,v_conflicts);
  v_facts:=private.spatial_facts_for(v_incident.id,v_point,v_stream_id,v_target,
    v_mission.target_radius_meters);
  v_serious_safety := coalesce(p_safety_flags, '{}') && array[
    'strong_fumes', 'chemical_containers', 'mass_wildlife_death',
    'flooding', 'rapidly_changing_water'
  ];

  insert into public.observations (
    incident_id, mission_id, author_id, category, observed_at, location,
    description, answers, safety_flags, idempotency_key
  ) values (
    v_incident.id, v_mission.id, p_user_id, v_incident.category, p_observed_at,
    v_point, p_description, coalesce(p_answers, '{}'::jsonb),
    coalesce(p_safety_flags, '{}'), p_idempotency_key
  ) returning id into v_observation_id;

  update private.observation_locations ol set accuracy_meters=p_accuracy_meters,source=p_location_source,
    captured_at=p_captured_at,reported_stream_id=v_stream_id,target_distance_meters=v_distance,
    distance_from_origin_meters=public.st_distance(
      (select il.exact_location from private.incident_locations il where il.incident_id=v_incident.id),v_point)
    where ol.observation_id=v_observation_id;
  update public.observations set location_quality_flag=v_quality,
    location_quality=v_location_quality,location_conflicts=v_conflicts,spatial_facts=v_facts
    where id=v_observation_id;
  update public.missions set state = 'completed', updated_at = now() where id = v_mission.id and v_quality is null and v_location_quality in ('precise','approximate');
  update public.incidents as updated
     set evidence_revision = updated.evidence_revision + 1,
         evidence_status = case when v_serious_safety
           then 'expert_review_recommended'::public.evidence_status else evidence_status end,
         safety_state = case when v_serious_safety
           then 'missions_paused'::public.safety_state else safety_state end,
         status_reasons = case when v_serious_safety
           then '["A reported safety hazard requires human review."]'::jsonb else status_reasons end,
         updated_at = now()
   where id = v_incident.id
   returning updated.evidence_revision into v_revision;

  if v_serious_safety then
    update public.missions m set state = 'paused', updated_at = now()
     where m.incident_id = v_incident.id and state = 'open';
  end if;

  if v_quality is null and v_location_quality in ('precise','approximate') and not exists (
    select 1 from public.impact_events e
     where e.incident_id = v_incident.id and contributor_id = p_user_id
       and gap_key = v_mission.type::text and points > 0 and reverses_event_id is null
  ) then
    v_points := 10;
    insert into public.impact_events (
      incident_id, contributor_id, observation_id, gap_key, points, reason
    ) values (
      v_incident.id, p_user_id, v_observation_id, v_mission.type::text, 10,
      'Completed the first accepted contribution for this evidence gap.'
    );
  end if;

  insert into public.incident_events (incident_id, actor_id, type, payload)
  values (
    v_incident.id,
    p_user_id,
    'mission_response_submitted',
    jsonb_build_object(
      'missionId', v_mission.id,
      'observationId', v_observation_id,
      'evidenceRevision', v_revision,
      'impactPoints', v_points,
      'assessmentRequired', true,
      'locationQualityFlag',v_quality
    )
  );

  return query select v_incident.id,v_observation_id,v_revision,v_points,false,v_quality,v_location_quality,v_facts;
end;
$$;



revoke all on function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,
  double precision,text,timestamptz,text,jsonb,text[],double precision,text,timestamptz) from public,anon;
grant execute on function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,
  double precision,text,timestamptz,text,jsonb,text[],double precision,text,timestamptz) to authenticated;
revoke all on function public.submit_mission_response(uuid,uuid,text,double precision,double precision,
  timestamptz,text,jsonb,text[],double precision,text,timestamptz) from public,anon;
grant execute on function public.submit_mission_response(uuid,uuid,text,double precision,double precision,
  timestamptz,text,jsonb,text[],double precision,text,timestamptz) to authenticated;

-- Remove historical exact points already past the review window. Approximate
-- public rows remain. The daily job handles incidents resolved later.
select private.purge_expired_exact_locations();

commit;
