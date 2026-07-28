import { Router } from 'express';
import authRoutes from './authRoutes';
import deliveryCrudRoutes from './delivery.routes';
import deliveryStatusRoutes from './deliveries';
import adminRoutes from './adminRoutes';
import driverRoutes from './driverRoutes';
import monitorRoutes from './monitorRoutes';

const router = Router();

router.use('/v1/auth', authRoutes);
router.use('/v1/deliveries', deliveryCrudRoutes);
router.use('/v1/deliveries', deliveryStatusRoutes);
router.use('/v1/admin', adminRoutes);
router.use('/v1/drivers', driverRoutes);
router.use('/v1/monitor', monitorRoutes);

export default router;
