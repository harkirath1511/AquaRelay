create or replace function public.claim_incident_assessment(
  p_incident_id uuid,
  p_user_id uuid
)
returns table (assessment_id uuid, evidence_revision integer, claimed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incidents%rowtype;
  v_assessment_id uuid;
  v_assessment_state public.assessment_state;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match assessment requester';
  end if;

  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if v_incident.created_by <> p_user_id and not public.is_reviewer() then
    raise exception 'Only the incident creator or a reviewer may request assessment';
  end if;

  select id, state into v_assessment_id, v_assessment_state
    from public.assessments
   where incident_id = p_incident_id and evidence_revision = v_incident.evidence_revision;
  if v_assessment_id is not null then
    if v_assessment_state = 'failed' then
      update public.assessments
         set state = 'pending', failure_code = null, started_at = now(), completed_at = null
       where id = v_assessment_id;
      return query select v_assessment_id, v_incident.evidence_revision, true;
      return;
    end if;
    return query select v_assessment_id, v_incident.evidence_revision, false;
    return;
  end if;

  insert into public.assessments (incident_id, evidence_revision)
  values (p_incident_id, v_incident.evidence_revision)
  returning id into v_assessment_id;

  return query select v_assessment_id, v_incident.evidence_revision, true;
end;
$$;

revoke all on function public.claim_incident_assessment(uuid, uuid) from public;
grant execute on function public.claim_incident_assessment(uuid, uuid) to authenticated;

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

  select incident_id into v_incident_id
    from public.assessments
   where id = p_assessment_id and evidence_revision = p_evidence_revision and state = 'pending'
   for update;
  if not found then raise exception 'Assessment is not pending'; end if;

  if not exists (
    select 1 from public.incidents
     where id = v_incident_id and evidence_revision = p_evidence_revision
  ) then
    update public.assessments set state = 'superseded', completed_at = now()
     where id = p_assessment_id;
    return false;
  end if;

  update public.assessments
     set state = 'complete', result = p_result, model_provider = p_model_provider,
         model_name = p_model_name, completed_at = now()
   where id = p_assessment_id;

  update public.incidents
     set evidence_status = case when evidence_status = 'resolved_or_explained'
           then evidence_status else p_status end,
         status_reasons = to_jsonb(p_status_reasons),
         safety_state = case when p_pause_missions then 'missions_paused'::public.safety_state
           else safety_state end,
         updated_at = now()
   where id = v_incident_id;

  if p_pause_missions then
    update public.missions set state = 'paused', updated_at = now()
     where incident_id = v_incident_id and state = 'open';
  end if;

  insert into public.incident_events (incident_id, type, payload)
  values (
    v_incident_id,
    'assessment_completed',
    jsonb_build_object('assessmentId', p_assessment_id, 'evidenceRevision', p_evidence_revision, 'status', p_status)
  );
  return true;
end;
$$;

create or replace function public.fail_incident_assessment(
  p_assessment_id uuid,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.assessments
     set state = 'failed', failure_code = left(p_failure_code, 100), completed_at = now()
   where id = p_assessment_id and state = 'pending';
end;
$$;

revoke all on function public.complete_incident_assessment(
  uuid, integer, jsonb, public.evidence_status, text[], boolean, text, text
) from public;
revoke all on function public.fail_incident_assessment(uuid, text) from public;
grant execute on function public.complete_incident_assessment(
  uuid, integer, jsonb, public.evidence_status, text[], boolean, text, text
) to service_role;
grant execute on function public.fail_incident_assessment(uuid, text) to service_role;
