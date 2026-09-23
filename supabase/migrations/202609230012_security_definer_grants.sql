-- Supabase may grant EXECUTE to anon/authenticated explicitly through default
-- privileges. Revoking only PUBLIC does not remove those direct grants.
revoke execute on function public.claim_incident_assessment(uuid, uuid)
  from public, anon;
revoke execute on function public.record_incident_review(
  uuid, uuid, public.review_decision, text
) from public, anon;
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_reviewer() from public, anon;

revoke execute on function public.complete_incident_assessment(
  uuid, integer, jsonb, public.evidence_status, text[], boolean, text, text
) from public, anon, authenticated;
revoke execute on function public.fail_incident_assessment(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.finalize_observation_media(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.generate_assessment_missions(uuid, jsonb)
  from public, anon, authenticated;

-- Trigger functions should only run through their triggers.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;
