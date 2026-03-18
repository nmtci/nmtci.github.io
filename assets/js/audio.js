const AudioManager = {
    synth: window.speechSynthesis,
    utterance: null,
    isPlaying: false,
    isPaused: false,
    voices: [],
    paraObjects: [],
    currentIndex: 0,

    init() {
        this.populateVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.populateVoices();
        }
        this.loadSettings();
        this.bindEvents();
    },

    bindEvents() {
        DOM.audioBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggle();
        });

        DOM.audioSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.audioMenu.classList.toggle("active");
            DOM.menu.classList.remove("active");
        });

        document.addEventListener("click", (e) => {
            if (
                DOM.audioMenu.classList.contains("active") &&
                !DOM.audioMenu.contains(e.target) &&
                e.target !== DOM.audioSettingsBtn
            ) {
                DOM.audioMenu.classList.remove("active");
            }
        });
        DOM.audioMenu.addEventListener("click", (e) => e.stopPropagation());

        DOM.rateInput.addEventListener("input", (e) => {
            DOM.rateValDisplay.textContent = e.target.value + "x";
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        DOM.pitchInput.addEventListener("input", (e) => {
            DOM.pitchValDisplay.textContent = e.target.value;
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        DOM.voiceSelect.addEventListener("change", () => {
            this.saveSettings();
            if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex);
        });

        window.addEventListener("beforeunload", () => this.synth.cancel());
    },

    populateVoices() {
        this.voices = this.synth.getVoices();
        DOM.voiceSelect.innerHTML = "";

        const englishVoices = this.voices.filter((v) => v.lang.includes("en"));

        englishVoices.forEach((voice) => {
            const option = document.createElement("option");
            option.textContent = `${voice.name} (${voice.lang})`;
            option.setAttribute("data-index", this.voices.indexOf(voice));
            DOM.voiceSelect.appendChild(option);
        });

        this.loadSettings();
    },

    loadParagraphs() {
        const contentDiv = document.querySelector(CONFIG.selectors.contentDiv);
        this.paraObjects = Array.from(contentDiv.getElementsByTagName("p"))
            .filter((p) => {
                const text = p.innerText.trim();
                return text.length > 0 && !text.match(/^\d+$/);
            })
            .map((p) => ({ element: p, text: p.innerText }));
    },

    toggle() {
        if (!this.isPlaying) {
            this.loadParagraphs();
            if (this.paraObjects.length === 0) return;
            this.isPlaying = true;
            this.isPaused = false;
            this.updateUI();
            this.speak(this.currentIndex);
        } else if (this.isPlaying && !this.isPaused) {
            this.synth.pause();
            this.isPaused = true;
            this.updateUI();
        } else if (this.isPlaying && this.isPaused) {
            if (this.synth.paused) this.synth.resume();
            else this.speak(this.currentIndex);
            this.isPaused = false;
            this.updateUI();
        }
    },

    speak(index) {
        if (index >= this.paraObjects.length) {
            this.stop();
            return;
        }

        this.synth.cancel();

        setTimeout(() => {
            this.currentIndex = index;
            const pObj = this.paraObjects[index];

            this.clearHighlights();
            pObj.element.classList.add("active-reading");
            pObj.element.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            this.utterance = new SpeechSynthesisUtterance(pObj.text);

            const selectedOption = DOM.voiceSelect.selectedOptions[0];
            if (selectedOption) {
                const voiceIndex = selectedOption.getAttribute("data-index");
                this.utterance.voice = this.voices[voiceIndex];
                this.utterance.lang = this.voices[voiceIndex]?.lang;
            }
            this.utterance.rate = parseFloat(DOM.rateInput.value);
            this.utterance.pitch = parseFloat(DOM.pitchInput.value);

            this.utterance.onend = () => {
                if (this.isPlaying && !this.isPaused) this.speak(this.currentIndex + 1);
            };

            this.utterance.onerror = (e) => {
                if (e.error !== "interrupted" && e.error !== "canceled") {
                    console.error("Audio error", e);
                    this.stop();
                }
            };

            this.synth.speak(this.utterance);
        }, 50);
    },

    stop() {
        this.synth.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.clearHighlights();
        this.updateUI();
    },

    clearHighlights() {
        this.paraObjects.forEach((obj) => obj.element.classList.remove("active-reading"));
    },

    updateUI() {
        if (this.isPlaying) DOM.audioWrapper.classList.add("floating");
        else DOM.audioWrapper.classList.remove("floating");

        if (this.isPlaying && !this.isPaused) {
            DOM.iconPlay.style.display = "none";
            DOM.iconPause.style.display = "block";
            DOM.audioStatusText.textContent = "Pause";
        } else if (this.isPlaying && this.isPaused) {
            DOM.iconPlay.style.display = "block";
            DOM.iconPause.style.display = "none";
            DOM.audioStatusText.textContent = "Resume";
        } else {
            DOM.iconPlay.style.display = "block";
            DOM.iconPause.style.display = "none";
            DOM.audioStatusText.textContent = "Listen";
        }
    },

    saveSettings() {
        const settings = {
            rate: DOM.rateInput.value,
            pitch: DOM.pitchInput.value,
            voiceName: DOM.voiceSelect.selectedOptions[0]?.textContent,
        };
        localStorage.setItem(CONFIG.storageKeys.audioSettings, JSON.stringify(settings));
    },

    loadSettings() {
        const saved = JSON.parse(localStorage.getItem(CONFIG.storageKeys.audioSettings));
        if (saved) {
            DOM.rateInput.value = saved.rate;
            DOM.pitchInput.value = saved.pitch;
            DOM.rateValDisplay.textContent = saved.rate + "x";
            DOM.pitchValDisplay.textContent = saved.pitch;

            for (let i = 0; i < DOM.voiceSelect.options.length; i++) {
                if (DOM.voiceSelect.options[i].textContent === saved.voiceName) {
                    DOM.voiceSelect.selectedIndex = i;
                    break;
                }
            }
        }
    },
};

AudioManager.init();
