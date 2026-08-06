import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Echo endpoint to see what's received
app.post('/echo', (req, res) => {
  console.log('Received body:', JSON.stringify(req.body, null, 2));
  res.json({
    received: req.body,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body)
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

mongoose.connect('mongodb://localhost:27017/swiftchain')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🔍 Echo server running on port ${PORT}`);
      console.log(`📝 POST to http://localhost:${PORT}/echo`);
    });
  })
  .catch(err => console.error('❌ MongoDB error:', err));
