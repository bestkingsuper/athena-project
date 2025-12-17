require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'athena-new-ui.html'));
});

// API: Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error: GROQ_API_KEY missing' });
    }

    console.log(`📤 Sending to Groq API...`);

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
      console.error('❌ Groq error:', errorData);
      return res.status(groqResponse.status).json({ error: 'Groq API error', details: errorData });
    }

    const data = await groqResponse.json();
    console.log(`✅ Groq response received`);
    res.json(data);

  } catch (error) {
    console.error('❌ Chat error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// API: Voice endpoint
app.post('/api/voice', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      console.error('❌ ElevenLabs config missing');
      return res.status(500).json({ error: 'Server configuration error: ElevenLabs keys missing' });
    }

    console.log(`🔊 Generating voice...`);

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
      return res.status(elevenLabsResponse.status).json({ error: 'ElevenLabs API error' });
    }

    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    console.log(`✅ Voice generated (${audioBuffer.byteLength} bytes)`);

    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('❌ Voice error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`✅ API endpoints:`);
  console.log(`   - POST /api/chat`);
  console.log(`   - POST /api/voice`);
  console.log(`   - GET /api/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});
