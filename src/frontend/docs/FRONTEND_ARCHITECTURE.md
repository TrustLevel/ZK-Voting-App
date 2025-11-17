# Frontend Architecture & Integration Plan

**Project**: ZK-Voting-App
**Status**: 2025-11-12 (Updated)
**Branch**: dev/dom (Frontend), dev/ash (Backend)

---

## 🎯 Current State

### ✅ Implemented (Frontend)

#### 1. **Event Creation Flow** (`/app/create/page.tsx`)
- Event Name Input
- Wallet Connection (Mesh SDK)
- Event Publishing with Admin Token Generation
- Navigation to Dashboard after Publishing

#### 2. **Event Management Dashboard** (`/app/manage/[eventId]/page.tsx`)

**Design System:**
- Consistent Box Design with Icons, Titles and Descriptions
- Compact Lists (participants, results) with `space-y-2`
- Unified Color Scheme: Gray-900 for Primary, Yellow-600 for Actions
- Neutral Statistics Badges (Gray-100)
- LoadingSpinner as Reusable Component
- Max-Width: `max-w-3xl`

**Layout Structure:**
- Logo (400x400px)
- Admin Dashboard Box (combined with Steps)
  - Admin Info with Icon (w-12 h-12, bg-gray-100)
  - Admin Link with Copy Function
  - Step Navigation (4 Steps with Icons, compact: w-12 h-12)
- Tab Content (4 Tabs)

**Tab 1: Configure Parameters**
- Voting Configuration Box
  - Icon + Title + Description
  - Voting Type Selection (Simple/Weighted)
  - Weight Input (only for Weighted)
- Voting Options Box
  - Icon + Title + Description
  - Dynamic Options with Yellow Remove Buttons
  - Add Option Button
- Save Parameters Button (with LoadingSpinner)

**Tab 2: Invite Participants**
- Invite Box with Email Input
- Participant List
  - Compact Cards (border-2 rounded-lg p-3)
  - Status Icons (Registered/Pending)
  - Statistics Badges (Total/Registered/Pending)
  - Yellow Remove Buttons
  - Empty State for no Participants

**Tab 3: Start Voting**
- Voting Period Box
  - Icon + Title + Description
  - Start/End Date Inputs (datetime-local)
- Blockchain Transaction Preview
  - Event ID, Name, Dates (POSIX), Wallet Address
- Wallet Connection Status
- Sign & Start Button (with LoadingSpinner)
- Published Success State with Blockchain Verification

**Tab 4: Voting Results**
- Voting Statistics Box
  - Icon + Title + Description
  - Ended Date, Total Votes, Registered Voters (in one line)
- Results by Option Box
  - Icon + Title + Description
  - Compact List (border-2 rounded-lg p-3)
  - Votes/Percentage depending on Voting Type
- Blockchain Verification Info
- Download/Share Buttons

#### 3. **Security Features**
- Admin Token System (temporarily disabled for local dev)
- Event ID as URL Parameter
- Admin Link with Token for Dashboard Access
- Wallet Signature for Event Start (✅ implemented)
  - Signs: eventId, eventName, startingDate, endingDate, walletAddress, timestamp
  - Uses Mesh SDK wallet.signData()
  - Sends signature + publicKey to Backend
  - POSIX timestamps for Blockchain Compatibility

---

## 🏗️ Backend Structure (by Ash)

### **Stack**
- Framework: NestJS
- Database: SQLite3 with TypeORM
- Port: 3000 (default)
- CORS: Enabled for http://localhost:3000

### **Database Schema**

#### **User Table**
```typescript
{
  userId: number              // PK, Auto-increment
  userEmail: string           // Unique
  eventPermissions: string    // JSON: [(event_id, commitment_hash), ...]
}
```

#### **VotingEvent Table**
```typescript
{
  eventId: number                     // PK, Auto-increment
  eventName: string
  votingNft: string
  votingValidatorAddress: string
  votingPower: number
  options: string                     // JSON: [(int, int, string), ...]
  adminUserId: number                 // FK -> User
  startingDate: number                // POSIX timestamp
  endingDate: number                  // POSIX timestamp
  groupNft: string
  groupValidatorAddress: string
  groupMerkleRootHash: string
  groupLeafCommitments: string        // JSON array
  groupSize: number
  semaphoreNft: string
  semaphoreAddress: string
  nullifierMerkleTree: string
  nullifierLeafCommitments: string    // JSON array
  verificationReferenceInput: string
  currentVoteCount: string            // JSON: [(int, int, string), ...]
}
```

### **Module Structure**
```
src/backend/src/
├── auth/           # Authentication (still empty)
├── users/          # User Management
├── voting-event/   # Voting Events
└── app.module.ts
```

### ⚠️ **Backend Status**
- ✅ Database Entities defined
- ✅ Modules created
- ❌ **API Endpoints NOT yet implemented**

---

## 🔌 API Integration Plan

### **Required API Endpoints**

#### 1. **Event Management**

##### **POST /api/voting-event/create**
```typescript
Request:
{
  eventName: string;
  votingType: 'simple' | 'weighted';
  votingPower: number;              // Weight for weighted voting
  options: string[];                // ['Option 1', 'Option 2', ...]
  walletAddress: string;            // Creator wallet address
  signature: string;                // Wallet signature
  publicKey: string;                // Wallet public key
}

Response:
{
  eventId: string;
  adminToken: string;               // For Dashboard access
  adminLink: string;                // Dashboard URL with Token
  blockchainData: {
    eventName: string;
    votingType: 'simple' | 'weighted';
    weight: number;
    options: string[];
    creatorAddress: string;
    timestamp: number;
    signature: string;
    publicKey: string;
  }
}
```

##### **GET /api/voting-event/:eventId?adminToken=xxx**
```typescript
Response:
{
  eventId: string;
  eventName: string;
  votingType: 'simple' | 'weighted';
  votingPower: number;
  options: string[];
  adminUserId: number;
  startingDate: number | null;      // null if not yet started
  endingDate: number | null;
  status: 'draft' | 'active' | 'ended';
  createdAt: number;
  blockchainData: {
    creatorAddress: string;
    signature: string;
    publicKey: string;
  }
}
```

##### **POST /api/voting-event/:eventId/start**
```typescript
Request:
{
  startDate: string;                // ISO timestamp
  endDate: string;                  // ISO timestamp
  walletAddress: string;
  signature: string;                // Wallet signature for Start
  adminToken: string;
}

Response:
{
  success: boolean;
  message: string;
  votingEvent: {
    eventId: string;
    status: 'active';
    startingDate: number;
    endingDate: number;
  }
}
```

#### 2. **Participant Management**

##### **POST /api/voting-event/:eventId/participants**
```typescript
Request:
{
  email: string;
  adminToken: string;
}

Response:
{
  participantId: string;
  email: string;
  uniqueToken: string;              // For Voting-Link
  votingLink: string;               // http://localhost:3000/vote/:eventId?token=xxx
  status: 'pending';
}
```

##### **GET /api/voting-event/:eventId/participants?adminToken=xxx**
```typescript
Response:
{
  participants: [
    {
      participantId: string;
      email: string;
      status: 'pending' | 'registered';
      registeredAt: number | null;
      votedAt: number | null;
    }
  ],
  stats: {
    total: number;
    registered: number;
    pending: number;
    voted: number;
  }
}
```

##### **DELETE /api/voting-event/:eventId/participants/:participantId**
```typescript
Request Headers:
{
  adminToken: string;
}

Response:
{
  success: boolean;
  message: string;
}
```

#### 3. **Authentication** (Later)

##### **POST /api/auth/wallet-sign-in**
```typescript
Request:
{
  walletAddress: string;
  signature: string;
  message: string;
}

Response:
{
  userId: number;
  userEmail: string | null;
  sessionToken: string;
}
```

---

## 📋 Frontend Integration TODOs

### **Phase 1: API Service Layer** (Priority: High)

1. **Create API Service** (`/lib/api/voting-api.ts`)
   ```typescript
   - createEvent()
   - getEvent()
   - startEvent()
   - addParticipant()
   - getParticipants()
   - removeParticipant()
   ```

2. **Create API Client** (`/lib/api/client.ts`)
   - Axios/Fetch wrapper
   - Base URL configuration
   - Error handling
   - Request/Response interceptors

3. **Environment Configuration** (`.env.local`)
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3000
   NEXT_PUBLIC_FRONTEND_URL=http://localhost:3001
   ```

### **Phase 2: State Management** (Priority: Medium)

1. **React Context for Event State** (`/contexts/EventContext.tsx`)
   - Current Event
   - Participants
   - Loading States
   - Error States

2. **Custom Hooks** (`/hooks/`)
   - `useEvent(eventId)`
   - `useParticipants(eventId)`
   - `useCreateEvent()`
   - `useStartEvent()`

### **Phase 3: Integration into Existing Components** (Priority: High)

#### 1. **Event Creation** (`/app/create/page.tsx`)
```typescript
// Instead of sessionStorage:
const handlePublish = async () => {
  try {
    const signature = await wallet.signData(...);

    const response = await createEvent({
      eventName,
      votingType,
      votingPower,
      options,
      walletAddress,
      signature,
      publicKey
    });

    // Redirect with Server-Response
    router.push(`/manage/${response.eventId}?adminToken=${response.adminToken}`);
  } catch (error) {
    // Error handling
  }
};
```

#### 2. **Event Dashboard** (`/app/manage/[eventId]/page.tsx`)
```typescript
useEffect(() => {
  const fetchEvent = async () => {
    try {
      const event = await getEvent(eventId, adminToken);
      setCreatedEvent(event);

      const participantsData = await getParticipants(eventId, adminToken);
      setParticipants(participantsData.participants);
    } catch (error) {
      // Error handling
    }
  };

  fetchEvent();
}, [eventId, adminToken]);
```

#### 3. **Participant Management**
```typescript
const addParticipant = async () => {
  try {
    const response = await addParticipant(eventId, {
      email: newParticipantEmail,
      adminToken
    });

    // Update local state
    setParticipants([...participants, response]);
    setNewParticipantEmail('');
  } catch (error) {
    alert('Failed to add participant');
  }
};
```

#### 4. **Start Voting**
```typescript
const handleStartVoting = async () => {
  try {
    const signature = await wallet.signData(...);

    const response = await startEvent(eventId, {
      startDate,
      endDate,
      walletAddress,
      signature,
      adminToken
    });

    alert('Voting started successfully!');
    // Refresh event data
  } catch (error) {
    alert('Failed to start voting');
  }
};
```

### **Phase 4: Error Handling & UX** (Priority: Medium)

1. **Loading States**
   - Spinner during API Calls
   - Skeleton Screens for Lists
   - Disabled States for Buttons during Loading

2. **Error Handling**
   - Toast Notifications for Errors
   - Error Boundaries
   - Retry Logic

3. **Validation**
   - Frontend Validation before API Calls
   - Display Backend Error Messages

### **Phase 5: Testing** (Priority: Low)

1. **Unit Tests**
   - API Service Functions
   - Custom Hooks
   - Component Logic

2. **Integration Tests**
   - Complete User Flows
   - API Mock Responses

---

## 🎨 Open UI/UX Questions

1. **Participant Registration Flow**
   - How do participants register? (Email-Link → Registration Page?)
   - Do we need a `/register?token=xxx` page?

2. **Voting Flow**
   - `/vote/[eventId]?token=xxx` Page not yet implemented
   - What does the Voting UI look like?

3. **Results Display**
   - Live Results during Voting or only after End?
   - Chart/Graph Library? (recharts, chart.js?)

4. **Email Notifications**
   - Are Emails sent by Backend or manually copied?
   - Email Templates?

---

## 📦 Dependencies to Install

```bash
# API Client
npm install axios
# or
npm install @tanstack/react-query  # for better API State Management

# Toast Notifications
npm install react-hot-toast
# or
npm install sonner

# Chart Library (for Results)
npm install recharts
```

---

## 🔄 Next Steps

### **Immediately** (coordinate with Ash)
1. [ ] Ash: Implement API Endpoints (at least MVP endpoints)
2. [ ] Dom: Create API Service Layer
3. [ ] Dom: Environment Config (.env.local)
4. [ ] Both: Finalize API Contract (Request/Response Types)

### **This Week**
1. [ ] Test Frontend-Backend Integration
2. [ ] Create Participant Registration Page
3. [ ] Implement Voting Page (`/vote/[eventId]`)
4. [ ] Error Handling & Loading States

### **Next Week**
1. [ ] Implement Results Page
2. [ ] Email Notification System
3. [ ] End-to-End Testing
4. [ ] Production Deployment Preparation

---

## 📝 Notes

### **Mock Data vs. Real API**
- Currently: Mock Data in Frontend
- Next Step: API Integration with Feature Flags
- Later: Remove Mock Data

### **Blockchain Integration**
- Event Publishing: Wallet Signature ✓
- Event Start: Wallet Signature ✓
- Voting: ZK-Proof still to be implemented
- Results: On-Chain Verification

### **Security Considerations**
- Admin Token: 64-char hex (sufficient for MVP)
- Later: JWT Tokens with Expiration
- Wallet Signature Verification in Backend
- Rate Limiting for API Endpoints

---

**Last Updated**: 2025-11-12
**Created by**: Dom & Claude
**For Questions**: see `dev/dom` Branch
