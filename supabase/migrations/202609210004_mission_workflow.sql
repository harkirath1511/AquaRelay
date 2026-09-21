create or replace function public.generate_assessment_missions(
  p_incident_id uuid,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if exists (
    select 1 from public.incidents
     where id = p_incident_id and safety_state = 'missions_paused'
  ) then return; end if;

  insert into public.missions (
    incident_id, type, evidence_gap, instructions, safety_message
  )
  select
    p_incident_id,
    template.type,
    template.evidence_gap,
    template.instructions,
    'Stay on public paths. Do not enter the water, touch substances or wildlife, trespass, or confront anyone.'
  from (
    values
      ('upstream_comparison'::public.mission_type, 'An upstream comparison is missing.', 'Observe the same stream upstream from a safe public viewpoint and record whether the condition is visible.'),
      ('downstream_comparison'::public.mission_type, 'A downstream comparison is missing.', 'Observe the same stream downstream from a safe public viewpoint and record whether the condition continues.'),
      ('repeat_observation'::public.mission_type, 'Persistence over time is unknown.', 'Return at the requested time only if conditions are safe and record whether the condition remains.'),
      ('clearer_photo'::public.mission_type, 'Clear visual evidence is missing.', 'Take a clearer photograph from a safe public viewpoint without approaching the water.'),
      ('unaffected_comparison'::public.mission_type, 'An unaffected comparison is missing.', 'Photograph a nearby apparently unaffected section from a safe public viewpoint.'),
      ('safe_viewpoint'::public.mission_type, 'A safe viewpoint observation is missing.', 'Observe only from an existing safe public viewpoint and describe what is visible.'),
      ('unsafe_access_report'::public.mission_type, 'Access safety is uncertain.', 'Report whether the suggested observation area is unsafe or inaccessible; do not attempt to enter it.')
  ) as template(type, evidence_gap, instructions)
  join lateral jsonb_array_elements_text(coalesce(p_result -> 'suggestedMissionTypes', '[]'::jsonb)) suggested(type)
    on suggested.type = template.type::text
  where not exists (
    select 1 from public.missions existing
     where existing.incident_id = p_incident_id
       and existing.type = template.type
       and existing.state in ('open', 'paused')
  );
end;
$$;

revoke all on function public.generate_assessment_missions(uuid, jsonb) from public;
grant execute on function public.generate_assessment_missions(uuid, jsonb) to service_role;

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
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.incident_id,
    m.type,
    m.evidence_gap,
    m.instructions,
    m.safety_message,
    st_y(coalesce(m.target_location, i.location)::geometry),
    st_x(coalesce(m.target_location, i.location)::geometry),
    m.available_from,
    m.due_at
  from public.missions m
  join public.incidents i on i.id = m.incident_id
  where m.state = 'open'
    and m.available_from <= now()
    and (m.due_at is null or m.due_at > now())
    and i.safety_state <> 'missions_paused'
    and (p_type is null or m.type = p_type)
    and (
      p_latitude is null or p_longitude is null or
      st_dwithin(
        coalesce(m.target_location, i.location),
        st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography,
        least(greatest(p_radius_meters, 100), 20000)
      )
    )
  order by m.available_from, m.id
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.list_available_missions(
  double precision, double precision, integer, public.mission_type, integer
) from public;
grant execute on function public.list_available_missions(
  double precision, double precision, integer, public.mission_type, integer
) to authenticated;

create or replace function public.submit_mission_response(
  p_mission_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_observed_at timestamptz,
  p_description text,
  p_answers jsonb,
  p_safety_flags text[]
)
returns table (
  incident_id uuid,
  observation_id uuid,
  evidence_revision integer,
  impact_points integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mission public.missions%rowtype;
  v_incident public.incidents%rowtype;
  v_observation_id uuid;
  v_revision integer;
  v_points integer := 0;
  v_point geography(point, 4326);
  v_serious_safety boolean;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match mission responder';
  end if;
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Coordinates are outside valid geographic bounds';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select o.incident_id, o.id, i.evidence_revision
    into v_incident.id, v_observation_id, v_revision
    from public.observations o
    join public.incidents i on i.id = o.incident_id
   where o.author_id = p_user_id and o.idempotency_key = p_idempotency_key;
  if v_observation_id is not null then
    select coalesce(sum(points), 0)::integer into v_points
      from public.impact_events where observation_id = v_observation_id;
    return query select v_incident.id, v_observation_id, v_revision, v_points, true;
    return;
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  select * into v_incident from public.incidents where id = v_mission.incident_id for update;
  if v_mission.state <> 'open' then raise exception 'Mission is no longer open'; end if;
  if v_incident.safety_state = 'missions_paused' then raise exception 'Community missions are paused'; end if;

  v_point := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography;
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

  update public.missions set state = 'completed', updated_at = now() where id = v_mission.id;
  update public.incidents as updated
     set evidence_revision = evidence_revision + 1,
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
    update public.missions set state = 'paused', updated_at = now()
     where incident_id = v_incident.id and state = 'open';
  end if;

  if not exists (
    select 1 from public.impact_events
     where incident_id = v_incident.id and contributor_id = p_user_id
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
      'assessmentRequired', true
    )
  );

  return query select v_incident.id, v_observation_id, v_revision, v_points, false;
end;
$$;

revoke all on function public.submit_mission_response(
  uuid, uuid, text, double precision, double precision, timestamptz, text, jsonb, text[]
) from public;
grant execute on function public.submit_mission_response(
  uuid, uuid, text, double precision, double precision, timestamptz, text, jsonb, text[]
) to authenticated;

-- Complete assessments now materialise only approved mission templates.
create or replace function public.complete_incident_assessment(
  p_assessment_id uuid,
  p_evidence_revision integer,
  p_result jsonb,
  p_status public.evidence_status,
  p_status_reasons text[],
  p_pause_missions boolean,
  p_model_provider text,
  p_model_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select incident_id into v_incident_id from public.assessments
   where id = p_assessment_id and evidence_revision = p_evidence_revision and state = 'pending'
   for update;
  if not found then raise exception 'Assessment is not pending'; end if;

  if not exists (select 1 from public.incidents where id = v_incident_id and evidence_revision = p_evidence_revision) then
    update public.assessments set state = 'superseded', completed_at = now() where id = p_assessment_id;
    return false;
  end if;

  update public.assessments set state = 'complete', result = p_result,
    model_provider = p_model_provider, model_name = p_model_name, completed_at = now()
   where id = p_assessment_id;
  update public.incidents set
    evidence_status = case when evidence_status = 'resolved_or_explained' then evidence_status else p_status end,
    status_reasons = to_jsonb(p_status_reasons),
    safety_state = case when p_pause_missions then 'missions_paused'::public.safety_state else safety_state end,
    updated_at = now()
   where id = v_incident_id;

  if p_pause_missions then
    update public.missions set state = 'paused', updated_at = now()
     where incident_id = v_incident_id and state = 'open';
  else
    perform public.generate_assessment_missions(v_incident_id, p_result);
  end if;

  insert into public.incident_events (incident_id, type, payload)
  values (v_incident_id, 'assessment_completed', jsonb_build_object(
    'assessmentId', p_assessment_id, 'evidenceRevision', p_evidence_revision, 'status', p_status
  ));
  return true;
end;
$$;
