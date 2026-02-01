/**
 * URL Loader - Handles URL extraction and content fetching
 *
 * Supports three URL formats:
 * 1. Query param (for share target): http://tempo.com/?url=https://example.com/article
 * 2. Hash-based (for development):   http://localhost:8000/#https://example.com/article
 * 3. Path-based (for production):    http://tempo.com/https://example.com/article
 */

// Multiple CORS proxies - tried in parallel, first success wins
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
    },
    {
        name: 'corsanywhere',
        url: 'https://cors-anywhere.herokuapp.com/',
        parseResponse: async (response) => ({
            html: await response.text(),
            finalUrl: response.headers.get('x-final-url') || null
        }),
        isRawResponse: true,
        prependUrl: true // URL is appended directly, not encoded
    },
    {
        name: 'codetabs',
        url: 'https://api.codetabs.com/v1/proxy?quest=',
        parseResponse: async (response) => ({
            html: await response.text(),
            finalUrl: null
        }),
        isRawResponse: true
    }
];

/**
 * Extract URL from the current location
 * Checks query param first (for share target), then hash (dev), then path (production)
 * @returns {{url: string, anchor: string}|null} The extracted URL and anchor, or null if not found
 */
export function extractURLFromPath() {
    // Try query params first (for Web Share Target API)
    // Some browsers put URL in 'url', others in 'text'
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    if (sharedUrl) {
        return parseURLString(sharedUrl);
    }

    // Try hash (for development with simple http server)
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
 * Try fetching via a single proxy
 * @param {Object} proxy - Proxy configuration
 * @param {string} url - Target URL
 * @returns {Promise<{html: string, finalUrl: string, proxyName: string}>}
 */
async function fetchViaProxy(proxy, url) {
    const proxyUrl = proxy.prependUrl
        ? proxy.url + url
        : proxy.url + encodeURIComponent(url);

    const response = await fetch(proxyUrl);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    let html, finalUrl;

    if (proxy.isRawResponse) {
        const result = await proxy.parseResponse(response);
        html = result.html;
        finalUrl = result.finalUrl || url;
    } else {
        const data = await response.json();

        if (proxy.isError && proxy.isError(data)) {
            throw new Error(proxy.getErrorMsg(data));
        }

        const result = proxy.parseResponse(data);
        html = result.html;
        finalUrl = result.finalUrl || url;
    }

    // Check if the content is an error page
    const errorMsg = detectErrorPage(html);
    if (errorMsg) {
        throw new ContentError(errorMsg);
    }

    return { html, finalUrl, proxyName: proxy.name };
}

/**
 * Race multiple promises, returning the first successful one
 * Unlike Promise.race, this waits for success, not just first settlement
 * @param {Promise[]} promises - Promises to race
 * @returns {Promise} First successful result, or aggregated error if all fail
 */
function raceToSuccess(promises) {
    return new Promise((resolve, reject) => {
        const errors = [];
        let pending = promises.length;

        promises.forEach((promise, index) => {
            promise
                .then(resolve)
                .catch(error => {
                    errors[index] = error;
                    pending--;
                    if (pending === 0) {
                        reject(errors);
                    }
                });
        });
    });
}

/**
 * Fetch content from a URL
 * Tries direct fetch first, then races all CORS proxies in parallel
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
            console.log('Direct fetch succeeded');
            return { html, finalUrl: response.url };
        }
    } catch (e) {
        // Re-throw content errors (bot protection, etc.), but continue to proxies for network errors
        if (e instanceof ContentError) {
            throw e;
        }
        console.log('Direct fetch failed, racing CORS proxies in parallel');
    }

    // Race all proxies in parallel - first success wins
    console.log(`Racing ${CORS_PROXIES.length} proxies: ${CORS_PROXIES.map(p => p.name).join(', ')}`);

    const proxyPromises = CORS_PROXIES.map(proxy =>
        fetchViaProxy(proxy, url).catch(error => {
            console.log(`${proxy.name} failed: ${error.message}`);
            throw { proxy: proxy.name, error };
        })
    );

    try {
        const result = await raceToSuccess(proxyPromises);
        console.log(`${result.proxyName} won the race`);
        return { html: result.html, finalUrl: result.finalUrl };
    } catch (errors) {
        // All proxies failed - check for content errors first
        const contentError = errors.find(e => e?.error instanceof ContentError);
        if (contentError) {
            throw new Error(contentError.error.message);
        }

        // Summarize errors
        const errorMessages = errors
            .filter(e => e)
            .map(e => `${e.proxy}: ${e.error?.message || e.error}`);

        if (errorMessages.some(msg => msg.includes('bot protection'))) {
            throw new Error('This site has bot protection and cannot be loaded.');
        }

        throw new Error(`Could not fetch article. All ${CORS_PROXIES.length} proxies failed.`);
    }
}
