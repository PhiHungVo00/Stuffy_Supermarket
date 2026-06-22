import amqp from 'amqplib';
import { EventEmitter } from 'events';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://stuffy:stuffyypass@localhost:5672';
const fallbackEmitter = new EventEmitter();
let isFallbackMode = false;

let channel: any;
let connection: any;

const MAX_RETRIES = 10;
const INITIAL_DELAY_MS = 1000;

const pendingSubscriptions: Array<{ queue: string; callback: (msg: any) => void }> = [];

export const connectRabbitMQ = async (retryCount = 0): Promise<void> => {
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        
        // Define Queues
        await channel.assertQueue('INVENTORY_SYNC', { durable: true });
        await channel.assertQueue('EMAIL_NOTIFICATIONS', { durable: true });
        await channel.assertQueue('user_behavior_tracking', { durable: true });
        
        console.log(`[RabbitMQ] Connected and queues initialized.`);

        // Replay any subscriptions registered before the channel was ready
        for (const sub of pendingSubscriptions) {
            channel.consume(sub.queue, (msg: any) => {
                if (msg !== null) {
                    const content = JSON.parse(msg.content.toString());
                    sub.callback(content);
                    channel.ack(msg);
                }
            });
        }

        // Handle connection close for auto-reconnect
        connection.on('close', (err: any) => {
            console.error('[RabbitMQ] Connection closed unexpectedly. Reconnecting...');
            channel = undefined as any;
            setTimeout(() => connectRabbitMQ(0), INITIAL_DELAY_MS);
        });

        connection.on('error', (err: any) => {
            console.error('[RabbitMQ] Connection error:', err.message);
        });
    } catch (err: any) {
        if (retryCount >= MAX_RETRIES) {
            console.error(`[RabbitMQ] Failed to connect after ${MAX_RETRIES} retries. Activating in-memory fallback.`);
            isFallbackMode = true;
            // Replay any pending subscriptions to fallbackEmitter
            for (const sub of pendingSubscriptions) {
                fallbackEmitter.on(sub.queue, (content) => {
                    sub.callback(content);
                });
            }
            return;
        }
        const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, retryCount), 30000);
        console.error(`[RabbitMQ] Connection failed (attempt ${retryCount + 1}/${MAX_RETRIES}). Retrying in ${delay}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return connectRabbitMQ(retryCount + 1);
    }
};

export const pubsub = {
    publish: (queue: string, message: any) => {
        if (isFallbackMode) {
            console.log(`[RabbitMQ Fallback] Publishing message to ${queue}`);
            setTimeout(() => {
                fallbackEmitter.emit(queue, message);
            }, 50);
            return;
        }
        if (!channel) {
            console.error(`[RabbitMQ] Channel not initialized. Cannot publish to ${queue}`);
            return;
        }
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
        console.log(`[RabbitMQ] Message published to ${queue}`);
    },
    
    subscribe: (queue: string, callback: (msg: any) => void) => {
        pendingSubscriptions.push({ queue, callback });
        if (isFallbackMode) {
            fallbackEmitter.on(queue, (content) => {
                callback(content);
            });
            return;
        }
        if (!channel) {
            console.error(`[RabbitMQ] Channel not initialized yet. Subscription to ${queue} will replay on connect.`);
            return;
        }
        channel.consume(queue, (msg: any) => {
            if (msg !== null) {
                const content = JSON.parse(msg.content.toString());
                callback(content);
                channel.ack(msg);
            }
        });
    }
};
