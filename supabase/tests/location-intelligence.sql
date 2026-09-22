-- Run only on a disposable database after migration 008. All fixtures roll back.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end; $$;
insert into auth.users(id) values
 ('70000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002'),
 ('70000000-0000-4000-8000-000000000003'),
 ('70000000-0000-4000-8000-000000000004'),
 ('70000000-0000-4000-8000-000000000005'),
 ('70000000-0000-4000-8000-000000000006');
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set role='reviewer' where id='70000000-0000-4000-8000-000000000003';
insert into public.streams(id,name,is_curated,flow_direction_verified,flow_geometry) values
 ('71000000-0000-4000-8000-000000000001','Stream A',true,true,public.st_geogfromtext('LINESTRING(-0.125 51.501234,-0.121 51.501234)')),
 ('71000000-0000-4000-8000-000000000002','Stream B',true,true,public.st_geogfromtext('LINESTRING(-0.126 51.502234,-0.122 51.502234)'));
insert into public.incidents(id,created_by,stream_id,category,location,is_demo) values
 ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
 '71000000-0000-4000-8000-000000000001','foam',public.st_geogfromtext('POINT(-0.123456 51.501234)'),true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
create temp table initial as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-first','71000000-0000-4000-8000-000000000001',
 'foam',51.501234,-0.123456,null,now(),'Foam','{}','{}',10,'device',now());
select pg_temp.assert_true((select created_incident from initial),'initial report creates an incident');
select pg_temp.assert_true((select incident_id<>'73000000-0000-4000-8000-000000000001'
 from initial),'live report cannot join a nearby demo incident');
select pg_temp.assert_true((select latitude=51.501234 and accuracy_meters=10 and captured_at is not null
 from public.get_observation_location((select observation_id from initial))),'reporter reads audited exact point and capture time');
reset role;
select pg_temp.assert_true((select location_quality='precise' and spatial_facts->>'distanceFromOrigin'='within_100m'
 from public.observations where id=(select observation_id from initial)),'precise classification and relative facts stored');
select pg_temp.assert_true((select count(*)=1 from private.location_audit
 where observation_id=(select observation_id from initial) and action='accessed'),'exact access audited');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.incidents','SELECT')
 and not has_table_privilege('authenticated','public.observations','SELECT')
 and not has_table_privilege('authenticated','public.missions','SELECT'),'direct scraping grants removed');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.observation_locations','SELECT'),'direct private reads removed');
select pg_temp.assert_true(not has_table_privilege('service_role','private.observation_locations','SELECT'),'service key must use audited exact access RPC');
grant select on initial to service_role;
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
create temp table different_waterway as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000002','intelligence-other-waterway',
 '71000000-0000-4000-8000-000000000002','foam',51.502234,-0.123456,
 null,now(),'Nearby other waterway','{}','{}',10,'device',now());
select pg_temp.assert_true((select created_incident from different_waterway),'nearby but separate stream creates a different incident');
select pg_temp.assert_true((select count(*)=0 from public.get_observation_location((select observation_id from initial))),
 'unrelated user cannot read another reporter exact fix');
create temp table inferred_stream as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000002','intelligence-curated',null,'foam',51.501234,-0.124456,
 null,now(),'Foam upstream','{}','{}',10,'device',now());
select pg_temp.assert_true((select not created_incident from inferred_stream),'unambiguous curated stream can join same investigation');
reset role;
select pg_temp.assert_true((select spatial_facts->>'flowRelationship'='upstream'
 and spatial_facts->>'streamRelationship'='same'
 and spatial_facts->>'distanceFromOrigin'='within_100m'
 from public.observations where id=(select observation_id from inferred_stream)),'upstream and same-stream facts computed from exact positions');
select pg_temp.assert_true((select stream_id='71000000-0000-4000-8000-000000000001'
 from public.incidents where id=(select incident_id from inferred_stream)),'curated stream identity preserved');
select pg_temp.assert_true((select distance_from_origin_meters between 50 and 100
 from private.observation_locations where observation_id=(select observation_id from inferred_stream)),
 'private exact distance from origin retained for computation');
set local role authenticated;
create temp table downstream_stream as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000002','intelligence-downstream',
 '71000000-0000-4000-8000-000000000001','foam',51.501234,-0.122456,
 null,now(),'Foam downstream','{}','{}',10,'device',now());
reset role;
select pg_temp.assert_true((select spatial_facts->>'flowRelationship'='downstream'
 and spatial_facts->>'streamRelationship'='same'
 from public.observations where id=(select observation_id from downstream_stream)),
 'verified downstream relationship computed from exact positions');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
create temp table reported_conflict as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-far-stream','71000000-0000-4000-8000-000000000001',
 'foam',51.51,-0.13,null,now(),'Distant report','{}','{}',10,'device',now());
reset role;
select pg_temp.assert_true((select 'reported_stream_far_from_point'=any(location_conflicts)
 and location_quality='location_conflict' from public.observations
 where id=(select observation_id from reported_conflict)),'stream-coordinate disagreement is a review signal');
select pg_temp.assert_true((select stream_id is null from public.incidents
 where id=(select incident_id from reported_conflict)),'conflicting stream cannot force a match');
set local role authenticated;
create temp table label_conflict as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-label-stream','71000000-0000-4000-8000-000000000001',
 'foam',51.501234,-0.123456,'Stream B',now(),'Label conflict','{}','{}',10,'device',now());
reset role;
select pg_temp.assert_true((select 'label_stream_disagreement'=any(location_conflicts)
 from public.observations where id=(select observation_id from label_conflict)),'known stream label disagreement flagged');
select pg_temp.assert_true((select location_label is null from public.incidents
 where id=(select incident_id from label_conflict)),'location label remains private');
set local role authenticated;
create temp table label_coordinates as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-label-coordinates','71000000-0000-4000-8000-000000000001',
 'foam',51.501234,-0.123456,'52.100000, -0.123456',now(),'Search label differs','{}','{}',10,'device',now());
reset role;
select pg_temp.assert_true((select 'label_coordinate_disagreement'=any(location_conflicts)
 from public.observations where id=(select observation_id from label_coordinates)),'coordinate-like label disagreement flagged');
set local role authenticated;
create temp table wide_area as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-wide-area',null,'foam',51.501234,-0.123456,
 null,now(),'Approximate map area','{}','{}',500,'map',now());
reset role;
select pg_temp.assert_true((select location_quality='low_accuracy' from public.observations
 where id=(select observation_id from wide_area)),'500-metre map selection has low spatial value');
set local role authenticated;
create temp table approximate_fix as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-approximate',
 '71000000-0000-4000-8000-000000000001','foam',51.501234,-0.1234,
 null,now(),'Moderately accurate device fix','{}','{}',50,'device',now());
create temp table stale_fix as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000001','intelligence-stale',
 '71000000-0000-4000-8000-000000000001','foam',51.501234,-0.1235,
 null,now(),'Old device fix','{}','{}',10,'device',now()-interval '2 hours');
reset role;
select pg_temp.assert_true((select location_quality='approximate' from public.observations
 where id=(select observation_id from approximate_fix)),'50-metre device fix is approximate');
select pg_temp.assert_true((select 'capture_time_conflict'=any(location_conflicts) from public.observations
 where id=(select observation_id from stale_fix)),'stale coordinate capture is flagged for review');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000004',true);
select public.submit_observation('70000000-0000-4000-8000-000000000004','intelligence-repeat-four',null,
 'foam',51.501234,-0.123456,null,now(),'Repeated point','{}','{}',10,'device',now());
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000005',true);
create temp table repeated_point as select * from public.submit_observation(
 '70000000-0000-4000-8000-000000000005','intelligence-repeat-five',null,'foam',51.501234,-0.123456,
 null,now(),'Repeated point','{}','{}',10,'device',now());
reset role;
select pg_temp.assert_true((select 'repeated_identical_point'=any(location_conflicts)
 from public.observations where id=(select observation_id from repeated_point)),'third account at identical exact point flagged');
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message,target_location,target_radius_meters)
 select '72000000-0000-4000-8000-000000000001',incident_id,'repeat_observation','Repeat','Observe','Stay safe',
 public.st_geogfromtext('POINT(-0.123456 51.501234)'),100 from initial;
insert into public.missions(id,incident_id,type,evidence_gap,instructions,safety_message)
 values ('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001',
 'repeat_observation','Demo repeat','Observe','Stay safe');
grant select on initial to service_role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select pg_temp.assert_true((select count(*)=1 from public.list_available_missions(
 '70000000-0000-4000-8000-000000000006',51.505,-0.125,2000,null,25)
 where id='72000000-0000-4000-8000-000000000001' and latitude<>51.501234),
 'audited bounded search uses exact target but returns approximate point');
reset role;
select pg_temp.assert_true((select count(*)=1 from private.location_audit
 where mission_id='72000000-0000-4000-8000-000000000001' and action='accessed'
 and actor_id='70000000-0000-4000-8000-000000000006'),'server mission access attributed to requester');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000006',true);
do $$ begin
  begin
    perform public.submit_mission_response('72000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000006','intelligence-demo-response',
      51.501234,-0.123456,now(),'Live response','{}','{}',10,'device',now());
    raise exception 'Demo mission accepted a live response';
  exception when others then
    if sqlerrm<>'Live responses cannot target demo incidents' then raise; end if;
  end;
end $$;
create temp table far_response as select * from public.submit_mission_response(
 '72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','intelligence-far-response',
 51.52,-0.123456,now(),'Far but useful observation','{}','{}',10,'device',now());
select pg_temp.assert_true((select location_quality='location_conflict' and impact_points=0
 and spatial_facts->>'insideTargetRadius'='false' from far_response),'out-of-radius response flagged without reward');
reset role;
select pg_temp.assert_true((select 'outside_target_radius'=any(location_conflicts)
 from public.observations where id=(select observation_id from far_response)),'target deviation visible to reviewers');
select pg_temp.assert_true((select state='open' from public.missions
 where id='72000000-0000-4000-8000-000000000001'),'far response leaves mission open');
set local role authenticated;
create temp table edge_response as select * from public.submit_mission_response(
 '72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','intelligence-edge-response',
 51.5026,-0.123456,now(),'Outside custom target radius','{}','{}',10,'device',now());
select pg_temp.assert_true((select location_quality_flag='far_from_target'
 and spatial_facts->>'insideTargetRadius'='false' from edge_response),'custom mission radius controls spatial facts');
reset role;
select pg_temp.assert_true((select spatial_facts->>'streamRelationship'='different'
 from public.observations where id=(select observation_id from edge_response)),
 'nearby response on another curated stream is marked different');
set local role authenticated;
create temp table manual_response as select * from public.submit_mission_response(
 '72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','intelligence-manual-response',
 51.501234,-0.12345,now(),'Manual near target','{}','{}',50,'map',now());
select pg_temp.assert_true((select location_quality='manually_selected' and impact_points=0
 from manual_response),'manual selection cannot earn precise-location credit');
reset role;
select pg_temp.assert_true((select state='open' from public.missions
 where id='72000000-0000-4000-8000-000000000001'),'manual fix alone does not complete mission');
set local role authenticated;
create temp table precise_response as select * from public.submit_mission_response(
 '72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','intelligence-precise-response',
 51.501234,-0.123455,now(),'Precise near target','{}','{}',10,'device',now());
select pg_temp.assert_true((select location_quality='precise' and impact_points=10
 and spatial_facts->>'insideTargetRadius'='true' from precise_response),'precise response completes and earns credit');
reset role;
select pg_temp.assert_true((select state='completed' from public.missions
 where id='72000000-0000-4000-8000-000000000001'),'precise response completes mission');
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set role='reviewer' where id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
select public.correct_observation_location((select observation_id from initial),51.501234,-0.123,
 10,'device',now(),'Reporter supplied corrected device fix');
select pg_temp.assert_true((select count(*)>0 from public.list_location_audit((select incident_id from initial),100)
 where action='corrected' and observation_id=(select observation_id from initial)),'reviewer sees correction audit');
reset role;
select pg_temp.assert_true((select public.st_x(exact_location::public.geometry)=-0.123
 from private.incident_locations where incident_id=(select incident_id from initial)),'correcting origin updates exact incident anchor');
select pg_temp.assert_true((select spatial_facts->>'distanceFromOrigin'='within_250m'
 from public.observations where id=(select observation_id from inferred_stream)),'derived facts refreshed after correction');
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set role='admin' where id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
select public.set_location_retention_hold((select incident_id from initial),now()+interval '1 year',
 'Research preservation with documented consent');
reset role;
update public.incidents set resolved_at=now()-interval '91 days' where id=(select incident_id from initial);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.get_observation_location((select observation_id from initial))),
 'justified hold preserves exact access');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(public.purge_expired_exact_locations()=0,'active hold prevents purge');
update private.incident_locations set retention_hold_until=now()-interval '1 day'
 where incident_id=(select incident_id from initial);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.get_observation_location((select observation_id from initial))),
 'expired retention prevents exact access before physical purge');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(public.purge_expired_exact_locations()>0,'expired exact points purged');
select pg_temp.assert_true((select exact_location is null and exact_removed_at is not null
 from private.incident_locations where incident_id=(select incident_id from initial)),'incident exact point removed');
select pg_temp.assert_true((select exact_location is null and reported_label is null
 from private.observation_locations where observation_id=(select observation_id from initial)),'observation exact point and private label removed');
select pg_temp.assert_true((select exact_location is null from private.mission_locations
 where mission_id='72000000-0000-4000-8000-000000000001'),'mission exact target removed');
select pg_temp.assert_true((select count(*)>=3 from private.location_audit
 where incident_id=(select incident_id from initial) and action='removed'),'removal audit covers incident, observations and mission');
select pg_temp.assert_true((select location is not null from public.incidents
 where id=(select incident_id from initial)),'approximate history remains after purge');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
  for n in 1..15 loop perform public.consume_location_read_quota('70000000-0000-4000-8000-000000000001','incidents'); end loop;
  begin
    perform public.consume_location_read_quota('70000000-0000-4000-8000-000000000001','incidents');
    raise exception 'Quota allowed excessive request';
  exception when others then
    if sqlerrm<>'Location read limit reached' then raise; end if;
  end;
end $$;
rollback;
