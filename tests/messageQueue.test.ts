import { MessageQueueService } from '../src/sockets/messageQueue';

describe('MessageQueueService', () => {
  it('queues a message for a driver and keeps it pending until ack', () => {
    const service = new MessageQueueService();

    const queued = service.enqueue('driver-123', 'delivery:status', { deliveryId: 'abc' });

    expect(queued.userId).toBe('driver-123');
    expect(service.getPending('driver-123')).toHaveLength(1);
    expect(service.acknowledge('driver-123', queued.id)).toBe(true);
    expect(service.getPending('driver-123')).toHaveLength(0);
  });

  it('flushes queued messages to a newly reconnected socket', () => {
    const service = new MessageQueueService();
    const sent: Array<{ event: string; payload: unknown }> = [];

    service.enqueue('driver-456', 'delivery:status', { deliveryId: 'xyz' });

    const flushed = service.flush('driver-456', (event, payload) => {
      sent.push({ event, payload });
    });

    expect(flushed).toBe(1);
    expect(sent).toEqual([{ event: 'delivery:status', payload: { deliveryId: 'xyz' } }]);
  });

  it('removes a queued message when the client acknowledges it', () => {
    const service = new MessageQueueService();

    const queued = service.enqueue('driver-789', 'delivery:status', { deliveryId: 'ready' });
    service.acknowledge('driver-789', queued.id);

    expect(service.getPending('driver-789')).toHaveLength(0);
  });
});
