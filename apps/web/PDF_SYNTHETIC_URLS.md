# PDF Synthetic URLs

This document explains how PDFs are represented in the article system using synthetic URLs.

## The Problem

The `articles` table was designed for web content with URLs:

```typescript
interface ArticleRow {
  normalized_url: string   // NOT NULL - required
  original_url: string     // NOT NULL - required
  storage_path: string
  content_medium: 'html' | 'pdf'
}
```

But when users share PDF files, there's **no URL** - it's just a binary file from their device.

---

## The Solution: Synthetic URLs

We generate a **fake URL** using the `file:///` protocol and the **content hash**:

```typescript
// Read PDF content
const arrayBuffer = await pdfFile.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)

// Hash the PDF content (SHA-256)
const contentHash = createHash('sha256').update(buffer).digest('hex')
// Example: "a1b2c3d4e5f6..."

// Create synthetic URL
const syntheticUrl = `file:///pdf/${contentHash}`
// Example: "file:///pdf/a1b2c3d4e5f6..."

// Use as both normalized and original URL
const article = await getOrCreateArticle(syntheticUrl, syntheticUrl)
```

---

## Why Use Content Hash (Not Filename)?

### ❌ **Bad Approach: Filename-based URLs**

```typescript
const syntheticUrl = `file:///${pdfFile.name}`
// "file:///report.pdf"
```

**Problem:** Different PDFs with the same filename collide:

```
User A shares: "report.pdf" (sales data, 10 pages)
  → URL: "file:///report.pdf"
  → Article ID: 123

User B shares: "report.pdf" (marketing data, 20 pages)
  → URL: "file:///report.pdf"  ← Same URL!
  → getOrCreateArticle() returns Article ID: 123 (existing)
  → User B sees User A's quiz ❌
```

---

### ✅ **Good Approach: Content Hash-based URLs**

```typescript
const contentHash = sha256(pdfContent)
const syntheticUrl = `file:///pdf/${contentHash}`
// "file:///pdf/a1b2c3d4e5f6..."
```

**Benefits:**

1. **Deduplication Works**
   ```
   User A shares: "whitepaper.pdf" (content hash: abc123...)
     → URL: "file:///pdf/abc123..."
     → Article ID: 456
   
   User B shares: "renamed-whitepaper.pdf" (same content, hash: abc123...)
     → URL: "file:///pdf/abc123..."  ← Same URL!
     → getOrCreateArticle() returns Article ID: 456 (reused)
     → Both users share the same quiz ✅
   ```

2. **Different PDFs Never Collide**
   ```
   User A shares: "report.pdf" (sales, hash: aaa111...)
     → URL: "file:///pdf/aaa111..."
   
   User B shares: "report.pdf" (marketing, hash: bbb222...)
     → URL: "file:///pdf/bbb222..."  ← Different URL
     → Separate articles ✅
   ```

3. **Filename Doesn't Matter**
   ```
   Same PDF with different names → Same article
   Different PDFs with same name → Different articles
   ```

---

## Storage Path vs Synthetic URL

### Synthetic URL (Identifier)

```typescript
syntheticUrl = "file:///pdf/a1b2c3d4e5f6..."
normalizedUrl = normalizeUrl(syntheticUrl)  // Same as syntheticUrl

// Stored in database
articles.normalized_url = "file:///pdf/a1b2c3d4e5f6..."
articles.original_url = "file:///pdf/a1b2c3d4e5f6..."
```

**Purpose:** Unique identifier for deduplication

---

### Storage Path (Actual File Location)

```typescript
const { path } = await uploadArticlePdf(arrayBuffer, normalizedUrl)

// Actual storage path in Supabase
path = "pdf/by-url/file/xyz789.pdf"

// Stored in database
articles.storage_path = "pdf/by-url/file/xyz789.pdf"
```

**Purpose:** Where the PDF is physically stored

---

## Complete Flow Example

### User Shares "Annual Report.pdf"

```typescript
// 1. Read PDF content
const arrayBuffer = await pdfFile.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)

// 2. Generate content hash
const contentHash = sha256(buffer)
// "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"

// 3. Create synthetic URL
const syntheticUrl = "file:///pdf/a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"

// 4. Normalize (no change for file:// URLs)
const normalizedUrl = normalizeUrl(syntheticUrl)
// "file:///pdf/a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"

// 5. Create or get article
const article = await getOrCreateArticle(normalizedUrl, syntheticUrl)
// Returns existing article if same PDF was shared before

// 6. Upload PDF to storage
const { path } = await uploadArticlePdf(arrayBuffer, normalizedUrl)
// path: "pdf/by-url/file/xyz789.pdf"

// 7. Update article record
await updateArticleContent(article.id, {
  storage_path: "pdf/by-url/file/xyz789.pdf",
  content_hash: "a1b2c3d4e5f6...",
  content_medium: 'pdf',
  metadata: { title: "Annual Report.pdf" }
})
```

---

### Database Record

```json
{
  "id": 123,
  "normalized_url": "file:///pdf/a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "original_url": "file:///pdf/a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "storage_path": "pdf/by-url/file/xyz789.pdf",
  "content_hash": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "content_medium": "pdf",
  "metadata": {
    "title": "Annual Report.pdf"
  }
}
```

---

## How uploadArticlePdf Works

```typescript
export async function uploadArticlePdf(
  buffer: ArrayBuffer,
  normalizedUrl: string
): Promise<{ path: string; metadata: StorageMetadata; contentHash: string }> {
  const nodeBuffer = Buffer.from(buffer)
  
  // Hash the normalized URL (which contains the content hash)
  const fingerprintValue = fingerprint(normalizedUrl)
  // fingerprint("file:///pdf/a1b2c3d4...") → "xyz789"
  
  const host = sanitizeHost(normalizedUrl)
  // sanitizeHost("file:///pdf/a1b2c3d4...") → "file"
  
  const objectPath = `pdf/by-url/${host}/${fingerprintValue}.pdf`
  // "pdf/by-url/file/xyz789.pdf"
  
  // Upload to Supabase Storage
  await supabase.storage.from('articles-pdf').upload(objectPath, nodeBuffer, {
    contentType: 'application/pdf',
    upsert: true  // Overwrite if exists (same URL → same path)
  })
  
  return {
    path: objectPath,
    metadata: { /* ... */ },
    contentHash: fingerprintValue  // ← This is URL hash, not content hash!
  }
}
```

**Note:** The `contentHash` returned by `uploadArticlePdf` is actually a **hash of the URL**, not the content. We generate the real content hash in the share-target route before calling this function.

---

## Deduplication Scenarios

### Scenario 1: Same PDF, Different Filenames

```
User A shares: "Q4-Report.pdf" (content hash: abc123...)
  → Synthetic URL: "file:///pdf/abc123..."
  → Article created: ID 456
  → Quiz created: ID 789

User B shares: "Report-Q4-2024.pdf" (SAME content, hash: abc123...)
  → Synthetic URL: "file:///pdf/abc123..."  ← Same!
  → getOrCreateArticle() returns Article ID 456 (existing)
  → Quiz already exists: ID 789
  → Both users share the same quiz ✅
```

### Scenario 2: Different PDFs, Same Filename

```
User A shares: "invoice.pdf" (Jan 2024, hash: aaa111...)
  → Synthetic URL: "file:///pdf/aaa111..."
  → Article ID: 100

User B shares: "invoice.pdf" (Feb 2024, hash: bbb222...)
  → Synthetic URL: "file:///pdf/bbb222..."  ← Different!
  → Article ID: 101 (new)
  → Separate quizzes ✅
```

### Scenario 3: Same PDF, Re-shared by Same User

```
User A shares: "guide.pdf" (hash: xyz789...)
  → Article ID: 200
  → Session ID: 300 (session_token: "abc")

[Later] User A shares same "guide.pdf" again
  → Same synthetic URL
  → getOrCreateArticle() returns Article ID: 200 (existing)
  → New session created: ID 301 (session_token: "def")
  → ✅ Same article, new quiz attempt
```

---

## Why `file:///` Protocol?

The `file:///` prefix is a standard URI scheme for local files:

- `file:///` is a valid URI format
- Clearly distinguishes PDFs from web URLs
- `normalizeUrl()` handles it correctly
- Future-proof: Could support other file types (e.g., `file:///epub/...`)

**Alternatives considered:**

| Scheme | Example | Issue |
|--------|---------|-------|
| `pdf://` | `pdf://abc123...` | Non-standard protocol |
| `diffread://` | `diffread://pdf/abc123...` | Custom scheme, less clear |
| `https://internal/` | `https://internal/pdf/abc123` | Confusing (not real URL) |
| `urn:` | `urn:diffread:pdf:abc123` | Valid but overly complex |

---

## Edge Cases

### Empty Filename

```typescript
const pdfFilename = pdfFile.name || 'shared-document.pdf'
```

- Filename is only used for `metadata.title`
- Synthetic URL is always based on content hash
- Default filename: `"shared-document.pdf"`

### Large PDFs

```typescript
const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024  // 25MB

if (buffer.byteLength > MAX_PDF_SIZE_BYTES) {
  throw new Error('PDF exceeds limit')
}
```

- Hash calculated before size check
- Error thrown during upload, not article creation
- Failed uploads leave orphaned article records (status: `scraping`)

### Hash Collisions

SHA-256 has ~2^256 possible hashes. Probability of collision:

```
With 1 billion PDFs: ~0% chance
With 1 trillion PDFs: ~0% chance
```

**In practice:** Hash collisions are impossible for user-generated content.

---

## Future Improvements

### 1. Store Filename in Metadata

```typescript
metadata: {
  title: pdfFile.name,
  originalFilename: pdfFile.name,  // ← Preserve original
  uploadedAt: new Date().toISOString()
}
```

### 2. Support File Variants

Same content, different formats:

```
file:///pdf/abc123...     ← PDF version
file:///epub/abc123...    ← EPUB version (same content)
file:///html/abc123...    ← HTML version (same content)
```

### 3. Content-Based Deduplication UI

Show users when their PDF already has a quiz:

```
"This document has already been analyzed. 
 View existing quiz or create a new session?"
```

---

## Code Locations

| Component | File | Responsibility |
|-----------|------|----------------|
| PDF share handling | `app/api/share-target/route.ts` | Generate content hash and synthetic URL |
| Article creation | `src/lib/db/articles.ts` | Store synthetic URL in database |
| PDF upload | `src/lib/storage.ts` | Upload to Supabase Storage |
| URL normalization | `src/lib/utils/normalize-url.ts` | Handle `file:///` protocol |

---

## Summary

**Synthetic URLs** solve the problem of representing uploaded PDFs in a URL-based article system:

- ✅ Use content hash (not filename) for deduplication
- ✅ `file:///pdf/<hash>` format is clear and standard
- ✅ Identical PDFs share quizzes (efficiency)
- ✅ Different PDFs never collide (correctness)
- ✅ Filename preserved in metadata (UX)
