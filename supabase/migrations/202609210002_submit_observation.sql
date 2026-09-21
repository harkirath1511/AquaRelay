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
  p_safety_flags text[]
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
  v_point geography(point, 4326);
  v_serious_safety boolean;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match submission author';
  end if;

  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Coordinates are outside valid geographic bounds';
  end if;

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

  v_point := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography;
  v_serious_safety := coalesce(p_safety_flags, '{}') && array[
    'strong_fumes', 'chemical_containers', 'mass_wildlife_death',
    'flooding', 'rapidly_changing_water'
  ];

  select i.id
    into v_incident_id
    from public.incidents i
   where i.category = p_category
     and i.resolved_at is null
     and i.opened_at >= now() - interval '24 hours'
     and (p_stream_id is null or i.stream_id = p_stream_id)
     and st_dwithin(i.location, v_point, 250)
   order by i.location <-> v_point
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

revoke all on function public.submit_observation(
  uuid, text, uuid, public.incident_category, double precision, double precision,
  text, timestamptz, text, jsonb, text[]
) from public;

grant execute on function public.submit_observation(
  uuid, text, uuid, public.incident_category, double precision, double precision,
  text, timestamptz, text, jsonb, text[]
) to authenticated;
