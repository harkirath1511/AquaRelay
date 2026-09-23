-- RETURNS TABLE columns are PL/pgSQL variables. Qualify table references so
-- evidence_revision does not ambiguously refer to the output column.
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
  if v_incident.resolved_at is not null then
    raise exception 'Resolved investigations cannot request a new assessment';
  end if;
  if v_incident.created_by <> p_user_id and not public.is_reviewer() and not exists (
    select 1 from public.observations o
     where o.incident_id = p_incident_id and o.author_id = p_user_id
  ) then
    raise exception 'Only a contributor or reviewer may request assessment';
  end if;

  select a.id, a.state into v_assessment_id, v_assessment_state
    from public.assessments a
   where a.incident_id = p_incident_id
     and a.evidence_revision = v_incident.evidence_revision;
  if v_assessment_id is not null then
    if v_assessment_state = 'failed' then
      update public.assessments a
         set state = 'pending', failure_code = null, started_at = now(), completed_at = null
       where a.id = v_assessment_id;
      return query select v_assessment_id, v_incident.evidence_revision, true;
      return;
    end if;
    return query select v_assessment_id, v_incident.evidence_revision, false;
    return;
  end if;

  insert into public.assessments as a (incident_id, evidence_revision)
  values (p_incident_id, v_incident.evidence_revision)
  returning a.id into v_assessment_id;

  return query select v_assessment_id, v_incident.evidence_revision, true;
end;
$$;

revoke execute on function public.claim_incident_assessment(uuid, uuid) from public, anon;
grant execute on function public.claim_incident_assessment(uuid, uuid) to authenticated;
