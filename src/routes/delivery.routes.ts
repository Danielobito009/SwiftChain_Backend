import { Router } from 'express';
import { deliveryController } from '../controllers/delivery.controller';
import { validateRequest } from '../middlewares/validateRequest';
import { createDeliverySchema, updateDeliverySchema } from '../validators/deliveryValidator';

const router = Router();

router.post('/', validateRequest({ body: createDeliverySchema }), deliveryController.create.bind(deliveryController));
router.get('/', deliveryController.list.bind(deliveryController));
router.get('/archived', deliveryController.listArchived.bind(deliveryController));
router.get('/:id', deliveryController.getById.bind(deliveryController));
router.patch('/:id', validateRequest({ body: updateDeliverySchema }), deliveryController.update.bind(deliveryController));
router.patch('/:id/archive', deliveryController.archive.bind(deliveryController));
router.patch('/:id/restore', deliveryController.restore.bind(deliveryController));

export default router;
