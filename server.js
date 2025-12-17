// ============================================
// ATHENA BACKEND - SECURE SERVER
// Node.js + Express
// Правильный способ для веб-хостинга
// ============================================

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====

//限制запросы (Rate limiting)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 минут
    max: 100,                   // 100 запросов на IP
    message: 'Слишком много запросов с этого IP адреса'
});

// CORS только для вашего домена
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://example.com'  // Замените на ваш домен!
        : 'http://localhost:3000',
    methods: ['POST', 'GET'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));  // Статичные файлы (HTML, CSS, JS)
app.use(limiter);
app.use(cors(corsOptions));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// ===== API ENDPOINTS =====

/**
 * POST /api/chat
 * Отправляет сообщение в Groq API
 * 
 * Body: { messages: Array<{role, content}> }
 * Response: { choices: Array<{message: {content}}>}
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        // Валидация
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid messages format' });
        }

        if (!process.env.GROQ_API_KEY) {
            console.error('❌ GROQ_API_KEY not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        console.log(`📤 Sending chat request to Groq with ${messages.length} messages`);

        // Запрос к Groq API
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                temperature: 0.7,
                max_tokens: 150
            })
        });

        if (!groqResponse.ok) {
            const errorData = await groqResponse.json().catch(() => ({}));
            console.error('❌ Groq API error:', errorData);
            return res.status(groqResponse.status).json({ 
                error: 'Groq API error',
                details: errorData 
            });
        }

        const data = await groqResponse.json();
        console.log(`✅ Groq response received`);
        res.json(data);

    } catch (error) {
        console.error('❌ Chat endpoint error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * POST /api/voice
 * Генерирует аудио с помощью ElevenLabs API
 * 
 * Body: { text: string }
 * Response: Audio file (mp3)
 */
app.post('/api/voice', async (req, res) => {
    try {
        const { text } = req.body;

        // Валидация
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required' });
        }

        if (text.length > 5000) {
            return res.status(400).json({ error: 'Text too long (max 5000 chars)' });
        }

        if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
            console.error('❌ ElevenLabs configuration missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        console.log(`🔊 Generating voice for text: "${text.substring(0, 50)}..."`);

        // Запрос к ElevenLabs API
        const elevenLabsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_flash_v2_5',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8
                    }
                })
            }
        );

        if (!elevenLabsResponse.ok) {
            const errorText = await elevenLabsResponse.text();
            console.error('❌ ElevenLabs error:', errorText);
            return res.status(elevenLabsResponse.status).json({ 
                error: 'ElevenLabs API error' 
            });
        }

        // Получить аудио как buffer
        const audioBuffer = await elevenLabsResponse.arrayBuffer();
        console.log(`✅ Voice generated (${audioBuffer.byteLength} bytes)`);

        // Отправить как audio/mpeg
        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Length', audioBuffer.byteLength);
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error('❌ Voice endpoint error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// ===== HEALTH CHECK =====

/**
 * GET /api/health
 * Проверка статуса сервера
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===== 404 HANDLER =====

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ===== START SERVER =====

app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ API endpoints:`);
    console.log(`   - POST /api/chat (Chat with AI)`);
    console.log(`   - POST /api/voice (Generate voice)`);
    console.log(`   - GET /api/health (Health check)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});
