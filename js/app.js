/**
 * Tempo - Main Application
 */

import { splitAtORP } from './orp.js';
import { RSVPEngine } from './rsvp.js';
import { extractURLFromPath, fetchContent } from './url-loader.js';
import { parseHTMLToContent } from './content-parser.js';

const STORAGE_KEY_WPM = 'tempo-wpm';
const DEFAULT_WPM = 250;

// Display states
const DISPLAY_STATE = {
    PLAYING: 'playing',
    PAUSED: 'paused',
    LOADING: 'loading',
    ERROR: 'error',
    SPECIAL: 'special'
};

class TempoApp {
    constructor() {
        this.engine = new RSVPEngine();
        this.elements = {};
        this.currentDisplayState = DISPLAY_STATE.PAUSED;
        this.sourceUrl = null;

        this.init();
    }

    async init() {
        this.cacheElements();
        this.loadSettings();
        this.bindEvents();
        this.setupEngine();

        // Check for URL in path
        const urlInfo = extractURLFromPath();
        if (urlInfo) {
            await this.loadFromURL(urlInfo.url, urlInfo.anchor);
        } else {
            this.showTextInputSection(true);
            this.updateNavActiveState(true);
            this.updateWPMDisplay();
            this.updateProgress(this.engine.getProgress());
            this.updateDisplayState(DISPLAY_STATE.PAUSED);
            requestAnimationFrame(() => this.updateDisplay());
        }
    }

    async loadFromURL(url, anchor = null) {
        this.updateDisplayState(DISPLAY_STATE.LOADING);
        this.setLoadingStatus('Fetching article...');

        try {
            const { html, finalUrl } = await fetchContent(url);
            this.setLoadingStatus('Extracting content...');

            const { title, items, anchorIndex } = await parseHTMLToContent(html, finalUrl, anchor);

            this.sourceUrl = finalUrl;
            this.showSourceURL(finalUrl, title);
            this.showTextInputSection(false);
            this.updateNavActiveState(false);

            this.engine.setContent(items);

            // Jump to anchor position if found
            if (anchor && anchorIndex > 0) {
                this.engine.jumpToIndex(anchorIndex);
            }

            this.updateWPMDisplay();
            this.updateProgress(this.engine.getProgress());
            this.updateDisplayState(DISPLAY_STATE.PAUSED);
            requestAnimationFrame(() => this.updateDisplay());

        } catch (error) {
            console.error('Failed to load URL:', error);
            this.showError(error.message || 'Could not fetch article. Check the URL and try again.');
        }
    }

    loadSettings() {
        const savedWPM = localStorage.getItem(STORAGE_KEY_WPM);
        const wpm = savedWPM ? parseInt(savedWPM, 10) : DEFAULT_WPM;
        this.elements.wpmSlider.value = wpm;
        this.engine.setWPM(wpm);
    }

    saveWPM(wpm) {
        localStorage.setItem(STORAGE_KEY_WPM, wpm.toString());
    }

    cacheElements() {
        this.elements = {
            // Display
            wordDisplay: document.getElementById('word-display'),
            contextDisplay: document.getElementById('context-display'),
            wordBefore: document.getElementById('word-before'),
            wordOrp: document.getElementById('word-orp'),
            wordAfter: document.getElementById('word-after'),

            // Controls
            playPauseBtn: document.getElementById('play-pause-btn'),
            startOverBtn: document.getElementById('start-over-btn'),
            wpmSlider: document.getElementById('wpm-slider'),
            wpmValue: document.getElementById('wpm-value'),
            resetWpmBtn: document.getElementById('reset-wpm-btn'),

            // Progress
            progressBar: document.getElementById('progress-bar'),
            progressText: document.getElementById('progress-text'),
            timeRemaining: document.getElementById('time-remaining'),

            // Navigation
            logoLink: document.getElementById('logo-link'),
            customTextBtn: document.getElementById('custom-text-btn'),
            loadUrlBtn: document.getElementById('load-url-btn'),

            // Text input
            textInputSection: document.getElementById('text-input-section'),
            textInput: document.getElementById('text-input'),
            submitTextBtn: document.getElementById('submit-text-btn'),
            resetTextBtn: document.getElementById('reset-text-btn'),

            // Loading/Error overlays
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingStatus: document.getElementById('loading-status'),
            errorDisplay: document.getElementById('error-display'),
            errorMessage: document.getElementById('error-message'),
            dismissErrorBtn: document.getElementById('dismiss-error-btn'),

            // Source URL
            sourceUrl: document.getElementById('source-url'),
            sourceLink: document.getElementById('source-link'),

            // Special content
            specialOverlay: document.getElementById('special-content-overlay'),
            specialContainer: document.getElementById('special-content-container'),
            countdownBadge: document.getElementById('countdown-badge')
        };
    }

    bindEvents() {
        // Play/Pause button
        this.elements.playPauseBtn.addEventListener('click', () => {
            this.engine.toggle();
        });

        // Start Over button
        this.elements.startOverBtn.addEventListener('click', () => {
            this.engine.stop();
        });

        // WPM slider
        this.elements.wpmSlider.addEventListener('input', (e) => {
            const wpm = parseInt(e.target.value, 10);
            this.engine.setWPM(wpm);
            this.saveWPM(wpm);
            this.updateWPMDisplay();
            this.updateProgress(this.engine.getProgress());
        });

        // Reset WPM button
        this.elements.resetWpmBtn.addEventListener('click', () => {
            this.resetWPM();
        });

        // Text submission
        this.elements.submitTextBtn.addEventListener('click', () => {
            this.submitText();
        });

        // Reset text
        this.elements.resetTextBtn.addEventListener('click', () => {
            this.resetText();
        });

        // Logo link - go to home/custom text mode
        if (this.elements.logoLink) {
            this.elements.logoLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCustomTextMode();
            });
        }

        // Custom Text navigation link
        if (this.elements.customTextBtn) {
            this.elements.customTextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCustomTextMode();
            });
        }

        // Load URL navigation link
        if (this.elements.loadUrlBtn) {
            this.elements.loadUrlBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.promptLoadUrl();
            });
        }

        // Dismiss error button
        if (this.elements.dismissErrorBtn) {
            this.elements.dismissErrorBtn.addEventListener('click', () => {
                this.hideError();
                this.engine.setText(this.engine.getDefaultText());
                this.updateDisplayState(DISPLAY_STATE.PAUSED);
                this.updateDisplay();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });

        // Scroll/swipe for word navigation
        document.addEventListener('wheel', (e) => {
            this.handleWheel(e);
        }, { passive: false });

        // Handle hash changes for URL navigation
        window.addEventListener('hashchange', () => {
            const urlInfo = extractURLFromPath();
            if (urlInfo) {
                this.loadFromURL(urlInfo.url, urlInfo.anchor);
            }
        });
    }

    handleWheel(e) {
        if (e.target.tagName === 'TEXTAREA') return;
        if (Math.abs(e.deltaX) < 1) return;
        // Disable horizontal scroll navigation while playing
        if (this.engine.isPlaying) return;

        e.preventDefault();

        this.scrollAccumulator = (this.scrollAccumulator || 0) + e.deltaX;
        const threshold = 50;

        if (Math.abs(this.scrollAccumulator) >= threshold) {
            if (this.scrollAccumulator > 0) {
                this.engine.nextWord();
            } else {
                this.engine.previousWord();
            }
            this.scrollAccumulator = 0;
        }
    }

    setupEngine() {
        this.engine.onWordChange = (word, context) => {
            this.updateDisplay(word, context);
        };

        this.engine.onStateChange = (isPlaying) => {
            this.updatePlayButton(isPlaying);
            if (!this.engine.isShowingSpecialContent) {
                this.updateDisplayState(isPlaying ? DISPLAY_STATE.PLAYING : DISPLAY_STATE.PAUSED);
            }
            if (!isPlaying && !this.engine.isShowingSpecialContent) {
                this.updateDisplay();
            }
        };

        this.engine.onProgress = (progress) => {
            this.updateProgress(progress);
        };

        this.engine.onParagraphBreak = () => {
            this.showParagraphBreak();
        };

        this.engine.onSpecialContent = (item, countdown) => {
            this.showSpecialContent(item, countdown);
        };

        this.engine.onSpecialCountdownTick = (seconds) => {
            this.updateCountdown(seconds);
        };

        this.engine.onSpecialContentEnd = () => {
            this.hideSpecialContent();
        };
    }

    showParagraphBreak() {
        this.elements.wordBefore.textContent = '';
        this.elements.wordOrp.textContent = '¶';
        this.elements.wordAfter.textContent = '';
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.engine.toggle();
                break;

            case 'ArrowLeft':
                e.preventDefault();
                // Always go to previous sentence (clears special content if showing)
                this.engine.previousSentence();
                break;

            case 'ArrowRight':
                e.preventDefault();
                // Skip special content if showing, otherwise go to next sentence
                if (!this.engine.skipSpecialContent()) {
                    this.engine.nextSentence();
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.adjustWPM(25);
                break;

            case 'ArrowDown':
                e.preventDefault();
                this.adjustWPM(-25);
                break;
        }
    }

    adjustWPM(delta) {
        const current = parseInt(this.elements.wpmSlider.value, 10);
        const newWPM = Math.max(100, Math.min(1000, current + delta));
        this.elements.wpmSlider.value = newWPM;
        this.engine.setWPM(newWPM);
        this.saveWPM(newWPM);
        this.updateWPMDisplay();
        this.updateProgress(this.engine.getProgress());
    }

    updateDisplay(word, context) {
        word = word || this.engine.getCurrentWord();
        context = context || this.engine.getContext();

        const parts = splitAtORP(word);
        this.elements.wordBefore.textContent = parts.before;
        this.elements.wordOrp.textContent = parts.orp;
        this.elements.wordAfter.textContent = parts.after;

        this.updateContextDisplay(context);
    }

    updateContextDisplay(context) {
        this.elements.contextDisplay.innerHTML = '';
        let currentWordElement = null;

        for (const item of context.words) {
            const span = document.createElement('span');
            span.className = 'context-word';

            const distance = Math.abs(item.offset);
            const opacity = Math.max(0.2, 1 - (distance * 0.05));
            span.style.opacity = opacity;

            if (item.type === 'special') {
                // Show thumbnail or placeholder for special content
                span.classList.add('context-special');
                if (item.contentType === 'image') {
                    // Extract image src and show thumbnail
                    const srcMatch = item.html.match(/src="([^"]+)"/);
                    if (srcMatch) {
                        const img = document.createElement('img');
                        img.src = srcMatch[1];
                        img.className = 'context-thumbnail';
                        img.alt = 'Image';
                        span.appendChild(img);
                    } else {
                        span.textContent = '🖼';
                    }
                } else if (item.contentType === 'code') {
                    span.textContent = '{ }';
                    span.classList.add('context-code-icon');
                } else if (item.contentType === 'table') {
                    span.textContent = '▦';
                    span.classList.add('context-table-icon');
                }
                if (item.offset === 0) {
                    span.classList.add('context-current');
                    currentWordElement = span;
                }
            } else if (item.offset === 0) {
                const parts = splitAtORP(item.word);
                span.innerHTML = `<span class="context-before">${parts.before}</span><span class="context-orp">${parts.orp}</span><span class="context-after">${parts.after}</span>`;
                span.classList.add('context-current');
                currentWordElement = span;
            } else {
                span.textContent = item.word;
            }

            this.elements.contextDisplay.appendChild(span);
        }

        if (currentWordElement) {
            requestAnimationFrame(() => {
                const parent = this.elements.contextDisplay.parentElement;
                const parentWidth = parent.clientWidth;
                const containerRect = this.elements.contextDisplay.getBoundingClientRect();
                const wordRect = currentWordElement.getBoundingClientRect();

                const wordCenterInContainer = (wordRect.left - containerRect.left) + (wordRect.width / 2);
                const translateX = (parentWidth / 2) - wordCenterInContainer;
                this.elements.contextDisplay.style.transform = `translateX(${translateX}px) translateY(-50%)`;
            });
        }
    }

    /**
     * Update display state - manages visibility of all display areas
     * @param {string} state - One of DISPLAY_STATE values
     */
    updateDisplayState(state) {
        this.currentDisplayState = state;

        // Hide all first
        this.elements.wordDisplay?.classList.add('hidden');
        this.elements.contextDisplay?.classList.add('hidden');
        this.elements.loadingOverlay?.classList.add('hidden');
        this.elements.errorDisplay?.classList.add('hidden');
        this.elements.specialOverlay?.classList.add('hidden');

        // Show appropriate display
        switch (state) {
            case DISPLAY_STATE.PLAYING:
                this.elements.wordDisplay?.classList.remove('hidden');
                break;
            case DISPLAY_STATE.PAUSED:
                this.elements.contextDisplay?.classList.remove('hidden');
                break;
            case DISPLAY_STATE.LOADING:
                this.elements.loadingOverlay?.classList.remove('hidden');
                break;
            case DISPLAY_STATE.ERROR:
                this.elements.errorDisplay?.classList.remove('hidden');
                break;
            case DISPLAY_STATE.SPECIAL:
                this.elements.specialOverlay?.classList.remove('hidden');
                break;
        }
    }

    // Loading state methods
    setLoadingStatus(message) {
        if (this.elements.loadingStatus) {
            this.elements.loadingStatus.textContent = message;
        }
    }

    // Error handling
    showError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
        }
        this.updateDisplayState(DISPLAY_STATE.ERROR);
    }

    hideError() {
        this.updateDisplayState(DISPLAY_STATE.PAUSED);
    }

    // Source URL display
    showSourceURL(url, title) {
        if (this.elements.sourceUrl && this.elements.sourceLink) {
            this.elements.sourceUrl.classList.remove('hidden');
            this.elements.sourceLink.href = url;
            this.elements.sourceLink.textContent = title || url;
        }
    }

    // Special content handling
    showSpecialContent(item, countdown) {
        this.updateDisplayState(DISPLAY_STATE.SPECIAL);
        if (this.elements.specialContainer) {
            this.elements.specialContainer.innerHTML = item.html;
        }
        this.updateCountdown(countdown);
    }

    updateCountdown(seconds) {
        if (this.elements.countdownBadge) {
            if (seconds === null) {
                // Hide countdown when paused
                this.elements.countdownBadge.classList.add('hidden');
            } else {
                this.elements.countdownBadge.classList.remove('hidden');
                this.elements.countdownBadge.textContent = seconds;
            }
        }
    }

    hideSpecialContent() {
        if (this.engine.isPlaying) {
            this.updateDisplayState(DISPLAY_STATE.PLAYING);
        } else {
            this.updateDisplayState(DISPLAY_STATE.PAUSED);
        }
    }

    updatePlayButton(isPlaying) {
        this.elements.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
        this.elements.playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }

    updateWPMDisplay() {
        this.elements.wpmValue.textContent = `${this.elements.wpmSlider.value} WPM`;
    }

    updateProgress(progress) {
        this.elements.progressBar.style.width = `${progress.percent}%`;
        this.elements.progressText.textContent = `${progress.current} / ${progress.total}`;
        this.updateTimeRemaining(progress);
    }

    updateTimeRemaining(progress) {
        const wpm = parseInt(this.elements.wpmSlider.value, 10);
        const wordsRemaining = progress.total - progress.current;

        // Count remaining words (exclude special content already counted)
        const items = this.engine.getItems();
        let remainingWordCount = 0;
        let remainingSpecialCount = 0;

        for (let i = this.engine.currentIndex + 1; i < items.length; i++) {
            if (items[i].type === 'word') remainingWordCount++;
            else if (items[i].type === 'special') remainingSpecialCount++;
        }

        // Time for words + 5 seconds per special item
        const wordSeconds = (remainingWordCount / wpm) * 60;
        const specialSeconds = remainingSpecialCount * 5;
        const totalSeconds = Math.ceil(wordSeconds + specialSeconds);

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes > 0) {
            this.elements.timeRemaining.textContent = `${minutes}m ${seconds}s remaining`;
        } else {
            this.elements.timeRemaining.textContent = `${seconds}s remaining`;
        }
    }

    submitText() {
        const text = this.elements.textInput.value.trim();
        if (text) {
            // Hide source URL when using custom text
            if (this.elements.sourceUrl) {
                this.elements.sourceUrl.classList.add('hidden');
            }
            this.sourceUrl = null;
            this.engine.setText(text);
            this.updateDisplayState(DISPLAY_STATE.PAUSED);
        }
    }

    resetText() {
        this.elements.textInput.value = this.engine.getDefaultText();
        if (this.elements.sourceUrl) {
            this.elements.sourceUrl.classList.add('hidden');
        }
        this.sourceUrl = null;
        this.engine.setText(this.engine.getDefaultText());
        this.updateDisplayState(DISPLAY_STATE.PAUSED);
    }

    resetWPM() {
        localStorage.removeItem(STORAGE_KEY_WPM);
        this.elements.wpmSlider.value = DEFAULT_WPM;
        this.engine.setWPM(DEFAULT_WPM);
        this.updateWPMDisplay();
    }

    // Show/hide text input section
    showTextInputSection(show) {
        if (this.elements.textInputSection) {
            this.elements.textInputSection.classList.toggle('hidden', !show);
        }
    }

    // Update active state of navigation links
    updateNavActiveState(isCustomText) {
        if (this.elements.customTextBtn) {
            this.elements.customTextBtn.classList.toggle('active', isCustomText);
        }
    }

    // Navigate to custom text mode (root URL)
    showCustomTextMode() {
        // Clear URL hash and navigate to root
        window.location.hash = '';
        this.sourceUrl = null;
        if (this.elements.sourceUrl) {
            this.elements.sourceUrl.classList.add('hidden');
        }
        this.showTextInputSection(true);
        this.updateNavActiveState(true);
        this.engine.setText(this.engine.getDefaultText());
        this.updateDisplayState(DISPLAY_STATE.PAUSED);
        this.updateDisplay();
        this.updateProgress(this.engine.getProgress());
    }

    // Prompt user for URL and load it
    promptLoadUrl() {
        const url = prompt('Enter article URL:');
        if (url && url.trim()) {
            window.location.hash = url.trim();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TempoApp();
});
