ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_seats_range" CHECK (seats BETWEEN 1 AND 12);
ALTER TABLE "Ride" ADD CONSTRAINT "ride_capacity_range" CHECK (capacity BETWEEN 1 AND 12), ADD CONSTRAINT "ride_price_positive" CHECK (price > 0), ADD CONSTRAINT "ride_route_array" CHECK (jsonb_typeof(route) = 'array' AND jsonb_array_length(route) >= 2);
ALTER TABLE "RideSeries" ADD CONSTRAINT "series_capacity_range" CHECK (capacity BETWEEN 1 AND 12), ADD CONSTRAINT "series_price_positive" CHECK (price > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "booking_seats_range" CHECK (seats BETWEEN 1 AND 12), ADD CONSTRAINT "booking_contribution_positive" CHECK (contribution > 0);
ALTER TABLE "Review" ADD CONSTRAINT "review_rating_range" CHECK (rating BETWEEN 1 AND 5), ADD CONSTRAINT "review_not_self" CHECK ("authorId" <> "subjectId");
ALTER TABLE "Block" ADD CONSTRAINT "block_not_self" CHECK ("blockerId" <> "blockedId");
ALTER TABLE "Conversation" ADD CONSTRAINT "conversation_one_parent" CHECK (num_nonnulls("bookingId", "rideId", "seriesId") = 1);
ALTER TABLE "LocationUpdate" ADD CONSTRAINT "location_coordinate_range" CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);
ALTER TABLE "Waypoint" ADD CONSTRAINT "waypoint_coordinate_range" CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);
