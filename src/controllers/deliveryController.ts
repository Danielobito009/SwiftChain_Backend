import { StatusCodes } from 'http-status-codes';
import asyncHandler from '../utils/asyncHandler';
import { resolveQueryOptions } from '../middlewares/queryMiddleware';
import { getDeliveryById, listDeliveries } from '../services/deliveryService';

/**
 * GET /api/v1/deliveries
 *
 * Returns a paginated, sortable and filterable list of deliveries. The query
 * string is parsed by `buildQueryOptions` before this handler runs.
 */
export const getDeliveries = asyncHandler(async (req, res) => {
  const { items, meta } = await listDeliveries(resolveQueryOptions(req));

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Deliveries retrieved successfully',
    data: items,
    meta,
  });
});

/** GET /api/v1/deliveries/:deliveryId */
export const getDelivery = asyncHandler(async (req, res) => {
  const delivery = await getDeliveryById(req.params.deliveryId);

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Delivery retrieved successfully',
    data: delivery,
  });
});

export default { getDeliveries, getDelivery };
