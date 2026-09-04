# Madrasah

Study app, no accounts. You add your own subjects, then keep notes, plans, flashcards, quizzes, and a focus timer around them. React + Vite. Everything lives in your browser. AI features run on your own free Groq key.

## Run it

```bash
npm install
npm run dev
```

## What it does

* Subjects: add, rename, delete. Everything else hangs off them.
* Library: type notes or import txt, md, docx, pdf, or photos. Photos get free OCR, or AI transcription with math as LaTeX when your Groq key is set. Notes are editable. Export any subject to PDF or DOCX.
* Study plan: turns your notes into a day by day plan.
* Flashcards: AI decks with SM2 spaced repetition. Grade Again, Hard, Good, or Easy and due cards come back on schedule.
* Quiz: practice quizzes plus timed mock exams that scale with the time you pick. Written answers get AI grades and misses land in the mistake bank for drilling.
* Tutor: per subject Q&A over your notes, with a teach mode. Ask it to save something and it files it into the Library.
* Streaks with a weekly digest, focus timer, installable PWA with an offline app shell.

## Notes

* No backend, no tracking, no build time secrets. The Groq key is typed in at runtime and stored locally.
* PDF import loads pdf.js from CDN at runtime.
* The PWA shell needs localhost or https to activate.
