# Madrasah

General study app. You add your own subjects, then keep notes, study plans, flashcards, quizzes, and a focus timer around them. Built with React + Vite. Data lives in your browser (localStorage). AI features use your own free Groq key.

## Run it

```bash
npm install
npm run dev
```

## What it does

* Subjects you manage: add, rename, delete. Everything else hangs off them.
* Library: notes per subject, typed or imported from txt, md, docx, or pdf. Mark notes studied.
* Study plan: picks up your notes and generates a day by day plan.
* Flashcards: generates flip cards from your notes.
* Quiz: generates multiple choice from your notes and keeps your score history.
* Focus timer: floating 25 / 5 / 15 minute pomodoro.
* Settings: paste a Groq key (free at console.groq.com). It never leaves your browser.

## Notes

* No backend, no tracking, no build time secrets. The Groq key is typed in at runtime and stored locally.
* PDF import loads pdf.js from CDN at runtime.
