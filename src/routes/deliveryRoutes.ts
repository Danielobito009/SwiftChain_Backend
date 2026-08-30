import { Router } from 'express';
import { getDeliveries, getDelivery } from '../controllers/deliveryController';
import { authenticate } from '../middlewares/auth';
import { buildQueryOptions } from '../middlewares/queryMiddleware';
import { QueryFeatureConfig } from '../types/query';

const router = Router();

/**
 * Query surface exposed by the deliveries collection.
 *
 * `amount` and `createdAt` are typed so that range operators such as
 * `?amount[gte]=100` and `?createdAt[gte]=2026-01-01` coerce correctly.
 */
const deliveryQueryConfig: QueryFeatureConfig = {
  sortableFields: ['createdAt', 'updatedAt', 'amount', 'status', 'reference'],
  filterableFields: {
    status: 'string',
    currency: 'string',
    amount: 'number',
    sender: 'objectId',
    courier: 'objectId',
    createdAt: 'date',
  },
  searchableFields: ['reference', 'pickupAddress', 'dropoffAddress'],
  defaultSort: { createdAt: -1 },
  defaultLimit: 20,
  maxLimit: 100,
};

router.use(authenticate);

/**
 * @route   GET /api/v1/deliveries
 * @desc    List deliveries with pagination, sorting and filtering
 * @access  Authenticated
 */
router.get('/', buildQueryOptions(deliveryQueryConfig), getDeliveries);

/**
 * @route   GET /api/v1/deliveries/:deliveryId
 * @desc    Retrieve a single delivery
 * @access  Authenticated
 */
router.get('/:deliveryId', getDelivery);

export default router;
