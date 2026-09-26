# Raycast Notion Bookmark

Notion のデータベースにブックマークを保存し、タイトルと URL で検索して開く Raycast 拡張。

## セットアップ

### 1. Bookmark用のデータベースを用意する

- Bookmark用のデータベースが必要。1行が1ブックマークになる。必須なのは Name と URL の列。タグを付けるなら、Tags データベースへの Relation 列 `Tags` も用意する。Body はページ本文で、列は作らない。

  ```mermaid
  erDiagram
      Tags {
          Name タイトル列
      }
      Bookmark {
          Name データベースのタイトル列
          URL 開きたいリンク
          Tags TagsへのRelation
          Body ページ本文
      }
      Bookmark }o--o{ Tags : Tags
  ```

- Tags データベースは1つでよい。1行が1タグ。タイトル列は Name。
- Tech Bookmark と Work Bookmark のように分かれていても、まとめて検索できる。Relation の参照先を同じ Tags にすれば、タグ語彙も共有される。

### 2. 個人用アクセストークンを発行する

- [開発者ツール](https://app.notion.com/developers) から発行する。自分の Notion 権限で動くので、Integration への共有は不要。

### 3. Raycast にトークンを設定する

- この拡張の Preferences を開き、発行したトークンを貼る。

### 4. 検索するデータベースを選ぶ

- コマンド Configure Bookmark Databases を開き、検索するデータベースにチェックを入れて保存する。
- Search Bookmarks と Save Bookmark は、ここで選んだデータベースを使う。

## コマンド

### Search Bookmarks: ブックマークを検索して開く

- タイトル、URL、タグを横断検索する。Enter でブックマーク先を開く。
- Edit Bookmark でタイトル、URL、タグ、本文（page clip）を更新できる。
- Database を選び直すとページごと別のデータベースへ移せる。選べるのは Configure Bookmark Databases で選んだデータベースと、今の保存先。移動先の Tags は移動先のデータベースの語彙になるので、タグは選び直す。

### Save Bookmark: タイトルと URL を保存する

- 開いているブラウザタブ、クリップボードの URL、または手入力から保存する。
- 保存先に `Tags` Relation があれば、既存タグを選べる。カンマ区切りで新規タグも作れる。Tags データベースにページを作り、ブックマークへ紐づける。
- ページ本文を保存するかどうか選べる。前回の選択を覚える。
- 本文を保存するときは、Raycast のブラウザ拡張が入っていれば開いているページを markdown にして Notion のページ本文に入れる。
- 同じ URL が選んだデータベースにあれば保存済みと出す。同じデータベースへは二重保存しない。
- 保存先は Configure Bookmark Databases で選んだデータベース。複数あるときは選ぶ。前回の保存先を覚える。

### Configure Bookmark Databases: 検索対象のデータベースを選ぶ

- URL 型プロパティがあるデータベースだけが一覧に出る。
- 出てこない場合は、トークンがそのデータベースを見られるか、プロパティの型を確認する。

## ローカルで開発する

```bash
npm install
npm run dev
```

Raycast を開くと、開発中の拡張がルート検索に出る。

```bash
npm run lint
npm run build
```

ユニットテストは `tests/` にあり、`src/` と同じ構成で並べる。Raycast と Notion API は
`tests/support/` のモックへ差し替えるので、テスト実行に Raycast もトークンも要らない。
コマンドの UI（`*.tsx`）はテスト対象外で、判定ロジックは `form.ts` などへ切り出してテストする。

```bash
npm run test
npm run test:watch
npm run typecheck
```
