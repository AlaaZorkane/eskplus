import * as anchor from "@coral-xyz/anchor";
import { describe, beforeEach, it, expect, beforeAll } from "vitest";
import { type PublicKey, Keypair } from "@solana/web3.js";
import {
  airdrop,
  ataAmount,
  ataAmountByPk,
  balance,
  getTradePda,
  lamps,
  program,
  tokens,
} from "./utils.ts";
import { ResultAsync } from "neverthrow";
import { TOKEN_DECIMALS } from "./constants.ts";
import {
  createAssociatedTokenAccount,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintToChecked,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  type Account,
} from "@solana/spl-token";

describe("eskplus fulfill instruction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let payer: Keypair;
  let depositor: Keypair;
  let beneficiary: Keypair;
  let depositMint: PublicKey;
  let askMint: PublicKey;
  let beneficiaryAskTokenAccount: Account;
  let beneficiaryDepositTokenAccount: Account;
  const askTokenProgram = TOKEN_2022_PROGRAM_ID;
  const depositTokenProgram = TOKEN_PROGRAM_ID;

  let tradePda: PublicKey;

  beforeAll(async () => {
    payer = Keypair.generate();

    await airdrop(provider, payer.publicKey, lamps(100));

    // Create a deposit mint (legacy token program)
    depositMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    console.log(`DEPOSIT MINT: ${depositMint.toBase58()}`);

    // Create an ask mint (token2022)
    askMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`ASK MINT: ${askMint.toBase58()}`);
  });

  beforeEach(async () => {
    depositor = Keypair.generate();
    beneficiary = Keypair.generate();
    [tradePda] = getTradePda(depositor.publicKey, beneficiary.publicKey, 0);

    // Fund the accounts
    await airdrop(provider, depositor.publicKey, lamps(100));
    await airdrop(provider, beneficiary.publicKey, lamps(100));

    const depositorTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
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

    beneficiaryAskTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      beneficiary,
      askMint,
      beneficiary.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(
      `BENEFICIARY ASK TOKEN ACCOUNT: ${beneficiaryAskTokenAccount.address.toBase58()}`,
    );

    beneficiaryDepositTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      beneficiary,
      depositMint,
      beneficiary.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    console.log(
      `BENEFICIARY DEPOSIT TOKEN ACCOUNT: ${beneficiaryDepositTokenAccount.address.toBase58()}`,
    );

    // Mint tokens to the depositor deposit token account (legacy)
    await mintToChecked(
      provider.connection,
      payer,
      depositMint,
      depositorTokenAccount.address,
      payer,
      tokens(100),
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    // Mint tokens to the beneficiary ask token account (token2022)
    await mintToChecked(
      provider.connection,
      payer,
      askMint,
      beneficiaryAskTokenAccount.address,
      payer,
      tokens(100),
      TOKEN_DECIMALS,
      undefined,
      {
        commitment: "confirmed",
      },
      TOKEN_2022_PROGRAM_ID,
    );
  });

  it("should fail to fulfill a trade agreement with insufficient lamps", async () => {
    const askLamps = lamps(999);
    const depositLamps = lamps(1);
    const askTokens = tokens(1);
    const depositTokens = tokens(1);

    // We initialize a trade agreement
    const tradeInitTx = await program.methods
      .init({
        askLamps: new anchor.BN(askLamps),
        depositLamps: new anchor.BN(depositLamps),
        askTokens: new anchor.BN(askTokens),
        depositTokens: new anchor.BN(depositTokens),
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
        askMint,
        depositMint,
        tokenProgram: TOKEN_PROGRAM_ID,
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
          depositMint,
          askMint,
          askTokenProgram: TOKEN_2022_PROGRAM_ID,
          depositTokenProgram: TOKEN_PROGRAM_ID,
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
          depositMint,
          askMint,
          askTokenProgram: TOKEN_2022_PROGRAM_ID,
          depositTokenProgram: TOKEN_PROGRAM_ID,
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
    const askLamps = lamps(2);
    const depositLamps = lamps(1);
    const askTokens = tokens(10);
    const depositTokens = tokens(20);

    const [tradePda] = getTradePda(
      depositor.publicKey,
      beneficiary.publicKey,
      0,
    );

    // We initialize a trade agreement
    const initTx = await program.methods
      .init({
        askLamps: new anchor.BN(askLamps),
        depositLamps: new anchor.BN(depositLamps),
        askTokens: new anchor.BN(askTokens),
        depositTokens: new anchor.BN(depositTokens),
        id: 0,
      })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
        askMint,
        depositMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc({
        commitment: "confirmed",
      });

    console.log("Init tx: %s", initTx);

    const depositorAskTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      depositor,
      askMint,
      depositor.publicKey,
      {
        commitment: "confirmed",
      },
      askTokenProgram,
    );

    const beforeDepositorBalance = await balance(provider, depositor.publicKey);
    const beforeBeneficiaryBalance = await balance(
      provider,
      beneficiary.publicKey,
    );
    const beforeBeneficiaryDepositTokenBalance = await ataAmount(
      provider,
      beneficiaryDepositTokenAccount.address,
      depositTokenProgram,
    );
    const beforeDepositorDepositTokenBalance = await ataAmountByPk(
      provider,
      depositor.publicKey,
      depositMint,
      depositTokenProgram,
    );
    const beforeBeneficiaryAskTokenBalance = await ataAmount(
      provider,
      beneficiaryAskTokenAccount.address,
      askTokenProgram,
    );
    const beforeDepositorAskTokenBalance = await ataAmountByPk(
      provider,
      depositor.publicKey,
      askMint,
      askTokenProgram,
    );

    const tx = await program.methods
      .fulfill({ id: 0 })
      .accounts({
        depositor: depositor.publicKey,
        beneficiary: beneficiary.publicKey,
        trade: tradePda,
        depositMint,
        askMint,
        askTokenProgram: TOKEN_2022_PROGRAM_ID,
        depositTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([beneficiary])
      .rpc({
        commitment: "confirmed",
      });

    console.log("TX (fulfill): ", tx);

    const tradeAccount = await program.account.tradeAgreement.fetch(
      tradePda,
      "confirmed",
    );
    const afterDepositorBalance = await balance(provider, depositor.publicKey);
    const afterBeneficiaryBalance = await balance(
      provider,
      beneficiary.publicKey,
    );
    const afterBeneficiaryDepositTokenBalance = await ataAmountByPk(
      provider,
      beneficiary.publicKey,
      depositMint,
      depositTokenProgram,
    );
    const afterBeneficiaryAskTokenBalance = await ataAmount(
      provider,
      beneficiaryAskTokenAccount.address,
      askTokenProgram,
    );
    const afterDepositorDepositTokenBalance = await ataAmountByPk(
      provider,
      depositor.publicKey,
      depositMint,
      depositTokenProgram,
    );
    const afterDepositorAskTokenBalance = await ataAmount(
      provider,
      depositorAskTokenAccount,
      askTokenProgram,
    );

    const expectedDepositorBalance = beforeDepositorBalance + askLamps;
    const expectedBeneficiaryBalance =
      beforeBeneficiaryBalance - askLamps + depositLamps;
    const expectedDepositorAskTokenBalance =
      beforeDepositorAskTokenBalance + askTokens;
    const expectedBeneficiaryDepositTokenBalance =
      beforeBeneficiaryDepositTokenBalance + depositTokens;
    // This will stay the same because no depositor tokens are transferred on the fulfill instruction
    const expectedDepositorDepositTokenBalance =
      beforeDepositorDepositTokenBalance;
    const expectedBeneficiaryAskTokenBalance =
      beforeBeneficiaryAskTokenBalance - askTokens;

    expect(tradeAccount.status).to.deep.equal({ fulfilled: {} });
    expect(afterDepositorBalance).to.equal(expectedDepositorBalance);
    expect(afterBeneficiaryBalance).to.equal(expectedBeneficiaryBalance);
    expect(afterDepositorAskTokenBalance).to.equal(
      expectedDepositorAskTokenBalance,
    );
    expect(afterBeneficiaryDepositTokenBalance).to.equal(
      expectedBeneficiaryDepositTokenBalance,
    );
    expect(afterDepositorDepositTokenBalance).to.equal(
      expectedDepositorDepositTokenBalance,
    );
    expect(afterBeneficiaryAskTokenBalance).to.equal(
      expectedBeneficiaryAskTokenBalance,
    );
  });
});
