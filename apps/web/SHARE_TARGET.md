# Web Share Target API

This document explains how Diffread implements the Web Share Target API to receive shared content from other apps and websites.

## Overview

The Web Share Target API allows Diffread to appear in the system share menu on mobile devices and desktop browsers. When users share a URL from another app (e.g., Safari, Chrome, Twitter), they can select Diffread to create a quiz session for that article.

## How It Works

### 1. User Shares Content

When a user shares a URL from another app:

1. The system share menu displays Diffread as an option (if the PWA is installed)
2. User selects "Diffread"
3. Browser sends a POST request to `/api/share-target` with the shared data
4. Diffread processes the URL and redirects to the quiz page

### 2. Data Flow

```
External App → Browser Share Menu → Diffread PWA
                                        ↓
                                  POST /api/share-target
                                        ↓
                              Create Quiz Session
                                        ↓
                              Redirect to /quiz?q=<token>
```

### 3. What Can Be Shared

The share target accepts the following parameters:

- **`url`**: The web page URL (primary source for URL sharing)
- **`text`**: Plain text or URL as fallback
- **`title`**: Page title or filename
- **`pdf`**: PDF file (for file sharing)

**Priority:**
1. If a PDF file is provided, it takes absolute priority
2. Otherwise, if `url` is provided, use it
3. Otherwise, attempt to extract a URL from the `text` parameter

## Implementation Details

### Web App Manifest (`public/manifest.json`)

```json
{
  "share_target": {
    "action": "/api/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "pdf",
          "accept": ["application/pdf", ".pdf"]
        }
      ]
    }
  }
}
```

**Key points:**
- `action`: API endpoint that receives shared content
- `method`: Must be POST for share targets
- `enctype`: Browser sends data as `multipart/form-data`
- `params`: Maps share data to form field names
- `files`: Declares support for PDF file uploads (enables "Share" option for PDFs)

### API Route (`app/api/share-target/route.ts`)

The `/api/share-target` endpoint handles two types of shares:

#### PDF File Sharing

When a PDF file is shared:

1. **Extract PDF File**: `formData.get('pdf')` returns a `File` object
2. **Generate Synthetic URL**: Create `file:///filename.pdf` as article identifier
3. **Upload to Storage**: Use `uploadArticlePdf()` to store in `articles-pdf` bucket
4. **Create Article Record**: Store metadata with `content_medium: 'pdf'`
5. **Create Quiz**: Initialize quiz with scaffold-only approach (no curiosity quiz)
6. **Create Session**: Link user to quiz via session token
7. **Redirect**: Send to `/quiz?q=<session_token>`

**PDF Processing Flow:**
```
PDF File → uploadArticlePdf() → Supabase Storage (articles-pdf bucket)
                              → Create article with content_medium='pdf'
                              → Create quiz (scaffold only)
                              → Create session
                              → Redirect to quiz page
```

#### URL Sharing

When a URL is shared:

1. **Extract URL**: From `url` or `text` parameter
2. **Validate URL**: Ensures the shared content is a valid URL
3. **Create Session**: Uses `enqueueAndProcessSession()` to create a quiz session
4. **Redirects**: Sends user to `/quiz?q=<session_token>` or home page with error

**Error Handling:**

| Error Code | Redirect | Description |
|------------|----------|-------------|
| `missing-url` | `/?error=missing-url` | No URL in shared content (and no PDF) |
| `invalid-url` | `/?error=invalid-url` | Shared text is not a valid URL |
| `pdf-upload-failed` | `/?error=pdf-upload-failed` | PDF upload failed (file too large or corrupted) |
| `share-failed` | `/?error=share-failed` | Session creation failed |

### Home Page Error Display (`app/page.tsx`)

The home page detects error query parameters and displays localized error messages:

```typescript
// Extract error from URL
const params = new URLSearchParams(window.location.search)
const error = params.get('error')

// Show toast notification
if (error === 'missing-url') {
  toaster.create({
    title: t('shareErrorTitle'),
    description: t('shareMissingUrl'),
    type: 'error',
  })
}
```

After displaying the error, the URL is cleaned up with `window.history.replaceState()` to remove the query parameter.

## Platform Support

### Android

- ✅ **Chrome 71+**: Full support for Web Share Target API
  - ✅ URL sharing from web pages
  - ✅ PDF file sharing from Files app, Gmail attachments, etc.
- ✅ **Samsung Internet**: Full support
- ✅ **Edge**: Full support
- **Requirement**: PWA must be installed (added to home screen)

### iOS

- ⚠️ **Safari 15.4+**: Limited support
  - ✅ URL sharing works (with restrictions)
  - ❌ PDF file sharing is not reliable (iOS limitation)
  - PWA must be added to home screen
  - May not appear consistently in share menu
- **Workaround**: Users can still manually copy URL and paste into Diffread, or use Android for PDF sharing

### Desktop

- ✅ **Chrome/Edge**: Supports share targets when PWA is installed
  - ✅ URL sharing
  - ✅ PDF file sharing (drag & drop or "Share" from browser)
- ❌ **Firefox**: Does not support Web Share Target API
- ❌ **Safari macOS**: Does not support Web Share Target API

## Testing

### Local Testing (Development)

1. **Run dev server**: `bun run dev`
2. **Install PWA locally**:
   - Chrome: Settings → Install Diffread
   - Edge: Settings → Apps → Install this site as an app
3. **Test share**:
   - Open a website in another tab
   - Click browser share button
   - Select "Diffread" from share menu

### Mobile Testing (Production)

1. **Deploy to production** (required for HTTPS)
2. **Install PWA on mobile device**:
   - iOS: Safari → Share → Add to Home Screen
   - Android: Chrome → Menu → Add to Home Screen
3. **Test share flow**:
   - Open Safari/Chrome and navigate to an article
   - Tap share button
   - Select "Diffread" from share sheet
   - Verify redirect to quiz page

### Debug Logging

The share target API includes comprehensive logging:

```typescript
logger.info({ title, text, url }, 'Received share target request')
logger.info({ sessionToken, url }, 'Share target session created')
logger.error({ err }, 'Failed to process share target')
```

Check server logs to diagnose issues.

## Internationalization

Error messages are localized in `messages/en.json` and `messages/ja.json`:

**English:**
```json
{
  "toaster": {
    "shareErrorTitle": "Share failed",
    "shareMissingUrl": "No URL was shared. Please share a valid web page.",
    "shareInvalidUrl": "The shared content is not a valid URL.",
    "shareFailedError": "Failed to process shared content. Please try again.",
    "pdfUploadFailed": "Failed to upload PDF file. The file may be too large or corrupted."
  }
}
```

**Japanese:**
```json
{
  "toaster": {
    "shareErrorTitle": "共有に失敗しました",
    "shareMissingUrl": "URLが共有されませんでした。有効なWebページを共有してください。",
    "shareInvalidUrl": "共有されたコンテンツは有効なURLではありません。",
    "shareFailedError": "共有コンテンツの処理に失敗しました。もう一度お試しください。",
    "pdfUploadFailed": "PDFファイルのアップロードに失敗しました。ファイルが大きすぎるか破損している可能性があります。"
  }
}
```

## Limitations

1. **PWA Installation Required**: Share target only works when Diffread is installed as a PWA
2. **iOS PDF Restrictions**: PDF file sharing is unreliable on iOS (use Android or Desktop)
3. **File Size Limit**: PDFs are limited to 25MB (configurable via `MAX_PDF_SIZE_BYTES` env var)
4. **Guest Sessions**: Shared content creates guest sessions with temporary email addresses
5. **PDF Quiz Limitations**: PDF files only generate scaffold quizzes (curiosity quizzes not supported for PDFs per `CLAUDE.md`)

## Future Enhancements

Potential improvements:

- **Additional File Types**: Accept HTML, EPUB, or Markdown file shares
- **Text Support**: Extract article content from plain text shares
- **Pre-filled Form**: Redirect to home page with URL pre-filled instead of auto-processing
- **User Authentication**: Link shared content to authenticated user accounts
- **Share Analytics**: Track share sources and conversion rates
- **PDF Text Extraction**: Implement full PDF → markdown conversion for better quiz generation

## Security Considerations

### URL Validation

All shared URLs are validated before processing:

```typescript
try {
  const urlObj = new URL(sharedUrl)
  validatedUrl = urlObj.href
} catch {
  // Reject invalid URLs
  return NextResponse.redirect('/?error=invalid-url')
}
```

### Guest ID Handling

Shared content uses the existing guest ID from cookies. If no guest exists, a new one is created. This prevents unauthorized access to other users' quiz sessions.

### CSP Compliance

The share target endpoint does not generate dynamic nonces, maintaining static CSP configuration for performance (see `SECURITY.md`).

## References

- [Web Share Target API (MDN)](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target)
- [Web Share Target Explainer (W3C)](https://w3c.github.io/web-share-target/)
- [Can I Use: Web Share Target](https://caniuse.com/web-share-target)
- [How to receive shared data with the Web Share Target API](https://web.dev/web-share-target/)

## Troubleshooting

### Share Option Not Appearing

**Problem**: Diffread doesn't appear in the share menu.

**Solutions**:
1. Verify PWA is installed (check home screen icon)
2. Re-install PWA (remove and add to home screen again)
3. Clear browser cache and service worker
4. Check browser compatibility (iOS 15.4+, Chrome 71+)

### Share Redirects to Error Page

**Problem**: Sharing a URL shows error message on home page.

**Diagnostic Steps**:
1. Check server logs for error details
2. Verify shared URL is valid and accessible
3. Test URL directly in browser address bar
4. Check if URL requires authentication

### Session Not Created

**Problem**: Share redirects to home page without error, but no quiz appears.

**Diagnostic Steps**:
1. Check if guest profile exists (should auto-create)
2. Verify `/api/share-target` logs show session creation
3. Check session table in database for new record
4. Verify worker queue is processing (check `quizzes` table status)

## Code Locations

| Component | File Path |
|-----------|-----------|
| Manifest configuration | `apps/web/public/manifest.json` |
| Share target API route | `apps/web/app/api/share-target/route.ts` |
| Error handling (home page) | `apps/web/app/page.tsx` |
| English translations | `apps/web/messages/en.json` |
| Japanese translations | `apps/web/messages/ja.json` |
| Session workflow | `apps/web/src/lib/workflows/enqueue-session.ts` |
| Guest ID management | `apps/web/src/lib/api/guest-session.ts` |
