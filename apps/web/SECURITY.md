# Security Implementation

## Content Security Policy (CSP)

This app uses **[@nosecone/next](https://www.npmjs.com/package/@nosecone/next)** by Arcjet to implement comprehensive security headers, including Content Security Policy.

### What CSP Does

CSP controls what resources can be loaded and executed on your web pages:
- **Blocks inline scripts** from untrusted sources
- **Prevents unauthorized data exfiltration**
- **Mitigates XSS attacks**
- **Restricts external resource loading**

### Why @nosecone/next?

- **Professionally maintained** by security experts at Arcjet
- **Type-safe** TypeScript configuration
- **PCI DSS 4.0 compliant** (2025 requirements)
- **Nonce support** built-in for strict CSP
- **Best practice defaults** for Next.js

### Current CSP Configuration

Located in `/proxy.ts` using @nosecone/next:

```typescript
// Default: only load resources from same origin
default-src 'self'

// Scripts: allow self, unsafe-eval (dev only), unsafe-inline (for PWA)
script-src 'self' 'unsafe-eval' 'unsafe-inline'

// Styles: allow inline (needed for Chakra UI)
style-src 'self' 'unsafe-inline'

// Images: allow HTTPS, data URIs, blobs
img-src 'self' blob: data: https:

// Fonts: allow self and data URIs
font-src 'self' data:

// No plugins/objects allowed
object-src 'none'

// API connections: Supabase + Gemini only
connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com

// Prevent embedding in iframes
frame-ancestors 'none'
```

### Additional Security Headers

@nosecone/next automatically applies comprehensive security headers:

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
11. **X-Frame-Options: sameorigin** - Clickjacking protection
12. **X-Permitted-Cross-Domain-Policies: none** - Adobe products protection
13. **X-XSS-Protection: 1; mode=block** - Legacy XSS protection

### Testing CSP

To test if CSP is working:

1. **Check headers in browser DevTools:**
   - Open DevTools → Network tab
   - Click on any page request
   - Look for `Content-Security-Policy` header

2. **Check console for violations:**
   - CSP violations appear as console errors
   - Example: "Refused to load script because it violates CSP directive"

3. **Use CSP Evaluator:**
   - https://csp-evaluator.withgoogle.com/
   - Paste your CSP header to check for weaknesses

### Common Issues

#### PWA Service Worker Blocked
**Solution:** `'unsafe-inline'` is allowed for scripts (needed for PWA registration)

#### Chakra UI Styles Not Working
**Solution:** `'unsafe-inline'` is allowed for styles

#### External Images Not Loading
**Solution:** `https:` is allowed for images (needed for article content)

### Improving CSP (Future)

Current compromises for compatibility:
- `'unsafe-inline'` for scripts (PWA service worker requirement)
- `'unsafe-inline'` for styles (Chakra UI requirement)

**@nosecone/next already provides:**
- ✅ Automatic nonce generation (hidden in implementation)
- ✅ `'unsafe-eval'` only in development mode
- ✅ Strict defaults that work with Next.js

**To make CSP even stricter:**

1. **Remove `'unsafe-inline'` for scripts:**
   - Migrate PWA registration to use nonces
   - @nosecone/next already adds nonces automatically

2. **Remove `'unsafe-inline'` for styles:**
   - Switch from Chakra UI to a nonce-compatible CSS-in-JS solution
   - Or use pre-compiled CSS

3. **Add CSP reporting:**
   - Create `/api/csp-report` endpoint
   - Add `report-uri` or `report-to` directive
   - Monitor violations in production

### localStorage Security

**What's stored:**
- `diffread:guestId` - Guest user UUID
- `diffread:userStats` - Local quiz statistics
- `NEXT_LOCALE` - Language preference

**Risk level:** Low
- No passwords or auth tokens
- No personally identifiable information
- Guest IDs are temporary/anonymous

**Protection:**
- CSP prevents unauthorized scripts from reading localStorage
- Same-origin policy restricts access to same domain
- XSS mitigation reduces attack surface

### Best Practices

**DO:**
- ✅ Keep CSP as strict as possible
- ✅ Monitor CSP violations in production
- ✅ Test new features against CSP policy
- ✅ Review third-party scripts before adding

**DON'T:**
- ❌ Store auth tokens in localStorage
- ❌ Add `'unsafe-inline'` without understanding risks
- ❌ Whitelist entire CDNs unnecessarily
- ❌ Disable CSP to fix issues quickly

### Resources

- [@nosecone/next on npm](https://www.npmjs.com/package/@nosecone/next)
- [Arcjet Nosecone Documentation](https://docs.arcjet.com/nosecone/reference)
- [MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/)
