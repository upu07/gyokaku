// Firebase の設定。Firebase コンソールの「プロジェクトの設定 → マイアプリ → SDK の設定と構成」に出る値を貼り付ける。
// null のままだとログインなしで、この端末だけに記録を保存するモードで動く。
// （この値は公開されても問題ない識別子で、データはFirestoreのルールで守る）
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSI9RB1XiZc-zDEY8du7dmFy3ko8yoszg",
  authDomain: "gyokaku-b3205.firebaseapp.com",
  projectId: "gyokaku-b3205",
  storageBucket: "gyokaku-b3205.firebasestorage.app",
  messagingSenderId: "264238388736",
  appId: "1:264238388736:web:a6bc2d53f2a496054aeae5"
};

// 発行するIDをFirebaseのメール形式に変換するときのドメイン（実在しなくてよい）
window.ACCOUNT_DOMAIN = "gyokaku.ohno-suisan.app";
