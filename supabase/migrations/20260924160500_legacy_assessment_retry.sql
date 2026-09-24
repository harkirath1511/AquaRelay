-- Preserve the old assessment while allowing its contributor or a reviewer to
-- explicitly request one fresh, provenance-aware assessment of the same evidence.
create function public.request_legacy_assessment_retry(p_incident_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_assessment public.assessments%rowtype;
  v_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_incident from public.incidents where id=p_incident_id for update;
  if v_incident.id is null or v_incident.is_demo or v_incident.resolved_at is not null
    or v_incident.merged_into_incident_id is not null then
    raise exception 'Investigation is not eligible for reassessment';
  end if;
  if v_incident.created_by<>auth.uid() and not public.is_reviewer() and not exists (
    select 1 from public.observations o where o.incident_id=p_incident_id and o.author_id=auth.uid()
  ) then raise exception 'Only a contributor or reviewer may request reassessment'; end if;
  select * into v_assessment from public.assessments a
    where a.incident_id=p_incident_id and a.evidence_revision=v_incident.evidence_revision;
  if v_assessment.id is null or v_assessment.state<>'complete'
    or v_assessment.result is null or v_assessment.result ? 'assessmentMode' then
    raise exception 'The current assessment is not an earlier unverified result';
  end if;
  update public.incidents set evidence_revision=evidence_revision+1,updated_at=now()
    where id=p_incident_id returning evidence_revision into v_revision;
  insert into public.incident_events(incident_id,actor_id,type,payload)
    values(p_incident_id,auth.uid(),'legacy_assessment_retry_requested',
      jsonb_build_object('previousAssessmentId',v_assessment.id,'evidenceRevision',v_revision));
  return v_revision;
end;
$$;
revoke all on function public.request_legacy_assessment_retry(uuid) from public,anon;
grant execute on function public.request_legacy_assessment_retry(uuid) to authenticated;
