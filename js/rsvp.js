/**
 * RSVP (Rapid Serial Visual Presentation) Engine
 *
 * Handles text parsing, playback timing, and word navigation.
 * Supports both plain text and content items (words, special content, paragraph breaks).
 */

const DEFAULT_TEXT = `The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the alphabet at least once.

Speed reading is a collection of methods that increase reading rates without compromising comprehension. RSVP is one of the most effective techniques available. By presenting words one at a time in a fixed position, your eyes don't need to move across the page. This eliminates saccades, the quick eye movements between words, which typically consume about 10% of reading time.

The Optimal Recognition Point helps your brain process each word faster. Research shows that we don't read every letter in a word. Instead, our brain recognizes word shapes and key letters. By centering the ORP and highlighting it, Tempo helps you focus on exactly the right spot.

Try adjusting the speed to find your optimal reading pace. Most people can comfortably read at 250-350 WPM with practice. Some experienced speed readers achieve 500-700 WPM while maintaining good comprehension.

Remember to take breaks. Speed reading requires concentration, and your comprehension will decrease if you're fatigued. Happy reading!`;

const SPECIAL_CONTENT_DURATION = 5; // seconds

export class RSVPEngine {
    constructor() {
        this.words = [];
        this.items = []; // Content items (words, special, paragraph-break)
        this.sentenceStarts = [];
        this.paragraphEnds = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.wpm = 250;
        this.timeoutId = null;
        this.easeInCount = 0;

        // Special content state
        this.specialCountdown = 0;
        this.specialPaused = false;
        this.countdownIntervalId = null;
        this.isShowingSpecialContent = false;

        // Navigation state for rapid back-press detection (play mode only)
        this.lastBackPressTime = 0;
        this.lastSkipToSentenceIdx = -1; // Index into sentenceStarts array

        // Callbacks
        this.onWordChange = null;
        this.onStateChange = null;
        this.onProgress = null;
        this.onParagraphBreak = null;
        this.onSpecialContent = null;
        this.onSpecialCountdownTick = null;
        this.onSpecialContentEnd = null;

        this.setText(DEFAULT_TEXT);
    }

    /**
     * Parse text into words and track sentence/paragraph boundaries
     * @param {string} text - The text to parse
     */
    setText(text) {
        this.stop();
        this.words = [];
        this.items = [];
        this.sentenceStarts = [0];
        this.paragraphEnds = [];

        const paragraphs = text.trim().split(/\n\s*\n/);
        let wordIndex = 0;

        for (let p = 0; p < paragraphs.length; p++) {
            const paragraph = paragraphs[p].trim();
            if (!paragraph) continue;

            // Split on whitespace, and handle hyphens/dashes
            // - Em/en dashes stay attached: "loops—catching" → "loops—", "catching"
            // - Double hyphens treated as em dash
            // - Regular hyphens split cleanly: "self-driving" → "self", "driving"
            const processedText = paragraph
                .replace(/(—|–)/g, '$1 ')  // Em/en dashes: keep and add space
                .replace(/--/g, '— ')  // Double hyphen → em dash + space
                .replace(/-/g, ' ');  // Single hyphens: replace with space
            const rawWords = processedText.split(/\s+/).filter(w => w.length > 0);

            for (let i = 0; i < rawWords.length; i++) {
                const word = rawWords[i];
                this.words.push(word);
                this.items.push({ type: 'word', value: word });

                if (/[.!?]$/.test(word) && (i < rawWords.length - 1 || p < paragraphs.length - 1)) {
                    this.sentenceStarts.push(wordIndex + 1);
                }

                wordIndex++;
            }

            if (p < paragraphs.length - 1 && this.words.length > 0) {
                this.paragraphEnds.push(this.items.length - 1);
                this.items.push({ type: 'paragraph-break' });
            }
        }

        this.currentIndex = 0;
        this.notifyWordChange();
        this.notifyProgress();
    }

    /**
     * Set content items directly (for URL-loaded content)
     * @param {Array} items - Content items array
     */
    setContent(items) {
        this.stop();
        this.items = items;
        this.words = [];
        this.sentenceStarts = [0];
        this.paragraphEnds = [];

        let wordIndex = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === 'word') {
                this.words.push(item.value);
                if (/[.!?]$/.test(item.value)) {
                    this.sentenceStarts.push(wordIndex + 1);
                }
                wordIndex++;
            } else if (item.type === 'paragraph-break') {
                if (i > 0) {
                    this.paragraphEnds.push(i - 1);
                }
            }
        }

        this.currentIndex = 0;
        this.notifyWordChange();
        this.notifyProgress();
    }

    /**
     * Jump to a specific index (for anchor navigation)
     * @param {number} index - The index to jump to
     */
    jumpToIndex(index) {
        if (index >= 0 && index < this.items.length) {
            this.currentIndex = index;
            this.easeInCount = 0;
            this.notifyWordChange();
            this.notifyProgress();
        }
    }

    /**
     * Get the default text
     * @returns {string}
     */
    getDefaultText() {
        return DEFAULT_TEXT;
    }

    /**
     * Set words per minute
     * @param {number} wpm - Words per minute (100-1000)
     */
    setWPM(wpm) {
        this.wpm = Math.max(100, Math.min(1000, wpm));
    }

    /**
     * Calculate interval for current word based on WPM and ease-in
     * @returns {number} - Interval in milliseconds
     */
    getInterval() {
        const baseInterval = 60000 / this.wpm;

        if (this.easeInCount < 5) {
            const easeFactors = [0.5, 0.6, 0.7, 0.85, 1.0];
            const factor = easeFactors[this.easeInCount];
            return baseInterval / factor;
        }

        return baseInterval;
    }

    /**
     * Start or resume playback
     */
    play() {
        if (this.isPlaying) return;

        // If resuming from paused special content, skip to next item
        if (this.specialPaused) {
            this.specialPaused = false;
            this.isShowingSpecialContent = false;
            if (this.onSpecialContentEnd) {
                this.onSpecialContentEnd();
            }
            this.isPlaying = true;
            this.notifyStateChange();
            this.advanceToNext();
            return;
        }

        // If at the end, start over from the beginning
        if (this.currentIndex >= this.items.length - 1) {
            this.currentIndex = 0;
            this.notifyWordChange();
            this.notifyProgress();
        }

        this.isPlaying = true;
        this.easeInCount = 0;
        this.notifyStateChange();

        // If current item is special content, show it with countdown
        const currentItem = this.items[this.currentIndex];
        if (currentItem && currentItem.type === 'special') {
            this.showSpecialContent(currentItem);
        } else {
            this.scheduleNext();
        }
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;

        // If showing special content, stop countdown but keep content visible
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = null;
            this.specialPaused = true;
            // Hide countdown badge when paused
            if (this.onSpecialCountdownTick) {
                this.onSpecialCountdownTick(null); // null indicates hidden
            }
        }

        this.isPlaying = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.notifyStateChange();
    }

    /**
     * Toggle play/pause
     */
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Stop playback and reset to beginning
     */
    stop() {
        this.pause();
        this.clearSpecialContent();
        this.currentIndex = 0;
        this.easeInCount = 0;
        this.notifyWordChange();
        this.notifyProgress();
    }

    /**
     * Clear special content state
     */
    clearSpecialContent() {
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = null;
        }
        this.specialCountdown = 0;
        this.specialPaused = false;
        this.isShowingSpecialContent = false;
        if (this.onSpecialContentEnd) {
            this.onSpecialContentEnd();
        }
    }

    /**
     * Schedule the next word display
     */
    scheduleNext() {
        if (!this.isPlaying) return;

        const interval = this.getInterval();
        this.timeoutId = setTimeout(() => {
            this.advance();
        }, interval);
    }

    /**
     * Advance to the next item (skip paragraph breaks)
     */
    advanceToNext() {
        this.currentIndex++;
        while (this.currentIndex < this.items.length &&
               this.items[this.currentIndex].type === 'paragraph-break') {
            this.currentIndex++;
        }

        if (this.currentIndex < this.items.length) {
            this.processCurrentItem();
        } else {
            this.pause();
        }
    }

    /**
     * Advance to the next word/item
     */
    advance() {
        if (this.currentIndex < this.items.length - 1) {
            const currentItem = this.items[this.currentIndex];
            const wasAtParagraphEnd = this.paragraphEnds.includes(this.currentIndex);

            this.currentIndex++;

            // Skip paragraph break items
            if (this.items[this.currentIndex]?.type === 'paragraph-break') {
                if (this.onParagraphBreak) {
                    this.onParagraphBreak();
                }
                this.timeoutId = setTimeout(() => {
                    this.currentIndex++;
                    if (this.currentIndex < this.items.length) {
                        this.processCurrentItem();
                    } else {
                        this.pause();
                    }
                }, 500);
                return;
            }

            this.processCurrentItem();
        } else {
            this.pause();
        }
    }

    /**
     * Process the current item based on its type
     */
    processCurrentItem() {
        const item = this.items[this.currentIndex];
        if (!item) {
            this.pause();
            return;
        }

        if (item.type === 'special') {
            this.showSpecialContent(item);
        } else if (item.type === 'word') {
            this.easeInCount++;
            this.notifyWordChange();
            this.notifyProgress();
            this.scheduleNext();
        } else if (item.type === 'paragraph-break') {
            // Should be handled in advance(), but just in case
            this.advanceToNext();
        }
    }

    /**
     * Show special content with countdown
     * @param {Object} item - Special content item
     */
    showSpecialContent(item) {
        // Clear any existing timers to prevent double-scheduling
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = null;
        }

        this.specialCountdown = SPECIAL_CONTENT_DURATION;
        this.specialPaused = false;
        this.isShowingSpecialContent = true;

        if (this.onSpecialContent) {
            this.onSpecialContent(item, this.specialCountdown);
        }

        this.countdownIntervalId = setInterval(() => {
            this.specialCountdown--;

            if (this.onSpecialCountdownTick) {
                this.onSpecialCountdownTick(this.specialCountdown);
            }

            if (this.specialCountdown <= 0) {
                this.endSpecialContent();
            }
        }, 1000);
    }

    /**
     * End special content display and continue
     */
    endSpecialContent() {
        if (this.countdownIntervalId) {
            clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = null;
        }

        this.isShowingSpecialContent = false;

        if (this.onSpecialContentEnd) {
            this.onSpecialContentEnd();
        }

        this.notifyProgress();
        this.advanceToNext();
    }

    /**
     * Skip special content if currently showing, and continue reading
     * @returns {boolean} true if special content was skipped
     */
    skipSpecialContent() {
        if (this.isShowingSpecialContent) {
            this.endSpecialContent();
            return true;
        }
        return false;
    }

    /**
     * Jump to previous sentence
     */
    previousSentence() {
        this.clearSpecialContent();
        const wasPaused = !this.isPlaying;
        const startIndex = this.currentIndex;
        const now = Date.now();

        // Find current word index (counting only words)
        let currentWordIndex = 0;
        for (let i = 0; i < this.currentIndex; i++) {
            if (this.items[i].type === 'word') currentWordIndex++;
        }

        // Find the sentence start index (in sentenceStarts array) before current position
        let targetSentenceIdx = 0;
        for (let i = this.sentenceStarts.length - 1; i >= 0; i--) {
            if (this.sentenceStarts[i] < currentWordIndex) {
                targetSentenceIdx = i;
                break;
            }
        }

        // Rapid back-press detection (play mode only):
        // If pressed again within 800ms after jumping to a sentence, go to the one before it
        const timeSinceLastBack = now - this.lastBackPressTime;
        const rapidBackPress = !wasPaused &&
                               (timeSinceLastBack < 800) &&
                               (this.lastSkipToSentenceIdx >= 0) &&
                               (targetSentenceIdx === this.lastSkipToSentenceIdx) &&
                               (targetSentenceIdx > 0);

        if (rapidBackPress) {
            targetSentenceIdx = targetSentenceIdx - 1;
        }

        const targetWordIndex = this.sentenceStarts[targetSentenceIdx];

        // Find item index for this word index
        let wordCount = 0;
        let targetIndex = 0;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].type === 'word') {
                if (wordCount === targetWordIndex) {
                    targetIndex = i;
                    break;
                }
                wordCount++;
            }
        }

        console.log(`[prevSentence] targetIndex=${targetIndex} (searching for special between ${startIndex - 1} and ${targetIndex})`);

        // Check for special content between target and current (show last one first when going back)
        for (let i = startIndex - 1; i >= targetIndex; i--) {
            if (this.items[i].type === 'special') {
                this.currentIndex = i;
                this.easeInCount = 0;
                this.notifyProgress();
                if (wasPaused) {
                    // In paused mode, just navigate to it without countdown
                    this.notifyWordChange();
                } else {
                    // In playing mode, show with countdown
                    this.showSpecialContent(this.items[i]);
                }
                // Reset rapid back-press tracking when special content is involved
                this.lastBackPressTime = 0;
                this.lastSkipToSentenceIdx = -1;
                return;
            }
        }

        this.currentIndex = targetIndex;
        this.easeInCount = 0;
        this.notifyWordChange();
        this.notifyProgress();

        // Track for rapid back-press detection (play mode only, reset if special content involved)
        const cameFromSpecial = this.items[startIndex]?.type === 'special';
        if (wasPaused || cameFromSpecial) {
            this.lastBackPressTime = 0;
            this.lastSkipToSentenceIdx = -1;
        } else {
            this.lastBackPressTime = now;
            this.lastSkipToSentenceIdx = targetSentenceIdx;
        }

        if (!wasPaused && this.isPlaying) {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            this.scheduleNext();
        }
    }

    /**
     * Jump to next sentence
     */
    nextSentence() {
        this.clearSpecialContent();
        const wasPaused = !this.isPlaying;
        const startIndex = this.currentIndex;

        // Find current word index
        let currentWordIndex = 0;
        for (let i = 0; i < this.currentIndex; i++) {
            if (this.items[i].type === 'word') currentWordIndex++;
        }

        // Find the next sentence start
        let targetWordIndex = currentWordIndex;
        for (const start of this.sentenceStarts) {
            if (start > currentWordIndex) {
                targetWordIndex = start;
                break;
            }
        }

        // Find item index for this word index
        let wordCount = 0;
        let targetIndex = this.currentIndex;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].type === 'word') {
                if (wordCount === targetWordIndex) {
                    targetIndex = i;
                    break;
                }
                wordCount++;
            }
        }

        targetIndex = Math.min(targetIndex, this.items.length - 1);


        // Check for special content between current and target
        for (let i = startIndex + 1; i <= targetIndex; i++) {
            if (this.items[i].type === 'special') {
                this.currentIndex = i;
                this.easeInCount = 0;
                this.notifyProgress();
                if (wasPaused) {
                    // In paused mode, just navigate to it without countdown
                    this.notifyWordChange();
                } else {
                    // In playing mode, show with countdown
                    this.showSpecialContent(this.items[i]);
                }
                return;
            }
        }

        this.currentIndex = targetIndex;
        this.easeInCount = 0;
        this.notifyWordChange();
        this.notifyProgress();

        if (!wasPaused && this.isPlaying) {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            this.scheduleNext();
        }
    }

    /**
     * Move to previous word
     */
    previousWord() {
        this.clearSpecialContent();
        if (this.currentIndex > 0) {
            this.currentIndex--;
            // Skip paragraph breaks
            while (this.currentIndex > 0 && this.items[this.currentIndex].type === 'paragraph-break') {
                this.currentIndex--;
            }
            this.notifyWordChange();
            this.notifyProgress();
        }
    }

    /**
     * Move to next word
     */
    nextWord() {
        this.clearSpecialContent();
        if (this.currentIndex < this.items.length - 1) {
            this.currentIndex++;
            // Skip paragraph breaks
            while (this.currentIndex < this.items.length - 1 &&
                   this.items[this.currentIndex].type === 'paragraph-break') {
                this.currentIndex++;
            }
            this.notifyWordChange();
            this.notifyProgress();
        }
    }

    /**
     * Get the current word
     * @returns {string}
     */
    getCurrentWord() {
        const item = this.items[this.currentIndex];
        if (item?.type === 'word') {
            return item.value;
        }
        return '';
    }

    /**
     * Get the current item
     * @returns {Object|null}
     */
    getCurrentItem() {
        return this.items[this.currentIndex] || null;
    }

    /**
     * Get context items around current position (words and special content)
     * @param {number} count - Number of items before and after
     * @returns {{words: Array<{word: string, offset: number, type?: string, html?: string, contentType?: string}>, currentOffset: number}}
     */
    getContext(count = 20) {
        const result = [];

        // Find displayable items around current position (words and special content)
        let currentItemPos = 0;
        const displayItems = [];

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.type === 'word') {
                displayItems.push({ index: i, word: item.value, type: 'word' });
            } else if (item.type === 'special') {
                displayItems.push({
                    index: i,
                    type: 'special',
                    contentType: item.contentType,
                    html: item.html
                });
            }
            if (i === this.currentIndex) {
                currentItemPos = displayItems.length - 1;
            }
        }

        const start = Math.max(0, currentItemPos - count);
        const end = Math.min(displayItems.length - 1, currentItemPos + count);

        for (let i = start; i <= end; i++) {
            const item = displayItems[i];
            if (item.type === 'word') {
                result.push({
                    word: item.word,
                    offset: i - currentItemPos,
                    type: 'word'
                });
            } else {
                result.push({
                    offset: i - currentItemPos,
                    type: 'special',
                    contentType: item.contentType,
                    html: item.html
                });
            }
        }

        return {
            words: result,
            currentOffset: currentItemPos - start
        };
    }

    /**
     * Get progress information
     * @returns {{current: number, total: number, percent: number, specialCount: number}}
     */
    getProgress() {
        // Count only words and special content for progress
        let total = 0;
        let current = 0;
        let specialCount = 0;

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.type === 'word' || item.type === 'special') {
                total++;
                if (i <= this.currentIndex) current++;
                if (item.type === 'special') specialCount++;
            }
        }

        // Count remaining special items for time estimate
        let remainingSpecialCount = 0;
        for (let i = this.currentIndex + 1; i < this.items.length; i++) {
            if (this.items[i].type === 'special') remainingSpecialCount++;
        }

        const percent = total > 0 ? (current / total) * 100 : 0;

        return {
            current,
            total,
            percent,
            specialCount,
            remainingSpecialCount
        };
    }

    /**
     * Get all items
     * @returns {Array}
     */
    getItems() {
        return this.items;
    }

    /**
     * Notify listeners of word change
     */
    notifyWordChange() {
        if (this.onWordChange) {
            this.onWordChange(this.getCurrentWord(), this.getContext());
        }
    }

    /**
     * Notify listeners of state change
     */
    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.isPlaying);
        }
    }

    /**
     * Notify listeners of progress change
     */
    notifyProgress() {
        if (this.onProgress) {
            this.onProgress(this.getProgress());
        }
    }
}
