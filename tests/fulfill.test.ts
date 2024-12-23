import * as anchor from "@coral-xyz/anchor";
import { describe, beforeEach, it, expect } from "vitest";
import { type PublicKey, Keypair } from "@solana/web3.js";
import { airdrop, balance, getTradePda, lamps, program } from "./utils.ts";
import { ResultAsync } from "neverthrow";

describe("eskplus fulfill instruction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let depositor: Keypair;
  let beneficiary: Keypair;

  let tradePda: PublicKey;

  beforeEach(async () => {
    depositor = Keypair.generate();
    beneficiary = Keypair.generate();
    [tradePda] = getTradePda(depositor.publicKey, beneficiary.publicKey, 0);

    // Fund the accounts
    await airdrop(provider, depositor.publicKey, lamps(100));
    await airdrop(provider, beneficiary.publicKey, lamps(100));
  });

  it("should fail to fulfill a trade agreement with insufficient funds", async () => {
    // We initialize a trade agreement
    const tradeInitTx = await program.methods
      .init({
        ask: new anchor.BN(lamps(999)),
        deposit: new anchor.BN(lamps(1)),
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
      })
      .signers([depositor])
      .rpc();

    console.log("Trade init tx: %s", tradeInitTx);

    const maybeFulfill = await ResultAsync.fromPromise(
      program.methods
        .fulfill({
          id: 0,
        })
        .accounts({
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradePda,
        })
        .signers([beneficiary])
        .rpc({
          skipPreflight: true,
        }),
      (_: unknown) => {
        return true;
      },
    );

    maybeFulfill.match(
      () => expect.fail("Expected insufficient funds error, got ok"),
      (err) => expect(err).toBe(true),
    );
  });

  it("should fail to fulfill a trade agreement with a non-existent id", async () => {
    const [tradePda] = getTradePda(
      depositor.publicKey,
      beneficiary.publicKey,
      22,
    );

    const maybeFulfill = await ResultAsync.fromPromise(
      program.methods
        .fulfill({ id: 22 })
        .accounts({
          depositor: depositor.publicKey,
          beneficiary: beneficiary.publicKey,
          trade: tradePda,
        })
        .signers([beneficiary])
        .rpc({
          skipPreflight: true,
        }),
      (err: unknown) => {
        if (err instanceof anchor.ProgramError) {
          expect(err.code).toBe(3012);
          return true;
        }
        return false;
      },
    );

    maybeFulfill.match(
      () => expect.fail("Expected invalid id error, got ok"),
      (err) => expect(err).toBe(true),
    );
  });

  it("should succeed to fulfill a trade agreement", async () => {
    const ask = lamps(2);
    const deposit = lamps(1);
    const beforeDepositorBalance = await balance(provider, depositor.publicKey);
    const beforeBeneficiaryBalance = await balance(
      provider,
      beneficiary.publicKey,
    );

    const [tradePda] = getTradePda(
      depositor.publicKey,
      beneficiary.publicKey,
      0,
    );

    console.log("Depositor: %s", depositor.publicKey.toBase58());
    console.log("Beneficiary: %s", beneficiary.publicKey.toBase58());
    console.log("Trade PDA: %s", tradePda.toBase58());

    // We initialize a trade agreement
    await program.methods
      .init({
        ask: new anchor.BN(ask),
        deposit: new anchor.BN(deposit),
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
      })
      .signers([depositor])
      .rpc({
        commitment: "confirmed",
      });

    const tx = await program.methods
      .fulfill({ id: 0 })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
      })
      .signers([beneficiary])
      .rpc({
        commitment: "confirmed",
      });

    const tradeAccount = await program.account.tradeAgreement.fetch(
      tradePda,
      "confirmed",
    );
    const currentDepositorBalance = await balance(
      provider,
      depositor.publicKey,
    );
    const currentBeneficiaryBalance = await balance(
      provider,
      beneficiary.publicKey,
    );
    const rent = await balance(provider, tradePda);

    console.log("TX: %s", tx);
    console.log("Trade PDA: %s with rent %s", tradePda.toBase58(), rent);

    const expectedDepositorBalance = beforeDepositorBalance + lamps(1) - rent;
    const expectedBeneficiaryBalance = beforeBeneficiaryBalance - lamps(1);

    expect(tradeAccount.status).to.deep.equal({ fulfilled: {} });
    expect(currentDepositorBalance).to.equal(expectedDepositorBalance);
    expect(currentBeneficiaryBalance).to.equal(expectedBeneficiaryBalance);
  });
});
