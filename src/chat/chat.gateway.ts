import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';

@WebSocketGateway({
  cors: true,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

  handleConnection(client: Socket) {
    try {
      this.wsJwtGuard.authorize(client);
      const { username } = client.data.user;
      console.log(`客户端已连接: ${client.id}, 用户: ${username}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const username = client.data.user?.username ?? '未知';
    console.log(`客户端已断开: ${client.id}, 用户: ${username}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
  ) {
    const { username } = client.data.user;
    console.log(`收到消息 [${username}]:`, data);
    client.emit('reply', `收到你的消息: ${data}`);
  }

  /** 服务端主动向所有在线客户端推送 */
  pushToAll(content: string) {
    console.log('广播推送:', content);
    this.server.emit('push', content);
  }
}
