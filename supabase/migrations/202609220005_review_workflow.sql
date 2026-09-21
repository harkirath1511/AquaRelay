create or replace function public.record_incident_review(
  p_incident_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_decision,
  p_explanation text
)
returns table (review_id uuid, evidence_status public.evidence_status, resolved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review_id uuid;
  v_status public.evidence_status;
  v_resolved_at timestamptz;
begin
  if auth.uid() is null or auth.uid() <> p_reviewer_id or not public.is_reviewer() then
    raise exception 'Reviewer access is required';
  end if;
  if length(trim(p_explanation)) < 1 or length(p_explanation) > 4000 then
    raise exception 'A review explanation between 1 and 4000 characters is required';
  end if;

  perform 1 from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;

  insert into public.reviews (incident_id, reviewer_id, decision, explanation)
  values (p_incident_id, p_reviewer_id, p_decision, trim(p_explanation))
  returning id into v_review_id;

  v_status := case p_decision
    when 'request_more_evidence' then 'needs_verification'::public.evidence_status
    when 'recommend_expert_review' then 'expert_review_recommended'::public.evidence_status
    else 'resolved_or_explained'::public.evidence_status
  end;
  v_resolved_at := case when p_decision in ('resolved', 'explained') then now() else null end;

  update public.incidents
     set evidence_status = v_status,
         status_reasons = jsonb_build_array(trim(p_explanation)),
         resolved_at = v_resolved_at,
         updated_at = now()
   where id = p_incident_id;

  if v_resolved_at is not null then
    update public.missions set state = 'cancelled', updated_at = now()
     where incident_id = p_incident_id and state in ('open', 'paused');
  end if;

  insert into public.incident_events (incident_id, actor_id, type, payload)
  values (
    p_incident_id,
    p_reviewer_id,
    'review_recorded',
    jsonb_build_object('reviewId', v_review_id, 'decision', p_decision, 'status', v_status)
  );

  return query select v_review_id, v_status, v_resolved_at;
end;
$$;

revoke all on function public.record_incident_review(
  uuid, uuid, public.review_decision, text
) from public;
grant execute on function public.record_incident_review(
  uuid, uuid, public.review_decision, text
) to authenticated;
