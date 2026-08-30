import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import deliveryRoutes from './deliveryRoutes';
import escrowRoutes from './escrowRoutes';
import auditLogRoutes from './auditLogRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/escrows', escrowRoutes);
router.use('/audit-logs', auditLogRoutes);

export default router;
