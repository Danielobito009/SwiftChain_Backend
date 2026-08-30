import { Types } from 'mongoose';
import Delivery from '../models/Delivery';
import ApiError from '../utils/ApiError';
import { PaginatedResult, QueryOptions } from '../types/query';
import { buildPaginationMeta } from '../middlewares/queryMiddleware';

/**
 * Returns a page of deliveries using the options produced by the query
 * middleware.
 *
 * The page and the total count are issued concurrently: they are independent
 * reads over the same filter, so serialising them would double the latency.
 */
export const listDeliveries = async (
  options: QueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const [items, totalItems] = await Promise.all([
    Delivery.find(options.filter)
      .populate('sender', 'name email')
      .populate('courier', 'name email')
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean({ virtuals: true })
      .exec(),
    Delivery.countDocuments(options.filter).exec(),
  ]);

  return {
    items: items as unknown as Record<string, unknown>[],
    meta: buildPaginationMeta(totalItems, options.page, options.limit),
  };
};

/** Returns a single delivery by id. */
export const getDeliveryById = async (deliveryId: string): Promise<Record<string, unknown>> => {
  if (!Types.ObjectId.isValid(deliveryId)) {
    throw ApiError.badRequest('The supplied delivery id is not a valid identifier');
  }

  const delivery = await Delivery.findById(deliveryId)
    .populate('sender', 'name email')
    .populate('courier', 'name email')
    .lean({ virtuals: true })
    .exec();

  if (!delivery) {
    throw ApiError.notFound('Delivery not found');
  }

  return delivery as unknown as Record<string, unknown>;
};

export default { listDeliveries, getDeliveryById };
