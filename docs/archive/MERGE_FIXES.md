# Backend Merge Fixes

This document tracks backend changes made after merging `main` into `dev/dom` to resolve compatibility issues between the new main branch implementation and the existing dev/dom frontend.

## Date: 2026-02-03

### Issue 1: Type Mismatch in Token Validation

**Problem:**
After merging main, the `addParticipant` endpoint changed from accepting `userId` to accepting `token`. The backend validates the token by comparing `invitationToken.eventId` (number from database) with `eventId` (from URL param, which NestJS may pass as string). The strict equality check `!==` failed due to type mismatch.

**Error:**
```
Error: Invitation token is not valid for this event
  at VotingEventService.addParticipant (voting-event.service.ts:126)
```

**Root Cause:**
```typescript
// Line 125 in voting-event.service.ts
if (invitationToken.eventId !== eventId) {  // number !== string = always true
  throw new Error('Invitation token is not valid for this event');
}
```

**Fix:**
```typescript
// Line 125 in voting-event.service.ts
if (invitationToken.eventId !== Number(eventId)) {  // Explicit type conversion
  throw new Error('Invitation token is not valid for this event');
}
```

**File:** `src/backend/src/voting-event/voting-event.service.ts:125`

**Status:** ✅ Fixed

---

### Issue 2: Token Validation vs Registration Status Confusion

**Problem:**
Token validation and registration status were conflated. When a user returned after registration, the `validateToken` endpoint returned `{ valid: false, error: "Token has already been used" }`, causing the frontend to show an error and preventing the registration status check from running (no `userId` returned).

**Error:**
```
Token validation failed: "Token has already been used"
Frontend: "You need to complete your registration first"
Backend: User is already registered
```

**Root Cause:**
- Backend treated "used" token as invalid (authentication failure)
- Frontend couldn't get `userId` from "invalid" token response
- Registration check `useEffect` required `validatedUserId` → didn't run
- User appeared as unregistered despite being registered in backend

**Design Issue:**
Mixed two separate concerns:
1. **Token Authentication** - Is this token authentic? (immutable)
2. **Registration Status** - Has user registered? (mutable, checked via separate endpoint)

**Fix:**
Separated concerns with clean architecture:

**Backend (`validateToken`):**
```typescript
// Before:
if (invitationToken.used) {
  return { valid: false, error: 'Token has already been used' };
}

// After:
// Token is authentic - return user info
// "used" flag is informational only, not an error
return {
  valid: true,
  used: invitationToken.used,  // Info flag
  userId: invitationToken.userId,  // Always return for auth
  eventId: invitationToken.eventId,
  email: invitationToken.email,
};
```

**Frontend:**
- Token validation = Get `userId` for authentication (always works for authentic tokens)
- Registration check = Separate call to `GET /voting-event/:eventId/participants`
- No error handling for "used" tokens (expected state)

**File:** `src/backend/src/voting-event/voting-event.service.ts:391-436`

**Status:** ✅ Fixed

---

## Summary of Changes

### Modified Files
- `src/backend/src/voting-event/voting-event.service.ts` - Fixed type comparison in `addParticipant` method

### Frontend Changes Made
The following frontend changes were made to work with the new backend API:

1. **Token Handling** (`src/frontend/app/event/[id]/page.tsx`)
   - Added `validatedToken` state to store the invitation token
   - Modified `registerCommitmentToBackend` to send `{ token, commitment }` instead of `{ userId, commitment }`
   - Removed userId from localStorage storage
   - Changed localStorage keys to use token instead of userId:
     - `identity_${eventId}_${validatedToken}` (was: `identity_${eventId}_${validatedUserId}`)
     - `has_voted_${eventId}_${validatedToken}` (was: `has_voted_${eventId}_${validatedUserId}`)
     - `token_${eventId}` (new: stores validated token)
   - UserId now only exists in runtime state (from backend validation) for registration checks

### Testing Checklist
- [x] Token validation works
- [x] User registration with commitment works
- [x] Token marked as used after registration
- [x] Multiple users can register for same event with different tokens
- [x] localStorage uses token-based keys instead of userId
- [x] Identity can be restored from localStorage on page reload
- [x] "Used" tokens return userId (authentication vs registration separated)
- [x] Registration status checked independently via participants endpoint
- [x] User can return after registration and vote (no "token used" error)
- [x] Voting status persists correctly across sessions
- [x] Identity file downloads automatically after generation
- [x] Two-step registration flow (generate → register) works
- [x] Warning messages display correctly
- [x] Identity can be restored from uploaded file
- [x] Upload appears when registered but no identity (multi-device support)
- [x] File validation (eventId check, commitment verification)

---

## Design Decisions

### localStorage Key Structure

**Decision:** Use `identity_${eventId}_${token}` instead of just `identity_${eventId}`

**Rationale:**
- Supports multiple identities per user for same event (different roles/invitations)
- Better privacy isolation between different invitation tokens
- Aligns with token-based security model

**Trade-off:**
- User needs token link to restore identity from localStorage
- Not an issue in practice: users access via invitation link anyway
- Identity file download provides cross-device backup

**Spec deviation noted but justified:** Original Frontend_Changes.md suggested simpler key without token, but our implementation provides better multi-token support while still meeting core requirement ("allows voting without re-uploading file")

### Separation of Concerns: Token Authentication vs Registration Status

**Decision:** Token validation returns authentication info, not registration status

**Problem it solves:**
- "Used" tokens are authentic (user can return and vote)
- Registration status is separate concern (checked via participants endpoint)
- Frontend needs `userId` even for "used" tokens to check registration

**Implementation:**
- `validateToken`: Returns `{ valid: true, used: true, userId }` for authentic tokens
- Registration check: Separate `GET /participants` call
- Frontend: No error for "used" tokens (expected state after registration)

**Benefits:**
- Clean separation: Authentication ≠ Authorization
- Users can return after registration without errors
- Registration status checked at source of truth (participants list)
- Token "used" flag is informational, not blocking
