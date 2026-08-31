import { Router } from 'express';
import { deliveryController } from '../controllers/deliveryController';

const router = Router();

router.get('/:id/eta', deliveryController.getDeliveryETA);

export default router;
