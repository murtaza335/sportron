-- 120: get_discover_communities() — popularity-ranked discover list with the caller's role inlined.
-- Additive: get_public_communities() is kept untouched for installed builds.

CREATE OR REPLACE FUNCTION public.get_discover_communities()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  visibility text,
  sport text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  pings_enabled boolean,
  member_count bigint,
  creator_username text,
  creator_avatar_url text,
  my_role text,
  activity_14d bigint,
  popularity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_interests text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT COALESCE(p.sport_interests, '{}') INTO v_interests FROM public.profiles p WHERE p.id = v_uid;

  RETURN QUERY
  SELECT
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility::text, c.sport::text, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    COALESCE(mc.cnt, 0)::bigint AS member_count,
    pr.username AS creator_username,
    pr.avatar_url AS creator_avatar_url,
    me.role::text AS my_role,
    (COALESCE(ma.cnt, 0) + COALESCE(po.cnt, 0))::bigint AS activity_14d,
    round((
      ln(1 + COALESCE(mc.cnt, 0)) * 2
      + ln(1 + COALESCE(ma.cnt, 0) + COALESCE(po.cnt, 0)) * 3
      + CASE WHEN c.sport::text = ANY (v_interests) THEN 1 ELSE 0 END
      + CASE WHEN c.created_at > now() - interval '7 days' THEN 1.5 ELSE 0 END
    )::numeric, 3) AS popularity
  FROM public.communities c
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.community_members m
    WHERE m.community_id = c.id AND m.approval_status = 'approved'
  ) mc ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.community_matches x
    WHERE x.community_id = c.id AND x.approval_status = 'approved'
      AND x.created_at > now() - interval '14 days'
  ) ma ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.community_posts x
    WHERE x.community_id = c.id AND x.created_at > now() - interval '14 days'
  ) po ON true
  LEFT JOIN public.community_members me
    ON me.community_id = c.id AND me.profile_id = v_uid AND me.approval_status = 'approved'
  LEFT JOIN public.profiles pr ON pr.id = c.created_by
  ORDER BY
    (me.profile_id IS NOT NULL) ASC,   -- communities you already belong to sink
    popularity DESC,
    c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_discover_communities() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_discover_communities() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_community_posts_community_created
  ON public.community_posts (community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_matches_community_status_created
  ON public.community_matches (community_id, approval_status, created_at);

NOTIFY pgrst, 'reload schema';
