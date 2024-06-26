import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AccommodationAvailability, Reservation, ReservationStatus } from "../types/availability";
import { UsernameDTO } from "../types/user";
import { ReviewAccommodation, ReviewHost } from "../util/availability";
import moment from "moment";
import { Logger } from "../util/logger";

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
        Logger.log(`Getting reservations for user ${username}`);
        const reservations = await this.reservationsCollection.find({ username }).toArray();
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public async getAccommodationReservations(accommodationId: string): Promise<Reservation[]> {
        Logger.log(`Getting reservations for accommodation ${accommodationId}`);
        const reservations = await this.reservationsCollection.find({ accommodationId: new ObjectId(accommodationId) }).toArray();
        Logger.log(`Found ${reservations.length} reservations for accommodation ${accommodationId}`);
        return reservations.map((reservation) => {
            return {
                ...reservation,
                accommodationId: reservation.accommodationId.toHexString()
            }
        });
    }

    public async getReservation(reservationId: string): Promise<Reservation | null> {
        Logger.log(`Getting reservation with id ${reservationId}`);
        const reservation = await this.reservationsCollection.findOne({ _id: new ObjectId(reservationId) });
        if (!reservation) {
            return null;
        }
        Logger.log(`Found reservation with id ${reservationId}`);
        return {
            ...reservation,
            accommodationId: reservation.accommodationId.toHexString()
        }
    }

    public async getCancelReservationsWithinTimeframe(accommodationId: string, startDate: Date, endDate: Date): Promise<void> {
        Logger.log(`Cancelling reservations for accommodation ${accommodationId} within timeframe ${startDate} - ${endDate}`);
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
        Logger.log(`result cancel pending: ${JSON.stringify(result)}`)
    }

    public async updateReservationStatus(reservationId: string, status: ReservationStatus): Promise<void> {
        Logger.log(`Updating reservation with id ${reservationId} to status ${status}`);
        const result = await this.reservationsCollection.updateOne(
            { _id: new ObjectId(reservationId) },
            {
                $set: {
                    status
                }
            }
        );
        if (!result) {
            Logger.error(`Reservation with id ${reservationId} not found`);
            throw new Error(`Reservation with id ${reservationId} not found`);
        }
        Logger.log(`Updated reservation with id ${reservationId} to status ${status}`);
    }

    public async updateUsername(usernameDTO: UsernameDTO) {
        Logger.log(`Updating username from ${usernameDTO.oldUsername} to ${usernameDTO.newUsername}`);
        const result = await this.reservationsCollection.updateMany(
            { username: usernameDTO.oldUsername },
            {
                $set: {
                    username: usernameDTO.newUsername
                }
            }
        );
        Logger.log(`Updated ${result.modifiedCount} reservations`);
        return result.upsertedCount;
    }

    public async checkIfUserStayedInAccommodation(reviewAccommodation: ReviewAccommodation): Promise<boolean> {
        const result = await this.reservationsCollection.countDocuments(
            { 
             'accommodationId': new ObjectId(reviewAccommodation.accommodationId),
             'username': reviewAccommodation.reviewerUsername,
             'status': ReservationStatus.CONFIRMED,
             'startDate': { $lte: moment.utc().toDate() }
            });
        return result > 0;
    }

    public async countFutureReservationsForGuest(username: string): Promise<number> {
        const result = await this.reservationsCollection.countDocuments(
            {
                username,
                status: ReservationStatus.CONFIRMED,
                startDate: { $gte: moment.utc().toDate() }
            }
        );
        return result;
    }

    public async countFutureReservationsForHost(username: string): Promise<number> {
       const pipeline = [
              {
                $match: {
                     status: ReservationStatus.CONFIRMED,
                     startDate: { $gte: moment.utc().toDate() }
                }
              },
              {
                $lookup: {
                     from: "accommodations",
                     localField: "accommodationId",
                     foreignField: "accommodationId",
                     as: "accommodationDetails"
                }
              },
              {
                $unwind: "$accommodationDetails"
              },
              {
                $match: {
                    "accommodationDetails.ownerUsername": username
                }
            },
            {
                $count: "matchingReservations"
            }
         ];
        const result = await this.reservationsCollection.aggregate(pipeline).toArray();
        console.log(result)
        if (result.length === 0 || !result[0].matchingReservations) {
            return 0;
        }
        return result[0].matchingReservations ?? 0;
    }

    public async checkIfUserStayedInHostAccommodation(reviewHost: ReviewHost): Promise<boolean> {
        const pipeline = [
            {
                $match: {
                    username: reviewHost.reviewerUsername,
                    status: ReservationStatus.CONFIRMED,
                    startDate: { $lte: moment.utc().toDate() }
                }
            },
            {
                $lookup: {
                    from: "accommodations",
                    localField: "accommodationId",
                    foreignField: "accommodationId",
                    as: "accommodationDetails"
                }
            },
            {
                $unwind: "$accommodationDetails"
            },
            {
                $match: {
                    "accommodationDetails.ownerUsername": reviewHost.hostUsername
                }
            },
            {
                $count: "matchingReservations"
            }
        ];
        
        const result = await this.reservationsCollection.aggregate(pipeline).toArray();
        if (result.length > 0) {
            Logger.log(`Count of matching reservations: ${result[0].matchingReservations}`);
            return result[0].matchingReservations > 0; 
        } else {
            Logger.log("No matching reservations found.");
            return false;
        }
    }

    public async removeReservationsForUsername(username: string): Promise<void> {
        Logger.log(`Removing reservations for username ${username}`);
        const result = await this.reservationsCollection.deleteMany({ username });
    }

    public async removeReservationsForAccommodation(accommodationId: string): Promise<void> {
        Logger.log(`Removing reservations for accommodation ${accommodationId}`);
        const result = await this.reservationsCollection.deleteMany({ accommodationId: new ObjectId(accommodationId) });
    }
}