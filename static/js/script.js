const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");

// Image paths
const userLogo = "/static/images/user-logo.png";
const botLogo = "/static/images/bot-logo.png";

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = userInput.value.trim();
    if (!msg) return;

    // Get selected topic
    const topic = document.getElementById('topicSelect')?.value || 'education';

    addMessage(msg, "user", userLogo, new Date()); // Use current time
    userInput.value = "";

    const typingMsg = addTypingIndicator(botLogo);

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg, topic }),
        });

        const data = await res.json();

        setTimeout(() => {
            typingMsg.remove();

            // Use backend timestamp if available, otherwise current time
            const botTime = data.timestamp ? new Date(data.timestamp) : new Date();
            addMessage(data.reply || "Sorry, something went wrong.", "bot", botLogo, botTime);

        }, 500 + Math.random() * 500); // Random delay 0.5-1s

    } catch (err) {
        typingMsg.remove();
        addMessage("Sorry, something went wrong.", "bot", botLogo, new Date());
    }
});

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Sanitize markdown/basic HTML for safe rendering
function renderBotMessage(text) {
  // Basic markdown: **bold**, *italic*, `code`, [link](url), newlines, lists
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.*?)\]\((https?:\/\/[^\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/(?:\r?\n){2,}/g, '</p><p>')    // Double linebreak = paragraph
    .replace(/\n/g, '<br>');                  // Single linebreak
  if (/^\s*[-*] /m.test(text)) {
    // Lists: convert lines that start with - or * to <ul><li>
    safe = safe.replace(/((?:^\s*[-*] .+(?:\r?\n)?)+)/gm, match => {
      const items = match.trim().split(/\r?\n/).map(s => s.replace(/^\s*[-*] /, ''));
      return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
    });
  }
  return `<p>${safe}</p>`;
}

function addMessage(text, sender, imgPath, timestampDate) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("msg-wrapper", sender);

    const img = document.createElement("img");
    img.src = imgPath;
    img.alt = sender;

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");

    if (sender === "bot") {
        messageDiv.innerHTML = renderBotMessage(text);
    } else {
        messageDiv.textContent = text;
    }

    const timestamp = document.createElement("div");
    timestamp.classList.add("timestamp");
    timestamp.textContent = formatTime(timestampDate);

    if (sender === "user") {
        // Left side: time | message | image
        wrapper.appendChild(timestamp);
        wrapper.appendChild(messageDiv);
        wrapper.appendChild(img);
    } else {
        // Right side: image | message | time
        wrapper.appendChild(img);
        wrapper.appendChild(messageDiv);
        wrapper.appendChild(timestamp);
    }

    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
    return wrapper;
}

function addTypingIndicator(botImg) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("msg-wrapper", "bot");

    const img = document.createElement("img");
    img.src = botImg;
    img.alt = "bot";

    const typingDiv = document.createElement("div");
    typingDiv.classList.add("message", "typing");

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.classList.add("typing-dot");
        typingDiv.appendChild(dot);
    }

    wrapper.appendChild(img);
    wrapper.appendChild(typingDiv);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;

    return wrapper;
}

// VOICE INPUT (MICROPHONE BUTTON) INTEGRATION
const micBtn = document.getElementById("micBtn");
let recognition, listening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    micBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (!listening) {
            recognition.start();
        } else {
            recognition.stop();
        }
    });

    recognition.addEventListener("start", function () {
        listening = true;
        micBtn.classList.add("recording");
    });
    recognition.addEventListener("end", function () {
        listening = false;
        micBtn.classList.remove("recording");
    });
    recognition.addEventListener("result", function (event) {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        if (transcript) {
            userInput.value = transcript;
            chatForm.dispatchEvent(new Event('submit'));
        }
    });
} else {
    micBtn.style.display = 'none';
}

// DARK/LIGHT TOGGLE
$(document).ready(function () {
    if (localStorage.getItem("theme") === "light") {
        $("body").addClass("light");
        $(".moon").addClass("sun");
        $(".tdnn").addClass("day");
    }

    $(".tdnn").click(function () {
        $("body").toggleClass("light");
        $(".moon").toggleClass("sun");
        $(".tdnn").toggleClass("day");

        if ($("body").hasClass("light")) {
            localStorage.setItem("theme", "light");
        } else {
            localStorage.setItem("theme", "dark");
        }
    });
});
