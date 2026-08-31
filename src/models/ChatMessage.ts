import mongoose, { Document, Model } from 'mongoose';

export interface IChatMessage extends Document {
  content: string;
  sender?: string;
  createdAt: Date;
}

const ChatMessageSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    sender: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// getRecentMessages (src/sockets/socketService.ts) runs on every socket
// connection: an unfiltered find sorted by createdAt desc, limited to 10.
ChatMessageSchema.index({ createdAt: -1 });

const ChatMessage =
  (mongoose.models.ChatMessage as Model<IChatMessage>) ||
  mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

export default ChatMessage;
