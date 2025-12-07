/**
 * Format URL for display by showing only the domain with ellipsis
 *
 * @param url - The full URL to format
 * @returns Formatted URL string (e.g., "https://example.com/...")
 *
 * @example
 * formatUrlForDisplay("https://example.com/article/12345")
 * // => "https://example.com/..."
 *
 * formatUrlForDisplay("https://subdomain.example.com/long/path/to/article")
 * // => "https://subdomain.example.com/..."
 */
export function formatUrlForDisplay(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.host}/...`
  } catch {
    // If URL parsing fails, fall back to simple truncation
    if (url.length > 40) {
      return `${url.substring(0, 40)}...`
    }
    return url
  }
}
