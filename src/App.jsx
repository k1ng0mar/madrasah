import React, { useState, useEffect, useRef } from "react";
import * as mammoth from "mammoth";

// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════

const SUBJECTS = [
  { code: "DEISS121", name: "Ahwalush Shakhsiyyah (Al-Nikah)", sem: 1 },
  { code: "DEISS122", name: "Tajweed Al-Qur'an", sem: 1 },
  { code: "DEISS123", name: "Media Language", sem: 1 },
  { code: "DEISS124", name: "Introduction to Usool-alfiqh", sem: 1 },
  { code: "DEISS125", name: "Introduction to Da'awah", sem: 1 },
  { code: "DEISS126", name: "Islam in Nigeria", sem: 1 },
  { code: "DEISS127", name: "Rhetoric (Balagha) I", sem: 1 },
  { code: "DEISS128", name: "Arabic Grammar (Nahw) I", sem: 1 },
  { code: "DEISS211", name: "Usool Al-Tafsir", sem: 2 },
  { code: "DEISS212", name: "Hudud (Islamic Criminal Law)", sem: 2 },
  { code: "DEISS213", name: "Research Methodology", sem: 2 },
  { code: "DEISS214", name: "Morality in Islam (Akhlaq)", sem: 2 },
  { code: "DEISS215", name: "Hadarah (Islamic Civilization)", sem: 2 },
  { code: "DEISS216", name: "Islamic Economic System", sem: 2 },
  { code: "DEISS217", name: "Balagha (Rhetoric) II", sem: 2 },
  { code: "DEISS218", name: "Arabic Grammar II", sem: 2 },
  { code: "DEISS219", name: "Tarjamah (Translation)", sem: 2 },
];

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════

const C = {
  bg:     "#070b14",
  s1:     "#0d1424",
  s2:     "#121d32",
  s3:     "#1a2840",
  border: "#1c2d48",
  gold:   "#c9a84c",
  goldL:  "#e4c97a",
  goldD:  "#6e5220",
  cream:  "#e8dfc8",
  muted:  "#7a8ba8",
  dim:    "#344560",
  green:  "#4ade80",
  red:    "#f87171",
  amber:  "#fbbf24",
};

const GLOBAL_CSS = `@import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Nunito:wght@300;400;500;600;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:\( {C.bg};color: \){C.cream};font-family:'Nunito',sans-serif} ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px} textarea,input,select{outline:none;font-family:'Nunito',sans-serif} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} @keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .fade-up{animation:fadeUp 0.25s ease forwards} .fade-in{animation:fadeIn 0.2s ease forwards}`;

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

const DB = {
  async get(k) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
  async set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

// ═══════════════════════════════════════════════════════════════
// GROQ API
// ═══════════════════════════════════════════════════════════════

async function groq(key, system, user, jsonMode = false) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices[0].message.content;
}

// ═══════════════════════════════════════════════════════════════
// FILE EXTRACTION
// ═══════════════════════════════════════════════════════════════

async function readFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt" || ext === "md") return file.text();
  if (ext === "docx") {
    const ab = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: ab });
    return value;
  }
  if (ext === "pdf") {
    if (!window.pdfjsLib) throw new Error("PDF reader still loading — try again in a moment.");
    const ab = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map(it => it.str).join(" ") + "\n";
    }
    return out;
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES + ALL COMPONENTS
// (everything below is exactly as before, just with React imported)
// ═══════════════════════════════════════════════════════════════

function Spinner({ size = 28 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <div style={{
        width: size, height: size,
        border: `2px solid ${C.border}`, borderTop: `2px solid ${C.gold}`,
        borderRadius: "50%", animation: "spin 0.7s linear infinite"
      }} />
    </div>
  );
}

function Btn({ children, onClick, variant = "ghost", disabled, sm, full, style = {} }) {
  const v = {
    primary: { background: C.gold, color: "#000", border: "none" },
    ghost:   { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
    outline: { background: "transparent", color: C.gold, border: `1px solid ${C.gold}` },
    danger:  { background: "transparent", color: C.red, border: `1px solid ${C.red}` },
    subtle:  { background: C.s2, color: C.muted, border: `1px solid ${C.border}` },
  }[variant] || {};

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v,
        fontFamily: "'Nunito', sans-serif",
        padding: sm ? "5px 11px" : "9px 18px",
        fontSize: sm ? "11px" : "12px",
        fontWeight: 600,
        borderRadius: "8px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        letterSpacing: "0.03em",
        transition: "all 0.15s",
        width: full ? "100%" : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ... (Field, Input, Select, Chips, Modal, ModalHeader, ErrorMsg, SettingsModal, HomePage, LibraryPage, NoteModal, StudyPlanPage, FlashcardsPage, QuizPage, Pomodoro — all identical to the previous version) ...

// (For brevity I won't repeat the 400+ lines of components here — they are exactly the same as the last version I sent you. Just keep everything from `function Field...` down to the end of `Pomodoro()` exactly as in my previous message.)

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [page, setPage] = useState("home");
  const [initCourse, setInitCourse] = useState(null);
  const [groqKey, setGroqKeyState] = useState("");
  const [notes, setNotes] = useState({});
  const [progress, setProgress] = useState({});
  const [quizScores, setQuizScores] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // Inject styles & PDF.js
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    document.body.style.cssText = `background:\( {C.bg};color: \){C.cream};font-family:'Nunito',sans-serif`;

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };
    document.head.appendChild(script);
  }, []);

  // Load persisted data
  useEffect(() => {
    (async () => {
      const [k, n, p, qs] = await Promise.all([DB.get("groqKey"), DB.get("notes"), DB.get("progress"), DB.get("quizScores")]);
      if (k) setGroqKeyState(k);
      if (n) setNotes(n);
      if (p) setProgress(p);
      if (qs) setQuizScores(qs);
    })();
  }, []);

  async function saveGroqKey(k) {
    setGroqKeyState(k);
    await DB.set("groqKey", k);
  }

  async function addScore(s) {
    const next = [s, ...quizScores].slice(0, 50);
    setQuizScores(next);
    await DB.set("quizScores", next);
  }

  function navigate(p, course = null) {
    setPage(p);
    if (course) setInitCourse(course);
  }

  const title = { home: null, library: "Library", plan: "Study Plan", flashcards: "Flashcards", quiz: "Quiz" }[page];

  const headerPattern = `repeating-linear-gradient(45deg, ${C.border}22 0, ${C.border}22 1px, transparent 0, transparent 50%)`;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.cream, fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: C.s1,
        backgroundImage: headerPattern,
        backgroundSize: "14px 14px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ background: `${C.s1}ee`, padding: "12px 16px" }}>
          <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {!title ? (
                <>
                  <div style={{ fontFamily: "'Amiri', serif", fontSize: "22px", fontWeight: 700, color: C.gold, letterSpacing: "0.02em", lineHeight: 1 }}>
                    مدرسة&nbsp; Madrasah
                  </div>
                  <div style={{ fontSize: "9.5px", color: C.dim, marginTop: "3px", fontStyle: "italic", letterSpacing: "0.02em" }}>
                    وَقُل رَّبِّ زِدْنِي عِلْمًا&nbsp;·&nbsp;"My Lord, increase me in knowledge." — 20:114
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: "'Amiri', serif", fontSize: "20px", color: C.cream }}>{title}</div>
              )}
            </div>
            <button onClick={() => setShowSettings(true)} style={{
              background: groqKey ? `${C.goldD}44` : C.s2,
              border: `1px solid ${groqKey ? C.goldD : C.border}`,
              color: groqKey ? C.gold : C.muted,
              borderRadius: "8px", padding: "5px 11px", fontSize: "11px",
              cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 600,
            }}>
              {groqKey ? "🔑 Set" : "🔑 Key"}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "16px 14px 84px" }}>
        {page === "home" && <HomePage notes={notes} progress={progress} quizScores={quizScores} groqKey={groqKey} onNavigate={navigate} onOpenSettings={() => setShowSettings(true)} />}
        {page === "library" && <LibraryPage notes={notes} setNotes={setNotes} groqKey={groqKey} initCourse={initCourse} progress={progress} setProgress={setProgress} />}
        {page === "plan" && <StudyPlanPage groqKey={groqKey} />}
        {page === "flashcards" && <FlashcardsPage groqKey={groqKey} />}
        {page === "quiz" && <QuizPage groqKey={groqKey} onScore={addScore} />}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 80,
        background: `${C.s1}f8`, borderTop: `1px solid ${C.border}`,
        backdropFilter: "blur(12px)",
        display: "flex",
      }}>
        {NAV.map(({ id, icon, label }) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => { setPage(id); if (id !== "library") setInitCourse(null); }} style={{
              flex: 1, background: "none", border: "none",
              color: active ? C.gold : C.dim,
              padding: "10px 0 9px",
              cursor: "pointer",
              borderTop: `2px solid ${active ? C.gold : "transparent"}`,
              transition: "all 0.15s",
              fontFamily: "'Nunito', sans-serif",
            }}>
              <div style={{ fontSize: "17px", marginBottom: "2px" }}>{icon}</div>
              <div style={{ fontSize: "8.5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: active ? 700 : 400 }}>{label}</div>
            </button>
          );
        })}
      </div>

      <Pomodoro />

      {showSettings && <SettingsModal groqKey={groqKey} onSave={saveGroqKey} onClose={() => setShowSettings(false)} />}
    </div>
  );
}