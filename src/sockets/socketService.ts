import ChatMessage, { IChatMessage } from '../models/ChatMessage';
import logger from '../config/logger';
import { Namespace, Socket } from 'socket.io';

class SocketService {
  public async getRecentMessages(limit = 10): Promise<IChatMessage[]> {
    return ChatMessage.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec() as unknown as IChatMessage[];
  }

  public async saveMessage(payload: { content: string; sender?: string }): Promise<IChatMessage> {
    return ChatMessage.create({
      content: payload.content,
      sender: payload.sender,
    }) as unknown as IChatMessage;
  }

  public async handleConnection(socket: Socket, _nsp: Namespace): Promise<void> {
    try {
      const recent = await this.getRecentMessages();
      socket.emit('recentMessages', recent.reverse());
    } catch (error) {
      logger.error('Error fetching recent messages', error);
      socket.emit('error', { message: 'Failed to load recent messages' });
    }
  }

  public async handleIncomingMessage(
    nsp: Namespace,
    payload: { content: string; sender?: string },
  ): Promise<void> {
    try {
      const doc = await this.saveMessage(payload);
      nsp.emit('message', doc);
    } catch (error) {
      logger.error('Error saving message', error);
    }
  }
}

export default new SocketService();
