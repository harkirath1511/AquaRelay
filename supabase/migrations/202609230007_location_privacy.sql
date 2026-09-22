-- Public geography columns now contain only a deterministic 0.01-degree cell centre.
-- Exact points are never joined into public readers, exports, or assessment evidence.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create function private.approximate_location(p public.geography)
returns public.geography language sql immutable strict set search_path = '' as $$
  select public.st_setsrid(public.st_makepoint(
    least(179.995, floor((public.st_x(p::public.geometry) + 180) * 100) / 100 - 180 + 0.005),
    least(89.995, floor((public.st_y(p::public.geometry) + 90) * 100) / 100 - 90 + 0.005)
  ),4326)::public.geography;
$$;

create table private.incident_locations (
  incident_id uuid primary key references public.incidents(id) on delete cascade deferrable initially deferred,
  reporter_id uuid not null references public.profiles(id),
  exact_location public.geography(point,4326) not null,
  location_label text
);
create table private.observation_locations (
  observation_id uuid primary key references public.observations(id) on delete cascade deferrable initially deferred,
  reporter_id uuid not null references public.profiles(id),
  exact_location public.geography(point,4326) not null,
  accuracy_meters double precision check (accuracy_meters >= 0 and accuracy_meters <= 10000),
  source text not null check (source in ('device','map','search','legacy_unknown')),
  target_distance_meters double precision
);
create table private.mission_locations (
  mission_id uuid primary key references public.missions(id) on delete cascade deferrable initially deferred,
  exact_location public.geography(point,4326) not null
);
create index on private.incident_locations using gist(exact_location);
create index on private.mission_locations using gist(exact_location);
alter table private.incident_locations enable row level security;
alter table private.observation_locations enable row level security;
alter table private.mission_locations enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;
grant select on all tables in schema private to authenticated;
grant all on all tables in schema private to service_role;
create policy incident_location_access on private.incident_locations for select to authenticated
  using (reporter_id = auth.uid() or public.is_reviewer());
create policy observation_location_access on private.observation_locations for select to authenticated
  using (reporter_id = auth.uid() or public.is_reviewer());
create policy mission_location_access on private.mission_locations for select to authenticated
  using (public.is_reviewer());

insert into private.incident_locations select id, created_by, location, location_label from public.incidents;
insert into private.observation_locations(observation_id,reporter_id,exact_location,source)
  select id,author_id,location,'legacy_unknown' from public.observations;
insert into private.mission_locations select id,target_location from public.missions where target_location is not null;
update public.incidents set location = private.approximate_location(location), location_label = null;
update public.observations set location = private.approximate_location(location);
update public.missions set target_location = private.approximate_location(target_location);
alter table public.observations add column location_quality_flag text
  check (location_quality_flag in ('far_from_target','target_unknown'));

-- BEFORE triggers keep exact points out of public rows and realtime WAL.
-- Deferred foreign keys permit capture before the parent insert completes.
create function private.capture_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'incidents' then
    insert into private.incident_locations values(new.id,new.created_by,new.location,new.location_label)
      on conflict(incident_id) do update set reporter_id=excluded.reporter_id,exact_location=excluded.exact_location,location_label=excluded.location_label;
    new.location := private.approximate_location(new.location);
    new.location_label := null;
  elsif tg_table_name = 'observations' then
    insert into private.observation_locations(observation_id,reporter_id,exact_location,source)
      values(new.id,new.author_id,new.location,'legacy_unknown')
      on conflict(observation_id) do update set reporter_id=excluded.reporter_id,exact_location=excluded.exact_location;
    new.location := private.approximate_location(new.location);
  elsif new.target_location is not null then
    insert into private.mission_locations values(new.id,new.target_location)
      on conflict(mission_id) do update set exact_location=excluded.exact_location;
    new.target_location := private.approximate_location(new.target_location);
  else
    delete from private.mission_locations where mission_id=new.id;
  end if;
  return new;
end;
$$;
create trigger capture_incident_location before insert or update of location on public.incidents
  for each row execute function private.capture_location();
create trigger capture_observation_location before insert or update of location on public.observations
  for each row execute function private.capture_location();
create trigger capture_mission_location before insert or update of target_location on public.missions
  for each row execute function private.capture_location();
revoke insert,update,delete on public.incidents,public.observations,public.missions from anon,authenticated;

create function private.validate_location(lat double precision, lon double precision, accuracy double precision, source text)
returns void language plpgsql set search_path = '' as $$
begin
  if lat is null or lon is null or not(lat between -90 and 90) or not(lon between -180 and 180)
    or source is null or source not in ('device','map','search')
    or (accuracy is not null and not(accuracy between 0 and 10000))
    or (source = 'device' and accuracy is null) then
    raise exception 'Invalid location or location metadata' using errcode='22023';
  end if;
end;
$$;

-- Explicit, narrowly scoped access; ordinary incident endpoints never use this.
create function public.get_observation_location(p_observation_id uuid)
returns table(latitude double precision,longitude double precision,accuracy_meters double precision,source text)
language sql stable security invoker set search_path = '' as $$
  select public.st_y(exact_location::public.geometry),public.st_x(exact_location::public.geometry),accuracy_meters,source
    from private.observation_locations where observation_id=p_observation_id;
$$;
revoke all on function public.get_observation_location(uuid) from public,anon;
grant execute on function public.get_observation_location(uuid) to authenticated,service_role;
revoke all on all functions in schema private from public,anon,authenticated;

drop function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,double precision,text,timestamptz,text,jsonb,text[]);

drop function public.submit_mission_response(uuid,uuid,text,double precision,double precision,timestamptz,text,jsonb,text[]);
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
  p_location_source text
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match submission author';
  end if;

  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);

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
  v_serious_safety := coalesce(p_safety_flags, '{}') && array[
    'strong_fumes', 'chemical_containers', 'mass_wildlife_death',
    'flooding', 'rapidly_changing_water'
  ];

  if p_stream_id is not null and not exists (
    select 1 from public.streams s where s.id=p_stream_id
      and (s.flow_geometry is null or public.st_dwithin(s.flow_geometry,v_point,150))
  ) then raise exception 'Location does not belong to the selected stream'; end if;
  perform pg_advisory_xact_lock(hashtextextended('match:' || coalesce(p_stream_id::text,'unknown') || ':' || p_category::text,0));

  select i.id
    into v_incident_id
    from public.incidents i
    join private.incident_locations exact on exact.incident_id=i.id
   where not i.is_demo and i.category = p_category
     and i.resolved_at is null
     and i.opened_at >= now() - interval '24 hours'
     and (p_stream_id is not null and i.stream_id = p_stream_id)
     and public.st_dwithin(exact.exact_location, v_point, 250)
   order by public.st_distance(exact.exact_location, v_point), i.id
   limit 1;

  if v_incident_id is null then
    insert into public.incidents (
      stream_id, created_by, category, location, location_label,
      evidence_status, status_reasons, safety_state
    )
    values (
      p_stream_id,
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

  update private.observation_locations ol set accuracy_meters=p_accuracy_meters,source=p_location_source where ol.observation_id=v_observation_id;

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
  p_location_source text
)
returns table (
  incident_id uuid,
  observation_id uuid,
  evidence_revision integer,
  impact_points integer,
  replayed boolean,
  location_quality_flag text
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match mission responder';
  end if;
  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);

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
    return query select v_incident.id, v_observation_id, v_revision, v_points, true, v_quality;
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
  v_distance := public.st_distance(v_target,v_point);
  v_quality := case when v_target is null then 'target_unknown' when v_distance > 250 then 'far_from_target' else null end;
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

  update private.observation_locations ol set accuracy_meters=p_accuracy_meters,source=p_location_source,target_distance_meters=v_distance where ol.observation_id=v_observation_id;
  update public.observations set location_quality_flag=v_quality where id=v_observation_id;
  update public.missions set state = 'completed', updated_at = now() where id = v_mission.id and v_quality is null;
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

  if v_quality is null and not exists (
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

  return query select v_incident.id, v_observation_id, v_revision, v_points, false, v_quality;
end;
$$;


create or replace function public.list_available_missions(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_meters integer default 5000,
  p_type public.mission_type default null,
  p_limit integer default 25
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
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if (p_latitude is null) <> (p_longitude is null)
    or p_radius_meters is null or p_radius_meters not between 100 and 20000
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid mission search' using errcode='22023';
  end if;
  if p_latitude is not null then perform private.validate_location(p_latitude,p_longitude,null,'map'); end if;
  return query select
    m.id,
    m.incident_id,
    m.type,
    m.evidence_gap,
    m.instructions,
    m.safety_message,
    public.st_y(coalesce(m.target_location, i.location)::public.geometry),
    public.st_x(coalesce(m.target_location, i.location)::public.geometry),
    m.available_from,
    m.due_at
  from public.missions m
  join public.incidents i on i.id = m.incident_id
  join private.incident_locations il on il.incident_id=i.id
  left join private.mission_locations ml on ml.mission_id=m.id
  where auth.role() = 'service_role' and not i.is_demo and m.state = 'open'
    and m.available_from <= now()
    and (m.due_at is null or m.due_at > now())
    and i.safety_state <> 'missions_paused'
    and (p_type is null or m.type = p_type)
    and (
      p_latitude is null or p_longitude is null or
      public.st_dwithin(
        coalesce(ml.exact_location, il.exact_location),
        public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography,
        least(greatest(p_radius_meters, 100), 20000)
      )
    )
  order by m.available_from, m.id
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,double precision,text,timestamptz,text,jsonb,text[],double precision,text) from public,anon;
grant execute on function public.submit_observation(uuid,text,uuid,public.incident_category,double precision,double precision,text,timestamptz,text,jsonb,text[],double precision,text) to authenticated;
revoke all on function public.submit_mission_response(uuid,uuid,text,double precision,double precision,timestamptz,text,jsonb,text[],double precision,text) from public,anon;
grant execute on function public.submit_mission_response(uuid,uuid,text,double precision,double precision,timestamptz,text,jsonb,text[],double precision,text) to authenticated;
revoke all on function public.list_available_missions(double precision,double precision,integer,public.mission_type,integer) from public,anon,authenticated;
grant execute on function public.list_available_missions(double precision,double precision,integer,public.mission_type,integer) to service_role;
-- Sanitize alternate location carriers, including legacy records and direct RPCs.
create function private.redact_location_text(value text) returns text
language sql immutable strict set search_path = '' as $$
  select regexp_replace(regexp_replace(regexp_replace(value,
    'https?://[^[:space:]]+', '[link removed]', 'gi'),
    '[-+]?[0-9]+\.[0-9]+', '[number removed]', 'g'),
    '[-+]?[0-9]+[[:space:]]*[,°][[:space:]]*[-+]?[0-9]+', '[coordinates removed]', 'g');
$$;
create function private.public_json(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; item record;
begin
  if jsonb_typeof(value) = 'string' then return to_jsonb(private.redact_location_text(value #>> '{}')); end if;
  if jsonb_typeof(value) = 'object' then
    result := '{}';
    for item in select key,val from jsonb_each(value) as t(key,val) loop
      if item.key = 'locationQualityFlag' or item.key !~* '(latitude|longitude|(^|_)(lat|lon|lng)($|_)|coord|location|accuracy|distance|address|geohash|wkt|geojson)' then
        result := result || jsonb_build_object(item.key,private.public_json(item.val));
      end if;
    end loop;
    return result;
  end if;
  if jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(private.public_json(e)), '[]') into result from jsonb_array_elements(value) e;
    return result;
  end if;
  return value;
end;
$$;
create function private.sanitize_public_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='observations' then
    new.description := private.redact_location_text(new.description);
    select coalesce(jsonb_object_agg(key,value),'{}') into new.answers from jsonb_each(new.answers)
      where key in ('conditionVisible','persists','safeAccess') and jsonb_typeof(value)='boolean';
  elsif tg_table_name='incidents' then
    new.location_label := null;
    new.status_reasons := private.public_json(new.status_reasons);
  elsif tg_table_name='missions' then
    new.instructions := private.redact_location_text(new.instructions);
    new.evidence_gap := private.redact_location_text(new.evidence_gap);
    new.safety_message := private.redact_location_text(new.safety_message);
  elsif tg_table_name='assessments' then
    new.result := private.public_json(new.result);
    new.failure_code := private.redact_location_text(new.failure_code);
  elsif tg_table_name='reviews' then
    new.explanation := private.redact_location_text(new.explanation);
  elsif tg_table_name='incident_events' then
    new.payload := private.public_json(new.payload);
  end if;
  return new;
end;
$$;
create trigger sanitize_content before insert or update on public.observations for each row execute function private.sanitize_public_content();
create trigger sanitize_content before insert or update on public.incidents for each row execute function private.sanitize_public_content();
create trigger sanitize_content before insert or update on public.missions for each row execute function private.sanitize_public_content();
create trigger sanitize_content before insert or update on public.assessments for each row execute function private.sanitize_public_content();
create trigger sanitize_content before insert or update on public.reviews for each row execute function private.sanitize_public_content();
create trigger sanitize_content before insert or update on public.incident_events for each row execute function private.sanitize_public_content();
update public.observations set description=description;
update public.incidents set status_reasons=status_reasons;
update public.missions set instructions=instructions;
update public.assessments set result=result;
update public.reviews set explanation=explanation;
update public.incident_events set payload=payload;
revoke all on all functions in schema private from public,anon,authenticated;
-- Users cannot promote unsanitized uploads to ready or forge object paths.
revoke insert,update,delete on public.media from anon,authenticated;

commit;
