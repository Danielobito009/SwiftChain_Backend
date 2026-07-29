import { Namespace, Socket } from 'socket.io';
import socketService from './socketService';
import logger from '../config/logger';

const registerSocketHandlers = (socket: Socket, nsp: Namespace): void => {
  logger.info(`Socket connected: ${socket.id} to namespace ${nsp.name}`);

  socketService.handleConnection(socket, nsp);

  socket.on('message', async (payload) => {
    try {
      await socketService.handleIncomingMessage(nsp, payload);
    } catch (err) {
      logger.error('Socket message handler error', err);
      socket.emit('error', { message: 'Failed to handle message' });
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info(`Socket disconnected: ${socket.id} reason: ${reason}`);
  });

  socket.on('error', (err) => {
    logger.error(`Socket error on ${socket.id}:`, err);
  });
};

export default registerSocketHandlers;
