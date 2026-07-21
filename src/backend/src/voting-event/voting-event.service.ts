import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
// @ts-ignore - types not exported from deep path, runtime resolves correctly
import { Group } from 'modp-semaphore-bls12381/packages/typescript/lib/group';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { v4 as uuidv4 } from 'uuid';
import { deserializeDatum } from '@meshsdk/core';

interface CreateVotingEventDto {
  eventName: string;
  groupMerkleRootHash: string;
  groupLeafCommitments?: string;
  groupSize: number;
  votingNft?: string | null;
  votingValidatorAddress?: string | null;
  votingPower?: number | null;
  options?: string | null;
  adminUserId?: number | null;
  startingDate?: number | null;
  endingDate?: number | null;
  groupNft?: string | null;
  groupValidatorAddress?: string | null;
  semaphoreNft?: string | null;
  semaphoreAddress?: string | null;
  nullifierMerkleTree?: string | null;
  nullifierLeafCommitments?: string | null;
  verificationReferenceInput?: string | null;
  currentVoteCount?: string | null;
  mintingOrefTxHash?: string | null;
  mintingOrefIndex?: number | null;
  vkeyRefTxHash?: string | null;
  vkeyRefIndex?: number | null;
}

@Injectable()
export class VotingEventService {
  // LevelDB allows only one open handle per path. Caching the Store instance per event
  // prevents LOCK contention when insertNullifier and rollbackNullifier are called in
  // rapid succession (e.g. user cancels wallet signature and immediately retries).
  private readonly nullifierStores = new Map<number, any>();

  constructor(
    @InjectRepository(VotingEvent)
    private votingEventRepository: Repository<VotingEvent>,
    @InjectRepository(InvitationToken)
    private invitationTokenRepository: Repository<InvitationToken>,
    private configService: ConfigService,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  private async getNullifierStore(eventId: number): Promise<any> {
    if (!this.nullifierStores.has(eventId)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Store } = require('@aiken-lang/merkle-patricia-forestry');
      const store = new Store(`nullifiers-db/${eventId}`);
      await store.ready();
      this.nullifierStores.set(eventId, store);
    }
    return this.nullifierStores.get(eventId)!;
  }

  async createBasicVotingEvent(
    eventName: string,
    options: string[], // Changed to array of option strings
    startingDate: number,
    endingDate: number,
    votingPower: number, // 1 = simple vote (one vote per user), >1 = weighted vote (distribute voting power across options)
    adminUserId: number | null,
  ): Promise<VotingEvent> {
    // Generate random event ID (between 1 billion and 9 billion)
    const randomEventId = Math.floor(Math.random() * 8000000000) + 1000000000;

    // Create an empty Semaphore Group to get the initial merkle root
    const treeDepth = 20; // Tree depth (supports up to 2^20 members)
    const group = new Group(BigInt(randomEventId), treeDepth); // Empty group (no members)
    const emptyMerkleRoot = group.root.toString();

    // Format options as JSON string with initial vote counts
    const formattedOptions = JSON.stringify(
      options.map((option, index) => ({ index, text: option, votes: 0 }))
    );

    // Generate admin token for secure access to /manage page
    const adminToken = uuidv4();

    const votingEvent = this.votingEventRepository.create({
      eventId: randomEventId,
      eventName,
      startingDate,
      endingDate,
      votingPower,
      options: formattedOptions,
      adminUserId,
      adminToken,
      // Set required non-nullable fields with defaults
      groupMerkleRootHash: emptyMerkleRoot,
      groupLeafCommitments: '[]',
      groupSize: treeDepth, // Store tree depth for recreating groups
      // All other nullable fields will be null by default
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async createVotingEvent(createData: CreateVotingEventDto): Promise<VotingEvent> {
    // Generate random event ID (between 1 billion and 9 billion)
    const randomEventId = Math.floor(Math.random() * 8000000000) + 1000000000;

    const votingEvent = this.votingEventRepository.create({
      eventId: randomEventId,
      eventName: createData.eventName,
      groupMerkleRootHash: createData.groupMerkleRootHash,
      groupLeafCommitments: createData.groupLeafCommitments || '[]',
      groupSize: createData.groupSize,
      votingNft: createData.votingNft || null,
      votingValidatorAddress: createData.votingValidatorAddress || null,
      votingPower: createData.votingPower || null,
      options: createData.options || null,
      adminUserId: createData.adminUserId || null,
      startingDate: createData.startingDate || null,
      endingDate: createData.endingDate || null,
      groupNft: createData.groupNft || null,
      groupValidatorAddress: createData.groupValidatorAddress || null,
      semaphoreNft: createData.semaphoreNft || null,
      semaphoreAddress: createData.semaphoreAddress || null,
      nullifierMerkleTree: createData.nullifierMerkleTree || null,
      nullifierLeafCommitments: createData.nullifierLeafCommitments || null,
      verificationReferenceInput: createData.verificationReferenceInput || null,
      currentVoteCount: createData.currentVoteCount || null,
      mintingOrefTxHash: createData.mintingOrefTxHash || null,
      mintingOrefIndex: createData.mintingOrefIndex ?? null,
      vkeyRefTxHash: createData.vkeyRefTxHash || null,
      vkeyRefIndex: createData.vkeyRefIndex ?? null,
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async addParticipant(eventId: number, token: string, commitment: string): Promise<VotingEvent> {
    // 1. Validate invitation token
    const invitationToken = await this.invitationTokenRepository.findOne({ where: { token } });

    if (!invitationToken) {
      throw new Error('Invalid invitation token');
    }

    // Ensure type-safe comparison (eventId from URL param may be string)
    // NOTE: dev/dom intentionally keeps Number() cast here; main removed it — revert if NestJS typing guarantees number
    if (invitationToken.eventId !== Number(eventId)) {
      throw new Error('Invitation token is not valid for this event');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (invitationToken.expiresAt < currentTime) {
      throw new Error('Invitation token has expired');
    }

    // 2. Extract userId from validated token (cannot be faked by frontend)
    const userId = invitationToken.userId;

    // 3. Load event from database
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // 4. Parse participants from group_leaf_commitments (source of truth)
    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;

    // Check if user has already committed
    if (participants.some(p => p.userId === userId)) {
      throw new Error('User has already committed to this event');
    }

    // 5. Reconstruct Semaphore group with existing members
    const existingCommitments = participants.map(p => BigInt(p.commitment));
    const group = new Group(BigInt(eventId), event.groupSize, existingCommitments);

    // Verify reconstructed root matches stored root (data integrity check)
    if (participants.length > 0 && group.root.toString() !== event.groupMerkleRootHash) {
      throw new Error('Data integrity error: merkle root mismatch');
    }

    // 6. Add new member using addMember method from the library
    group.addMember(BigInt(commitment));

    // 7. Update database with new participant and updated merkle root
    const updatedParticipants = [...participants, { userId, commitment }];
    event.groupLeafCommitments = JSON.stringify(updatedParticipants);
    event.groupMerkleRootHash = group.root.toString();

    await this.votingEventRepository.save(event);

    // 8. Mark invitation token as used (for audit purposes)
    invitationToken.used = true;
    await this.invitationTokenRepository.save(invitationToken);

    return event;
  }

  async removeParticipant(eventId: number, userId: number): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    const filteredParticipants = participants.filter(p => p.userId !== userId);
    
    // Rebuild the group with remaining participants
    const group = new Group(BigInt(eventId), event.groupSize);
    if (filteredParticipants.length > 0) {
      for (const participant of filteredParticipants) {
        group.addMember(BigInt(participant.commitment));
      }
    }
    
    // Update group commitments and merkle root
    event.groupLeafCommitments = JSON.stringify(filteredParticipants);
    event.groupMerkleRootHash = group.root.toString();

    return await this.votingEventRepository.save(event);
  }

  async getParticipants(eventId: number): Promise<number[]> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    return participants.map(p => p.userId);
  }

  async getAllVotingEvents(): Promise<VotingEvent[]> {
    return await this.votingEventRepository.find();
  }

  // Get voting event details
  async getVotingEvent(eventId: number): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }
    return event;
  }

  // Update voting event details (dates, options, voting power) - currently not used
  async updateVotingEvent(
    eventId: number,
    updates: {
      votingPower?: number;
      options?: string[];
      startingDate?: number;
      endingDate?: number;
    }
  ): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // Update only the provided fields
    if (updates.votingPower !== undefined) {
      event.votingPower = updates.votingPower;
    }

    if (updates.options !== undefined) {
      // Format options as JSON string with initial vote counts
      event.options = JSON.stringify(
        updates.options.map((option, index) => ({ index, text: option, votes: 0 }))
      );
    }

    if (updates.startingDate !== undefined) {
      event.startingDate = updates.startingDate;
    }

    if (updates.endingDate !== undefined) {
      event.endingDate = updates.endingDate;
    }

    return await this.votingEventRepository.save(event);
  }

  // Add single participant by email to participant list (without sending invitation yet)
  async inviteParticipant(eventId: number, email: string): Promise<{ success: boolean; userId: number }> {
    // 1. Find or create user by email
    const user = await this.usersService.findOrCreateUserByEmail(email);

    // 2. Load event
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // 3. Parse invited participants
    const invited = JSON.parse(event.invitedParticipants || '[]') as Array<{
      email: string;
      userId: number;
      invitedAt: number;
    }>;

    // 4. Check if already invited
    if (!invited.some(i => i.email === email)) {
      invited.push({
        email,
        userId: user.userId,
        invitedAt: Date.now(),
      });
      event.invitedParticipants = JSON.stringify(invited);
      await this.votingEventRepository.save(event);
    }

    return { success: true, userId: user.userId };
  }


  // Get updated list of invited participants (to display in admin panel)
  async getInvitedParticipants(eventId: number): Promise<Array<{ email: string; userId: number; invitedAt: number }>> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    return JSON.parse(event.invitedParticipants || '[]');
  }


  // Send invitations to once to all participants via email
  async sendInvitations(
    eventId: number,
    emails: string[],
  ): Promise<{
    success: number;
    failed: number;
    results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }>;
  }> {
    // Verify event exists
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const email of emails) {
      try {
        // 1. Create or get existing user
        const user = await this.usersService.findOrCreateUserByEmail(email);

        // 2. Generate unique token
        const token = uuidv4();

        // 3. Calculate expiry (7 days from now)
        const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds

        // 4. Save invitation token to database
        const invitationToken = this.invitationTokenRepository.create({
          token,
          eventId,
          userId: user.userId,
          email,
          used: false,
          expiresAt,
        });
        await this.invitationTokenRepository.save(invitationToken);

        // 5. Send email via EmailService with event dates
        await this.emailService.sendInvitationEmail(
          email,
          token,
          eventId,
          event.eventName,
          event.startingDate ?? undefined,
          event.endingDate ?? undefined,
        );

        // 6. Add to invited participants list
        const invited = JSON.parse(event.invitedParticipants || '[]') as Array<{
          email: string;
          userId: number;
          invitedAt: number;
        }>;

        if (!invited.some(i => i.email === email)) {
          invited.push({
            email,
            userId: user.userId,
            invitedAt: Date.now(),
          });
          event.invitedParticipants = JSON.stringify(invited);
          await this.votingEventRepository.save(event);
        }

        results.push({ email, status: 'sent' });
        successCount++;
      } catch (error) {
        results.push({
          email,
          status: 'failed',
          error: error.message || 'Unknown error',
        });
        failedCount++;
      }
    }

    return {
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  // Validate invitation token when user clicks email link
  async validateToken(token: string): Promise<{
    valid: boolean;
    used?: boolean;
    userId?: number;
    eventId?: number;
    email?: string;
    error?: string;
  }> {
    try {
      // Find token in database
      const invitationToken = await this.invitationTokenRepository.findOne({
        where: { token },
      });

      // Check if token exists
      if (!invitationToken) {
        return {
          valid: false,
          error: 'Invalid token',
        };
      }

      // Check if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (invitationToken.expiresAt < currentTime) {
        return {
          valid: false,
          error: 'Token has expired',
        };
      }

      // Token is authentic - return user info
      // "used" flag is informational only, not an error — registration status is checked separately via participants endpoint
      // NOTE: dev/dom intentionally deviates from main here; main treats used tokens as valid: false (error). Revert if stricter behaviour is needed.
      return {
        valid: true,
        used: invitationToken.used,
        userId: invitationToken.userId,
        eventId: invitationToken.eventId,
        email: invitationToken.email,
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate token',
      };
    }
  }

  // Mark token as used after particpipation opened email link
  async markTokenAsUsed(token: string): Promise<void> {
    const invitationToken = await this.invitationTokenRepository.findOne({
      where: { token },
    });

    if (invitationToken) {
      invitationToken.used = true;
      await this.invitationTokenRepository.save(invitationToken);
    }
  }

  // Submit a signed vote transaction to the Blockfrost node.
  // The frontend builds and signs the tx (via CIP-30), then sends the hex here.
  // Double-vote prevention is handled upstream by POST /nullifier (MPF trie).
  //
  // Before submitting, we evaluate the tx via Blockfrost's Ogmios proxy
  // (/utils/txs/evaluate). This gives detailed script failure info without
  // risking collateral. If the evaluation reveals a script failure we abort
  // early and return the Ogmios error. If evaluation fails for other reasons
  // (e.g. UTxO not yet visible to Ogmios), we proceed to submit anyway.
  async submitVote(
    signedTx: string,
  ): Promise<{ txHash: string }> {
    if (!signedTx) {
      throw new HttpException('Missing signedTx in request body', HttpStatus.BAD_REQUEST);
    }

    const apiKey = this.configService.get<string>('BLOCKFROST_API_KEY') ?? '';
    const txBytes = Buffer.from(signedTx, 'hex');

    // ── Step 1: Evaluate scripts before submitting ────────────────────────────
    try {
      const evalResponse = await fetch('https://cardano-preprod.blockfrost.io/api/v0/utils/txs/evaluate', {
        method: 'POST',
        headers: { 'project_id': apiKey, 'Content-Type': 'application/cbor' },
        body: txBytes,
      });
      const evalBody = await evalResponse.text();
      console.log(`[submitVote] Ogmios evaluate (HTTP ${evalResponse.status}):`, evalBody);

      if (evalResponse.ok) {
        // Parse Ogmios result envelope
        let ogmios: any;
        try { ogmios = JSON.parse(evalBody); } catch { ogmios = null; }

        const result = ogmios?.result;
        const scriptFailures = result?.EvaluationFailure?.ScriptFailures;

        if (scriptFailures && Object.keys(scriptFailures).length > 0) {
          // A script actually failed — abort before submitting (collateral safe)
          const failures = JSON.stringify(scriptFailures, null, 2);
          throw new HttpException(
            `Script evaluation failed — collateral NOT taken.\nScriptFailures:\n${failures}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }

        if (result?.EvaluationFailure) {
          // Some other Ogmios failure (UnknownInputs, IncompatibleEra, etc.)
          // Don't abort — the UTxO might just not be visible to Ogmios yet.
          console.warn('[submitVote] Ogmios EvaluationFailure (non-script):', evalBody);
        } else if (result?.EvaluationResult) {
          // Scripts passed evaluation
          console.log('[submitVote] Evaluation passed:', JSON.stringify(result.EvaluationResult));
        }
      } else {
        // Blockfrost/Ogmios returned an HTTP error — log and continue to submit
        console.warn('[submitVote] Evaluate endpoint error (will still attempt submit):', evalBody);
      }
    } catch (evalErr: any) {
      // Re-throw our own HttpException (script failure detected above)
      if (evalErr instanceof HttpException) throw evalErr;
      // Network / unexpected error — log and fall through to submit
      console.warn('[submitVote] Evaluate call threw (will still attempt submit):', evalErr?.message ?? evalErr);
    }

    // ── Step 2: Submit ────────────────────────────────────────────────────────
    const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
      method: 'POST',
      headers: { 'project_id': apiKey, 'Content-Type': 'application/cbor' },
      body: txBytes,
    });

    const body = await response.text();
    if (!response.ok) {
      // Surface the real Blockfrost error to the frontend instead of a generic 500
      throw new HttpException(
        `Blockfrost submission failed (${response.status}): ${body}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return { txHash: body.replace(/"/g, '') };
  }

  // Check admin token for /manage access
  async validateAdminToken(eventId: number, token: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Load event
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { valid: false, error: 'Event not found' };
      }

      // Check if token matches
      if (!event.adminToken) {
        return { valid: false, error: 'Event has no admin token' };
      }

      if (event.adminToken === token) {
        return { valid: true };
      }

      return { valid: false, error: 'Invalid admin token' };
    } catch (error) {
      return { valid: false, error: 'Failed to validate admin token' };
    }
  }

  // Mark invitations as sent by setting a timestamp
  async markInvitationsSent(eventId: number): Promise<{ success: boolean; message: string }> {
    try {
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { success: false, message: 'Event not found' };
      }

      // Set timestamp when invitations were sent
      event.invitationsSentAt = Math.floor(Date.now() / 1000);
      await this.votingEventRepository.save(event);

      return { success: true, message: 'Invitations marked as sent' };
    } catch (error) {
      return { success: false, message: 'Failed to mark invitations as sent' };
    }
  }

  // Return the Semaphore group Merkle proof for a specific participant.
  // The frontend passes this proof (siblings, pathIndices) to the ZK circuit
  // as witness data when generating the vote proof.
  async getMerkleProof(eventId: number, userId: number, targetRoot?: string): Promise<{
    root: string;
    leaf: string;
    siblings: string[];
    pathIndices: number[];
  }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // Use the semaphore snapshot if available — ZK proof must verify against the
    // Semaphore datum's immutable group_merke_root, not the live group root.
    const leafSource = event.semaphoreLeafCommitments ?? event.groupLeafCommitments;
    let participants = JSON.parse(leafSource) as Array<{userId: number, commitment: string}>;
    const index = participants.findIndex(p => p.userId === Number(userId));
    if (index === -1) {
      throw new Error(
        event.semaphoreLeafCommitments
          ? 'User was not registered when the voting system was set up and cannot vote'
          : 'User is not a participant in this event',
      );
    }

    // If the caller provides a targetRoot (the on-chain Semaphore datum value), find the
    // historical participant subset whose tree root matches. This handles events that were
    // minted before the snapshot was introduced and where semaphoreLeafCommitments is null.
    if (targetRoot) {
      const allCommitments = participants.map(p => BigInt(p.commitment));
      const currentGroup = new Group(BigInt(eventId), event.groupSize, allCommitments);
      const currentProof = currentGroup.generateMerkleProof(index);
      if (currentProof.root.toString() !== BigInt(targetRoot).toString()) {
        let found = false;
        for (let m = index + 1; m <= participants.length; m++) {
          const subset = participants.slice(0, m);
          const g = new Group(BigInt(eventId), event.groupSize, subset.map(p => BigInt(p.commitment)));
          const testProof = g.generateMerkleProof(index);
          if (testProof.root.toString() === BigInt(targetRoot).toString()) {
            participants = subset;
            found = true;
            break;
          }
        }
        if (!found) {
          throw new HttpException(
            'Voter was not in the group at the time the voting system was set up and cannot vote',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }
    }

    const commitments = participants.map(p => BigInt(p.commitment));
    const group = new Group(BigInt(eventId), event.groupSize, commitments);
    const proof = group.generateMerkleProof(index);

    return {
      root: proof.root.toString(),
      leaf: proof.leaf.toString(),
      siblings: proof.siblings.map((s: bigint) => s.toString()),
      pathIndices: proof.pathIndices,
    };
  }

  // Insert a nullifier into the MPF trie for a voting event.
  // Called by the frontend after successfully casting a vote on-chain.
  // Returns the MPF proof (needed to build the vote transaction) and the new root.
  // Throws if the nullifier was already inserted (double-vote prevention).
  async insertNullifier(eventId: number, nullifier: string): Promise<{
    newRoot: string;
    proof: string;
    proofSteps: Array<object>;
  }> {
    try {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new HttpException('Voting event not found', HttpStatus.NOT_FOUND);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Trie } = require('@aiken-lang/merkle-patricia-forestry');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { blake2b } = require('@noble/hashes/blake2b');

    const nullifierBigInt = BigInt(nullifier);

    // Convert nullifier to key/value — mirrors on-chain semaphore.ak:
    //   scalar.new(nullifier) → scalar.to_bytearray_little_endian(n, 0) → blake2b_256(value)
    //
    // IMPORTANT: on-chain uses size=0 (minimal encoding), which strips trailing zeros
    // from the little-endian representation (= leading zeros from big-endian).
    // This means values < 2^248 produce fewer than 32 bytes.  Using padStart(64,'0')
    // would give a different blake2b key for those values, breaking the MPF root check.
    const rawHex = nullifierBigInt.toString(16);
    const paddedHex = rawHex.length % 2 ? '0' + rawHex : rawHex; // ensure even length
    const bigEndian = Buffer.from(paddedHex, 'hex'); // minimal BE (no leading zeros)
    const value = Buffer.from(Buffer.from(bigEndian).reverse()); // minimal LE
    const key = Buffer.from(blake2b(value, { dkLen: 32 }));

    const store = await this.getNullifierStore(eventId);
    const trie = await Trie.load(store).catch(() => new Trie(store));

    // Throws if nullifier already exists — prevents double voting at the backend level.
    await trie.insert(key, value);

    const mpfProof = await trie.prove(key);
    const newRootBuffer: Buffer = mpfProof.verify(true);
    const newRoot = Buffer.from(newRootBuffer).toString('hex');

    // Persist the updated MPF root so future votes use the correct old root.
    event.nullifierMerkleTree = newRoot;
    await this.votingEventRepository.save(event);

    return {
      newRoot,
      proof: Buffer.from(mpfProof.toCBOR()).toString('hex'),
      proofSteps: mpfProof.toJSON(),
    };
    } catch (err: any) {
      // Re-throw HttpExceptions as-is (they already have the right status/message)
      if (err instanceof HttpException) throw err;
      // MPF trie throws when inserting a key that already exists
      const msg: string = err?.message ?? String(err);
      if (msg.includes('already in the trie') || msg.includes('already exists')) {
        throw new HttpException(
          'Nullifier already used. Your vote may have already been submitted, or a previous attempt ' +
          'partially failed. If the vote TX was never confirmed on-chain, please contact the event organizer ' +
          'to reset the nullifier.',
          HttpStatus.CONFLICT,
        );
      }
      // Wrap unexpected errors so the real message reaches the frontend
      throw new HttpException(
        `Nullifier insertion failed: ${msg}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Roll back a nullifier insertion — called when the vote TX fails after nullifier was inserted.
  // Deletes the key from the trie and reverts nullifierMerkleTree in the DB to the previous root.
  async rollbackNullifier(eventId: number, nullifier: string): Promise<{ success: boolean }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) throw new HttpException('Voting event not found', HttpStatus.NOT_FOUND);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Trie } = require('@aiken-lang/merkle-patricia-forestry');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { blake2b } = require('@noble/hashes/blake2b');

    const nullifierBigInt = BigInt(nullifier);
    // Same minimal encoding as insertNullifier — must match on-chain scalar.to_bytearray_little_endian(n, 0)
    const rawHex = nullifierBigInt.toString(16);
    const paddedHex = rawHex.length % 2 ? '0' + rawHex : rawHex;
    const bigEndian = Buffer.from(paddedHex, 'hex');
    const value = Buffer.from(Buffer.from(bigEndian).reverse());
    const key = Buffer.from(blake2b(value, { dkLen: 32 }));

    const store = await this.getNullifierStore(eventId);
    const trie = await Trie.load(store).catch(() => new Trie(store));

    try {
      await trie.delete(key);
    } catch {
      // Already removed or never inserted — not an error
    }

    // After delete(), trie.hash reflects the new root (trie.save() is private).
    event.nullifierMerkleTree = trie.hash ? Buffer.from(trie.hash).toString('hex') : null;
    await this.votingEventRepository.save(event);

    return { success: true };
  }

  // Fetch live vote tallies from the on-chain UrnaDatum via Blockfrost.
  // Returns { options: [{ index, text, votes }] } — text from DB, votes from chain (zeros if not deployed or Blockfrost unreachable).
  async getResults(eventId: number): Promise<{ options: Array<{ index: number; text: string; votes: number }> }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) throw new HttpException('Voting event not found', HttpStatus.NOT_FOUND);

    const dbOptions: Array<{ index: number; text: string }> = JSON.parse(event.options ?? '[]');
    const emptyOptions = dbOptions.map(o => ({ ...o, votes: 0 }));

    if (!event.votingValidatorAddress || !event.votingNft) {
      return { options: emptyOptions };
    }

    const apiKey = this.configService.get<string>('BLOCKFROST_API_KEY') ?? '';
    const network = this.configService.get<string>('BLOCKFROST_NETWORK') ?? 'preprod';

    try {
      const response = await fetch(
        `https://cardano-${network}.blockfrost.io/api/v0/addresses/${event.votingValidatorAddress}/utxos`,
        { headers: { project_id: apiKey } },
      );

      // 404 = address has no UTxO history yet — return zeros
      if (!response.ok) return { options: emptyOptions };

      const utxos: any[] = await response.json();
      const votingUtxo = utxos.find(u =>
        Array.isArray(u.amount) && u.amount.some((a: any) => a.unit.startsWith(event.votingNft))
      );
      if (!votingUtxo) return { options: emptyOptions };

      // inline_datum from Blockfrost is raw CBOR hex — decode to Plutus data JSON
      const datumCbor: string | null = votingUtxo.inline_datum;
      if (!datumCbor) return { options: emptyOptions };
      const datum = deserializeDatum(datumCbor);
      if (!datum?.fields?.[1]) return { options: emptyOptions };

      // UrnaDatum fields[1] = List<(Int, Int)> — each item is a 2-element list [index, votes]
      const onChainOptions: Array<[number, number]> = datum.fields[1].list.map((item: any) => [
        Number(item.list[0].int),
        Number(item.list[1].int),
      ]);

      const merged = dbOptions.map(opt => {
        const onChain = onChainOptions.find(([idx]) => idx === opt.index);
        return { index: opt.index, text: opt.text, votes: onChain ? onChain[1] : 0 };
      });

      return { options: merged };
    } catch {
      // Blockfrost unreachable — return zeros so the page still renders
      return { options: emptyOptions };
    }
  }

  // Save blockchain data related to the event (Temporary implementation)
  async saveBlockchainData(eventId: number, blockchainData: any): Promise<{ success: boolean; message: string }> {
    try {
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { success: false, message: 'Event not found' };
      }

      // Save blockchain data as JSON blob
      event.blockchainData = JSON.stringify(blockchainData);

      // Also set individual entity fields so the vote page can use them directly
      if (blockchainData.semaphoreAddress) event.semaphoreAddress = blockchainData.semaphoreAddress;
      if (blockchainData.semaphoreNft) event.semaphoreNft = blockchainData.semaphoreNft;
      if (blockchainData.votingValidatorAddress) event.votingValidatorAddress = blockchainData.votingValidatorAddress;
      if (blockchainData.votingNft) event.votingNft = blockchainData.votingNft;
      if (blockchainData.groupNft) event.groupNft = blockchainData.groupNft;
      if (blockchainData.groupValidatorAddress) event.groupValidatorAddress = blockchainData.groupValidatorAddress;
      if (blockchainData.groupValidatorCbor) event.groupValidatorCbor = blockchainData.groupValidatorCbor;
      if (blockchainData.mintingOrefTxHash) event.mintingOrefTxHash = blockchainData.mintingOrefTxHash;
      if (blockchainData.mintingOrefIndex !== undefined && blockchainData.mintingOrefIndex !== null) {
        event.mintingOrefIndex = blockchainData.mintingOrefIndex;
      }

      // Snapshot the group tree when Semaphore NFT data is first saved.
      // SemaphoreDatum.group_merke_root is fixed at SV mint time and never changes on-chain.
      // Participants added after this point can register but cannot vote (group is closed).
      if (blockchainData.semaphoreNft && !event.semaphoreMerkleRoot) {
        event.semaphoreMerkleRoot = event.groupMerkleRootHash;
        event.semaphoreLeafCommitments = event.groupLeafCommitments;
        console.log(`[saveBlockchainData] Snapshotted semaphoreMerkleRoot=${event.semaphoreMerkleRoot} for event ${eventId}`);
      }

      await this.votingEventRepository.save(event);

      return { success: true, message: 'Blockchain data saved' };
    } catch (error) {
      return { success: false, message: 'Failed to save blockchain data' };
    }
  }

  // Update groupMerkleRootHash in the DB after a group-update TX is confirmed on-chain.
  // Called by the frontend after wallet.submitTx resolves successfully.
  async confirmGroupUpdate(
    eventId: number,
    newMerkleRoot: string,
    txHash: string,
  ): Promise<{ success: boolean }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) throw new HttpException('Event not found', HttpStatus.NOT_FOUND);

    event.groupMerkleRootHash = newMerkleRoot;
    await this.votingEventRepository.save(event);

    console.log(`[confirmGroupUpdate] event ${eventId}: root updated to ${newMerkleRoot} (tx ${txHash})`);
    return { success: true };
  }

  // Build an unsigned group-update transaction for the admin to sign via CIP-30.
  // The frontend passes wallet-specific data (UTxOs, address, collateral) because
  // the admin's key never leaves the browser. The backend only contributes the
  // group validator CBOR and script address stored at bootstrap time.
  async buildUpdateGroupTx(
    eventId: number,
    params: {
      newMerkleRoot: string;
      walletUtxos: any[];
      walletAddress: string;
      paymentKeyHash: string;
      collateralUtxo: any;
    },
  ): Promise<{ unsignedTx: string }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) throw new HttpException('Event not found', HttpStatus.NOT_FOUND);

    if (!event.groupValidatorCbor)
      throw new HttpException('groupValidatorCbor not set — re-bootstrap the event', HttpStatus.BAD_REQUEST);
    if (!event.groupValidatorAddress)
      throw new HttpException('groupValidatorAddress not set — re-bootstrap the event', HttpStatus.BAD_REQUEST);
    if (!event.groupNft)
      throw new HttpException('groupNft not set — re-bootstrap the event', HttpStatus.BAD_REQUEST);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BlockfrostProvider } = require('@meshsdk/core');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildUpdateGroupTransaction } = require('@src/tx');

    const apiKey = this.configService.get<string>('BLOCKFROST_API_KEY') ?? '';
    const provider = new BlockfrostProvider(apiKey);

    const unsignedTx = await buildUpdateGroupTransaction({
      provider,
      groupScriptAddress: event.groupValidatorAddress,
      groupNftPolicyId: event.groupNft,
      groupValidatorCbor: event.groupValidatorCbor,
      walletUtxos: params.walletUtxos,
      walletAddress: params.walletAddress,
      paymentKeyHash: params.paymentKeyHash,
      collateralUtxo: params.collateralUtxo,
      newMerkleRoot: BigInt(params.newMerkleRoot),
    });

    return { unsignedTx };
  }
}
