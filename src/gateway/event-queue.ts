import amqp from 'amqplib/callback_api.js'
import { AvailabilityService } from '../service/availability-service';
import { AccommodationAvailability } from '../types/availability';
import { ReservationService } from '../service/reservation-service';
import { UsernameDTO } from '../types/user';

export class EventQueue {
    constructor(private availabilityService: AvailabilityService, private reservationService: ReservationService) {
        this.init();
    }
    private init() {

        amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}/`, (error, connection) => {
            if (error) {
                return;
                //throw error;
            }

            connection.createChannel((error1, channel) => {
                if (error1) {
                    throw error1;
                }

                channel.assertQueue('accommodation-created', {
                    durable: false
                });

                channel.consume('accommodation-created', (payload) => {
                    if (payload != null) {
                        const accommodation = JSON.parse(payload.content.toString())
                        console.log(`Registering user: ${JSON.stringify(accommodation)}`);
                        let contents: AccommodationAvailability = accommodation;
                        this.availabilityService.addAccommodation(contents);
                    }
                }, {
                    noAck: true
                })

                const exchangeName = 'username-updated';
                channel.assertExchange(exchangeName, 'fanout', { durable: true });
    
                channel.assertQueue('', { exclusive: true }, (error2, q) => {
                    if (error2) {
                        throw error2;
                    }
    
                    channel.bindQueue(q.queue, exchangeName, '');
    
                    console.log(`Waiting for messages in ${q.queue}. To exit press CTRL+C`);
    
                    channel.consume(q.queue, (payload) => {
                        console.log(`Updating username: ${payload}`);
                        if (payload !== null) {
                            const usernames: UsernameDTO = JSON.parse(payload.content.toString());
                            console.log(`Updating username: ${JSON.stringify(usernames)}`);
                            this.availabilityService.updateUsername(usernames);
                            this.reservationService.updateUsername(usernames);
                        }
                    }, { noAck: true });
                });

                const exchangeNameDelete = 'user-deleted';
                channel.assertExchange(exchangeNameDelete, 'fanout', { durable: true });
    
                channel.assertQueue('', { exclusive: true }, (error2, q) => {
                    if (error2) {
                        throw error2;
                    }
    
                    channel.bindQueue(q.queue, exchangeNameDelete, '');
    
                    console.log(`Waiting for messages in ${q.queue}. To exit press CTRL+C`);
    
                    channel.consume(q.queue, (payload) => {
                        console.log(`Deleting entities that have username: ${payload}`);
                        if (payload !== null) {
                            const username: string= JSON.parse(payload.content.toString()).username;
                            console.log(`Deleting entities with username: ${JSON.stringify(username)}`);
                            this.availabilityService.removeAccommodationAndAvailabilitiesForUsername(username);
                            this.reservationService.removeReservationsForUsername(username);
                        }
                    }, { noAck: true });
                });
            });
        });
    }
}