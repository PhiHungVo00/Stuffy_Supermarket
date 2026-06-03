import Outbox from '../models/Outbox';
import { pubsub } from '../rabbitmq';

export class OutboxProcessor {
  private static isProcessing = false;

  public static start() {
    console.log('[Outbox Processor] ⚡ Daemon started successfully.');
    // Poll the database every 5 seconds for pending events
    setInterval(async () => {
      await this.processPendingEvents();
    }, 5000);
  }

  private static async processPendingEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingEvents = await Outbox.find({ status: 'pending' }).limit(20);
      
      for (const event of pendingEvents) {
        try {
          // Publish event to RabbitMQ
          await pubsub.publish(event.eventType, event.payload);
          
          event.status = 'processed';
          event.processedAt = new Date();
          await event.save();
          
          console.log(`[Outbox Processor] ✅ Successfully processed event: ${event.eventType} for ID ${event.aggregateId}`);
        } catch (err: any) {
          console.error(`[Outbox Processor] ❌ Failed to process outbox event ${event._id}:`, err.message);
          event.error = err.message;
          await event.save();
        }
      }
    } catch (err: any) {
      console.error('[Outbox Processor] Error fetching pending outbox events:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}
