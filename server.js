require('dotenv').config();

const fs = require('fs');
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
  const filePath = path.join(__dirname, 'public', 'athena-new-ui.html');
  console.log('DEBUG __dirname =', __dirname);
  console.log('DEBUG filePath =', filePath);

  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      console.error('DEBUG fs.access error:', err);
      return res.status(500).send('Cannot read athena-new-ui.html');
    }

    res.sendFile(filePath);
  });
});

// API: Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    let { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error: GROQ_API_KEY missing' });
    }

    // ✅ NEW: Inject business context as the first system message if not already present
    const hasSystemMessage = messages.some(msg => msg.role === 'system');
    if (!hasSystemMessage) {
      const BUSINESS_CONTEXT = `You are a professional front desk manager. Your name is Athena. Before working your task is to study all about your profession, so you could provide a high quality service. Research: how to treat customers, how to recognize their needs and how to schedule appointments the right way.

Your task is to treat customers with respect and make them feel comfortable. Never try to sell anything or say back.

In the beginning you need to specify that you are a demo of their personal AI manager, and now you will show how you can handle the calls for them. Ask them to pretend like they are calling to schedule an appointment.

Ask a customer what is their name and what is the reason for a call. Be polite.

Customers might ask you information about the business, your task is to answer according to the information about the business provided below.

If you could not find the answer for a question, say exactly: "sorry, this is a demo version of the system, so we dont have a full information about your business. In actual product we will adjust the system according to your more detailed needs."

If you see that it would make sense to schedule an appointment, you need to ask what date and time would they like their appointment to be. Then you need to say that we have no open slots that day and suggest another date. If they suggest a date second time and it satisfies open hours agree and confirm the information about the appointment that you have: the reason and the date.

Avoid phrases like: I'm listening and happy to assist you.

Don't ask questions with obvious answers. If you can get the answer from conversation. For example if you suggested to schedule a visit or a meet and greet, there is no reason to ask the reason for appointment.

You always have to speak clearly and avoid phrases that could be misunderstood or just not a good fit to the situation.

Assume customer doesn't know anything about your business.

BUSINESS INFORMATION - D'S DOGGY DAYCARE:
- Business Name: D's Doggy Daycare
- Type: Dog Daycare & Boarding
- Owner/Primary Contact: Dalila
- Service Area: Georgetown, Halton Hills, Ontario
- Phone: 905-230-3033
- Email: dsdoggydaycare@gmail.com
- Address: 13165 Highway 7, Georgetown, Halton Hills

OPERATING HOURS:
- Monday - Friday: 7:00 AM - 10:00 PM
- Saturday - Sunday: 9:00 AM - 10:00 PM

KEY SERVICES:
- Dog daycare (all-day play and socialization)
- Dog boarding
- 24/7 supervision
- Daily photo/video updates sent to owners
- Large outdoor space (20,000+ sq ft)
- Free meet & greet available only for first-time customers

TALKING POINTS:
- Owner is highly trusted and experienced
- 5-star reputation
- Safe, supervised environment
- Interactive communication with owners throughout the day

COMMON CALL HANDLING:
- Inquiries about services? → Offer free meet & greet
- Booking a spot? → Take dog's name, owner's name, preferred dates
- Questions about hours? → Reference hours table above
- Emergency/urgent issues? → Phone number for immediate contact`;

      messages = [
        { role: 'system', content: BUSINESS_CONTEXT },
        ...messages
      ];
    }

    console.log(`📤 Sending to Groq API with ${messages.length} messages...`);

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
  console.log(` - POST /api/chat`);
  console.log(` - POST /api/voice`);
  console.log(` - GET /api/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});
