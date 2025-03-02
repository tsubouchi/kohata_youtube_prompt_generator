# YouTube Analyzer

YouTube動画のサムネイルを取得し、Gemini 2.0 flash LLMを使用してMidjourney向けのプロンプトを生成するGoogle Apps Scriptアプリケーションです。

## 機能

- YouTube URLからサムネイル画像を取得
- サムネイル画像をGoogle Driveに保存
- Gemini 2.0 flash LLMを使用して画像からMidjourney向けプロンプトを生成
- 結果をスプレッドシートに保存
- Webアプリケーションとして結果を表示

## 必要条件

- Google アカウント
- [clasp](https://github.com/google/clasp) (Google Apps Script用のコマンドラインツール)
- Node.js と npm
- Google Cloud Platformプロジェクト (YouTube Data API v3を有効化)
- YouTube Data API キー
- Gemini API キー

## セットアップ手順

### 1. 事前準備

1. スプレッドシートを作成
   - シート名: `YouTubePrompts`
   - 列: Timestamp, YouTubeURL, FileID, Prompt
   - スプレッドシートIDをメモしておく

2. Google Driveにサムネイル保存用のフォルダを作成
   - フォルダIDをメモしておく

3. Google Cloud Platformで以下のAPIを有効化
   - YouTube Data API v3
   - Google Drive API
   - Google Sheets API

4. YouTube Data APIキーを取得
   - Google Cloud Platformコンソールで認証情報を作成

5. Gemini APIキーを取得
   - [Google AI Studio](https://makersuite.google.com/app/apikey)からAPIキーを取得

### 2. 環境変数の設定

`.env`ファイルに以下の情報を設定:

```
SPREADSHEET_ID=your_spreadsheet_id_here
FOLDER_ID=your_folder_id_here
YOUTUBE_API_KEY=your_youtube_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. claspを使ったデプロイ

```bash
# claspをインストール
npm install -g @google/clasp

# Googleアカウントにログイン
clasp login

# プロジェクトをpush
clasp push

# Webアプリとしてデプロイ
clasp deploy
```

## 使用方法

1. デプロイしたWebアプリのURLにアクセス
2. YouTube URLを入力フィールドに貼り付け
3. 「Process」ボタンをクリック
4. サムネイル画像とMidjourney向けプロンプトが表示される

## ファイル構成

- `Code.gs`: メインのサーバーサイドコード
- `index.html`: Webアプリのメインページ
- `styles.html`: CSSスタイル
- `scripts.html`: クライアントサイドJavaScript
- `.env`: 環境変数設定ファイル
- `.env.sample`: 環境変数のサンプルファイル
- `appsscript.json`: Apps Scriptプロジェクト設定

## 注意事項

- このアプリケーションはYouTube Data APIを使用するため、APIの使用量制限に注意してください。
- Gemini 2.0 flash LLMのAPIは変更される可能性があります。最新のドキュメントを参照してください。
- 環境変数ファイル（.env）は機密情報を含むため、公開リポジトリにコミットしないでください。

## ライセンス

MIT 