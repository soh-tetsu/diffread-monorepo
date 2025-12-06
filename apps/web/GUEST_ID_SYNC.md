# Guest ID Synchronization

This document explains how guest IDs are managed and synchronized between client and server, especially in the share-target flow where guest profiles are created automatically.

## Overview

Guest IDs are used to track anonymous users before they authenticate. The guest ID is:
- **Generated server-side** (UUID v4)
- **Stored client-side** in `localStorage` under key `diffread:guestId`
- **Sent with API requests** via `X-Diffread-Guest-Id` header

---

## Normal Flow (Explicit Guest Enrollment)

### 1. User Completes Onboarding

```typescript
// In app/page.tsx
const handleUnlock = async () => {
  const response = await fetch('/api/guests', {
    method: 'POST',
    body: JSON.stringify({ userId: guestId, onboardingCompleted: true })
  })

  const { userId } = await response.json()

  // Save to localStorage
  writeGuestId(userId)
}
```

### 2. Server Creates Guest

```typescript
// In app/api/guests/route.ts
export async function POST(request: Request) {
  const { userId } = await request.json()

  const { user, created } = await ensureGuestUser({ userId })

  return NextResponse.json({
    userId: user.id  // ← Client receives this and saves to localStorage
  })
}
```

**Flow:**
```
User completes onboarding
        ↓
POST /api/guests
        ↓
Server creates/fetches guest user
        ↓
Returns { userId: "abc-123" }
        ↓
Client saves to localStorage
        ↓
Future requests include X-Diffread-Guest-Id: abc-123
```

---

## Share Target Flow (Automatic Guest Enrollment)

The share target flow is different because it **redirects** instead of returning JSON, so we can't directly return the guest ID to the client.

### Problem

```typescript
// In app/api/share-target/route.ts
export async function POST(request: Request) {
  const guestId = extractGuestId(request)  // Could be null!

  // If null, we create a new guest, but how does client know?
  const { session } = await enqueueAndProcessSession(
    { userId: guestId },  // Creates new guest if null
    url
  )

  // We redirect, so we can't return JSON with the new guest ID
  return NextResponse.redirect(`/quiz?q=${session.session_token}`)
}
```

### Solution: Return Guest ID in Quiz Metadata

Instead of trying to pass the guest ID through the redirect, we return it when the quiz page fetches session metadata.

#### Step 1: Share Target Creates Session (with new guest if needed)

```typescript
// In app/api/share-target/route.ts
const guestId = extractGuestId(request)  // Could be null

const userIdentity = guestId
  ? { userId: guestId }       // Use existing
  : { userId: undefined }     // Trigger new guest creation

const { session } = await enqueueAndProcessSession(userIdentity, url)
// session.user_id now contains the guest ID (new or existing)

return NextResponse.redirect(`/quiz?q=${session.session_token}`)
```

#### Step 2: Quiz API Returns Guest ID

```typescript
// In app/api/quiz/route.ts
export async function GET(request: Request) {
  const token = searchParams.get('q')
  const session = await ensureSessionForGuest(token, guestId)

  return NextResponse.json({
    session: {
      session_token: session.session_token,
      status: session.status,
      article_url: session.article_url,
      user_id: session.user_id,  // ← Include guest ID
    },
    article
  })
}
```

#### Step 3: Quiz Page Saves Guest ID

```typescript
// In app/quiz/page.tsx
function QuizPageContent() {
  const { data: quizMeta } = useSWR<QuizMetaResponse>(
    `/api/quiz?q=${token}`,
    fetcher
  )

  // Save guest ID to localStorage when received
  useEffect(() => {
    if (quizMeta?.session.user_id) {
      const currentGuestId = readGuestId()
      if (currentGuestId !== quizMeta.session.user_id) {
        writeGuestId(quizMeta.session.user_id)  // ← Sync to localStorage
      }
    }
  }, [quizMeta?.session.user_id])
}
```

**Flow:**
```
1. User shares PDF (no guest ID in localStorage)
        ↓
2. POST /api/share-target (no X-Diffread-Guest-Id header)
        ↓
3. extractGuestId(request) → null
        ↓
4. enqueueAndProcessSession({ userId: undefined }, url)
        ↓
5. ensureGuestUser() creates NEW GUEST
        ↓
   Database INSERT INTO users (id, email)
   VALUES ('abc-123', 'guest+abc-123@diffread.internal')
        ↓
6. Database INSERT INTO sessions (session_token, user_id, article_url)
   VALUES ('xyz-789', 'abc-123', 'file:///doc.pdf')

   ↑ This is the "sessions" DATABASE TABLE
   ↑ NOT an HTTP session
        ↓
7. Redirect to /quiz?q=xyz-789
        ↓
8. Quiz page: GET /api/quiz?q=xyz-789
        ↓
9. Server: SELECT * FROM sessions WHERE session_token = 'xyz-789'
   Returns: { session_token: 'xyz-789', user_id: 'abc-123', ... }
        ↓
10. Quiz page receives: { session: { user_id: 'abc-123' } }
        ↓
11. Quiz page: localStorage.setItem('diffread:guestId', 'abc-123')
```

---

## Guest ID Lifecycle

### Case 1: New User via Share Target

1. User shares URL from Safari (no guest ID in localStorage)
2. Browser doesn't send `X-Diffread-Guest-Id` header
3. `extractGuestId()` returns `null`
4. `enqueueAndProcessSession({ userId: undefined })` creates new guest
5. Session links to new guest ID: `"abc-123"`
6. Quiz page fetches `/api/quiz` → receives `user_id: "abc-123"`
7. Quiz page saves `"abc-123"` to localStorage
8. **From now on**, all requests include `X-Diffread-Guest-Id: abc-123`

### Case 2: Existing User via Share Target

1. User already has guest ID in localStorage: `"abc-123"`
2. Browser sends `X-Diffread-Guest-Id: abc-123` header
3. `extractGuestId()` returns `"abc-123"`
4. `enqueueAndProcessSession({ userId: "abc-123" })` fetches existing guest
5. Session links to existing guest
6. Quiz page fetches `/api/quiz` → receives `user_id: "abc-123"`
7. Quiz page checks localStorage → already has `"abc-123"` → no action needed

### Case 3: Lost Guest ID (Cleared localStorage)

1. User had guest ID `"abc-123"` but cleared localStorage
2. Browser doesn't send `X-Diffread-Guest-Id` header
3. New guest is created: `"xyz-789"`
4. **Old sessions with `"abc-123"` are orphaned**
5. User now operates under new guest ID `"xyz-789"`

**Note:** This is acceptable behavior - clearing localStorage is like logging out.

---

## Security Considerations

### Guest ID Validation

The `ensureSessionForGuest()` function validates that the session belongs to the guest:

```typescript
export async function ensureSessionForGuest(
  token: string,
  guestId: string | null
): Promise<SessionRow> {
  const session = await getSessionByToken(token)

  // If guest ID is provided and doesn't match session owner
  if (guestId && session.user_id !== guestId) {
    throw new GuestSessionError('GUEST_MISMATCH', 403)
  }

  return session
}
```

**Important:** If `guestId` is `null`, validation is skipped. This allows:
- New users to access shared sessions
- Quiz page to sync the correct guest ID to localStorage

Once synced, future requests will include the guest ID and validation will occur.

---

## Code Locations

| Component | File | Purpose |
|-----------|------|---------|
| Guest ID storage | `src/lib/guest/storage.ts` | Read/write localStorage |
| Guest ID extraction | `src/lib/api/guest-session.ts` | Extract from request headers |
| Guest user creation | `src/lib/db/users.ts` | `ensureGuestUser()` |
| Share target handler | `app/api/share-target/route.ts` | Creates session with guest |
| Quiz metadata API | `app/api/quiz/route.ts` | Returns `user_id` |
| Quiz page | `app/quiz/page.tsx` | Saves `user_id` to localStorage |

---

## Testing

### Test Case 1: New User Shares PDF

1. Open browser in incognito mode
2. Share a PDF to Diffread PWA
3. Check localStorage: `diffread:guestId` should be set
4. Check network: `/api/quiz` response includes `user_id`

### Test Case 2: Existing User Shares URL

1. Complete onboarding (guest ID saved)
2. Share a URL from external app
3. Check localStorage: guest ID should remain the same
4. Check session: should link to existing guest

### Test Case 3: Clear localStorage Mid-Session

1. Share URL, get redirected to `/quiz`
2. Before quiz loads, clear localStorage
3. Quiz page should restore guest ID from `/api/quiz` response

---

## Future Improvements

### Option A: Use Cookies Instead of Headers

Store guest ID in HTTP-only cookies instead of localStorage + headers:

**Pros:**
- Automatic sync across tabs
- Works with JavaScript disabled
- More secure (HTTP-only)

**Cons:**
- Requires cookie consent in some regions
- Complicates CORS for future API usage

### Option B: Server-Side Session Storage

Store session-to-guest mapping server-side, mint session-specific tokens:

**Pros:**
- No client-side storage needed
- Works in all scenarios

**Cons:**
- More complex server logic
- Requires session cleanup/TTL

### Current Approach: Hybrid (Recommended)

Keep current localStorage approach but add fallback:

1. Try to get guest ID from `X-Diffread-Guest-Id` header
2. If missing, create new guest
3. Return guest ID in API responses for client to sync
4. Client saves to localStorage for future requests

**This is what we implemented.**
