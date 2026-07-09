
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_roles_full_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_roles_set_display_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_roles_set_full_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
