/**
 * Site-wide settings that are not part of the audit engine.
 *
 * NEXT_PUBLIC_BOOKING_URL: where "Book a call" and "Talk to our team" buttons
 * go (a Calendly link, a contact page, a mailto: address). Until it is set,
 * those buttons lead to the free audit form.
 */
export const bookingUrl = process.env.NEXT_PUBLIC_BOOKING_URL || "/#audit";
