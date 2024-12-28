import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { Eskplus } from "../target/types/eskplus.ts";
import { TRADE_SEED } from "./constants.ts";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

export const program = anchor.workspace.Eskplus as Program<Eskplus>;

export const getTradePdaId = (id: number) => {
  return Buffer.from([id]);
};

export const getTradePda = (
  depositor: PublicKey,
  beneficiary: PublicKey,
  id: number,
) => {
  return PublicKey.findProgramAddressSync(
    [
      TRADE_SEED,
      getTradePdaId(id),
      depositor.toBuffer(),
      beneficiary.toBuffer(),
    ],
    program.programId,
  );
};

export const airdrop = async (
  provider: AnchorProvider,
  pk: PublicKey,
  lamports: number,
) => {
  const airdropTx = await provider.connection.requestAirdrop(
    new PublicKey(pk),
    lamports,
  );
  const latestBlockHash = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction(
    {
      signature: airdropTx,
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    },
    "confirmed",
  );
};

export const balance = (provider: AnchorProvider, pk: PublicKey) => {
  return provider.connection.getBalance(pk, "confirmed");
};

export const ataAmountByPk = async (
  provider: AnchorProvider,
  pk: PublicKey,
  mint: PublicKey,
  programId: PublicKey,
) => {
  try {
    const ata = getAssociatedTokenAddressSync(mint, pk, true, programId);
    const data = await getAccount(provider.connection, ata, "confirmed");
    return Number(data.amount);
  } catch {
    return 0;
  }
};

export const ataAmount = async (
  provider: AnchorProvider,
  ata: PublicKey,
  programId: PublicKey,
) => {
  try {
    const data = await getAccount(
      provider.connection,
      ata,
      "confirmed",
      programId,
    );
    // may overflow
    return Number(data.amount);
  } catch {
    return 0;
  }
};

export const lamps = (sol: number) => {
  return sol * anchor.web3.LAMPORTS_PER_SOL;
};

export const tokens = (amount: number, decimals = 9) => {
  return amount * 10 ** decimals;
};

export const tokensWhole = (amount: number, decimals = 9) => {
  return amount / 10 ** decimals;
};

export type EsksplusError = Eskplus["errors"][number];
