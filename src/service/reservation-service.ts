import moment from "moment";
import { AvailabilityRepository } from "../repository/availability-repository";
import { ReservationRepository } from "../repository/reservation-repository";
import { BadRequestError, ForbiddenError, NotFoundError } from "../types/errors";
import { LoggedUser, Role, UsernameDTO } from "../types/user";
import { authorizeGuest, authorizeHost } from "../util/auth";
import { Availability, Reservation, ReservationStatus, Slot } from "../types/availability";
import { extractDatesFromTimeframe, extractDatesWithPrices, ReviewAccommodation, ReviewHost } from "../util/availability";
import { validateNewReservation } from "../util/validation";
import { Logger } from "../util/logger";
import { EmitEventQueue } from "../gateway/emit-event-queue";

export class ReservationService {
    private availabilityRepository: AvailabilityRepository;
    private reservationRepository: ReservationRepository;
    private eventQueueEmmiter = new EmitEventQueue();

    constructor() {
        this.availabilityRepository = new AvailabilityRepository();
        this.reservationRepository = new ReservationRepository();
        this.eventQueueEmmiter = new EmitEventQueue();
    }

    public async getReservations(loggedUser: LoggedUser) {
        Logger.log(`Getting reservations for user: ${loggedUser.username}`);
        authorizeGuest(loggedUser.role);
        return await this.reservationRepository.getReservations(loggedUser.username);
    }

    public async createReservation(loggedUser: LoggedUser, accommodationId: string, reservation: Partial<Reservation>) {
        authorizeGuest(loggedUser.role);
        validateNewReservation(reservation);
        Logger.log(`Creating reservation for user: ${loggedUser.username}`);
        const accommodationAvaialbility = await this.availabilityRepository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            Logger.error(`Accommodation not found for id: ${accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        const reservationStartDate = moment.utc(reservation.startDate, 'DD-MM-YYYY');
        const reservationEndDate = moment.utc(reservation.endDate, 'DD-MM-YYYY');
        const availabilities = await this.availabilityRepository.getAvailabilities(accommodationId, reservationStartDate.toDate(), reservationEndDate.toDate());
        const unitPrice = await this.checkAvailabilityOfAccommodation(availabilities, reservationStartDate, reservationEndDate);
        Logger.log(`Creating reservation for accommodation ${JSON.stringify(accommodationAvaialbility)}`)
        const reservationToInsert: Reservation = {
            accommodationId: accommodationId,
            username: loggedUser.username,
            startDate: reservationStartDate.toDate(),
            endDate: reservationEndDate.toDate(),
            price: reservation.price,
            status: accommodationAvaialbility.confirmationNeeded ? ReservationStatus.PENDING : ReservationStatus.CONFIRMED,
            guests: reservation.guests,
            unitPrice
        };
        Logger.log(`Saving reservation: ${JSON.stringify(reservationToInsert)} for accommodation ${accommodationId}`)
        if (!accommodationAvaialbility.confirmationNeeded) {
            await this.reservationRepository.getCancelReservationsWithinTimeframe(reservation.accommodationId, reservationStartDate.toDate(), reservationEndDate.toDate());
            await this.changeAvailabilities(availabilities, reservationStartDate, reservationEndDate);
        }
        await this.reservationRepository.insertNewReservation(reservationToInsert);
        Logger.log(`Reservation saved: ${JSON.stringify(reservationToInsert)}`);
    }

    public async getAccommodationReservations(loggedUser: LoggedUser, accommodationId: string) {
        Logger.log(`Getting reservations for accommodation: ${accommodationId}`);
        authorizeHost(loggedUser.role);
        const accommodationAvaialbility = await this.availabilityRepository.getAccommodation(accommodationId);
        if (!accommodationAvaialbility) {
            Logger.error(`Accommodation not found for id: ${accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            Logger.error(`User ${loggedUser.username} is not authorized to see reservations for accommodation with id: ${accommodationId}`);
            throw new ForbiddenError(`You are not allowed to see reservations for accommodation with id: ${accommodationId}`);
        }
        return await this.reservationRepository.getAccommodationReservations(accommodationId);
    }

    public async confirmReservation(loggedUser: LoggedUser, reservationId: string) {
        Logger.log(`Confirming reservation with id: ${reservationId}`);
        authorizeHost(loggedUser.role);
        const reservation = await this.reservationRepository.getReservation(reservationId);
        if (!reservation) {
            Logger.error(`Reservation not found for id: ${reservationId}`);
            throw new NotFoundError(`Reservation not found for id: ${reservationId}`);
        }
        Logger.log(`Reservation found: ${JSON.stringify(reservation)}`);
        const accommodationAvaialbility = await this.availabilityRepository.getAccommodation(reservation.accommodationId);
        if (!accommodationAvaialbility) {
            Logger.error(`Accommodation not found for id: ${reservation.accommodationId}`);
            throw new NotFoundError(`Accommodation not found for id: ${reservation.accommodationId}`);
        }
        if (accommodationAvaialbility.ownerUsername !== loggedUser.username) {
            Logger.error(`User ${loggedUser.username} is not authorized to confirm reservation with id: ${reservationId}`);
            throw new ForbiddenError(`You are not allowed to confirm reservation with id: ${reservationId}`);
        }
        if (reservation.status === ReservationStatus.CONFIRMED) {
            Logger.error(`Reservation with id: ${reservationId} is already confirmed`);
            throw new BadRequestError(`Reservation with id: ${reservationId} is already confirmed`);
        }
        if (reservation.status === ReservationStatus.CANCELLED) {
            Logger.error(`Reservation with id: ${reservationId} is cancelled and cannot be confirmed`);
            throw new BadRequestError(`Reservation with id: ${reservationId} is cancelled and cannot be confirmed`);
        }
        const startDate = moment(reservation.startDate);
        const endDate = moment(reservation.endDate);
        await this.reservationRepository.updateReservationStatus(reservationId, ReservationStatus.CONFIRMED);
        await this.reservationRepository.getCancelReservationsWithinTimeframe(reservation.accommodationId, startDate.toDate(), endDate.toDate());
        const availabilities = await this.availabilityRepository.getAvailabilities(reservation.accommodationId, startDate.toDate(), endDate.toDate());
        await this.changeAvailabilities(availabilities, startDate, endDate);
        Logger.log(`Reservation with id: ${reservationId} confirmed`);
    }

    private async cancelReservationObj(reservation: Reservation) {
        Logger.log(`Cancelling reservation with id: ${reservation._id.toString()}`);
        const reservationId = reservation._id.toString();
        if (reservation.status === ReservationStatus.CANCELLED) {
            Logger.error(`Reservation with id: ${reservationId} is already cancelled`);
            throw new BadRequestError(`Reservation with id: ${reservationId} is already cancelled or rejected`);
        }
        await this.reservationRepository.updateReservationStatus(reservationId, ReservationStatus.CANCELLED);
        const newAvailability = {
            accommodationId: reservation.accommodationId,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            price: reservation.unitPrice,
            dateCreated: new Date(),
            valid: true
        };
        Logger.log(`Creating new availability for reservation with id: ${reservationId}`);
        await this.availabilityRepository.insertNewAvailability(newAvailability);
        Logger.log(`Reservation with id: ${reservationId} cancelled`);
    }

    public async cancelReservation(loggedUser: LoggedUser, reservationId: string) {
        Logger.log(`Cancelling reservation with id: ${reservationId}`);
        authorizeGuest(loggedUser.role);
        const reservation = await this.reservationRepository.getReservation(reservationId);
        if (!reservation) {
            Logger.error(`Reservation not found for id: ${reservationId}`);
            throw new NotFoundError(`Reservation not found for id: ${reservationId}`);
        }
        if (reservation.username !== loggedUser.username) {
            Logger.error(`User ${loggedUser.username} is not authorized to cancel reservation with id: ${reservationId}`);
            throw new ForbiddenError(`You are not allowed to cancel reservation with id: ${reservationId}`);
        }
        const todaysDate = moment();
        const reservationStartDate = moment(reservation.startDate);
    
        if (todaysDate.isSameOrAfter(reservationStartDate.subtract(1, 'days'))) {
            Logger.error(`Reservation with id: ${reservationId} cannot be cancelled the day before the start date`);
            throw new BadRequestError(`Reservation with id: ${reservationId} cannot be cancelled the day before the start date`);
        }
        await this.cancelReservationObj(reservation);
    }

    public async checkIfUserCanBeDeleted(loggedUser: LoggedUser) {
        Logger.log(`Checking if user ${loggedUser.username} can be deleted`);
        if (!loggedUser.username || !loggedUser.role) {
            Logger.error(`User ${loggedUser.username} is not authorized to delete user ${loggedUser.username}`);
            throw new ForbiddenError(`You are not allowed to delete user ${loggedUser.username}`);
        }
        if (loggedUser.role === Role.GUEST) {
            const reservations = await this.reservationRepository.countFutureReservationsForGuest(loggedUser.username);
            if (reservations > 0) {
                Logger.error(`User ${loggedUser.username} has reservations and cannot be deleted`);
                throw new BadRequestError(`User ${loggedUser.username} has reservations and cannot be deleted`);
            }
            Logger.log(`User ${loggedUser.username} can be deleted`);
            this.eventQueueEmmiter.executeFanOut({ username: loggedUser.username }, 'user-deleted');
        }
        if (loggedUser.role === Role.HOST) {
            const reservations = await this.reservationRepository.countFutureReservationsForHost(loggedUser.username);
            if (reservations > 0) {
                Logger.error(`User ${loggedUser.username} has reservations and cannot be deleted`);
                throw new BadRequestError(`User ${loggedUser.username} has reservations and cannot be deleted`);
            }
            Logger.log(`User ${loggedUser.username} can be deleted`);
            this.eventQueueEmmiter.executeFanOut({ username: loggedUser.username }, 'user-deleted');
        }
    }

    public async removeReservationsForUsername(accommodationId: string) {
        Logger.log(`Removing reservations for accommodationId: ${accommodationId}`);
        await this.reservationRepository.removeReservationsForUsername(accommodationId);
    }

    private async checkAvailabilityOfAccommodation(availabilities: Availability[], startDate: moment.Moment, endDate: moment.Moment) {
        Logger.log(`Checking availability for reservation from ${startDate} to ${endDate}`);
        const allPricesInAvailablePeriod: Record<string, number> = {};
        if (availabilities.length < 1) {
            Logger.error(`There is no availability for the given time frame`);
            throw new BadRequestError(`There is no availability for the given time frame`);
        }
        const availabilitySlots: Slot[] = extractDatesWithPrices(availabilities, startDate, endDate);
        const reservationSlots: Slot[] = extractDatesFromTimeframe(startDate, endDate);
        reservationSlots.forEach((reservationSlot) => {
            const availabilitySlot: Slot = availabilitySlots.find((slot) => slot.date === reservationSlot.date);
            if (!availabilitySlot) {
                Logger.error(`There is no availability for the given time frame`);
                throw new BadRequestError(`There is no availability for the given time frame`);
            }
            allPricesInAvailablePeriod[availabilitySlot.price] =  allPricesInAvailablePeriod[availabilitySlot.price] ? 
                    allPricesInAvailablePeriod[availabilitySlot.price] + 1 : 1;
        });
        Logger.log(`Availability check passed for reservation from ${startDate} to ${endDate}`)
        Logger.log(`Availabilities: ${JSON.stringify(availabilities)}`)

        const unitPrice = +Object.keys(allPricesInAvailablePeriod).reduce((a, b) => allPricesInAvailablePeriod[a] > allPricesInAvailablePeriod[b] ? a : b);
        Logger.log(`Unit price for reservation from ${startDate} to ${endDate} is ${unitPrice}`);
        return unitPrice;
    }

    private async changeAvailabilities(availabilities: Availability[], startDate: moment.Moment, endDate: moment.Moment) {
        Logger.log(`Changing availabilities for reservation from ${startDate} to ${endDate}`)
        for (const avaialibility of availabilities) {
            const availabilityStartDate = moment(avaialibility.startDate);
            const availabilityEndDate = moment(avaialibility.endDate);

            // avaiability 1-30 , reservation 1-30 -> set as invalid
            if (availabilityStartDate.isSame(startDate) && availabilityEndDate.isSame(endDate)) {
                Logger.log(`1) Setting availability as invalid: ${avaialibility._id.toString()}`);
                await this.availabilityRepository.setAvailabilityAsInvalid(avaialibility._id.toString(), avaialibility.accommodationId);
            }

            // avaiability 1-30 , reservation 1-15 -> avaialbility 15-30
            else if (availabilityStartDate.isSame(startDate) && availabilityEndDate.isAfter(endDate)) {
                Logger.log(`2) Updating availability: ${avaialibility._id.toString()} to ${startDate} - ${endDate}`);
                await this.availabilityRepository.updateStartEndDate(avaialibility._id.toString(), avaialibility.accommodationId, endDate.toDate(), availabilityEndDate.toDate());
            }

            // avaiability 1-30 , reservation 15-30 -> avaialbility 1-15
            else if (availabilityStartDate.isBefore(startDate) && availabilityEndDate.isSame(endDate)) {
                Logger.log(`3) Updating availability: ${avaialibility._id.toString()} to ${startDate} - ${endDate}`);
                await this.availabilityRepository.updateStartEndDate(avaialibility._id.toString(), avaialibility.accommodationId, availabilityStartDate.toDate(), startDate.toDate());
            }

            // avaiability 1-30 , reservation 15-20 -> avaialbility 1-15, 20-30
            else if (availabilityStartDate.isBefore(startDate) && availabilityEndDate.isAfter(endDate)) {
                Logger.log(`4) Updating availability: ${avaialibility._id.toString()} to ${startDate} - ${endDate} and creating new availability for ${endDate} - ${availabilityEndDate}`);
                await this.availabilityRepository.updateStartEndDate(avaialibility._id.toString(), avaialibility.accommodationId, availabilityStartDate.toDate(), startDate.toDate());
                const newAvailability: Availability = {
                    accommodationId: avaialibility.accommodationId,
                    startDate: endDate.toDate(),
                    endDate: availabilityEndDate.toDate(),
                    price: avaialibility.price,
                    dateCreated: new Date(),
                    valid: true
                };
                await this.availabilityRepository.insertNewAvailability(newAvailability);
            }

            // availability 1-30, availability 30-15, reservation 20-10 -> prvi availability 1-20
            else if (availabilityStartDate.isBefore(startDate) && availabilityEndDate.isBefore(endDate)) {
                Logger.log(`5) Updating availability: ${avaialibility._id.toString()} to ${startDate} - ${availabilityEndDate}`);
                await this.availabilityRepository.updateStartEndDate(avaialibility._id.toString(), avaialibility.accommodationId, availabilityStartDate.toDate(), startDate.toDate());
            }

            // availability 1-30, availability 30-15, reservation 20-10 -> drugi availability 10-15
            else if (availabilityStartDate.isAfter(startDate) && availabilityEndDate.isAfter(endDate)) {
                Logger.log(`6) Updating availability: ${avaialibility._id.toString()} to ${endDate} - ${availabilityEndDate}`);
                await this.availabilityRepository.updateStartEndDate(avaialibility._id.toString(), avaialibility.accommodationId, endDate.toDate(), availabilityEndDate.toDate());
            }

            //availability 1-10 availability 10-20 availability 20-30, reservation 5-25 -> drugi invalid
            else if (availabilityStartDate.isAfter(startDate) && availabilityEndDate.isBefore(endDate)) {
                Logger.log(`7) Setting availability as invalid: ${avaialibility._id.toString()} to ${startDate} - ${endDate}`);
                await this.availabilityRepository.setAvailabilityAsInvalid(avaialibility._id.toString(), avaialibility.accommodationId);
            }

            //availaility 1-5, availability 5-20, availability 20-30, reservation 1-20 -> prvi invalid
            else if (availabilityStartDate.isSame(startDate) && availabilityEndDate.isBefore(endDate)) {
                Logger.log(`8) Setting availability as invalid: ${avaialibility._id.toString()} to ${startDate} - ${endDate}`);
                await this.availabilityRepository.setAvailabilityAsInvalid(avaialibility._id.toString(), avaialibility.accommodationId);
            }

            //availaility 1-5, availability 5-25, availability 25-30, reservation 1-25 -> drugi invalid
            else if (availabilityStartDate.isAfter(startDate) && availabilityEndDate.isSame(endDate)) {
                Logger.log(`9) Setting availability as invalid: ${avaialibility._id.toString()} to ${startDate} - ${endDate}`);
                await this.availabilityRepository.setAvailabilityAsInvalid(avaialibility._id.toString(), avaialibility.accommodationId);
            }
        } 
    }

    public async updateUsername(usernameDTO: UsernameDTO) {
        Logger.log(`Updating username: ${JSON.stringify(usernameDTO)}`);
        await this.reservationRepository.updateUsername(usernameDTO);
    }

    public async checkIfUserStayedInAccommodation(reviewAccommodation: ReviewAccommodation) {
        return await this.reservationRepository.checkIfUserStayedInAccommodation(reviewAccommodation);
    }

    public async checkIfUserStayedInHostAccommodation(reviewHost: ReviewHost) {
        return await this.reservationRepository.checkIfUserStayedInHostAccommodation(reviewHost);
    }
}