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
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
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

const partnerOverlay = document.getElementById("partner-overlay");
const partnerList = document.getElementById("partner-list");
const partnerEmpty = document.getElementById("partner-empty");

const chatContainer = document.getElementById("chat-container");
const chatTitle = document.getElementById("chat-title");
const backBtn = document.getElementById("back-btn");
const reloadBtn = document.getElementById("reload-btn");
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

let myName = null;
let currentPartner = null;
let unsubscribeMessages = null;

nameInput.value = localStorage.getItem("chat-name") || "";

const SESSION_KEY = "chat-session";
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1時間

function saveSession(name, partner) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      name,
      partner: partner || null,
      expiresAt: Date.now() + SESSION_DURATION_MS,
    })
  );
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (session.name && session.expiresAt > Date.now()) {
      return session;
    }
  } catch (err) {
    // 壊れたセッション情報は無視する
  }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

async function resumeSession(session) {
  try {
    await signInAnonymously(auth);
    myName = session.name;
    if (session.partner) {
      startChat(session.partner);
    } else {
      showPartnerSelect();
    }
  } catch (err) {
    console.error(err);
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }
}

const resumedSession = loadSession();
if (resumedSession) {
  loginOverlay.remove();
  resumeSession(resumedSession);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function conversationId(nameA, nameB) {
  return [nameA, nameB].sort().join("__");
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
    saveSession(name);
    loginOverlay.remove();
    showPartnerSelect();
  } catch (err) {
    console.error(err);
    loginError.textContent = "ログインに失敗しました。時間をおいて再試行してください。";
    submitBtn.disabled = false;
  }
});

async function showPartnerSelect() {
  chatContainer.hidden = true;
  currentPartner = null;
  if (myName) {
    saveSession(myName, null);
  }
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  partnerOverlay.hidden = false;
  partnerList.innerHTML = "";
  partnerEmpty.textContent = "読み込み中...";

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const otherNames = usersSnap.docs
      .map((d) => d.id)
      .filter((name) => name !== myName)
      .sort((a, b) => a.localeCompare(b, "ja"));

    partnerEmpty.textContent = "";

    if (otherNames.length === 0) {
      partnerEmpty.textContent = "他のユーザーがまだいません。";
      return;
    }

    otherNames.forEach((name) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "partner-item";
      btn.textContent = name;
      btn.addEventListener("click", () => startChat(name));
      li.appendChild(btn);
      partnerList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    partnerEmpty.textContent = "ユーザー一覧の取得に失敗しました。";
  }
}

function startChat(partnerName) {
  currentPartner = partnerName;
  saveSession(myName, partnerName);
  partnerOverlay.hidden = true;
  chatContainer.hidden = false;
  chatTitle.textContent = partnerName;
  messages.innerHTML = "";

  const convoId = conversationId(myName, partnerName);
  const messagesRef = collection(db, "messages");
  const messagesQuery = query(
    messagesRef,
    where("conversationId", "==", convoId),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  setReloading(true);
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }
  unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
    setReloading(false);
    messages.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const sender = data.name === myName ? "me" : "other";
      addMessageBubble(data.text, sender, data.name);
    });
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    try {
      await addDoc(messagesRef, {
        conversationId: convoId,
        name: myName,
        text,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
    }
  };
}

function setReloading(isLoading) {
  reloadBtn.disabled = isLoading;
  reloadBtn.classList.toggle("loading", isLoading);
}

backBtn.addEventListener("click", () => {
  showPartnerSelect();
});

reloadBtn.addEventListener("click", () => {
  if (currentPartner) {
    startChat(currentPartner);
  }
});
