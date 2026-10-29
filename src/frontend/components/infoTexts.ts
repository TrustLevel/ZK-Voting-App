/**
 * Plain-language explanations behind the info buttons. One entry per term a
 * first-time organiser or voter meets. Wording follows the landing page and
 * the guides in docs/guides.
 */
export interface InfoText {
  title: string;
  body: string;
}

export const INFO = {
  identityFile: {
    title: 'Your identity file',
    body: 'When you register, your browser creates two random secret numbers: your voting identity. They are kept in this browser and downloaded as a JSON file. The proof that you may vote is computed from these secrets, so you need them again when you vote. Keep the file until the vote has ended and never share it: whoever has it can vote in your place. If you lose the file and this browser\'s data, you cannot vote. The secrets never leave your device.',
  },
  commitment: {
    title: 'Commitment ID',
    body: 'A public fingerprint of your identity. It is the only value sent to the server and becomes your leaf in the group Merkle tree of this event\'s voters. Your secrets cannot be recovered from it.',
  },
  registration: {
    title: 'Registration',
    body: 'Registering adds your commitment to the event\'s voter group. It does not cast a vote. The organiser later publishes the group to the blockchain; only commitments registered before that moment can vote. Register as soon as you can.',
  },
  eventLink: {
    title: 'Your event link',
    body: 'You reached this page through your personal invitation link. Open the same link later to vote. Together with your identity file it lets you continue on another device. Do not forward it: the link is yours alone.',
  },
  inviteValidity: {
    title: 'Invitation links',
    body: 'Each participant receives a personal link by e-mail. It is valid for seven days after sending and must not be forwarded. Participants have to register within that time and before you publish; invitations can be sent only once.',
  },
  publish: {
    title: 'What publishing does',
    body: 'Publishing sends two transactions from your wallet. They write the voter group and the ballot (options, voting type, voting window) to the Cardano blockchain. From then on the voter group, the options and the dates are fixed. Participants who register after publishing cannot vote in this event.',
  },
  twoSignatures: {
    title: 'Two wallet signatures',
    body: 'Your wallet asks you to sign twice. Transaction 1 mints the Group NFT that carries the group Merkle tree of the registered voters. After it has confirmed (about a minute), transaction 2 mints the Semaphore and Voting NFTs that hold the ballot. Both need to confirm on-chain, so keep this window open until the page reports success.',
  },
  network: {
    title: 'Preprod or Mainnet',
    body: 'Preprod is Cardano\'s public test network: it runs on free test ADA from the faucet, nothing of value is at stake, and it is the right place to try the system. Mainnet is the live Cardano network: publishing costs real ADA and you prepay your voters\' transaction fees. The network is fixed when the event is created.',
  },
  feeDeposit: {
    title: 'Fee deposit',
    body: 'On Mainnet the voting service pays the blockchain fee of every vote, so your voters need no wallet. You prepay these fees before publishing: 1.3 ADA for each registered voter, sent from your wallet to the service\'s relay wallet. The deposit is the cost of running the event. An unused remainder is not refunded.',
  },
  adminLink: {
    title: 'Your admin link',
    body: 'This link is the only key to this dashboard; there is no login. Anyone who has it can manage the event, invite participants and publish. Store it like a password.',
  },
  votingType: {
    title: 'Simple or weighted',
    body: 'Simple: every voter picks one option. Weighted: every voter distributes a fixed number of points across the options, for example 100 points as 60 and 40. The smart contract checks that the points add up exactly.',
  },
  votingWindow: {
    title: 'Voting window',
    body: 'Start and end are written to the blockchain when you publish. The smart contract accepts votes only inside this window; a vote outside it is rejected. Leave room between now and the start: publishing takes two transactions of about a minute each.',
  },
  noWallet: {
    title: 'Why you need no wallet',
    body: 'The voting service submits your vote transaction to Cardano and pays its fee. Your browser only produces the proof. Nothing that identifies you, no wallet address, name or e-mail, is written to the blockchain.',
  },
  proofTime: {
    title: 'Why the proof takes about 30 seconds',
    body: 'Your browser computes a zero-knowledge proof: it shows that your identity is in the published group Merkle tree without revealing which member you are, and it binds your choice to a one-time nullifier. This is heavy arithmetic that runs entirely on your device. Nothing is sent until it is finished.',
  },
  oneVote: {
    title: 'One vote per person',
    body: 'Each vote carries a nullifier, a one-time value derived from your identity and this event. It is recorded in a nullifier trie, and the smart contract rejects a second vote with the same nullifier. Which member a nullifier belongs to cannot be derived.',
  },
  resultsTiming: {
    title: 'When results appear',
    body: 'Counts per option stay hidden while voting is open, so that early results do not influence later voters. When the voting window closes, the on-chain tally is shown to everyone. The tally lives on the blockchain and can be recounted by anyone.',
  },
  turnout: {
    title: 'Turnout',
    body: 'How many of the registered voters have voted so far. Only you as the organiser see this while voting is open; voters and the public results page do not.',
  },
  onChainResults: {
    title: 'Results from the blockchain',
    body: 'Every vote is a Cardano transaction verified by the voting contract, and the counts are read from the contract\'s current state. They cannot be edited after the fact; anyone with the voting policy id can recount them.',
  },
  createdEventFixed: {
    title: 'What can still change',
    body: 'Name, options, voting type and network are fixed once the event exists. The voting window is written to the blockchain when you publish. Participants can be added or removed until the invitations are sent.',
  },
} as const satisfies Record<string, InfoText>;
