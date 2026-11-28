# Raycast Notion Bookmark

Notion のデータベースを、ブックマーク置き場とスニペット置き場として使う Raycast 拡張。

- **Bookmarks**: URL を保存し、タイトル・URL・タグで横断検索して開く。ページ本文にはページの内容（page clip）も残せる。
- **Snippets**: よく使うテキストを保存し、タイトル・本文・タグで横断検索して、そのまま前面のアプリへ貼り付ける。

どちらも複数データベースを対象にできる。タグは Tags データベースへの Relation で表す。

## 必要なもの

- macOS / Raycast
- Notion の個人用アクセストークン
- ブックマーク用・スニペット用のデータベース（どちらか一方だけでもよい）
- （任意）Raycast のブラウザ拡張。Save Bookmark でページ本文を保存するときに使う。

## ドキュメント

- [セットアップ](docs/usage.md#セットアップ)
- [コマンドの使い方](docs/usage.md#コマンド)
- [ローカル開発とテスト](docs/development.md)
