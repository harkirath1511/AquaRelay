-- Run against a disposable development project only. All fixture writes roll back.
begin;
do $$
declare
  reporter uuid; reviewer uuid;
  first_case record; second_case record; third_case record; fourth_case record;
  crossing_one record; crossing_two record;
  pilot_case record; response record;
  stream_id uuid; mission_id uuid; media_id uuid:=gen_random_uuid();
  reversed_count integer;
begin
  select id into reporter from public.profiles where role='participant' limit 1;
  select id into reviewer from public.profiles where role in ('reviewer','admin') limit 1;
  if reporter is null or reviewer is null then raise exception 'Two development test roles are required'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',reporter::text,true);

  select * into first_case from public.submit_observation(reporter,'integrity-river-1',null,'foam',
    10,10,'River Cedar',now(),'White foam at the bend','{}','{}',null,'map',now());
  select * into second_case from public.submit_observation(reporter,'integrity-river-2',null,'foam',
    10.0001,10.0001,'River Cedar',now(),'White foam at the bend','{}','{}',null,'map',now());
  if first_case.incident_id<>second_case.incident_id then raise exception 'Unknown-stream same-waterway reports did not join'; end if;
  if not (select is_potential_duplicate from public.observations where id=second_case.observation_id) then
    raise exception 'Repeated same-reporter description was not flagged';
  end if;
  select * into third_case from public.submit_observation(reporter,'integrity-river-3',null,'foam',
    10.0002,10.0002,'River Birch',now(),'Different waterway report','{}','{}',null,'map',now());
  if third_case.incident_id=first_case.incident_id then raise exception 'Different named waterways auto-merged'; end if;
  select * into fourth_case from public.submit_observation(reporter,'integrity-river-4',null,'foam',
    10.0001,10.0001,'River Cedar',now(),'Ambiguous fourth report','{}','{}',null,'map',now());
  if fourth_case.incident_id=first_case.incident_id then raise exception 'Ambiguous nearby cases auto-merged'; end if;
  insert into public.missions(incident_id,type,evidence_gap,instructions,safety_message)
    values(fourth_case.incident_id,'repeat_observation','Check again','Observe safely','Keep distance')
    returning id into mission_id;
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  perform public.merge_related_incidents(fourth_case.incident_id,first_case.incident_id,
    'The two Cedar reports refer to the same reach and event.',true);
  if (select state from public.missions where id=mission_id)<>'cancelled' then
    raise exception 'Source mission stayed actionable after merge';
  end if;
  if (select spatial_facts->>'distanceFromOrigin' from public.observations
      where id=fourth_case.observation_id)='unknown' then
    raise exception 'Moved observation spatial facts were not recalculated';
  end if;
  if (select merged_into_incident_id from public.incidents where id=fourth_case.incident_id)
      <>first_case.incident_id then raise exception 'Merge source was not linked'; end if;
  perform set_config('request.jwt.claim.sub',reporter::text,true);

  insert into public.streams(name,flow_geometry,is_curated,flow_direction_verified)
    values('Test Crossing A',public.st_geogfromtext('SRID=4326;LINESTRING(19.999 20,20.001 20)'),true,true);
  insert into public.streams(name,flow_geometry,is_curated,flow_direction_verified)
    values('Test Crossing B',public.st_geogfromtext('SRID=4326;LINESTRING(20 19.999,20 20.001)'),true,true);
  select * into crossing_one from public.submit_observation(reporter,'integrity-crossing-1',null,'foam',
    20,20,'River Crossing',now(),'First crossing report','{}','{}',null,'map',now());
  select * into crossing_two from public.submit_observation(reporter,'integrity-crossing-2',null,'foam',
    20.0001,20.0001,'River Crossing',now(),'Second crossing report','{}','{}',null,'map',now());
  if crossing_one.incident_id=crossing_two.incident_id then raise exception 'Crossing waterways auto-merged'; end if;

  insert into public.streams(name,flow_geometry,is_curated,flow_direction_verified)
    values('Test Pilot Stream',public.st_geogfromtext('SRID=4326;LINESTRING(30 30,30.003 30)'),true,true)
    returning id into stream_id;
  select * into pilot_case from public.submit_observation(reporter,'integrity-pilot-1',null,'foam',
    30,30,'Pilot Stream',now(),'Pilot foam observation','{}','{}',20,'device',now());
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  begin
    perform public.plan_comparison_mission(first_case.incident_id,'downstream_comparison',
      10.0003,10.0003,true,'Test viewpoint is safe and public',null);
    raise exception 'Unverified comparison target was accepted';
  exception when others then
    if sqlerrm='Unverified comparison target was accepted' then raise; end if;
  end;
  select public.plan_comparison_mission(pilot_case.incident_id,'downstream_comparison',
    30,30.0006,true,'Confirmed safe public path and verified flow',null) into mission_id;
  if not (select target_safe_verified from public.missions where id=mission_id) then
    raise exception 'Planned comparison is not target-verified';
  end if;
  perform set_config('request.jwt.claim.sub',reporter::text,true);
  select * into response from public.submit_mission_response(mission_id,reporter,'integrity-pilot-response',
    30,30.0006,now(),'Downstream comparison from safe path','{}','{}',20,'device',now());
  if (select state from public.missions where id=mission_id)<>'completed' then
    raise exception 'Valid comparison response did not complete its mission';
  end if;

  insert into public.missions(incident_id,type,evidence_gap,instructions,safety_message)
    values(first_case.incident_id,'repeat_observation','Repeat needed','Observe safely','Keep distance')
    returning id into mission_id;
  select * into response from public.submit_mission_response(mission_id,reporter,'integrity-repeat-response',
    10,10,now(),'Condition remains visible','{}','{}',20,'device',now());
  if response.impact_points<>10 then raise exception 'Eligible repeat did not receive recognition'; end if;
  insert into public.media(id,observation_id,owner_id,object_path,sha256,mime_type,byte_size,processing_state)
    values(media_id,response.observation_id,reporter,
      reporter::text||'/'||media_id::text||'.jpg',repeat('a',64),'image/jpeg',100,'ready');
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.finalize_observation_media(response.observation_id,media_id,true);
  select count(*) into reversed_count from public.impact_events
    where observation_id=response.observation_id and points=-10 and reverses_event_id is not null;
  if reversed_count<>1 then raise exception 'Late duplicate photo did not reverse impact'; end if;
  perform public.finalize_observation_media(response.observation_id,media_id,true);
  select count(*) into reversed_count from public.impact_events
    where observation_id=response.observation_id and points=-10;
  if reversed_count<>1 then raise exception 'Duplicate reversal was not idempotent'; end if;
end;
$$;
select 'report-review integrity checks passed; fixture changes will roll back' as result;
rollback;
