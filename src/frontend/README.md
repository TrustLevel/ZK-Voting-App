# ZK-Voting-App Frontend

Modern web interface for the ZK-Voting-App - a secure, anonymous voting platform built on Cardano blockchain with zero-knowledge proofs.

## Tech Stack

- **Framework:** Next.js 15.5.4 with App Router
- **React:** 19.1.0
- **Styling:** Tailwind CSS 4
- **Blockchain Integration:** Mesh SDK (Cardano wallet integration)
- **TypeScript:** Full type safety

## Features

### Current Implementation

- **Wallet Integration**
  - Cardano wallet connect (Eternl, Lace, Yoroi)
  - Mesh SDK provider setup
  - Wallet state management

- **Create Voting Event**
  - Modern, clean UI with minimal design
  - Event configuration (name, voting type, dates, options)
  - Custom form validation with yellow accent colors
  - Simple and weighted voting support
  - Native datetime picker integration

- **Pages**
  - Homepage with navigation
  - Create Event flow (form + wallet signature)
  - Join Event (mockup)
  - Manage Event (mockup)
  - Info page (mockup)

### Upcoming Features

- Vote submission with ZK proofs
- Event management dashboard
- Results visualization
- Participant invitation system

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- A Cardano wallet (Eternl, Lace, or Yoroi) for testing

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Run development server on port 3002
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) in your browser.

### Build

```bash
# Create production build
npm run build

# Start production server
npm start
```

## Project Structure

```
app/
├── create/
│   ├── form/          # Event creation form
│   ├── verify/        # Email verification (legacy)
│   └── page.tsx       # Create event entry
├── providers/
│   └── wallet-provider.tsx  # Mesh SDK wallet provider
├── event/[id]/
│   └── manage/        # Event management page
├── join/              # Join event page
├── manage/            # Manage events page
├── info/              # Info/about page
├── page.tsx           # Homepage
├── layout.tsx         # Root layout with wallet provider
└── globals.css        # Global styles

public/
├── TrustLevel_JPG_LOGO.jpg
├── cf-logo.svg        # Cardano logo
└── trustlevel_logo.svg
```

## Configuration

The app runs on port 3002 (configured in `package.json`):

```json
{
  "scripts": {
    "dev": "next dev --turbopack -p 3002"
  }
}
```

## Wallet Integration

The app uses Mesh SDK for Cardano wallet integration. Supported wallets:

- **Eternl** - Full support
- **Lace** - Full support
- **Yoroi** - Full support

Make sure to have at least one wallet extension installed and configured for Preprod testnet.

## Environment

Currently configured for **Cardano Preprod Testnet**.

## Contributing

This is part of the ZK-Voting-App monorepo. See the main README for contribution guidelines.
