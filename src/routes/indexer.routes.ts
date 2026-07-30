import { Router } from 'express';
import { indexerController } from '../controllers/indexer.controller';

const router = Router();

// POST /api/v1/indexer/delivery-created
router.post('/delivery-created', indexerController.handleDeliveryCreated.bind(indexerController));

export default router;
