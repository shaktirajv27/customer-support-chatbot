## Project Overview

This project is a **Flask-based customer support chatbot** with a modern single-page chat UI.  
It uses **Groq's chat completions API** as the LLM backend and stores **per-user conversation history on disk** to preserve context between messages.

### Main Responsibilities
- **Backend (`app.py`)**
  - Serves the main HTML page (`/` → `templates/index.html`).
  - Exposes a JSON chat endpoint at `/api/chat` that:
    - Accepts a user message.
    - Loads the user’s previous conversation from the `memory` folder.
    - Calls Groq to get the assistant reply with a fixed system prompt.
    - Appends both user and assistant turns (with timestamps) to the conversation.
    - Logs all turns to `logs/conversations.log`.
    - Returns `{ "reply": <assistant_text>, "timestamp": <ISO timestamp> }` to the frontend.
  - Creates `memory/` and `logs/` directories on startup if they do not exist.
  - Uses a **Flask session-based `user_id`** (timestamp-based string) to separate conversations per browser session.

- **Frontend (`templates/index.html`, `static/js/script.js`, `static/css/style.css`)**
  - Renders a **header** with logo and a **dark/light theme toggle**.
  - Contains:
    - A scrollable chat area (`div#chatBox`).
    - A single input form (`form#chatForm`) with one text field (`input#userInput`) and a submit button.
  - Uses **Fetch API** (and jQuery only for the theme toggle) to:
    - Send user messages to `/api/chat`.
    - Display user and bot messages with avatars, bubble styling, and timestamps.
    - Show a **typing indicator** while waiting for the backend reply.
  - Provides a **Discord-like styling** and dark/light theme persistence via `localStorage`.

- **Memory & Logs**
  - Each user session gets a unique `user_id` (timestamp string) stored in the Flask session cookie.
  - For each `user_id`, conversation turns are stored in a JSON file: `memory/chat_<user_id>.json`.
  - Logging of all conversations (both user messages and bot replies) goes into `logs/conversations.log` using Python’s `logging` module.

- **LLM Client (`Groq`)**
  - Configured globally in `app.py` via `Groq(api_key=os.environ.get("GROQ_API_KEY"))`.
  - Uses model `"openai/gpt-oss-20b"` by default and a fixed polite customer-support system prompt.
  - A separate helper module `chat_handler.py` also defines a reusable `ask_groq_conversation` function, though the main app currently uses its own implementation inside `app.py`.

---

## Backend: Detailed Description (`app.py`)

**Imports & Setup**
- Uses `Flask`, `render_template`, `request`, `jsonify`, and `session` for web handling.
- Uses `dotenv.load_dotenv()` to load `GROQ_API_KEY` and optional `PORT` from `.env` / environment.
- Configures Groq client:
  - `client = Groq(api_key=os.environ.get("GROQ_API_KEY"))`
- Defines a constant system prompt `DEFAULT_SYSTEM_PROMPT` that:
  - Sets the role as a **helpful, polite customer support assistant**.
  - Forces **English replies**.
  - Encourages **friendly tone** and **context awareness**.
- Creates the Flask app and random secret key:
  - `app = Flask(__name__)`
  - `app.secret_key = os.urandom(24)`
- Ensures directories:
  - `os.makedirs("memory", exist_ok=True)`
  - `os.makedirs("logs", exist_ok=True)`
- Configures `logging.basicConfig` to write timestamped logs to `logs/conversations.log`.

**Conversation Persistence Helpers**
- `save_memory(user_id, conversation)`
  - Writes the `conversation` list (Python objects) to `memory/chat_<user_id>.json` as pretty-printed UTF-8 JSON.
- `load_memory(user_id)`
  - Returns the previously saved conversation list for that `user_id` if the file exists; otherwise returns an empty list.

**LLM Call Helper**
- `ask_groq_conversation(conversation, model="openai/gpt-oss-20b")`
  - Prepares `messages_for_groq`:
    - Starts with `{ "role": "system", "content": DEFAULT_SYSTEM_PROMPT }`.
    - Appends all previous entries from `conversation` as `{ "role": msg["role"], "content": msg["content"] }`.
  - Calls `client.chat.completions.create(...)` with:
    - `messages=messages_for_groq`
    - `model=model`
    - `max_tokens=256`
    - `temperature=0.2` (low creativity / focused support-style answers).
  - Returns `response.choices[0].message.content` on success.
  - On any exception, returns a safe fallback string: `"Sorry — I could not get a response right now."`

**Routes**
- `GET /` (`index()`):
  - Renders `templates/index.html`, which loads CSS and JS.

- `POST /api/chat` (`chat()`):
  - Expects JSON body: `{ "message": "<user_message>" }`.
  - Validates: trims `message` and returns HTTP `400` with `{"error": "Message is required"}` if empty.
  - Session handling:
    - If no `"user_id"` in `session`, generates one based on current datetime: `YYYYMMDDHHMMSS`.
    - Uses this `user_id` to load the corresponding conversation with `load_memory`.
  - Appends user message:
    - `{ "role": "user", "content": message, "timestamp": "<formatted time>" }`
    - Timestamp format: `"%d-%b-%Y %I:%M %p"` (e.g., `30-Dec-2025 04:15 PM`).
  - Calls `ask_groq_conversation(conversation)` to get the assistant reply text.
  - Appends assistant reply with the same structure (role `"assistant"`).
  - Persists conversation with `save_memory(user_id, conversation)`.
  - Logs both user and bot messages to `logs/conversations.log`.
  - Returns JSON:
    - `{ "reply": <assistant_reply>, "timestamp": "<current datetime as str(datetime.now())>" }`
  - On error in the LLM call, user still gets a fallback reply string.

**App Entry Point**
- If run directly (`python app.py`):
  - Reads `PORT` from env (defaults to `5000`).
  - Runs Flask dev server with:
    - `host="0.0.0.0"`
    - `port=port`
    - `debug=True`

---

## Alternate LLM Helper Module (`chat_handler.py`)

- Defines a separate Groq client and LLM helper:
  - Loads `GROQ_API_KEY` from environment and initializes `Groq`.
  - Sets `system_prompt` similar to `DEFAULT_SYSTEM_PROMPT` (helpful, polite, context-aware support agent).
- `ask_groq_conversation(chat_history, model_name="openai/gpt-oss-20b")`:
  - Builds `msgs = [{"role": "system", "content": system_prompt}] + chat_history`.
  - Calls the Groq chat completions API with similar parameters (256 max tokens, temperature 0.2).
  - Returns a dict:
    - `"assistant"`: extracted text reply (or a fallback error message).
    - `"raw_response"`: full Groq API response object, or an error dictionary.
- Note: this module is **currently not imported/used** in `app.py` but could be used for refactoring or advanced scenarios.

---

## Frontend: HTML Structure (`templates/index.html`)

**Head Section**
- Includes:
  - Charset and viewport meta tags.
  - Title `"Customer Support Chatbot"`.
  - CSS: `{{ url_for('static', filename='css/style.css') }}`.
  - jQuery: `https://code.jquery.com/jquery-3.1.0.min.js` (used for theme toggling).

**Body Layout**
- `header.header`
  - Left: `.logo` with:
    - Logo image: `static/images/logo.png`.
    - Text label: `"Customer Support Chatbot"`.
  - Right: `.tdnn` (`theme day/night` toggle) containing a `.moon` element that visually changes between sun/moon based on theme.

- Main Chat Area:
  - `<div class="chat-box" id="chatBox"></div>`
    - This is where all chat messages (user & bot) are injected dynamically by JS.

- Chat Form:
  - `<form id="chatForm" class="chat-form">`
    - `<input type="text" id="userInput" placeholder="Type your message..." autocomplete="off">`
    - `<button type="submit">Send</button>`
  - Submitting this form triggers the JavaScript handler in `static/js/script.js`.

- Scripts:
  - `{{ url_for('static', filename='js/script.js') }}` at the end of `<body>` to initialize frontend behavior.

---

## Frontend: Behavior (`static/js/script.js`)

**DOM References & Assets**
- Gets references to:
  - `chatForm`, `userInput`, `chatBox` via `document.getElementById`.
- Defines image paths:
  - `userLogo = "/static/images/user-logo.png"`
  - `botLogo = "/static/images/bot-logo.png"`

**Form Submit Handler**
- `chatForm.addEventListener("submit", async (e) => { ... })`
  - Prevents default form submission.
  - Reads `msg = userInput.value.trim()` and returns early if empty.
  - Immediately calls `addMessage(msg, "user", userLogo, new Date())`:
    - Displays the user’s message in the chat with current time.
  - Clears the input field.
  - Adds a typing indicator: `const typingMsg = addTypingIndicator(botLogo);`
  - Sends a POST request using Fetch:
    - URL: `"/api/chat"`
    - Headers: `{ "Content-Type": "application/json" }`
    - Body: `JSON.stringify({ message: msg })`
  - Parses JSON response as `data`.
  - After a short random delay (0.5–1 second):
    - Removes the typing indicator.
    - Computes bot timestamp:
      - If `data.timestamp` exists: `new Date(data.timestamp)`
      - Otherwise: `new Date()` (fallback).
    - Calls `addMessage(data.reply || "Sorry, something went wrong.", "bot", botLogo, botTime);`
  - On network or other error:
    - Removes typing indicator.
    - Shows `"Sorry, something went wrong."` as bot message with current time.

**Message Rendering Helpers**
- `formatTime(date)`
  - Returns localized time as `"HH:MM"` 12/24h based on browser locale:
    - `date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`

- `addMessage(text, sender, imgPath, timestampDate)`
  - Creates a `.msg-wrapper` `div` with class `sender` (`"user"` or `"bot"`).
  - Adds:
    - `img` avatar with `src=imgPath`, `alt=sender`.
    - `.message` `div` with the text.
    - `.timestamp` `div` with formatted time.
  - Layout:
    - If `sender === "user"`:
      - Order: timestamp | message | image (aligned to the right).
    - Else (`"bot"`):
      - Order: image | message | timestamp (aligned to the left).
  - Appends to `chatBox` and auto-scrolls to bottom.
  - Returns the wrapper element.

- `addTypingIndicator(botImg)`
  - Creates a `.msg-wrapper.bot` with:
    - Bot avatar.
    - `.message.typing` `div` containing 3 `.typing-dot` spans.
  - Appends to `chatBox` and scrolls to bottom.
  - Returns the wrapper so it can be removed later when the reply arrives.

**Dark/Light Theme Toggle**
- Uses jQuery `$(document).ready(...)` to:
  - On load:
    - If `localStorage.getItem("theme") === "light"`:
      - Adds `body.light`, `.moon.sun`, and `.tdnn.day` to switch to light mode.
  - On `.tdnn` click:
    - Toggles:
      - `body.light`
      - `.moon.sun`
      - `.tdnn.day`
    - Stores `"light"` or `"dark"` in `localStorage` accordingly.

---

## Frontend: Styling (`static/css/style.css`)

**Global & Theme Variables**
- Global reset and `font-family: "Inter", sans-serif`.
- CSS variables (`:root`):
  - Colors for dark/light backgrounds and text.
  - Toggle switch dimensions and colors for night/day.

**Body & Theme**
- `body`:
  - Full viewport height, flex column.
  - Default dark background and text.
  - Smooth transitions for background and text colors.
- `body.light`:
  - Swaps to light theme colors.

**Header**
- `.header`:
  - Fixed at top, height 60px, full width.
  - Flex layout, spaced between logo and toggle.
  - Dark background with bottom border, transitions to white/light border in light mode.

**Theme Toggle (`.tdnn` and `.moon`)**
- `.tdnn`:
  - Rounded rectangle, background night/day color, clickable.
- `.moon`:
  - Circle inside `.tdnn`, styled to look like moon; transforms to sun (`.moon.sun`) with different box-shadows and positions.

**Chat Area**
- `.chat-box`:
  - Fills remaining height between header and input bar.
  - Scrollable (`overflow-y: auto`), flex-column with gap between messages.
  - Dark background by default, light background in `body.light`.
  - Custom scrollbars for dark theme.

**Messages**
- `.msg-wrapper`:
  - Flex-row container for each message.
  - `.msg-wrapper.bot`: left-aligned.
  - `.msg-wrapper.user`: right-aligned.
- Avatars (`.msg-wrapper img`):
  - Circular, 45x45.
- `.message`:
  - Bubble with max-width ~60%, padding, rounded corners, box shadow, and word wrapping.
- `.msg-wrapper.bot .message`:
  - Dark bubble, light text, Discord-like style in dark theme.
- `.msg-wrapper.user .message`:
  - Primary color background (blue/purple), white text.
- Hover state slightly adjusts background for feedback.
- Light theme overrides:
  - Bot messages become light-gray with dark text.
  - User messages use a bright blue.

**Typing Indicator**
- `.typing`:
  - Inline-flex layout with small gap between dots.
- `.typing-dot`:
  - Small circles animated via `@keyframes blink` for a “typing” effect.
  - Color changes in light mode to maintain contrast.

**Timestamps**
- `.timestamp`:
  - Small, muted text under/aside the message bubbles.
  - Right-aligned and slightly separated from the bubble.

**Input Bar**
- `.chat-form`:
  - Fixed at bottom, full width, flex layout.
  - Dark background with top border; becomes white in light theme.
- `.chat-form input`:
  - Flexible width, padded, rounded, dark background with white text by default.
  - Light theme: white background, dark text, and border.
- `.chat-form button`:
  - Prominent colored button with hover effect.

---

## Configuration & Dependencies

**Environment Variables**
- `GROQ_API_KEY` (required):
  - Groq API key for the chat completions.
- `PORT` (optional):
  - Port for the Flask app (defaults to `5000`).

**Python Dependencies (`requirements.txt`)**
- `flask` – Web framework for routing and templating.
- `groq` – Client SDK for Groq LLM API.
- `python-dotenv` – Loads environment variables from `.env`.
- `requests` – General HTTP client (not heavily used in core flow but available).
- `gunicorn` – WSGI HTTP server, likely for production deployment.

---

## Data & Logging

- **Conversation Files (`memory/`):**
  - File naming: `chat_<user_id>.json`.
  - Content format: list of message dicts with:
    - `role`: `"user"` or `"assistant"`.
    - `content`: text string.
    - `timestamp`: human-readable formatted timestamp.

- **Logs (`logs/conversations.log`):**
  - Text log file with each turn logged via `logging.info`:
    - `USER(<user_id>): <message>`
    - `BOT: <assistant_reply>`

---

## How a Typical Request Flows End-to-End

1. **User opens the app**
   - Browser loads `/` → `index.html`.
   - CSS and JS load; theme is applied from `localStorage` (`dark` or `light`).

2. **User sends a message**
   - User types into `#userInput` and submits the form.
   - JS:
     - Prevents page reload.
     - Immediately renders the user bubble in `#chatBox` with current time.
     - Shows a typing indicator bubble for the bot.
     - Sends a POST `/api/chat` with `{ "message": "<user text>" }`.

3. **Backend processes the message**
   - `chat()` route:
     - Validates message is non-empty.
     - Ensures a `user_id` exists in session.
     - Loads prior conversation for this `user_id`.
     - Appends a user entry with role, content, and formatted timestamp.
     - Calls `ask_groq_conversation` with the full conversation.
     - Receives assistant text (or fallback on error).
     - Appends assistant entry to the conversation.
     - Saves conversation back to `memory/chat_<user_id>.json`.
     - Logs both user and assistant messages.
     - Returns JSON `{ "reply": "<assistant_reply>", "timestamp": "<now>" }`.

4. **Frontend displays the reply**
   - JS receives the JSON.
   - After a simulated 0.5–1s delay:
     - Removes typing indicator.
     - Parses `timestamp` into a `Date` (or uses current time).
     - Creates a bot bubble with avatar, message text, and time.
     - Scrolls chat to bottom.

---

## Notes & Potential Extension Points

- **Mic / Voice Input (Planned Feature)**
  - A microphone button can be added near the input field in `index.html` and wired in `script.js` using the Web Speech API (`webkitSpeechRecognition` in Chrome) to:
    - Start/stop recording on button press.
    - Transcribe speech to text and populate `#userInput`, then programmatically submit the form.

- **Multi-User / Auth**
  - Currently, user identity is per-browser-session using a random timestamp `user_id`.  
  - Could be replaced with real authentication and a database for more robust multi-user support.

- **Refactoring**
  - `chat_handler.py` can be used to centralize the Groq call logic for reuse or testing.
  - Error handling on the frontend could be expanded (e.g., showing banners for network errors).

This file summarizes the full structure and behavior of the project to serve as a **single source of truth/context** for future development and integration.



