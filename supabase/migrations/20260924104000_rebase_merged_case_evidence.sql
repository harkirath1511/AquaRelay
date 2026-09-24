-- Recompute moved evidence for the target case and cancel stale open missions.
create or replace function public.merge_related_incidents(
  p_source_id uuid,p_target_id uuid,p_reason text,p_same_waterway_confirmed boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_source public.incidents%rowtype; v_target public.incidents%rowtype;
  v_source_point public.geography; v_target_point public.geography;
  v_revision integer; v_moved integer; v_moved_ids uuid[]; v_obs record;
begin
  if auth.uid() is null or not public.is_reviewer() then raise exception 'Reviewer access required'; end if;
  if p_source_id=p_target_id or p_same_waterway_confirmed is distinct from true
    or length(trim(coalesce(p_reason,'')))<20 or length(p_reason)>2000 then
    raise exception 'Distinct cases, same-waterway confirmation, and a detailed reason are required';
  end if;
  perform 1 from public.incidents where id in (p_source_id,p_target_id) order by id for update;
  select * into v_source from public.incidents where id=p_source_id;
  select * into v_target from public.incidents where id=p_target_id;
  if v_source.id is null or v_target.id is null or v_source.is_demo or v_target.is_demo
    or v_source.merged_into_incident_id is not null or v_target.merged_into_incident_id is not null
    or v_source.resolved_at is not null or v_target.resolved_at is not null
    or v_source.category<>v_target.category then
    raise exception 'Cases are not eligible for merge';
  end if;
  if v_source.stream_id is not null and v_target.stream_id is not null
    and v_source.stream_id<>v_target.stream_id then
    raise exception 'Cases have different curated waterways';
  end if;
  select exact_location into v_source_point from private.incident_locations where incident_id=p_source_id;
  select exact_location into v_target_point from private.incident_locations where incident_id=p_target_id;
  if not public.st_dwithin(v_source_point,v_target_point,500)
    or abs(extract(epoch from v_source.opened_at-v_target.opened_at))>86400 then
    raise exception 'Cases exceed the merge time or distance boundary';
  end if;
  -- Open source missions refer to a different case origin; require a fresh target review.
  update public.missions set incident_id=p_target_id,
    state=case when state='open' then 'cancelled'::public.mission_state else state end,
    updated_at=now() where incident_id=p_source_id;
  select array_agg(id) into v_moved_ids from public.observations where incident_id=p_source_id;
  update public.observations set incident_id=p_target_id where incident_id=p_source_id;
  get diagnostics v_moved=row_count;
  for v_obs in
    select o.id,ol.exact_location,ol.reported_stream_id,m.target_location,m.target_radius_meters
      from public.observations o
      join private.observation_locations ol on ol.observation_id=o.id
      left join public.missions m on m.id=o.mission_id
      where o.id=any(v_moved_ids)
  loop
    update private.observation_locations ol
      set distance_from_origin_meters=public.st_distance(v_target_point,v_obs.exact_location)
      where ol.observation_id=v_obs.id;
    update public.observations o set spatial_facts=private.spatial_facts_for(
      p_target_id,v_obs.exact_location,
      coalesce(v_obs.reported_stream_id,private.nearest_curated_stream(v_obs.exact_location)),
      v_obs.target_location,v_obs.target_radius_meters)
      where o.id=v_obs.id;
  end loop;
  update public.incidents set evidence_revision=evidence_revision+1,
    safety_state=case when v_source.safety_state='missions_paused' then 'missions_paused'::public.safety_state
      else safety_state end,
    evidence_status=case when v_source.safety_state='missions_paused' then 'expert_review_recommended'::public.evidence_status
      else evidence_status end,
    updated_at=now() where id=p_target_id returning evidence_revision into v_revision;
  if v_source.safety_state='missions_paused' then
    update public.missions set state='paused',updated_at=now()
      where incident_id=p_target_id and state='open';
  end if;
  update public.incidents set merged_into_incident_id=p_target_id,resolved_at=now(),updated_at=now(),
    status_reasons='["Merged into a related investigation by a reviewer; source history is retained."]'::jsonb
    where id=p_source_id;
  insert into public.incident_events(incident_id,actor_id,type,payload) values
    (p_source_id,auth.uid(),'case_merged_out',jsonb_build_object('targetId',p_target_id,
      'reason',private.redact_location_text(trim(p_reason)),'movedObservations',v_moved)),
    (p_target_id,auth.uid(),'case_merged_in',jsonb_build_object('sourceId',p_source_id,
      'reason',private.redact_location_text(trim(p_reason)),'movedObservations',v_moved,
      'evidenceRevision',v_revision));
  return v_revision;
end;
$$;