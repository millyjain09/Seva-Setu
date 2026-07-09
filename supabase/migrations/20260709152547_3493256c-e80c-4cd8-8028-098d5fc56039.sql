
REVOKE EXECUTE ON FUNCTION public.audit_actor_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_govt_schemes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_health_records() FROM PUBLIC, anon, authenticated;
