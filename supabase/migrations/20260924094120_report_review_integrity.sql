-- Conservative matching: a public place label is never enough unless it names
-- a waterway. Exact points remain in the private schema.
alter table public.incidents add column merged_into_incident_id uuid references public.incidents(id);
alter table public.missions add column target_safe_verified boolean not null default false;
alter table public.missions add column target_stream_id uuid references public.streams(id);
alter table public.media add column visual_hash text check (visual_hash ~ '^[0-9a-f]{22}$');
create index media_visual_hash_idx on public.media(visual_hash) where visual_hash is not null;
alter table public.observations drop constraint observations_location_quality_flag_check;
alter table public.observations add constraint observations_location_quality_flag_check
  check (location_quality_flag in ('far_from_target','target_unknown','comparison_unverified'));

-- Legacy comparison missions did not carry a usable target. Keep their
-- records, but remove them from the actionable queue until a reviewer plans
-- a verified replacement.
update public.missions set state='paused',updated_at=now()
  where state='open' and type in ('upstream_comparison','downstream_comparison','unaffected_comparison')
    and not target_safe_verified;

create function private.waterway_key(p_label text) returns text
language sql immutable set search_path = '' as $$
  select case
    when lower(coalesce(p_label,'')) ~ '(^|[^a-z])(river|stream|creek|canal|brook|waterway)([^a-z]|$)'
      or lower(coalesce(p_label,'')) ~ 'brook([^a-z]|$)'
    then nullif(trim(regexp_replace(lower(p_label), '[^a-z0-9]+', ' ', 'g')), '')
    else null
  end
$$;

create function private.case_waterways_conflict(
  p_new_point public.geography, p_new_stream uuid,
  p_existing_point public.geography, p_existing_stream uuid
) returns boolean language sql stable set search_path = '' as $$
  select
    (p_new_stream is not null and p_existing_stream is not null and p_new_stream <> p_existing_stream)
    or (select count(*) > 1 from public.streams s
          where s.is_curated and s.flow_geometry is not null
            and public.st_dwithin(s.flow_geometry, p_new_point, 175))
    or (select count(*) > 1 from public.streams s
          where s.is_curated and s.flow_geometry is not null
            and public.st_dwithin(s.flow_geometry, p_existing_point, 175))
$$;

create function private.same_waterway_signal(
  p_new_stream uuid, p_existing_stream uuid,
  p_new_label text, p_existing_label text
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_new_stream is not null or p_existing_stream is not null
      then p_new_stream is not null and p_new_stream = p_existing_stream
    else private.waterway_key(p_new_label) is not null
      and private.waterway_key(p_new_label) = private.waterway_key(p_existing_label)
  end
$$;

-- Used before submission to expose only existing public case details, never
-- exact points or a distance precise enough to triangulate a reporter.
create function public.list_possible_incidents(
  p_latitude double precision, p_longitude double precision,
  p_category public.incident_category
) returns table(id uuid, location_label text, evidence_status public.evidence_status,
                opened_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  perform private.validate_location(p_latitude, p_longitude, null, 'map');
  return query
    select i.id, i.location_label, i.evidence_status, i.opened_at
    from public.incidents i
    join private.incident_locations il on il.incident_id = i.id
    where not i.is_demo and i.resolved_at is null and i.merged_into_incident_id is null and i.category = p_category
      and i.opened_at >= now() - interval '24 hours'
      and public.st_dwithin(il.exact_location,
        public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,250)
    order by i.opened_at desc, i.id limit 5;
end;
$$;

-- Repeated descriptions from the same reporter are a possible duplicate even
-- without photographs. Other people's similar observations stay independent.
create function private.flag_repeated_observation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.observations prior
    join private.observation_locations a on a.observation_id=prior.id
    join private.observation_locations b on b.observation_id=new.id
    where prior.id<>new.id and prior.incident_id=new.incident_id
      and prior.author_id=new.author_id and prior.category=new.category
      and prior.submitted_at>=new.submitted_at-interval '7 days'
      and lower(regexp_replace(trim(prior.description),'\s+',' ','g'))
        =lower(regexp_replace(trim(new.description),'\s+',' ','g'))
      and public.st_dwithin(a.exact_location,b.exact_location,75)
  ) then
    update public.observations set is_potential_duplicate=true where id=new.id;
  end if;
  return null;
end;
$$;
create trigger flag_repeated_observation_after_insert
after insert on public.observations for each row
execute function private.flag_repeated_observation();

create unique index impact_one_reversal_idx on public.impact_events(reverses_event_id)
where reverses_event_id is not null;
create function private.reverse_observation_impact(p_observation_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.impact_events(incident_id,contributor_id,observation_id,gap_key,
                                   points,reason,reverses_event_id)
  select e.incident_id,e.contributor_id,e.observation_id,e.gap_key,-e.points,
         p_reason,e.id
  from public.impact_events e
  where e.observation_id=p_observation_id and e.points>0 and e.reverses_event_id is null
    and not exists(select 1 from public.impact_events reversal where reversal.reverses_event_id=e.id)
  on conflict (reverses_event_id) where reverses_event_id is not null do nothing;
end;
$$;

create or replace function public.finalize_observation_media(
  p_observation_id uuid,p_media_id uuid,p_is_duplicate boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_incident_id uuid; v_revision integer; v_duplicate boolean;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if not exists(select 1 from public.media where id=p_media_id and observation_id=p_observation_id
                and processing_state='ready') then
    raise exception 'Ready media record not found';
  end if;
  update public.observations
    set is_potential_duplicate=is_potential_duplicate or p_is_duplicate
    where id=p_observation_id
    returning incident_id,is_potential_duplicate into v_incident_id,v_duplicate;
  if v_incident_id is null then raise exception 'Observation not found'; end if;
  if v_duplicate then
    perform private.reverse_observation_impact(p_observation_id,
      'Prior mission recognition reversed after duplicate photograph review.');
  end if;
  update public.incidents set evidence_revision=evidence_revision+1,updated_at=now()
    where id=v_incident_id returning evidence_revision into v_revision;
  insert into public.incident_events(incident_id,type,payload)
    values(v_incident_id,'media_ready',jsonb_build_object('observationId',p_observation_id,
      'mediaId',p_media_id,'potentialDuplicate',v_duplicate,
      'evidenceRevision',v_revision,'assessmentRequired',true));
  return v_revision;
end;
$$;

create function public.invalidate_observation(p_observation_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_incident_id uuid; v_revision integer;
begin
  if auth.uid() is null or not public.is_reviewer() then raise exception 'Reviewer access required'; end if;
  if length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>1000 then
    raise exception 'A reason of 10 to 1000 characters is required';
  end if;
  update public.observations set invalidated_at=now(),is_potential_duplicate=true
    where id=p_observation_id and invalidated_at is null
    returning incident_id into v_incident_id;
  if v_incident_id is null then raise exception 'Observation missing or already invalidated'; end if;
  perform private.reverse_observation_impact(p_observation_id,
    'Prior mission recognition reversed after reviewer invalidation.');
  update public.incidents set evidence_revision=evidence_revision+1,updated_at=now()
    where id=v_incident_id returning evidence_revision into v_revision;
  insert into public.incident_events(incident_id,actor_id,type,payload)
    values(v_incident_id,auth.uid(),'observation_invalidated',
      jsonb_build_object('observationId',p_observation_id,'reason',private.redact_location_text(trim(p_reason)),
        'evidenceRevision',v_revision));
  return v_incident_id;
end;
$$;
revoke all on function public.invalidate_observation(uuid,text) from public,anon;
grant execute on function public.invalidate_observation(uuid,text) to authenticated;
revoke all on function private.flag_repeated_observation() from public,anon,authenticated;
revoke all on function private.reverse_observation_impact(uuid,text) from public,anon,authenticated;
revoke all on function public.list_possible_incidents(double precision,double precision,public.incident_category) from public,anon,authenticated;
grant execute on function public.list_possible_incidents(double precision,double precision,public.incident_category) to service_role;
revoke all on function private.waterway_key(text) from public,anon,authenticated;
revoke all on function private.case_waterways_conflict(public.geography,uuid,public.geography,uuid) from public,anon,authenticated;
revoke all on function private.same_waterway_signal(uuid,uuid,text,text) from public,anon,authenticated;

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
  select count(*), count(*) filter (where c.strong), min(c.id) filter (where c.strong)
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
  if v_match_count=1 and v_strong_count=1 then
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

create or replace function public.generate_assessment_missions(p_incident_id uuid,p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if exists(select 1 from public.incidents where id=p_incident_id
      and (safety_state='missions_paused' or resolved_at is not null
           or merged_into_incident_id is not null)) then return; end if;
  insert into public.missions(incident_id,type,evidence_gap,instructions,safety_message)
  select p_incident_id,t.type,t.gap,t.instructions,
    'Stay on public paths. Do not enter the water, touch substances or wildlife, trespass, or confront anyone.'
  from (values
    ('repeat_observation'::public.mission_type,'Persistence over time is unknown.',
      'Return only if conditions are safe. Observe from an existing public viewpoint.'),
    ('clearer_photo'::public.mission_type,'Clear visual evidence is missing.',
      'Take a clearer photograph from a safe public viewpoint without approaching the water.'),
    ('unsafe_access_report'::public.mission_type,'Access safety is uncertain.',
      'Report unsafe or blocked access from wherever you are safe. Do not approach the site.')
  ) t(type,gap,instructions)
  where (t.type::text in (select jsonb_array_elements_text(coalesce(p_result->'suggestedMissionTypes','[]'::jsonb)))
    or (t.type in ('repeat_observation','clearer_photo')
      and coalesce(p_result->'suggestedMissionTypes','[]'::jsonb) ?| array[
        'upstream_comparison','downstream_comparison','unaffected_comparison']))
    and not exists(select 1 from public.missions m where m.incident_id=p_incident_id
      and m.type=t.type and m.state in ('open','paused'));
end;
$$;

alter table public.missions add column baseline_observation_id uuid references public.observations(id);
create function public.plan_comparison_mission(
  p_incident_id uuid,p_type public.mission_type,p_latitude double precision,
  p_longitude double precision,p_safe_viewpoint_confirmed boolean,
  p_reason text,p_baseline_observation_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_stream public.streams%rowtype;
  v_target public.geography(point,4326); v_origin public.geography;
  v_facts jsonb; v_mission_id uuid; v_baseline public.observations%rowtype;
begin
  if auth.uid() is null or not public.is_reviewer() then raise exception 'Reviewer access required'; end if;
  if p_type not in ('upstream_comparison','downstream_comparison','unaffected_comparison')
    or p_safe_viewpoint_confirmed is distinct from true
    or length(trim(coalesce(p_reason,'')))<10 then
    raise exception 'A safe comparison type, viewpoint confirmation, and reason are required';
  end if;
  perform private.validate_location(p_latitude,p_longitude,null,'map');
  v_target:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
  select * into v_incident from public.incidents where id=p_incident_id for update;
  if not found or v_incident.resolved_at is not null or v_incident.merged_into_incident_id is not null
    or v_incident.safety_state='missions_paused' then
    raise exception 'Case is unavailable for field comparison';
  end if;
  select * into v_stream from public.streams where id=v_incident.stream_id;
  if not found or not v_stream.is_curated or not v_stream.flow_direction_verified
    or v_stream.flow_geometry is null
    or not public.st_dwithin(v_stream.flow_geometry,v_target,150) then
    raise exception 'A verified single-waterway flow line is required';
  end if;
  select exact_location into v_origin from private.incident_locations where incident_id=p_incident_id;
  if not public.st_dwithin(v_origin,v_target,1000) then
    raise exception 'Comparison target is outside the pilot reach';
  end if;
  v_facts:=private.spatial_facts_for(p_incident_id,v_target,v_stream.id,v_target,100);
  if (p_type='upstream_comparison' and v_facts->>'flowRelationship'<>'upstream')
    or (p_type='downstream_comparison' and v_facts->>'flowRelationship'<>'downstream') then
    raise exception 'Target does not have the verified comparison direction';
  end if;
  if p_type='unaffected_comparison' then
    select * into v_baseline from public.observations where id=p_baseline_observation_id;
    if not found or v_baseline.incident_id<>p_incident_id or v_baseline.is_potential_duplicate
      or v_baseline.invalidated_at is not null or v_baseline.location_quality not in ('precise','approximate')
      or v_baseline.answers->>'conditionVisible'<>'false'
      or not exists(select 1 from private.observation_locations ol
        where ol.observation_id=v_baseline.id and public.st_dwithin(ol.exact_location,v_target,100)) then
      raise exception 'An unaffected, quality-checked baseline near the target is required';
    end if;
  end if;
  if exists(select 1 from public.missions where incident_id=p_incident_id and type=p_type and state='open') then
    raise exception 'An open mission of this type already exists';
  end if;
  insert into public.missions(incident_id,type,evidence_gap,instructions,safety_message,
    target_location,target_radius_meters,target_safe_verified,target_stream_id,baseline_observation_id)
  values(p_incident_id,p_type,'Reviewer-verified comparison needed.',
    'Observe only from the reviewer-confirmed public viewpoint. Do not approach hazards.',
    'Stay on public paths. Do not enter water, touch substances or wildlife, trespass, or confront anyone.',
    v_target,100,true,v_stream.id,p_baseline_observation_id)
  returning id into v_mission_id;
  insert into public.incident_events(incident_id,actor_id,type,payload)
    values(p_incident_id,auth.uid(),'comparison_mission_planned',
      jsonb_build_object('missionId',v_mission_id,'type',p_type,
        'reason',private.redact_location_text(trim(p_reason))));
  return v_mission_id;
end;
$$;
revoke all on function public.plan_comparison_mission(uuid,public.mission_type,double precision,double precision,boolean,text,uuid) from public,anon;
grant execute on function public.plan_comparison_mission(uuid,public.mission_type,double precision,double precision,boolean,text,uuid) to authenticated;


create or replace function public.record_incident_review_with_missions(
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
  where ((template.type = any(p_mission_types)
    and template.type not in ('upstream_comparison','downstream_comparison','unaffected_comparison'))
    or (template.type in ('repeat_observation','clearer_photo')
      and p_mission_types && array['upstream_comparison','downstream_comparison','unaffected_comparison']::public.mission_type[]))
    and not exists (
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


create or replace function public.list_available_missions(
  p_requester_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer,
  p_type public.mission_type,
  p_limit integer
)
returns table (
  id uuid,
  incident_id uuid,
  type public.mission_type,
  evidence_gap text,
  instructions text,
  safety_message text,
  latitude double precision,
  longitude double precision,
  available_from timestamptz,
  due_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_row record;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if p_requester_id is null or not exists (select 1 from public.profiles pr where pr.id=p_requester_id)
    or p_latitude is null or p_longitude is null
    or p_radius_meters is null or p_radius_meters not between 1000 and 6000
    or p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid bounded mission search' using errcode='22023';
  end if;
  perform private.validate_location(p_latitude,p_longitude,null,'map');
  for v_row in select
    m.id,
    m.incident_id,
    m.type,
    m.evidence_gap,
    m.instructions,
    m.safety_message,
    public.st_y(coalesce(m.target_location, i.location)::public.geometry) as latitude,
    public.st_x(coalesce(m.target_location, i.location)::public.geometry) as longitude,
    m.available_from,
    m.due_at
  from public.missions m
  join public.incidents i on i.id = m.incident_id
  join private.incident_locations il on il.incident_id=i.id
  left join private.mission_locations ml on ml.mission_id=m.id
  where auth.role() = 'service_role' and not i.is_demo and i.resolved_at is null
    and i.merged_into_incident_id is null and m.state = 'open'
    and (m.type not in ('upstream_comparison','downstream_comparison','unaffected_comparison')
      or (m.target_safe_verified and m.target_stream_id=i.stream_id
        and exists(select 1 from public.streams s where s.id=m.target_stream_id
          and s.is_curated and s.flow_direction_verified and s.flow_geometry is not null)
        and ml.exact_location is not null))
    and m.available_from <= now()
    and (m.due_at is null or m.due_at > now())
    and i.safety_state <> 'missions_paused'
    and (p_type is null or m.type = p_type)
    and public.st_dwithin(
        coalesce(ml.exact_location, il.exact_location),
        public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography,
        p_radius_meters
      )
  order by m.available_from, m.id
  limit p_limit loop
    insert into private.location_audit(incident_id,mission_id,actor_id,actor_role,action,reason)
      values(v_row.incident_id,v_row.id,p_requester_id,'service_role','accessed','nearby_mission_search');
    id:=v_row.id;
    incident_id:=v_row.incident_id;
    type:=v_row.type;
    evidence_gap:=v_row.evidence_gap;
    instructions:=v_row.instructions;
    safety_message:=v_row.safety_message;
    latitude:=v_row.latitude;
    longitude:=v_row.longitude;
    available_from:=v_row.available_from;
    due_at:=v_row.due_at;
    return next;
  end loop;
  return;
end;
$$;


create or replace function public.submit_mission_response(
  p_mission_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_latitude double precision,
  p_longitude double precision,
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
  evidence_revision integer,
  impact_points integer,
  replayed boolean,
  location_quality_flag text,
  location_quality text,
  spatial_facts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission public.missions%rowtype;
  v_incident public.incidents%rowtype;
  v_observation_id uuid;
  v_revision integer;
  v_points integer := 0;
  v_point public.geography(point, 4326);
  v_serious_safety boolean;
  v_target public.geography;
  v_distance double precision;
  v_quality text;
  v_location_quality text;
  v_stream_id uuid;
  v_conflicts text[]:='{}';
  v_facts jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match mission responder';
  end if;
  perform private.validate_location(p_latitude,p_longitude,p_accuracy_meters,p_location_source);
  perform private.validate_capture_time(p_captured_at);

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select o.incident_id, o.id, i.evidence_revision
    into v_incident.id, v_observation_id, v_revision
    from public.observations o
    join public.incidents i on i.id = o.incident_id
   where o.author_id = p_user_id and o.idempotency_key = p_idempotency_key;
  if v_observation_id is not null then
    if not exists (select 1 from public.observations where id=v_observation_id and mission_id=p_mission_id) then
      raise exception 'Idempotency key already used for another submission';
    end if;
    select coalesce(sum(points), 0)::integer into v_points
      from public.impact_events e where e.observation_id = v_observation_id;
    select o.location_quality_flag into v_quality from public.observations o where o.id=v_observation_id;
    select o.location_quality,o.spatial_facts into v_location_quality,v_facts
      from public.observations o where o.id=v_observation_id;
    return query select v_incident.id,v_observation_id,v_revision,v_points,true,v_quality,v_location_quality,v_facts;
    return;
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  select * into v_incident from public.incidents where id = v_mission.incident_id for update;
  if v_incident.is_demo or v_incident.merged_into_incident_id is not null then raise exception 'Case is not open for mission responses'; end if;
  if v_mission.available_from > now() or v_mission.due_at <= now() then raise exception 'Mission is not available'; end if;
  if v_mission.state <> 'open' then raise exception 'Mission is no longer open'; end if;
  if v_incident.safety_state = 'missions_paused' then raise exception 'Community missions are paused'; end if;

  v_point := public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography;
  select exact_location into v_target from private.mission_locations where mission_id=v_mission.id;
  if v_target is null and v_mission.type in ('repeat_observation','clearer_photo','safe_viewpoint') then
    select exact_location into v_target from private.incident_locations il where il.incident_id=v_incident.id;
  end if;
  if v_mission.type in ('upstream_comparison','downstream_comparison','unaffected_comparison')
    and (not v_mission.target_safe_verified or v_target is null
      or v_mission.target_stream_id is distinct from v_incident.stream_id
      or not exists(select 1 from public.streams s where s.id=v_mission.target_stream_id
        and s.is_curated and s.flow_direction_verified and s.flow_geometry is not null)) then
    raise exception 'Comparison mission lacks a verified safe target';
  end if;
  if v_target is not null then
    insert into private.location_audit(incident_id,mission_id,actor_id,actor_role,action,reason)
      values(v_incident.id,v_mission.id,p_user_id,coalesce(auth.role(),'database'),'accessed','mission_distance_check');
  end if;
  v_distance := public.st_distance(v_target,v_point);
  v_quality := case when v_mission.type='unsafe_access_report' then null
    when v_target is null then 'target_unknown'
    when v_distance > v_mission.target_radius_meters then 'far_from_target' else null end;
  v_stream_id:=private.nearest_curated_stream(v_point);
  if v_stream_id is not null and v_incident.stream_id is not null and v_stream_id<>v_incident.stream_id then
    v_conflicts:=array_append(v_conflicts,'different_stream');
  end if;
  if v_quality='far_from_target' then
    v_conflicts:=array_append(v_conflicts,'outside_target_radius');
  end if;
  if p_location_source='device' and abs(extract(epoch from p_captured_at-p_observed_at))>3600 then
    v_conflicts:=array_append(v_conflicts,'capture_time_conflict');
  end if;
  if private.repeated_exact_point(v_point,p_user_id) then
    v_conflicts:=array_append(v_conflicts,'repeated_identical_point');
  end if;
  v_location_quality:=private.location_quality_for(p_location_source,p_accuracy_meters,v_conflicts);
  v_facts:=private.spatial_facts_for(v_incident.id,v_point,v_stream_id,v_target,
    v_mission.target_radius_meters);
  if v_mission.type in ('upstream_comparison','downstream_comparison')
    and coalesce(v_facts->>'flowRelationship','unknown') <>
      (case when v_mission.type='upstream_comparison' then 'upstream' else 'downstream' end) then
    v_quality:='comparison_unverified';
  end if;
  if v_mission.type='unaffected_comparison'
    and (v_mission.baseline_observation_id is null or v_facts->>'streamRelationship'<>'same') then
    v_quality:='comparison_unverified';
  end if;
  v_serious_safety := coalesce(p_safety_flags, '{}') && array[
    'strong_fumes', 'chemical_containers', 'mass_wildlife_death',
    'flooding', 'rapidly_changing_water'
  ];

  insert into public.observations (
    incident_id, mission_id, author_id, category, observed_at, location,
    description, answers, safety_flags, idempotency_key
  ) values (
    v_incident.id, v_mission.id, p_user_id, v_incident.category, p_observed_at,
    v_point, p_description, coalesce(p_answers, '{}'::jsonb),
    coalesce(p_safety_flags, '{}'), p_idempotency_key
  ) returning id into v_observation_id;

  update private.observation_locations ol set accuracy_meters=p_accuracy_meters,source=p_location_source,
    captured_at=p_captured_at,reported_stream_id=v_stream_id,target_distance_meters=v_distance,
    distance_from_origin_meters=public.st_distance(
      (select il.exact_location from private.incident_locations il where il.incident_id=v_incident.id),v_point)
    where ol.observation_id=v_observation_id;
  update public.observations set location_quality_flag=v_quality,
    location_quality=v_location_quality,location_conflicts=v_conflicts,spatial_facts=v_facts
    where id=v_observation_id;
  update public.missions set state = 'completed', updated_at = now() where id = v_mission.id
    and (v_mission.type='unsafe_access_report'
      or (v_quality is null and v_location_quality in ('precise','approximate')));
  update public.incidents as updated
     set evidence_revision = updated.evidence_revision + 1,
         evidence_status = case when v_serious_safety
           then 'expert_review_recommended'::public.evidence_status else evidence_status end,
         safety_state = case when v_serious_safety
           then 'missions_paused'::public.safety_state else safety_state end,
         status_reasons = case when v_serious_safety
           then '["A reported safety hazard requires human review."]'::jsonb else status_reasons end,
         updated_at = now()
   where id = v_incident.id
   returning updated.evidence_revision into v_revision;

  if v_serious_safety then
    update public.missions m set state = 'paused', updated_at = now()
     where m.incident_id = v_incident.id and state = 'open';
  end if;

  if v_quality is null and v_location_quality in ('precise','approximate')
    and v_mission.type <> 'unsafe_access_report'
    and not exists(select 1 from public.observations o where o.id=v_observation_id
      and (o.is_potential_duplicate or o.invalidated_at is not null)) and not exists (
    select 1 from public.impact_events e
     where e.incident_id = v_incident.id and contributor_id = p_user_id
       and gap_key = v_mission.type::text and points > 0 and reverses_event_id is null
  ) then
    v_points := 10;
    insert into public.impact_events (
      incident_id, contributor_id, observation_id, gap_key, points, reason
    ) values (
      v_incident.id, p_user_id, v_observation_id, v_mission.type::text, 10,
      'Completed the first accepted contribution for this evidence gap.'
    );
  end if;

  insert into public.incident_events (incident_id, actor_id, type, payload)
  values (
    v_incident.id,
    p_user_id,
    'mission_response_submitted',
    jsonb_build_object(
      'missionId', v_mission.id,
      'observationId', v_observation_id,
      'evidenceRevision', v_revision,
      'impactPoints', v_points,
      'assessmentRequired', true,
      'locationQualityFlag',v_quality
    )
  );

  return query select v_incident.id,v_observation_id,v_revision,v_points,false,v_quality,v_location_quality,v_facts;
end;
$$;

create function public.merge_related_incidents(
  p_source_id uuid,p_target_id uuid,p_reason text,p_same_waterway_confirmed boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_source public.incidents%rowtype; v_target public.incidents%rowtype;
  v_source_point public.geography; v_target_point public.geography;
  v_revision integer; v_moved integer;
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
  update public.missions set incident_id=p_target_id,state=case when state='open'
    and (v_source.safety_state='missions_paused' or v_target.safety_state='missions_paused')
    then 'paused'::public.mission_state else state end,updated_at=now()
    where incident_id=p_source_id;
  update public.observations set incident_id=p_target_id where incident_id=p_source_id;
  get diagnostics v_moved=row_count;
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
revoke all on function public.merge_related_incidents(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.merge_related_incidents(uuid,uuid,text,boolean) to authenticated;

