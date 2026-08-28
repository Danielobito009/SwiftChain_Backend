// @ts-ignore: express types may be missing in this project setup
import { Router } from 'express';
import authRoutes from './authRoutes';
import deliveryCrudRoutes from './delivery.routes';
import deliveryEtaRoutes from './deliveryRoutes';
import deliveryStatusRoutes from './deliveries';
import adminRoutes from './adminRoutes';
import driverRoutes from './driverRoutes';
import fleetRoutes from './fleetRoutes';
import disputeRoutes from './disputeRoutes';
import eventLogRoutes from './eventLogRoutes';
import healthRoutes from './healthRoutes';

const router = Router();

router.use('/v1/auth', authRoutes);
router.use('/v1/deliveries', deliveryCrudRoutes);
router.use('/v1/deliveries', deliveryEtaRoutes);
router.use('/v1/deliveries', deliveryStatusRoutes);
router.use('/v1/admin', adminRoutes);
router.use('/v1/drivers', driverRoutes);
router.use('/v1/fleets', fleetRoutes);
router.use('/v1/disputes', disputeRoutes);
router.use('/v1/eventlog', eventLogRoutes);
router.use('/v1/health', healthRoutes);

export default router;
