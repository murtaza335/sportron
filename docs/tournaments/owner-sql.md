# Tournaments — owner SQL guide

Run these in the **Supabase SQL editor** (service role / postgres). Tournaments and tournament admins
can only be created here — there is no in-app way, by design.

Replace the `<…>` placeholders. Find a user's id with:

```sql
select id, username from public.profiles where username ilike '%murtaza%';
```

## Apply the migrations (once, in order)

`084_add_tournaments.sql` → `085_add_tournament_read_rpcs.sql` → `086_add_tournament_admin_rpcs.sql` →
`087_add_tournament_bracket_engine.sql`. Then run `docs/tournaments/sql-tests.sql` (rolls back, keeps nothing).

## Create a tournament

New tournaments start as `draft` (visible only to its admins). The 5 core entry fields
(Name, CMS ID, School, Phone, Email) are created automatically.

```sql
insert into public.tournaments (name, description, organization, location, image_url, starts_at, ends_at)
values ('LUMS Sports Gala 2026',
        'Annual inter-department sports gala.',
        'LUMS Sports Society',
        'Lahore',
        null,                              -- Cloudinary URL for the cover, optional
        '2026-11-12 09:00+05', '2026-11-20 18:00+05')
returning id;
```

## Assign / remove a tournament admin

```sql
insert into public.tournament_admins (tournament_id, profile_id)
values ('<tournament_id>', '<profile_id>');

delete from public.tournament_admins
where tournament_id = '<tournament_id>' and profile_id = '<profile_id>';
```

Tournament admins can rename the tournament, edit the entry form, create modules and assign
module admins. They also act as module admins in every module of their tournament.

## Publish / complete / cancel

```sql
update public.tournaments set status = 'published' where id = '<tournament_id>';  -- visible to everyone
update public.tournaments set status = 'completed' where id = '<tournament_id>';  -- read-only, champions shown
update public.tournaments set status = 'cancelled' where id = '<tournament_id>';  -- read-only, "Cancelled" banner
update public.tournaments set status = 'draft'     where id = '<tournament_id>';  -- hide again
```

Once a tournament is `completed` or `cancelled`, admins can no longer change anything in the app
(only SQL can).

## Edit tournament details (admins can only rename)

```sql
update public.tournaments
set description = '…', organization = '…', location = '…', image_url = '…',
    starts_at = '2026-11-12 09:00+05', ends_at = '2026-11-20 18:00+05'
where id = '<tournament_id>';
```

## Inspect

```sql
select id, name, status from public.tournaments order by created_at desc;
select m.name, m.sport, m.status, count(e.*) filter (where e.status = 'active') as entries
from public.tournament_modules m
left join public.tournament_entries e on e.module_id = m.id
where m.tournament_id = '<tournament_id>' group by m.id order by m.sort_order;
```

## Fix a mistake in a finished module (service role only)

Admins cannot edit a `completed` module. To fix a wrong result, set the module back and use the app:

```sql
update public.tournament_modules set status = 'in_progress' where id = '<module_id>';
-- also clear champion_entry_id / runner_up_entry_id / third_place_entry_id and entries.final_rank
-- for that module if you want the standings recomputed when the final is re-decided.
```

## Delete a tournament (irreversible)

```sql
delete from public.tournaments where id = '<tournament_id>';   -- cascades to modules, entries, matches
```
