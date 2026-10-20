import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, DeviceStatus, HealthResponse, PracticeResponse, WordSession } from "./api";
import BrailleParticleScene from "./BrailleParticleScene";
import LearningStudio from "./LearningStudio";

const MAX_TEXT_LENGTH = 40;
type Page = "home" | "learn" | "guided" | "practice" | "quiz" | "about" | "studio";

const pages: { id: Page; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "learn", label: "Explore A–Z" },
  { id: "guided", label: "Learn on your own" },
  { id: "practice", label: "Practice" },
  { id: "quiz", label: "Word journey" },
  { id: "about", label: "Our approach" },
  { id: "studio", label: "Learning studio" },
];

const alphabet = [
  ["A", "⠁", "1"], ["B", "⠃", "1 · 2"], ["C", "⠉", "1 · 4"],
  ["D", "⠙", "1 · 4 · 5"], ["E", "⠑", "1 · 5"], ["F", "⠋", "1 · 2 · 4"],
  ["G", "⠛", "1 · 2 · 4 · 5"], ["H", "⠓", "1 · 2 · 5"], ["I", "⠊", "2 · 4"],
  ["J", "⠚", "2 · 4 · 5"], ["K", "⠅", "1 · 3"], ["L", "⠇", "1 · 2 · 3"],
  ["M", "⠍", "1 · 3 · 4"], ["N", "⠝", "1 · 3 · 4 · 5"], ["O", "⠕", "1 · 3 · 5"],
  ["P", "⠏", "1 · 2 · 3 · 4"], ["Q", "⠟", "1 · 2 · 3 · 4 · 5"], ["R", "⠗", "1 · 2 · 3 · 5"],
  ["S", "⠎", "2 · 3 · 4"], ["T", "⠞", "2 · 3 · 4 · 5"], ["U", "⠥", "1 · 3 · 6"],
  ["V", "⠧", "1 · 2 · 3 · 6"], ["W", "⠺", "2 · 4 · 5 · 6"], ["X", "⠭", "1 · 3 · 4 · 6"],
  ["Y", "⠽", "1 · 3 · 4 · 5 · 6"], ["Z", "⠵", "1 · 3 · 5 · 6"],
] as const;

function pageFromHash(): Page {
  const candidate = window.location.hash.replace(/^#\/?/, "") as Page;
  return pages.some((page) => page.id === candidate) ? candidate : "home";
}

function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash());
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("Checking the local service…");
  const [text, setText] = useState("");
  const [result, setResult] = useState<PracticeResponse | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshConnection = useCallback(async () => {
    try {
      const [healthResponse, deviceResponse] = await Promise.all([
        api.health(),
        api.deviceStatus(),
      ]);
      setHealth(healthResponse);
      setDevice(deviceResponse);
      setConnectionMessage("Local practice service is ready.");
    } catch {
      setHealth(null);
      setDevice(null);
      setConnectionMessage("The local practice service is unavailable. Start the backend, then try again.");
    }
  }, []);

  useEffect(() => {
    const syncPage = () => setPage(pageFromHash());
    window.addEventListener("hashchange", syncPage);
    void refreshConnection();
    const timer = window.setInterval(() => void refreshConnection(), 5000);
    return () => {
      window.removeEventListener("hashchange", syncPage);
      window.clearInterval(timer);
    };
  }, [refreshConnection]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = mainRef.current?.querySelector<HTMLElement>("h1");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [page]);

  useEffect(() => {
    if (!result || !["queued", "running"].includes(result.state)) return;
    let active = true;
    let timer: number;
    const poll = async () => {
      try {
        const latest = await api.action(result.action_id);
        if (active) {
          setResult(latest);
          if (["queued", "running"].includes(latest.state)) timer = window.setTimeout(poll, 350);
        }
      } catch (error) {
        if (active) setFormError(error instanceof Error ? error.message : "Practice progress is unavailable.");
      }
    };
    timer = window.setTimeout(poll, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [result]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setResult(null);

    const normalized = text.trim().toUpperCase();
    if (!normalized) {
      setFormError("Enter at least one letter to begin.");
      return;
    }
    if (!/^[A-Z ]+$/.test(normalized)) {
      setFormError("For this first version, use English letters A–Z and spaces only.");
      return;
    }
    if (normalized.length > MAX_TEXT_LENGTH) {
      setFormError(`Keep practice text to ${MAX_TEXT_LENGTH} characters or fewer.`);
      return;
    }

    setSubmitting(true);
    try {
      const practiceResult = await api.practice(normalized);
      setResult(practiceResult);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not start practice.");
    } finally {
      setSubmitting(false);
    }
  };

  const serviceReady = health?.ok === true;
  const deviceReady = device?.connected === true;
  const chooseLetter = (letter: string) => {
    setText(letter);
    setResult(null);
    setFormError("");
    window.location.hash = "/practice";
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <a className="brand" href="#/home" aria-label="DotSync home">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DotSync<span className="brand-period">.</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {pages.map((item) => (
            <a key={item.id} href={`#/${item.id}`} aria-current={page === item.id ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-status" role="status" aria-live="polite" aria-label="Device connection status">
          <span className="status-dot" aria-hidden="true" />
          <span>{device?.mode === "esp32" ? (device.connected ? "ESP32 connected" : "ESP32 offline") : "Preview · simulated board"}</span>
        </div>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {page === "home" && <HomePage serviceReady={serviceReady} message={connectionMessage} />}
        {page === "learn" && <LearnPage onChooseLetter={chooseLetter} />}
        {page === "guided" && <GuidedLessonPage />}
        {page === "practice" && (
          <PracticePage
            text={text}
            setText={setText}
            result={result}
            formError={formError}
            submitting={submitting}
            serviceReady={serviceReady}
            deviceReady={deviceReady}
            connectionMessage={connectionMessage}
            deviceMessage={device?.message ?? "The mock board is ready. No ESP32 commands are sent."}
            onSubmit={handleSubmit}
            onRefresh={() => void refreshConnection()}
            onCancel={() => result && void api.cancelAction(result.action_id).then(setResult)}
            onReset={() => void api.resetDevice().then(() => { setResult(null); setFormError(""); })}
          />
        )}
        {page === "quiz" && <WordJourneyPage />}
        {page === "about" && <ApproachPage />}
        {page === "studio" && <LearningStudio />}
      </main>

      <footer className="site-footer">
        <a href="#/home" className="footer-brand">DotSync<span className="brand-period">.</span></a>
        <p>Touch, listen, learn — one letter at a time.</p>
        <p className="footer-braille" lang="en" aria-hidden="true">⠙⠕⠞⠎⠽⠝⠉</p>
        <span className="sr-only">DotSync written in uncontracted Braille.</span>
      </footer>
    </div>
  );
}

function HomePage({ serviceReady, message }: { serviceReady: boolean; message: string }) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-rule" />A tactile way into language</p>
          <h1 id="hero-title">A world of words,<br /><em>within reach.</em></h1>
          <p className="hero-description">
            Every letter is a small discovery. DotSync pairs raised Braille dots with sound, so young learners can explore at their own pace.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#/practice">Begin a practice <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#/learn">Explore the alphabet <span aria-hidden="true">→</span></a>
          </div>
          <div className="hero-note">
            <span className={`service-indicator ${serviceReady ? "is-ready" : ""}`} aria-hidden="true" />
            <span role="status" aria-live="polite">{serviceReady ? "Practice space ready" : message}</span>
          </div>
        </div>
        <div className="hero-art-wrap">
          <div className="hero-art-label"><span>01 / 06</span><span>Dots in motion</span></div>
          <BrailleParticleScene />
          <p className="hero-art-caption">A little movement. A new way to read.</p>
        </div>
        <div className="hero-bottomline"><span>BUILT AROUND TOUCH AND SOUND</span><span>ENGLISH GRADE 1 · A—Z</span></div>
      </section>

      <section className="braille-banner" aria-labelledby="braille-phrase-title">
        <div className="braille-banner-top"><span>OUR FIRST WORD</span><span>READ IT · FEEL IT · BELIEVE IT</span></div>
        <div className="braille-phrase" aria-hidden="true" lang="en">⠞⠓⠑　⠺⠕⠗⠇⠙　⠊⠎　⠽⠕⠥⠗⠎<br />⠞⠕　⠗⠑⠁⠙</div>
        <h2 id="braille-phrase-title">“The world is yours to read.”</h2>
        <p className="sr-only">The phrase “The world is yours to read” displayed in uncontracted English Braille.</p>
      </section>

      <section className="home-paths" aria-labelledby="paths-title">
        <div className="section-heading">
          <p className="eyebrow">CHOOSE YOUR NEXT STEP</p>
          <h2 id="paths-title">A learning space made to be explored.</h2>
        </div>
        <div className="path-grid">
          <a className="path-card path-card-practice" href="#/practice">
            <span className="path-index">01</span><span className="path-glyph" aria-hidden="true">⠁</span>
            <h3>Practice a letter</h3><p>Send a letter or a short line to the simulated Braille board.</p><span className="path-arrow" aria-hidden="true">↗</span>
          </a>
          <a className="path-card path-card-learn" href="#/guided">
            <span className="path-index">02</span><span className="path-glyph" aria-hidden="true">⠃</span>
            <h3>Learn on your own</h3><p>Meet each Braille pattern at a gentle pace, with audio and room to revisit letters.</p><span className="path-arrow" aria-hidden="true">↗</span>
          </a>
          <a className="path-card path-card-journey" href="#/quiz">
            <span className="path-index">03</span><span className="path-glyph" aria-hidden="true">⠺</span>
            <h3>Take a word journey</h3><p>See how guided, one-letter-at-a-time reading will work.</p><span className="path-arrow" aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="small-promise">
        <span className="promise-mark" aria-hidden="true">⠿</span>
        <p>Made for curiosity, designed for access, and always at the learner’s pace.</p>
        <a className="text-link" href="#/about">How we think about learning <span aria-hidden="true">→</span></a>
      </section>
    </>
  );
}

function LearnPage({ onChooseLetter }: { onChooseLetter: (letter: string) => void }) {
  return (
    <section className="page-section" aria-labelledby="learn-title">
      <p className="eyebrow"><span className="eyebrow-rule" />THE DOT ATLAS · 01—26</p>
      <div className="page-heading-row">
        <div><h1 id="learn-title">Meet the letters.</h1><p className="page-lede">Every cell has six positions. Choose a letter to send it to the practice page.</p></div>
        <span className="page-number">A—Z<br />26 CELLS</span>
      </div>
      <div className="alphabet-grid" role="group" aria-label="English Braille alphabet">
        {alphabet.map(([letter, braille, dots]) => (
          <button className="letter-card" type="button" key={letter} onClick={() => onChooseLetter(letter)} aria-label={`Practice letter ${letter}. Its Braille dots are ${dots.replaceAll(" · ", ", ")}`}>
            <span className="letter-card-top"><span>{letter}</span><span className="letter-dots">{dots.replaceAll(" · ", "·")}</span></span>
            <span className="letter-braille" aria-hidden="true" lang="en">{braille}</span>
            <span className="letter-hint">Practice this letter <span aria-hidden="true">↗</span></span>
          </button>
        ))}
      </div>
      <p className="content-note"><strong>One cell at a time.</strong> The current prototype raises a single Braille cell and displays one character at a time.</p>
    </section>
  );
}

function GuidedLessonPage() {
  const [sequence, setSequence] = useState<string[]>(() => alphabet.map(([letter]) => letter));
  const [index, setIndex] = useState(0);
  const [mastered, setMastered] = useState<string[]>([]);
  const [revisited, setRevisited] = useState<Record<string, number>>({});
  const letter = sequence[index] ?? null;
  const entry = letter ? alphabet.find(([item]) => item === letter) : undefined;
  const dots = entry ? entry[2].split(" · ").map(Number) : [];
  const finished = letter === null;

  const hearLetter = () => {
    if (!letter || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const prompt = new SpeechSynthesisUtterance(letter);
    prompt.rate = 0.82;
    window.speechSynthesis.speak(prompt);
  };

  const nextLetter = (needsReview: boolean) => {
    if (!letter) return;
    if (needsReview) {
      const count = revisited[letter] ?? 0;
      if (count < 1) {
        setRevisited((previous) => ({ ...previous, [letter]: count + 1 }));
        setSequence((previous) => [...previous, letter]);
      }
    } else {
      setMastered((previous) => previous.includes(letter) ? previous : [...previous, letter]);
    }
    setIndex((previous) => previous + 1);
  };

  const startAgain = () => {
    setSequence(alphabet.map(([item]) => item));
    setIndex(0);
    setMastered([]);
    setRevisited({});
  };

  return (
    <section className="page-section guided-page" aria-labelledby="guided-title">
      <p className="eyebrow"><span className="eyebrow-rule" />A SELF-GUIDED ALPHABET LESSON</p>
      <div className="page-heading-row">
        <div><h1 id="guided-title">Meet the letters, one at a time.</h1><p className="page-lede">Listen to each letter, feel its six-dot pattern on the board, then choose whether to revisit it.</p></div>
        <span className="page-number">A—Z<br />NO TIMER</span>
      </div>
      {finished ? (
        <div className="guided-complete">
          <p className="eyebrow">LESSON COMPLETE</p>
          <h2>You explored the alphabet.</h2>
          <p>You marked {mastered.length} of 26 letters as familiar. You can revisit any letter in the A–Z atlas.</p>
          <button className="button button-primary" type="button" onClick={startAgain}>Start again</button>
          <a className="text-link" href="#/learn">Open the A–Z atlas <span aria-hidden="true">→</span></a>
        </div>
      ) : entry && letter ? (
        <div className="guided-lesson">
          <div className="guided-progress-head"><span>LETTER {letter}</span><span>{Math.min(index + 1, sequence.length)} OF {sequence.length}</span></div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Letter {letter}. {Math.min(index + 1, sequence.length)} of {sequence.length} in this lesson. Raised dots: {dots.join(", ")}.</p>
          <progress value={index} max={sequence.length} aria-label={`Lesson progress, letter ${letter}`} />
          <div className="guided-card">
            <div className="guided-letter" role="img" aria-label={`Letter ${letter}, Braille dots ${dots.join(", ")}`}>
              <span aria-hidden="true">{entry[1]}</span>
              <span className="guided-letter-name" aria-hidden="true">{letter}</span>
            </div>
            <div className="guided-content">
              <p className="eyebrow">TAKE YOUR TIME</p>
              <h2>Letter {letter}</h2>
              <p>Feel the raised dots, listen to the letter, and decide if you want to practice this pattern again.</p>
              <p className="guided-dot-description">Raised dots: {dots.join(" · ")}</p>
              <div className="guided-actions">
                <button className="quiet-button" type="button" onClick={hearLetter}>Hear letter</button>
                <button className="quiet-button" type="button" onClick={() => nextLetter(true)}>Practice again later</button>
                <button className="button button-primary" type="button" onClick={() => nextLetter(false)}>I know this one <span aria-hidden="true">→</span></button>
              </div>
              <p className="input-help">Progress stays in this lesson only and is cleared when you leave or restart.</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type PracticePageProps = {
  text: string;
  setText: (value: string) => void;
  result: PracticeResponse | null;
  formError: string;
  submitting: boolean;
  serviceReady: boolean;
  deviceReady: boolean;
  connectionMessage: string;
  deviceMessage: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onReset: () => void;
};

function PracticePage(props: PracticePageProps) {
  const { text, setText, result, formError, submitting, serviceReady, deviceReady, connectionMessage, deviceMessage, onSubmit, onRefresh, onCancel, onReset } = props;
  const isActive = result !== null && ["queued", "running"].includes(result.state);
  const currentCharacter = result?.current_character ?? (result?.state === "queued" ? "" : null);
  const currentPattern = currentCharacter ? alphabet.find(([letter]) => letter === currentCharacter)?.[2] : undefined;
  const raisedDots = currentPattern ? currentPattern.split(" · ").map(Number) : [];
  return (
    <section className="page-section practice-page" aria-labelledby="practice-title">
      <p className="eyebrow"><span className="eyebrow-rule" />A QUIET PLACE TO EXPLORE</p>
      <div className="page-heading-row">
        <div><h1 id="practice-title">Practice, your way.</h1><p className="page-lede">Start with one letter, or build a short line. The board moves through each character in order.</p></div>
        <span className="page-number">MAX 40<br />A—Z + SPACE</span>
      </div>
      <div className="practice-layout">
        <aside className="practice-aside" aria-label="Practice information">
          <div className="status-panel">
            <span className={`service-indicator ${serviceReady && deviceReady ? "is-ready" : ""}`} aria-hidden="true" />
            <h2>Local practice service</h2>
            <p role="status" aria-live="polite">{connectionMessage}</p>
            <p className="device-note">{deviceMessage}</p>
            <button className="quiet-button" type="button" onClick={onRefresh}>Check connection</button>
          </div>
          <div className="practice-aside-note"><span className="aside-braille" aria-hidden="true">⠿</span><p>Take a moment with each pattern. Learning has no timer here.</p></div>
        </aside>
        <div className="practice-panel">
          <div className="panel-topline"><span>LETTER PRACTICE</span><span>ONE CHARACTER AT A TIME</span></div>
          <form onSubmit={onSubmit} noValidate>
            <label htmlFor="practice-text">What would you like to explore?</label>
            <textarea id="practice-text" name="practiceText" rows={4} maxLength={MAX_TEXT_LENGTH} autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} placeholder="Try: CAT" aria-describedby="input-help input-count" />
            <div className="input-meta"><span id="input-help">English letters A–Z and spaces. Up to 40 characters.</span><span id="input-count">{text.length} / {MAX_TEXT_LENGTH}</span></div>
            {formError && <p className="feedback error" role="alert">{formError}</p>}
            {result && <div className="feedback success" role="status" aria-live="polite"><strong>Simulation received.</strong> {result.message}</div>}
            <button className="button button-primary submit-button" type="submit" disabled={submitting || isActive || !serviceReady || !deviceReady}>
              {submitting ? "Starting practice…" : isActive ? "Practice in progress" : "Start practice"}<span aria-hidden="true">↗</span>
            </button>
            {isActive && <button className="quiet-button activity-control" type="button" onClick={onCancel}>Stop practice</button>}
            {result?.state === "completed" && <button className="quiet-button activity-control" type="button" onClick={onReset}>Reset simulation</button>}
            {(!serviceReady || !deviceReady) && <p className="button-hint">The local service must be running to continue.</p>}
          </form>
          <div className="board-preview" role="group" aria-label="Braille board preview, currently simulated">
            <div className="board-preview-head"><span>THE CELL</span><span>SIMULATION · NO HARDWARE CONNECTED</span></div>
            <div className="preview-cell" role="img" aria-label={currentCharacter ? `${currentCharacter === " " ? "Space" : `Letter ${currentCharacter}`}, Braille dots ${raisedDots.length ? raisedDots.join(", ") : "none"}` : "Braille cell waiting"}>
              {[1, 4, 2, 5, 3, 6].map((dot) => <span key={dot} className={raisedDots.includes(dot) ? "raised" : ""} aria-hidden="true" />)}
            </div>
            <div className="preview-progress">
              <strong>{currentCharacter === " " ? "Space" : currentCharacter ?? "Ready"}</strong>
              <p>{result?.message ?? "Enter text to begin a simulated practice."}</p>
              {result && <span>{result.current_index} / {result.character_count}</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WordJourneyPage() {
  const [word, setWord] = useState("");
  const [answer, setAnswer] = useState("");
  const [session, setSession] = useState<WordSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finished = session?.state === "completed" || session?.state === "cancelled";
  const canAnswer = session !== null && session.item_index === session.item_count - 1 && !finished;

  const begin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      setSession(await api.createWordSession(word));
      setWord("");
      setAnswer("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this word journey.");
    } finally {
      setBusy(false);
    }
  };

  const updateSession = async (operation: () => Promise<WordSession>) => {
    setError("");
    setBusy(true);
    try {
      setSession(await operation());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The word journey could not continue.");
    } finally {
      setBusy(false);
    }
  };

  const evaluate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (session) void updateSession(() => api.evaluateWordSession(session.session_id, answer));
    setAnswer("");
  };

  const raisedDots = session?.current_dots ?? [];
  return (
    <section className="page-section journey-page" aria-labelledby="journey-title">
      <p className="eyebrow"><span className="eyebrow-rule" />A GUIDED ACTIVITY · SIMULATOR</p>
      <div className="page-heading-row">
        <div><h1 id="journey-title">A word, discovered slowly.</h1><p className="page-lede">Feel one Braille pattern at a time, then try to read the whole word.</p></div>
        <span className="page-number">2—8<br />LETTERS</span>
      </div>

      {!session || finished ? (
        <form className="journey-setup" onSubmit={begin}>
          <label htmlFor="journey-word">Adult setup: choose a short word</label>
          <p>Use 2–8 English letters. The target is kept by the local service and hidden from the learner view.</p>
          <div className="journey-setup-row">
            <input id="journey-word" value={word} onChange={(event) => setWord(event.target.value)} maxLength={8} autoComplete="off" placeholder="For example, CAT" required pattern="[A-Za-z]{2,8}" />
            <button className="button button-primary" type="submit" disabled={busy}>Begin word journey <span aria-hidden="true">↗</span></button>
          </div>
          {session?.state === "completed" && <p className="feedback success" role="status">{session.feedback}</p>}
          {session?.state === "cancelled" && <p className="feedback" role="status">{session.feedback}</p>}
        </form>
      ) : (
        <div className="journey-session" aria-busy={busy}>
          <div className="journey-session-top"><span>LETTER {session.item_index + 1} OF {session.item_count}</span><span>SIMULATED BOARD</span></div>
          <div className="journey-session-main">
            <div className="journey-cell-wrap">
              <div className="preview-cell journey-cell" role="img" aria-label={`Braille pattern, raised dots ${raisedDots.join(", ") || "none"}`}>
                {[1, 4, 2, 5, 3, 6].map((dot) => <span key={dot} className={raisedDots.includes(dot) ? "raised" : ""} aria-hidden="true" />)}
              </div>
              <p>Take time to feel this letter.</p>
            </div>
            <div className="journey-session-actions">
              <p className="journey-session-feedback" role="status" aria-live="polite">{session.feedback}</p>
              {canAnswer ? (
                <form onSubmit={evaluate}>
                  <label htmlFor="journey-answer">What word did the learner say?</label>
                  <input id="journey-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={40} autoComplete="off" placeholder="Type the spoken answer to simulate checking" />
                  <p className="input-help">This lets us exercise answer checking in the simulator. Microphone capture and speech recognition are still pending.</p>
                  <div className="journey-answer-actions">
                    <button className="button button-primary" type="submit" disabled={busy}>Check answer</button>
                    <button className="quiet-button" type="button" disabled={busy} onClick={() => { if (session) void updateSession(() => api.evaluateWordSession(session.session_id, "")); }}>Not sure</button>
                  </div>
                </form>
              ) : session.state !== "completed" && (
                <button className="button button-primary" type="button" disabled={busy} onClick={() => { if (session) void updateSession(() => api.advanceWordSession(session.session_id)); }}>
                  {session.item_index < session.item_count - 1 ? "Next letter" : "I’ve felt every letter"}<span aria-hidden="true">→</span>
                </button>
              )}
              {error && <p className="feedback error" role="alert">{error}</p>}
              <button className="quiet-button journey-cancel" type="button" disabled={busy} onClick={() => { if (session) void updateSession(() => api.cancelWordSession(session.session_id)); }}>End word journey</button>
            </div>
          </div>
          <p className="content-note"><strong>Simulation.</strong> No microphone recording or physical board movement happens in this version. The real board has one cell and no touch sensor, so the first hardware activity will use an adult-operated “Next letter” control.</p>
        </div>
      )}
      {error && (!session || finished) && <p className="feedback error" role="alert">{error}</p>}
      <div className="journey-feature">
        <div className="journey-steps" aria-label="Word activity steps">
          <div><span>01</span><p>A guide chooses a short word.</p></div>
          <div><span>02</span><p>The cell presents each Braille pattern in turn.</p></div>
          <div><span>03</span><p>The learner says the word; the app checks the answer.</p></div>
        </div>
        <div className="journey-aside"><span className="journey-braille" aria-hidden="true">⠺⠕⠗⠙</span><p>Each letter gets its own moment. The answer stays in the local service during the activity.</p></div>
      </div>
    </section>
  );
}

function ApproachPage() {
  return (
    <section className="page-section approach-page" aria-labelledby="approach-title">
      <p className="eyebrow"><span className="eyebrow-rule" />DESIGNED AROUND THE LEARNER</p>
      <div className="page-heading-row"><div><h1 id="approach-title">Access is how we begin.</h1><p className="page-lede">DotSync is being shaped with blind and low-vision learners in mind—not added as an afterthought.</p></div></div>
      <div className="approach-grid">
        <article><span className="approach-index">01 / TOUCH</span><span className="approach-symbol" aria-hidden="true">⠿</span><h2>Patterns you can feel</h2><p>A six-dot cell makes each letter a tactile shape. The website introduces the pattern; the board brings it to the fingertips.</p></article>
        <article><span className="approach-index">02 / SOUND</span><span className="approach-symbol" aria-hidden="true">♫</span><h2>Words you can hear</h2><p>Audio is part of the learning loop. Prompts and feedback should be clear, calm, and never depend on color or animation alone.</p></article>
        <article><span className="approach-index">03 / CHOICE</span><span className="approach-symbol" aria-hidden="true">⠦</span><h2>Room to learn</h2><p>Practice is short, predictable, and learner-paced. A teacher can support the session and help recover from device issues.</p></article>
      </div>
      <div className="privacy-note"><span className="privacy-mark" aria-hidden="true">◎</span><div><h2>Private by default</h2><p>This prototype runs locally in mock mode. The planned voice activity will keep audio temporary and avoid saving learner recordings by default.</p></div></div>
    </section>
  );
}

export default App;
