const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

const REPLIES = [
  "なるほど、それで？",
  "いいですね！",
  "もう少し詳しく教えてください。",
  "そうなんですね。",
  "了解しました。",
];

function addMessage(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function showTyping() {
  const typing = document.createElement("div");
  typing.className = "message other typing";
  typing.id = "typing-indicator";
  typing.textContent = "…";
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
  const typing = document.getElementById("typing-indicator");
  if (typing) typing.remove();
}

function getReply() {
  return REPLIES[Math.floor(Math.random() * REPLIES.length)];
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "me");
  input.value = "";

  showTyping();
  setTimeout(() => {
    hideTyping();
    addMessage(getReply(), "other");
  }, 700 + Math.random() * 600);
});
