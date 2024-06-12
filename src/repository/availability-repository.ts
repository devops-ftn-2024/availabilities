import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Availability, AvailabilityUpdate } from "../types/availability";
import { NotFoundError } from "../types/errors";

interface MongoAccommodationAvailability extends Omit<AccommodationAvailability, '_id' | 'accommodationId'> {
  _id?: ObjectId;
  accommodationId: ObjectId;
}

interface MongoAvailability extends Omit<Availability, '_id' | 'accommodationId'> {
  _id?: ObjectId;
  accommodationId: ObjectId;
}

export class AvailabilityRepository {

    private client: MongoClient;
    private database_name: string;
    private accommodationCollectionName: string;
    private accommodationCollection: Collection<MongoAccommodationAvailability>;
    private availabilityCollectionName: string;
    private availabilityCollection: Collection<MongoAvailability>;

    constructor() {
        if (!process.env.MONGO_URI) {
            throw new Error("Missing MONGO_URI environment variable");
        }
        if (!process.env.MONGO_DB_NAME) {
            throw new Error("Missing MONGO_DB_NAME environment variable");
        }
        if (!process.env.MONGO_COLLECTION_NAME_RESERVATION) {
          throw new Error("Missing MONGO_COLLECTION_NAME_RESERVATION environment variable");
        }
        if (!process.env.MONGO_COLLECTION_NAME_ACCOMMODATION) {
          throw new Error("Missing MONGO_COLLECTION_NAME_ACCOMMODATION environment variable");
        }
        if (!process.env.MONGO_COLLECTION_NAME_AVAILABILITY) {
            throw new Error("Missing MONGO_COLLECTION_NAME_AVAILABILITY environment variable");
        }
        this.client = new MongoClient(process.env.MONGO_URI);
        this.database_name = process.env.MONGO_DB_NAME;
        this.accommodationCollectionName = process.env.MONGO_COLLECTION_NAME_ACCOMMODATION;
        this.accommodationCollection = this.client.db(this.database_name).collection(this.accommodationCollectionName);
        this.availabilityCollectionName = process.env.MONGO_COLLECTION_NAME_AVAILABILITY;
        this.availabilityCollection = this.client.db(this.database_name).collection(this.availabilityCollectionName);
    }

    public async getAccommodation(id: string): Promise<MongoAccommodationAvailability | null> {
        const accommodation = await this.accommodationCollection.findOne({ 'accommodationId': new ObjectId(id) });
        return accommodation;
    }

    public async updateStartEndDate(id: string, accommodationId: string, availabilityUpdate: AvailabilityUpdate): Promise<void> {
        const result = await this.availabilityCollection.updateOne(
          { '_id': new ObjectId(id), 'accommodationId': new ObjectId(accommodationId)},
          {
            $set: {
              startDate: availabilityUpdate.startDate,
              endDate: availabilityUpdate.endDate
            }
          }
        );
        if (!result) {
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
        console.log(result);
    }

    public async setAvailabilityAsInvalid(id: string, accommodationId: string): Promise<void> {
        const result = await this.availabilityCollection.updateOne(
            { '_id': new ObjectId(id), 'accommodationId': new ObjectId(accommodationId)},
            {
              $set: {
                valid: false
              }
            }
          );
        if (!result) {
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
        console.log(result);
    }

    public async getAvailability(id: string): Promise<MongoAvailability | null> {
        const availability = await this.availabilityCollection.findOne({ '_id': new ObjectId(id) });
        return availability;
    }

    public async insertNewAvailability(availability: Availability): Promise<void> {
        const mongoAvailability = {
            ...availability,
            accommodationId: new ObjectId(availability.accommodationId)
        }
        const result = await this.availabilityCollection.insertOne(mongoAvailability as WithId<MongoAvailability>);
        console.log(result);
    }
}