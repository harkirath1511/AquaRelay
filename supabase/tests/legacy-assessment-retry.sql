-- Run in development only. No real evidence is sent to an AI provider.
begin;
do $$
declare v_case public.incidents%rowtype; v_previous_id uuid; v_revision integer;
begin
  select i.* into v_case from public.incidents i
    join public.assessments a on a.incident_id=i.id and a.evidence_revision=i.evidence_revision
    where a.state='complete' and a.result is not null and not (a.result ? 'assessmentMode')
      and i.resolved_at is null and not i.is_demo and i.merged_into_incident_id is null
    limit 1;
  if v_case.id is null then raise exception 'Development fixture lacks an eligible legacy assessment'; end if;
  select id into v_previous_id from public.assessments
    where incident_id=v_case.id and evidence_revision=v_case.evidence_revision;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_case.created_by::text,true);
  v_revision:=public.request_legacy_assessment_retry(v_case.id);
  if v_revision<>v_case.evidence_revision+1 then raise exception 'Revision was not advanced once'; end if;
  if not exists(select 1 from public.assessments where id=v_previous_id and state='complete') then
    raise exception 'Earlier assessment was not preserved';
  end if;
  begin
    perform public.request_legacy_assessment_retry(v_case.id);
    raise exception 'Duplicate retry was accepted';
  exception when others then
    if sqlerrm='Duplicate retry was accepted' then raise; end if;
  end;
end;
$$;
select 'legacy retry checks passed; changes will roll back' as result;
rollback;
