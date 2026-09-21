create or replace function public.finalize_observation_media(
  p_observation_id uuid,
  p_media_id uuid,
  p_is_duplicate boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident_id uuid;
  v_revision integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.media
     where id = p_media_id and observation_id = p_observation_id and processing_state = 'ready'
  ) then raise exception 'Ready media record not found'; end if;

  update public.observations
     set is_potential_duplicate = is_potential_duplicate or p_is_duplicate
   where id = p_observation_id
   returning incident_id into v_incident_id;
  if v_incident_id is null then raise exception 'Observation not found'; end if;

  update public.incidents as updated
     set evidence_revision = evidence_revision + 1, updated_at = now()
   where id = v_incident_id
   returning updated.evidence_revision into v_revision;

  insert into public.incident_events (incident_id, type, payload)
  values (
    v_incident_id,
    'media_ready',
    jsonb_build_object(
      'observationId', p_observation_id,
      'mediaId', p_media_id,
      'potentialDuplicate', p_is_duplicate,
      'evidenceRevision', v_revision,
      'assessmentRequired', true
    )
  );

  return v_revision;
end;
$$;

revoke all on function public.finalize_observation_media(uuid, uuid, boolean) from public;
grant execute on function public.finalize_observation_media(uuid, uuid, boolean) to service_role;
