import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import type { Eskplus } from "../target/types/eskplus.ts";
import { describe, it, expect, beforeAll } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_DECIMALS, TRADE_SEED } from "./constants.ts";
import { airdrop, getTradePdaId, lamps, tokens } from "./utils.ts";
import { ResultAsync } from "neverthrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintToChecked,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("eskplus init instruction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Eskplus as Program<Eskplus>;

  let depositor: Keypair;
  let beneficiary: Keypair;

  let tradeZeroPda: PublicKey;
  let tradeOnePda: PublicKey;
  let tradeTwoPda: PublicKey;

  let depositMint: PublicKey;
  let depositMint2022: PublicKey;
  let askMint: PublicKey;

  beforeAll(async () => {
    depositor = Keypair.generate();
    beneficiary = Keypair.generate();
    console.log(`DEPOSITOR: ${depositor.publicKey.toBase58()}`);
    console.log(`BENEFICIARY: ${beneficiary.publicKey.toBase58()}`);

    // Fund the depositor account
    await airdrop(provider, depositor.publicKey, lamps(100));

    // Derive the PDA for trade (0) agreement
    [tradeZeroPda] = PublicKey.findProgramAddressSync(
      [
        TRADE_SEED,
        getTradePdaId(0),
        depositor.publicKey.toBuffer(),
        beneficiary.publicKey.toBuffer(),
      ],
      program.programId,
    );

    console.log(`TRADE ZERO PDA: ${tradeZeroPda.toBase58()}`);

    // Derive the PDA for trade (1) agreement
    [tradeOnePda] = PublicKey.findProgramAddressSync(
      [
        TRADE_SEED,
        getTradePdaId(1),
        depositor.publicKey.toBuffer(),
        beneficiary.publicKey.toBuffer(),
      ],
      program.programId,
    );

    console.log(`TRADE ONE PDA: ${tradeOnePda.toBase58()}`);

    // Derive the PDA for trade (2) agreement
    [tradeTwoPda] = PublicKey.findProgramAddressSync(
      [
        TRADE_SEED,
        getTradePdaId(2),
        depositor.publicKey.toBuffer(),
        beneficiary.publicKey.toBuffer(),
      ],
      program.programId,
    );

    console.log(`TRADE TWO PDA: ${tradeTwoPda.toBase58()}`);

    // Create a deposit mint (legacy token program)
    depositMint = await createMint(
      provider.connection,
      depositor,
      depositor.publicKey,
      depositor.publicKey,
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    console.log(`DEPOSIT MINT: ${depositMint.toBase58()}`);

    // Create a deposit mint (token2022)
    depositMint2022 = await createMint(
      provider.connection,
      depositor,
      depositor.publicKey,
      depositor.publicKey,
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`DEPOSIT MINT 2022: ${depositMint2022.toBase58()}`);

    // Create an ask mint (token2022)
    askMint = await createMint(
      provider.connection,
      depositor,
      depositor.publicKey,
      depositor.publicKey,
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`ASK MINT: ${askMint.toBase58()}`);

    // Create depositor ATA (legacy)
    const depositorTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor,
      depositMint,
      depositor.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    console.log(
      `DEPOSITOR TOKEN ACCOUNT: ${depositorTokenAccount.address.toBase58()}`,
    );

    const depositorTokenAccount2022 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor,
      depositMint2022,
      depositor.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(
      `DEPOSITOR TOKEN ACCOUNT 2022: ${depositorTokenAccount2022.address.toBase58()}`,
    );

    // Mint tokens to the depositor token account (legacy)
    await mintToChecked(
      provider.connection,
      depositor,
      depositMint,
      depositorTokenAccount.address,
      depositor,
      tokens(100),
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    // Mint tokens to the depositor token account (token2022)
    await mintToChecked(
      provider.connection,
      depositor,
      depositMint2022,
      depositorTokenAccount2022.address,
      depositor,
      tokens(100),
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );
  });

  it("should fail to initialize with insufficient lamports", async () => {
    const depositLamps = new anchor.BN(101 * anchor.web3.LAMPORTS_PER_SOL);
    const askLamps = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
    const askTokens = new anchor.BN(tokens(100));
    const depositTokens = new anchor.BN(tokens(101));

    const maybeTx = await ResultAsync.fromPromise(
      program.methods
        .init({
          askLamps,
          depositLamps,
          askTokens,
          depositTokens,
          id: 0,
        })
        .accounts({
          askMint: askMint,
          depositMint: depositMint,
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradeZeroPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc({
          skipPreflight: true,
        }),
      (error: unknown) => {
        if (error instanceof anchor.ProgramError) {
          return error.code === 6000;
        }
        return false;
      },
    );

    expect(maybeTx.isErr()).toBe(true);
    maybeTx.mapErr((err) => expect(err).toBe(true));
  });

  it("should fail to initialize with insufficient tokens", async () => {
    const depositLamps = new anchor.BN(lamps(1));
    const askLamps = new anchor.BN(lamps(2));
    const depositTokens = new anchor.BN(tokens(101));
    const askTokens = new anchor.BN(tokens(100));

    const maybeTx = await ResultAsync.fromPromise(
      program.methods
        .init({
          askLamps,
          depositLamps,
          askTokens,
          depositTokens,
          id: 0,
        })
        .accounts({
          askMint: askMint,
          depositMint: depositMint,
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradeZeroPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc({
          skipPreflight: true,
        }),
      (error: unknown) => {
        return error;
      },
    );

    maybeTx.match(
      () => expect.fail("Expected insufficient tokens error, got ok"),
      (err) => expect(err).to.not.be.undefined,
    );
  });

  it("should initialize trade (0) agreement successfully", async () => {
    const depositLamps = new anchor.BN(lamps(1));
    const askLamps = new anchor.BN(lamps(2));
    const askTokens = new anchor.BN(tokens(100));
    const depositTokens = new anchor.BN(tokens(50));

    const tx = await program.methods
      .init({
        askLamps,
        depositLamps,
        askTokens,
        depositTokens,
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradeZeroPda,
        depositMint: depositMint,
        askMint: askMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    console.log(tx);

    // Fetch the created trade agreement
    const tradeAccount =
      await program.account.tradeAgreement.fetch(tradeZeroPda);

    // Assertions
    expect(tradeAccount.depositor.toBase58()).to.equal(
      depositor.publicKey.toBase58(),
    );
    expect(tradeAccount.beneficiary.toBase58()).to.equal(
      beneficiary.publicKey.toBase58(),
    );
    expect(tradeAccount.depositLamps.toString()).to.equal(
      depositLamps.toString(),
    );
    expect(tradeAccount.askLamps.toString()).to.equal(askLamps.toString());
    expect(tradeAccount.status).to.deep.equal({ open: {} });
  });

  it("should initialize a second trade (1) agreement with a different trade id", async () => {
    const depositLamps = new anchor.BN(lamps(1));
    const askLamps = new anchor.BN(lamps(2));
    const askTokens = new anchor.BN(tokens(100));
    const depositTokens = new anchor.BN(tokens(50));

    const tx = await program.methods
      .init({
        askLamps,
        depositLamps,
        askTokens,
        depositTokens,
        id: 1,
      })
      .accounts({
        depositor: depositor.publicKey,
        depositMint: depositMint,
        beneficiary: beneficiary.publicKey,
        askMint: askMint,
        trade: tradeOnePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    console.log(tx);

    const tradeAccount =
      await program.account.tradeAgreement.fetch(tradeOnePda);

    expect(tradeAccount.depositor.toBase58()).to.equal(
      depositor.publicKey.toBase58(),
    );
    expect(tradeAccount.beneficiary.toBase58()).to.equal(
      beneficiary.publicKey.toBase58(),
    );
    expect(tradeAccount.depositLamps.toString()).to.equal(
      depositLamps.toString(),
    );
    expect(tradeAccount.askLamps.toString()).to.equal(askLamps.toString());
    expect(tradeAccount.status).to.deep.equal({ open: {} });
  });

  it("should initialize a trade (2) with a token2022 mint deposit", async () => {
    const depositLamps = new anchor.BN(lamps(1));
    const askLamps = new anchor.BN(lamps(2));
    const depositTokens = new anchor.BN(tokens(50));
    const askTokens = new anchor.BN(tokens(100));

    const tx = await program.methods
      .init({
        askLamps,
        depositLamps,
        askTokens,
        depositTokens,
        id: 2,
      })
      .accounts({
        depositor: depositor.publicKey,
        depositMint: depositMint2022,
        beneficiary: beneficiary.publicKey,
        askMint: askMint,
        trade: tradeTwoPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    console.log(tx);

    const tradeAccount =
      await program.account.tradeAgreement.fetch(tradeTwoPda);

    expect(tradeAccount.depositMint.toBase58()).to.equal(
      depositMint2022.toBase58(),
    );
    expect(tradeAccount.askMint.toBase58()).to.equal(askMint.toBase58());
    expect(tradeAccount.depositLamps.toString()).to.equal(
      depositLamps.toString(),
    );
    expect(tradeAccount.askLamps.toString()).to.equal(askLamps.toString());
    expect(tradeAccount.status).to.deep.equal({ open: {} });
  });

  it("should fail if trying to initialize with an existing trade id", async () => {
    const depositLamps = new anchor.BN(lamps(1));
    const askLamps = new anchor.BN(lamps(2));
    const askTokens = new anchor.BN(tokens(100));
    const depositTokens = new anchor.BN(tokens(100));

    const maybeTx = await ResultAsync.fromPromise(
      program.methods
        .init({
          askLamps,
          depositLamps,
          askTokens,
          depositTokens,
          id: 1,
        })
        .accounts({
          depositor: depositor.publicKey,
          depositMint: depositMint,
          beneficiary: beneficiary.publicKey,
          askMint: askMint,
          trade: tradeOnePda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({
          skipPreflight: true,
        }),
      (error: unknown) => {
        return error;
      },
    );

    expect(maybeTx.isErr()).toBe(true);
  });
});
