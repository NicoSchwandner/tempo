/**
 * Content Parser - Converts HTML to content items using Readability.js
 */

let readabilityLoaded = false;

/**
 * Load Readability.js dynamically from CDN
 * @returns {Promise<void>}
 */
async function loadReadability() {
    if (readabilityLoaded || window.Readability) {
        readabilityLoaded = true;
        return;
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js';
        script.onload = () => {
            readabilityLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Readability.js'));
        document.head.appendChild(script);
    });
}

/**
 * Parse HTML into content items
 * @param {string} html - Raw HTML content
 * @param {string} baseUrl - Base URL for resolving relative links
 * @param {string|null} anchorId - Optional anchor ID to find starting position
 * @returns {Promise<{title: string, items: Array, anchorIndex: number}>}
 */
export async function parseHTMLToContent(html, baseUrl, anchorId = null) {
    await loadReadability();

    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Set base URL for relative link resolution
    const base = doc.createElement('base');
    base.href = baseUrl;
    doc.head.appendChild(base);

    // Clone before Readability modifies it
    const clone = doc.cloneNode(true);

    // Extract article content
    const reader = new window.Readability(clone);
    const article = reader.parse();

    if (!article || !article.content) {
        throw new Error('Could not extract article content from this page.');
    }

    // Parse the article content into items
    const { items, anchorIndex } = parseArticleContent(article.content, baseUrl, anchorId);

    if (items.length === 0) {
        throw new Error('Article appears to be empty.');
    }

    return {
        title: article.title || 'Untitled',
        items,
        anchorIndex
    };
}

/**
 * Parse article HTML into content items
 * @param {string} html - Article HTML from Readability
 * @param {string} baseUrl - Base URL for resolving relative links
 * @param {string|null} anchorId - Optional anchor ID to find
 * @returns {{items: Array, anchorIndex: number}}
 */
function parseArticleContent(html, baseUrl, anchorId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const items = [];
    let anchorIndex = 0;
    let foundAnchor = false;

    // Process the body content
    processNode(doc.body, items, baseUrl, anchorId, {
        foundAnchor: false,
        anchorIndex: 0
    });

    // Find anchor index if provided
    if (anchorId) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].anchorId === anchorId) {
                anchorIndex = i;
                break;
            }
        }
    }

    // Remove anchorId property from items (it was just for tracking)
    for (const item of items) {
        delete item.anchorId;
    }

    // Remove trailing paragraph break
    if (items.length > 0 && items[items.length - 1].type === 'paragraph-break') {
        items.pop();
    }

    // Remove consecutive paragraph breaks
    const cleanedItems = [];
    for (const item of items) {
        if (item.type === 'paragraph-break' &&
            cleanedItems.length > 0 &&
            cleanedItems[cleanedItems.length - 1].type === 'paragraph-break') {
            continue;
        }
        cleanedItems.push(item);
    }

    return { items: cleanedItems, anchorIndex };
}

/**
 * Recursively process a DOM node into content items
 */
function processNode(node, items, baseUrl, anchorId, state) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
            // Split on whitespace, hyphens, and dashes
            // - Em/en dashes stay attached: "loops—catching" → "loops—", "catching"
            // - Double hyphens treated as em dash: "foo--bar" → "foo—", "bar"
            // - Regular hyphens split cleanly: "self-driving" → "self", "driving"
            const words = text
                .replace(/(—|–)/g, '$1 ')  // Em/en dashes: keep and add space
                .replace(/--/g, '— ')  // Double hyphen → em dash + space
                .replace(/-/g, ' ')  // Single hyphens: replace with space
                .split(/\s+/)
                .filter(w => w.length > 0);
            for (const word of words) {
                items.push({ type: 'word', value: word });
            }
        }
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toLowerCase();

    // Track anchor IDs
    let currentAnchorId = null;
    if (node.id && anchorId && node.id === anchorId) {
        currentAnchorId = anchorId;
    }

    // Skip script, style, nav, etc.
    if (['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript'].includes(tagName)) {
        return;
    }

    // Handle images
    if (tagName === 'img') {
        const src = node.src || node.getAttribute('src');
        if (src) {
            // Resolve relative URLs
            const absoluteSrc = new URL(src, baseUrl).href;
            const imgHtml = `<img src="${absoluteSrc}" alt="${node.alt || ''}" style="max-width: 100%; height: auto;">`;
            const item = {
                type: 'special',
                contentType: 'image',
                html: imgHtml,
                alt: node.alt || 'Image'
            };
            if (currentAnchorId) item.anchorId = currentAnchorId;
            items.push(item);
        }
        return;
    }

    // Handle figures (often contain images with captions)
    if (tagName === 'figure') {
        const img = node.querySelector('img');
        const figcaption = node.querySelector('figcaption');
        if (img) {
            const src = img.src || img.getAttribute('src');
            if (src) {
                const absoluteSrc = new URL(src, baseUrl).href;
                let figureHtml = `<figure style="margin: 0; text-align: center;">`;
                figureHtml += `<img src="${absoluteSrc}" alt="${img.alt || ''}" style="max-width: 100%; height: auto;">`;
                if (figcaption) {
                    figureHtml += `<figcaption style="font-size: 0.9em; color: #888; margin-top: 0.5em;">${figcaption.textContent}</figcaption>`;
                }
                figureHtml += `</figure>`;
                const item = {
                    type: 'special',
                    contentType: 'image',
                    html: figureHtml,
                    alt: img.alt || figcaption?.textContent || 'Figure'
                };
                if (currentAnchorId) item.anchorId = currentAnchorId;
                items.push(item);
            }
        }
        return;
    }

    // Handle code blocks
    if (tagName === 'pre') {
        const codeContent = node.textContent;
        if (codeContent.trim()) {
            // Escape HTML in code
            const escaped = codeContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const item = {
                type: 'special',
                contentType: 'code',
                html: `<pre style="background: #1e1e2e; padding: 1rem; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 0.85rem; white-space: pre-wrap; word-wrap: break-word;">${escaped}</pre>`,
                alt: 'Code block'
            };
            if (currentAnchorId) item.anchorId = currentAnchorId;
            items.push(item);
        }
        return;
    }

    // Handle tables
    if (tagName === 'table') {
        const tableHtml = node.outerHTML;
        if (tableHtml) {
            const item = {
                type: 'special',
                contentType: 'table',
                html: `<div style="overflow-x: auto;">${tableHtml}</div>`,
                alt: 'Table'
            };
            if (currentAnchorId) item.anchorId = currentAnchorId;
            items.push(item);
        }
        return;
    }

    // Handle block elements that create paragraph breaks
    const blockElements = ['p', 'div', 'article', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'];
    const isBlock = blockElements.includes(tagName);

    if (isBlock && items.length > 0 && items[items.length - 1].type !== 'paragraph-break') {
        const breakItem = { type: 'paragraph-break' };
        if (currentAnchorId) breakItem.anchorId = currentAnchorId;
        items.push(breakItem);
    }

    // Mark first word after anchor with the anchor ID
    const itemCountBefore = items.length;

    // Process children
    for (const child of node.childNodes) {
        processNode(child, items, baseUrl, anchorId, state);
    }

    // If this element had an anchor ID and we added items, mark the first new item
    if (currentAnchorId && items.length > itemCountBefore) {
        // Find first word item after the block started
        for (let i = itemCountBefore; i < items.length; i++) {
            if (items[i].type === 'word' && !items[i].anchorId) {
                items[i].anchorId = currentAnchorId;
                break;
            }
        }
    }

    // Add paragraph break after block elements
    if (isBlock && items.length > 0 && items[items.length - 1].type !== 'paragraph-break') {
        items.push({ type: 'paragraph-break' });
    }
}
