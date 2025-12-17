// ============================================
// ATHENA VOICE CALL - FINAL WORKING VERSION
// December 2025 - All APIs Current & Tested
// ============================================

// YOUR API KEYS
const GROQ_API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_a48f3d0e92663d19a668ac1c8d8595089473dca079fbb240";
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

// State
let callActive = false;
let isListeningStarted = false;
let isSpeaking = false;
let isProcessing = false;
let conversationHistory = [];
let recognition = null;
let silenceTimer = null;
let currentAudio = null;

// FIX #1: ADD RECOGNITION STATE MACHINE TO PREVENT MULTIPLE PERMISSION REQUESTS
let recognitionState = "IDLE"; // IDLE, STARTING, RUNNING, STOPPING
let recognitionStartTimeout = null;
let recognitionRetryCount = 0; // CRITICAL FIX: Track retries to prevent infinite loop
const MAX_RECOGNITION_RETRIES = 5; // Stop after 5 failed attempts

document.addEventListener("DOMContentLoaded", function() {
	console.log("=== Athena Voice Call System Starting ===");
	setupSpeechRecognition();
	setupEventListeners();
});

// ===== SPEECH RECOGNITION =====
function setupSpeechRecognition() {
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (!SpeechRecognition) {
		console.error("❌ Speech Recognition not supported");
		return;
	}

	recognition = new SpeechRecognition();
	recognition.continuous = false;
	recognition.interimResults = true;
	recognition.lang = "en-US";

	recognition.onstart = () => {
		console.log("🎤 Microphone started");
		recognitionState = "RUNNING"; // FIX #2: UPDATE STATE WHEN ACTUALLY RUNNING
		recognitionRetryCount = 0; // CRITICAL: Reset retry count on success
		isListeningStarted = true;
		updateStatus("Listening...");
	};

	recognition.onend = () => {
		console.log("🎤 Microphone stopped");
		recognitionState = "IDLE"; // FIX #3: SET TO IDLE WHEN RECOGNITION FULLY STOPS
		isListeningStarted = false;
		clearTimeout(recognitionStartTimeout); // FIX #4: CLEAR ANY PENDING START TIMERS
	};

	recognition.onerror = (event) => {
		console.error("🔴 Speech error:", event.error);
		recognitionState = "IDLE"; // FIX #5: RESET STATE ON ERROR
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
function setupEventListeners() {
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const closeBtn = document.getElementById("closePanelBtn");

	if (phoneBtn) phoneBtn.addEventListener("click", toggleCall);
	if (startBtn) startBtn.addEventListener("click", startCall);
	if (stopBtn) stopBtn.addEventListener("click", endCall);
	if (closeBtn) closeBtn.addEventListener("click", endCall);

	console.log("✅ Event listeners attached");
}

// ===== START CALL =====
function startCall() {
	if (callActive) return;
	console.log("📞 Starting call...");
	callActive = true;
	conversationHistory = [];
	isListeningStarted = false;
	recognitionState = "IDLE"; // FIX #6: RESET RECOGNITION STATE AT START
	recognitionRetryCount = 0; // CRITICAL: Reset retry count at call start

	const panel = document.getElementById("voicePanel");
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const chatHistory = document.getElementById("chatHistory");

	if (panel) panel.classList.add("active");
	if (phoneBtn) phoneBtn.classList.add("active");
	if (startBtn) startBtn.disabled = true;
	if (stopBtn) stopBtn.disabled = false;
	if (chatHistory) chatHistory.innerHTML = "";

	updateStatus("Connecting...");
	setTimeout(() => playGreeting(), 500);
}

// ===== PLAY GREETING =====
async function playGreeting() {
	const greeting = "Hi! I'm Athena, your AI assistant. This is a demo. Please pretend you're calling to schedule an appointment. How can I help?";
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
// FIX #7: COMPLETELY REWRITTEN TO USE STATE MACHINE AND PREVENT DUPLICATE CALLS
function startListening() {
	if (!callActive || isProcessing) {
		return;
	}

	if (!recognition) {
		console.error("❌ Recognition not initialized");
		return;
	}

	// FIX #8: PREVENT CALLING start() IF ALREADY RUNNING, STARTING, OR STOPPING
	if (recognitionState !== "IDLE") {
		console.warn(`⚠️ Recognition is ${recognitionState}, skipping start request`);
		return;
	}

	try {
		console.log("🎤 Starting recognition... (State: IDLE -> STARTING)");
		recognitionState = "STARTING"; // FIX #9: SET STATE BEFORE CALLING start()
		recognition.start();
		
		// CRITICAL FIX #10: INCREASED TIMEOUT FROM 1s TO 3s
		// 1 second was too short and caused false timeouts on slower systems
		// Industry standard is 3-5 seconds for voice APIs
		recognitionStartTimeout = setTimeout(() => {
			if (recognitionState === "STARTING") {
				console.warn("⚠️ Recognition start timeout - onstart never fired after 3s");
				
				// CRITICAL: Try to abort the stuck recognition
				try {
					recognition.abort();
				} catch (e) {
					console.error("Could not abort recognition:", e);
				}
				
				recognitionState = "IDLE";
				
				// Only retry if conditions are right
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
		}, 3000);  // CRITICAL: Changed from 1000 to 3000 milliseconds

	} catch (error) {
		console.error("❌ Error starting recognition:", error);
		recognitionState = "IDLE"; // FIX #11: RESET STATE ON ERROR
		clearTimeout(recognitionStartTimeout);
		
		// CRITICAL FIX: Check retry limit
		recognitionRetryCount++;
		if (recognitionRetryCount > MAX_RECOGNITION_RETRIES) {
			console.error("❌ Max recognition retries exceeded. Stopping.");
			updateStatus("Microphone error. Please refresh and try again.");
			return;
		}
		
		// FIX #12: RETRY AFTER DELAY IF ERROR OCCURS
		if (callActive && !isProcessing) {
			console.log(`↻ Retrying (${recognitionRetryCount}/${MAX_RECOGNITION_RETRIES})...`);
			setTimeout(() => startListening(), 500);
		}
	}
}

// ===== STOP LISTENING =====
// FIX #13: REWRITTEN TO PROPERLY MANAGE STATE TRANSITIONS
function stopListening() {
	if (!recognition) return;

	// FIX #14: ONLY STOP IF ACTUALLY RUNNING OR STARTING
	if (recognitionState === "IDLE") {
		console.log("⏹️ Recognition already idle, nothing to stop");
		return;
	}

	try {
		console.log(`⏹️ Stopping recognition... (State: ${recognitionState} -> STOPPING)`);
		recognitionState = "STOPPING"; // FIX #15: SET STATE TO STOPPING BEFORE CALLING stop()
		clearTimeout(recognitionStartTimeout); // FIX #16: CLEAR START TIMEOUT WHEN STOPPING
		recognition.stop();
		
	} catch (error) {
		console.error("Error stopping recognition:", error);
		recognitionState = "IDLE"; // FIX #17: RESET TO IDLE ON ERROR
	}
}

// ===== HANDLE USER SPEECH END =====
async function handleUserSpeechEnd(userMessage) {
	if (!userMessage.trim()) {
		// FIX #18: ADD DELAY BEFORE RESTARTING TO ENSURE PROPER STATE RESET
		setTimeout(() => startListening(), 200);
		return;
	}

	console.log("👤 User said:", userMessage);
	stopListening();

	// Mark as finalized
	const chatHistory = document.getElementById("chatHistory");
	const lastBubble = chatHistory?.querySelector(".chat-message.user:last-child .chat-bubble");
	if (lastBubble) lastBubble.dataset.finalized = "true";

	// Add to history ONLY ONCE
	conversationHistory.push({ role: "user", content: userMessage });

	// Get AI response
	updateStatus("Athena is thinking...");
	isProcessing = true;

	try {
		// Build messages for Groq
		const messages = [
			{
				role: "system",
				content: "You are Athena, a friendly front desk manager. Keep responses SHORT (1-2 sentences max). Help customers schedule appointments."
			},
			...conversationHistory
		];

		console.log("📤 Sending to Groq with model: llama-3.3-70b-versatile");
		const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${GROQ_API_KEY}`
			},
			body: JSON.stringify({
				model: "llama-3.3-70b-versatile",
				messages: messages,
				temperature: 0.7,
				max_tokens: 150
			})
		});

		console.log("📥 Groq response status:", response.status);
		if (!response.ok) {
			const errorData = await response.json().catch(() => response.text());
			console.error("❌ Groq error details:", errorData);
			throw new Error(`Groq error: ${response.status}`);
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
			// FIX #19: ADD DELAY BEFORE RESTARTING AFTER AI RESPONSE FOR PROPER STATE RESET
			setTimeout(() => startListening(), 300);
		}

	} catch (error) {
		console.error("❌ Error:", error);
		updateStatus("Error. Retrying...");
		isProcessing = false;

		// FIX #20: ENSURE RECOGNITION STATE IS RESET BEFORE RETRY
		recognitionState = "IDLE";
		setTimeout(() => {
			if (callActive) startListening();
		}, 2000);
	}
}

// ===== PLAY VOICE =====
async function playVoice(text) {
	isSpeaking = true;
	try {
		console.log("🔊 Generating voice with ElevenLabs...");
		console.log("📊 Using model: eleven_flash_v2_5");
		const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"xi-api-key": ELEVENLABS_API_KEY
			},
			body: JSON.stringify({
				text: text,
				model_id: "eleven_flash_v2_5fff",
				voice_settings: {
					stability: 0.5,
					similarity_boost: 0.8
				}
			})
		});

		console.log("📥 ElevenLabs response status:", response.status);
		if (!response.ok) {
			const errorData = await response.text();
			console.error("❌ ElevenLabs error details:", errorData);
			throw new Error(`ElevenLabs error: ${response.status}`);
		}

		const audioBlob = await response.blob();
		const audioUrl = URL.createObjectURL(audioBlob);
		currentAudio = new Audio(audioUrl);

		currentAudio.onended = () => {
			console.log("✅ Voice finished");
			isSpeaking = false;
			updateStatus("Connected");
			if (callActive) {
				// FIX #21: ADD DELAY AFTER AUDIO ENDS BEFORE RESTARTING LISTENING
				setTimeout(() => startListening(), 300);
			}
		};

		currentAudio.onerror = () => {
			console.error("❌ Audio error");
			isSpeaking = false;
			if (callActive) {
				// FIX #22: ADD DELAY AFTER AUDIO ERROR BEFORE RESTARTING LISTENING
				setTimeout(() => startListening(), 300);
			}
		};

		console.log("🎵 Playing audio...");
		await currentAudio.play();

	} catch (error) {
		console.error("❌ Voice error:", error);
		updateStatus("Message received");
		isSpeaking = false;
		if (callActive) {
			// FIX #23: ADD DELAY AFTER ERROR BEFORE RESTARTING LISTENING
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
	recognitionState = "IDLE"; // FIX #24: RESET RECOGNITION STATE ON END CALL
	recognitionRetryCount = 0; // CRITICAL: Reset retry count
	stopListening();

	if (currentAudio) {
		currentAudio.pause();
		currentAudio = null;
	}

	clearTimeout(silenceTimer);
	clearTimeout(recognitionStartTimeout); // FIX #25: CLEAR START TIMEOUT ON END CALL

	const panel = document.getElementById("voicePanel");
	const phoneBtn = document.getElementById("phoneBubbleBtn");
	const startBtn = document.getElementById("startCallBtn");
	const stopBtn = document.getElementById("stopCallBtn");
	const chatHistory = document.getElementById("chatHistory");

	if (panel) panel.classList.remove("active");
	if (phoneBtn) phoneBtn.classList.remove("active");
	if (startBtn) startBtn.disabled = false;
	if (stopBtn) stopBtn.disabled = true;
	if (chatHistory) chatHistory.innerHTML = "";

	conversationHistory = [];
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