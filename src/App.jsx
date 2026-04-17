import { useState, useEffect, useRef } from "react";
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
// STORAGE (fixed: uses localStorage instead of non-standard window.storage)
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
// PRIMITIVES
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      {label && <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "6px" }}>{label}</div>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, multiline, rows = 5, style = {} }) {
  const base = {
    background: C.s2, border: `1px solid ${C.border}`, borderRadius: "8px",
    color: C.cream, fontSize: "13px", padding: "9px 12px", width: "100%", ...style,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...base, resize: "vertical" }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, height: "38px" }} />;
}

function Select({ value, onChange, children, style = {} }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: C.s2, border: `1px solid ${C.border}`, borderRadius: "8px",
      color: C.cream, fontSize: "12px", padding: "8px 12px", width: "100%", cursor: "pointer", ...style,
    }}>{children}</select>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
      {options.map(o => {
        const sel = value === o.value || value === o;
        return (
          <button key={o.value ?? o} onClick={() => onChange(o.value ?? o)} style={{
            background: sel ? C.gold : C.s2, color: sel ? "#000" : C.muted,
            border: `1px solid ${sel ? C.gold : C.border}`, borderRadius: "6px",
            padding: "4px 12px", fontSize: "11px", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
          }}>
            {o.label ?? o}
          </button>
        );
      })}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200,
      display: "flex", alignItems: "flex-end", animation: "fadeIn 0.15s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.s1, border: `1px solid ${C.border}`, borderRadius: "18px 18px 0 0",
        padding: "22px 18px", width: "100%", maxHeight: "90vh", overflowY: "auto",
        animation: "slideUp 0.25s ease",
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
      <span style={{ fontFamily: "'Amiri', serif", fontSize: "18px", color: C.cream }}>{title}</span>
      <Btn sm variant="ghost" onClick={onClose} style={{ padding: "4px 10px" }}>✕</Btn>
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ color: C.red, fontSize: "11px", marginBottom: "10px", padding: "7px 11px", background: "#1a0a0a", border: `1px solid ${C.red}33`, borderRadius: "6px" }}>{msg}</div>;
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════

function SettingsModal({ groqKey, onSave, onClose }) {
  const [val, setVal] = useState(groqKey);
  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Settings" onClose={onClose} />
      <div style={{ background: `${C.goldD}33`, border: `1px solid ${C.goldD}`, borderRadius: "8px", padding: "10px 12px", marginBottom: "14px", fontSize: "11px", color: C.amber, lineHeight: 1.6 }}>
        Get a <strong>free</strong> Groq API key at <span style={{ color: C.goldL }}>console.groq.com</span> — zero cost, runs LLaMA 3.3 70B
      </div>
      <Field label="Groq API Key">
        <Input value={val} onChange={setVal} placeholder="gsk_…" />
      </Field>
      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <Btn variant="primary" full onClick={() => { onSave(val.trim()); onClose(); }}>Save Key</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
      {groqKey && (
        <Btn variant="danger" full onClick={() => { onSave(""); onClose(); }} style={{ marginTop: "10px" }}>
          Clear Key
        </Btn>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════════════════

function HomePage({ notes, progress, quizScores, groqKey, onNavigate, onOpenSettings }) {
  const totalNotes = Object.values(notes).flat().length;
  const studied = SUBJECTS.filter(s => ["studied", "confident"].includes(progress[s.code])).length;
  const confident = SUBJECTS.filter(s => progress[s.code] === "confident").length;
  const pct = Math.round((studied / SUBJECTS.length) * 100);

  const cards = [
    { page: "library",    icon: "📚", title: "Library",      sub: `${totalNotes} notes stored` },
    { page: "plan",       icon: "🗓", title: "Study Plan",   sub: "AI weekly schedule" },
    { page: "flashcards", icon: "🃏", title: "Flashcards",   sub: "Spaced recall" },
    { page: "quiz",       icon: "✏️", title: "Quiz",         sub: "Exam practice" },
  ];

  return (
    <div className="fade-up">
      {!groqKey && (
        <div onClick={onOpenSettings} style={{
          background: `${C.goldD}22`, border: `1px solid ${C.goldD}`, borderRadius: "10px",
          padding: "11px 14px", marginBottom: "16px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "18px" }}>🔑</span>
          <div>
            <div style={{ fontSize: "12px", color: C.amber, fontWeight: 600 }}>Set your Groq API key to unlock AI features</div>
            <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>Free at console.groq.com · Tap to set</div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
          <span>Progress</span>
          <span style={{ color: C.gold }}>{pct}% covered</span>
        </div>
        <div style={{ background: C.s3, height: "3px", borderRadius: "2px", marginBottom: "14px" }}>
          <div style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.green})`, height: "100%", borderRadius: "2px", transition: "width 0.7s ease" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", textAlign: "center" }}>
          {[
            { n: totalNotes,        l: "Notes",     col: C.gold },
            { n: studied,           l: "Studied",   col: C.amber },
            { n: confident,         l: "Confident", col: C.green },
            { n: quizScores.length, l: "Quizzes",   col: C.muted },
          ].map(({ n, l, col }) => (
            <div key={l}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: col, fontFamily: "'Amiri', serif", lineHeight: 1.1 }}>{n}</div>
              <div style={{ fontSize: "9px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "2px" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick nav */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px", marginBottom: "20px" }}>
        {cards.map(({ page, icon, title, sub }) => (
          <div key={page} onClick={() => onNavigate(page)} style={{
            background: C.s1, border: `1px solid ${C.border}`, borderBottom: `2px solid ${C.goldD}`,
            borderRadius: "12px", padding: "14px", cursor: "pointer", transition: "border-color 0.15s",
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
            <div style={{ fontFamily: "'Amiri', serif", fontSize: "15px", color: C.cream }}>{title}</div>
            <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Subjects */}
      <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>All Subjects</div>
      {[1, 2].map(sem => (
        <div key={sem} style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: C.goldD, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>Semester {sem}</div>
          {SUBJECTS.filter(s => s.sem === sem).map(sub => {
            const p = progress[sub.code];
            const nc = (notes[sub.code] || []).length;
            const borderCol = p === "confident" ? C.green : p === "studied" ? C.amber : C.s3;
            return (
              <div key={sub.code} onClick={() => onNavigate("library", sub.code)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 13px", background: C.s1, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${borderCol}`, borderRadius: "8px", marginBottom: "6px", cursor: "pointer",
              }}>
                <div>
                  <div style={{ fontSize: "12px", color: C.cream }}>{sub.name}</div>
                  <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>{sub.code} · {nc} note{nc !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ fontSize: "10px", flexShrink: 0, marginLeft: "10px", color: p === "confident" ? C.green : p === "studied" ? C.amber : C.dim }}>
                  {p === "confident" ? "✓ Confident" : p === "studied" ? "\~ Studied" : "—"}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIBRARY PAGE
// ═══════════════════════════════════════════════════════════════

function LibraryPage({ notes, setNotes, groqKey, initCourse, progress, setProgress }) {
  const [course, setCourse] = useState(initCourse || SUBJECTS[0].code);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [polishing, setPolishing] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  useEffect(() => { if (initCourse) setCourse(initCourse); }, [initCourse]);

  const sub = SUBJECTS.find(s => s.code === course);
  const prog = progress[course];
  const courseNotes = (notes[course] || []).filter(n =>
    !search || n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search)
  );

  async function handleFile(file) {
    try {
      const content = await readFile(file);
      setEditNote({ title: file.name.replace(/.[^.]+$/, ""), content, source: file.name });
      setShowAdd(true);
    } catch (e) { setErr(e.message); }
    fileRef.current.value = "";
  }

  async function saveNote(note) {
    const existing = notes[course] || [];
    const updated = note.id
      ? existing.map(n => n.id === note.id ? note : n)
      : [...existing, { ...note, id: `\( {Date.now()} \){Math.random().toString(36).slice(2)}`, course, createdAt: Date.now() }];
    const next = { ...notes, [course]: updated };
    setNotes(next);
    await DB.set("notes", next);
    setShowAdd(false);
    setEditNote(null);
  }

  async function deleteNote(id) {
    const next = { ...notes, [course]: (notes[course] || []).filter(n => n.id !== id) };
    setNotes(next);
    await DB.set("notes", next);
  }

  async function polishNote(note) {
    if (!groqKey) { setErr("Set your Groq API key first"); return; }
    setPolishing(note.id);
    setErr("");
    try {
      const polished = await groq(
        groqKey,
        "You are an academic editor. Polish and improve the study note below — better structure, clarity, and academic language. Preserve all content. Return only the improved note.",
        note.content
      );
      await saveNote({ ...note, content: polished });
    } catch (e) { setErr("AI error: " + e.message); }
    setPolishing(null);
  }

  async function markProg(level) {
    const next = { ...progress, [course]: progress[course] === level ? "" : level };
    setProgress(next);
    await DB.set("progress", next);
  }

  return (
    <div className="fade-up">
      {/* Course tab strip */}
      <div style={{ display: "flex", gap: "5px", overflowX: "auto", marginBottom: "14px", paddingBottom: "2px" }}>
        {SUBJECTS.map(s => (
          <button key={s.code} onClick={() => { setCourse(s.code); setSearch(""); setErr(""); }} style={{
            flexShrink: 0, background: course === s.code ? C.gold : C.s1,
            color: course === s.code ? "#000" : C.muted,
            border: `1px solid ${course === s.code ? C.gold : C.border}`,
            borderRadius: "20px", padding: "4px 11px", fontSize: "10px", cursor: "pointer",
            fontWeight: course === s.code ? 700 : 400, whiteSpace: "nowrap",
            fontFamily: "'Nunito', sans-serif",
          }}>
            {s.code}
          </button>
        ))}
      </div>

      {/* Subject header */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 15px", marginBottom: "13px" }}>
        <div style={{ fontFamily: "'Amiri', serif", fontSize: "16px", color: C.cream, marginBottom: "2px" }}>{sub?.name}</div>
        <div style={{ fontSize: "10px", color: C.dim, marginBottom: "10px" }}>{sub?.code} · Semester {sub?.sem} · {courseNotes.length} note{courseNotes.length !== 1 ? "s" : ""}</div>
        <div style={{ display: "flex", gap: "7px" }}>
          {["studied", "confident"].map(lv => {
            const on = prog === lv;
            const col = lv === "confident" ? C.green : C.amber;
            return (
              <Btn key={lv} sm onClick={() => markProg(lv)}
                style={{ borderColor: on ? col : C.border, color: on ? col : C.dim, background: on ? `${col}18` : "transparent", border: `1px solid ${on ? col : C.border}` }}>
                {lv === "studied" ? "Studied" : "Confident"}{on ? " ✓" : ""}
              </Btn>
            );
          })}
        </div>
      </div>

      <ErrorMsg msg={err} />

      {/* Actions row */}
      <div style={{ display: "flex", gap: "7px", marginBottom: "13px" }}>
        <Input value={search} onChange={setSearch} placeholder="Search notes…" style={{ flex: 1 }} />
        <Btn sm variant="subtle" onClick={() => { setEditNote(null); setShowAdd(true); }}>+ Note</Btn>
        <Btn sm variant="subtle" onClick={() => fileRef.current?.click()}>📎</Btn>
        <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" style={{ display: "none" }}
          onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
      </div>

      {/* Notes */}
      {courseNotes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.dim }}>
          <div style={{ fontSize: "36px", marginBottom: "10px" }}>📝</div>
          <div style={{ fontSize: "13px" }}>No notes yet</div>
          <div style={{ fontSize: "11px", marginTop: "4px" }}>Add text or upload a PDF, Word, MD, or TXT file</div>
        </div>
      ) : courseNotes.map(note => (
        <div key={note.id} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 15px", marginBottom: "9px" }}>
          <div style={{ fontFamily: "'Amiri', serif", fontSize: "15px", color: C.cream, marginBottom: "3px" }}>{note.title}</div>
          {note.source && <div style={{ fontSize: "10px", color: C.goldD, marginBottom: "5px" }}>📎 {note.source}</div>}
          <div style={{ fontSize: "12px", color: C.muted, lineHeight: 1.65, marginBottom: "11px", maxHeight: "72px", overflow: "hidden" }}>
            {note.content}
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Btn sm variant="ghost" onClick={() => { setEditNote(note); setShowAdd(true); }}>Edit</Btn>
            <Btn sm onClick={() => polishNote(note)} disabled={polishing === note.id || !groqKey}
              style={{ border: `1px solid ${C.goldD}`, color: C.gold, background: "transparent", fontSize: "11px", padding: "5px 11px" }}>
              {polishing === note.id ? "✨ Polishing…" : "✨ AI Polish"}
            </Btn>
            <Btn sm variant="danger" onClick={() => deleteNote(note.id)}>✕</Btn>
          </div>
        </div>
      ))}

      {showAdd && (
        <NoteModal initial={editNote} onSave={saveNote} onClose={() => { setShowAdd(false); setEditNote(null); }} />
      )}
    </div>
  );
}

function NoteModal({ initial, onSave, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  return (
    <Modal onClose={onClose}>
      <ModalHeader title={initial?.id ? "Edit Note" : "New Note"} onClose={onClose} />
      <Field label="Title"><Input value={title} onChange={setTitle} placeholder="Note title…" /></Field>
      <Field label="Content"><Input value={content} onChange={setContent} placeholder="Write notes here…" multiline rows={9} /></Field>
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <Btn variant="primary" full onClick={() => title.trim() && onSave({ ...(initial || {}), title, content, source: initial?.source })}>
          Save
        </Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDY PLAN PAGE
// ═══════════════════════════════════════════════════════════════

function StudyPlanPage({ groqKey }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState(5);
  const [hpd, setHpd] = useState(3);
  const [expanded, setExpanded] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { DB.get("studyPlan").then(p => p && setPlan(p)); }, []);

  async function generate() {
    if (!groqKey) { setErr("Set your Groq API key first"); return; }
    setLoading(true); setErr("");
    try {
      const subList = SUBJECTS.map(s => `${s.code}: ${s.name} (Sem ${s.sem})`).join("\n");
      const raw = await groq(
        groqKey,
        "You are an expert academic planner. Return only valid JSON with no extra text or markdown.",
        `Create a ${weeks}-week study plan for a student studying \( {hpd} hours/day with these 17 courses:\n \){subList}\n\nReturn JSON: {"weeks":[{"week":1,"theme":"string","focus":["DEISS121","DEISS122"],"tasks":["Morning: review X...","Afternoon: practice Y...","Evening: Z..."]}]}`,
        true
      );
      const parsed = JSON.parse(raw.replace(/`json|`/g, "").trim());
      setPlan(parsed);
      setExpanded(1);
      await DB.set("studyPlan", parsed);
    } catch (e) { setErr("Error: " + e.message); }
    setLoading(false);
  }

  return (
    <div className="fade-up">
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "15px", marginBottom: "16px" }}>
        <div style={{ fontFamily: "'Amiri', serif", fontSize: "15px", color: C.cream, marginBottom: "13px" }}>Generate AI Study Plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "13px" }}>
          <Field label="Weeks available">
            <Chips options={[2,3,4,5,6,8]} value={weeks} onChange={setWeeks} />
          </Field>
          <Field label="Hours/day">
            <Chips options={[1,2,3,4,5,6]} value={hpd} onChange={setHpd} />
          </Field>
        </div>
        <ErrorMsg msg={err} />
        <Btn variant="primary" full onClick={generate} disabled={loading}>
          {loading ? "Generating…" : plan ? "✨ Regenerate Plan" : "✨ Generate Plan"}
        </Btn>
      </div>

      {loading && <Spinner />}

      {!loading && plan?.weeks?.map((wk, i) => {
        const open = expanded === wk.week;
        return (
          <div key={i} style={{ marginBottom: "9px" }}>
            <div onClick={() => setExpanded(open ? null : wk.week)} style={{
              background: C.s1, border: `1px solid ${open ? C.gold : C.border}`,
              borderLeft: `3px solid ${open ? C.gold : C.border}`,
              borderRadius: open ? "12px 12px 0 0" : "12px", padding: "13px 15px",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ background: C.gold, color: "#000", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>Week {wk.week}</span>
                <div style={{ fontFamily: "'Amiri', serif", fontSize: "14px", color: C.cream, marginTop: "5px" }}>{wk.theme}</div>
              </div>
              <span style={{ color: open ? C.gold : C.dim, fontSize: "16px" }}>{open ? "▲" : "▼"}</span>
            </div>
            {open && (
              <div style={{ background: C.s2, border: `1px solid ${C.gold}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "13px 15px" }}>
                {wk.focus?.length > 0 && (
                  <div style={{ marginBottom: "11px" }}>
                    <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Focus Subjects</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      {wk.focus.map(code => {
                        const s = SUBJECTS.find(x => x.code === code);
                        return s ? (
                          <span key={code} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 9px", fontSize: "10px", color: C.muted }}>
                            {code}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                {wk.tasks?.length > 0 && (
                  <div>
                    <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>Daily Tasks</div>
                    {wk.tasks.map((t, ti) => (
                      <div key={ti} style={{ display: "flex", gap: "8px", fontSize: "12px", color: C.muted, lineHeight: 1.55, paddingBottom: "5px" }}>
                        <span style={{ color: C.goldD, flexShrink: 0 }}>•</span>{t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLASHCARDS PAGE
// ═══════════════════════════════════════════════════════════════

function FlashcardsPage({ groqKey }) {
  const [course, setCourse] = useState(SUBJECTS[0].code);
  const [count, setCount] = useState(10);
  const [cards, setCards] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [scores, setScores] = useState({ know: 0, review: 0 });
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sub = SUBJECTS.find(s => s.code === course);
  const card = cards[idx];
  const pct = cards.length ? (idx / cards.length) * 100 : 0;

  async function generate() {
    if (!groqKey) { setErr("Set your Groq API key first"); return; }
    setLoading(true); setErr(""); setIdx(0); setFlipped(false);
    setScores({ know: 0, review: 0 }); setDone(false);
    try {
      const raw = await groq(
        groqKey,
        "You are a university Islamic studies tutor. Return only valid JSON.",
        `Generate \( {count} flashcards for " \){sub.name}" (${sub.code}). JSON: {"cards":[{"front":"term or concept","back":"definition or explanation"}]}`,
        true
      );
      const parsed = JSON.parse(raw.replace(/`json|`/g, "").trim());
      setCards(parsed.cards || []);
    } catch (e) { setErr("Error: " + e.message); }
    setLoading(false);
  }

  function respond(knew) {
    setScores(s => ({ ...s, [knew ? "know" : "review"]: s[knew ? "know" : "review"] + 1 }));
    if (idx + 1 >= cards.length) { setDone(true); }
    else { setIdx(idx + 1); setFlipped(false); }
  }

  return (
    <div className="fade-up">
      {/* Controls */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px", marginBottom: "15px" }}>
        <Field label="Course">
          <Select value={course} onChange={v => { setCourse(v); setCards([]); setDone(false); }}>
            {SUBJECTS.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </Select>
        </Field>
        <Field label="Number of cards">
          <Chips options={[5, 10, 15, 20]} value={count} onChange={setCount} />
        </Field>
        <ErrorMsg msg={err} />
        <Btn variant="primary" full onClick={generate} disabled={loading}>
          {loading ? "Generating…" : cards.length ? "New Deck" : "✨ Generate Flashcards"}
        </Btn>
      </div>

      {loading && <Spinner />}

      {!loading && done && (
        <div style={{ textAlign: "center", padding: "32px 20px", background: C.s1, border: `1px solid ${C.green}`, borderRadius: "14px" }}>
          <div style={{ fontFamily: "'Amiri', serif", fontSize: "48px", color: scores.know >= cards.length * 0.8 ? C.green : C.amber, lineHeight: 1 }}>
            {scores.know}/{cards.length}
          </div>
          <div style={{ fontSize: "13px", color: C.muted, marginTop: "6px", marginBottom: "20px" }}>
            {scores.know >= cards.length * 0.8 ? "Excellent — mark as Confident! 🎉" : scores.know >= cards.length * 0.6 ? "Good — keep reviewing" : "Keep studying this topic"}
          </div>
          <Btn variant="outline" onClick={() => { setDone(false); setIdx(0); setFlipped(false); setScores({ know: 0, review: 0 }); }}>
            Restart Deck
          </Btn>
        </div>
      )}

      {!loading && !done && card && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: C.dim, marginBottom: "7px" }}>
            <span>{idx + 1} of {cards.length}</span>
            <span style={{ color: C.green }}>{scores.know} know · <span style={{ color: C.amber }}>{scores.review} review</span></span>
          </div>
          <div style={{ background: C.s3, height: "2px", borderRadius: "2px", marginBottom: "15px" }}>
            <div style={{ width: `${pct}%`, background: C.gold, height: "100%", borderRadius: "2px", transition: "width 0.3s" }} />
          </div>

          {/* Card */}
          <div onClick={() => setFlipped(f => !f)} style={{
            background: flipped ? C.s2 : C.s1,
            border: `1px solid ${flipped ? C.gold : C.border}`,
            borderRadius: "16px", minHeight: "200px", padding: "28px 22px",
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            textAlign: "center", cursor: "pointer", marginBottom: "14px", transition: "all 0.3s ease",
            animation: "fadeIn 0.2s ease",
          }}>
            <div style={{ fontSize: "9px", color: flipped ? C.goldD : C.dim, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "14px" }}>
              {flipped ? "ANSWER" : "QUESTION · tap to reveal"}
            </div>
            <div style={{ fontFamily: "'Amiri', serif", fontSize: "19px", color: C.cream, lineHeight: 1.6 }}>
              {flipped ? card.back : card.front}
            </div>
          </div>

          {flipped && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", animation: "fadeUp 0.2s ease" }}>
              <Btn onClick={() => respond(false)} style={{ border: `1px solid ${C.red}`, color: C.red, background: "transparent", padding: "13px", fontSize: "12px" }}>
                📖 Study More
              </Btn>
              <Btn onClick={() => respond(true)} style={{ border: `1px solid ${C.green}`, color: C.green, background: "transparent", padding: "13px", fontSize: "12px" }}>
                ✓ Got It
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUIZ PAGE
// ═══════════════════════════════════════════════════════════════

function QuizPage({ groqKey, onScore }) {
  const [course, setCourse] = useState("all");
  const [numQ, setNumQ] = useState(5);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function generate() {
    if (!groqKey) { setErr("Set your Groq API key first"); return; }
    setLoading(true); setErr(""); setAnswers({}); setSubmitted(false);
    try {
      const scope = course === "all"
        ? SUBJECTS.map(s => `${s.code}: ${s.name}`).join("\n")
        : (() => { const s = SUBJECTS.find(x => x.code === course); return `${s.code}: ${s.name}`; })();
      const raw = await groq(
        groqKey,
        "You are a university Islamic studies examiner. Return only valid JSON.",
        `Generate ${numQ} multiple-choice exam questions for: ${scope}.\nJSON: {"questions":[{"q":"question text","options":["A. option","B. option","C. option","D. option"],"answer":"A","explanation":"why A is correct","code":"DEISSXXX"}]}`,
        true
      );
      const parsed = JSON.parse(raw.replace(/`json|`/g, "").trim());
      setQuiz(parsed.questions || []);
    } catch (e) { setErr("Error: " + e.message); }
    setLoading(false);
  }

  function submit() {
    if (Object.keys(answers).length < quiz.length) return;
    setSubmitted(true);
    const score = quiz.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);
    onScore({ score, total: quiz.length, course, date: Date.now() });
  }

  const score = quiz ? quiz.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0) : 0;
  const ratio = quiz ? score / quiz.length : 0;

  return (
    <div className="fade-up">
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px", marginBottom: "15px" }}>
        <Field label="Course">
          <Select value={course} onChange={v => { setCourse(v); setQuiz(null); }}>
            <option value="all">🎲 All Courses — Mixed</option>
            {SUBJECTS.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </Select>
        </Field>
        <Field label="Questions">
          <Chips options={[5, 10, 15]} value={numQ} onChange={setNumQ} />
        </Field>
        <ErrorMsg msg={err} />
        <Btn variant="primary" full onClick={generate} disabled={loading}>
          {loading ? "Generating…" : quiz ? "New Quiz" : "✨ Generate Quiz"}
        </Btn>
      </div>

      {loading && <Spinner />}

      {submitted && (
        <div style={{
          background: ratio >= 0.8 ? "#14532d22" : ratio >= 0.6 ? "#78350f22" : "#1a070722",
          border: `1px solid ${ratio >= 0.8 ? C.green : ratio >= 0.6 ? C.amber : C.red}`,
          borderRadius: "12px", padding: "20px", textAlign: "center", marginBottom: "15px",
        }}>
          <div style={{ fontFamily: "'Amiri', serif", fontSize: "42px", fontWeight: 700, lineHeight: 1, color: ratio >= 0.8 ? C.green : ratio >= 0.6 ? C.amber : C.red }}>
            {score}/{quiz.length}
          </div>
          <div style={{ fontSize: "12px", color: C.muted, marginTop: "6px" }}>
            {ratio >= 0.8 ? "Excellent! Time to mark this as Confident 🎉" : ratio >= 0.6 ? "Decent — review the ones you missed" : "Needs work — head back to the Library"}
          </div>
        </div>
      )}

      {!loading && quiz?.map((q, qi) => (
        <div key={qi} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 15px", marginBottom: "9px" }}>
          <div style={{ fontSize: "12px", color: C.cream, lineHeight: 1.6, marginBottom: "9px" }}>
            <span style={{ color: C.gold, fontWeight: 700 }}>Q{qi + 1}. </span>{q.q}
          </div>
          {q.code && <div style={{ fontSize: "9px", color: C.goldD, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.07em" }}>{q.code}</div>}
          <div style={{ display: "grid", gap: "6px" }}>
            {q.options.map((opt, oi) => {
              const letter = opt[0];
              const sel = answers[qi] === letter;
              const correct = submitted && letter === q.answer;
              const wrong = submitted && sel && letter !== q.answer;
              return (
                <button key={oi} onClick={() => !submitted && setAnswers(a => ({ ...a, [qi]: letter }))} style={{
                  background: correct ? "#14532d" : wrong ? "#1a0707" : sel ? C.s3 : C.s2,
                  border: `1px solid ${correct ? C.green : wrong ? C.red : sel ? C.gold : C.border}`,
                  color: correct ? C.green : wrong ? C.red : sel ? C.cream : C.muted,
                  padding: "9px 12px", borderRadius: "8px", textAlign: "left",
                  cursor: submitted ? "default" : "pointer", fontSize: "12px",
                  transition: "all 0.15s", fontFamily: "'Nunito', sans-serif",
                }}>{opt}</button>
              );
            })}
          </div>
          {submitted && q.explanation && (
            <div style={{ marginTop: "10px", fontSize: "11px", color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: "9px" }}>
              💡 {q.explanation}
            </div>
          )}
        </div>
      ))}

      {!loading && quiz && !submitted && (
        <Btn variant="primary" full onClick={submit} disabled={Object.keys(answers).length < quiz.length}
          style={{ padding: "13px", fontSize: "13px", marginTop: "4px" }}>
          Submit ({Object.keys(answers).length}/{quiz.length} answered)
        </Btn>
      )}

      {submitted && (
        <Btn variant="outline" full onClick={() => { setQuiz(null); setSubmitted(false); }}
          style={{ padding: "13px", fontSize: "13px", marginTop: "8px" }}>
          New Quiz →
        </Btn>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POMODORO WIDGET
// ═══════════════════════════════════════════════════════════════

function Pomodoro() {
  const WORK = 25 * 60, BREAK = 5 * 60;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("work");
  const [secs, setSecs] = useState(WORK);
  const [running, setRunning] = useState(false);
  const modeRef = useRef("work");
  const timerRef = useRef(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!running) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          setRunning(false);
          const next = modeRef.current === "work" ? "break" : "work";
          setMode(next);
          setSecs(next === "work" ? WORK : BREAK);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [running]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const total = mode === "work" ? WORK : BREAK;
  const R = 28, circ = 2 * Math.PI * R;
  const dash = circ - (circ * ((total - secs) / total));

  return (
    <>
      <div onClick={() => setOpen(o => !o)} style={{
        position: "fixed", right: "16px", bottom: "70px", zIndex: 90,
        width: "46px", height: "46px", borderRadius: "50%",
        background: running ? C.goldD : C.s2,
        border: `2px solid ${running ? C.gold : C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: "18px",
        boxShadow: running ? `0 0 18px ${C.goldD}88` : "none",
        transition: "all 0.25s",
      }}>🍅</div>

      {open && (
        <div style={{
          position: "fixed", right: "12px", bottom: "124px", zIndex: 91,
          background: C.s1, border: `1px solid ${C.border}`, borderRadius: "16px",
          padding: "18px 16px", width: "180px", animation: "fadeUp 0.2s ease",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: mode === "work" ? C.gold : C.green, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
              {mode === "work" ? "Focus" : "Break"}
            </div>
            <svg width="80" height="80" style={{ marginBottom: "10px", display: "block", margin: "0 auto 10px" }}>
              <circle cx="40" cy="40" r={R} fill="none" stroke={C.s3} strokeWidth="3" />
              <circle cx="40" cy="40" r={R} fill="none" stroke={mode === "work" ? C.gold : C.green}
                strokeWidth="3" strokeDasharray={circ} strokeDashoffset={dash}
                strokeLinecap="round" transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dashoffset 1s linear" }} />
              <text x="40" y="46" textAnchor="middle" fill={C.cream} fontSize="15"
                fontFamily="Nunito, sans-serif" fontWeight="600">{mm}:{ss}</text>
            </svg>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
              <Btn sm variant={running ? "ghost" : "primary"} onClick={() => setRunning(r => !r)}>{running ? "⏸" : "▶"}</Btn>
              <Btn sm variant="ghost" onClick={() => { setRunning(false); setSecs(mode === "work" ? WORK : BREAK); }}>↺</Btn>
              <Btn sm variant="ghost" onClick={() => { const n = mode === "work" ? "break" : "work"; setMode(n); setSecs(n === "work" ? WORK : BREAK); setRunning(false); }}>⇄</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════════

const NAV = [
  { id: "home",       icon: "⌂",  label: "Home"    },
  { id: "library",    icon: "📚", label: "Library" },
  { id: "plan",       icon: "🗓", label: "Plan"    },
  { id: "flashcards", icon: "🃏", label: "Cards"   },
  { id: "quiz",       icon: "✏️", label: "Quiz"    },
];

const PAGE_TITLE = { home: null, library: "Library", plan: "Study Plan", flashcards: "Flashcards", quiz: "Quiz" };

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
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
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

  const title = PAGE_TITLE[page];

  // Geometric pattern for header
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

      {/* Content */}
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "16px 14px 84px" }}>
        {page === "home" && (
          <HomePage notes={notes} progress={progress} quizScores={quizScores}
            groqKey={groqKey} onNavigate={navigate} onOpenSettings={() => setShowSettings(true)} />
        )}
        {page === "library" && (
          <LibraryPage notes={notes} setNotes={setNotes} groqKey={groqKey}
            initCourse={initCourse} progress={progress} setProgress={setProgress} />
        )}
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

      {/* Pomodoro */}
      <Pomodoro />

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal groqKey={groqKey} onSave={saveGroqKey} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}