/**
 * URL Loader - Handles URL extraction and content fetching
 *
 * Supports two URL formats:
 * 1. Hash-based (for development): http://localhost:8000/#https://example.com/article
 * 2. Path-based (for production):  http://word-runner.com/https://example.com/article
 */

// Multiple CORS proxies for fallback
const CORS_PROXIES = [
    {
        name: 'allorigins',
        url: 'https://api.allorigins.win/get?url=',
        parseResponse: (data) => ({
            html: data.contents,
            finalUrl: data.status?.url
        }),
        isError: (data) => data.status && data.status.http_code >= 400,
        getErrorMsg: (data) => `Remote server error: ${data.status.http_code}`
    },
    {
        name: 'corsproxy.io',
        url: 'https://corsproxy.io/?',
        parseResponse: async (response) => ({
            html: await response.text(),
            finalUrl: null
        }),
        isRawResponse: true
    }
];

/**
 * Extract URL from the current location
 * Checks hash first (for dev), then path (for production with proper routing)
 * @returns {{url: string, anchor: string}|null} The extracted URL and anchor, or null if not found
 */
export function extractURLFromPath() {
    // Try hash first (for development with simple http server)
    const hash = window.location.hash.slice(1); // Remove #
    if (hash) {
        return parseURLString(hash);
    }

    // Try path (for production with server-side routing)
    const path = window.location.pathname.slice(1); // Remove leading /
    if (path) {
        return parseURLString(path);
    }

    return null;
}

/**
 * Parse a string that may contain a URL and anchor
 * @param {string} str - String to parse
 * @returns {{url: string, anchor: string}|null}
 */
function parseURLString(str) {
    if (!str) return null;

    let url = str;
    let anchor = null;

    // First, normalize the URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlObj = parseURLWithAnchor(url);
        url = urlObj.url;
        anchor = urlObj.anchor;
    } else if (url.startsWith('www.')) {
        const urlObj = parseURLWithAnchor('https://' + url);
        url = urlObj.url;
        anchor = urlObj.anchor;
    } else if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(url)) {
        // Bare domain
        const urlObj = parseURLWithAnchor('https://' + url);
        url = urlObj.url;
        anchor = urlObj.anchor;
    } else {
        return null;
    }

    return { url, anchor };
}

/**
 * Parse a URL string and extract any anchor
 * @param {string} urlStr - Full URL string
 * @returns {{url: string, anchor: string|null}}
 */
function parseURLWithAnchor(urlStr) {
    const hashIndex = urlStr.indexOf('#');
    if (hashIndex !== -1) {
        return {
            url: urlStr.slice(0, hashIndex),
            anchor: urlStr.slice(hashIndex + 1) || null
        };
    }
    return { url: urlStr, anchor: null };
}

/**
 * Custom error class for content-related errors (not network errors)
 * These should be propagated to the user, not trigger proxy fallback
 */
class ContentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContentError';
    }
}

/**
 * Check if HTML content is a Cloudflare challenge page
 * @param {string} html - HTML content
 * @returns {boolean}
 */
function isCloudflareChallenge(html) {
    return html.includes('Just a moment...') &&
           (html.includes('cf-browser-verification') ||
            html.includes('_cf_chl_opt') ||
            html.includes('Enable JavaScript and cookies'));
}

/**
 * Check if HTML content looks like an error page
 * @param {string} html - HTML content
 * @returns {string|null} Error message or null if not an error
 */
function detectErrorPage(html) {
    if (isCloudflareChallenge(html)) {
        return 'This site has bot protection (Cloudflare). Try a different URL.';
    }
    if (html.includes('error code: 5') || html.includes('error code: 4')) {
        return 'The site returned an error. It may be temporarily unavailable.';
    }
    return null;
}

/**
 * Fetch content from a URL
 * Tries direct fetch first, falls back to multiple CORS proxies
 * @param {string} url - The URL to fetch
 * @returns {Promise<{html: string, finalUrl: string}>}
 */
export async function fetchContent(url) {
    // Try direct fetch first (some sites may allow it)
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'text/html'
            }
        });
        if (response.ok) {
            const html = await response.text();
            const errorMsg = detectErrorPage(html);
            if (errorMsg) {
                throw new ContentError(errorMsg);
            }
            return { html, finalUrl: response.url };
        }
    } catch (e) {
        // Re-throw content errors (bot protection, etc.), but continue to proxies for network errors
        if (e instanceof ContentError) {
            throw e;
        }
        console.log('Direct fetch failed, trying CORS proxies');
    }

    // Try each CORS proxy
    const errors = [];
    for (const proxy of CORS_PROXIES) {
        try {
            console.log(`Trying ${proxy.name} proxy...`);
            const proxyUrl = proxy.url + encodeURIComponent(url);
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                errors.push(`${proxy.name}: HTTP ${response.status}`);
                continue;
            }

            let html, finalUrl;

            if (proxy.isRawResponse) {
                const result = await proxy.parseResponse(response);
                html = result.html;
                finalUrl = result.finalUrl || url;
            } else {
                const data = await response.json();

                if (proxy.isError && proxy.isError(data)) {
                    errors.push(`${proxy.name}: ${proxy.getErrorMsg(data)}`);
                    continue;
                }

                const result = proxy.parseResponse(data);
                html = result.html;
                finalUrl = result.finalUrl || url;
            }

            // Check if the content is an error page
            const errorMsg = detectErrorPage(html);
            if (errorMsg) {
                errors.push(`${proxy.name}: ${errorMsg}`);
                continue;
            }

            console.log(`${proxy.name} proxy succeeded`);
            return { html, finalUrl };

        } catch (e) {
            errors.push(`${proxy.name}: ${e.message}`);
            console.log(`${proxy.name} proxy failed:`, e.message);
        }
    }

    // All proxies failed
    const errorSummary = errors.join('; ');
    if (errorSummary.includes('bot protection')) {
        throw new Error('This site has bot protection and cannot be loaded.');
    }
    throw new Error(`Could not fetch article. ${errors[errors.length - 1] || 'All proxies failed.'}`);
}
