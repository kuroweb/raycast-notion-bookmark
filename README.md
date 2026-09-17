# Raycast Notion Bookmark

Notion のデータベースをタイトルと URL で検索し、URL プロパティのリンクをブラウザで開く Raycast 拡張。

## セットアップ

### 1. Bookmark用のデータベースを用意する

- Bookmark用のデータベースが必要。1行が1ブックマークになる。

  ```mermaid
  erDiagram
      Bookmark {
          Name データベースのタイトル列
          URL 開きたいリンク
      }
  ```

- Tech Bookmark と Work Bookmark のように分かれていても、まとめて検索できる。

  ```mermaid
  erDiagram
      "Tech Bookmark" {
          Name データベースのタイトル列
          URL 開きたいリンク
      }
      "Work Bookmark" {
          Name データベースのタイトル列
          URL 開きたいリンク
      }
  ```

### 2. 個人用アクセストークンを発行する

- [開発者ツール](https://app.notion.com/developers) から発行する。自分の Notion 権限で動くので、Integration への共有は不要。

### 3. Raycast にトークンを設定する

- この拡張の Preferences を開き、発行したトークンを貼る。

### 4. 検索するデータベースを選ぶ

- コマンド Configure Databases を開き、検索するデータベースにチェックを入れて保存する。
- Search Bookmarks は、ここで選んだデータベースだけを見る。

## コマンド

### Search Bookmarks: ブックマークを検索して開く

- タイトルと URL を横断検索する。Enter でブックマーク先を開く。

### Configure Databases: 検索対象のデータベースを選ぶ

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
