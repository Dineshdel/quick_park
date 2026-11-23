import { Injectable, Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { type AvailabilityEvent } from '@qp/types';
import { type Server, type Socket } from 'socket.io';
import { AvailabilityService } from '../availability/availability.service';

const room = (locationId: string) => `location:${locationId}`;
const UUID = /^[0-9a-f-]{36}$/;

/**
 * socket.io at /realtime. Clients emit `subscribe` with a location id and receive `availability` events
 * ({ locationId, vehicleTypeId, free, inside }). Counts aren't personal data, so no auth is needed.
 */
@Injectable()
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server?: Server;

  constructor(private readonly availability: AvailabilityService) {}

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() locationId: unknown) {
    if (typeof locationId !== 'string' || !UUID.test(locationId)) return { ok: false };
    await socket.join(room(locationId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() locationId: unknown) {
    if (typeof locationId === 'string') await socket.leave(room(locationId));
    return { ok: true };
  }

  /** Recompute and broadcast live numbers. Never throws: realtime is best-effort. */
  async publish(locationId: string, vehicleTypeId: string) {
    try {
      if (!this.server) return;
      const live = await this.availability.live(locationId, vehicleTypeId);
      const event: AvailabilityEvent = { locationId, vehicleTypeId, free: live.free, inside: live.inside };
      this.server.to(room(locationId)).emit('availability', event);
    } catch (e) {
      this.logger.warn(`publish failed: ${(e as Error).message}`);
    }
  }
}
