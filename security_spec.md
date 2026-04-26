# Firestore Security Invariants

1. **User Profiles**: Only the owner can write to their profile. Anyone can read basic profile info (display name) if needed, but for now, let's keep it private to the user themselves.
2. **Bookings**:
    - Creation: Only authenticated users can create bookings. `userId` must match `request.auth.uid`.
    - Reading: Users can only list their own bookings.
    - Updating: Only the owner can update status (e.g., cancel). `createdAt` and `userId` are immutable.
    - Path Hardening: Document IDs must be alphanumeric.

# Dirty Dozen Payloads (Rejection Tests)

1. Identity Spoofing: Creating a booking with `userId` of another user.
2. Field Injection: Adding `isAdmin: true` to a user document.
3. Path Poisoning: Using a 2KB string as a booking ID.
4. Timestamp Spoofing: Providing a hardcoded `createdAt` in the past instead of `request.time`.
5. PII Leak: Authenticated user A trying to fetch authenticated user B's profile.
6. Status Shortcut: Directly setting a booking to "completed" without actual usage (hypothetical).
7. Resource Exhaustion: Sending a booking with 1MB of "junk" in the room name.
8. Update Gap: Updating `userId` on an existing booking.
9. Orphaned Booking: Creating a booking for a non-existent room ID (requires room collection check if rooms were DB-driven, but rooms are currently mock data).
10. Anonymous Write: Unauthenticated user trying to book.
11. List Scraping: Fetching all bookings without a `userId` filter.
12. Terminal Overwrite: Updating a "cancelled" booking back to "active".
