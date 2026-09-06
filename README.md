# Chat App

Firestoreを使った複数人リアルタイムチャットのWebアプリ。GitHub Pagesでの公開を想定した、ビルド不要の静的サイト（HTML/CSS/JSのみ、Firebase JS SDKはCDNから読み込み）。

## 現在の機能

- 初回アクセス時に「名前」と「4桁のパスワード」を入力してログイン
  - 未登録の名前なら新規登録、登録済みの名前ならパスワード一致を確認
  - パスワードはSHA-256でハッシュ化してからFirestoreに保存（平文は保存・送信しない）
  - ログイン後1時間はセッション（名前と選択中のチャット相手）をlocalStorageに保持し、その間はページをリロードしても直前のチャット画面（未選択なら相手選択画面）に戻る（期限切れ後は再度ログインが必要）
- ログイン後、登録済みユーザーの一覧から「誰とチャットするか」を選択
- 選択した相手との1対1チャット（Firestoreの `messages` コレクションを、2人の名前から生成した `conversationId` で絞り込んで表示）
  - 自分のメッセージは右・青の吹き出し、相手のメッセージは左・グレーの吹き出し（送信者名付き）で表示
  - 各メッセージの横に送信日時（時:分）を表示
  - 送信は削除・編集不可（Firestoreセキュリティルールで制限）
  - チャット画面左上の「←」で相手選択画面に戻れる
  - チャット画面右上の「⟳」でメッセージの再読み込み（購読のはり直し）ができる。読み込み中はアイコンが回転する

## ファイル構成

- `index.html` — ページ構造（ログイン画面・ヘッダー・メッセージ一覧・入力フォーム）
- `style.css` — 見た目（吹き出し・ログイン画面のスタイル、レイアウト）
- `script.js` — Firebase初期化、ログイン処理、メッセージ送受信のロジック
- `firebase-config.js` — Firebaseプロジェクトの接続設定（要書き換え。値自体は公開されても問題ないもの）
- `firestore.rules` — Firestoreセキュリティルール（Firebaseコンソールの「Firestore Database > ルール」に貼り付けて使う）

## Firebaseプロジェクトのセットアップ（初回のみ）

1. [Firebase コンソール](https://console.firebase.google.com/)で新規プロジェクトを作成
2. 「構築」>「Authentication」> Sign-in method で **匿名（Anonymous）** を有効化
3. 「構築」>「Firestore Database」でデータベースを作成（本番モードでOK。ルールは次の手順で上書きする）
4. Firestore の「ルール」タブに、このリポジトリの `firestore.rules` の内容を貼り付けて公開
5. プロジェクトの設定 >「マイアプリ」でウェブアプリを追加し、表示された設定オブジェクトの値を `firebase-config.js` の該当箇所に貼り付け

## Firebase設定情報

このアプリが使用しているFirebaseプロジェクト（`chat-63f96`）のWeb SDK設定は以下の通り。

```js
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCp3hj4KRJweAyAXo8NBVrpY2Wy7AQfIw4",
  authDomain: "chat-63f96.firebaseapp.com",
  projectId: "chat-63f96",
  storageBucket: "chat-63f96.firebasestorage.app",
  messagingSenderId: "210146012521",
  appId: "1:210146012521:web:2c3e537f45e33a325021f8",
  measurementId: "G-4KFWP7R9VF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
```

このアプリ自体はビルド不要の静的サイトのため、Analytics付きの上記コードそのままではなく `firebase-config.js` の `firebaseConfig` オブジェクトに値を反映して使う（`initializeApp`／`getAnalytics` の呼び出しは `script.js` 側の初期化ロジックに委ねる）。

## ローカルで確認する

```sh
python3 -m http.server 8765
```

その後ブラウザで `http://localhost:8765/index.html` を開く。

## 公開方法

GitHub Pagesを想定。リポジトリのルートに静的ファイルを置いた状態で、GitHub上でPagesを有効化するだけで公開できる（ビルド手順なし）。`firebase-config.js` の値はクライアントに公開されて問題ない値のため、そのままコミットして良い（アクセス制御はFirestoreのセキュリティルール側で行う）。

## 既知の制約

- 「4桁の数字パスワード」は組み合わせが1万通りしかなく、認証としての強度は低い（総当たりされる可能性がある）。身内利用など、なりすまし被害が軽微な用途を想定している
- セッションはlocalStorageに平文の名前と有効期限を保存しているだけなので、同じブラウザを共有している他人がその間になりすませてしまう
- メッセージの既読・編集・削除、画像送信などは未実装
- チャット相手の選択画面は `users` コレクションの全ユーザーを一覧表示するだけで、検索や「最近やり取りした相手」順の並び替えはない
- `conversationId`（等価条件）と `createdAt`（並び替え）を組み合わせたクエリを使っているため、初回実行時にFirestoreコンソールから複合インデックス作成を促されることがある（表示されるリンクから作成すればよい）

## 今後の方向性（未着手）

- パスワードの強度向上（桁数を増やす、レート制限を設けるなど）
- 本物のAI応答に繋ぐ場合、APIキーを秘匿するための簡易プロキシ（Cloudflare Workers等）が別途必要
