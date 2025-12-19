// ============================================
// ATHENA VOICE CALL - FRONTEND (для веб-сайта)
// Безопасная версия без API ключей
// ============================================

// State
let callActive = false;
let isListeningStarted = false;
let isSpeaking = false;
let isProcessing = false;
let conversationHistory = [];
let recognition = null;
let silenceTimer = null;
let currentAudio = null;

// ВАЖНО: Не храним API ключи здесь!
// Все API запросы идут через наш backend (/api/chat, /api/voice)

let recognitionState = "IDLE";
let recognitionStartTimeout = null;
let recognitionRetryCount = 0;
const MAX_RECOGNITION_RETRIES = 5;

document.addEventListener("DOMContentLoaded", function() {
	console.log("=== Athena Voice Call System Starting ===");
	
	// Проверка HTTPS (обязателен для микрофона)
	if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
		console.warn("⚠️ Warning: HTTPS required for microphone access in production");
	}
	
	// Проверка поддержки Web Speech API
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (!SpeechRecognition) {
		console.error("❌ Web Speech API not supported in this browser");
		alert("Ваш браузер не поддерживает веб-микрофон. Используйте Chrome, Edge или другой современный браузер.");
		return;
	}
	
	setupSpeechRecognition();
	setupEventListeners();
});

// ===== SPEECH RECOGNITION =====
function setupSpeechRecognition() {
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (!SpeechRecognition) return;

	recognition = new SpeechRecognition();
	recognition.continuous = false;
	recognition.interimResults = true;
	recognition.lang = "en-US";

	recognition.onstart = () => {
		console.log("🎤 Microphone started");
		recognitionState = "RUNNING";
		recognitionRetryCount = 0;
		isListeningStarted = true;
		updateStatus("Listening...");
		document.getElementById('stopCallBtn')?.classList.add('user-speaking');
	};

	recognition.onend = () => {
		console.log("🎤 Microphone stopped");
		recognitionState = "IDLE";
		isListeningStarted = false;
		clearTimeout(recognitionStartTimeout);
		document.getElementById('stopCallBtn')?.classList.remove('user-speaking');
	};

	recognition.onerror = (event) => {
		console.error("🔴 Speech error:", event.error);
		recognitionState = "IDLE";
		isListeningStarted = false;
		clearTimeout(recognitionStartTimeout);
	};

	recognition.onresult = (event) => {
		let transcript = "";
		for (let i = event.resultIndex; i < event.results.length; i++) {
			transcript += event.results[i][0].transcript;
		}

		const chatHistory = document.getElementById("chatHistory");
		if (chatHistory && transcript) {
			let lastBubble = chatHistory.querySelector(".chat-message.user:last-child .chat-bubble");
			if (!lastBubble || lastBubble.dataset.finalized === "true") {
				const div = document.createElement("div");
				div.className = "chat-message user";
				const bubble = document.createElement("div");
				bubble.className = "chat-bubble";
				bubble.dataset.finalized = "false";
				bubble.textContent = transcript;
				div.appendChild(bubble);
				chatHistory.appendChild(div);
				chatHistory.scrollTop = chatHistory.scrollHeight;
			} else {
				lastBubble.textContent = transcript;
			}
		}

		clearTimeout(silenceTimer);
		if (event.results[event.results.length - 1].isFinal) {
			silenceTimer = setTimeout(() => {
				handleUserSpeechEnd(transcript);
			}, 3000);
		}
	};

	console.log("✅ Speech Recognition initialized");
}

// ===== EVENT LISTENERS =====
// ===== EVENT LISTENERS =====

function setupEventListeners() {
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const closeBtn = document.getElementById("closePanelBtn");
  
	if (phoneBtn) phoneBtn.addEventListener("click", toggleCall);
	if (startBtn) startBtn.addEventListener("click", startCall);
  
	if (stopBtn) stopBtn.addEventListener("click", endCall);
	if (closeBtn) closeBtn.addEventListener("click", endCall); // This makes the 'X' button work like hang up
  
	console.log("✅ Event listeners attached");
  }
  

// ===== START CALL =====
function startCall() {
	if (callActive) return;
	console.log("📞 Starting call...");
	callActive = true;
	conversationHistory = [];
	isListeningStarted = false;
	recognitionState = "IDLE";
	recognitionRetryCount = 0;

	const panel = document.getElementById("voicePanel");
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const chatHistory = document.getElementById("chatHistory");

	if (panel) panel.classList.add("active");
	if (phoneBtn) phoneBtn.classList.remove("active");
	if (startBtn) startBtn.disabled = true;
	if (stopBtn) stopBtn.disabled = false;
	if (chatHistory) chatHistory.innerHTML = "";

	updateStatus("Connecting...");
	setTimeout(() => playGreeting(), 500);
}

// ===== PLAY GREETING =====
async function playGreeting() {
	// The greeting will come from Groq with the full business context
	const greeting = "Hi! I'm Athena, your AI assistant. This is a demo. Please pretend you're calling to schedule an appointment for your dog. How can I help?";
	displayMessage(greeting, "ai");
	conversationHistory.push({ role: "assistant", content: greeting });
	console.log("🎤 Playing greeting...");
	await playVoice(greeting);
	if (callActive && !isSpeaking) {
	  console.log("🎧 Starting to listen after greeting");
	  startListening();
	}
  }
  

// ===== START LISTENING =====
function startListening() {
	if (!callActive || isProcessing) {
		return;
	}

	if (!recognition) {
		console.error("❌ Recognition not initialized");
		return;
	}

	if (recognitionState !== "IDLE") {
		console.warn(`⚠️ Recognition is ${recognitionState}, skipping start request`);
		return;
	}

	try {
		console.log("🎤 Starting recognition... (State: IDLE -> STARTING)");
		recognitionState = "STARTING";
		recognition.start();
		
		recognitionStartTimeout = setTimeout(() => {
			if (recognitionState === "STARTING") {
				console.warn("⚠️ Recognition start timeout - onstart never fired after 3s");
				
				try {
					recognition.abort();
				} catch (e) {
					console.error("Could not abort recognition:", e);
				}
				
				recognitionState = "IDLE";
				
				if (callActive && !isProcessing && recognitionRetryCount < MAX_RECOGNITION_RETRIES) {
					console.log(`🔄 Retrying recognition (attempt ${recognitionRetryCount + 1}/${MAX_RECOGNITION_RETRIES})...`);
					setTimeout(() => {
						if (callActive && recognitionState === "IDLE") {
							startListening();
						}
					}, 500);
				} else if (recognitionRetryCount >= MAX_RECOGNITION_RETRIES) {
					console.error("❌ Max recognition retries exceeded");
					updateStatus("Microphone error. Please try again.");
				}
			}
		}, 3000);

	} catch (error) {
		console.error("❌ Error starting recognition:", error);
		recognitionState = "IDLE";
		clearTimeout(recognitionStartTimeout);
		
		recognitionRetryCount++;
		if (recognitionRetryCount > MAX_RECOGNITION_RETRIES) {
			console.error("❌ Max recognition retries exceeded. Stopping.");
			updateStatus("Microphone error. Please refresh and try again.");
			return;
		}
		
		if (callActive && !isProcessing) {
			console.log(`↻ Retrying (${recognitionRetryCount}/${MAX_RECOGNITION_RETRIES})...`);
			setTimeout(() => startListening(), 500);
		}
	}
}

// ===== STOP LISTENING =====
function stopListening() {
	if (!recognition) return;

	if (recognitionState === "IDLE") {
		console.log("⏹️ Recognition already idle, nothing to stop");
		return;
	}

	try {
		console.log(`⏹️ Stopping recognition... (State: ${recognitionState} -> STOPPING)`);
		recognitionState = "STOPPING";
		clearTimeout(recognitionStartTimeout);
		recognition.stop();
		
	} catch (error) {
		console.error("Error stopping recognition:", error);
		recognitionState = "IDLE";
	}
}

// ===== HANDLE USER SPEECH END =====
async function handleUserSpeechEnd(userMessage) {
	if (!userMessage.trim()) {
		setTimeout(() => startListening(), 200);
		return;
	}

	console.log("👤 User said:", userMessage);
	stopListening();

	const chatHistory = document.getElementById("chatHistory");
	const lastBubble = chatHistory?.querySelector(".chat-message.user:last-child .chat-bubble");
	if (lastBubble) lastBubble.dataset.finalized = "true";

	conversationHistory.push({ role: "user", content: userMessage });

	updateStatus("Athena is thinking...");
	isProcessing = true;

	try {
		const messages = [
			{
				role: "system",
				content: "You are Athena, a friendly front desk manager. Keep responses SHORT (1-2 sentences max). Help customers schedule appointments."
			},
			...conversationHistory
		];

		console.log("📤 Sending to backend API");
		
		// ✅ ВАЖНО: Отправляем на ВАШ BACKEND, не на Groq!
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ messages: messages })
		});

		console.log("📥 Backend response status:", response.status);
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			console.error("❌ Backend error:", errorData);
			throw new Error(`Backend error: ${response.status}`);
		}

		const data = await response.json();
		const aiMessage = data.choices[0].message.content;
		console.log("🤖 AI says:", aiMessage);
		conversationHistory.push({ role: "assistant", content: aiMessage });
		displayMessage(aiMessage, "ai");
		updateStatus("Athena is speaking...");
		await playVoice(aiMessage);
		isProcessing = false;
		updateStatus("Connected");

		if (callActive) {
			console.log("🎧 Resuming listening...");
			setTimeout(() => startListening(), 300);
		}

	} catch (error) {
		console.error("❌ Error:", error);
		updateStatus("Error. Retrying...");
		isProcessing = false;

		recognitionState = "IDLE";
		setTimeout(() => {
			if (callActive) startListening();
		}, 2000);
	}
}

// ===== PLAY VOICE =====
async function playVoice(text) {
	isSpeaking = true;
	document.getElementById('avatarContainer')?.classList.add('speaking'); // <-- ADD THIS LINE
	try {
		console.log("🔊 Generating voice...");
		
		// ✅ ВАЖНО: Отправляем на ВАШ BACKEND, не на ElevenLabs!
		const response = await fetch("/api/voice", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ text: text })
		});

		console.log("📥 Voice API response status:", response.status);
		if (!response.ok) {
			throw new Error(`Voice API error: ${response.status}`);
		}

		const audioBlob = await response.blob();
		const audioUrl = URL.createObjectURL(audioBlob);
		currentAudio = new Audio(audioUrl);

		currentAudio.onended = () => {
			console.log("✅ Voice finished");
			isSpeaking = false;
			document.getElementById('avatarContainer')?.classList.remove('speaking'); // <-- ADD THIS LINE
			updateStatus("Connected");
			if (callActive) {
				setTimeout(() => startListening(), 300);
			}
		};

		currentAudio.onerror = () => {
			console.error("❌ Audio error");
			isSpeaking = false;
			if (callActive) {
				setTimeout(() => startListening(), 300);
			}
		};

		console.log("🎵 Playing audio...");
		
		// Обработка блокирования автоплея
		currentAudio.play().catch(error => {
			console.warn("⚠️ Autoplay blocked by browser:", error);
			isSpeaking = false;
			if (callActive) {
				setTimeout(() => startListening(), 300);
			}
		});

	} catch (error) {
		console.error("❌ Voice error:", error);
		updateStatus("Message received");
		isSpeaking = false;
		if (callActive) {
			setTimeout(() => startListening(), 300);
		}
	}
}

// ===== DISPLAY MESSAGE =====
function displayMessage(message, sender) {
	const chatHistory = document.getElementById("chatHistory");
	if (!chatHistory) return;

	const div = document.createElement("div");
	div.className = `chat-message ${sender}`;
	const bubble = document.createElement("div");
	bubble.className = "chat-bubble";
	bubble.textContent = message;
	bubble.dataset.finalized = "true";
	div.appendChild(bubble);
	chatHistory.appendChild(div);
	chatHistory.scrollTop = chatHistory.scrollHeight;
	console.log(`💬 ${sender === "ai" ? "AI" : "User"}: ${message}`);
}

// ===== UPDATE STATUS =====
function updateStatus(message) {
	const status = document.getElementById("chatStatus");
	if (status) status.textContent = message;
	console.log(`📊 Status: ${message}`);
}

// ===== END CALL =====
function endCall() {
	console.log("🛑 Ending call...");
	callActive = false;
	isProcessing = false;
	isSpeaking = false;
	recognitionState = "IDLE";
	recognitionRetryCount = 0;
	stopListening();

	if (currentAudio) {
		currentAudio.pause();
		currentAudio = null;
	}

	clearTimeout(silenceTimer);
	clearTimeout(recognitionStartTimeout);

	const panel = document.getElementById("voicePanel");
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const chatHistory = document.getElementById("chatHistory");

	panel.classList.remove("active");
	phoneBtn.classList.add("active");
	if (startBtn) startBtn.disabled = false;
	if (stopBtn) stopBtn.disabled = true;
	if (chatHistory) chatHistory.innerHTML = "";

	conversationHistory = [];
	document.getElementById('stopCallBtn')?.classList.remove('user-speaking');
	updateStatus("Call ended");
}

// ===== TOGGLE CALL =====
function toggleCall() {
	if (callActive) {
		endCall();
	} else {
		startCall();
	}
}

// ===========================================
// NEW TEXT CHAT LOGIC
// ===========================================

let isChatOpen = false;
let textConversationHistory = [];

// Initialize Chat Listeners
const chatBtn = document.getElementById("chatModeBtn");
const chatInput = document.getElementById("textChatInput");
const chatSendBtn = document.getElementById("textChatSendBtn");

if (chatBtn) chatBtn.addEventListener("click", toggleTextChat);
if (chatSendBtn) chatSendBtn.addEventListener("click", handleTextSend);
if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleTextSend();
    });
}

function toggleTextChat() {
    const chatPanel = document.getElementById("textChatPanel");
    
    if (!isChatOpen) {
        // OPEN CHAT
        console.log("💬 Opening Text Chat...");
        isChatOpen = true;
        chatPanel.classList.add("active");
        chatBtn.classList.add("active"); // Turns button red/active
        
        // Hide Voice Panel if open
        if (callActive) {
            endCall(); // This will close the voice panel
        }
        
        // Start New Conversation & Get Greeting
        startNewTextConversation();
        
    } else {
        // CLOSE CHAT
        console.log("💬 Closing Text Chat...");
        isChatOpen = false;
        chatPanel.classList.remove("active");
        chatBtn.classList.remove("active");
    }
}

async function startNewTextConversation() {
	const messagesContainer = document.getElementById("textChatMessages");
	messagesContainer.innerHTML = ""; // Clear history
	textConversationHistory = [];
  
	// Add "Typing..." indicator
	addMessageToUI("...", "ai", true);
  
	// Generate Greeting from AI with full business context
	try {
	  // Send empty user message to trigger system prompt greeting
	  const initialMessages = [
		{
		  role: "user",
		  content: "Say hello and introduce yourself as Athena, the AI front desk manager for D's Doggy Daycare. Ask me to pretend I'm calling to schedule an appointment."
		}
	  ];
  
	  const response = await fetch("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages: initialMessages })
	  });
  
	  const data = await response.json();
	  const aiGreeting = data.choices[0].message.content;
  
	  // Remove typing indicator and show message
	  removeTypingIndicator();
	  addMessageToUI(aiGreeting, "ai");
	  
	  // Initialize conversation history with the greeting
	  textConversationHistory.push({ role: "assistant", content: aiGreeting });
  
	} catch (error) {
	  console.error("Error getting greeting:", error);
	  removeTypingIndicator();
	  addMessageToUI("Hi! I'm Athena, your AI assistant. How can I help you schedule an appointment for your dog?", "ai");
	}
  }
  
async function handleTextSend() {
    const input = document.getElementById("textChatInput");
    const userText = input.value.trim();
    
    if (!userText) return;
    
    // 1. Display User Message
    addMessageToUI(userText, "user");
    input.value = "";
    textConversationHistory.push({ role: "user", content: userText });
    
    // 2. Show Typing Indicator
    addMessageToUI("...", "ai", true);
    
    // 3. Call API
    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: textConversationHistory })
        });
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        // 4. Display AI Response
        removeTypingIndicator();
        addMessageToUI(aiResponse, "ai");
        textConversationHistory.push({ role: "assistant", content: aiResponse });
        
    } catch (error) {
        console.error("Chat Error:", error);
        removeTypingIndicator();
        addMessageToUI("Sorry, I'm having trouble connecting right now.", "ai");
    }
}

// UI Helpers
function addMessageToUI(text, sender, isTyping = false) {
    const container = document.getElementById("textChatMessages");
    const div = document.createElement("div");
    div.className = `message ${sender} ${isTyping ? 'typing-indicator' : ''}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
    const typing = document.querySelector(".typing-indicator");
    if (typing) typing.remove();
}
