// Import required modules
const express = require('express');          // Express for building web APIs
const amqp = require('amqplib/callback_api');// AMQP client for RabbitMQ
const cors = require('cors');                // CORS for cross-origin requests
require('dotenv').config();                  // Load env vars from .env (dev only)

const app = express();
app.use(express.json());

// Enable CORS (allow all for lab/demo; tighten later if needed)
app.use(cors());

// Config from environment variables
const RABBITMQ_CONNECTION_STRING =
  process.env.RABBITMQ_CONNECTION_STRING || 'amqp://localhost';
const PORT = process.env.PORT || 3000;

// Simple health check (useful for external reachability tests)
app.get('/health', (req, res) => {
  res.json({ ok: true, port: PORT });
});

// POST /orders — publish order messages to RabbitMQ
app.post('/orders', (req, res) => {
  const order = req.body;

  if (!order || Object.keys(order).length === 0) {
    return res.status(400).json({ error: 'Order body is required' });
  }

  // Connect to RabbitMQ
  amqp.connect(RABBITMQ_CONNECTION_STRING, (connErr, conn) => {
    if (connErr) {
      console.error('RabbitMQ connection error:', connErr.message);
      return res.status(500).json({ error: 'Error connecting to RabbitMQ' });
    }

    // Create channel
    conn.createChannel((chanErr, channel) => {
      if (chanErr) {
        console.error('RabbitMQ channel error:', chanErr.message);
        try { conn.close(); } catch (e) {}
        return res.status(500).json({ error: 'Error creating channel' });
      }

      const queue = 'order_queue';
      const msg = JSON.stringify(order);

      try {
        // Non-durable queue is OK for lab; make durable if you want persistence
        channel.assertQueue(queue, { durable: false });
        channel.sendToQueue(queue, Buffer.from(msg));
        console.log('Sent order to queue:', msg);

        // Clean up channel/connection shortly after publishing
        setTimeout(() => {
          try { channel.close(); } catch (e) {}
          try { conn.close(); } catch (e) {}
        }, 100);

        return res.status(201).json({ message: 'Order received' });
      } catch (sendErr) {
        console.error('RabbitMQ publish error:', sendErr.message);
        try { channel.close(); } catch (e) {}
        try { conn.close(); } catch (e) {}
        return res.status(500).json({ error: 'Failed to place order' });
      }
    });
  });
});

// IMPORTANT: bind to 0.0.0.0 so it’s reachable externally
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Order service is running on http://0.0.0.0:${PORT}`);
});
