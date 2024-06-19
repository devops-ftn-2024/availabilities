import moment from "moment";
import { ReservationService } from "../service/reservation-service";
import { AvailabilityRepository } from "../repository/availability-repository";
import { ReservationRepository } from "../repository/reservation-repository";
import { BadRequestError, ForbiddenError, NotFoundError } from "../types/errors";
import { LoggedUser, Role, UsernameDTO } from "../types/user";
import { authorizeGuest, authorizeHost } from "../util/auth";
import { AccommodationAvailability, PriceLevel, Reservation, ReservationStatus } from "../types/availability";
import { validateNewReservation } from "../util/validation";
import { ObjectId } from "mongodb";

jest.mock("../repository/availability-repository");
jest.mock("../repository/reservation-repository");
jest.mock("../util/auth");
jest.mock("../util/validation");

const mockReservations: Reservation[] = [
    {
        _id: new ObjectId(123),
        accommodationId: "accommodationId1",
        username: "guest",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-02-01"),
        price: 100,
        unitPrice: 100,
        status: ReservationStatus.CONFIRMED,
        guests: 2
    },
    {
        _id: new ObjectId(456), 
        accommodationId: "accommodationId2",
        username: "guest",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-02-01"),
        price: 120,
        unitPrice: 120,
        status: ReservationStatus.CONFIRMED,
        guests: 3
    }
];

describe("ReservationService", () => {
    let reservationService;
    let availabilityRepositoryMock;
    let reservationRepositoryMock: jest.Mocked<ReservationRepository>;

    beforeAll(() => {
        process.env.MONGO_URI = 'mongodb://localhost:27017/test';
        process.env.MONGO_DB_NAME = 'test';
    });

    beforeEach(() => {
        availabilityRepositoryMock = new AvailabilityRepository() as jest.Mocked<AvailabilityRepository>;
        reservationRepositoryMock = new ReservationRepository() as jest.Mocked<ReservationRepository>;
        reservationService = new ReservationService();

        (reservationService as any).availabilityRepository = availabilityRepositoryMock;
        (reservationService as any).reservationRepository = reservationRepositoryMock;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getReservations", () => {
        it("should authorize guest and return reservations", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservations.mockResolvedValue(mockReservations as any);

            const result = await reservationService.getReservations(loggedUser);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservations).toHaveBeenCalledWith(loggedUser.username);
            expect(result).toBe(mockReservations);
        });
    });

    describe("createReservation", () => {
        it("should authorize guest, validate reservation, and create new reservation", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const accommodationId = "123";
            const reservation: Partial<Reservation> = {
                _id: new ObjectId(123),
                startDate: new Date("2023-01-01"),
                endDate: new Date("2023-02-10"),
                price: 100,
                guests: 2
            };
            const accommodationAvailability = {
                accommodationId: accommodationId,
                ownerUsername: "host",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };
            const availabilities = [] as any[];
            const unitPrice = 100;

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            (validateNewReservation as jest.Mock).mockImplementation(() => {});
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);
            availabilityRepositoryMock.getAvailabilities.mockResolvedValue(availabilities);
            jest.spyOn(reservationService as any, "checkAvailabilityOfAccommodation").mockResolvedValue(unitPrice);

            await reservationService.createReservation(loggedUser, accommodationId, reservation);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(validateNewReservation).toHaveBeenCalledWith(reservation);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(accommodationId);
            expect(availabilityRepositoryMock.getAvailabilities).toHaveBeenCalledWith(
                accommodationId,
                moment.utc(reservation.startDate, 'DD-MM-YYYY').toDate(),
                moment.utc(reservation.endDate, 'DD-MM-YYYY').toDate()
            );
            expect(reservationRepositoryMock.insertNewReservation).toHaveBeenCalled();
        });

        it("should throw NotFoundError if accommodation is not found", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const accommodationId = "accommodationId";
            const reservation: Partial<Reservation> = {
                startDate: new Date("01-01-2023"),
                endDate:  new Date("10-01-2023"),
                price: 100,
                guests: 2
            };

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            (validateNewReservation as jest.Mock).mockImplementation(() => {});
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(null);

            await expect(reservationService.createReservation(loggedUser, accommodationId, reservation))
                .rejects
                .toThrow(NotFoundError);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(validateNewReservation).toHaveBeenCalledWith(reservation);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(accommodationId);
        });
    });

    describe("getAccommodationReservations", () => {
        it("should authorize host and return accommodation reservations", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const accommodationId = "123";
            const accommodationAvailability = {
                accommodationId: new ObjectId(123),
                ownerUsername: "host",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };
            const reservations: Reservation[] = [] as any;

            (authorizeHost as jest.Mock).mockImplementation(() => {});
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);
            reservationRepositoryMock.getAccommodationReservations.mockResolvedValue(reservations);

            const result = await reservationService.getAccommodationReservations(loggedUser, accommodationId);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(accommodationId);
            expect(reservationRepositoryMock.getAccommodationReservations).toHaveBeenCalledWith(accommodationId);
            expect(result).toBe(reservations);
        });

        it("should throw NotFoundError if accommodation is not found", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const accommodationId = "accommodationId";

            (authorizeHost as jest.Mock).mockImplementation(() => {});
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(null);

            await expect(reservationService.getAccommodationReservations(loggedUser, accommodationId))
                .rejects
                .toThrow(NotFoundError);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(accommodationId);
        });

        it("should throw ForbiddenError if logged user is not the owner of the accommodation", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const accommodationId = "123";
            const accommodationAvailability = {
                accommodationId: new ObjectId(123),
                ownerUsername: "differentHost",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };

            (authorizeHost as jest.Mock).mockImplementation(() => {});
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);

            await expect(reservationService.getAccommodationReservations(loggedUser, accommodationId))
                .rejects
                .toThrow(ForbiddenError);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(accommodationId);
        });
    });

    describe("confirmReservation", () => {
        it("should authorize host and confirm reservation", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const reservationId = "123";
            const reservation: Reservation = {
                _id: new ObjectId(123),
                accommodationId: "accommodationId",
                username: "guest",
                startDate: new Date(),
                endDate: new Date(),
                price: 100,
                status: ReservationStatus.PENDING,
                guests: 5,
                unitPrice: 100
            };
            const accommodationAvailability = {
                accommodationId: new ObjectId(123),
                ownerUsername: "host",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };

            (authorizeHost as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation as Reservation);
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);
            reservationRepositoryMock.updateReservationStatus.mockResolvedValue(undefined);
            reservationRepositoryMock.getCancelReservationsWithinTimeframe.mockResolvedValue(undefined);
            availabilityRepositoryMock.getAvailabilities.mockResolvedValue([]);

            await reservationService.confirmReservation(loggedUser, reservationId);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(reservation.accommodationId);
            expect(reservationRepositoryMock.updateReservationStatus).toHaveBeenCalledWith(reservationId, ReservationStatus.CONFIRMED);
        });

        it("should throw NotFoundError if reservation is not found", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const reservationId = "reservationId";

            (authorizeHost as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(null);

            await expect(reservationService.confirmReservation(loggedUser, reservationId))
                .rejects
                .toThrow(NotFoundError);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });

        it("should throw ForbiddenError if logged user is not the owner of the accommodation", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const reservationId = "123";
            const reservation = { accommodationId: "accommodationId" };
            const accommodationAvailability = {
                accommodationId: new ObjectId(123),
                ownerUsername: "differentHost",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };
            
            (authorizeHost as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation as Reservation);
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);

            await expect(reservationService.confirmReservation(loggedUser, reservationId))
                .rejects
                .toThrow(ForbiddenError);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
            expect(availabilityRepositoryMock.getAccommodation).toHaveBeenCalledWith(reservation.accommodationId);
        });

        it("should throw BadRequestError if reservation is already confirmed", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const reservationId = "123";
            const reservation: Reservation = {
                _id: new ObjectId(123),
                accommodationId: "accommodationId",
                username: "host",
                startDate: new Date(),
                endDate: new Date(),
                price: 100,
                status: ReservationStatus.CONFIRMED,
                guests: 5,
                unitPrice: 100
            };
            const accommodationAvailability = {
                accommodationId: "accommodationId",
                ownerUsername: "host",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };
    
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation as Reservation);
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);
    
            await expect(reservationService.confirmReservation(loggedUser, reservationId))
                .rejects
                .toThrow(BadRequestError);
    
            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });

        it("should throw BadRequestError if reservation is cancelled", async () => {
            const loggedUser: LoggedUser = { username: "host", role: Role.HOST };
            const reservationId = "123";
            const reservation: Reservation = {
                _id: new ObjectId(123),
                accommodationId: "accommodationId",
                username: "host",
                startDate: new Date(),
                endDate: new Date(),
                price: 100,
                status: ReservationStatus.CANCELLED,
                guests: 5,
                unitPrice: 100
            };
            const accommodationAvailability = {
                accommodationId: "accommodationId",
                ownerUsername: "host",
                priceLevel: PriceLevel.perGuest,
                location: "Your Location",
                minCapacity: 1,
                maxCapacity: 5,
                confirmationNeeded: false
            };

            (authorizeHost as jest.Mock).mockImplementation(() => {});

            reservationRepositoryMock.getReservation.mockResolvedValue(reservation as Reservation);
            availabilityRepositoryMock.getAccommodation.mockResolvedValue(accommodationAvailability);

            await expect(reservationService.confirmReservation(loggedUser, reservationId))
                .rejects
                .toThrow(BadRequestError);

            expect(authorizeHost).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });
    });

    describe("cancelReservation", () => {
        it("should authorize guest and cancel reservation", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const reservationId = "reservationId";
            const reservation = { username: "guest", startDate: new Date(Date.now() + 186400000) } as Reservation;

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation);
            jest.spyOn(reservationService as any, "cancelReservationObj").mockResolvedValue(undefined);

            await reservationService.cancelReservation(loggedUser, reservationId);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
            expect(reservationService["cancelReservationObj"]).toHaveBeenCalledWith(reservation);
        });

        it("should throw NotFoundError if reservation is not found", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const reservationId = "reservationId";

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(null);

            await expect(reservationService.cancelReservation(loggedUser, reservationId))
                .rejects
                .toThrow(NotFoundError);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });

        it("should throw ForbiddenError if logged user is not the owner of the reservation", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const reservationId = "reservationId";
            const reservation = { username: "differentGuest" };

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation as Reservation);

            await expect(reservationService.cancelReservation(loggedUser, reservationId))
                .rejects
                .toThrow(ForbiddenError);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });

        it("should throw BadRequestError if cancellation is attempted the day before start date", async () => {
            const loggedUser: LoggedUser = { username: "guest", role: Role.GUEST };
            const reservationId = "123";
            const tomorrow = new Date(Date.now() + 86400000);
            const reservation: Reservation = {
                _id: new ObjectId(123),
                accommodationId: "accommodationId",
                username: "guest",
                startDate: tomorrow,
                endDate: new Date(tomorrow.getTime() + 86400000), 
                price: 100, 
                unitPrice: 100, 
                status: ReservationStatus.CONFIRMED, 
                guests: 2 
            };

            (authorizeGuest as jest.Mock).mockImplementation(() => {});
            reservationRepositoryMock.getReservation.mockResolvedValue(reservation);

            await expect(reservationService.cancelReservation(loggedUser, reservationId))
                .rejects
                .toThrow(BadRequestError);

            expect(authorizeGuest).toHaveBeenCalledWith(loggedUser.role);
            expect(reservationRepositoryMock.getReservation).toHaveBeenCalledWith(reservationId);
        });
    });
});
