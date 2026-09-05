import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginOverlay = document.getElementById("login-overlay");
const loginForm = document.getElementById("login-form");
const nameInput = document.getElementById("login-name");
const pinInput = document.getElementById("login-pin");
const loginError = document.getElementById("login-error");

const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

let myName = null;

nameInput.value = localStorage.getItem("chat-name") || "";

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function addMessageBubble(text, sender, name) {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;

  if (sender === "other") {
    const label = document.createElement("div");
    label.className = "message-name";
    label.textContent = name;
    bubble.appendChild(label);
  }

  const body = document.createElement("div");
  body.textContent = text;
  bubble.appendChild(body);

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();
  const submitBtn = loginForm.querySelector("button");

  loginError.textContent = "";

  if (!name) {
    loginError.textContent = "名前を入力してください。";
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    loginError.textContent = "パスワードは4桁の数字で入力してください。";
    return;
  }

  submitBtn.disabled = true;

  try {
    await signInAnonymously(auth);
    const pinHash = await sha256Hex(pin);
    const userRef = doc(db, "users", name);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      if (userSnap.data().pinHash !== pinHash) {
        loginError.textContent = "その名前は既に使われています。パスワードが違います。";
        submitBtn.disabled = false;
        return;
      }
    } else {
      await setDoc(userRef, {
        pinHash,
        createdAt: serverTimestamp(),
      });
    }

    myName = name;
    localStorage.setItem("chat-name", name);
    loginOverlay.remove();
    startChat();
  } catch (err) {
    console.error(err);
    loginError.textContent = "ログインに失敗しました。時間をおいて再試行してください。";
    submitBtn.disabled = false;
  }
});

function startChat() {
  const messagesRef = collection(db, "messages");
  const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(200));

  onSnapshot(messagesQuery, (snapshot) => {
    messages.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const sender = data.name === myName ? "me" : "other";
      addMessageBubble(data.text, sender, data.name);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    try {
      await addDoc(messagesRef, {
        name: myName,
        text,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
    }
  });
}
