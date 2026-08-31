import { Router } from 'express';
import disputeRoutes from './disputeRoutes';

const router = Router();

// Dispute / Escrow resolution routes
router.use('/disputes', disputeRoutes);

// Define additional routes here
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);

export default router;
