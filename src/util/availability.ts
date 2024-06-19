import moment from "moment";
import { Availability, Slot } from "../types/availability";

export const extractDatesWithPrices = (availabilities: Availability[], startDateQuery: moment.Moment, endDateQuery: moment.Moment): Slot[] => {
    let datesWithPrices = [];
  
    availabilities.forEach((availability) => {
      const availabilityStartDate = moment(availability.startDate);
      const availabilityEndDate = moment(availability.endDate);
      let currentDate = startDateQuery.isAfter(availabilityStartDate) ? startDateQuery.clone() : availabilityStartDate.clone();
      const endDate =  endDateQuery.isBefore(availabilityEndDate) ? endDateQuery : availabilityEndDate;
      const price = availability.price;
  
      while (currentDate.isSameOrBefore(endDate)) {
        datesWithPrices.push({
          date: currentDate.format('YYYY-MM-DD'),
          price: price
        });
        currentDate.add(1, 'days');
      }
    });
  
    return datesWithPrices;
  };


  export const extractDatesFromTimeframe = (startDate: moment.Moment, endDate: moment.Moment): Slot[] => {
    let datesWithPrices = [];
    let currentDate = startDate.clone();
  
    while (currentDate.isSameOrBefore(endDate)) {
      datesWithPrices.push({
        date: currentDate.format('YYYY-MM-DD'),
        price: 0
      });
      currentDate.add(1, 'days');
    }
  
    return datesWithPrices;
  }

  export interface ReviewAccommodation {
    accommodationId: string,
    reviewerUsername: string,
  }

  export interface ReviewHost {
    hostUsername: string,
    reviewerUsername: string
  }