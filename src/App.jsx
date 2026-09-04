import React, { useState, useEffect, useRef } from "react";
import * as mammoth from "mammoth";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  House, BookOpen, Layers, PenLine, KeyRound, Timer,
  Plus, Pencil, Trash2, X, Check,
  FileUp, Sparkles, Clock, Flame, MessageCircle, GraduationCap,
  RotateCcw, Send, Target, Map as MapIcon,
} from "lucide-react";
import "./index.css";
import { applySM2, dueCards, QUALITY } from "./sm2.js";
import { logActivity, streakInfo, weeklyDigest } from "./progress.js";

// saved stuff lives in localstorage

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

const EASE = [0.16, 1, 0.3, 1];

// groq calls. the key comes from settings, models set once up top
const TEXT_MODEL = "openai/gpt-oss-120b";
const VISION_MODEL = "qwen/qwen3.8-27b";

async function groq(key, system, user, jsonMode = false) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      max_tokens: 2048,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices[0].message.content;
}

// shrink photos before sending them to vision
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function imageToDataUrl(file, maxDim = 1568) {
  if (!window.createImageBitmap) return fileToDataUrl(file);
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return fileToDataUrl(file);
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  } catch {
    return fileToDataUrl(file);
  }
}

// vision read for photos, keeps math as latex
async function visionReadImage(key, file) {
  const dataUrl = await imageToDataUrl(file);
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcribe this image for study notes. Copy all text exactly. Write math as LaTeX ($...$ inline, $$...$$ for blocks). Describe each diagram in one line. Plain text only, no headings." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const text = ((d.choices[0] && d.choices[0].message.content) || "").trim();
  if (!text) throw new Error("The AI came back empty. Try a clearer, closer photo.");
  return text;
}

// turn api errors into plain english
function friendlyError(ex, what) {
  const msg = (ex && ex.message) || "";
  if (/failed to fetch|networkerror|offline/i.test(msg)) return "No connection. Check your network and try again.";
  if (/401|invalid.*key|unauthorized|invalid_api_key/i.test(msg)) return "That API key didn't work. Tap Key (top right) and paste a fresh Groq key.";
  if (/404|model.*not found|model_not_found|does not exist/i.test(msg)) return "Groq doesn't recognise that model. It may have been renamed — send me the exact text and I'll fix the model ID.";
  if (/429|rate.?limit|too many requests/i.test(msg)) return "Groq rate limit (free tier). Wait a minute and retry.";
  if (/413|too large|maximum.*image|image.*limit/i.test(msg)) return "Photo too large. Try a tighter crop and retry.";
  if (/no text found|came back empty/i.test(msg)) return msg;
  return `${what} failed: ${msg || "unknown error"}. Try again.`;
}

// pull text out of files

async function readFile(file, onProgress) {
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
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "bmp") {
    const { recognize } = await import("tesseract.js");
    const result = await recognize(file, "eng", {
      logger: m => {
        if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
      },
    });
    const text = (result.data.text || "").trim();
    if (!text) throw new Error("No text found in that image. Try a clearer photo.");
    return text;
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

// small shared ui bits

function Spinner() {
  return <div className="spinner-wrap"><div className="spinner" role="status" aria-label="Loading" /></div>;
}

function Btn({ children, onClick, variant = "ghost", disabled, sm, full, style, label }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`btn btn-${variant}${sm ? " btn-sm" : ""}${full ? " btn-full" : ""}`}
      style={style}
    >
      {children}
    </motion.button>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function Modal({ children, onClose, labelledBy }) {
  return (
    <motion.div
      className="modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        className="modal-sheet"
        role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <div className="sheet-grab" aria-hidden="true" />
        {children}
      </motion.div>
    </motion.div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div className="err" role="alert">{msg}</div>;
}

function KeyGate({ onOpenSettings, action }) {
  return (
    <div className="card center" style={{ padding: "28px 16px" }}>
      <div className="empty-icon"><KeyRound size={28} /></div>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>API key needed</div>
      <div className="muted-line" style={{ marginBottom: 14 }}>Add your free Groq key to generate {action}.</div>
      <Btn variant="primary" onClick={onOpenSettings}><KeyRound /> Set API key</Btn>
    </div>
  );
}

const NAV = [
  { id: "home", icon: House, label: "Home" },
  { id: "library", icon: BookOpen, label: "Library" },
  { id: "flashcards", icon: Layers, label: "Cards" },
  { id: "quiz", icon: PenLine, label: "Quiz" },
  { id: "tutor", icon: MessageCircle, label: "Tutor" },
];

// quiz trend sparkline

function ScoreChart({ scores }) {
  const reduce = useReducedMotion();
  const pts = [...scores].reverse().slice(-12);
  if (pts.length < 2) return null;

  const W = 560, H = 120, PAD = 10;
  const vals = pts.map(q => (q.total ? q.score / q.total : 0));
  const stepX = (W - PAD * 2) / Math.max(vals.length - 1, 1);
  const coords = vals.map((v, i) => [PAD + i * stepX, H - PAD - v * (H - PAD * 2)]);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;
  const last = Math.round(vals[vals.length - 1] * 100);
  const first = Math.round(vals[0] * 100);
  const delta = last - first;

  return (
    <div className="card chart-wrap">
      <div className="chart-title">Quiz trend</div>
      <div className="chart-sub">
        Last {pts.length} attempts · latest {last}%{delta !== 0 && ` (${delta > 0 ? "+" : ""}${delta} since first)`}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="96" role="img"
        aria-label={`Quiz scores trending ${delta >= 0 ? "up" : "down"}, latest score ${last} percent.`}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#1c2d48" strokeWidth="1" />
        ))}
        <motion.path d={area} fill="rgba(201,168,76,0.14)" stroke="none"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.6 }} />
        <motion.path d={line} fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EASE }} />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 4.5 : 3}
            fill={i === coords.length - 1 ? "#c9a84c" : "#0d1424"}
            stroke="#c9a84c" strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}

// settings popup

function SettingsModal({ groqKey, onSave, onClose }) {
  const [key, setKey] = useState(groqKey || "");
  return (
    <Modal onClose={onClose} labelledBy="settings-title">
      <div className="modal-title" id="settings-title">Settings</div>
      <div className="modal-sub">Your key stays in this browser only. Get one free at console.groq.com.</div>
      <Field label="Groq API key">
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="gsk_..." className="input" />
      </Field>
      <div className="btn-row">
        <Btn variant="primary" full onClick={() => { onSave(key.trim()); onClose(); }}><Check /> Save</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

// subjects

function SubjectModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [err, setErr] = useState("");
  function save() {
    if (!name.trim()) { setErr("Give the subject a name."); return; }
    onSave(name.trim());
    onClose();
  }
  return (
    <Modal onClose={onClose} labelledBy="subject-title">
      <div className="modal-title" id="subject-title">{initial ? "Rename subject" : "New subject"}</div>
      <div className="modal-sub">{initial ? "Pick a better name." : "Add something you study."}</div>
      <ErrorMsg msg={err} />
      <Field label="Subject name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Biology, Arabic Grammar, Economics" className="input" autoFocus onKeyDown={e => { if (e.key === "Enter") save(); }} />
      </Field>
      <div className="btn-row">
        <Btn variant="primary" full onClick={save}><Check /> {initial ? "Save" : "Add subject"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function ConfirmModal({ text, onYes, onClose }) {
  return (
    <Modal onClose={onClose} labelledBy="confirm-title">
      <div className="modal-title" id="confirm-title">Are you sure?</div>
      <div className="modal-sub">{text}</div>
      <div className="btn-row">
        <Btn variant="danger" full onClick={() => { onYes(); onClose(); }}><Trash2 /> Yes, delete</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// home tab

function HomePage({ subjects, setSubjects, notes, quizScores, activity, decks, groqKey, onNavigate, onOpenSettings }) {
  const [modal, setModal] = useState(null);
  const reduce = useReducedMotion();

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
      <div className="section-head">
        <div className="section-title">My subjects</div>
        {subjects.length > 0 && (
          <Btn sm variant="outline" onClick={() => setModal({ mode: "add" })} label="Add subject"><Plus /> Add</Btn>
        )}
      </div>

      {subjects.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><BookOpen size={30} /></div>
          <div className="empty-title">No subjects yet</div>
          <div className="empty-sub">Add the subjects you study. Notes, flashcards, and quizzes hang off them.</div>
          <Btn variant="primary" onClick={() => setModal({ mode: "add" })}><Plus /> Add your first subject</Btn>
        </div>
      )}

      {subjects.map((s, i) => {
        const n = (notes[s.id] || []).length;
        const scores = quizScores.filter(q => q.subjectId === s.id);
        const best = scores.length ? Math.max(...scores.map(q => Math.round((q.score / q.total) * 100))) : null;
        return (
          <motion.div key={s.id} className="card subject-card"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04, ease: EASE }}>
            <div className="row-head">
              <div className="row-title" onClick={() => onNavigate("library", s.id)} style={{ cursor: "pointer" }}>{s.name}</div>
              <div className="inline-actions">
                <Btn sm variant="subtle" onClick={() => setModal({ mode: "edit", sub: s })} label={`Rename ${s.name}`}><Pencil /></Btn>
                <Btn sm variant="danger" onClick={() => setModal({ mode: "del", sub: s })} label={`Delete ${s.name}`}><Trash2 /></Btn>
              </div>
            </div>
            <div className="row-meta">
              {n} note{n === 1 ? "" : "s"}{best !== null ? ` · best quiz ${best}%` : ""}
            </div>
            <div className="wrap-actions">
              <Btn sm onClick={() => onNavigate("library", s.id)}><BookOpen /> Open</Btn>
              <Btn sm onClick={() => onNavigate("plan", s.id)}><MapIcon /> Plan</Btn>
              <Btn sm onClick={() => onNavigate("flashcards", s.id)}><Layers /> Cards</Btn>
              <Btn sm onClick={() => onNavigate("quiz", s.id)}><PenLine /> Quiz</Btn>
            </div>
          </motion.div>
        );
      })}

      {quizScores.length >= 2 && <ScoreChart scores={quizScores} />}

      {(() => {
        const st = streakInfo(activity || {});
        const dg = weeklyDigest(activity || {}, quizScores || []);
        const days = ["M", "T", "W", "T", "F", "S", "S"];
        if (!st.current && !st.longest && !dg.quizzes && !dg.notes && !dg.cards && !dg.pomos) return null;
        return (
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Flame size={18} color={st.current ? "#fbbf24" : "#5a6c88"} />
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {st.current ? `${st.current} day streak` : "No streak yet"}
              </div>
              {st.longest > st.current && (
                <div className="dim-line">best {st.longest}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {st.weekDots.map((on, i) => (
                <div key={i} title={days[i]} style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: on ? "#c9a84c" : "#121d32",
                  border: `1px solid ${on ? "#c9a84c" : "#1c2d48"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, color: on ? "#0a0a0a" : "#5a6c88",
                }}>{days[i]}</div>
              ))}
            </div>
            <div className="muted-line">
              This week: {dg.quizzes} {dg.quizzes === 1 ? "quiz" : "quizzes"} · {dg.notes} note{dg.notes === 1 ? "" : "s"} · {dg.cards} card{dg.cards === 1 ? "" : "s"} reviewed · {dg.pomos} focus session{dg.pomos === 1 ? "" : "s"}{dg.avg !== null ? ` · avg ${dg.avg}%` : ""}
            </div>
          </div>
        );
      })()}

      {(totalNotes > 0 || recent.length > 0) && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Overview</div>
          <div className="muted-line">{subjects.length} subject{subjects.length === 1 ? "" : "s"} · {totalNotes} note{totalNotes === 1 ? "" : "s"} · {quizScores.length} quiz{quizScores.length === 1 ? " attempt" : " attempts"}</div>
          {recent.map((q, i) => (
            <div key={i} className="muted-line" style={{ marginTop: 4 }}>
              {q.subjectName}: {q.score}/{q.total} · {new Date(q.ts).toLocaleDateString()}
            </div>
          ))}
        </div>
      )}

      {!groqKey && subjects.length > 0 && (
        <div className="card key-nudge center" style={{ marginTop: 10 }}>
          <div className="muted-line" style={{ marginBottom: 10 }}>Study plans, flashcards, and quizzes need a free Groq key.</div>
          <Btn sm variant="outline" onClick={onOpenSettings}><KeyRound /> Set API key</Btn>
        </div>
      )}

      <AnimatePresence>
        {modal && modal.mode === "add" && <SubjectModal onSave={addSubject} onClose={() => setModal(null)} />}
        {modal && modal.mode === "edit" && <SubjectModal initial={modal.sub} onSave={name => renameSubject(modal.sub.id, name)} onClose={() => setModal(null)} />}
        {modal && modal.mode === "del" && <ConfirmModal text={`Delete "${modal.sub.name}" and all its notes? Quiz history stays.`} onYes={() => deleteSubject(modal.sub.id)} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}

// library tab

function LibraryPage({ subjects, notes, setNotes, initSubjectId, progress, setProgress, stamp, onPlan, groqKey }) {
  const [activeId, setActiveId] = useState(initSubjectId || (subjects[0] && subjects[0].id) || null);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [exporting, setExporting] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (initSubjectId) setActiveId(initSubjectId);
  }, [initSubjectId]);

  const active = subjects.find(s => s.id === activeId) || null;
  const list = (active && notes[active.id]) || [];
  const done = (active && progress[active.id]) || [];
  const [editing, setEditing] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");

  function openEdit(n) {
    setEditing(n);
    setEditTitle(n.title);
    setEditText(n.text);
    setErr("");
  }

  function saveEdit() {
    if (!editing || !active) return;
    if (!editTitle.trim() && !editText.trim()) { setErr("Add a title or some text first."); return; }
    const next = { ...(notes || {}) };
    next[active.id] = (next[active.id] || []).map(x => x.id === editing.id
      ? { ...x, title: editTitle.trim() || "Untitled", text: editText }
      : x);
    persist(next);
    setEditing(null);
  }

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
    stamp && stamp("notes");
  }

  async function importFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f || !active) return;
    setBusy(true); setErr(""); setOcrStatus("");
    try {
      const isImage = /\.(png|jpe?g|webp|bmp)$/i.test(f.name);
      let content;
      if (isImage && groqKey) {
        setOcrStatus("AI reading image, math included...");
        content = await visionReadImage(groqKey, f);
      } else {
        if (isImage) setOcrStatus("Reading text from image...");
        content = await readFile(f, p => setOcrStatus(`Reading text from image... ${Math.round(p * 100)}%`));
      }
      const next = { ...(notes || {}) };
      const arr = [...(next[active.id] || [])];
      arr.unshift({ id: uid(), title: f.name.replace(/\.[^.]+$/, ""), text: content.slice(0, 60000), ts: new Date().toISOString() });
      next[active.id] = arr;
      persist(next);
      stamp && stamp("notes");
    } catch (ex) {
      setErr(friendlyError(ex, "Import"));
    }
    setBusy(false); setOcrStatus("");
  }

  async function exportAs(kind) {
    if (!active || list.length === 0) { setErr("Nothing to export in this subject yet."); return; }
    setExporting(kind); setErr("");
    try {
      const mod = await import("./exporters.js");
      if (kind === "pdf") await mod.exportSubjectPdf(active.name, list);
      else await mod.exportSubjectDocx(active.name, list);
    } catch (ex) {
      setErr(`Export failed: ${ex.message}`);
    }
    setExporting(null);
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
    return <div className="empty">
      <div className="empty-title">No subjects yet</div>
      <div className="empty-sub">Add a subject on the Home tab first.</div>
    </div>;
  }

  return (
    <div>
      <div className="chips" role="tablist" aria-label="Subjects">
        {subjects.map(s => (
          <button key={s.id} role="tab" aria-selected={s.id === activeId} onClick={() => setActiveId(s.id)}
            className={`chip${s.id === activeId ? " active" : ""}`}>{s.name}</button>
        ))}
      </div>

      <ErrorMsg msg={err} />

      <div style={{ marginBottom: 12 }}>
        <Btn variant="primary" full onClick={() => setShowAdd(v => !v)}>
          {showAdd ? <><X /> Close editor</> : <><Plus /> New note</>}
        </Btn>
        <div className="slider-row" style={{ marginTop: 8 }}>
          <Btn variant="outline" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} label="Import a file: text, document, pdf, or photo">
            <FileUp /> Import
          </Btn>
          <Btn variant="subtle" onClick={() => exportAs("pdf")} disabled={!!exporting || list.length === 0}>
            {exporting === "pdf" ? "…" : "PDF"}
          </Btn>
          <Btn variant="subtle" onClick={() => exportAs("docx")} disabled={!!exporting || list.length === 0}>
            {exporting === "docx" ? "…" : "DOCX"}
          </Btn>
          <Btn variant="subtle" onClick={() => active && onPlan && onPlan(active.id)} disabled={!active}>
            <MapIcon /> Plan
          </Btn>
        </div>
        <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp" onChange={importFile} style={{ display: "none" }} aria-label="Import note file" />
      </div>
      {busy && <Spinner />}
      {busy && ocrStatus && <div className="dim-line center">{ocrStatus}</div>}

      <AnimatePresence initial={false}>
        {showAdd && (
          <motion.div className="card" style={{ marginBottom: 12 }}
            initial={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
            animate={{ opacity: 1, height: "auto", paddingTop: 14, paddingBottom: 14 }}
            exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
            transition={{ duration: 0.25, ease: EASE }}>
            <Field label="Title">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 3 summary" className="input" />
            </Field>
            <Field label="Text (or import a file: txt, md, docx, pdf, images)">
              <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Paste or type notes here... snap a photo of handwriting or a textbook page with Import." className="input" />
            </Field>
            <Btn variant="primary" full onClick={saveNote}><Check /> Save note</Btn>
          </motion.div>
        )}
      </AnimatePresence>

      {list.length === 0 && <div className="dim-line center" style={{ padding: "24px 0" }}>No notes in {active ? active.name : "this subject"} yet.</div>}

      <AnimatePresence initial={false}>
        {list.map(n => (
          <motion.div key={n.id} className="card"
            layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}>
            <div className="row-head">
              <div className="row-title">{n.title}</div>
              <div className="inline-actions">
                <Btn sm onClick={() => openEdit(n)} label={`Edit ${n.title}`}><Pencil /></Btn>
                <Btn sm variant="danger" onClick={() => setConfirmId(n.id)} label={`Delete ${n.title}`}><Trash2 /></Btn>
              </div>
            </div>
            <div className="note-ts">{new Date(n.ts).toLocaleString()}</div>
            <div className="note-text">{n.text.slice(0, 2000)}{n.text.length > 2000 ? "…" : ""}</div>
            <div className="wrap-actions">
              <Btn sm variant={done.includes(n.id) ? "primary" : "subtle"}
                onClick={() => toggleDone(n.id)}
                label={done.includes(n.id) ? `Mark ${n.title} unstudied` : `Mark ${n.title} studied`}>
                {done.includes(n.id) ? <><Check /> Studied</> : "Mark studied"}
              </Btn>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {confirmId && (
          <ConfirmModal text="Delete this note? This cannot be undone."
            onYes={() => { deleteNote(confirmId); setConfirmId(null); }} onClose={() => setConfirmId(null)} />
        )}
        {editing && (
          <Modal onClose={() => setEditing(null)} labelledBy="edit-title">
            <div className="modal-title" id="edit-title">Edit note</div>
            <Field label="Title">
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="input" maxLength={120} />
            </Field>
            <Field label="Text">
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={8} className="input" />
            </Field>
            <div className="btn-row">
              <Btn variant="primary" full onClick={saveEdit}><Check /> Save</Btn>
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// study plan tab

function StudyPlanPage({ subjects, notes, groqKey, initSubjectId, onOpenSettings }) {
  const [subId, setSubId] = useState(initSubjectId || (subjects[0] && subjects[0].id));
  const [days, setDays] = useState("7");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (initSubjectId) setSubId(initSubjectId);
  }, [initSubjectId]);

  if (!groqKey) return <KeyGate onOpenSettings={onOpenSettings} action="study plans" />;
  if (subjects.length === 0) return <div className="card"><div className="muted-line">Add a subject on the Home tab first.</div></div>;

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
      <div className="card" style={{ marginBottom: 12 }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => setSubId(e.target.value)} className="input">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Days until the exam">
          <input value={days} onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="input" />
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>
          <Sparkles /> {busy ? "Planning..." : "Generate plan"}
        </Btn>
      </div>
      {busy && <Spinner />}
      {plan && <motion.div className="card prose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>{plan}</motion.div>}
    </div>
  );
}

// flashcards tab

// reused to grade written answers

async function gradeShort(key, question, modelAnswer, rubric, userAnswer) {
  const out = await groq(key,
    "You are a fair examiner. Grade short answers strictly but kindly. Reply with JSON only.",
    `Question: ${question}\nIdeal answer: ${modelAnswer}\nRubric: ${rubric || "Award credit for correct concepts and clear explanation."}\nStudent answer: ${userAnswer}\n\nReturn JSON: {"score": number 0-1, "feedback": "1-3 sentences explaining the score and how to improve"}`,
    true);
  const p = JSON.parse(out);
  return { score: typeof p.score === "number" ? p.score : 0, feedback: p.feedback || "" };
}

function contextFor(notes, subjectId, limit = 12000) {
  return ((notes[subjectId] || []).map(n => `${n.title}:\n${n.text}`).join("\n\n") || "").slice(0, limit);
}

// flashcards tab

function FlashcardsPage({ subjects, notes, groqKey, decks, setDecks, stamp, onOpenSettings }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [queue, setQueue] = useState(null); // nothing queued yet
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const reduce = useReducedMotion();

  if (!groqKey) return <KeyGate onOpenSettings={onOpenSettings} action="flashcards" />;
  if (subjects.length === 0) return <div className="card"><div className="muted-line">Add a subject on the Home tab first.</div></div>;

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const deck = decks[sub.id] || [];
  const due = dueCards(deck);
  const context = contextFor(notes, sub.id);

  function persistDeck(next) {
    const all = { ...(decks || {}), [sub.id]: next };
    setDecks(all);
    DB.set("decks", all);
  }

  async function generate() {
    if (!context) { setErr("Add some notes to this subject first, so there is material to build cards from."); return; }
    setBusy(true); setErr(""); setQueue(null);
    try {
      const out = await groq(groqKey,
        'You make flashcards. Reply with JSON only: {"cards": [{"front": "...", "back": "..."}]}. Make 10 cards.',
        `Subject: ${sub.name}\nMaterial:\n${context}`, true);
      const parsed = JSON.parse(out);
      if (!parsed.cards || !parsed.cards.length) throw new Error("No cards came back. Try again.");
      const fresh = parsed.cards.slice(0, 20).map(c => ({
        id: uid(), front: c.front, back: c.back,
        ease: 2.5, interval: 0, reps: 0, lapses: 0, dueAt: null, totalReviews: 0,
      }));
      persistDeck([...deck, ...fresh].slice(-100));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  function startReview(ahead = false) {
    const list = ahead ? deck : due;
    if (!list.length) return;
    setQueue(list.map(c => c.id));
    setIdx(0); setFlip(false); setReviewed(0); setErr("");
  }

  function grade(q) {
    const id = queue[idx];
    const next = deck.map(c => c.id === id ? { ...c, ...applySM2(c, q) } : c);
    persistDeck(next);
    stamp("cards");
    const done = reviewed + 1;
    setReviewed(done);
    setFlip(false);
    setTimeout(() => {
      if (idx + 1 >= queue.length) setQueue(null);
      else setIdx(idx + 1);
    }, reduce ? 0 : 140);
  }

  const cur = queue ? deck.find(c => c.id === queue[idx]) : null;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => { setSubId(e.target.value); setQueue(null); }} className="input">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="muted-line" style={{ marginBottom: 10 }}>
          {deck.length === 0
            ? "No deck yet for this subject."
            : `${deck.length} card${deck.length === 1 ? "" : "s"} · ${due.length} due${due.length === 1 ? "" : ""}`}
        </div>
        <div className="btn-row">
          <Btn variant="primary" full onClick={generate} disabled={busy}>
            {busy ? "Making cards..." : deck.length ? "Add more" : "Generate deck"}
          </Btn>
        </div>
        {deck.length > 0 && (
          <div className="btn-row" style={{ marginTop: 8 }}>
            <Btn full onClick={() => startReview(false)} disabled={due.length === 0 || busy}>
              Review due ({due.length})
            </Btn>
            <Btn onClick={() => startReview(true)} disabled={busy}>Review all</Btn>
            <Btn variant="danger" onClick={() => setConfirmClear(true)} label="Delete deck"><Trash2 /></Btn>
          </div>
        )}
      </div>
      {busy && <Spinner />}

      {queue && cur && (
        <div>
          <div className="flip-scene" onClick={() => setFlip(f => !f)} role="button" tabIndex={0}
            aria-label={flip ? "Show question" : "Show answer"}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlip(f => !f); } }}>
            <motion.div className="flip-inner" animate={{ rotateY: flip ? 180 : 0 }}
              transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}>
              <div className="flip-face">{cur.front}</div>
              <div className="flip-face flip-back">{cur.back}</div>
            </motion.div>
          </div>
          <div className="flip-hint">
            {flip ? "How well did you know it?" : "Tap card to flip"} · {idx + 1} of {queue.length}
          </div>
          {flip && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {QUALITY.map(({ q, label }) => (
                <Btn key={q} variant={q === 0 ? "danger" : q === 3 ? "outline" : "subtle"} onClick={() => grade(q)}>
                  {label}
                </Btn>
              ))}
            </div>
          )}
        </div>
      )}

      {queue && !cur && reviewed > 0 && (
        <div className="card center">
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Session done</div>
          <div className="muted-line">{reviewed} card{reviewed === 1 ? "" : "s"} reviewed. Due cards: {dueCards(decks[sub.id] || []).length}.</div>
        </div>
      )}

      <AnimatePresence>
        {confirmClear && (
          <ConfirmModal text={`Delete the ${sub.name} deck (${deck.length} cards)? This cannot be undone.`}
            onYes={() => persistDeck([])} onClose={() => setConfirmClear(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// quiz tab

function QuizPage({ subjects, notes, groqKey, onScore, mistakes, setMistakes, stamp, onOpenSettings }) {
  const [seg, setSeg] = useState("practice");

  if (!groqKey) return <KeyGate onOpenSettings={onOpenSettings} action="quizzes" />;
  if (subjects.length === 0) return <div className="card"><div className="muted-line">Add a subject on the Home tab first.</div></div>;

  function upsertMistake(m) {
    const list = mistakes || [];
    const i = list.findIndex(x => !x.mastered && x.subjectId === m.subjectId && x.question === m.question);
    let next;
    if (i >= 0) {
      next = [...list];
      next[i] = { ...next[i], timesWrong: next[i].timesWrong + 1, ts: new Date().toISOString() };
    } else {
      next = [{ ...m, id: uid(), timesWrong: 1, mastered: false, ts: new Date().toISOString() }, ...list].slice(0, 200);
    }
    setMistakes(next);
    DB.set("mistakes", next);
  }

  return (
    <div>
      <div className="chips" role="tablist" aria-label="Quiz modes" style={{ marginBottom: 12 }}>
        {[["practice", "Practice"], ["mock", "Mock exam"], ["mistakes", `Mistakes${(mistakes || []).filter(m => !m.mastered).length ? ` (${(mistakes || []).filter(m => !m.mastered).length})` : ""}`]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={seg === id} onClick={() => setSeg(id)}
            className={`chip${seg === id ? " active" : ""}`}>{label}</button>
        ))}
      </div>
      {seg === "practice" && <PracticeQuiz subjects={subjects} notes={notes} groqKey={groqKey} onScore={onScore} stamp={stamp} upsertMistake={upsertMistake} />}
      {seg === "mock" && <MockExam subjects={subjects} notes={notes} groqKey={groqKey} onScore={onScore} stamp={stamp} upsertMistake={upsertMistake} />}
      {seg === "mistakes" && <MistakesView subjects={subjects} groqKey={groqKey} mistakes={mistakes} setMistakes={setMistakes} stamp={stamp} />}
    </div>
  );
}

function PracticeQuiz({ subjects, notes, groqKey, onScore, stamp, upsertMistake }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [qs, setQs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const context = contextFor(notes, sub.id);

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
    onScore({ subjectId: sub.id, subjectName: sub.name, score, total: qs.length, ts: new Date().toISOString(), kind: "quiz" });
    stamp("quiz");
    qs.forEach((q, i) => {
      if (answers[i] !== q.answer) {
        upsertMistake({
          subjectId: sub.id, subjectName: sub.name, kind: "mcq",
          question: q.q, options: q.options, answer: q.answer, topic: "",
        });
      }
    });
  }

  const score = qs.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => { setSubId(e.target.value); setQs([]); setDone(false); }} className="input">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>
          {busy ? "Writing quiz..." : qs.length ? "New quiz" : "Generate quiz"}
        </Btn>
      </div>
      {busy && <Spinner />}
      {done && qs.length > 0 && (
        <motion.div className={`card quiz-score${score / qs.length >= 0.6 ? " good" : ""}`}
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}>
          <div className="quiz-score-num">{score}/{qs.length}</div>
          <div className="quiz-score-sub">{score / qs.length >= 0.6 ? "Solid. Keep it up." : "Room to grow. Mistakes saved below in Mistakes."}</div>
        </motion.div>
      )}
      {qs.map((q, i) => (
        <motion.div key={i} className="card"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(i, 5) * 0.05, ease: EASE }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{i + 1}. {q.q}</div>
          {q.options.map((op, oi) => {
            const picked = answers[i] === oi;
            const show = done && oi === q.answer;
            const wrong = done && picked && oi !== q.answer;
            return (
              <button key={oi} disabled={done} onClick={() => setAnswers({ ...answers, [i]: oi })}
                className={`opt${picked ? " picked" : ""}${show ? " right" : ""}${wrong ? " wrong" : ""}`}
                aria-pressed={picked}>{op}</button>
            );
          })}
        </motion.div>
      ))}
      {qs.length > 0 && !done && <Btn variant="primary" full onClick={finish}><Check /> Finish quiz</Btn>}
    </div>
  );
}

// more time means more questions
const EXAM_SIZES = { "5": { mcq: 5, short: 1 }, "10": { mcq: 8, short: 2 }, "15": { mcq: 12, short: 3 }, "30": { mcq: 18, short: 4 } };

function MockExam({ subjects, notes, groqKey, onScore, stamp, upsertMistake }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [minutes, setMinutes] = useState("10");
  const [exam, setExam] = useState(null); // {title, questions}
  const [answers, setAnswers] = useState({}); // idx maps to picked option or typed text
  const [secs, setSecs] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef(null);

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const context = contextFor(notes, sub.id);

  useEffect(() => () => clearInterval(timer.current), []);

  useEffect(() => {
    if (!exam || submitted) return;
    timer.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(timer.current); submit(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [exam, submitted]);

  async function generate() {
    if (!context) { setErr("Add some notes to this subject first, so there is material for the exam."); return; }
    setBusy(true); setErr(""); setExam(null); setResult(null);
    try {
      const size = EXAM_SIZES[minutes] || EXAM_SIZES["10"];
      const out = await groq(groqKey,
        "You are a senior examiner crafting a timed exam. Cover breadth and depth. Tag each question with a topic for weak-area analysis. Reply with JSON only.",
        `Subject: ${sub.name}\nDuration: ${minutes} minutes.\nSource material:\n${context}\n\nGenerate exactly ${size.mcq} MCQs and ${size.short} short-answer questions. Short exams stick to core concepts; longer exams go deeper with harder application questions.\nReturn JSON: {"questions": [...]} where each item is either:\n{"type": "mcq", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "short topic label"}\nor\n{"type": "short", "question": "...", "modelAnswer": "ideal 3-5 sentence answer", "rubric": "what counts as correct", "topic": "short topic label"}`,
        true);
      const parsed = JSON.parse(out);
      if (!parsed.questions || !parsed.questions.length) throw new Error("No questions came back. Try again.");
      setExam({ title: `${sub.name} mock exam`, questions: parsed.questions.slice(0, size.mcq + size.short) });
      setAnswers({});
      setSubmitted(false);
      setResult(null);
      setSecs(parseInt(minutes, 10) * 60);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  async function submit(auto = false) {
    if (!exam || submitted) return;
    clearInterval(timer.current);
    setSubmitted(true);
    setGrading(true);
    setErr("");
    try {
      let mcqScore = 0;
      let mcqTotal = 0;
      let shortScore = 0;
      const topics = {};
      const feedbacks = [];
      for (let i = 0; i < exam.questions.length; i++) {
        const q = exam.questions[i];
        const a = answers[i];
        const t = q.topic || "General";
        topics[t] = topics[t] || { got: 0, total: 0 };
        topics[t].total++;
        if (q.type === "mcq") {
          mcqTotal++;
          if (a === q.correctIndex) { mcqScore++; topics[t].got++; }
          else {
            upsertMistake({
              subjectId: sub.id, subjectName: sub.name, kind: "mcq",
              question: q.question, options: q.options, answer: q.correctIndex, topic: t,
            });
          }
        } else {
          const text = (a || "").trim();
          if (!text) {
            feedbacks.push({ i, score: 0, feedback: "No answer given." });
            upsertMistake({
              subjectId: sub.id, subjectName: sub.name, kind: "short",
              question: q.question, answer: q.modelAnswer, rubric: q.rubric, topic: t,
            });
          } else {
            try {
              const g = await gradeShort(groqKey, q.question, q.modelAnswer, q.rubric, text);
              shortScore += g.score;
              feedbacks.push({ i, score: g.score, feedback: g.feedback });
              if (g.score >= 0.7) topics[t].got++;
              else {
                upsertMistake({
                  subjectId: sub.id, subjectName: sub.name, kind: "short",
                  question: q.question, answer: q.modelAnswer, rubric: q.rubric, topic: t,
                });
              }
            } catch (ex) {
              feedbacks.push({ i, score: 0, feedback: `Could not grade: ${ex.message}` });
            }
          }
        }
      }
      const shortTotal = exam.questions.filter(q => q.type !== "mcq").length;
      const total = mcqTotal + shortTotal;
      const score = mcqScore + shortScore;
      setResult({ mcqScore, mcqTotal, shortScore, shortTotal, score, total, topics, feedbacks, auto });
      onScore({ subjectId: sub.id, subjectName: sub.name, score: Math.round(score * 10) / 10, total, ts: new Date().toISOString(), kind: "mock" });
      stamp("mock");
    } finally {
      setGrading(false);
    }
  }

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  if (!exam) {
    return (
      <div className="card">
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => setSubId(e.target.value)} className="input">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Duration (minutes)">
          <select value={minutes} onChange={e => setMinutes(e.target.value)} className="input">
            {Object.entries(EXAM_SIZES).map(([m, s]) => <option key={m} value={m}>{m} minutes · {s.mcq} MCQ + {s.short} written</option>)}
          </select>
        </Field>
        <Btn variant="primary" full onClick={generate} disabled={busy}>
          <GraduationCap /> {busy ? "Writing exam..." : "Start mock exam"}
        </Btn>
      </div>
    );
  }

  if (grading) {
    return <div><Spinner /><div className="dim-line center">Grading your written answers...</div></div>;
  }

  if (result) {
    const pct = result.total ? result.score / result.total : 0;
    const weak = Object.entries(result.topics).filter(([, v]) => v.got < v.total).map(([k]) => k);
    return (
      <div>
        <motion.div className={`card quiz-score${pct >= 0.6 ? " good" : ""}`}
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}>
          <div className="quiz-score-num">{Math.round(result.score * 10) / 10}/{result.total}</div>
          <div className="quiz-score-sub">
            MCQ {result.mcqScore}/{result.mcqTotal} · Written {Math.round(result.shortScore * 10) / 10}/{result.shortTotal}
            {result.auto ? " · time ran out, auto-submitted" : ""}
          </div>
        </motion.div>
        {weak.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}><Target size={13} style={{ verticalAlign: -2 }} /> Weak areas</div>
            {weak.map(t => {
              const v = result.topics[t];
              return <div key={t} className="muted-line" style={{ marginTop: 4 }}>{t}: {v.got}/{v.total}</div>;
            })}
            <div className="dim-line" style={{ marginTop: 6 }}>Missed questions were saved to Mistakes.</div>
          </div>
        )}
        {result.feedbacks.map(f => (
          <div key={f.i} className="card">
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Q{f.i + 1} · {Math.round(f.score * 100)}%</div>
            <div className="muted-line">{f.feedback}</div>
          </div>
        ))}
        <Btn full onClick={() => { setExam(null); setResult(null); }}><RotateCcw /> New mock exam</Btn>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800 }}>{exam.title}</div>
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800, color: secs < 60 ? "#f87171" : "#c9a84c" }}>{mm}:{ss}</div>
      </div>
      {exam.questions.map((q, i) => (
        <div key={i} className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{i + 1}. {q.question}</div>
          {q.type === "mcq" ? q.options.map((op, oi) => (
            <button key={oi} onClick={() => setAnswers({ ...answers, [i]: oi })}
              className={`opt${answers[i] === oi ? " picked" : ""}`} aria-pressed={answers[i] === oi}>{op}</button>
          )) : (
            <textarea value={answers[i] || ""} onChange={e => setAnswers({ ...answers, [i]: e.target.value })}
              rows={3} placeholder="Write your answer..." className="input" />
          )}
        </div>
      ))}
      <Btn variant="primary" full onClick={() => submit(false)}><Check /> Submit exam</Btn>
    </div>
  );
}

function MistakesView({ subjects, groqKey, mistakes, setMistakes, stamp }) {
  const [filter, setFilter] = useState("all");
  const [drilling, setDrilling] = useState(false);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState(null);
  const [grading, setGrading] = useState(false);
  const [verdict, setVerdict] = useState(null); // {ok, feedback}
  const [confirmId, setConfirmId] = useState(null);

  const open = (mistakes || []).filter(m => !m.mastered);
  const scoped = filter === "all" ? open : open.filter(m => m.subjectId === filter);
  const withSubs = subjects.filter(s => open.some(m => m.subjectId === s.id));

  function persist(next) {
    setMistakes(next);
    DB.set("mistakes", next);
  }
  function master(id) {
    persist((mistakes || []).map(m => m.id === id ? { ...m, mastered: true } : m));
  }
  function remove(id) {
    persist((mistakes || []).filter(m => m.id !== id));
  }

  function startDrill() {
    if (!scoped.length) return;
    const q = [...scoped].sort((a, b) => b.timesWrong - a.timesWrong).slice(0, 15);
    setQueue(q); setIdx(0); setTyped(""); setPicked(null); setVerdict(null);
    setDrilling(true);
  }

  async function checkCurrent() {
    const m = queue[idx];
    if (!m) return;
    if (m.kind === "mcq") {
      if (picked === null) return;
      const ok = picked === m.answer;
      setVerdict({ ok, feedback: ok ? "Correct." : `Right answer: ${m.options[m.answer]}` });
      if (ok) master(m.id);
    } else {
      if (!typed.trim()) { setVerdict({ ok: false, feedback: "Type an answer or skip." }); return; }
      setGrading(true);
      try {
        const g = await gradeShort(groqKey, m.question, m.answer, m.rubric, typed.trim());
        const ok = g.score >= 0.7;
        setVerdict({ ok, feedback: `${Math.round(g.score * 100)}%. ${g.feedback}` });
        if (ok) master(m.id);
      } catch (ex) {
        setVerdict({ ok: false, feedback: `Could not grade: ${ex.message}` });
      }
      setGrading(false);
    }
  }

  function next() {
    stamp("quiz");
    if (idx + 1 >= queue.length) { setDrilling(false); setQueue([]); }
    else { setIdx(idx + 1); setTyped(""); setPicked(null); setVerdict(null); }
  }

  if (drilling && queue[idx]) {
    const m = queue[idx];
    return (
      <div>
        <div className="dim-line" style={{ marginBottom: 8 }}>Drill {idx + 1} of {queue.length} · {m.subjectName}</div>
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{m.question}</div>
          {m.kind === "mcq" ? m.options.map((op, oi) => (
            <button key={oi} disabled={!!verdict} onClick={() => setPicked(oi)}
              className={`opt${picked === oi ? " picked" : ""}${verdict && oi === m.answer ? " right" : ""}${verdict && !verdict.ok && picked === oi ? " wrong" : ""}`}>
              {op}
            </button>
          )) : (
            <textarea value={typed} onChange={e => setTyped(e.target.value)} disabled={!!verdict}
              rows={3} placeholder="Type your answer..." className="input" />
          )}
        </div>
        {grading && <Spinner />}
        {verdict && (
          <div className="card" style={{ marginBottom: 10, borderColor: verdict.ok ? "#4ade80" : "#f87171" }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{verdict.ok ? "Correct." : "Not quite."}</div>
            <div className="muted-line">{verdict.feedback}</div>
          </div>
        )}
        <div className="btn-row">
          {!verdict
            ? <Btn variant="primary" full onClick={checkCurrent} disabled={grading}><Check /> Check</Btn>
            : <Btn variant="primary" full onClick={next}>{idx + 1 >= queue.length ? "Finish" : "Next"}</Btn>}
          <Btn variant="danger" onClick={() => { remove(m.id); next(); }} label="Delete mistake"><Trash2 /></Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      {withSubs.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          <button onClick={() => setFilter("all")} className={`chip${filter === "all" ? " active" : ""}`}>All ({open.length})</button>
          {withSubs.map(s => {
            const n = open.filter(m => m.subjectId === s.id).length;
            return <button key={s.id} onClick={() => setFilter(s.id)} className={`chip${filter === s.id ? " active" : ""}`}>{s.name} ({n})</button>;
          })}
        </div>
      )}
      {scoped.length > 0 && (
        <Btn variant="primary" full onClick={startDrill} style={{ marginBottom: 12 }}>
          <Target /> Drill {Math.min(scoped.length, 15)} mistake{Math.min(scoped.length, 15) === 1 ? "" : "s"}
        </Btn>
      )}
      {scoped.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Target size={24} /></div>
          <div className="empty-title">Mistake bank is empty</div>
          <div className="empty-sub">Wrong answers from quizzes and mocks land here for review.</div>
        </div>
      )}
      {scoped.map(m => (
        <div key={m.id} className="card">
          <div className="row-head">
            <div className="row-title" style={{ fontSize: 13 }}>{m.question}</div>
            <div className="inline-actions">
              <Btn sm variant="danger" onClick={() => setConfirmId(m.id)} label="Delete mistake"><Trash2 /></Btn>
            </div>
          </div>
          <div className="row-meta">{m.subjectName}{m.topic ? ` · ${m.topic}` : ""} · wrong ×{m.timesWrong}</div>
        </div>
      ))}
      <AnimatePresence>
        {confirmId && (
          <ConfirmModal text="Delete this mistake?" onYes={() => remove(confirmId)} onClose={() => setConfirmId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// tutor tab

// tutor can file notes into the library when asked
const SAVE_RE = /@@NOTE title="([^"]*)"@@([\s\S]*?)@@ENDNOTE@@/;
const SAVE_WANT = /\bsave (this|it|that|these)\b|\bnote this\b|\bwrite (this|it|that) down\b|\bremember this\b|\bkeep this\b|\badd .*to (my|the) notes\b/i;
const SAVE_TAIL = `\n\nThe student wants this kept as a library note. After the normal reply, add the note on its own lines exactly like this:\n@@NOTE title="Short Title"@@\nThe note itself, short and complete.\n@@ENDNOTE@@`;

function extractNote(text) {
  const m = (text || "").match(SAVE_RE);
  if (!m) return { text, note: null };
  return {
    text: text.replace(SAVE_RE, "").trim(),
    note: { title: (m[1] || "").trim() || "Tutor note", content: (m[2] || "").trim() },
  };
}

function TutorPage({ subjects, notes, groqKey, onSaveNote, onOpenSettings }) {
  const [subId, setSubId] = useState(subjects[0] && subjects[0].id);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [teach, setTeach] = useState(() => { try { return localStorage.getItem("tutor:teach") === "1"; } catch { return false; } });
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef(null);

  if (!groqKey) return <KeyGate onOpenSettings={onOpenSettings} action="tutor chat" />;
  if (subjects.length === 0) return <div className="card"><div className="muted-line">Add a subject on the Home tab first.</div></div>;

  const sub = subjects.find(s => s.id === subId) || subjects[0];
  const key = `tutor:${sub.id}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setMessages(raw ? JSON.parse(raw).slice(-100) : []);
    } catch { setMessages([]); }
    setErr("");
  }, [key]);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages, key]);

  useEffect(() => {
    try { localStorage.setItem("tutor:teach", teach ? "1" : "0"); } catch {}
  }, [teach]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const context = contextFor(notes, sub.id);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    setErr("");
    try {
      const teachBlock = teach ? `\n\nTEACH MODE: start with a one-line objective ("By the end you will..."), explain simply then deeper, use one example from the materials, then ask ONE check-for-understanding question and wait. Keep each message focused.` : "";
      const out = await groq(groqKey,
        `You are a patient tutor for "${sub.name}". Help the student understand deeply, not just memorise. Reference their materials when relevant. Be concise. Reply in plain text, no markdown.${teachBlock}${SAVE_WANT.test(text) ? SAVE_TAIL : ""}`,
        `My materials:\n${context || "(no notes yet)"}\n\nConversation so far:\n${next.slice(-8).map(m => `${m.role}: ${m.content}`).join("\n")}\n\nStudent: ${text}`);
      const parsed = extractNote(out);
      let reply = { role: "assistant", content: parsed.text };
      if (parsed.note && parsed.note.content) {
        onSaveNote(sub.id, parsed.note.title, parsed.note.content);
        reply = { ...reply, saved: true };
      }
      setMessages([...next, reply]);
    } catch (ex) {
      setErr(friendlyError(ex, "Tutor"));
      setMessages(next);
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <ErrorMsg msg={err} />
        <Field label="Subject">
          <select value={sub.id} onChange={e => setSubId(e.target.value)} className="input">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="btn-row">
          <Btn sm variant={teach ? "primary" : "subtle"} onClick={() => setTeach(t => !t)}>
            <GraduationCap /> Teach mode {teach ? "on" : "off"}
          </Btn>
          <Btn sm onClick={() => messages.length && setConfirmClear(true)}>Clear chat</Btn>
        </div>
      </div>

      <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: "50vh", overflowY: "auto" }}>
        {messages.length === 0 && (
          <div className="dim-line center" style={{ padding: "20px 0" }}>Ask anything about {sub.name}. Answers use your notes.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="card" style={m.role === "user"
            ? { borderColor: "#2b4066", background: "linear-gradient(180deg, rgba(201,168,76,0.1), transparent 70%), #0d1424" }
            : {}}>
            <div className="dim-line" style={{ marginBottom: 4 }}>{m.role === "user" ? "You" : sub.name + " tutor"}</div>
            <div className="prose">{m.content}</div>
            {m.role === "assistant" && m.saved && (
              <div style={{ marginTop: 8 }}>
                <div className="dim-line">Saved to Library</div>
              </div>
            )}
          </div>
        ))}
        {busy && <Spinner />}
      </div>

      {(() => {
        const used = (context || "").length + messages.slice(-8).reduce((a, m) => a + (m.content || "").length, 0);
        if (messages.length < 30 && used <= 20000) return null;
        return <div className="dim-line center" style={{ marginBottom: 6 }}>This chat is getting full and answers may get sloppy. Clear it up top for a fresh start.</div>;
      })()}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Ask about ${sub.name}...`}
          className="input" style={{ flex: 1 }} maxLength={2000}
          onKeyDown={e => { if (e.key === "Enter") send(); }} />
        <Btn variant="primary" onClick={send} disabled={busy || !input.trim()} label="Send message"><Send /></Btn>
      </div>

      <AnimatePresence>
        {confirmClear && (
          <ConfirmModal text="Clear this conversation? This cannot be undone."
            onYes={() => { setMessages([]); try { localStorage.removeItem(key); } catch {} }} onClose={() => setConfirmClear(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// focus timer

function Pomodoro({ onDone }) {
  const [secs, setSecs] = useState(25 * 60);
  const [mode, setMode] = useState("focus");
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const lens = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };

  useEffect(() => {
    if (running) {
      timer.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(timer.current);
            setRunning(false);
            if (mode === "focus" && doneRef.current) doneRef.current();
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
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => setOpen(true)}
        className="fab" aria-label="Open focus timer"><Timer /></motion.button>
    );
  }

  return (
    <motion.div className="pomo" role="dialog" aria-label="Focus timer"
      initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: EASE }}>
      <div className="row-head">
        <div className="pomo-label"><Clock size={12} style={{ verticalAlign: -1 }} /> FOCUS TIMER</div>
        <button onClick={() => setOpen(false)} className="pomo-close" aria-label="Close timer"><X size={15} /></button>
      </div>
      <div className="pomo-lens">
        {[["focus", "25"], ["short", "5"], ["long", "15"]].map(([m, label]) => (
          <button key={m} onClick={() => pick(m)} className={`pomo-len${mode === m ? " active" : ""}`}>{label}</button>
        ))}
      </div>
      <div className="pomo-time">{mm}:{ss}</div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <Btn sm variant="primary" full onClick={() => { if (secs === 0) setSecs(lens[mode]); setRunning(r => !r); }}>
          {running ? "Pause" : "Start"}
        </Btn>
        <Btn sm onClick={() => { setSecs(lens[mode]); setRunning(false); }}>Reset</Btn>
      </div>
    </motion.div>
  );
}

// app root

export default function App() {
  const [page, setPage] = useState("home");
  const [initSubject, setInitSubject] = useState(null);
  const [subjects, setSubjectsState] = useState([]);
  const [groqKey, setGroqKeyState] = useState("");
  const [notes, setNotesState] = useState({});
  const [progress, setProgressState] = useState({});
  const [quizScores, setQuizScores] = useState([]);
  const [decks, setDecksState] = useState({});
  const [mistakes, setMistakesState] = useState([]);
  const [activity, setActivityState] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const reduce = useReducedMotion();

  // load the pdf reader lazily
  useEffect(() => {
    if (window.pdfjsLib) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };
    document.head.appendChild(script);
  }, []);

  // pull saved stuff on boot
  useEffect(() => {
    (async () => {
      const [sj, k, n, p, qs, dk, mk, ac] = await Promise.all([DB.get("subjects"), DB.get("groqKey"), DB.get("notes"), DB.get("progress"), DB.get("quizScores"), DB.get("decks"), DB.get("mistakes"), DB.get("activity")]);
      if (sj) setSubjectsState(sj);
      if (k) setGroqKeyState(k);
      if (n) setNotesState(n);
      if (p) setProgressState(p);
      if (qs) setQuizScores(qs);
      if (dk) setDecksState(dk);
      if (mk) setMistakesState(mk);
      if (ac) setActivityState(ac);
    })();
  }, []);

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

  async function setDecks(next) {
    setDecksState(next);
    await DB.set("decks", next);
  }

  async function setMistakes(next) {
    setMistakesState(next);
    await DB.set("mistakes", next);
  }

  function stamp(type, amount = 1) {
    setActivityState(prev => {
      const next = logActivity(prev || {}, type, amount);
      DB.set("activity", next);
      return next;
    });
  }

  async function saveGroqKey(k) {
    setGroqKeyState(k);
    await DB.set("groqKey", k);
  }

  function saveNoteFor(subjectId, title, text) {
    const body = (text || "").trim().slice(0, 60000);
    if (!body) return;
    setNotesState(prev => {
      const next = { ...(prev || {}) };
      const arr = [...(next[subjectId] || [])];
      arr.unshift({ id: uid(), title: (title || "").trim() || "Tutor note", text: body, ts: new Date().toISOString() });
      next[subjectId] = arr;
      DB.set("notes", next);
      return next;
    });
    stamp("notes");
  }

  async function addScore(s) {
    const next = [s, ...quizScores].slice(0, 50);
    setQuizScores(next);
    await DB.set("quizScores", next);
  }

  function navigate(p, subjectId = null) {
    setPage(p);
    setInitSubject(subjectId);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  const title = { home: null, library: "Library", plan: "Study Plan", flashcards: "Flashcards", quiz: "Quiz", tutor: "Tutor" }[page];
  const dir = ["home", "library", "flashcards", "quiz", "tutor"].indexOf(page);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-row">
            <div>
              {!title ? (
                <>
                  <div className="brand">Madrasah</div>
                </>
              ) : (
                <div className="page-title">{title}</div>
              )}
            </div>
            <button onClick={() => setShowSettings(true)} className={`key-btn${groqKey ? " on" : ""}`}
              aria-label={groqKey ? "API key set. Open settings." : "Set API key"}>
              <KeyRound /> {groqKey ? "Set" : "Key"}
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={page + (initSubject || "")}
            initial={reduce ? false : { opacity: 0, x: 14 * (dir % 2 ? 1 : -1) }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -10 }}
            transition={{ duration: 0.22, ease: EASE }}>
            {page === "home" && <HomePage subjects={subjects} setSubjects={setSubjects} notes={notes} quizScores={quizScores} activity={activity} decks={decks} groqKey={groqKey} onNavigate={navigate} onOpenSettings={() => setShowSettings(true)} />}
            {page === "library" && <LibraryPage subjects={subjects} notes={notes} setNotes={setNotes} initSubjectId={initSubject} progress={progress} setProgress={setProgress} stamp={stamp} onPlan={(id) => navigate("plan", id)} groqKey={groqKey} />}
            {page === "plan" && <StudyPlanPage subjects={subjects} notes={notes} groqKey={groqKey} initSubjectId={initSubject} onOpenSettings={() => setShowSettings(true)} />}
            {page === "flashcards" && <FlashcardsPage subjects={subjects} notes={notes} groqKey={groqKey} decks={decks} setDecks={setDecks} stamp={stamp} onOpenSettings={() => setShowSettings(true)} />}
            {page === "quiz" && <QuizPage subjects={subjects} notes={notes} groqKey={groqKey} onScore={addScore} mistakes={mistakes} setMistakes={setMistakes} stamp={stamp} onOpenSettings={() => setShowSettings(true)} />}
            {page === "tutor" && <TutorPage subjects={subjects} notes={notes} groqKey={groqKey} onSaveNote={saveNoteFor} onOpenSettings={() => setShowSettings(true)} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => { setPage(id); if (id !== "library") setInitSubject(null); }}
              className={`tab${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined} aria-label={label}>
              {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ duration: 0.25, ease: EASE }} />}
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {page === "home" && <Pomodoro onDone={() => stamp("pomo")} />}

      <AnimatePresence>
        {showSettings && <SettingsModal groqKey={groqKey} onSave={saveGroqKey} onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  );
}
