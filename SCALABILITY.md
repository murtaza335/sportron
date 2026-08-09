# Scalability Analysis & Feature Roadmap

## Current Architecture Assessment

The Sportron/T3Seecs app is built on a **modular, multi-sport foundation**. It was originally a single table-tennis match tracker and has expanded into a community + sessions + community-matches platform.

### ✅ Already Built (Multi-Sport)
- **Sports**: `Sport` union covering racket sports (table_tennis, badminton, tennis, squash, pickleball) + team sports (football, cricket, volleyball, handball, basketball) + other
- **Match model**: `community_matches` with `player/player_partner/opponent/opponent_partner` (1v1 or 2v2) plus team-name/captain fields for team sports
- **Scoring**: Simple `player_score` / `opponent_score` integers (>= 0)
- **Communities**: sport-linked, public/restricted visibility, cover photos, member roles
- **Sessions**: pickup-play sessions with commitments, expiry, time-conflict checks
- **Social**: likes, comments, approval workflow per community match
- **Profiles**: role-based (student/teacher)
- **Notifications**: in-app notifications + FCM push

### Scope Decisions Going Forward
- `community_matches` is the single source of truth for played matches (legacy `matches`/`match_likes`/`match_comments` tables were dropped)
- Sports, scoring formats, and match rules are extensible but currently stored as simple text/enum fields
- No venue, team-object, or tournament abstractions exist yet

---

## Feature Expansion Matrix

| Feature | Complexity | DB Changes | Breaking? | Priority |
|---------|------------|------------|-----------|----------|
| Match locations (venues) | Low | New `venues` table + FK | No | High |
| Photos/videos on matches | Medium | New `match_media` table | No | High |
| Sport-specific scoring | Medium | Extend match model | Possible | Medium |
| User-created teams | Medium | New `teams` + `team_members` tables | No | Medium |
| Tournaments/brackets | High | New `tournaments`, `brackets`, `tournament_teams` | No | Medium |
| Leagues/seasons | High | New `leagues`, `seasons`, `standings` | No | Low |
| Equipment tracking | Low | New `equipment` table | No | Low |
| Coaching/training logs | Medium | New `training_sessions` | No | Low |

---

## Detailed Feature Specifications

### 1. Match Locations / Venues (High Priority)
```sql
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  sport_types TEXT[],
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Features:**
- Search nearby venues (PostGIS)
- Venue detail page with upcoming sessions
- Venue ratings/reviews

### 2. Photos & Videos on Matches (High Priority)
```sql
CREATE TABLE match_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES community_matches(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id),
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL, -- Cloudinary/S3
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Upload Flow:**
- Multi-select images/videos in record-match
- Cloudinary auto-transformation (thumbnails, compression)
- Gallery in MatchDetailPopup

### 3. Sport-Specific Scoring (Medium Priority)
```sql
-- Extend community_matches with flexible scoring
ALTER TABLE community_matches ADD COLUMN scoring_data JSONB DEFAULT '{}';
-- Tennis: { sets: [[6,4], [6,3]], tiebreak: true }
-- Badminton: { games: [21, 21], gamePoints: [[21,18], [21,15]] }
```

**Renderer:** Sport-specific score components in MatchCard/DetailPopup

### 4. User-Created Teams (Medium Priority)
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  captain_id UUID REFERENCES profiles(id),
  description TEXT,
  logo_url TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, profile_id)
);
```

**Features:** Create/join teams from profile, team matchmaking, team stats.

### 5. Tournaments & Brackets (Medium Priority)
```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  format TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  venue_id UUID REFERENCES venues(id),
  organizer_id UUID REFERENCES profiles(id),
  max_teams INT,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Features:** Bracket visualization, auto-advance winners, schedule notifications, live updates.

### 6. Leagues & Seasons (Low Priority)
```sql
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  season TEXT,
  format TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7. Equipment Tracking (Low Priority)
```sql
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  type TEXT,
  brand TEXT,
  model TEXT,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 8. Training/Coaching Logs (Low Priority)
```sql
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  date DATE NOT NULL,
  duration_minutes INT,
  focus TEXT[],
  intensity TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Current Feature Inventory (as of latest release)

### Communities
- ✅ Multi-sport communities (each community linked to one sport)
- ✅ Public / restricted visibility + discovery/search/sport filters
- ✅ Instant join (public) / admin-approved join requests (restricted)
- ✅ Member roles (admin/member), promote / remove / transfer admin
- ✅ Community cover photos (Cloudinary)
- ✅ Admin invite-by-username; invite accept/decline
- ✅ Pings with live "Coming"/"Busy" responses
- ✅ Edit & delete community; leave community

### Community Matches
- ✅ Singles / doubles (racket) + team names/captain (team sports)
- ✅ Score tracker (+/- + direct input)
- ✅ Approval workflow (pending → approved/disputed)
- ✅ Approved / pending feed tabs, pagination, pull-to-refresh
- ✅ Likes + comments with optimistic UI
- ✅ Per-community standings tracked on members (`community_leaderboard` DB view exists; not yet surfaced in the UI)

### Sessions
- ✅ Create sessions (sport, location, datetime, capacity, expiry)
- ✅ Max 7-day future window + ±30 min time-conflict check
- ✅ Apply / approve / reject / leave / re-apply commitments
- ✅ Session statuses + auto-close of expired sessions
- ✅ Session detail popup, counts, countdown, delete (no accepted members)

### Activity & Notifications
- ✅ In-app notification inbox with Action Required / Invites / Past tabs
- ✅ Inline accept/decline for session applications, join requests, match approvals, invites
- ✅ Real-time notification inserts via Supabase Realtime
- ✅ Unread badge on the Activity tab
- ✅ FCM push notifications (foreground/background/terminated)
- ✅ Per-type notification preferences

### Profile & Auth
- ✅ Google OAuth (Supabase)
- ✅ Profile CRUD (username, bio, role, avatar)
- ✅ Cloudinary image upload with progress
- ✅ Theme persistence (light/dark/system)
- ✅ Soft-delete account + re-enable on login

---

## Migration Strategy

### Phase 1: Locations & Media (Week 1-2)
1. Create `venues` + `match_media` tables
2. Integrate venue picker in create-session / record-match
3. Cloudinary video support

### Phase 2: Teams (Week 2-3)
1. `teams` + `team_members` tables
2. Team CRUD in profile
3. Team-based matchmaking

### Phase 3: Competitions (Week 4-6)
1. Tournaments + brackets
2. League standings
3. Notification triggers for all events

---

## Technical Debt to Address First

| Issue | Impact | Fix |
|-------|--------|-----|
| Sport/scoring stored as simple text | Blocks sport-specific scoring | Add structured scoring JSON per sport |
| No venue model | Sessions can't reference places | Add `venues` table + FK |
| No media on matches | Missed retention | `match_media` table + Cloudinary |
| Match types not paramount in add-match flow | Fewer recorded matches | Deeper `community_matches` seeding/join flows |

---

## Recommended Next Steps

1. **Immediate**: Venues + match media (high ROI)
2. **Short-term**: Teams (retention)
3. **Medium**: Tournaments (engagement)
4. **Long-term**: Leagues, equipment, sport-specific scoring

The codebase is fully multi-sport-ready; core scalable loops (services, hooks, types, notifications) are already reusable.