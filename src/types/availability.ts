import { ObjectId } from "mongodb";

export interface AccommodationAvailability {
    _id?: string;
    accommodationId: string;
    ownerUsername: string;
    priceLevel: PriceLevel;
    location: string;
    minCapacity: number;
    maxCapacity: number;
    availabilities: Availability[];
}

export interface Reservation {
    _id?: string;
    accommodationId: string;
    username: string;
    startDate: Date;
    endDate: Date;
    price: number;
    status: ReservationStatus;
}

export interface Availability {
    _id?: string | ObjectId;
    startDate: Date;
    endDate: Date;
    price: number;
    dateCreated: Date;
    valid: boolean;
}

export enum PriceLevel {
    perGuest = 'perGuest',
    perAccommodation = 'perAccommodation'
}

export enum ReservationStatus {
    PENDING = 'Pending',
    CONFIRMED = 'Confirmed',
    CANCELLED = 'Cancelled',
    REJECTED = 'Rejected'
}

export type AvailabilityUpdate =  Partial<Availability>;