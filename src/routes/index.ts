import { Router } from 'express';

const router = Router();

// Define your routes here
import indexerRoutes from './indexer.routes';
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
router.use('/indexer', indexerRoutes);

export default router;
