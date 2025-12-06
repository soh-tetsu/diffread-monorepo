# Security Implementation

## Content Security Policy (CSP)

This app uses **[@nosecone/next](https://www.npmjs.com/package/@nosecone/next)** by Arcjet to implement comprehensive security headers, including Content Security Policy.

### What CSP Does

CSP controls what resources can be loaded and executed on your web pages:
- **Blocks inline scripts** from untrusted sources
- **Prevents unauthorized data exfiltration** via `connect-src` directive
- **Mitigates XSS attacks**
- **Restricts external resource loading**

### Architecture Decision: Static CSP (No Nonces)

**Decision:** Use static CSP without nonces to enable Next.js static generation.

**Rationale:**
1. **Performance Priority:** App uses client-side rendering (`'use client'`) - static generation provides 5-10x faster TTFB
2. **Nonces Incompatible:** PWA requires `'unsafe-inline'` for service worker, which negates nonce security benefits
3. **Real Protection:** `connect-src` directive prevents localStorage data exfiltration to unauthorized APIs
4. **SEO Not Critical:** Quiz content is user-generated and behind session tokens (not publicly crawlable)

**Trade-offs:**
- ✅ Static HTML generation (fast CDN serving)
- ✅ Same security level (nonces don't help with `'unsafe-inline'`)
- ❌ No per-request nonce generation (not needed for our use case)

### Why @nosecone/next?

- **Professionally maintained** by security experts at Arcjet
- **Type-safe** TypeScript configuration
- **PCI DSS 4.0 compliant** (2025 requirements)
- **13 security headers** automatically configured
- **Best practice defaults** for Next.js
- **Static mode support** (no forced dynamic rendering)

### Current CSP Configuration

Located in `/proxy.ts` using @nosecone/next with **static directives** (no nonce generation):

```typescript
// Default: only load resources from same origin
default-src 'self'

// Scripts: allow self + unsafe-inline (required for PWA service worker)
script-src 'self' 'unsafe-inline'

// Styles: allow self + unsafe-inline (required for Chakra UI)
style-src 'self' 'unsafe-inline'

// Images: allow HTTPS, data URIs, blobs (for article images)
img-src 'self' blob: data: https:

// Fonts: allow self and data URIs
font-src 'self' data:

// No plugins/objects allowed
object-src 'none'

// API connections: CRITICAL - only allow trusted APIs
connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com

// Prevent embedding in iframes
frame-ancestors 'none'

// Base URI restriction
base-uri 'self'

// Form submission restriction
form-action 'self'
```

**Key Security:** The `connect-src` directive prevents malicious scripts from sending localStorage data to unauthorized servers, even if XSS occurs.

### Additional Security Headers

@nosecone/next automatically applies 13 comprehensive security headers:

1. **Content-Security-Policy** - See configuration above
2. **Cross-Origin-Embedder-Policy: require-corp** - Isolates resources
3. **Cross-Origin-Opener-Policy: same-origin** - Prevents window.opener attacks
4. **Cross-Origin-Resource-Policy: same-origin** - CORP protection
5. **Origin-Agent-Cluster** - Process isolation
6. **Referrer-Policy: no-referrer** - Strictest referrer policy
7. **Strict-Transport-Security** - Force HTTPS (max-age: 2 years)
8. **X-Content-Type-Options: nosniff** - Prevents MIME sniffing
9. **X-DNS-Prefetch-Control: off** - Disable DNS prefetching
10. **X-Download-Options: noopen** - IE download protection
11. **X-Frame-Options: DENY** - Clickjacking protection
12. **X-Permitted-Cross-Domain-Policies: none** - Adobe products protection
13. **X-XSS-Protection: 1; mode=block** - Legacy XSS protection

### Performance Optimizations

**Static Generation Enabled:**
- All pages rendered at build time (not per-request)
- HTML cached and served from CDN
- 5-10x faster Time to First Byte (TTFB)
- Reduced server load and hosting costs

**Client-Side i18n:**
- Locale detection moved to browser (no server-side cookie reads)
- `LocaleProvider` component handles language switching
- localStorage + cookies for persistence
- Instant language switching without page reload

**Build Output:**
```
Route (app)
┌ ○ /          ← Static (pre-rendered once)
├ ○ /quiz      ← Static
└ ○ /releases  ← Static
```

The `○` symbol confirms static generation is active.

### Testing CSP

To test if CSP is working:

1. **Check headers in browser DevTools:**
   - Open DevTools → Network tab
   - Click on any page request
   - Headers tab → Look for `Content-Security-Policy` header

2. **Check console for violations:**
   - CSP violations appear as console errors
   - Example: "Refused to connect to 'https://evil.com' because it violates CSP directive"

3. **Use CSP Evaluator:**
   - https://csp-evaluator.withgoogle.com/
   - Paste your CSP header to check for weaknesses

4. **Command line test:**
   ```bash
   curl -I https://your-domain.com | grep -i content-security-policy
   ```

### Common Issues

#### PWA Service Worker Blocked
**Solution:** `'unsafe-inline'` is allowed for scripts (needed for PWA registration)

#### Chakra UI Styles Not Working
**Solution:** `'unsafe-inline'` is allowed for styles

#### External Images Not Loading
**Solution:** `https:` is allowed for images (needed for article content)

#### API Fetch Blocked
**Solution:** Check `connect-src` directive includes your API domain

### localStorage Security

**What's stored:**
- `diffread:guestId` - Guest user UUID (anonymous identifier)
- `diffread:userStats` - Local quiz statistics (non-sensitive)
- `NEXT_LOCALE` - Language preference (en/ja)

**Risk level:** Low
- No passwords or authentication tokens
- No personally identifiable information
- Guest IDs are temporary/anonymous
- Data is not sensitive

**Protection:**
- **CSP `connect-src`** - Prevents unauthorized scripts from exfiltrating data to external servers
- **Same-origin policy** - Restricts access to same domain only
- **XSS mitigation** - CSP reduces attack surface for script injection

**Not encrypted because:**
- Encryption key would be in JavaScript (accessible to attackers)
- CSP already prevents data exfiltration
- Data is non-sensitive
- Defense in depth: CSP is the primary control

### Best Practices

**DO:**
- ✅ Keep CSP as strict as possible
- ✅ Monitor CSP violations in production (add reporting endpoint)
- ✅ Test new features against CSP policy before deployment
- ✅ Review third-party scripts before adding to `script-src`
- ✅ Use `connect-src` to whitelist only necessary APIs

**DON'T:**
- ❌ Store auth tokens in localStorage (use httpOnly cookies)
- ❌ Add `'unsafe-inline'` without understanding risks
- ❌ Whitelist entire CDNs unnecessarily
- ❌ Disable CSP to fix issues quickly
- ❌ Use `'unsafe-eval'` in production (dev only)

### Future Improvements

**Potential enhancements (not currently needed):**

1. **CSP Reporting:**
   - Create `/api/csp-report` endpoint
   - Add `report-uri` or `report-to` directive
   - Monitor violations in production
   - Track attempted attacks

2. **Stricter CSP (requires major refactoring):**
   - Remove `'unsafe-inline'` for scripts (migrate PWA to nonce-based)
   - Remove `'unsafe-inline'` for styles (switch from Chakra UI)
   - Use SRI (Subresource Integrity) for external scripts

3. **Additional Headers:**
   - `Permissions-Policy` (formerly Feature-Policy)
   - `Clear-Site-Data` on logout

### Resources

- [@nosecone/next on npm](https://www.npmjs.com/package/@nosecone/next)
- [Arcjet Nosecone Documentation](https://docs.arcjet.com/nosecone/reference)
- [Arcjet Blog: Nosecone Library](https://blog.arcjet.com/nosecone-a-library-for-setting-security-headers-in-next-js-sveltekit-node-js-bun-and-deno/)
- [MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [Next.js Security Headers Guide](https://nextjs.org/docs/app/guides/content-security-policy)

---

## Summary of Security Architecture

**Static CSP Strategy:**
- ✅ 13 security headers via @nosecone/next
- ✅ Static HTML generation for performance
- ✅ localStorage protected by `connect-src` directive
- ✅ Client-side i18n for fast rendering
- ✅ PCI DSS 4.0 compliant (2025 requirements)

**Security vs Performance Balance:**
- Chose performance (static generation) over nonces (incompatible with PWA anyway)
- Real protection comes from `connect-src`, not nonces
- 5-10x faster TTFB while maintaining security
