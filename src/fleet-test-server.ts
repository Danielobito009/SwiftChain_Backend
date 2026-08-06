import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';

// Import routes
import authRoutes from './routes/authRoutes';
import fleetRoutes from './routes/fleetRoutes';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Fleet API Test Server',
    timestamp: new Date().toISOString()
  });
});

// Auth routes (for registration and login)
app.use('/api/v1/auth', authRoutes);

// Fleet routes
app.use('/api/v1/fleets', fleetRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/swiftchain')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log('');
      console.log('🚀 Fleet Test Server running on port 3000');
      console.log('📦 Auth API: http://localhost:3000/api/v1/auth');
      console.log('📦 Fleet API: http://localhost:3000/api/v1/fleets');
      console.log('📝 Health: http://localhost:3000/health');
      console.log('');
      console.log('📋 Ready for testing!');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB error:', err.message);
    console.log('');
    console.log('💡 Start MongoDB with: sudo systemctl start mongod');
  });
