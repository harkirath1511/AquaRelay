-- Record the review and approved follow-up missions in a single transaction.
create function public.record_incident_review_with_missions(
  p_incident_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_decision,
  p_explanation text,
  p_mission_types public.mission_type[]
)
returns table (review_id uuid, evidence_status public.evidence_status, resolved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_safety public.safety_state;
  v_result record;
begin
  if auth.uid() is null or auth.uid() <> p_reviewer_id or not public.is_reviewer() then
    raise exception 'Reviewer access is required';
  end if;
  if p_decision is distinct from 'request_more_evidence' or p_mission_types is null
    or cardinality(p_mission_types) not between 1 and 3
    or array_position(p_mission_types, null) is not null
    or (select count(distinct t) from unnest(p_mission_types) t) <> cardinality(p_mission_types) then
    raise exception 'Choose one to three distinct approved follow-up missions';
  end if;
  select safety_state into v_safety from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if v_safety = 'missions_paused' then
    raise exception 'Safety pause prevents new field missions';
  end if;
  select * into v_result from public.record_incident_review(
    p_incident_id, p_reviewer_id, p_decision, p_explanation
  );
  insert into public.missions(incident_id, type, evidence_gap, instructions, safety_message)
  select p_incident_id, template.type, template.gap, template.instructions,
    'Stay on public paths. Do not enter the water, touch substances or wildlife, trespass, or confront anyone.'
  from (values
    ('upstream_comparison'::public.mission_type, 'An upstream comparison is missing.', 'Observe the same stream upstream from a safe public viewpoint and record whether the condition is visible.'),
    ('downstream_comparison'::public.mission_type, 'A downstream comparison is missing.', 'Observe the same stream downstream from a safe public viewpoint and record whether the condition continues.'),
    ('repeat_observation'::public.mission_type, 'Persistence over time is unknown.', 'Observe again at a later time only if conditions remain safe, and record whether the condition persists.'),
    ('clearer_photo'::public.mission_type, 'Clear visual evidence is missing.', 'Take a clearer photograph from a safe public viewpoint without approaching the water.'),
    ('unaffected_comparison'::public.mission_type, 'An unaffected comparison is missing.', 'Photograph a nearby apparently unaffected section from a safe public viewpoint.'),
    ('safe_viewpoint'::public.mission_type, 'A safe viewpoint observation is missing.', 'Observe only from an existing safe public viewpoint and describe what is visible.'),
    ('unsafe_access_report'::public.mission_type, 'Access safety is uncertain.', 'Report whether the suggested observation area is unsafe or inaccessible; do not attempt to enter it.')
  ) template(type, gap, instructions)
  where template.type = any(p_mission_types) and not exists (
    select 1 from public.missions existing where existing.incident_id = p_incident_id
      and existing.type = template.type and existing.state in ('open', 'paused')
  );
  insert into public.incident_events(incident_id, actor_id, type, payload)
    values(p_incident_id, p_reviewer_id, 'reviewer_missions_requested',
      jsonb_build_object('reviewId', v_result.review_id, 'missionTypes', to_jsonb(p_mission_types)));
  return query select v_result.review_id::uuid, v_result.evidence_status::public.evidence_status,
    v_result.resolved_at::timestamptz;
end;
$$;
revoke all on function public.record_incident_review_with_missions(uuid,uuid,public.review_decision,text,public.mission_type[]) from public,anon;
grant execute on function public.record_incident_review_with_missions(uuid,uuid,public.review_decision,text,public.mission_type[]) to authenticated;
