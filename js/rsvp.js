/**
 * RSVP (Rapid Serial Visual Presentation) Engine
 *
 * Handles text parsing, playback timing, and word navigation.
 */

const DEFAULT_TEXT = `The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the alphabet at least once.

Speed reading is a collection of methods that increase reading rates without compromising comprehension. RSVP is one of the most effective techniques available. By presenting words one at a time in a fixed position, your eyes don't need to move across the page. This eliminates saccades, the quick eye movements between words, which typically consume about 10% of reading time.

The Optimal Recognition Point helps your brain process each word faster. Research shows that we don't read every letter in a word. Instead, our brain recognizes word shapes and key letters. By centering the ORP and highlighting it, Word Runner helps you focus on exactly the right spot.

Try adjusting the speed to find your optimal reading pace. Most people can comfortably read at 250-350 WPM with practice. Some experienced speed readers achieve 500-700 WPM while maintaining good comprehension.

Remember to take breaks. Speed reading requires concentration, and your comprehension will decrease if you're fatigued. Happy reading!`;

export class RSVPEngine {
    constructor() {
        this.words = [];
        this.sentenceStarts = []; // Indices where sentences begin
        this.paragraphEnds = []; // Indices where paragraphs end
        this.currentIndex = 0;
        this.isPlaying = false;
        this.wpm = 250;
        this.timeoutId = null;
        this.easeInCount = 0; // Track words since playback started
        this.onWordChange = null; // Callback for word changes
        this.onStateChange = null; // Callback for play/pause state
        this.onProgress = null; // Callback for progress updates
        this.onParagraphBreak = null; // Callback for paragraph breaks

        this.setText(DEFAULT_TEXT);
    }

    /**
     * Parse text into words and track sentence/paragraph boundaries
     * @param {string} text - The text to parse
     */
    setText(text) {
        this.stop();
        this.words = [];
        this.sentenceStarts = [0];
        this.paragraphEnds = [];

        // Split text into paragraphs first (by double newlines)
        const paragraphs = text.trim().split(/\n\s*\n/);
        let wordIndex = 0;

        for (let p = 0; p < paragraphs.length; p++) {
            const paragraph = paragraphs[p].trim();
            if (!paragraph) continue;

            // Split paragraph into words
            const rawWords = paragraph.split(/\s+/).filter(w => w.length > 0);

            for (let i = 0; i < rawWords.length; i++) {
                const word = rawWords[i];
                this.words.push(word);

                // Check if this word ends a sentence
                if (/[.!?]$/.test(word) && (i < rawWords.length - 1 || p < paragraphs.length - 1)) {
                    this.sentenceStarts.push(wordIndex + 1);
                }

                wordIndex++;
            }

            // Mark end of paragraph (except for the last one)
            if (p < paragraphs.length - 1 && this.words.length > 0) {
                this.paragraphEnds.push(this.words.length - 1);
            }
        }

        this.currentIndex = 0;
        this.notifyWordChange();
        this.notifyProgress();
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

        // Ease-in: gradually increase speed over first 5 words
        if (this.easeInCount < 5) {
            const easeFactors = [0.5, 0.6, 0.7, 0.85, 1.0];
            const factor = easeFactors[this.easeInCount];
            return baseInterval / factor; // Slower = longer interval
        }

        return baseInterval;
    }

    /**
     * Start or resume playback
     */
    play() {
        if (this.isPlaying) return;

        // If at the end, start over from the beginning
        if (this.currentIndex >= this.words.length - 1) {
            this.currentIndex = 0;
            this.notifyWordChange();
            this.notifyProgress();
        }

        this.isPlaying = true;
        this.easeInCount = 0; // Reset ease-in on play
        this.notifyStateChange();
        this.scheduleNext();
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;

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
        this.currentIndex = 0;
        this.easeInCount = 0;
        this.notifyWordChange();
        this.notifyProgress();
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
     * Advance to the next word
     */
    advance() {
        if (this.currentIndex < this.words.length - 1) {
            // Check if we just finished a paragraph
            const wasAtParagraphEnd = this.paragraphEnds.includes(this.currentIndex);

            this.currentIndex++;
            this.easeInCount++;
            this.notifyWordChange();
            this.notifyProgress();

            // If we crossed a paragraph boundary, show a break
            if (wasAtParagraphEnd && this.onParagraphBreak) {
                this.onParagraphBreak();
                // Add extra delay for paragraph break (500ms)
                this.timeoutId = setTimeout(() => {
                    this.scheduleNext();
                }, 500);
            } else {
                this.scheduleNext();
            }
        } else {
            // Reached the end
            this.pause();
        }
    }

    /**
     * Jump to previous sentence
     */
    previousSentence() {
        const wasPaused = !this.isPlaying;

        // Find the sentence start before current position
        let targetStart = 0;
        for (let i = this.sentenceStarts.length - 1; i >= 0; i--) {
            if (this.sentenceStarts[i] < this.currentIndex) {
                // If we're at the start of a sentence, go to previous one
                if (this.currentIndex === this.sentenceStarts[i + 1]) {
                    targetStart = this.sentenceStarts[i];
                } else {
                    targetStart = this.sentenceStarts[i];
                }
                break;
            }
        }

        this.currentIndex = targetStart;
        this.easeInCount = 0; // Reset ease-in after jump
        this.notifyWordChange();
        this.notifyProgress();

        // If was playing, reschedule
        if (!wasPaused && this.isPlaying) {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            this.scheduleNext();
        }
    }

    /**
     * Jump to next sentence
     */
    nextSentence() {
        const wasPaused = !this.isPlaying;

        // Find the next sentence start after current position
        let targetStart = this.currentIndex;
        for (const start of this.sentenceStarts) {
            if (start > this.currentIndex) {
                targetStart = start;
                break;
            }
        }

        this.currentIndex = Math.min(targetStart, this.words.length - 1);
        this.easeInCount = 0; // Reset ease-in after jump
        this.notifyWordChange();
        this.notifyProgress();

        // If was playing, reschedule
        if (!wasPaused && this.isPlaying) {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            this.scheduleNext();
        }
    }

    /**
     * Move to previous word
     */
    previousWord() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.notifyWordChange();
            this.notifyProgress();
        }
    }

    /**
     * Move to next word
     */
    nextWord() {
        if (this.currentIndex < this.words.length - 1) {
            this.currentIndex++;
            this.notifyWordChange();
            this.notifyProgress();
        }
    }

    /**
     * Get the current word
     * @returns {string}
     */
    getCurrentWord() {
        return this.words[this.currentIndex] || '';
    }

    /**
     * Get context words around current position
     * @param {number} count - Number of words before and after
     * @returns {{words: Array<{word: string, offset: number}>, currentOffset: number}}
     */
    getContext(count = 20) {
        const result = [];
        const start = Math.max(0, this.currentIndex - count);
        const end = Math.min(this.words.length - 1, this.currentIndex + count);

        for (let i = start; i <= end; i++) {
            result.push({
                word: this.words[i],
                offset: i - this.currentIndex
            });
        }

        return {
            words: result,
            currentOffset: this.currentIndex - start
        };
    }

    /**
     * Get progress information
     * @returns {{current: number, total: number, percent: number}}
     */
    getProgress() {
        const total = this.words.length;
        const current = this.currentIndex + 1;
        const percent = total > 0 ? (current / total) * 100 : 0;

        return { current, total, percent };
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
