/// <reference path="../declarations.d.ts" />
import Outbox from '../models/Outbox';
import { pubsub } from '../rabbitmq';
import { trace, SpanStatusCode } from '@opentelemetry/api';

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

    const tracer = trace.getTracer('backend-api-outbox-processor');
    const parentSpan = tracer.startSpan('outbox_processor.process_batch');

    try {
      const pendingEvents = await Outbox.find({ status: 'pending' }).limit(20);
      parentSpan.setAttribute('outbox.batch_size', pendingEvents.length);
      
      for (const event of pendingEvents) {
        const childSpan = tracer.startSpan('outbox_processor.publish_event', {
          links: [{ context: parentSpan.spanContext() }]
        });
        childSpan.setAttribute('outbox.event_id', event._id.toString());
        childSpan.setAttribute('outbox.event_type', event.eventType);
        childSpan.setAttribute('outbox.aggregate_id', event.aggregateId);

        try {
          // Publish event to RabbitMQ
          await pubsub.publish(event.eventType, event.payload);
          
          event.status = 'processed';
          event.processedAt = new Date();
          await event.save();
          
          console.log(`[Outbox Processor] ✅ Successfully processed event: ${event.eventType} for ID ${event.aggregateId}`);
          childSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (err: any) {
          console.error(`[Outbox Processor] ❌ Failed to process outbox event ${event._id}:`, err.message);
          event.error = err.message;
          await event.save();
          childSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          childSpan.recordException(err);
        } finally {
          childSpan.end();
        }
      }
      parentSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (err: any) {
      console.error('[Outbox Processor] Error fetching pending outbox events:', err.message);
      parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      parentSpan.recordException(err);
    } finally {
      parentSpan.end();
      this.isProcessing = false;
    }
  }
}
