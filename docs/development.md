# ローカルで開発する

```bash
npm install
npm run dev
```

Raycast を開くと、開発中の拡張がルート検索に出る。

```bash
npm run lint
npm run typecheck
npm run build
```

## テスト

```bash
npm run test
npm run test:watch
```

- ユニットテストは `tests/` にあり、`src/` と同じ構成で並べる。
- Raycast と Notion API は `tests/support/` のモックへ差し替えるので、実行に Raycast もトークンも要らない。
- コマンドの UI（`*.tsx`）はテスト対象外。判定ロジックは `form.ts` などへ切り出してテストする。

## ディレクトリ構成

```
src/
  lib/          Notion API クライアントとデータソース共通処理
  tags/         Tags Relation の解決とタグ検索キー
  bookmarks/    Search / Save / Configure と page clip の取得・変換
  snippets/     Search / Save / Configure と本文キャッシュ
  *.tsx         package.json の commands に対応するエントリポイント
```
