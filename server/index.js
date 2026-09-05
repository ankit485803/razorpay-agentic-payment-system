
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Razorpay from 'razorpay';
import { runAgent } from './agent.js';

const app = express();
app.use(cors());
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/agent', async (req, res) => {
  const { message } = req.body;

  // --- Edge case: empty / missing input from the client itself ---
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ reply: 'Please type a message first.', paymentLink: null });
  }

  try {
    const result = await runAgent(message.trim(), razorpay);
    res.json(result);
  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({
      reply: 'Something went wrong on our end. Please try again in a moment.',
      paymentLink: null,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));