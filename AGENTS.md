# AGENTS.md

## プロジェクト概要

README.mdを参照すること

## Cursor Cloud specific instructions

- 依存関係は `npm ci` で入る。Linux では `npm test`、`npm run typecheck`、`npm run build` で確認する。`npm run dev` は Raycast アプリが要る。
- `npm run lint` は Raycast Store に author `kuroweb` が無いと package.json の検証で失敗する。ESLint と Prettier は通る。開発とビルドには影響しない。
