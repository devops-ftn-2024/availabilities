import { Collection, Filter, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Availability, AvailabilityUpdate } from "../types/availability";
import { NotFoundError } from "../types/errors";
import { UsernameDTO } from "../types/user";
import { Logger } from "../util/logger";

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
        Logger.log(`Getting accommodation with id ${id}`);
        const accommodation = await this.accommodationCollection.findOne({ 'accommodationId': new ObjectId(id) });
        Logger.log(`Found accommodation: ${JSON.stringify(accommodation)}`);
        return accommodation;
    }

    public async updateStartEndDate(id: string, accommodationId: string, startDate: Date, endDate: Date): Promise<void> {
      Logger.log(`Updating availability with id ${id}`);
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
          Logger.error(`Availability with id ${id} not found`);
          throw new NotFoundError(`Availability with id ${id} not found`);
        }
        Logger.log(`Updated availability with id ${id}`);
    }

    public async setAvailabilityAsInvalid(id: string, accommodationId: string): Promise<void> {
      Logger.log(`Setting availability with id ${id} as invalid`);
        const result = await this.availabilityCollection.updateOne(
            { '_id': new ObjectId(id), 'accommodationId': new ObjectId(accommodationId)},
            {
              $set: {
                valid: false
              }
            }
          );
        if (!result) {
          Logger.error(`Availability with id ${id} not found`);
            throw new NotFoundError(`Availability with id ${id} not found`);
        }
        Logger.log(`Set availability with id ${id} as invalid`);
    }

    public async getAvailability(id: string): Promise<MongoAvailability | null> {
      Logger.log(`Getting availability with id ${id}`);
        const availability = await this.availabilityCollection.findOne({ '_id': new ObjectId(id), 'valid': true });
        Logger.log(`Found availability: ${JSON.stringify(availability)}`);
        return availability;
    }

    public async insertNewAvailability(availability: Availability): Promise<ObjectId> {
      Logger.log(`Inserting new availability: ${JSON.stringify(availability)}`);
        const mongoAvailability = {
            ...availability,
            accommodationId: new ObjectId(availability.accommodationId)
        }
        const result = await this.availabilityCollection.insertOne(mongoAvailability as WithId<MongoAvailability>);
        Logger.log(`Inserted new availability: ${JSON.stringify(result)}`);
        return result.insertedId;
    }

    public async getAvailabilities(accommodationId: string, startDate: Date, endDate: Date): Promise<Availability[]> {  
      Logger.log(`Getting availabilities for accommodation: ${accommodationId}, startDate: ${startDate}, endDate: ${endDate}`);
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
        Logger.log(`Found ${availabilities.length} availabilities for accommodation: ${accommodationId}.`);
        return availabilities.map(availability => { return {...availability, accommodationId: availability.accommodationId.toHexString()}});
    }

    public async getAvailabilitiesCount(accommodationId: string, startDate: Date, endDate: Date): Promise<number> {  
      Logger.log(`Getting availabilities count for accommodation: ${accommodationId}, startDate: ${startDate}, endDate: ${endDate}`);
      const query = {
        'accommodationId': new ObjectId(accommodationId),
        'startDate': { $lt: endDate },
        'endDate': { $gt: startDate },
        'valid': true
      };
      const availabilities = await this.availabilityCollection.countDocuments(query);
      Logger.log(`Found ${availabilities} availabilities for accommodation: ${accommodationId}.`);
      return availabilities;
    }

    public async getAvailabilitiesPerParams(startDate: Date, endDate: Date, location: string, guests: number): Promise<{accommodationId: string}[]> {  
      Logger.log(`Getting availabilities for location: ${location}, startDate: ${startDate}, endDate: ${endDate}, guests: ${guests}`);
      const matchStage: Filter<MongoAccommodationAvailability> = {};

      if (guests !== undefined) {
        matchStage.minCapacity = { $lte: +guests };
        matchStage.maxCapacity = { $gte: +guests };
      }

      if (location) {
        matchStage.location = { $regex: location};
      }
      Logger.log(`${JSON.stringify(matchStage)}`)
     
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
      Logger.log(`Found ${result.length} accommodations with availabilities for location: ${location}, startDate: ${startDate}, endDate: ${endDate}, guests: ${guests}`);
      return result.map(accommodation =>  accommodation.accommodationId.toHexString());
    }

    public async insertNewAccommodation(accommodation: AccommodationAvailability): Promise<ObjectId> {
      Logger.log(`Inserting new accommodation: ${JSON.stringify(accommodation)}`);
        const mongoAccommodation = {
            ...accommodation,
            accommodationId: new ObjectId(accommodation.accommodationId)
        }
        const result = await this.accommodationCollection.insertOne(mongoAccommodation as WithId<MongoAccommodationAvailability>);
        Logger.log(`Inserted new accommodation: ${JSON.stringify(result)}`);
        return result.insertedId;
    }

    public async updateUsername(usernameDTO: UsernameDTO) {
      Logger.log(`Updating username: ${JSON.stringify(usernameDTO)}`);
        const result = await this.accommodationCollection.updateMany(
            { 'ownerUsername': usernameDTO.oldUsername },
            {
                $set: {
                    ownerUsername: usernameDTO.newUsername
                }
            }
        );
        Logger.log(`Updated username from ${usernameDTO.oldUsername} to ${usernameDTO.newUsername}`);
        return result.upsertedCount;
    }
  }