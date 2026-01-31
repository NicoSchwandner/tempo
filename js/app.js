/**
 * Word Runner - Main Application
 */

import { splitAtORP } from './orp.js';
import { RSVPEngine } from './rsvp.js';

const STORAGE_KEY_WPM = 'word-runner-wpm';
const DEFAULT_WPM = 250;

class WordRunnerApp {
    constructor() {
        this.engine = new RSVPEngine();
        this.elements = {};

        this.init();
    }

    init() {
        this.cacheElements();
        this.loadSettings();
        this.bindEvents();
        this.setupEngine();
        this.updateWPMDisplay();
        this.updateProgress(this.engine.getProgress());
        this.updateDisplayMode(false); // Start in paused mode showing context
        // Update display after context is visible so centering works
        requestAnimationFrame(() => this.updateDisplay());
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

            // Text input
            textInput: document.getElementById('text-input'),
            submitTextBtn: document.getElementById('submit-text-btn'),
            resetTextBtn: document.getElementById('reset-text-btn')
        };
    }

    bindEvents() {
        // Play/Pause button
        this.elements.playPauseBtn.addEventListener('click', () => {
            this.engine.toggle();
        });

        // Start Over button (resets playback position)
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });
    }

    setupEngine() {
        this.engine.onWordChange = (word, context) => {
            this.updateDisplay(word, context);
        };

        this.engine.onStateChange = (isPlaying) => {
            this.updatePlayButton(isPlaying);
            this.updateDisplayMode(isPlaying);
            // Refresh context display when pausing to show current word centered
            if (!isPlaying) {
                this.updateDisplay();
            }
        };

        this.engine.onProgress = (progress) => {
            this.updateProgress(progress);
        };

        this.engine.onParagraphBreak = () => {
            this.showParagraphBreak();
        };
    }

    showParagraphBreak() {
        // Briefly show empty/blank display for paragraph break
        this.elements.wordBefore.textContent = '';
        this.elements.wordOrp.textContent = '¶';
        this.elements.wordAfter.textContent = '';
    }

    handleKeyboard(e) {
        // Ignore if typing in textarea
        if (e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.engine.toggle();
                break;

            case 'ArrowLeft':
                e.preventDefault();
                this.engine.previousSentence();
                break;

            case 'ArrowRight':
                e.preventDefault();
                this.engine.nextSentence();
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

        // Update single word display
        const parts = splitAtORP(word);
        this.elements.wordBefore.textContent = parts.before;
        this.elements.wordOrp.textContent = parts.orp;
        this.elements.wordAfter.textContent = parts.after;

        // Update context display
        this.updateContextDisplay(context);
    }

    updateContextDisplay(context) {
        this.elements.contextDisplay.innerHTML = '';
        let currentWordElement = null;

        for (const item of context.words) {
            const span = document.createElement('span');
            span.className = 'context-word';

            // Calculate opacity based on distance from center
            const distance = Math.abs(item.offset);
            const opacity = Math.max(0.2, 1 - (distance * 0.05));
            span.style.opacity = opacity;

            if (item.offset === 0) {
                // Current word - show with ORP highlighting
                const parts = splitAtORP(item.word);
                span.innerHTML = `<span class="context-before">${parts.before}</span><span class="context-orp">${parts.orp}</span><span class="context-after">${parts.after}</span>`;
                span.classList.add('context-current');
                currentWordElement = span;
            } else {
                span.textContent = item.word;
            }

            this.elements.contextDisplay.appendChild(span);
        }

        // Center the current word after rendering
        if (currentWordElement) {
            requestAnimationFrame(() => {
                const parent = this.elements.contextDisplay.parentElement;
                const parentWidth = parent.clientWidth;
                const containerRect = this.elements.contextDisplay.getBoundingClientRect();
                const wordRect = currentWordElement.getBoundingClientRect();

                // Calculate word center position relative to container start
                const wordCenterInContainer = (wordRect.left - containerRect.left) + (wordRect.width / 2);

                // Move container so word center aligns with parent center
                const translateX = (parentWidth / 2) - wordCenterInContainer;
                this.elements.contextDisplay.style.transform = `translateX(${translateX}px) translateY(-50%)`;
            });
        }
    }

    updateDisplayMode(isPlaying) {
        if (isPlaying) {
            this.elements.wordDisplay.classList.remove('hidden');
            this.elements.contextDisplay.classList.add('hidden');
        } else {
            this.elements.wordDisplay.classList.add('hidden');
            this.elements.contextDisplay.classList.remove('hidden');
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
        this.updateTimeRemaining(progress.total - progress.current);
    }

    updateTimeRemaining(wordsRemaining) {
        const wpm = parseInt(this.elements.wpmSlider.value, 10);
        const secondsRemaining = Math.ceil((wordsRemaining / wpm) * 60);
        const minutes = Math.floor(secondsRemaining / 60);
        const seconds = secondsRemaining % 60;

        if (minutes > 0) {
            this.elements.timeRemaining.textContent = `${minutes}m ${seconds}s remaining`;
        } else {
            this.elements.timeRemaining.textContent = `${seconds}s remaining`;
        }
    }

    submitText() {
        const text = this.elements.textInput.value.trim();
        if (text) {
            this.engine.setText(text);
            this.updateDisplayMode(false);
        }
    }

    resetText() {
        this.elements.textInput.value = this.engine.getDefaultText();
        this.engine.setText(this.engine.getDefaultText());
        this.updateDisplayMode(false);
    }

    resetWPM() {
        localStorage.removeItem(STORAGE_KEY_WPM);
        this.elements.wpmSlider.value = DEFAULT_WPM;
        this.engine.setWPM(DEFAULT_WPM);
        this.updateWPMDisplay();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WordRunnerApp();
});
