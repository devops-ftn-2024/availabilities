import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Reservation } from "../types/availability";

interface MongoAccommodationAvailability extends Omit<Reservation, '_id'> {
    _id?: ObjectId;
}

export class ReservationRepository {

    private client: MongoClient;
    private database_name: string;
    private reservationsCollectionName: string;
    private reservationsCollection: Collection<MongoAccommodationAvailability>;

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

}