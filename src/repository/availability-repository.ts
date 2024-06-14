import { Collection, Filter, MongoClient, ObjectId, WithId } from "mongodb";
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

    public async updateStartEndDate(id: string, accommodationId: string, startDate: Date, endDate: Date): Promise<void> {
        const result = await this.availabilityCollection.updateOne(
          { '_id': new ObjectId(id), 'accommodationId': new ObjectId(accommodationId)},
          {
            $set: {
              startDate,
              endDate
            }
          }
        );
        if (!result) {
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
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
    }

    public async getAvailability(id: string): Promise<MongoAvailability | null> {
        const availability = await this.availabilityCollection.findOne({ '_id': new ObjectId(id), 'valid': true });
        return availability;
    }

    public async insertNewAvailability(availability: Availability): Promise<void> {
        const mongoAvailability = {
            ...availability,
            accommodationId: new ObjectId(availability.accommodationId)
        }
        const result = await this.availabilityCollection.insertOne(mongoAvailability as WithId<MongoAvailability>);
    }

    public async getAvailabilities(accommodationId: string, startDate: Date, endDate: Date): Promise<Availability[]> {  
      const query = {
        'accommodationId': new ObjectId(accommodationId),
        'startDate': { $lte: endDate },
        'endDate': { $gte: startDate },
        'valid': true
      };
      const availabilities = await this.availabilityCollection.find(query,
        {
          sort: { startDate: 1 }
        }
        ).toArray();
        return availabilities.map(availability => { return {...availability, accommodationId: availability.accommodationId.toHexString()}});
    }

    public async getAvailabilitiesCount(accommodationId: string, startDate: Date, endDate: Date): Promise<number> {  
      const query = {
        'accommodationId': new ObjectId(accommodationId),
        'startDate': { $lt: endDate },
        'endDate': { $gt: startDate },
        'valid': true
      };
      const availabilities = await this.availabilityCollection.countDocuments(query);
      return availabilities;
    }

    public async getAvailabilitiesPerParams(startDate: Date, endDate: Date, location: string, guests: number): Promise<{accommodationId: string}[]> {  
      const matchStage: Filter<MongoAccommodationAvailability> = {};

      if (guests !== undefined) {
        matchStage.minCapacity = { $lte: +guests };
        matchStage.maxCapacity = { $gte: +guests };
      }

      if (location) {
        matchStage.location = { $regex: location};
      }
      console.log(matchStage)
     
      const pipeline = [
        {
          $match: matchStage
        },
        {
          $lookup: {
            from: "availabilities",
            localField: "accommodationId",
            foreignField: "accommodationId",
            as: "availabilities"
          }
        },
        {
          $addFields: {
            availabilities: {
              $filter: {
                input: "$availabilities",
                as: "availabilities",
                cond: {
                  $and: [
                    { $lte: ["$$availabilities.startDate", endDate] },
                    { $gte: ["$$availabilities.endDate", startDate] }
                  ]
                }
              }
            }
          }
        },
        {
          $match: {
            availabilities: { $ne: [] }
          }
        },
        {
          $project: {
            accommodationId: 1
          }
        }
      ];

      const result = await this.accommodationCollection.aggregate(pipeline).toArray();
      return result.map(accommodation =>  accommodation.accommodationId.toHexString());
    }
  }