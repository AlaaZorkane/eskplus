import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import type { Eskplus } from "../target/types/eskplus.ts";
import { describe, it, expect, beforeAll } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TRADE_SEED } from "./constants.ts";
import { airdrop, getTradePdaId } from "./utils.ts";
import { ResultAsync } from "neverthrow";

describe("eskplus init instruction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Eskplus as Program<Eskplus>;

  let depositor: Keypair;
  let beneficiary: Keypair;

  let tradeZeroPda: PublicKey;

  let tradeOnePda: PublicKey;

  beforeAll(async () => {
    depositor = Keypair.generate();
    beneficiary = Keypair.generate();

    // Fund the depositor account
    await airdrop(
      provider,
      depositor.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL,
    );

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
  });

  it("should fail to initialize with insufficient funds", async () => {
    const deposit = new anchor.BN(101 * anchor.web3.LAMPORTS_PER_SOL);
    const ask = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);

    const maybeTx = await ResultAsync.fromPromise(
      program.methods
        .init({
          ask,
          deposit,
          id: 0,
        })
        .accounts({
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradeZeroPda,
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

  it("should initialize trade (0) agreement successfully", async () => {
    const deposit = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const ask = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);

    const tx = await program.methods
      .init({
        ask,
        deposit,
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradeZeroPda,
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
    expect(tradeAccount.depositLamps.toString()).to.equal(deposit.toString());
    expect(tradeAccount.askLamps.toString()).to.equal(ask.toString());
    expect(tradeAccount.status).to.deep.equal({ open: {} });
  });

  it("should initialize a second trade (1) agreement with a different trade id", async () => {
    const deposit = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const ask = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);

    const tx = await program.methods
      .init({
        ask,
        deposit,
        id: 1,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradeOnePda,
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
    expect(tradeAccount.depositLamps.toString()).to.equal(deposit.toString());
    expect(tradeAccount.askLamps.toString()).to.equal(ask.toString());
    expect(tradeAccount.status).to.deep.equal({ open: {} });
  });

  it("should fail if trying to initialize with an existing trade id", async () => {
    const deposit = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const ask = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);

    const maybeTx = await ResultAsync.fromPromise(
      program.methods
        .init({
          ask,
          deposit,
          id: 1,
        })
        .accounts({
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradeOnePda,
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
