import { Observable } from 'rxjs';

export interface ChatReply {
  thinking: string;
  response: string;
}

export interface AIProvider {
  chat(prompt: string): Promise<ChatReply>;
  streamChat(prompt: string): Observable<MessageEvent>;
}
