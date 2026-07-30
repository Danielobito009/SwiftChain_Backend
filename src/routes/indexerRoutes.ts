import { Router } from 'express';
import { indexerController } from '../controllers/indexerController';

const router = Router();

router.get('/status', (req, res, next) => {
  void indexerController.getStatus(req, res, next);
});

export default router;
