import moment from "moment";
import { Availability } from "../types/availability";

export const extractDatesWithPrices = (availabilities: Availability[], startDateQuery: moment.Moment, endDateQuery: moment.Moment) => {
    let datesWithPrices = [];
  
    availabilities.forEach((availability) => {
      const availabilityStartDate = moment(availability.startDate);
      const availabilityEndDate = moment(availability.endDate);
      let currentDate = startDateQuery.isAfter(availabilityStartDate) ? startDateQuery : availabilityStartDate;
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