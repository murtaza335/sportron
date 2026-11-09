# Sportron (T3Seecs) — Bug Report & Fix Plan

Generated: 2026-11-09 · Scope: whole repo (`src/`, `supabase/migrations/`, `supabase/functions/`, `app.json`) · Branch: `dev`

This file is a work queue for an implementing agent. Every item has an ID, severity, exact file references, the root cause, a concrete fix and a way to verify it. Work top-down: **all `SEC-C*` items first**.

---

## Status (updated after the fix pass)

All items below were fixed in order, one commit each (`git log --oneline` shows `fix(<ID>): …`), except where noted.
SQL fixes are migrations **098–119** (next = 120), each verified against a local Postgres replay of the whole migration history with role-based tests (anon / authenticated / service_role). Client fixes pass `npx tsc --noEmit` and `npm run lint` (0 errors, 0 warnings); the web bundle exports.

- [x] SEC-C1 (098) · SEC-C2 (099) · SEC-C3 + SEC-H4 (100) · SEC-C4 (101) · SEC-C5 (102)
- [x] SEC-H1 (103) · SEC-H2 (104) · SEC-H3 + BUG-H6 (105) · SEC-H5 (106) · SEC-H6 (107) · SEC-H7 (108 + client + edge fn) · SEC-H8 (109)
- [x] SEC-M1 (PKCE) · SEC-M2 (edge fns) · SEC-M3 (110) · SEC-M4 (111) · SEC-M5 (112)
- [x] SEC-L1 (113, trigger instead of CHECK) · SEC-L2 (vercel.json)
- [ ] SEC-L3 - **owner action only** (restrict the Firebase/Google API keys in Google Cloud Console; no code change)
- [x] BUG-H1 … H10 (H5=114, H10=115) · BUG-M1 … M19 (M11=116, M15=117, M16=118) · BUG-L1 … L8 (L7=119) · QA-01 … QA-03

**Needs the owner (cannot be done from the repo):**
1. Apply migrations 098-119 to Supabase (in order), then run the smoke test in section 10.
2. `supabase functions deploy send-notification` and `supabase functions deploy send-chat-notification` (SEC-H7 pruning, SEC-M2 preferences), then live-test pushes (chat + in-app, with notifications on and master-off).
3. New **native build** required for BUG-H2 (`userInterfaceStyle`), BUG-L5 (notification icon), BUG-L6 (iOS plist key removed) and SEC-M1 (PKCE sign-in must be tested on a real Android device + web before release).
4. Cloudinary console: restrict the unsigned preset (SEC-L1). Run the audit query in migration 099 and review restricted-community members.
5. Not done (release chores, not bugs): bump `version` + What's New in the 3 places listed in AGENTS.md.

## 0. Ground rules for whoever fixes these (read first)

1. **Backward compatibility is mandatory** (see `AGENTS.md` → "Backward Compatibility"). Installed Play Store builds (v1.0.1 and older) keep calling the same tables/RPCs. Never drop/rename a column or RPC they use. Never change an RPC's signature in place. Add new RPCs instead, and keep the old ones working (possibly with tighter checks).
2. **Migrations**: next number is **`098`**. Put each logical fix in its own numbered file (`098_…`, `099_…`, …). Make them idempotent (`drop policy if exists`, `create or replace`, `drop trigger if exists`). Update `AGENTS.md` ("Next migration number") when done.
3. **Edge functions**: any change under `supabase/functions/` only takes effect after `supabase functions deploy <name>`. After editing one, tell the owner to redeploy it and run a live push test.
4. **RLS silently filters writes.** In Supabase, an `UPDATE`/`DELETE` blocked by RLS returns **no error and 0 rows**. Several bugs below come from this. When a client write must succeed, either call `.select()` and check the row count, or move it into a `SECURITY DEFINER` RPC that raises a real error.
5. Every new `SECURITY DEFINER` function must start with `if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;`, `set search_path = public`, return `TABLE(...)` (not `SETOF RECORD`), and add `revoke all on function … from public, anon;` + `grant execute … to authenticated;` (or `service_role` only for internal ones).
6. Run `npx tsc --noEmit` and `npm run lint` after client changes. Both must stay clean (lint currently has 4 errors, see `QA-01`).

Severity legend: **Critical** = data exposure / auth bypass exploitable today with only the public anon key. **High** = significant security or broken core feature. **Medium** = wrong behaviour users will hit. **Low** = polish, hardening, tech debt.

> **How the security items were verified:** by reading the latest definition of each policy/function in `supabase/migrations/`. I did not test them against the live DB. Each item has a curl/SQL check. Run it against **staging or a local DB** (`docs/tournaments/local-db/`) before and after the fix.

---

## 1. Summary table

| ID | Sev | Area | One-line |
|---|---|---|---|
| SEC-C1 | Critical | Chat / push | `get_chat_push_data` RPC callable by any client → read any chat's last 50 messages + every member's FCM tokens |
| SEC-C2 | Critical | Communities | Anyone can insert themselves as an **approved** member of a **restricted** community |
| SEC-C3 | Critical | Sessions | Users can set their own commitment to `accepted` (bypass creator approval, join chat, overfill sessions) |
| SEC-C4 | Critical | Matches | Match recorder can self-approve; participants can rewrite scores at any time; can insert `approved` directly |
| SEC-C5 | Critical | Posts | `get_community_posts`/`get_community_post_by_id` skip the membership check when `p_user_id` is null; comments RPC has no check |
| SEC-H1 | High | Matches | `get_community_matches` / `get_community_match_by_id` / `get_match_comments` have no membership check and trust client `p_user_id` |
| SEC-H2 | High | Posts | Any authenticated user can like/comment on any post (and read all likes/comments), triggering notifications |
| SEC-H3 | High | Profiles | Users can write their own `streak_count`, `longest_streak`, `completed_sessions`, `total_committed_sessions`, `deleted_at` |
| SEC-H4 | High | Sessions | Participants can set their own `feedback_status='showed_up'` → inflate `completed_sessions` |
| SEC-H5 | High | Chat | `sender_username` / `sender_avatar_url` are client-supplied → impersonation in chat + push banners |
| SEC-H6 | High | Communities | "Pending" member rows give read access to matches/pings and let the user **ping the whole community** |
| SEC-H7 | High | Push | Sign-out never removes the device FCM token → previous user's pushes keep arriving on a shared/handed-over device |
| SEC-H8 | High | Profiles | `public_profiles` view (and many RPCs) likely readable by **anon** (no login) → full user directory dump |
| SEC-M1 | Medium | Auth | OAuth uses implicit flow + accepts any tokens from `t3s://auth/callback` deep link (login-CSRF / token interception) |
| SEC-M2 | Medium | Push | Server ignores `notification_preferences`; "notifications off" only removes one device's token |
| SEC-M3 | Medium | Sessions | No server-side validation of session fields (`expires_at`, `max_participants`, `date_time`, `status`) and no DB capacity guard |
| SEC-M4 | Medium | Chat | Chat INSERT allowed after a session is closed; no DB length limit on `content` |
| SEC-M5 | Medium | Communities | Admin can add any user as a member without consent; admin UPDATE policy lets admins edit win/loss stats |
| SEC-L1 | Low | Uploads | Unsigned Cloudinary preset + arbitrary `avatar_url`/`image_url` strings accepted |
| SEC-L2 | Low | Web | No security headers on Vercel |
| SEC-L3 | Low | Config | `google-services.json` and the Firebase web key are committed → check API key restrictions |
| BUG-H1 | High | Boot | Native splash never hidden when Maintenance / Forced-update screen shows → users see a frozen splash |
| BUG-H2 | High | Theme | `"userInterfaceStyle": "light"` in `app.json` → "System" theme never follows OS dark mode |
| BUG-H3 | High | Communities | Delete Community shown to every admin; non-creator delete silently does nothing but UI navigates away "success" |
| BUG-H4 | High | Communities | Promoted (non-creator) admins have **no Leave button** → stuck in the community forever |
| BUG-H5 | High | Sessions | Participant leaving a full session can't reopen it (RLS blocks `sessions` update silently) |
| BUG-H6 | High | Streaks | `session_joined` streak never updates (creator updates another user's profile → blocked by RLS) |
| BUG-H7 | High | Web | Create Session date/time pickers don't work on web (`@react-native-community/datetimepicker` has no web support) |
| BUG-H8 | High | Push | `FCMInitializer` initializes once per app process → after switching accounts, tokens/listeners belong to the old user |
| BUG-H9 | High | Realtime | `useCommunityPosts` re-subscribes the realtime channel on **every** posts change (deps include `posts`) |
| BUG-H10 | High | Matches | Member stats trigger is `security invoker` → stats only update when an admin approves |
| BUG-M1 | Medium | Feed | Pull-to-refresh on community home doesn't refresh posts |
| BUG-M2 | Medium | Feed | Match pagination never sets `loadingMoreMatches=true` → duplicate page fetches |
| BUG-M3 | Medium | Feed | Posts and matches paginate independently → merged feed out of chronological order; post pages can duplicate |
| BUG-M4 | Medium | Feed | `feedContent` `useMemo` misses `theme`, `id`, `user` → feed doesn't re-theme, stale closures |
| BUG-M5 | Medium | Posts | `PostCard` like count/state never re-syncs with props (realtime updates invisible) |
| BUG-M6 | Medium | Web | `Alert.alert` used in PostCard / CreatePostModal / PostDetailPopup → no dialogs on web (post delete broken on web) |
| BUG-M7 | Medium | Sessions | No "Cancel request" for pending applicants; no "Re-apply" after leaving (spec says allowed) |
| BUG-M8 | Medium | Sessions | Can create a session in the past (time picker unrestricted); client/server 7-day rule mismatch; stale module-level max date |
| BUG-M9 | Medium | Activity | Acting on an already-resolved request shows "No pending requests" error and the card stays in Action Required |
| BUG-M10 | Medium | Profile | Submit enabled while avatar uploads → local `file://` URI saved as `avatar_url` |
| BUG-M11 | Medium | Profile | No username format/length validation (spaces, emoji, 500 chars…); `ilike` treats `_`/`%` as wildcards |
| BUG-M12 | Medium | Auth | Profile load failure (offline / transient) routes an existing user to Onboarding |
| BUG-M13 | Medium | Push | Several notification types are not tap-routable (posts, streaks, legacy match types) |
| BUG-M14 | Medium | Chat | Chat presence heartbeat ignores app background → pushes suppressed while the app is backgrounded with a chat open |
| BUG-M15 | Medium | Matches | Re-approval after dispute double-counts stats (approved→disputed→approved) |
| BUG-M16 | Medium | Feedback | `completed_sessions` increments every time feedback toggles back to `showed_up` |
| BUG-M17 | Medium | Realtime | No refetch on app resume (notifications, chats, community) → stale badges after background |
| BUG-M18 | Medium | Settings | Delete-account copy says "permanently erase" but it's a soft delete |
| BUG-M19 | Medium | Communities | Leaving/deleting a community → `router.back()` lands on a stale screen |
| BUG-L1 | Low | Streak | `isAtRisk` logic inverted (never true when the streak is actually at risk) |
| BUG-L2 | Low | Feed | Pending-match realtime DELETE branch unreachable |
| BUG-L3 | Low | Feed | Ping cooldown interval keeps re-creating every second and never stops |
| BUG-L4 | Low | Notifications | Inbox capped at 100 rows; unread badge undercounts beyond that |
| BUG-L5 | Low | Android | Notification small icon is the full-colour 512px icon (renders as white square) |
| BUG-L6 | Low | iOS | `ios.googleServicesFile` points to a file that doesn't exist (iOS build will fail) |
| BUG-L7 | Low | Sessions | Expired sessions only close when a client happens to call `close_expired_sessions` (no cron) |
| BUG-L8 | Low | Web | `lib/alert.ts` collapses 3+ button dialogs to OK/Cancel on web |
| QA-01 | Low | Lint | 4 lint errors (Reanimated `.value` writes under React Compiler rule) + 17 warnings |
| QA-02 | Low | Dead code | `transferAdmin` (wrong order, unused), `fetchPings` (dead FK embed), `fetchUserSessions`, `MaintenanceContext` |
| QA-03 | Low | Docs | `AGENTS.md` drift (expire chips, transfer admin UI) |

---

## 2. Critical security

### SEC-C1 — `get_chat_push_data` is callable by any client (message + FCM token leak)
- **Files:** `supabase/migrations/067_fix_chat_push_skip_active_readers.sql:6-200` (latest definition), originally `051_consolidate_chat_push_queries.sql`. Caller: `supabase/functions/send-chat-notification/index.ts:89`.
- **Problem:** The function is `SECURITY DEFINER`, has no `auth.uid()`/role check, and no `revoke` was ever issued. Postgres grants `EXECUTE` to `PUBLIC` by default, and Supabase also grants to `anon`/`authenticated`. Anyone can call `POST /rest/v1/rpc/get_chat_push_data` with any `p_chat_id` and get back:
  - the last 50 messages (`sender_username`, `content`, `created_at`) of **any** session or community chat,
  - every recipient's `profile_id` + **`fcm_tokens`** + read cursor.
- **Fix (migration `098_lock_get_chat_push_data.sql`):**
  ```sql
  revoke all on function public.get_chat_push_data(uuid, text, uuid, uuid, text, uuid) from public, anon, authenticated;
  grant execute on function public.get_chat_push_data(uuid, text, uuid, uuid, text, uuid) to service_role;
  ```
  Also add a defensive guard as the first statement of the body (re-create with `create or replace`, same signature, body copied from 067):
  ```sql
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres','service_role') then
    raise exception 'NOT_ALLOWED';
  end if;
  ```
  Do the same `revoke … from public, anon, authenticated` for other internal helpers that lack it: `_notification_already_exists(...)` (068) and `insert_notification` (already done in 069, verify).
- **Backward compat:** No app build calls this RPC (only the edge function, which uses the service-role client). Safe.
- **Verify:** `curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_chat_push_data" -H "apikey: $ANON" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' -d '{"p_message_id":"00000000-0000-0000-0000-000000000000","p_chat_type":"community","p_chat_id":"<some community id>","p_sender_id":"00000000-0000-0000-0000-000000000000","p_sender_name":"x","p_reply_to_id":null}'` → must return 401/403/`permission denied`. Then send a real chat message and confirm the push still arrives.

### SEC-C2 — Restricted community bypass (self-insert as approved member)
- **Files:** `supabase/migrations/044_fix_community_members_insert_privilege_escalation.sql:16-23` (policy "Users can join public communities"); client `src/services/communities.ts:378` (`joinCommunity`), `src/services/communities.ts:869` (`respondToInvite`).
- **Problem:** The policy only checks `auth.uid() = profile_id and role='member' and approval_status='approved'`. It **never checks `communities.visibility = 'public'`**. Any user can `POST /rest/v1/community_members {community_id:<restricted>, profile_id:<me>, role:'member', approval_status:'approved'}` and instantly read the restricted community's chat, posts, members, matches.
- **Complication:** the legacy invite-accept path `respondToInvite()` (still used by old builds) has the **invitee** insert their own approved row, relying on this loose policy. A plain visibility check would break invite acceptance for restricted communities.
- **Fix (migration `099_fix_community_member_self_insert.sql`):**
  ```sql
  drop policy if exists "Users can join public communities" on public.community_members;
  create policy "Users can join public communities"
    on public.community_members for insert to authenticated
    with check (
      auth.uid() = profile_id and role = 'member' and approval_status = 'approved'
      and (
        exists (select 1 from public.communities c
                where c.id = community_members.community_id and c.visibility = 'public')
        -- invited users (legacy respondToInvite path: invite is updated to accepted first, then this insert)
        or exists (select 1 from public.community_invites i
                   where i.community_id = community_members.community_id
                     and i.invitee_id = auth.uid()
                     and i.status in ('pending','accepted'))
      )
    );
  ```
  Then audit existing data: list `community_members` rows in restricted communities with no approved join request, no invite, and not the creator. Give that list to the owner; don't delete automatically.
  ```sql
  select cm.* from community_members cm join communities c on c.id = cm.community_id
  where c.visibility = 'restricted' and cm.profile_id <> c.created_by
    and not exists (select 1 from community_join_requests r where r.community_id = cm.community_id and r.user_id = cm.profile_id and r.status = 'approved')
    and not exists (select 1 from community_invites i where i.community_id = cm.community_id and i.invitee_id = cm.profile_id and i.status = 'accepted');
  ```
- **Note:** a public community switched to restricted later (edit screen) keeps its members. That's fine.
- **Verify:** as a non-member, the curl insert into a restricted community → RLS error. Joining a public community from the app still works. Accepting an invite to a restricted community (Activity → Invites) still works.

### SEC-C3 — Self-accepting a session commitment
- **Files:** `supabase/migrations/002_whosin_enhanced_schema.sql:289-311` (commitments policies), client `src/services/sessions.ts:269` (`commitToSession`), `src/services/sessions.ts:383` (`uncommitFromSession`).
- **Problem:**
  - INSERT policy: `with check (auth.uid() = user_id)`. A user can insert `status:'accepted'` directly.
  - UPDATE policy "Users can update their own commitments": `using (auth.uid() = user_id)` with no column/value restriction. A user can flip their own `pending`/`rejected` row to `accepted`.
  - Either way they get session chat access (RLS on `session_messages` keys off `accepted`), bypass `max_participants`, and inflate `total_committed_sessions`. Combined with SEC-H5 they can then post as anyone.
- **Fix (migration `100_harden_commitments.sql`):** add a `BEFORE INSERT OR UPDATE` trigger that enforces the state machine based on who the caller is.
  ```sql
  create or replace function public.guard_commitment_write() returns trigger
  language plpgsql security definer set search_path = public as $$
  declare v_creator uuid; v_max int; v_status text; v_accepted int;
  begin
    if auth.uid() is null then return new; end if;  -- service role / internal
    select created_by, max_participants, status into v_creator, v_max, v_status
      from sessions where id = new.session_id;
    if tg_op = 'INSERT' then
      if new.user_id <> auth.uid() then raise exception 'NOT_ALLOWED'; end if;
      if new.user_id = v_creator then raise exception 'CANNOT_JOIN_OWN_SESSION'; end if;
      if v_status not in ('open') then raise exception 'SESSION_NOT_OPEN'; end if;
      new.status := 'pending'; new.feedback_status := null; new.feedback_provided_by := null;
      return new;
    end if;
    -- UPDATE
    if auth.uid() = new.user_id and auth.uid() <> v_creator then
      -- participant may only leave (pending/accepted -> left)
      if new.status is distinct from old.status and not (new.status = 'left' and old.status in ('pending','accepted')) then
        raise exception 'NOT_ALLOWED';
      end if;
      if new.feedback_status is distinct from old.feedback_status
         or new.feedback_provided_by is distinct from old.feedback_provided_by
         or new.session_id <> old.session_id or new.user_id <> old.user_id then
        raise exception 'NOT_ALLOWED';
      end if;
    elsif auth.uid() = v_creator then
      if new.session_id <> old.session_id or new.user_id <> old.user_id then raise exception 'NOT_ALLOWED'; end if;
      if new.status = 'accepted' and old.status <> 'accepted' and v_max is not null then
        select count(*) into v_accepted from commitments where session_id = new.session_id and status = 'accepted';
        if v_accepted >= v_max then raise exception 'SESSION_FULL'; end if;
      end if;
    else
      raise exception 'NOT_ALLOWED';
    end if;
    return new;
  end $$;
  drop trigger if exists trg_guard_commitment_write on public.commitments;
  create trigger trg_guard_commitment_write before insert or update on public.commitments
    for each row execute function public.guard_commitment_write();
  ```
  Use a `select … for update` on the `sessions` row before counting, so two concurrent approvals can't both pass the capacity check.
  Also add a `with check` to both UPDATE policies (the same expression as `using`).
- **Backward compat:** existing clients insert `status:'pending'` and update to `left` / creator updates to `accepted|rejected` + feedback. All remain allowed. Map the new error codes to friendly copy in `SessionDetailPopup.tsx:224` / `approveCommitment` callers (`SESSION_FULL` → "This session is full").
- **Verify:** curl `PATCH /rest/v1/commitments?id=eq.<mine>` with `{"status":"accepted"}` as the participant → error. Normal apply/approve/reject/leave flows in the app still work.

### SEC-C4 — Community match self-approval & score tampering
- **Files:** `supabase/migrations/002_whosin_enhanced_schema.sql:397-414` (insert + "Match participants can update approval status"), `061_validate_community_match_participants.sql` (BEFORE INSERT only), `src/services/communities.ts:742` (`approveCommunityMatch`), `:763` (`disputeCommunityMatch`).
- **Problem:**
  1. The UPDATE policy `using (auth.uid() = opponent_id or auth.uid() = opponent_partner_id or auth.uid() = recorded_by)` lets the **recorder** set `approval_status='approved'` on their own match. That defeats the opponent-approval workflow and fires the stats trigger.
  2. Any of them can change `player_score`/`opponent_score`/participants after approval (no column restriction, no `with check`).
  3. INSERT doesn't force `approval_status='pending'`, so a member can insert an already-`approved` match. It shows in the feed with no opponent consent. Stats don't update, because the trigger is `after update`.
- **Fix (migration `101_harden_community_matches.sql`):**
  - In `validate_community_match_participants()` (061) add `new.approval_status := 'pending';` for INSERT when `auth.uid() is not null`.
  - New `BEFORE UPDATE` trigger `guard_community_match_update()`:
    - if `auth.uid()` is null → allow (service/internal).
    - Immutable for everyone: `community_id, recorded_by, player_id, player_partner_id, opponent_id, opponent_partner_id, sport, player_score, opponent_score, team_a_name, team_b_name, created_at` (raise `NOT_ALLOWED` if any changed).
    - `approval_status` change allowed only if `old.approval_status = 'pending'` and `auth.uid()` is on the **opposite side** from the recorder. If the recorder is player/partner, only `opponent_id`/`opponent_partner_id` can act (and vice-versa).
  - Replace the UPDATE policy with one that includes `with check` (same as `using`).
- **Backward compat:** the app only ever updates `approval_status` from the opponent (Activity card / pending-matches screen). Make sure the UI doesn't show approve buttons to the recorder: check `src/app/community/[id]/pending-matches.tsx` and `MatchDetailPopup.tsx`. Hide them if `recorded_by === user.id`.
- **Verify:** as recorder, `PATCH community_matches?id=eq.X {"approval_status":"approved"}` → error. As opponent → works and stats update once.

### SEC-C5 — Community post RPCs skip membership check
- **Files:** `supabase/migrations/074_fix_community_posts_rpc_return_types.sql:36-50` (`get_community_posts`), `:110-135` (`get_community_post_by_id`), `076_fix_community_post_comments_rpc.sql:15-40` (`get_community_post_comments`). Client: `src/services/communities.ts` `fetchCommunityPosts`, `fetchCommunityPostById`, `fetchCommunityPostComments`.
- **Problem:** membership is checked against the **client-supplied `p_user_id`**, and only `if not v_is_member and p_user_id is not null then return`. Calling with `p_user_id: null` (or someone else's id) returns every post of any community, including restricted ones. `get_community_post_comments` has no check at all.
- **Fix (migration `102_fix_community_post_rpcs.sql`):** `create or replace` all three with the **same signatures**, but:
  - first line `if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;`
  - membership check uses `auth.uid()` (ignore `p_user_id` for authz; keep the param for `is_liked_by_user` but compute it with `auth.uid()` too).
  - return nothing if `auth.uid()` isn't an `approved` member of the post's community.
  - comments RPC: look up the post's `community_id`, apply the same check.
  - add `revoke … from public, anon; grant execute … to authenticated;`
- **Backward compat:** same signatures/return columns; old builds pass their own id anyway.
- **Verify:** call `rpc/get_community_posts` with `p_user_id:null` for a community you're not in → empty. App feed still loads for members.

---

## 3. High security

### SEC-H1 — Match read RPCs leak restricted communities & pending matches
- **Files:** `supabase/migrations/050_add_community_match_rpcs.sql:11-104` (`get_community_matches`), `:106-188` (`get_community_match_by_id`), `048_add_production_rpc_functions.sql` (`get_match_comments`, ~line 210-230).
- **Problem:** `SECURITY DEFINER`, no `auth.uid()` membership check. Any user can read all matches/comments of any community. The "hide pending matches" filter trusts `p_user_id`, so passing another user's id reveals their pending matches.
- **Fix (migration `103_fix_match_read_rpcs.sql`):** same pattern as SEC-C5. Same signatures. Require `auth.uid()` to be an approved member of `p_community_id` (or of the match's community). Use `auth.uid()` instead of `p_user_id` in the pending filter and `is_liked_by_user`. Revoke from `public, anon`.
- **Verify:** non-member call → empty; member feed unchanged.

### SEC-H2 — Post likes/comments open to everyone
- **Files:** `supabase/migrations/073_add_community_posts.sql:75-125`.
- **Problem:** `community_post_likes` / `community_post_comments` SELECT is `using (true)`, INSERT only checks `auth.uid() = profile_id`. A non-member can comment on/like any post (if they know/guess a post id, e.g. from SEC-C5). That triggers `community_post_liked|commented` notifications + pushes to the author (spam vector), and lets them read every comment.
- **Fix (migration `104_restrict_post_likes_comments.sql`):** replace the 4 policies with membership-based ones:
  ```sql
  -- helper (security definer, stable) to avoid RLS recursion
  create or replace function public.is_post_community_member(p_post_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from community_posts p join community_members m
                   on m.community_id = p.community_id
                   where p.id = p_post_id and m.profile_id = auth.uid() and m.approval_status = 'approved');
  $$;
  revoke all on function public.is_post_community_member(uuid) from public, anon;
  grant execute on function public.is_post_community_member(uuid) to authenticated;
  ```
  SELECT `using (public.is_post_community_member(post_id))`; INSERT `with check (auth.uid() = profile_id and public.is_post_community_member(post_id))`. Also add `with check (auth.uid() = profile_id)` to the comment UPDATE policy, and a `char_length(content) between 1 and 1000` check constraint (as `NOT VALID` then `VALIDATE`, so old rows can't block the migration).
  Do the same review for `community_match_likes/comments` (018). They check membership but not `approval_status='approved'`, see SEC-H6.

### SEC-H3 — Profile counters/streak are client-writable
- **Files:** `supabase/schema.sql:58-61` (policy "Users can update their own profile", `using (auth.uid() = id)` with no column limits). Client writers: `src/services/streak.ts:102` (`updateStreak`), `src/services/profiles.ts` (`reEnableAccount`, `softDeleteAccount`).
- **Problem:** a user can `PATCH /rest/v1/profiles?id=eq.<me>` with `{"streak_count":999,"longest_streak":999,"completed_sessions":500,"total_committed_sessions":500}`. These are shown publicly (`public_profiles`, `StreakDisplay`, session applicant reliability). Setting `streak_count` to 3/7/14… also fires milestone notifications.
- **Fix (two steps, keep old builds working):**
  1. Migration `105_server_side_streaks.sql`: create `public.record_streak_activity(p_activity text)` (`SECURITY DEFINER`, `auth.uid()` guard, computes the streak in SQL using UTC dates, exactly like `computeStreak` in `src/services/streak.ts:60-100`). Also call the same logic from **DB triggers**: `after insert on community_matches` (recorder), `after insert on sessions` (creator), and `after update of status on commitments when new.status='accepted'` (participant). That also fixes BUG-H6.
  2. Add a `BEFORE UPDATE` trigger on `profiles` that, when `auth.uid() is not null` (client call), **silently keeps the old values** of `streak_count, longest_streak, last_activity_date, streak_updated_at, completed_sessions, total_committed_sessions` (`new.x := old.x`). Do **not** raise. Old builds still call `updateStreak` and must not error, and the server triggers now own the values. `SECURITY DEFINER` trigger functions run as owner (`auth.uid()` is still the caller), so inside your own trigger functions bypass the guard by `set_config('app.bypass_profile_guard','on',true)` before the update and check it in the guard.
  3. Client: make `updateStreak` a no-op (or call the RPC) and remove the calls in `communities.ts`/`sessions.ts` once triggers exist. Keep the export so nothing breaks.
- Also restrict `deleted_at`: allow the client to set it only to `now()` (soft delete) or `null` (re-enable). That's acceptable as-is; document it.

### SEC-H4 — Participants can self-report attendance
- **Files:** same commitments UPDATE policy as SEC-C3; trigger `handle_commitment_feedback` in `033_add_total_committed_on_accept.sql:14-35`.
- **Problem:** the participant can set their own `feedback_status='showed_up'` → `completed_sessions + 1`.
- **Fix:** covered by the SEC-C3 trigger (participants can't touch `feedback_*`). Additionally, the creator may only set feedback when the session status is `closed|completed|cancelled` and the commitment is `accepted`.

### SEC-H5 — Chat sender identity is client-controlled
- **Files:** `src/services/chat.ts:182-215` (`insertChatMessage` sends `sender_username`, `sender_avatar_url`), `supabase/migrations/026_add_chat_sender_snapshot.sql`, `027_add_community_chat.sql` (no trigger sets them), push body `supabase/functions/send-chat-notification/index.ts:85,117,145,167`.
- **Problem:** a member can insert `{sender_id: me, sender_username: "admin_of_club", content: "..."}`. Every bubble and every push banner shows the forged name.
- **Fix (migration `106_chat_sender_snapshot_trigger.sql`):** `BEFORE INSERT` trigger on both `session_messages` and `community_messages`:
  ```sql
  create or replace function public.set_chat_sender_snapshot() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    select username, avatar_url into new.sender_username, new.sender_avatar_url
      from profiles where id = new.sender_id;
    return new;
  end $$;
  ```
  Also block changing `sender_*`/`sender_id`/`*_id` in the existing edit trigger (039) so edits can't rewrite identity. Make sure this new trigger runs **before** the pg_net push trigger (the push trigger is AFTER INSERT, so it already reads the corrected `NEW`). Client code can keep sending the fields; they'll be overwritten.
- **Verify:** curl-insert a message with a fake `sender_username` → stored row has the real username.

### SEC-H6 — "Pending" community_members rows grant access
- **Files:** `044_…:26-33` (policy "Users can request to join restricted communities" lets anyone insert a `pending` member row into **any** community), `002_…:388-433` (matches SELECT/INSERT, pings SELECT/INSERT use `community_id in (select community_id from community_members where profile_id = auth.uid())` with **no `approval_status='approved'`**), `018_…:50-115` (match likes/comments, same issue), `002_…:326-336` & `:441-470` (admin checks without `approval_status`). Client: `src/app/community/[id].tsx:91` (`isMember = !!membership` also treats pending as member), `src/services/communities.ts:306` (`fetchCommunityMember` returns any status).
- **Problem:** inserting a `pending` row lets a user read all pings and matches of a restricted community, and **send pings to every member** (push spam; the 15-min cooldown is per sender, so many accounts = many pings). The app uses `community_join_requests` for requests now; the pending-member path is legacy.
- **Fix (migration `107_require_approved_membership.sql`):**
  - Drop policy "Users can request to join restricted communities" on `community_members` (verify no current client inserts `approval_status:'pending'`: `grep -rn "approval_status: 'pending'" src` → none today). If old builds might, keep it but add `exists(... visibility='restricted')`. The pending row still grants nothing once the policies below require `approved`.
  - Recreate pings / community_matches / community_match_likes / community_match_comments SELECT+INSERT policies with `… and approval_status = 'approved'`.
  - Add `and approval_status='approved'` to every admin check (`role='admin'`).
- Client: `src/app/community/[id].tsx:91` → `const isMember = membership?.approval_status === 'approved';`. Do the same in `community/[id]/info.tsx`, `members.tsx`, and anywhere else `!!membership` is used (`grep -rn "!!membership" src`).

### SEC-H7 — FCM token not removed on sign-out
- **Files:** `src/services/auth.ts:57-62` (`signOut`), callers `src/app/(tabs)/profile.tsx:130-140`, `src/app/settings.tsx:85`. Token storage `src/services/profiles.ts` (`addFCMToken`/`removeFCMToken`), `src/services/fcm.ts:141-190`.
- **Problem:** after sign-out the device token stays in the old user's `profiles.fcm_tokens`. User A signs out, B signs in on the same phone: **both** profiles now contain the token, so B's phone receives A's chat messages (full message text in the banner). Tokens also accumulate forever (see also SEC-M2 / pruning).
- **Fix:**
  1. In `signOut()` (or a new `signOutAndCleanup()` used by both callers): on native, `const token = await messaging().getToken()` → `await removeFCMToken(userId, token)` **before** `supabase.auth.signOut()` (needs the session for RLS). Wrap in try/catch, never block sign-out. On web, use the web token helper in `src/utils/pushNotifications.js` / `src/lib/firebase.ts`.
  2. Server-side: migration `108_dedupe_fcm_tokens.sql` with a `SECURITY DEFINER` RPC `claim_fcm_token(p_token text)` that removes `p_token` from **every other** profile's `fcm_tokens` and adds it to `auth.uid()`'s. Call it from `saveFCMTokenToProfile` (`src/services/fcm.ts`) instead of read-modify-write (which also races). Keep `addFCMToken` for old code paths.
  3. In `supabase/functions/_shared/fcm.ts:217-260` (`pushToTokens`): when FCM responds 404 `UNREGISTERED` / 400 `INVALID_ARGUMENT` for a token, collect it and remove it from `profiles.fcm_tokens` (service role). **Redeploy `send-notification` and `send-chat-notification`** after this change.

### SEC-H8 — `public_profiles` and RPCs probably exposed to `anon`
- **Files:** `supabase/migrations/046_fix_critical_rls_vulnerabilities.sql:24-42` (view, no grants/revokes), plus all `SECURITY DEFINER` RPCs without `revoke … from anon` (e.g. `get_open_sessions`, `get_public_communities`, `get_community_by_id`, `close_expired_sessions`, `get_community_admin_ids`).
- **Problem:** Supabase's default privileges grant `SELECT` on new views and `EXECUTE` on new functions to `anon`. The view is not `security_invoker`, so it bypasses `profiles` RLS. With just the anon key (public, shipped in the web bundle), anyone can `GET /rest/v1/public_profiles?select=*` and dump every username, bio, avatar, `last_activity_date`, `deleted_at`. `close_expired_sessions` can be spammed anonymously.
- **Verify first:** `curl "$SUPABASE_URL/rest/v1/public_profiles?select=id,username&limit=5" -H "apikey: $ANON"` (no Authorization header). If rows come back, apply the fix.
- **Fix (migration `109_revoke_anon.sql`):**
  ```sql
  revoke all on public.public_profiles from anon;
  grant select on public.public_profiles to authenticated;
  -- for each client RPC:
  revoke execute on function public.get_open_sessions() from public, anon;
  grant execute on function public.get_open_sessions() to authenticated;
  -- …repeat for every get_* / close_expired_sessions / get_community_admin_ids
  ```
  Generate the list with `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute');`. Keep anything the logged-out web pages truly need (`site_config` read, maybe `get_public_communities` for `/discover` if it's used before login; check `src/app/get.tsx`, `android.tsx`, `login.tsx`).
  Consider removing `last_activity_date`/`deleted_at` from the view. Old clients `select('*')` on the view, so **only remove columns no client reads**: `grep -rn "last_activity_date\|deleted_at" src` first. `StreakDisplay` may need `last_activity_date`.

---

## 4. Medium security

### SEC-M1 — OAuth implicit flow / deep-link token injection
- **Files:** `src/services/auth.ts:13-55`, `src/app/auth/callback.tsx:15-45`, `src/lib/supabase.ts:58-67`.
- **Problem:** tokens come back in the URL fragment (implicit flow). On Android any app can register the `t3s://` scheme and intercept them. Also `auth/callback.tsx` calls `setSession` with whatever `access_token`/`refresh_token` arrive in the deep link, so a malicious link `t3s://auth/callback#access_token=<attacker>&refresh_token=<attacker>` silently logs the victim into the attacker's account (login CSRF). The victim might then post or upload personal info there.
- **Fix:** switch to PKCE: `createClient(…, { auth: { flowType: 'pkce', … } })`. In `signInWithGoogle`, after `openAuthSessionAsync` success, read `code` from the URL and call `supabase.auth.exchangeCodeForSession(code)` (the verifier is stored by the client, so an injected code without our verifier fails). In `callback.tsx`, only handle `code` (and only when a sign-in is in progress, e.g. a flag set in `signInWithGoogle`). Ignore raw `access_token` params. Keep web working (`detectSessionInUrl` handles PKCE on web). Test Google login on Android + web after.

### SEC-M2 — Notification preferences not enforced server-side
- **Files:** `supabase/functions/send-notification/index.ts:52-66` (reads only `fcm_tokens`), `supabase/functions/streak-cron/index.ts:98,177` (selects `notification_preferences` but never uses it), `src/app/(tabs)/profile.tsx:78-110`, `src/app/settings.tsx:30-60` (master toggle writes all prefs false + removes **this device's** token only).
- **Problem:** turning notifications off on device A still pushes to device B / web. Per-type prefs (`NotificationPreferences`, 33 keys) do nothing.
- **Fix:**
  - `send-notification`: select `fcm_tokens, notification_preferences`. Map `notification.type` → pref key (put the map in `_shared/fcm.ts`, mirroring `DEFAULT_NOTIFICATION_PREFERENCES` keys in `src/types/index.ts`). Skip the push if the pref is explicitly `false`. Missing key = default on, for backward compat.
  - `send-chat-notification` / `get_chat_push_data`: filter out recipients whose chat pref is false.
  - `streak-cron`: honour `streak_reminders`-type keys.
  - **Redeploy all three functions.**
  - Inside the app, keep the in-app inbox row (that's fine); only skip the push.

### SEC-M3 — Session fields not validated by the DB
- **Files:** `002_…:261-274` (sessions INSERT/UPDATE policies), `063_set_session_expires_at_default.sql` (only fills NULL), client checks in `src/services/sessions.ts:205-245`.
- **Problem:** via the API a user can create sessions with `expires_at` = year 9999 (never closes), `max_participants` = 100000 or 0, `date_time` months ahead or in the past, `status='full'`, and a 10 KB title. Deleting a session with accepted participants is only blocked client-side (`deleteSession` `sessions.ts:459`).
- **Fix (migration `110_session_constraints.sql`):** `BEFORE INSERT OR UPDATE` trigger (skip when `auth.uid() is null`):
  - INSERT: force `status='open'`; require `date_time between now() - interval '5 minutes' and now() + interval '8 days'`; clamp `expires_at` to `[date_time, date_time + interval '7 days']`; `max_participants between 1 and 50`; `char_length(title) <= 40`; `char_length(description) <= 1000`.
  - UPDATE by creator: same ranges; `status` only to `closed|completed|cancelled|open|full`.
  - `BEFORE DELETE`: raise if any `commitments.status='accepted'` exists.
  - Add check constraints as `NOT VALID` so existing rows don't break.

### SEC-M4 — Chat writes after session close; no length cap in DB
- **Files:** `021_add_session_chat.sql:51-69` (INSERT policy has no status check), `src/services/chat.ts:351-375` (client-only `isMessageOpen` check).
- **Fix (migration `111_chat_constraints.sql`):** add `and s.status in ('open','full')` to the session chat INSERT policy. Add `check (char_length(content) between 1 and 1000) not valid` on both message tables. Validate that `reply_to_id` belongs to the same chat (BEFORE INSERT trigger). Otherwise a user can send "X replied to you" pushes to authors in other chats via `get_chat_push_data`'s reply target lookup.

### SEC-M5 — Admin powers too broad
- **Files:** `016_allow_admins_to_add_members.sql:15-25` (admin can insert **any** user, any role, without consent → bypasses invites), `002_…:356-366` ("Admins can manage community members" lets admins edit `wins/losses/matches_played/win_ratio` of anyone).
- **Fix:** restrict the admin INSERT policy to rows where a pending join request from that user exists (`community_join_requests.status in ('pending','approved')`), `role='member'`. Add a `BEFORE UPDATE` trigger on `community_members` that only allows `role` changes from clients (stats columns immutable when `auth.uid() is not null`, same bypass pattern as SEC-H3, because the stats trigger also updates them).

---

## 5. Low security / hardening

- **SEC-L1 — Uploads** (`src/lib/cloudinary.ts:38-120`): the unsigned preset lets anyone upload to the Cloudinary account. In the Cloudinary console, restrict the preset: allowed formats `jpg,png,webp`, max file size (~5 MB), fixed folder, incoming transformation (limit to 1280px), optional moderation. Server-side, add a check constraint/trigger that `profiles.avatar_url`, `communities.image_url`, `community_posts.image_url` start with `https://res.cloudinary.com/<cloud_name>/`. Today any URL (tracking pixels, NSFW hosts) can be set via the API.
- **SEC-L2 — Web headers** (`vercel.json`): add `headers` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Permissions-Policy`. Test that Firebase messaging SW and Google OAuth still work.
- **SEC-L3 — Committed Firebase config** (`google-services.json`, `public/firebase-messaging-sw.js:5`): these keys are public by design, but in Google Cloud Console restrict the API key to the Android package + SHA-1 and the web domain(s). No code change.

---

## 6. Functional / UI-UX bugs — High

### BUG-H1 — Maintenance & forced-update screens hidden behind the native splash
- **Files:** `src/app/_layout.tsx:21` (`SplashScreen.preventAutoHideAsync()`), `:51` (the only `hideAsync()`, inside `RootNavigator`), `:368-392` (Maintenance / ForcedUpdate early returns never mount `RootNavigator`).
- **Problem:** when maintenance is on or the version is too old, `hideAsync()` is never called. The native splash stays forever, so users never see the message or the Update button. Also the `maintenanceActive === null` placeholder `<View/>` has no background (white flash in dark mode), and the config query has no timeout (a hung request means an endless splash).
- **Fix:** in `RootLayout`, call `SplashScreen.hideAsync()` in an effect when `maintenanceActive === true || !versionOk`. Wrap the `site_config` query in a timeout (e.g. `Promise.race` with 5 s). On timeout/error, fail open (`setMaintenanceActive(false)`), as `services/config.ts` intends. Give the placeholder view a dark background matching the splash (`#000000`, per `app.json` splash config).
- **Verify:** enable maintenance via `maintainence-toggle.txt` SQL → app shows `MaintenanceScreen`.

### BUG-H2 — "System" theme never goes dark on native
- **Files:** `app.json:9` (`"userInterfaceStyle": "light"`), `src/contexts/ThemeContext.tsx:22,56`.
- **Problem:** with `light`, React Native's `useColorScheme()` always returns `'light'`, so the System option is effectively Light. The Dark option works because it doesn't use the OS value.
- **Fix:** set `"userInterfaceStyle": "automatic"` (requires a new native build, since this is a config change). Then check that the status bar style (`_layout.tsx:80`) and any hard-coded light colours look right in dark mode.

### BUG-H3 — Delete Community for non-creator admins silently fails
- **Files:** `src/app/community/[id]/info.tsx:184-205` (`handleDelete`), `:536-546` (button shown for any `isAdmin`), `src/services/communities.ts:273-281` (`deleteCommunity` doesn't check affected rows), RLS `002_…:338-341` (creator only).
- **Problem:** a promoted admin taps Delete → RLS filters the delete to 0 rows, there's no error, and the app navigates back as if it worked. The community is still there.
- **Fix:**
  - Show Delete only when `community.created_by === user.id`.
  - In `deleteCommunity`, use `.delete().eq('id', id).select('id')`. If `data.length === 0`, throw `new Error('Only the creator can delete this community.')`.
  - Surface the 065 trigger message ("Cannot delete community with N other members…") as-is (already passes through `e.message`).
  - Apply the same "check affected rows" pattern to `removeMember`, `promoteToAdmin`, `updateCommunity`, `setPingsEnabled`, `leaveCommunity` (`communities.ts`).

### BUG-H4 — Non-creator admins can't leave
- **Files:** `src/app/community/[id]/info.tsx:548` (`{!isAdmin && (<Leave…/>)}`), `064_prevent_last_admin_leave.sql`.
- **Problem:** after being promoted, a user has no Leave button anywhere.
- **Fix:** show Leave for everyone except the creator (`community.created_by !== user.id`). Keep Delete for the creator. Migration 064 already blocks the last admin from leaving; surface its error message.

### BUG-H5 — Leaving a full session doesn't reopen it
- **Files:** `src/services/sessions.ts:383-410` (`uncommitFromSession` updates `sessions.status` as the participant → RLS silently ignores it).
- **Fix:** move it to the DB. Migration: `AFTER UPDATE OF status ON commitments` trigger (`SECURITY DEFINER`). When a row leaves `accepted`, and the session is `full` and accepted count < max → set the session to `open`. Similarly, set `full` when it reaches capacity, which lets you drop the client update in `approveCommitment` (`sessions.ts:340-352`). Keep the client code harmless (it'll just no-op).

### BUG-H6 — `session_joined` streak never counts
- **Files:** `src/services/sessions.ts:357` (`updateStreak(commitment.user_id, …)` runs as the **creator**). `src/services/streak.ts:111-131` reads/updates another user's `profiles` row → own-row RLS blocks it (select returns error, so it's a no-op).
- **Fix:** covered by SEC-H3 step 1 (DB trigger on commitment accepted). Remove the client call afterwards.

### BUG-H7 — Create Session date/time broken on web
- **Files:** `src/app/create-session.tsx:2,310-370` uses `@react-native-community/datetimepicker`, which has no web implementation. `src/components/tournaments/DateTimeField.tsx:23-60` already has a web `datetime-local` fallback.
- **Fix:** on web, render the date+time with `DateTimeField` (or a shared extracted component), with `min` = now and `max` = now + 7 days. Keep native behaviour unchanged.

### BUG-H8 — FCM state tied to the first user of the process
- **Files:** `src/components/FCMInitializer.tsx:12-21` (`initializedRef` never resets), `src/hooks/useFCM.ts:173-290` (`initialize` is `async` and returns a cleanup function that is thrown away; listeners are never removed).
- **Problem:** sign out → sign in as another user without killing the app: `initialize()` doesn't run again, so the new user's token isn't saved. The token-refresh listener still saves to the **old** user's id, and foreground/response listeners stay duplicated.
- **Fix:** keep the cleanup function in a ref. Re-run `initialize` when `user.id` changes (effect keyed on `user?.id`). On user change/unmount, call the stored cleanup and reset the ref. Combine this with SEC-H7 token removal on sign-out.

### BUG-H9 — Posts realtime channel churn
- **Files:** `src/hooks/useCommunityPosts.ts:66-155` (deps `[communityId, userId, posts]`; filter `post_id=in.(${posts.map…})`).
- **Problem:** every like/comment/new post changes `posts` → the channel is torn down and recreated, events in between are lost, and the websocket churns. With 0 posts the filter is `post_id=in.()` (invalid).
- **Fix:** split it into two effects. (1) `community_posts` channel keyed only on `[communityId, userId]`. (2) Likes/comments: don't filter by post id list. Rely on RLS (after SEC-H2) and ignore events for post ids not in state (check via a `postsRef`). Or subscribe once with no filter and ignore unknown ids. Use a unique topic per subscription (see the pattern in `useChat.ts:17`).

### BUG-H10 — Member stats only update when an admin approves
- **Files:** `supabase/migrations/038_fix_community_member_stats.sql:8-60` (`handle_approved_community_match` is `security invoker`). It updates other members' `community_members` rows, which the approving opponent (non-admin) can't update under RLS → 0 rows updated, so leaderboards (`community_leaderboard` view) stay stale.
- **Verify:** approve a match as a non-admin opponent and check `community_members.wins` for both players.
- **Fix:** migration: `create or replace` the function as `security definer set search_path = public` (body unchanged). Then re-run the backfill block from 038 (lines 62-110) once to repair counts.

---

## 7. Functional / UI-UX bugs — Medium

### BUG-M1 — Pull-to-refresh doesn't reload posts
- **File:** `src/app/community/[id].tsx:852-858`. `onRefresh` calls `refresh()` (community) + `loadMatches(1)`, but not `refreshPosts()`. `refreshing={loading}` is the community loading flag, which is never true on refresh, so the spinner doesn't show.
- **Fix:** `onRefresh={async () => { setPullRefreshing(true); await Promise.all([refresh(), refreshPosts(), loadMatches(1)]); setPullRefreshing(false); }}` with a local `pullRefreshing` state for `refreshing`.

### BUG-M2 — Match "load more" fires repeatedly
- **File:** `src/app/community/[id].tsx:145-166` (`loadMatches` only ever sets `loadingMoreMatches(false)`), `:844-851` (`onScroll` with no `scrollEventThrottle`).
- **Fix:** at the start of an append load, `setLoadingMoreMatches(true)` (and guard with a ref, so two scroll events in the same frame don't both pass). Add `scrollEventThrottle={16}` to the `ScrollView`.

### BUG-M3 — Merged feed ordering / duplicates
- **Files:** `src/app/community/[id].tsx:283-320` (`combinedFeed` merges posts pages of 20 with matches pages of 10), `src/hooks/useCommunityPosts.ts:30` (append without dedupe; realtime inserts shift offsets → duplicate keys).
- **Fix (minimum):** dedupe on append in `useCommunityPosts` (like `loadMatches` does). Only render merged items newer than `max(oldestLoadedPost.created_at, oldestLoadedMatch.created_at)` while the other source still `hasMore`, so items from an unloaded page can't be skipped. **Better:** a single RPC `get_community_feed(p_community_id, p_before timestamptz, p_limit int)` (new, additive) returning a union of posts + approved matches with keyset pagination. Use it in new builds only.
- Also convert the feed `ScrollView` + `.map` to a `FlatList` (perf with long feeds).

### BUG-M4 — Stale `useMemo` in the feed
- **File:** `src/app/community/[id].tsx:322-618` (`feedContent`, deps `:618`) and `:283-320` (`combinedFeed` uses `feedMatches` but depends on `matches`; lint warning `320:6`).
- **Fix:** add the missing deps (`theme`, `id`, `user?.id`, handlers). Wrap `handlePostPress`/`handleMatchPress` in `useCallback`, or drop the `useMemo` (the React Compiler is enabled in `app.json`, so manual memo isn't needed). Compute `feedMatches` inside the memo.

### BUG-M5 — Post like count doesn't follow realtime/props
- **File:** `src/components/PostCard.tsx:34-35` (`useState(post.likes_count)` is never re-synced).
- **Fix:** `useEffect(() => { setLiked(post.is_liked_by_user ?? false); setLikesCount(post.likes_count ?? 0); }, [post.id, post.likes_count, post.is_liked_by_user]);`. Also ignore the realtime INSERT/DELETE for **your own** like in `useCommunityPosts.ts` (the optimistic update already counted it). Otherwise it double counts once props sync.
- Check `MatchCard.tsx` for the same pattern.

### BUG-M6 — Native-only `Alert.alert` on web
- **Files:** `src/components/PostCard.tsx:59,69`, `src/components/CreatePostModal.tsx` (5 calls, e.g. `:81`), `src/components/PostDetailPopup.tsx` (3 calls, e.g. `:190`).
- **Problem:** `Alert.alert` is a no-op on react-native-web, so delete-post confirmation never appears (post delete broken on web) and errors are invisible.
- **Fix:** replace them with `alert` from `@/lib/alert`. Add an ESLint rule to prevent regressions: `no-restricted-syntax` for `MemberExpression[object.name='Alert'][property.name='alert']` outside `src/lib/alert.ts`.

### BUG-M7 — Session application lifecycle gaps
- **File:** `src/components/SessionDetailPopup.tsx:701-719`.
- **Problem:** `pending` shows only text (no way to withdraw; `uncommitFromSession` already supports pending). `left` shows a banner with no re-apply, although AGENTS.md says users can leave and re-apply (the partial unique index allows it).
- **Fix:** add a "Cancel request" secondary button for `pending` → `handleUncommit`. For `left` (and optionally `rejected`), show "Apply again" → `handleCommit` when the session is open and not full. Update the local status after success.

### BUG-M8 — Session date validation
- **Files:** `src/app/create-session.tsx:100-115` (no "in the past" check; only the date picker has `minimumDate` `:314`, time picker unrestricted), `:109-114` (client uses now+7d, service uses end-of-day +7d), `src/services/sessions.ts:193-200` (`MAX_SESSION_FUTURE_DATE` is computed **once at module load**, so it goes stale if the app stays open for days).
- **Fix:** in `handleCreate`, reject `dateTime < now - 1 min` with "Pick a time in the future". Replace the module constant with a function `getMaxSessionFutureDate()` used by both the screen and the service. Server-side guard in SEC-M3.

### BUG-M9 — Stale actionable notifications
- **File:** `src/components/ActivityCard.tsx:199-226, 232-251`.
- **Problem:** if the request was already approved/rejected elsewhere (or the session was deleted), `doAction` throws "No pending requests". The card shows an error and stays in Action Required forever.
- **Fix:** if the lookup returns 0 rows, treat it as already handled. Call `resolveNotification(...)` with a neutral resolved type (or just mark it read and move it to Past Activity), show a toast "Already handled", and call `onComplete()`.

### BUG-M10 — Avatar upload race
- **File:** `src/components/ProfileForm.tsx:52` (`canSubmit` ignores `uploadingAvatar`), `:246`.
- **Fix:** `const canSubmit = value.length > 0 && available && !uploadingAvatar;`. Also never pass a non-`https://` URL in `onSubmit` (guard: `avatarUrl?.startsWith('http') ? avatarUrl : initialAvatar`).

### BUG-M11 — Username rules
- **Files:** `src/components/ProfileForm.tsx:39-75` (no format validation), `src/services/profiles.ts:46-68` (`ilike` with raw input: `_` matches any char, so `a_b` reports "taken" when `axb` exists), DB has only `UNIQUE (username)`.
- **Fix:** client: enforce `/^[a-z0-9._]{3,20}$/` with inline helper text. Service: use `.eq('username', normalized)` (usernames are stored lowercased; `profiles.ts:347,368`). DB (migration): `check (username ~ '^[a-z0-9._]{3,30}$') not valid` (NOT VALID so legacy names keep working; validate only new writes), and bio `char_length <= 300`. Also enforce the reserved names you care about (`admin`, `sportron`, `support`).

### BUG-M12 — Transient profile-load failure → onboarding
- **Files:** `src/contexts/AuthContext.tsx:25-40` (errors swallowed, `profile` stays null), `src/app/_layout.tsx:61-64` (`session && !profile` → `/onboarding`).
- **Problem:** offline launch or a 5xx sends an existing user to onboarding. Submitting there fails with a duplicate key error.
- **Fix:** track `profileError` in the context. Only redirect to onboarding when the fetch **succeeded** and returned `null`. On error, show a retry screen. Also `onAuthStateChange` reloads the profile on every `TOKEN_REFRESHED` (hourly), so skip reloads for that event, and ignore results from a stale userId (compare with a ref) to avoid setting the wrong user's profile after a fast logout/login.

### BUG-M13 — Unrouted notification taps
- **File:** `src/hooks/useFCM.ts:38-147` (`navigateToNotification`). Not handled: `community_post_created`, `community_post_liked`, `community_post_commented`, `streak_reminder`, `streak_at_risk`, `streak_milestone`, `match_approval_request`, `match_approved_community`, `match_disputed`, plus DB-only types `member_joined`, `community_engagement`, `new_community` (not in the TS union, see `src/types/index.ts` and AGENTS.md "Notification Types").
- **Fix:** posts → `/community/[id]` with `{ id: communityId, postId }` (the screen already auto-opens `postId`, `community/[id].tsx:595`). Streaks → `/` (Communities tab, where the flame lives) or open the streak modal. `member_joined`/`community_engagement`/`new_community` → `/community/[id]`. Add the three DB-only types to `NotificationType`. Check the payload keys emitted by triggers in `068`/`075`/`078`/`080`/`081`/`083` (`data->>'communityId'`, `'postId'`). Mirror any changes in `src/app/(tabs)/updates.tsx` / `ActivityCard` tap handling.
- Also check on a device that taps on **OS-displayed** hybrid FCM notifications (app killed) are delivered to `Notifications.useLastNotificationResponse()`. With `@react-native-firebase/messaging` handling the notification, you may need `messaging().getInitialNotification()` + `messaging().onNotificationOpenedApp()` in `useFCM` to route cold-start taps.

### BUG-M14 — Presence ignores background
- **File:** `src/components/ChatPopup.tsx:196-215`.
- **Fix:** add an `AppState` listener. On `background|inactive`: stop the interval and `deleteChatPresence`. On `active`: heartbeat again + restart the interval. Otherwise Android keeps JS timers alive and the user stops getting pushes for that chat while the app is in the background.

### BUG-M15 — Stats double count after re-approval
- **File:** `038_fix_community_member_stats.sql:15-16` (`if old.approval_status is distinct from 'approved'`). The path approved → disputed → approved counts twice.
- **Fix:** with SEC-C4 in place, only `pending → approved` is possible. Also add the reverse: on `approved → (anything)` subtract the stats (or recompute that match's participants from scratch).

### BUG-M16 — Feedback toggling inflates `completed_sessions`
- **File:** `033_add_total_committed_on_accept.sql:14-35`.
- **Fix:** when changing `showed_up → no_show`, decrement. Increment only on `→ showed_up` from a non-`showed_up` value (already) **and** decrement on the reverse. Or recompute `completed_sessions` as a count of `commitments where feedback_status='showed_up'` for that user.

### BUG-M17 — No refresh on app resume
- **Files:** `src/contexts/NotificationsContext.tsx:100-180`, `src/hooks/useChats.ts`, `src/hooks/useChat.ts`, `src/hooks/useCommunity.ts`. No `AppState` usage anywhere except the unused `MaintenanceContext`.
- **Fix:** small shared hook `useAppForeground(cb)` (AppState `active` transition). Use it to call `fetchNotifications()`, chat hub refresh and `useChat` refetch-latest. Realtime events missed while backgrounded are otherwise lost until the next screen focus.

### BUG-M18 — Misleading delete-account copy
- **File:** `src/app/settings.tsx:62-70`.
- **Problem:** it says "permanently erase all your data", but `softDeleteAccount` keeps the row, username, matches, messages, posts, and signing in again restores everything. That is legally risky (Play "account deletion" policy requires an accurate description).
- **Fix:** change the copy to describe exactly what happens ("Your profile photo, bio and notification settings are removed and your account is deactivated. Signing in again reactivates it. Messages and match history remain.") and link to a deletion request option (email / web form) for full erasure. Also `PRIVACY_POLICY.md` should match.

### BUG-M19 — Navigation after leave/delete
- **File:** `src/app/community/[id]/info.tsx:171-175, 196-197`.
- **Problem:** `router.back()` returns to `community/[id]`, which shows a stale member view (after leave) or "Community not found" (after delete).
- **Fix:** `router.dismissTo('/')` (or `router.replace('/')`) after delete and after leave from a restricted community, and trigger the communities list refresh.

---

## 8. Low / polish

- **BUG-L1 — `isAtRisk` inverted** (`src/services/streak.ts:40-58`): returns `isAtRisk: true` only when the streak is already **broken** (count returned as 0). The real "at risk" case is `lastActive === yesterday`. Fix: in the `lastActive === yesterday` branch set `isAtRisk: true` (the streak ends at UTC midnight). In the broken branch, return `isAtRisk: false`. Check `StreakHeader.tsx`/`StreakModal.tsx` copy matches.
- **BUG-L2 — Unreachable DELETE branch** (`src/app/community/[id].tsx:212-230`): DELETE payloads have an empty `payload.new`, so the `approval_status === 'pending'` guard fails first. Move the DELETE check before reading `payload.new`. Also remove from `pendingMatches` when an UPDATE changes the status away from pending (currently the stale entry stays, although `allPendingMatches` filters it).
- **BUG-L3 — Ping countdown interval** (`src/app/community/[id].tsx:678-682`): deps include `nowTs`, so it's recreated every tick and never stops. Use deps `[pingCooldownUntil]` and clear the interval once `Date.now() >= pingCooldownUntil`.
- **BUG-L4 — Inbox cap** (`src/contexts/NotificationsContext.tsx:19`): the unread badge only counts the latest 100. Fetch the unread count separately (`select('id', { count: 'exact', head: true }).eq('read', false)`), or add pagination to `updates.tsx`.
- **BUG-L5 — Notification icon** (`app.json:42-47`): Android requires a monochrome white-on-transparent small icon (96×96). Use `./assets/images/android-icon-monochrome.png` (already exists) or a dedicated `notification-icon.png`. Needs a native rebuild.
- **BUG-L6 — Missing iOS Firebase file** (`app.json:12`): `GoogleService-Info.plist` isn't in the repo, so iOS EAS builds will fail. Add it via EAS secrets/file env or remove the key until iOS is in scope.
- **BUG-L7 — Session expiry needs a client** (`012_add_session_expiry.sql:11-24`): add a pg_cron job (every 5 min) that calls `close_expired_sessions()`. Then the client debounce in `sessions.ts` becomes optional.
- **BUG-L8 — Web alert with 3+ buttons** (`src/lib/alert.ts:40-55`): only OK/Cancel are possible on web. If any call site passes 3 buttons (grep `alert(` with 3 entries), replace it with an in-app modal/action sheet on web.

---

## 9. Code quality

- **QA-01 — Lint errors** (`src/components/PostDetailPopup.tsx:77,108,112,120,147`): `react-hooks/immutability` flags `translateY.value = …`, because `reactCompiler: true` is on. Use Reanimated 4's `translateY.set(...)` / `translateY.get()` API (compiler-safe), then re-run `npm run lint` (target: 0 errors). Fix the 17 warnings too (unused imports in `profile.tsx`, `community/[id].tsx`, `edit.tsx`; duplicate `react-native` imports; missing hook deps covered in BUG-M4).
- **QA-02 — Dead / wrong code:**
  - `transferAdmin` (`src/services/communities.ts:438-459`) demotes the caller **before** promoting the target. The second update then runs as a non-admin and silently affects 0 rows, so the community can lose its admin. It's unused today. Either delete it, or reorder (promote first, then demote) and check affected rows, before any UI uses it.
  - `fetchPings` (`communities.ts:587-600`) uses an FK embed `sender:sender_id(id, username)` that returns null for other users (profiles RLS). It's unused, so delete it or switch to an RPC.
  - `fetchUserSessions` (`sessions.ts:412-457`) is legacy and unused (`grep -rn fetchUserSessions src`). Delete it if unused.
  - `src/contexts/MaintenanceContext.tsx` isn't mounted (AGENTS.md says so). Delete it or reuse it for BUG-H1's timeout logic.
  - The redundant client-side admin checks (`requireCommunityAdmin`, `deleteCommunityPost` role lookup, `communities.ts:218-233`, `:1167-1192`) are not security. Fine to keep for UX, but don't rely on them.
  - Double conflict check: `SessionDetailPopup.handleCommit` (`:205-219`) and `commitToSession` (`sessions.ts:285-290`) both run `checkTimeConflicts` (6 queries each). Keep only one.
- **QA-03 — Docs drift** (`AGENTS.md`): "expire after chips 15m/30m/1hr" vs the actual `30 min … 6 hr` (`create-session.tsx:55-63`). It also claims "transfer admin by username" in edit, which isn't implemented in `edit.tsx`. Update AGENTS.md after fixing, plus the migration counter (098 → whatever you end at).

---

## 10. Suggested order of work

1. **Day 1 (security, server-only, no app release needed):** SEC-C1, SEC-C2, SEC-C3, SEC-C4, SEC-C5, SEC-H1, SEC-H2, SEC-H5, SEC-H6, SEC-H8, BUG-H10. Each is a migration. Run `docs/tournaments/sql-tests*.sql` + manual app smoke test (join public community, accept invite to restricted community, apply/approve/leave session, record + approve match, post/like/comment, send chat) after each.
2. **Day 2 (server + edge functions):** SEC-H3 (+BUG-H6), SEC-H4, SEC-M2, SEC-M3, SEC-M4, SEC-M5, BUG-H5, BUG-M15, BUG-M16, BUG-L7, SEC-H7 step 2-3. **Redeploy `send-notification`, `send-chat-notification`, `streak-cron`** and live-test pushes.
3. **App release (JS + native config):** BUG-H1, BUG-H2, BUG-H3, BUG-H4, BUG-H7, BUG-H8, BUG-H9, SEC-H7 step 1, SEC-M1, all BUG-M*, BUG-L5, QA-01. Bump `version`; bump What's New in the 3 places listed in AGENTS.md (`whatsNew.ts`, `tabs/_layout.tsx`, `tabs/profile.tsx`).
4. Low items / cleanup.

For every item, after fixing: tick it here (`- [x] SEC-C1 …`) or delete it, so this file stays an accurate backlog.
