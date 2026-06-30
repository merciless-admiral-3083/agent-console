import { ClientMessage, ServerMessage } from '@/types/protocol';

type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type ErrorHandler = (error: Error) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 500;
  private maxReconnectDelay = 10000;
  private lastProcessedSeq = 0;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private pendingAcks = new Map<string, () => void>();
  private ackTimeouts = new Map<string, NodeJS.Timeout>();
  private reconnecting = false;
  private messageBuffer: ServerMessage[] = [];
  private processingBuffer = false;

  constructor(url: string = 'ws://localhost:4747/ws') {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = () => this.handleClose();
      this.ws.onerror = (error) => this.handleError(error);
    } catch (error) {
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.notifyConnection(true);

    if (this.lastProcessedSeq > 0) {
      this.send({ type: 'RESUME', last_seq: this.lastProcessedSeq });
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;
      this.processServerMessage(msg);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private processServerMessage(msg: ServerMessage): void {
    if (msg.seq <= this.lastProcessedSeq) return;

    if (this.isOutOfOrder(msg)) {
      this.bufferMessage(msg);
      return;
    }

    this.lastProcessedSeq = msg.seq;
    this.notifyMessage(msg);

    this.flushBuffer();
  }

  private isOutOfOrder(msg: ServerMessage): boolean {
    return msg.seq !== this.lastProcessedSeq + 1;
  }

  private bufferMessage(msg: ServerMessage): void {
    const exists = this.messageBuffer.some(m => m.seq === msg.seq);
    if (!exists) {
      this.messageBuffer.push(msg);
      this.messageBuffer.sort((a, b) => a.seq - b.seq);
    }
  }

  private flushBuffer(): void {
    if (this.processingBuffer) return;
    this.processingBuffer = true;

    while (this.messageBuffer.length > 0) {
      const next = this.messageBuffer[0];
      if (next.seq === this.lastProcessedSeq + 1) {
        this.messageBuffer.shift();
        this.lastProcessedSeq = next.seq;
        this.notifyMessage(next);
      } else {
        break;
      }
    }

    this.processingBuffer = false;
  }

  private handleClose(): void {
    this.notifyConnection(false);
    this.scheduleReconnect();
  }

  private handleError(error: Event): void {
    this.notifyError(new Error('WebSocket error'));
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnecting = true;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, delay);
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendUserMessage(content: string): void {
    this.send({ type: 'USER_MESSAGE', content });
  }

  sendPong(challenge: string): void {
    this.send({ type: 'PONG', echo: challenge });
  }

  sendToolAck(callId: string): void {
    this.send({ type: 'TOOL_ACK', call_id: callId });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  private notifyMessage(msg: ServerMessage): void {
    this.messageHandlers.forEach(h => h(msg));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionHandlers.forEach(h => h(connected));
  }

  private notifyError(error: Error): void {
    this.errorHandlers.forEach(h => h(error));
  }

  getLastSeq(): number {
    return this.lastProcessedSeq;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

export const wsManager = new WebSocketManager();