import React, { useState, useEffect, useRef } from "react";
import * as mammoth from "mammoth";

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

const GLOBAL_CSS = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:${C.bg};color:${C.cream};font-family:'Nunito',sans-serif} ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px} textarea,input,select{outline:none;font-family:'Nunito',sans-serif} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} @keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .fade-up{animation:fadeUp 0.25s ease forwards} .fade-in{animation:fadeIn 0.2s ease forwards}`;

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

const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ═══════════════════════════════════════════════════════════════
// GROQ API (user supplies their own key in settings)
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
// FILE EXTRACTION (txt / md / docx / pdf)
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
    if (!window.pdfjsLib) throw new Error("PDF reader still loading. Try again in a moment.");
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
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

const card = {
  background: C.s1,
  border: `1px solid ${C.border}`,
  borderRadius: "12px",
  padding: "14px",
};

const inputStyle = {
  width: "100%",
  background: C.s2,
  border: `1px solid ${C.border}`,
  borderRadius: "8px",
  color: C.cream,
  padding: "9px 12px",
  fontSize: "13px",
};

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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      {children}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} className="fade-up" style={{
        background: C.s1, border: `1px solid ${C.border}`, borderBottom: "none",
        borderRadius: "16px 16px 0 0", padding: "20px 16px 28px",
        width: "100%", maxWidth: "640px", maxHeight: "85vh", overflowY: "auto",
        animation: "slideUp 0.25s ease",
      }}>
        {children}
      </div>
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}`, color: C.red, borderRadius: "8px", padding: "9px 12px", fontSize: "12px", marginBottom: "12px" }}>{msg}</div>;
}

function KeyGate({ groqKey, onOpenSettings, action }) {
  if (groqKey) return null;
  return (
    <div style={{ ...card, textAlign: "center", padding: "28px 16px" }}>
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔑</div>
      <div style={{ fontWeight: 800, marginBottom: "4px" }}>API key needed</div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px" }}>Add your free Groq key to generate {action}.</div>
      <Btn variant="primary" onClick={onOpenSettings}>Set API key</Btn>
    </div>
  );
}

const NAV = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "library", icon: "📚", label: "Library" },
  { id: "plan", icon: "🗺️", label: "Plan" },
  { id: "flashcards", icon: "🃏", label: "Cards" },
  { id: "quiz", icon: "✏️", label: "Quiz" },
];

// ═══════════════════════════════════════════════════════════════
// SETTINGS (API key)
// ═══════════════════════════════════════════════════════════════

function SettingsModal({ groqKey, onSave, onClose }) {
  const [key, setKey] = useState(groqKey || "");
  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "4px" }}>Settings</div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px" }}>Your key stays in this browser only. Get one free at console.groq.com.</div>
      <Field label="Groq API key">
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="gsk_..." style={inputStyle} />
      </Field>
      <div style={{ display: "flex", gap: "8px" }}>
        <Btn variant="primary" full onClick={() => { onSave(key.trim()); onClose(); }}>Save</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════

function SubjectModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [err, setErr] = useState("");
  function save() {
    if (!name.trim()) { setErr("Give the subject a name."); return; }
    onSave(name.trim());
    onClose();
  }
  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "14px" }}>{initial ? "Rename subject" : "New subject"}</div>
      <ErrorMsg msg={err} />
      <Field label="Subject name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Biology, Arabic Grammar, Economics" style={inputStyle} autoFocus onKeyDown={e => { if (e.key === "Enter") save(); }} />
      </Field>
      <div style={{ display: "flex", gap: "8px" }}>
        <Btn variant="primary" full onClick={save}>{initial ? "Save" : "Add subject"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function ConfirmModal({ text, onYes, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 800, fontSize: "15px", marginBottom: "8px" }}>Are you sure?</div>
      <div style={{ fontSize: "13px", color: C.muted, marginBottom: "16px" }}>{text}</div>
      <div style={{ display: "flex", gap: "8px" }}>
        <Btn variant="danger" full onClick={() => { onYes(); onClose(); }}>Yes, delete</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════

function HomePage({ subjects, setSubjects, notes, quizScores, groqKey, onNavigate, onOpenSettings }) {
  const [modal, setModal] = useState(null); // {mode:'add'} | {mode:'edit', sub} | {mode:'del', sub}

  function addSubject(name) {
    setSubjects([...subjects, { id: uid(), name, createdAt: new Date().toISOString() }]);
  }
  function renameSubject(id, name) {
    setSubjects(subjects.map(s => s.id === id ? { ...s, name } : s));
  }
  function deleteSubject(id) {
    setSubjects(subjects.filter(s => s.id !== id));
  }

  const totalNotes = Object.values(notes).reduce((a, arr) => a + (arr ? arr.length : 0), 0);
  const recent = [...quizScores].slice(0, 5);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontWeight: 800, fontSize: "15px" }}>My subjects</div>
        <Btn sm variant="outline" onClick={() => setModal({ mode: "add" })}>+ Add</Btn>
      </div>

      {subjects.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📖</div>
          <div style={{ fontWeight: 800, marginBottom: "4px" }}>No subjects yet</div>
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px" }}>Add the subjects you study. Notes, flashcards, and quizzes hang off them.</div>
          <Btn variant="primary" onClick={() => setModal({ mode: "add" })}>Add your first subject</Btn>
        </div>
      )}

      {subjects.map(s => {
        const n = (notes[s.id] || []).length;
        const scores = quizScores.filter(q => q.subjectId === s.id);
        const best = scores.length ? Math.max(...scores.map(q => Math.round((q.score / q.total) * 100))) : null;
        return (
          <div key={s.id} style={{ ...card, marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <div onClick={() => onNavigate("library", s.id)} style={{ fontWeight: 800, fontSize: "15px", cursor: "pointer" }}>{s.name}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <Btn sm variant="subtle" onClick={() => setModal({ mode: "edit", sub: s })}>Edit</Btn>
                <Btn sm variant="danger" onClick={() => setModal({ mode: "del", sub: s })}>Delete</Btn>
              </div>
            </div>
            <div style={{ fontSize: "11.5px", color: C.muted, marginBottom: "10px" }}>
              {n} note{n === 1 ? "" : "s"}{best !== null ? ` · best quiz ${best}%` : ""}
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <Btn sm onClick={() => onNavigate("library", s.id)}>📚 Open</Btn>
              <Btn sm onClick={() => onNavigate("flashcards", s.id)}>🃏 Cards</Btn>
              <Btn sm onClick={() => onNavigate("quiz", s.id)}>✏️ Quiz</Btn>
            </div>
          </div>
        );
      })}

      {(totalNotes > 0 || recent.length > 0) && (
        <div style={{ ...card, marginTop: "14px" }}>
          <div style={{ fontWeight: 800, fontSize: "13px", marginBottom: "6px" }}>Overview</div>
          <div style={{ fontSize: "12px", color: C.muted }}>{subjects.length} subject{subjects.length === 1 ? "" : "s"} · {totalNotes} note{totalNotes === 1 ? "" : "s"} · {quizScores.length} quiz{quizScores.length === 1 ? " attempt" : " attempts"}</div>
          {recent.map((q, i) => (
            <div key={i} style={{ fontSize: "12px", color: C.muted, marginTop: "4px" }}>
              {q.subjectName}: {q.score}/{q.total} · {new Date(q.ts).toLocaleDateString()}
            </div>
          ))}
        </div>
      )}

      {!groqKey && subjects.length > 0 && (
        <div style={{ ...card, marginTop: "10px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "10px" }}>Study plans, flashcards, and quizzes need a free Groq key.</div>
          <Btn sm variant="outline" onClick={onOpenSettings}>Set API key</Btn>
        </div>
      )}

      {modal && modal.mode === "add" && <SubjectModal onSave={addSubject} onClose={() => setModal(null)} />}
      {modal && modal.mode === "edit" && <SubjectModal initial={modal.sub} onSave={name => renameSubject(modal.sub.id, name)} onClose={() => setModal(null)} />}
      {modal && modal.mode === "del" && <ConfirmModal text={`Delete "${modal.sub.name}" and all its notes? Quiz history stays.`} onYes={() => deleteSubject(modal.sub.id)} onClose={() => setModal(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIBRARY (notes per subject, file import)
// ═══════════════════════════════════════════════════════════════

function LibraryPage({ subjects, notes, setNotes, initSubjectId, progress, setProgress }) {
  const [activeId, setActiveId] = useState(initSubjectId || (subjects[0] && subjects[0].id) || null);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (initSubjectId) setActiveId(initSubjectId);
  }, [initSubjectId]);

  const active = subjects.find(s => s.id === activeId) || null;
  const list = (active && notes[active.id]) || [];
  const done = (active && progress[active.id]) || [];

  function persist(next) {
    setNotes(next);
    DB.set("notes", next);
  }

  async function saveNote() {
    if (!active) return;
    if (!title.trim() && !text.trim()) { setErr("Add a title or some text first."); return; }
    const next = { ...(notes || {}) };
    const arr = [...(next[active.id] || [])];
    arr.unshift({ id: uid(), title: title.trim() || "Untitled", text, ts: new Date().toISOString() });
    next[active.id] = arr;
    persist(next);
    setTitle(""); setText(""); setErr(""); setShowAdd(false);
  }

  async function importFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f || !active) return;
    setBusy(true); setErr("");
    try {
      const content = await readFile(f);
      const next = { ...(notes || {}) };
      const arr = [...(next[active.id] || [])];
      arr.unshift({ id: uid(), title: f.name.replace(/\.[^.]+$/, ""), text: content.slice(0, 60000), ts: new Date().toISOString() });
      next[active.id] = arr;
      persist(next);
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  }

  function deleteNote(id) {
    const next = { ...(notes || {}) };
    next[active.id] = (next[active.id] || []).filter(n => n.id !== id);
    persist(next);
  }

  function toggleDone(id) {
    const set = new Set(done);
    if (set.has(id)) set.delete(id); else set.add(id);
    const next = { ...(progress || {}), [active.id]: [...set] };
    setProgress(next);
    DB.set("progress", next);
  }

  if (subjects.length === 0) {
    return <div style={{ ...card, textAlign: "center", padding: "32px 16px" }}>
      <div style={{ fontWeight: 800, marginBottom: "4px" }}>No subjects yet</div>
      <div style={{ fontSize: "12px", color: C.muted }}>Add a subject on the Home tab first.</div>
    </div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
        {subjects.map(s => (
          <button key={s.id} onClick={() => setActiveId(s.id)} style={{
            background: s.id === activeId ? C.gold : "transparent",
            color: s.id === activeId ? "#000" : C.muted,
            border: `1px solid ${s.id === activeId ? C.gold : C.border}`,
            borderRadius: "20px", padding: "5px 13px", fontSize: "12px", fontWeight: 700,
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
          }}>{s.name}</button>
        ))}
      </div>

      <ErrorMsg msg={err} />

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <Btn variant="primary" full onClick={() => setShowAdd(v => !v)}>{showAdd ? "Close editor" : "+ New note"}</Btn>
        <Btn variant="outline" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>Import file</Btn>
        <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" onChange={importFile} style={{ display: "none" }} />
      </div>
      {busy && <Spinner size={20} />}

      {showAdd && (
        <div style={{ ...card, marginBottom: "12px" }}>
          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 3 summary" style={inputStyle} />
          </Field>
          <Field label="Text (or import a file: txt, md, docx, pdf)">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Paste or type notes here..." style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <Btn variant="primary" full onClick={saveNote}>Save note</Btn>
        </div>
      )}

      {list.length === 0 && <div style={{ fontSize: "12px", color: C.dim, textAlign: "center", padding: "24px 0" }}>No notes in {active ? active.name : "this subject"} yet.</div>}

      {list.map(n => (
        <div key={n.id} style={{ ...card, marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div style={{ fontWeight: 800, fontSize: "14px" }}>{n.title}</div>
            <Btn sm variant="danger" onClick={() => deleteNote(n.id)}>Delete</Btn>
          </div>
          <div style={{ fontSize: "12px", color: C.dim, marginBottom: "6px" }}>{new Date(n.ts).toLocaleString()}</div>
          <div style={{ fontSize: "13px", color: C.cream, whiteSpace: "pre-wrap", maxHeight: "160px", overflowY: "auto", marginBottom: "8px" }}>{n.text.slice(0, 2000)}{n.text.length > 2000 ? "…" : ""}</div>
          <Btn sm variant={done.includes(n.id) ? "primary" : "subtle"} onClick={() => toggleDone(n.id)}>
            {done.includes(n.id) ? "✓ Studied" : "Mark studied"}
          </Btn>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDY PLAN (AI)
// ═══════════════════════════════════════════════════════════════

function StudyPlanPage({ subjects, notes, groqKey, onOpenSettings }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [days, setDays] = useState("7");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!groqKey) return <KeyGate groqKey={groqKey} onOpenSettings={onOpenSettings} action="study plans" />;
  if (subjects.length === 0) return <div style={card}><div style={{ fontSize: "13px", color: C.muted }}>Add a subject on the Home tab first.</div></div>;

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const context = ((notes[sub.id] || []).map(n => `${n.title}:\n${n.text}`).join("\n\n") || "No notes yet.").slice(0, 12000);

  async function generate() {
    setBusy(true); setErr(""); setPlan("");
    try {
      const out = await groq(groqKey,
        "You are a practical study coach. Reply in plain text with a day by day plan. Keep it concrete and realistic.",
        `Subject: ${sub.name}\nDays available: ${days}\nMy notes:\n${context}`);
      setPlan(out);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: "12px" }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => setSubId(e.target.value)} style={inputStyle}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Days until the exam">
          <input value={days} onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} />
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>{busy ? "Planning..." : "Generate plan"}</Btn>
      </div>
      {busy && <Spinner />}
      {plan && <div style={{ ...card, whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.65 }}>{plan}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLASHCARDS (AI)
// ═══════════════════════════════════════════════════════════════

function FlashcardsPage({ subjects, notes, groqKey, onOpenSettings }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [cards, setCards] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!groqKey) return <KeyGate groqKey={groqKey} onOpenSettings={onOpenSettings} action="flashcards" />;
  if (subjects.length === 0) return <div style={card}><div style={{ fontSize: "13px", color: C.muted }}>Add a subject on the Home tab first.</div></div>;

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const context = ((notes[sub.id] || []).map(n => `${n.title}:\n${n.text}`).join("\n\n") || "").slice(0, 12000);

  async function generate() {
    if (!context) { setErr("Add some notes to this subject first, so there is material to build cards from."); return; }
    setBusy(true); setErr(""); setCards([]); setIdx(0); setFlip(false);
    try {
      const out = await groq(groqKey,
        'You make flashcards. Reply with JSON only: {"cards": [{"front": "...", "back": "..."}]}. Make 10 cards.',
        `Subject: ${sub.name}\nMaterial:\n${context}`, true);
      const parsed = JSON.parse(out);
      if (!parsed.cards || !parsed.cards.length) throw new Error("No cards came back. Try again.");
      setCards(parsed.cards.slice(0, 20));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  const cur = cards[idx];

  return (
    <div>
      <div style={{ ...card, marginBottom: "12px" }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => { setSubId(e.target.value); setCards([]); }} style={inputStyle}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>{busy ? "Making cards..." : cards.length ? "Regenerate" : "Generate flashcards"}</Btn>
      </div>
      {busy && <Spinner />}
      {cur && (
        <div>
          <div onClick={() => setFlip(f => !f)} style={{
            ...card, minHeight: "220px", display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", cursor: "pointer", fontSize: "16px", fontWeight: 700, padding: "28px 20px",
            borderColor: C.goldD,
          }}>
            {flip ? cur.back : cur.front}
          </div>
          <div style={{ fontSize: "11px", color: C.dim, textAlign: "center", margin: "8px 0" }}>Tap card to flip · {idx + 1} of {cards.length}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Btn full disabled={idx === 0} onClick={() => { setIdx(idx - 1); setFlip(false); }}>← Back</Btn>
            <Btn full disabled={idx >= cards.length - 1} onClick={() => { setIdx(idx + 1); setFlip(false); }}>Next →</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUIZ (AI)
// ═══════════════════════════════════════════════════════════════

function QuizPage({ subjects, notes, groqKey, onScore, onOpenSettings }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [qs, setQs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!groqKey) return <KeyGate groqKey={groqKey} onOpenSettings={onOpenSettings} action="quizzes" />;
  if (subjects.length === 0) return <div style={card}><div style={{ fontSize: "13px", color: C.muted }}>Add a subject on the Home tab first.</div></div>;

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const context = ((notes[sub.id] || []).map(n => `${n.title}:\n${n.text}`).join("\n\n") || "").slice(0, 12000);

  async function generate() {
    if (!context) { setErr("Add some notes to this subject first, so there is material for questions."); return; }
    setBusy(true); setErr(""); setQs([]); setAnswers({}); setDone(false);
    try {
      const out = await groq(groqKey,
        'You write quizzes. Reply with JSON only: {"questions": [{"q": "...", "options": ["A", "B", "C", "D"], "answer": 0}]}. Make 5 questions, answer is the index of the correct option.',
        `Subject: ${sub.name}\nMaterial:\n${context}`, true);
      const parsed = JSON.parse(out);
      if (!parsed.questions || !parsed.questions.length) throw new Error("No questions came back. Try again.");
      setQs(parsed.questions.slice(0, 10));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  function finish() {
    setDone(true);
    const score = qs.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);
    onScore({ subjectId: sub.id, subjectName: sub.name, score, total: qs.length, ts: new Date().toISOString() });
  }

  const score = qs.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <div>
      <div style={{ ...card, marginBottom: "12px" }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => { setSubId(e.target.value); setQs([]); setDone(false); }} style={inputStyle}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>{busy ? "Writing quiz..." : qs.length ? "New quiz" : "Generate quiz"}</Btn>
      </div>
      {busy && <Spinner />}
      {done && qs.length > 0 && (
        <div style={{ ...card, marginBottom: "12px", textAlign: "center", borderColor: score / qs.length >= 0.6 ? C.green : C.amber }}>
          <div style={{ fontSize: "26px", fontWeight: 800 }}>{score}/{qs.length}</div>
          <div style={{ fontSize: "12px", color: C.muted }}>{score / qs.length >= 0.6 ? "Solid. Keep it up." : "Room to grow. Hit the notes and retry."}</div>
        </div>
      )}
      {qs.map((q, i) => (
        <div key={i} style={{ ...card, marginBottom: "10px" }}>
          <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px" }}>{i + 1}. {q.q}</div>
          {q.options.map((op, oi) => {
            const picked = answers[i] === oi;
            const show = done && oi === q.answer;
            const wrong = done && picked && oi !== q.answer;
            return (
              <button key={oi} disabled={done} onClick={() => setAnswers({ ...answers, [i]: oi })} style={{
                display: "block", width: "100%", textAlign: "left", marginBottom: "6px",
                background: show ? `${C.green}22` : wrong ? `${C.red}22` : picked ? C.s3 : C.s2,
                border: `1px solid ${show ? C.green : wrong ? C.red : C.border}`,
                color: C.cream, borderRadius: "8px", padding: "8px 12px", fontSize: "13px",
                cursor: done ? "default" : "pointer", fontFamily: "'Nunito', sans-serif",
              }}>{op}</button>
            );
          })}
        </div>
      ))}
      {qs.length > 0 && !done && <Btn variant="primary" full onClick={finish}>Finish quiz</Btn>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POMODORO
// ═══════════════════════════════════════════════════════════════

function Pomodoro() {
  const [secs, setSecs] = useState(25 * 60);
  const [mode, setMode] = useState("focus");
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const lens = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };

  useEffect(() => {
    if (running) {
      timer.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(timer.current);
            setRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer.current);
  }, [running]);

  function pick(m) {
    setMode(m);
    setSecs(lens[m]);
    setRunning(false);
  }

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: "fixed", bottom: "76px", right: "14px", zIndex: 90,
        width: "48px", height: "48px", borderRadius: "50%",
        background: C.gold, border: "none", fontSize: "20px", cursor: "pointer",
      }}>⏱️</button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: "76px", right: "14px", zIndex: 90,
      ...card, width: "220px", textAlign: "center",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: C.muted }}>FOCUS TIMER</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: "14px" }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: "4px", justifyContent: "center", marginBottom: "8px" }}>
        {[["focus", "25"], ["short", "5"], ["long", "15"]].map(([m, label]) => (
          <button key={m} onClick={() => pick(m)} style={{
            background: mode === m ? C.gold : C.s2, color: mode === m ? "#000" : C.muted,
            border: "none", borderRadius: "6px", padding: "3px 9px", fontSize: "11px",
            fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: "34px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        <Btn sm variant="primary" full onClick={() => { if (secs === 0) setSecs(lens[mode]); setRunning(r => !r); }}>{running ? "Pause" : "Start"}</Btn>
        <Btn sm onClick={() => { setSecs(lens[mode]); setRunning(false); }}>Reset</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [page, setPage] = useState("home");
  const [initSubject, setInitSubject] = useState(null);
  const [subjects, setSubjectsState] = useState([]);
  const [groqKey, setGroqKeyState] = useState("");
  const [notes, setNotesState] = useState({});
  const [progress, setProgressState] = useState({});
  const [quizScores, setQuizScores] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // Inject styles & PDF.js
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    document.body.style.cssText = `background:${C.bg};color:${C.cream};font-family:'Nunito',sans-serif`;

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
      const [sj, k, n, p, qs] = await Promise.all([DB.get("subjects"), DB.get("groqKey"), DB.get("notes"), DB.get("progress"), DB.get("quizScores")]);
      if (sj) setSubjectsState(sj);
      if (k) setGroqKeyState(k);
      if (n) setNotesState(n);
      if (p) setProgressState(p);
      if (qs) setQuizScores(qs);
    })();
  }, []);

  // Migrate old hardcoded installs: first run with no saved subjects gets a clean slate
  // (nothing to migrate — subjects start empty by design)

  async function setSubjects(next) {
    setSubjectsState(next);
    await DB.set("subjects", next);
  }

  async function setNotes(next) {
    setNotesState(next);
    await DB.set("notes", next);
  }

  async function setProgress(next) {
    setProgressState(next);
    await DB.set("progress", next);
  }

  async function saveGroqKey(k) {
    setGroqKeyState(k);
    await DB.set("groqKey", k);
  }

  async function addScore(s) {
    const next = [s, ...quizScores].slice(0, 50);
    setQuizScores(next);
    await DB.set("quizScores", next);
  }

  function navigate(p, subjectId = null) {
    setPage(p);
    setInitSubject(subjectId);
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
                  <div style={{ fontSize: "22px", fontWeight: 800, color: C.gold, letterSpacing: "0.02em", lineHeight: 1 }}>
                    Madrasah
                  </div>
                  <div style={{ fontSize: "10px", color: C.dim, marginTop: "3px", fontStyle: "italic", letterSpacing: "0.02em" }}>
                    Your subjects, notes, and quizzes in one place.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "20px", fontWeight: 800, color: C.cream }}>{title}</div>
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
        {page === "home" && <HomePage subjects={subjects} setSubjects={setSubjects} notes={notes} quizScores={quizScores} groqKey={groqKey} onNavigate={navigate} onOpenSettings={() => setShowSettings(true)} />}
        {page === "library" && <LibraryPage subjects={subjects} notes={notes} setNotes={setNotes} initSubjectId={initSubject} progress={progress} setProgress={setProgress} />}
        {page === "plan" && <StudyPlanPage subjects={subjects} notes={notes} groqKey={groqKey} onOpenSettings={() => setShowSettings(true)} />}
        {page === "flashcards" && <FlashcardsPage subjects={subjects} notes={notes} groqKey={groqKey} onOpenSettings={() => setShowSettings(true)} />}
        {page === "quiz" && <QuizPage subjects={subjects} notes={notes} groqKey={groqKey} onScore={addScore} onOpenSettings={() => setShowSettings(true)} />}
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
            <button key={id} onClick={() => { setPage(id); if (id !== "library") setInitSubject(null); }} style={{
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
