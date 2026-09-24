-- Broaden the report taxonomy while retaining the existing water-specific cases.
alter type public.incident_category add value if not exists 'air_quality';
alter type public.incident_category add value if not exists 'illegal_dumping';
alter type public.incident_category add value if not exists 'vegetation_loss';
alter type public.incident_category add value if not exists 'habitat_damage';
alter type public.incident_category add value if not exists 'soil_contamination';
alter type public.incident_category add value if not exists 'noise';
-- PostgreSQL has no min(uuid); choose the sole strong candidate from the aggregate.
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
  v_match_count integer;
  v_strong_count integer;
  v_strong_id uuid;
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
  -- Land, air and noise reports must never inherit a nearby waterway.
  if p_category::text in ('air_quality','illegal_dumping','vegetation_loss','habitat_damage','soil_contamination','noise') then
    v_stream_id := null;
  else
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

  -- A single nearby candidate joins only with an affirmative waterway signal.
  -- Other plausible cases make the choice ambiguous and require human review.
  select count(*), count(*) filter (where c.strong), (array_agg(c.id) filter (where c.strong))[1]
    into v_match_count, v_strong_count, v_strong_id
    from (
      select i.id, private.same_waterway_signal(
        v_stream_id,i.stream_id,p_location_label,exact.location_label) as strong
      from public.incidents i
      join private.incident_locations exact on exact.incident_id=i.id
      where not i.is_demo and i.category=p_category and i.resolved_at is null
        and i.merged_into_incident_id is null
        and i.opened_at >= now()-interval '24 hours'
        and public.st_dwithin(exact.exact_location,v_point,250)
        and not private.case_waterways_conflict(
          v_point,v_stream_id,exact.exact_location,i.stream_id)
    ) c;
  if p_category::text not in ('air_quality','illegal_dumping','vegetation_loss','habitat_damage','soil_contamination','noise') and v_match_count=1 and v_strong_count=1 then
    v_incident_id:=v_strong_id;
  end if;

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