import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Reservation, ReservationStatus } from "../types/availability";

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

    public insertNewReservation = async (reservation: Reservation) => {
        const mongoReservation = {
            ...reservation,
            accommodationId: new ObjectId(reservation.accommodationId)
        }
        const result = await this.reservationsCollection.insertOne(mongoReservation as WithId<MongoReservation>);
        console.log(result)
    }

    public getReservations = async (username: string): Promise<Reservation[]> => {
        const reservations = await this.reservationsCollection.find({ username }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public getAccommodationReservations = async (accommodationId: string): Promise<Reservation[]> => {
        const reservations = await this.reservationsCollection.find({ accommodationId: new ObjectId(accommodationId) }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public getReservation = async (reservationId: string): Promise<Reservation | null> => {
        const reservation = await this.reservationsCollection.findOne({ _id: new ObjectId(reservationId) });
        if (!reservation) {
            return null;
        }
        return {
            ...reservation,
            accommodationId: reservation.accommodationId.toHexString()
        }
    }

    public getReservationsWithinTimeframe = async (accommodationId: string, startDate: Date, endDate: Date): Promise<Reservation[]> => {
        const reservations = await this.reservationsCollection.find({
            accommodationId: new ObjectId(accommodationId),
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public updateReservationStatus = async (reservationId: string, status: ReservationStatus): Promise<void> => {
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

}