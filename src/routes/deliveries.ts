import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { updateDeliveryStatus } from '../controllers/deliveryStatusController';

const router = Router();

router.put('/:id/status', authenticate, authorize(['driver', 'admin']), updateDeliveryStatus);

export default router;
