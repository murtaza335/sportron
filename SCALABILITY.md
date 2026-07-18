# Scalability Analysis & Future Feature Roadmap

## Current Architecture Assessment

The T3Seecs app is built with a **modular, sport-agnostic foundation** that supports multi-sport expansion with minimal refactoring.

### ✅ Already Sport-Agnostic
- **Match model**: `match_format` (singles/doubles) is generic
- **Team structure**: `player_id`, `player_partner_id`, `opponent_id`, `opponent_partner_id` works for any 1v1 or 2v2 sport
- **Scoring**: Simple `player_score` / `opponent_score` integers
- **Profiles**: Role-based (student/teacher) but extensible
- **Social**: Likes, comments, verification work for any match type

### ⚠️ Needs Minor Changes
- `match_format` enum → support more formats (best-of-3, best-of-5, sets)
- Hardcoded "Team A/B" labels → make configurable per sport
- Guest name field → generalize to "unregistered player"

---

## Feature Expansion Matrix

| Feature | Complexity | DB Changes | Breaking? | Priority |
|---------|------------|------------|-----------|----------|
| Multi-sport support | Low | Add `sport` enum to matches | No | High |
| Match locations (venues) | Low | New `venues` table + FK | No | High |
| Photos/videos on matches | Medium | Add `match_media` table | No | High |
| User-created teams | Medium | New `teams` + `team_members` tables | No | Medium |
| Tournaments/brackets | High | New `tournaments`, `brackets`, `tournament_teams` | No | Medium |
| Sport-specific scoring | Medium | Extend match model | Possible | Low |
| Leagues/seasons | High | New `leagues`, `seasons`, `standings` | No | Low |
| Equipment tracking | Low | New `equipment` table | No | Low |
| Coaching/training logs | Medium | New `training_sessions` | No | Low |

---

## Detailed Feature Specifications

### 1. Multi-Sport Support (High Priority)
**Implementation:**
```sql
-- Add to matches table
ALTER TABLE matches ADD COLUMN sport TEXT NOT NULL DEFAULT 'table_tennis';

-- Sports enum in app
type Sport = 'table_tennis' | 'tennis' | 'badminton' | 'pickleball' | 'squash' | 'padel';
```

**UI Changes:**
- Sport selector in match creation (SegmentedControl or modal)
- Sport-specific icons/colors in MatchCard
- Filter by sport in History tab

**Compatibility:** ✅ Zero breaking changes - defaults to 'table_tennis'

---

### 2. Match Locations / Venues (High Priority)
**Implementation:**
```sql
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  sport_types TEXT[], -- which sports played here
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE matches ADD COLUMN venue_id UUID REFERENCES venues(id);
```

**Features:**
- Search nearby venues (PostGIS)
- Venue detail page with upcoming matches
- "Play here" quick action
- Venue ratings/reviews

---

### 3. Photos & Videos on Matches (High Priority)
**Implementation:**
```sql
CREATE TABLE match_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id),
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL, -- Cloudinary/S3
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Upload Flow:**
- Multi-select images/videos in add-match
- Cloudinary auto-transformation (thumbnails, compression)
- Carousel in MatchDetailPopup
- Video playback with native player

---

### 4. User-Created Teams (Medium Priority)
**Implementation:**
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
  role TEXT DEFAULT 'member', -- captain, co-captain, member
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, profile_id)
);
```

**Features:**
- Create/join teams from profile
- Team matchmaking (challenge other teams)
- Team stats (wins/losses as a unit)
- Team chat (future)

---

### 5. Tournaments & Brackets (Medium Priority)
**Implementation:**
```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  format TEXT, -- single_elim, double_elim, round_robin, swiss
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  venue_id UUID REFERENCES venues(id),
  organizer_id UUID REFERENCES profiles(id),
  max_teams INT,
  status TEXT DEFAULT 'upcoming', -- upcoming, active, completed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournament_teams (
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  seed INT,
  PRIMARY KEY (tournament_id, team_id)
);

CREATE TABLE bracket_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round INT,
  position INT,
  team1_id UUID REFERENCES teams(id),
  team2_id UUID REFERENCES teams(id),
  winner_id UUID REFERENCES teams(id),
  match_id UUID REFERENCES matches(id), -- link to actual match
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  PRIMARY KEY (tournament_id, round, position)
);
```

**Features:**
- Bracket visualization (SVG/Canvas)
- Auto-advance winners
- Schedule notifications
- Live bracket updates

---

### 6. Sport-Specific Scoring (Low Priority)
**Implementation:**
```sql
-- Extend matches with flexible scoring
ALTER TABLE matches ADD COLUMN scoring_data JSONB DEFAULT '{}';

-- Examples:
-- Tennis: { sets: [[6,4], [6,3]], tiebreak: true }
-- Badminton: { games: [21, 21], gamePoints: [[21,18], [21,15]] }
-- Squash: { games: [[11,9], [11,5], [11,7]], parsing: 'par' }
```

**Renderer:** Sport-specific score components in MatchCard/DetailPopup

---

### 7. Leagues & Seasons (Low Priority)
**Implementation:**
```sql
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  season TEXT, -- "2024 Fall"
  format TEXT, -- round_robin, divisions
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE league_standings (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  played INT DEFAULT 0,
  won INT DEFAULT 0,
  lost INT DEFAULT 0,
  drawn INT DEFAULT 0,
  points INT DEFAULT 0,
  sets_for INT DEFAULT 0,
  sets_against INT DEFAULT 0,
  PRIMARY KEY (league_id, team_id)
);
```

---

### 8. Equipment Tracking (Low Priority)
```sql
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  type TEXT, -- racket, paddle, shoes, balls
  brand TEXT,
  model TEXT,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 9. Training/Coaching Logs (Low Priority)
```sql
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  date DATE NOT NULL,
  duration_minutes INT,
  focus TEXT[], -- footwork, serve, backhand, fitness
  intensity TEXT, -- light, moderate, intense
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Current Feature Inventory

### Core Match Features
- ✅ Singles/Doubles match creation
- ✅ Guest player support (unregistered opponents)
- ✅ Score tracking (+/- buttons + direct input)
- ✅ Match verification (pending/verified/disputed)
- ✅ Public/Private visibility
- ✅ Match format badges

### Social Features
- ✅ Likes with optimistic UI
- ✅ Threaded comments
- ✅ Comment counts
- ✅ Match sharing (native share sheet)

### Profile & Auth
- ✅ Google OAuth
- ✅ Profile CRUD (name, bio, role, avatar)
- ✅ Cloudinary image upload
- ✅ Theme persistence (light/dark/system)

### Discovery & History
- ✅ Global feed (public verified matches)
- ✅ My matches feed
- ✅ Pull-to-refresh + auto-refresh
- ✅ Match detail bottom sheet

### Notifications (FCM Ready)
- ✅ Token registration & storage
- ✅ Permission handling
- ✅ 5 notification types defined
- ⏳ Server-side triggers needed

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)
1. Add `sport` column to matches (default 'table_tennis')
2. Create `venues` table + migration
3. Update `MatchLineupSelector` for sport selection

### Phase 2: Media & Location (Week 2-3)
1. Create `match_media` table
2. Cloudinary video support
3. Integrate venue picker in add-match

### Phase 3: Teams & Social (Week 3-4)
1. Create `teams` + `team_members` tables
2. Team CRUD in profile
3. Team-based matchmaking

### Phase 4: Competitions (Week 4-6)
1. Tournaments + brackets
2. League standings
3. Notification triggers for all events

---

## Technical Debt to Address First

| Issue | Impact | Fix |
|-------|--------|-----|
| `match_format` hardcoded singles/doubles | Blocks new sports | Make enum extensible |
| "Team A/B" labels | UX confusion for other sports | Config per sport |
| Guest name single field | Need per-slot guest names | Array of guest names |
| No pagination on history | Performance at scale | Add cursor pagination |

---

## Recommended Next Steps

1. **Immediate**: Add `sport` enum + venue support (highest ROI)
2. **Short-term**: Photos/videos + teams (user retention)
3. **Medium**: Tournaments (engagement driver)
4. **Long-term**: Leagues, equipment, training logs

The current codebase is **~80% ready** for multi-sport. Core patterns (service layer, hooks, types) are already reusable.