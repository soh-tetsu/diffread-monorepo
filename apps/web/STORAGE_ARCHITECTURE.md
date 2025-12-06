# Storage Architecture Overview

This document clarifies the different storage mechanisms used in Diffread and what each one is responsible for.

## Summary Table

| Storage Type | What It Stores | Where | Lifetime | Purpose |
|--------------|---------------|--------|----------|---------|
| **localStorage** | Guest ID | Client (browser) | Forever (until cleared) | Track anonymous user identity across page loads |
| **HTTP Headers** | Guest ID | Request headers | Per-request | Send guest ID from client to server |
| **Cookies** | Locale preference | Client (browser) | 1 year | Remember user's language choice |
| **Database "sessions"** | Session tokens | Server (Supabase) | Permanent | Link quiz attempts to users and articles |

**Important:** Despite the name, the database "sessions" table is **NOT** for HTTP session management. It's a domain model for quiz sessions.

---

## 1. localStorage (Client-Side)

### What: Guest ID Storage

```typescript
// src/lib/guest/storage.ts
const STORAGE_KEY = 'diffread:guestId'

export function writeGuestId(value: string): void {
  window.localStorage.setItem(STORAGE_KEY, value)
}

export function readGuestId(): string | null {
  return window.localStorage.getItem(STORAGE_KEY)
}
```

### Purpose
- **Identity persistence** for anonymous users
- Survives page refreshes and tab closes
- User-specific (not shared across browsers/devices)

### Data Format
```
Key: "diffread:guestId"
Value: "550e8400-e29b-41d4-a716-446655440000" (UUID)
```

### Why Not Cookies?
- **Pro localStorage:** No automatic server transmission (saves bandwidth)
- **Pro localStorage:** Easier to access from client JavaScript
- **Con localStorage:** Doesn't work with JavaScript disabled (acceptable for our PWA)
- **Con localStorage:** Not sent automatically (we manually add to headers)

---

## 2. HTTP Headers (Request Transport)

### What: Guest ID Transmission

```typescript
// app/quiz/page.tsx
const fetcher = async (url: string) => {
  const guestId = readGuestId()
  const headers: HeadersInit = guestId 
    ? { 'X-Diffread-Guest-Id': guestId } 
    : {}
  
  const res = await fetch(url, { headers })
  return res.json()
}
```

### Purpose
- **Transport** guest ID from client to server
- Per-request (not persistent)
- Extracted server-side via `extractGuestId(request)`

### Data Format
```http
GET /api/quiz?q=abc123
X-Diffread-Guest-Id: 550e8400-e29b-41d4-a716-446655440000
```

### Why Custom Header Instead of Cookie?
- **Explicit control:** We manually decide when to send it
- **No CSRF concerns:** Not automatically sent by browser
- **Future-proof:** Easier to migrate to Authorization header later

---

## 3. Cookies (Locale Only)

### What: Language Preference

```typescript
// app/api/locale/route.ts
export async function POST(request: Request) {
  const { locale } = await request.json()
  
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, {
    maxAge: 365 * 24 * 60 * 60, // 1 year
    path: '/',
  })
}
```

### Purpose
- **Only used for locale (language) preference**
- NOT used for guest ID or session management
- Automatically sent with requests (convenient for i18n)

### Data Format
```
Cookie: NEXT_LOCALE=ja
```

### Why Use Cookies Here?
- Locale is needed **both client and server side**
- Cookie is read by middleware (`proxy.ts`) for server-side rendering
- Small data size (2 characters: "en" or "ja")

**Note:** We moved away from server-side locale detection to enable static generation. Cookies are now only a fallback - primary source is localStorage.

---

## 4. Database "sessions" Table (Domain Model)

### What: Quiz Session Records

**THIS IS NOT HTTP SESSION STORAGE!** Despite the name, this is a **business domain model** for quiz attempts.

```typescript
// Database schema
export interface SessionRow {
  id: number
  session_token: string      // Unique identifier for this quiz attempt
  user_id: string            // Links to guest/user
  user_email: string
  article_url: string        // Which article is being quizzed
  quiz_id: number | null     // Links to quiz record
  status: SessionStatus      // pending, ready, errored, etc.
  metadata: Record<string, unknown>
}
```

### Purpose
- Track **individual quiz attempts**
- Link user + article + quiz together
- NOT for authentication or HTTP session management

### Example Record
```json
{
  "id": 123,
  "session_token": "xyz789abc",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "guest+550e8400@diffread.internal",
  "article_url": "https://example.com/article",
  "quiz_id": 456,
  "status": "ready"
}
```

### Why Not Call It "QuizAttempt"?
Historical naming - it predates the current architecture. It should probably be renamed to `quiz_attempts` or `quiz_sessions` to avoid confusion with HTTP sessions.

---

## Data Flow Example: Share Target

Let's trace through a complete flow to see how all storage types interact:

### Step 1: User Shares PDF (No Guest ID Yet)

```
Client localStorage: [empty]
Browser sends: POST /api/share-target (no X-Diffread-Guest-Id header)
```

### Step 2: Server Creates Guest

```typescript
// app/api/share-target/route.ts
const guestId = extractGuestId(request)  // null
const userIdentity = { userId: undefined }  // Triggers creation

await enqueueAndProcessSession(userIdentity, url)
  ↓
ensureGuestUser({ userId: undefined })
  ↓
Database INSERT INTO users (id, email, ...) VALUES ('abc-123', 'guest+abc-123@diffread.internal', ...)
  ↓
Database INSERT INTO sessions (session_token, user_id, ...) VALUES ('xyz-789', 'abc-123', ...)
```

**Server database now has:**
```
users table:
  id: 'abc-123'
  email: 'guest+abc-123@diffread.internal'

sessions table:
  session_token: 'xyz-789'
  user_id: 'abc-123'
  article_url: 'file:///document.pdf'
  status: 'pending'
```

### Step 3: Redirect to Quiz

```
Server responds: 302 Redirect to /quiz?q=xyz-789
Client localStorage: [still empty - hasn't synced yet]
```

### Step 4: Quiz Page Fetches Metadata

```
Client sends: GET /api/quiz?q=xyz-789
             [No X-Diffread-Guest-Id header - localStorage is empty]

Server responds: {
  session: {
    session_token: 'xyz-789',
    user_id: 'abc-123',  ← This is the guest ID
    status: 'pending'
  }
}
```

### Step 5: Quiz Page Saves Guest ID

```typescript
// app/quiz/page.tsx
useEffect(() => {
  if (quizMeta?.session.user_id) {
    writeGuestId('abc-123')  // ✅ Save to localStorage
  }
}, [quizMeta])
```

**Client localStorage now has:**
```
diffread:guestId = 'abc-123'
```

### Step 6: Future Requests Include Guest ID

```
Client sends: GET /api/curiosity?q=xyz-789
              X-Diffread-Guest-Id: abc-123  ← From localStorage

Server validates: session.user_id === request.header['X-Diffread-Guest-Id']
                  'abc-123' === 'abc-123' ✅ Valid
```

---

## Comparison: What If We Used HTTP Session Cookies?

### Traditional Session Cookie Approach

```
Browser → Server: POST /login
Server creates session: sessionId = 'sess_123'
Server responds: Set-Cookie: sessionId=sess_123; HttpOnly; Secure
Browser automatically sends: Cookie: sessionId=sess_123 on every request
```

**Why we DON'T use this:**

| Traditional Sessions | Our Approach (localStorage + headers) |
|---------------------|--------------------------------------|
| Session stored server-side (Redis/DB) | Guest ID is just a UUID, no server session storage |
| Requires session cleanup/TTL | Guest records live forever (or until deleted) |
| Cookie sent automatically | Explicit header (more control) |
| Works without JavaScript | Requires JavaScript (acceptable for PWA) |
| Standard for auth | Overkill for guest tracking |

---

## Why This Architecture?

### Design Decisions

1. **localStorage for Guest ID**
   - Guest "sessions" never expire (permanent identity)
   - No need for server-side session store (simpler architecture)
   - User can clear localStorage to "reset" (like logout)

2. **Custom Header Instead of Cookie**
   - Explicit control over when guest ID is sent
   - Future-proof for API key / JWT migration
   - No automatic CSRF concerns

3. **Cookies Only for Locale**
   - Locale needed for SSR (server-side rendering)
   - Fallback for older flow (now primarily localStorage)

4. **Database "sessions" for Business Logic**
   - Tracks quiz attempts (not HTTP sessions)
   - Permanent records for analytics
   - Poor naming choice (historical)

---

## Potential Improvements

### Option 1: Consolidate to Cookies

Use HTTP-only cookies for guest ID instead of localStorage:

**Pros:**
- Automatic transmission (no manual headers)
- More secure (HttpOnly prevents XSS)
- Works without JavaScript

**Cons:**
- Requires cookie consent UI in some regions
- Less control over when it's sent
- Harder to debug (can't see in DevTools Application tab)

### Option 2: Move to JWT

Replace custom header with standard Authorization:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Pros:**
- Industry standard
- Can include metadata (email, onboarding status)
- Easier for third-party API consumers

**Cons:**
- More complex (need token signing/verification)
- Overkill for guest ID
- Requires migration path

### Option 3: Rename Database Table

Rename `sessions` → `quiz_attempts`:

**Pros:**
- Clearer intent (not HTTP sessions)
- Less confusion for new developers

**Cons:**
- Breaking change (requires migration)
- Need to update all references

---

## Current Status: Hybrid Approach (Recommended)

**Keep current architecture** because:
- ✅ Simple and works well
- ✅ No session server overhead
- ✅ User has control (can clear localStorage)
- ✅ Explicit guest ID transmission (security)
- ⚠️ Just needs better documentation (this file!)

**Only change we should consider:**
- Document that database "sessions" are not HTTP sessions
- Maybe add a comment in the schema clarifying this

---

## Quick Reference for Developers

**Where is the guest ID?**
- Client storage: `localStorage.getItem('diffread:guestId')`
- Sent to server: `X-Diffread-Guest-Id` header
- Server extraction: `extractGuestId(request)`
- Database: `users.id` (guest ID) and `sessions.user_id` (foreign key)

**Where is the locale?**
- Client storage: `localStorage.getItem('NEXT_LOCALE')` (primary)
- Fallback: `NEXT_LOCALE` cookie (legacy)
- Server reads: Via middleware in `proxy.ts`

**Where are quiz sessions?**
- Database: `sessions` table (domain model, NOT HTTP sessions)
- Accessed via: `session_token` query parameter (`?q=xyz`)
