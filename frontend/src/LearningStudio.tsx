import { useEffect, useMemo, useState } from "react";

type BrailleEntry = { letter: string; dots: number[] };
type SavedProgress = {
  attempts: number;
  correct: number;
  completedLetters: string[];
  streak: number;
  lastPracticeDate: string | null;
  badges: string[];
};

const LETTERS: BrailleEntry[] = [
  { letter: "A", dots: [1] }, { letter: "B", dots: [1, 2] }, { letter: "C", dots: [1, 4] },
  { letter: "D", dots: [1, 4, 5] }, { letter: "E", dots: [1, 5] }, { letter: "F", dots: [1, 2, 4] },
  { letter: "G", dots: [1, 2, 4, 5] }, { letter: "H", dots: [1, 2, 5] }, { letter: "I", dots: [2, 4] },
  { letter: "J", dots: [2, 4, 5] }, { letter: "K", dots: [1, 3] }, { letter: "L", dots: [1, 2, 3] },
  { letter: "M", dots: [1, 3, 4] }, { letter: "N", dots: [1, 3, 4, 5] }, { letter: "O", dots: [1, 3, 5] },
  { letter: "P", dots: [1, 2, 3, 4] }, { letter: "Q", dots: [1, 2, 3, 4, 5] }, { letter: "R", dots: [1, 2, 3, 5] },
  { letter: "S", dots: [2, 3, 4] }, { letter: "T", dots: [2, 3, 4, 5] }, { letter: "U", dots: [1, 3, 6] },
  { letter: "V", dots: [1, 2, 3, 6] }, { letter: "W", dots: [2, 4, 5, 6] }, { letter: "X", dots: [1, 3, 4, 6] },
  { letter: "Y", dots: [1, 3, 4, 5, 6] }, { letter: "Z", dots: [1, 3, 5, 6] },
];

const STORAGE_KEY = "dotsync-learning-progress-v1";
const emptyProgress: SavedProgress = {
  attempts: 0, correct: 0, completedLetters: [], streak: 0, lastPracticeDate: null, badges: [],
};

function loadProgress(): SavedProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...emptyProgress, ...JSON.parse(stored) } as SavedProgress : emptyProgress;
  } catch {
    return emptyProgress;
  }
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
  return true;
}

export default function LearningStudio() {
  const [mode, setMode] = useState<"explore" | "quiz" | "progress" | "accessibility" | "device">("explore");
  const [letter, setLetter] = useState("A");
  const [word, setWord] = useState("CAT");
  const [wordPractice, setWordPractice] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [selectedDots, setSelectedDots] = useState<number[]>([]);
  const [quizLetter, setQuizLetter] = useState("G");
  const [quizDots, setQuizDots] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("");
  const [announce, setAnnounce] = useState("");
  const [progress, setProgress] = useState<SavedProgress>(loadProgress);
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem("dotsync-high-contrast") === "true");
  const [largeText, setLargeText] = useState(() => localStorage.getItem("dotsync-large-text") === "true");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("dotsync-reduce-motion") === "true");
  const [deviceState, setDeviceState] = useState<"mock" | "checking" | "connected" | "error">("mock");
  const [deviceMessage, setDeviceMessage] = useState("Simulator mode is active. No physical board is being controlled.");
  const [listening, setListening] = useState(false);

  const activeEntry = useMemo(() => LETTERS.find((entry) => entry.letter === letter) ?? LETTERS[0], [letter]);
  const accuracy = progress.attempts ? Math.round((progress.correct / progress.attempts) * 100) : 0;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem("dotsync-high-contrast", String(highContrast));
    localStorage.setItem("dotsync-large-text", String(largeText));
    localStorage.setItem("dotsync-reduce-motion", String(reduceMotion));
    document.documentElement.classList.toggle("ds-high-contrast", highContrast);
    document.documentElement.classList.toggle("ds-large-text", largeText);
    document.documentElement.classList.toggle("ds-reduce-motion", reduceMotion);
    return () => {
      document.documentElement.classList.remove("ds-high-contrast", "ds-large-text", "ds-reduce-motion");
    };
  }, [highContrast, largeText, reduceMotion]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const startQuiz = () => {
    const next = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    setQuizLetter(next.letter);
    setQuizDots([]);
    setFeedback("");
    setMode("quiz");
    setAnnounce(`New question. Select all raised dots for letter ${next.letter}.`);
  };

  const recordAttempt = (correct: boolean, target: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setProgress((previous) => {
      const completed = correct && target.length === 1
        ? Array.from(new Set([...previous.completedLetters, target]))
        : previous.completedLetters;
      const badges = new Set(previous.badges);
      if (completed.length >= 5) badges.add("Five letters");
      if (completed.length >= 26) badges.add("Alphabet explorer");
      if (previous.correct + (correct ? 1 : 0) >= 10) badges.add("Ten correct");
      const streak = previous.lastPracticeDate === today
        ? previous.streak
        : previous.lastPracticeDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
          ? previous.streak + 1 : 1;
      return {
        attempts: previous.attempts + 1,
        correct: previous.correct + (correct ? 1 : 0),
        completedLetters: completed,
        streak,
        lastPracticeDate: today,
        badges: Array.from(badges),
      };
    });
  };

  const checkDots = () => {
    const expected = activeEntry.dots.slice().sort().join(",");
    const actual = selectedDots.slice().sort().join(",");
    const correct = expected === actual;
    const message = correct
      ? `Correct! ${letter} uses raised dots ${activeEntry.dots.join(", ")}.`
      : `Not quite. ${letter} uses dots ${activeEntry.dots.join(", ")}. Compare the highlighted pattern and try again.`;
    setFeedback(message);
    setAnnounce(message);
    recordAttempt(correct, letter);
  };

  const checkQuiz = () => {
    const expected = LETTERS.find((entry) => entry.letter === quizLetter)?.dots ?? [];
    const correct = expected.slice().sort().join(",") === quizDots.slice().sort().join(",");
    const message = correct
      ? `Correct! You identified the Braille pattern for ${quizLetter}.`
      : `Try again. ${quizLetter} has raised dots ${expected.join(", ")}.`;
    setFeedback(message);
    setAnnounce(message);
    recordAttempt(correct, quizLetter);
  };

  const speakCurrent = () => {
    const ok = speak(`Letter ${letter}. Raised dots: ${activeEntry.dots.join(", ")}. Tap or press the numbered dots to explore the pattern.`);
    setAnnounce(ok ? `Speaking letter ${letter} and its dot positions.` : "Speech synthesis is not supported in this browser.");
  };

  const startVoiceAnswer = () => {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setFeedback("Voice input is not supported in this browser. You can type the letter or select the dots instead.");
      setAnnounce("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    setFeedback("Listening… say the letter name.");
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim().toUpperCase() ?? "";
      setLetter(transcript.replace(/[^A-Z]/g, "").slice(0, 1) || letter);
      setFeedback(transcript ? `I heard “${transcript}”. Check the selected letter and its dot pattern.` : "I could not understand that. Please try again.");
      setAnnounce(transcript ? `I heard ${transcript}.` : "No speech detected.");
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      setFeedback("I could not hear a clear answer. Try again or use the keyboard.");
      setAnnounce("Voice recognition was not clear.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const connectDevice = async () => {
    setDeviceState("checking");
    setDeviceMessage("Checking the device through the local backend…");
    try {
      const response = await fetch("/api/v1/device/status", { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error("The local backend could not return device status.");
      const payload = await response.json() as { mode?: string; connected?: boolean; message?: string };
      if (payload.mode === "esp32" && payload.connected) {
        setDeviceState("connected");
        setDeviceMessage(payload.message || "The backend can reach the ESP32. Check the physical cell before learner use.");
      } else if (payload.mode === "mock") {
        setDeviceState("mock");
        setDeviceMessage("The backend is in simulator mode. Export DOTSYNC_DEVICE_MODE=esp32 and DOTSYNC_DEVICE_URL in the terminal before starting the API.");
      } else {
        setDeviceState("error");
        setDeviceMessage(payload.message || "The ESP32 is not reachable. Check backend configuration, power, and local Wi-Fi.");
      }
    } catch {
      setDeviceState("error");
      setDeviceMessage("Could not read device status from the local backend. Start the FastAPI service and try again.");
    }
  };

  const sendLetterToDevice = async () => {
    if (deviceState !== "connected") {
      setDeviceMessage("Check the ESP32 connection first, or continue with the simulator.");
      return;
    }
    try {
      const response = await fetch("/api/v1/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: letter }),
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; detail?: { message?: string } };
      if (!response.ok) throw new Error(payload.message || payload.detail?.message || "The device command failed.");
      setDeviceMessage(`Letter ${letter} queued through the backend. Verify the physical cell before continuing.`);
      setAnnounce(`Sent letter ${letter} to the Braille device.`);
    } catch (error) {
      setDeviceState("error");
      setDeviceMessage(error instanceof Error ? error.message : "The ESP32 command failed. Simulator remains available.");
    }
  };

  return (
    <section className="page-section learning-studio" aria-labelledby="studio-title">
      <p className="eyebrow"><span className="eyebrow-rule" />DOTSYNC LEARNING STUDIO</p>
      <div className="page-heading-row">
        <div>
          <h1 id="studio-title">Practice, listen, and grow.</h1>
          <p className="page-lede">Explore six-dot English Braille, check your answers, and keep your progress on this device.</p>
        </div>
        <span className="page-number">A—Z<br />6 DOTS</span>
      </div>

      <div className="studio-tabs" role="group" aria-label="Learning studio sections">
        {([
          ["explore", "Explore"],
          ["quiz", "Dot quiz"],
          ["progress", "My progress"],
          ["accessibility", "Accessibility"],
          ["device", "ESP32 device"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={mode === id ? "studio-tab active" : "studio-tab"} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>

      {mode === "explore" && (
        <div className="studio-grid">
          <section className="studio-card" aria-labelledby="explore-letter-title">
            <p className="eyebrow">LEARN A PATTERN</p>
            <h2 id="explore-letter-title">Choose a letter</h2>
            <label className="studio-label" htmlFor="studio-letter">English letter A–Z</label>
            <select id="studio-letter" value={letter} onChange={(event) => { setLetter(event.target.value); setSelectedDots([]); setFeedback(""); }}>
              {LETTERS.map((entry) => <option key={entry.letter} value={entry.letter}>{entry.letter}</option>)}
            </select>
            <p className="studio-braille" aria-label={`Braille pattern for ${letter}`}>{String.fromCodePoint(0x2800 + activeEntry.dots.reduce((sum, dot) => sum + (1 << (dot - 1)), 0))}</p>
            <p className="studio-hint">Raised dots: <strong>{activeEntry.dots.join(", ")}</strong></p>
            <button className="button button-primary" type="button" onClick={speakCurrent}>Listen to letter and dots</button>
            <button className="button studio-secondary" type="button" onClick={startVoiceAnswer} disabled={listening}>{listening ? "Listening…" : "Try voice input"}</button>
            <p className="studio-muted">Voice input depends on browser support and may be processed by the browser's speech service. Use dot selection or keyboard input if you do not want to use voice recognition.</p>
          </section>
          <section className="studio-card" aria-labelledby="dot-builder-title">
            <p className="eyebrow">BUILD THE CELL</p>
            <h2 id="dot-builder-title">Which dots are raised?</h2>
            <p className="studio-muted">Select the numbered positions. You can use Tab and Enter/Space on each dot.</p>
            <div className="dot-cell" role="group" aria-label="Six-dot Braille cell">
              {[1, 4, 2, 5, 3, 6].map((dot) => (
                <button key={dot} type="button" className={`dot-position ${selectedDots.includes(dot) ? "selected" : ""} ${feedback && activeEntry.dots.includes(dot) ? "answer-dot" : ""}`}
                  aria-pressed={selectedDots.includes(dot)} aria-label={`Dot ${dot}${activeEntry.dots.includes(dot) ? ", raised for " + letter : ", not raised for " + letter}`}
                  onClick={() => { setSelectedDots((previous) => previous.includes(dot) ? previous.filter((value) => value !== dot) : [...previous, dot]); setFeedback(""); }}>
                  <span className="dot-number">{dot}</span><span className="dot-disc" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="studio-actions">
              <button className="button button-primary" type="button" onClick={checkDots}>Check answer</button>
              <button className="button studio-secondary" type="button" onClick={() => { setSelectedDots([]); setFeedback(""); }}>Clear dots</button>
            </div>
            {feedback && <p className={`studio-feedback ${feedback.startsWith("Correct") ? "is-correct" : "is-retry"}`} role="status">{feedback}</p>}
          </section>
          <section className="studio-card studio-full" aria-labelledby="word-practice-title">
            <p className="eyebrow">PRACTISE A WORD</p>
            <h2 id="word-practice-title">Step through a short word</h2>
            <label className="studio-label" htmlFor="studio-word">Word (English A–Z, up to 8 letters)</label>
            <div className="studio-word-row">
              <input id="studio-word" value={word} maxLength={8} pattern="[A-Za-z]{2,8}" onChange={(event) => setWord(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
              <button className="button button-primary" type="button" onClick={() => { const normalized = word.trim().toUpperCase(); if (/^[A-Z]{2,8}$/.test(normalized)) { setWordPractice(normalized); setWordIndex(0); setLetter(normalized[0]); setSelectedDots([]); setFeedback(`Word practice started: letter 1 of ${normalized.length}.`); setAnnounce(`Word practice started with letter ${normalized[0]}.`); } else setFeedback("Enter 2–8 English letters with no spaces."); }}>Start word</button>
            </div>
            {wordPractice && <div className="word-stepper" aria-live="polite"><p><strong>{wordPractice}</strong> · Letter {wordIndex + 1} of {wordPractice.length}: <strong>{wordPractice[wordIndex]}</strong></p><button className="button button-primary" type="button" onClick={() => { if (wordIndex < wordPractice.length - 1) { const next = wordIndex + 1; setWordIndex(next); setLetter(wordPractice[next]); setSelectedDots([]); setFeedback(`Letter ${next + 1} of ${wordPractice.length}.`); setAnnounce(`Next letter: ${wordPractice[next]}.`); } else { setFeedback("Word practice complete. Great work!"); setAnnounce("Word practice complete."); setProgress((previous) => ({ ...previous, badges: Array.from(new Set([...previous.badges, "Word finisher"])) })); } }}>{wordIndex < wordPractice.length - 1 ? "Next letter →" : "Finish word"}</button></div>}
            <p className="studio-muted">The current prototype has one six-dot cell, so word practice steps through letters rather than displaying a whole word at once.</p>
          </section>
        </div>
      )}

      {mode === "quiz" && (
        <section className="studio-card studio-quiz" aria-labelledby="dot-quiz-title">
          <p className="eyebrow">RECALL PRACTICE</p>
          <h2 id="dot-quiz-title">Which dots make this letter?</h2>
          <p className="quiz-letter" aria-label={`Identify the pattern for letter ${quizLetter}`}>{quizLetter}</p>
          <p className="studio-muted">Select every raised dot, then check your answer. You can also hear the prompt.</p>
          <button className="button studio-secondary" type="button" onClick={() => { speak(`Which dots are raised for letter ${quizLetter}?`); setAnnounce("Reading the quiz prompt aloud."); }}>Read question aloud</button>
          <div className="dot-cell" role="group" aria-label={`Choose raised dots for letter ${quizLetter}`}>
            {[1, 4, 2, 5, 3, 6].map((dot) => <button key={dot} type="button" className={`dot-position ${quizDots.includes(dot) ? "selected" : ""}`} aria-pressed={quizDots.includes(dot)} aria-label={`Select dot ${dot}`} onClick={() => { setQuizDots((previous) => previous.includes(dot) ? previous.filter((value) => value !== dot) : [...previous, dot]); setFeedback(""); }}><span className="dot-number">{dot}</span><span className="dot-disc" aria-hidden="true" /></button>)}
          </div>
          <div className="studio-actions">
            <button className="button button-primary" type="button" onClick={checkQuiz}>Check answer</button>
            <button className="button studio-secondary" type="button" onClick={startQuiz}>New question</button>
          </div>
          {feedback && <p className={`studio-feedback ${feedback.startsWith("Correct") ? "is-correct" : "is-retry"}`} role="status">{feedback}</p>}
        </section>
      )}

      {mode === "progress" && (
        <section className="studio-card" aria-labelledby="progress-title">
          <p className="eyebrow">YOUR LEARNING JOURNEY</p><h2 id="progress-title">Small steps add up.</h2>
          <div className="progress-metrics">
            <div><strong>{progress.attempts}</strong><span>Attempts</span></div>
            <div><strong>{accuracy}%</strong><span>Accuracy</span></div>
            <div><strong>{progress.completedLetters.length}/26</strong><span>Letters practised correctly</span></div>
            <div><strong>{progress.streak}</strong><span>Practice-day streak</span></div>
          </div>
          <h3>Achievement badges</h3>
          <div className="achievement-list">
            {["Five letters", "Ten correct", "Alphabet explorer", "Word finisher"].map((badge) => <span key={badge} className={`achievement ${progress.badges.includes(badge) ? "earned" : ""}`} aria-label={`${badge}: ${progress.badges.includes(badge) ? "earned" : "not yet earned"}`}>{progress.badges.includes(badge) ? "★" : "☆"} {badge}</span>)}
          </div>
          <p className="studio-muted">Progress stays in this browser on this device. It is not synced to an account or sent to a server.</p>
          <button className="button studio-secondary" type="button" onClick={() => { if (window.confirm("Reset all locally saved DotSync progress?")) { setProgress(emptyProgress); setFeedback("Local progress reset."); setAnnounce("Local progress reset."); } }}>Reset my progress</button>
        </section>
      )}

      {mode === "accessibility" && (
        <section className="studio-card" aria-labelledby="accessibility-title">
          <p className="eyebrow">MAKE IT COMFORTABLE</p><h2 id="accessibility-title">Accessibility preferences</h2>
          <div className="preference-list">
            <label><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /> <span><strong>High contrast</strong><small>Use stronger foreground and background contrast.</small></span></label>
            <label><input type="checkbox" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} /> <span><strong>Larger text</strong><small>Increase the reading size across the page.</small></span></label>
            <label><input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} /> <span><strong>Reduce motion</strong><small>Minimise transitions and animated effects.</small></span></label>
          </div>
          <p className="studio-muted">Controls support keyboard operation and announce key feedback to screen readers. Browser speech and recognition availability can vary.</p>
        </section>
      )}

      {mode === "device" && (
        <section className="studio-card" aria-labelledby="device-title">
          <p className="eyebrow">HARDWARE CONNECTION</p><h2 id="device-title">Connect a local ESP32</h2>
          <p className="studio-muted">This prototype can use the simulator without hardware. To try the board, connect your computer to the same local Wi-Fi as the ESP32 and enter its base URL.</p>
          <p className="studio-muted"><strong>Backend configuration:</strong> set <code>DOTSYNC_DEVICE_MODE=esp32</code> and <code>DOTSYNC_DEVICE_URL=http://192.168.4.1</code> in your local backend environment, using the actual address assigned to your board.</p>
          <button className="button button-primary" type="button" onClick={() => void connectDevice()} disabled={deviceState === "checking"}>{deviceState === "checking" ? "Checking…" : "Check backend connection"}</button>
          <p className={`device-message device-${deviceState}`} role="status" aria-live="polite"><strong>{deviceState === "connected" ? "Connected" : deviceState === "checking" ? "Checking" : deviceState === "error" ? "Connection issue" : "Simulator mode"}</strong> — {deviceMessage}</p>
          <div className="studio-actions">
            <button className="button button-primary" type="button" onClick={() => void sendLetterToDevice()} disabled={deviceState !== "connected"}>Send {letter} to Braille cell</button>
            <button className="button studio-secondary" type="button" onClick={() => { setDeviceState("mock"); setDeviceMessage("Simulator mode is active. No physical board is being controlled."); }}>Use simulator instead</button>
          </div>
          <p className="studio-muted">Hardware note: the backend adapter uses GET /api/status, form-encoded POST /api/learn with a letter field, and POST /api/pins/reset. Confirm these fields against your flashed firmware. Test movement and emergency stop on the bench before using with a learner.</p>
        </section>
      )}
    </section>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
