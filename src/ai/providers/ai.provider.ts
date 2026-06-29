import { Observable } from 'rxjs';
import { ChatMessage } from '../types/chat-message.type';

export interface ChatReply {
  thinking: string;
  response: string;
}

export interface AIProvider {
  chat(messages: ChatMessage[], modelOverride?: string): Promise<ChatReply>;
  streamChat(
    messages: ChatMessage[],
    modelOverride?: string,
  ): Observable<MessageEvent>;
}
