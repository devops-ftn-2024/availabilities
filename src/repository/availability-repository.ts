import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Availability, AvailabilityUpdate } from "../types/availability";
import { NotFoundError } from "../types/errors";

interface MongoAccommodationAvailability extends Omit<AccommodationAvailability, '_id' | 'accommodationId'> {
  _id?: ObjectId;
  accommodationId: ObjectId;
}

export class AvailabilityRepository {

    private client: MongoClient;
    private database_name: string;
    private availabilityCollectionName: string;
    private accommodationCollection: Collection<MongoAccommodationAvailability>;

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
        this.availabilityCollectionName = process.env.MONGO_COLLECTION_NAME_AVAILABILITY;
        this.accommodationCollection = this.client.db(this.database_name).collection(this.availabilityCollectionName);
    }

    public async getAccommodation(id: string): Promise<MongoAccommodationAvailability | null> {
        const accommodation = await this.accommodationCollection.findOne({ 'accommodationId': new ObjectId(id) });
        return accommodation;
    }

    public async updateStartEndDate(id: string, accommodationId: string, availabilityUpdate: AvailabilityUpdate): Promise<void> {
        const result = await this.accommodationCollection.updateOne(
            { 
              'accommodationId': new ObjectId(accommodationId), 
              "availabilities._id": new ObjectId(id) 
            },
            {
              $set: {
                "availabilities.$[elem].startDate": availabilityUpdate.startDate,
                "availabilities.$[elem].endDate": availabilityUpdate.endDate
              }
            },
            {
              arrayFilters: [ { "elem._id": new ObjectId(id) } ]
            }
          );
        if (!result) {
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
        console.log(result);
    }

    public async setAsInvalid(id: string, accommodationId: string): Promise<void> {
        const result = await this.accommodationCollection.updateOne(
            { 
              'accommodationId': new ObjectId(accommodationId), 
              "availabilities._id": new ObjectId(id) 
            },
            {
              $set: {
                "availabilities.$[elem].valid": false,
              }
            },
            {
              arrayFilters: [ { "elem._id": new ObjectId(id) } ]
            }
          );
        if (!result) {
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
        console.log(result);
    }

    public async insertNewAvailability(accommodationId: string, availability: Availability): Promise<void> {
      availability._id = new ObjectId();
      const result = await this.accommodationCollection.updateOne(
            { 'accommodationId': new ObjectId(accommodationId) },
            {
              $push: {
                availabilities: availability
              }
            }
          );
        if (!result) {
            throw new NotFoundError(`Accommodation with id ${accommodationId} not found`);
        }
        console.log(result);
    }

}