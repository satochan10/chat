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
  updateDoc,
  deleteDoc,
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
const friendRequestsSection = document.getElementById("friend-requests-section");
const friendRequestsList = document.getElementById("friend-requests-list");
const outgoingRequestsSection = document.getElementById("outgoing-requests-section");
const outgoingRequestsList = document.getElementById("outgoing-requests-list");
const addFriendForm = document.getElementById("add-friend-form");
const addFriendNameInput = document.getElementById("add-friend-name");
const addFriendError = document.getElementById("add-friend-error");
const myIconBtn = document.getElementById("my-icon-btn");
const myNameLabel = document.getElementById("my-name-label");
const iconPicker = document.getElementById("icon-picker");

const chatContainer = document.getElementById("chat-container");
const chatTitle = document.getElementById("chat-title");
const chatPartnerIcon = document.getElementById("chat-partner-icon");
const backBtn = document.getElementById("back-btn");
const reloadBtn = document.getElementById("reload-btn");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const messages = document.getElementById("messages");

input.addEventListener("input", () => {
  sendBtn.disabled = input.value.trim() === "";
});

const ICON_OPTIONS = ["🐻", "🐰", "🐶", "🐱", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐹", "🐷", "🐮", "🐔", "🐧"];
const DEFAULT_ICON = ICON_OPTIONS[0];
const iconCache = new Map();

let myName = null;
let myIcon = DEFAULT_ICON;
let currentPartner = null;
let unsubscribeMessages = null;
let unsubscribeFriendshipsA = null;
let unsubscribeFriendshipsB = null;
let friendshipsAsUserA = new Map();
let friendshipsAsUserB = new Map();

ICON_OPTIONS.forEach((icon) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-option";
  btn.textContent = icon;
  btn.addEventListener("click", () => selectMyIcon(icon));
  iconPicker.appendChild(btn);
});

myIconBtn.addEventListener("click", () => {
  iconPicker.hidden = !iconPicker.hidden;
});

async function selectMyIcon(icon) {
  if (icon === myIcon) {
    iconPicker.hidden = true;
    return;
  }
  const previousIcon = myIcon;
  myIcon = icon;
  myIconBtn.textContent = icon;
  iconPicker.hidden = true;
  try {
    await updateDoc(doc(db, "users", myName), { icon });
    iconCache.set(myName, icon);
  } catch (err) {
    console.error(err);
    myIcon = previousIcon;
    myIconBtn.textContent = previousIcon;
  }
}

async function fetchIcon(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  try {
    const snap = await getDoc(doc(db, "users", name));
    const icon = snap.exists() && snap.data().icon ? snap.data().icon : DEFAULT_ICON;
    iconCache.set(name, icon);
    return icon;
  } catch (err) {
    console.error(err);
    return DEFAULT_ICON;
  }
}

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
    myIcon = await fetchIcon(myName);
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

// messagesのconversationIdとfriendshipsのドキュメントIDは同じ形式（2人の名前をソートして"__"で結合）。
function pairId(nameA, nameB) {
  return [nameA, nameB].sort().join("__");
}

function formatTimestamp(date) {
  if (!date) return "";
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addMessageBubble(text, sender, name, createdAt) {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;

  if (sender === "other") {
    const label = document.createElement("div");
    label.className = "message-name";
    label.textContent = name;
    bubble.appendChild(label);
  }

  const row = document.createElement("div");
  row.className = "message-row";

  const body = document.createElement("div");
  body.textContent = text;
  row.appendChild(body);

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = formatTimestamp(createdAt);
  row.appendChild(time);

  bubble.appendChild(row);

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
      myIcon = userSnap.data().icon || DEFAULT_ICON;
    } else {
      myIcon = DEFAULT_ICON;
      await setDoc(userRef, {
        pinHash,
        icon: myIcon,
        createdAt: serverTimestamp(),
      });
    }
    iconCache.set(name, myIcon);

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

function showPartnerSelect() {
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
  partnerEmpty.textContent = "読み込み中...";
  myIconBtn.textContent = myIcon;
  myNameLabel.textContent = myName;
  iconPicker.hidden = true;

  if (unsubscribeFriendshipsA) unsubscribeFriendshipsA();
  if (unsubscribeFriendshipsB) unsubscribeFriendshipsB();

  const friendshipsRef = collection(db, "friendships");

  unsubscribeFriendshipsA = onSnapshot(
    query(friendshipsRef, where("userA", "==", myName)),
    (snapshot) => {
      friendshipsAsUserA = new Map(snapshot.docs.map((d) => [d.id, d.data()]));
      renderPartnerLists();
    },
    (err) => {
      console.error(err);
      partnerEmpty.textContent = "友達一覧の取得に失敗しました。";
    }
  );

  unsubscribeFriendshipsB = onSnapshot(
    query(friendshipsRef, where("userB", "==", myName)),
    (snapshot) => {
      friendshipsAsUserB = new Map(snapshot.docs.map((d) => [d.id, d.data()]));
      renderPartnerLists();
    },
    (err) => {
      console.error(err);
      partnerEmpty.textContent = "友達一覧の取得に失敗しました。";
    }
  );
}

function renderPartnerLists() {
  const merged = new Map([...friendshipsAsUserA, ...friendshipsAsUserB]);

  const friends = [];
  const incoming = [];
  const outgoing = [];

  merged.forEach((data, id) => {
    const otherName = data.userA === myName ? data.userB : data.userA;
    if (data.status === "accepted") {
      friends.push({ id, name: otherName });
    } else if (data.status === "pending") {
      if (data.requestedBy === myName) {
        outgoing.push({ id, name: otherName });
      } else {
        incoming.push({ id, name: otherName });
      }
    }
  });

  const byName = (a, b) => a.name.localeCompare(b.name, "ja");
  friends.sort(byName);
  incoming.sort(byName);
  outgoing.sort(byName);

  friendRequestsSection.hidden = incoming.length === 0;
  friendRequestsList.innerHTML = "";
  incoming.forEach(({ id, name }) => {
    const li = document.createElement("li");
    li.className = "request-item";

    const icon = document.createElement("span");
    icon.className = "list-icon";
    li.appendChild(icon);
    fetchIcon(name).then((value) => {
      icon.textContent = value;
    });

    const label = document.createElement("span");
    label.textContent = name;
    li.appendChild(label);

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "request-accept-btn";
    acceptBtn.textContent = "承認";
    acceptBtn.addEventListener("click", () => respondToFriendRequest(id, true));
    li.appendChild(acceptBtn);

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "request-reject-btn";
    rejectBtn.textContent = "拒否";
    rejectBtn.addEventListener("click", () => respondToFriendRequest(id, false));
    li.appendChild(rejectBtn);

    friendRequestsList.appendChild(li);
  });

  partnerList.innerHTML = "";
  if (friends.length === 0) {
    partnerEmpty.textContent = "まだ友達がいません。下から友達を追加してね。";
  } else {
    partnerEmpty.textContent = "";
    friends.forEach(({ name }) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "partner-item";

      const icon = document.createElement("span");
      icon.className = "list-icon";
      btn.appendChild(icon);
      fetchIcon(name).then((value) => {
        icon.textContent = value;
      });

      const label = document.createElement("span");
      label.textContent = name;
      btn.appendChild(label);

      btn.addEventListener("click", () => startChat(name));
      li.appendChild(btn);
      partnerList.appendChild(li);
    });
  }

  outgoingRequestsSection.hidden = outgoing.length === 0;
  outgoingRequestsList.innerHTML = "";
  outgoing.forEach(({ name }) => {
    const li = document.createElement("li");
    li.className = "request-item outgoing";

    const icon = document.createElement("span");
    icon.className = "list-icon";
    li.appendChild(icon);
    fetchIcon(name).then((value) => {
      icon.textContent = value;
    });

    const label = document.createElement("span");
    label.textContent = `${name} さんへ申請中...`;
    li.appendChild(label);

    outgoingRequestsList.appendChild(li);
  });
}

async function respondToFriendRequest(id, accept) {
  const ref = doc(db, "friendships", id);
  try {
    if (accept) {
      await updateDoc(ref, { status: "accepted" });
    } else {
      await deleteDoc(ref);
    }
  } catch (err) {
    console.error(err);
  }
}

addFriendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addFriendNameInput.value.trim();
  const submitBtn = addFriendForm.querySelector("button");
  addFriendError.textContent = "";

  if (!name) return;
  if (name === myName) {
    addFriendError.textContent = "自分自身には申請できません。";
    return;
  }

  submitBtn.disabled = true;
  try {
    const userSnap = await getDoc(doc(db, "users", name));
    if (!userSnap.exists()) {
      addFriendError.textContent = "そのユーザーは見つかりません。";
      return;
    }

    const id = pairId(myName, name);
    const existing = await getDoc(doc(db, "friendships", id));
    if (existing.exists()) {
      addFriendError.textContent =
        existing.data().status === "accepted" ? "すでに友達です。" : "すでに申請済みです。";
      return;
    }

    const [userA, userB] = [myName, name].sort();
    await setDoc(doc(db, "friendships", id), {
      userA,
      userB,
      status: "pending",
      requestedBy: myName,
      createdAt: serverTimestamp(),
    });
    addFriendNameInput.value = "";
  } catch (err) {
    console.error(err);
    addFriendError.textContent = "申請に失敗しました。時間をおいて再試行してください。";
  } finally {
    submitBtn.disabled = false;
  }
});

function startChat(partnerName) {
  currentPartner = partnerName;
  saveSession(myName, partnerName);
  partnerOverlay.hidden = true;
  chatContainer.hidden = false;
  chatTitle.textContent = partnerName;
  chatPartnerIcon.textContent = "";
  fetchIcon(partnerName).then((icon) => {
    chatPartnerIcon.textContent = icon;
  });
  messages.innerHTML = "";

  if (unsubscribeFriendshipsA) {
    unsubscribeFriendshipsA();
    unsubscribeFriendshipsA = null;
  }
  if (unsubscribeFriendshipsB) {
    unsubscribeFriendshipsB();
    unsubscribeFriendshipsB = null;
  }

  const convoId = pairId(myName, partnerName);
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
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      addMessageBubble(data.text, sender, data.name, createdAt);
    });
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    sendBtn.disabled = true;
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
  const url = new URL(location.href);
  url.searchParams.set("_", Date.now());
  location.replace(url.toString());
});
