import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Reservation, ReservationStatus } from "../types/availability";
import { UsernameDTO } from "../types/user";

interface MongoReservation extends Omit<Reservation,  '_id' | 'accommodationId'> {
    _id?: ObjectId;
    accommodationId: ObjectId;
}

export class ReservationRepository {

    private client: MongoClient;
    private database_name: string;
    private reservationsCollectionName: string;
    private reservationsCollection: Collection<MongoReservation>;

    constructor() {
        if (!process.env.MONGO_URI) {
            throw new Error("Missing MONGO_URI environment variable");
        }
        if (!process.env.MONGO_DB_NAME) {
            throw new Error("Missing MONGO_DB_NAME environment variable");
        }
        if (!process.env.MONGO_COLLECTION_NAME_AVAILABILITY) {
            throw new Error("Missing MONGO_COLLECTION_NAME_AVAILABILITY environment variable");
        }
        if (!process.env.MONGO_COLLECTION_NAME_RESERVATION) {
            throw new Error("Missing MONGO_COLLECTION_NAME_RESERVATION environment variable");
        }
        this.client = new MongoClient(process.env.MONGO_URI);
        this.database_name = process.env.MONGO_DB_NAME;
        this.reservationsCollectionName = process.env.MONGO_COLLECTION_NAME_RESERVATION;
        this.reservationsCollection = this.client.db(this.database_name).collection(this.reservationsCollectionName);
    }

    public async insertNewReservation(reservation: Reservation) {
        const mongoReservation = {
            ...reservation,
            accommodationId: new ObjectId(reservation.accommodationId)
        }
        await this.reservationsCollection.insertOne(mongoReservation as WithId<MongoReservation>);
    }

    public async getReservations(username: string): Promise<Reservation[]> {
        const reservations = await this.reservationsCollection.find({ username }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public async getAccommodationReservations(accommodationId: string): Promise<Reservation[]> {
        const reservations = await this.reservationsCollection.find({ accommodationId: new ObjectId(accommodationId) }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public async getReservation(reservationId: string): Promise<Reservation | null> {
        const reservation = await this.reservationsCollection.findOne({ _id: new ObjectId(reservationId) });
        if (!reservation) {
            return null;
        }
        return {
            ...reservation,
            accommodationId: reservation.accommodationId.toHexString()
        }
    }

    public async getCancelReservationsWithinTimeframe(accommodationId: string, startDate: Date, endDate: Date): Promise<void> {
        //create aggregation to filter by accommodationId, startDate and endDate, if status is Pending set it to Cancelled
        const aggregation = [
            {
                $match: {
                    accommodationId: new ObjectId(accommodationId),
                    startDate: { $lte: endDate },
                    endDate: { $gte: startDate }
                }
            },
            {
                $set: {
                    status: {
                        $cond: { if: { $eq: ["$status", "Pending"] }, then: "Cancelled", else: "$status" }
                    }
                }
            },
            {
                $merge: {
                    into: process.env.MONGO_COLLECTION_NAME_RESERVATION,
                    whenMatched: "merge",
                    whenNotMatched: "discard"
                }
            }
        ]

        const result = await this.reservationsCollection.aggregate(aggregation).toArray();
        console.log('result cancel pending:', result)
    }

    public async updateReservationStatus(reservationId: string, status: ReservationStatus): Promise<void> {
        const result = await this.reservationsCollection.updateOne(
            { _id: new ObjectId(reservationId) },
            {
                $set: {
                    status
                }
            }
        );
        if (!result) {
            throw new Error(`Reservation with id ${reservationId} not found`);
        }
    }

    public async updateUsername(usernameDTO: UsernameDTO) {
        const result = await this.reservationsCollection.updateMany(
            { username: usernameDTO.oldUsername },
            {
                $set: {
                    username: usernameDTO.newUsername
                }
            }
        );
        return result.upsertedCount;
    }
}