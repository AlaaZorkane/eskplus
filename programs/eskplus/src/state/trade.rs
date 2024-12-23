use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone, Copy)]
pub enum TradeStatus {
    Open,
    Fulfilled,
    Cancelled,
}

/// Trade agreement state
#[account]
pub struct TradeAgreement {
    /// (1) The trade id
    pub id: u8,
    /// (8) The initially deposited assets by the principal party.
    pub deposit_lamps: u64,
    /// (8) The deposit tokens
    pub deposit_tokens: u64,
    /// (32) The deposit mint
    pub deposit_mint: Pubkey,
    /// (8) The depositor ask for the fulfillment of the trade.
    pub ask_lamps: u64,
    /// (8) The ask tokens
    pub ask_tokens: u64,
    /// (32) The ask mint
    pub ask_mint: Pubkey,
    /// (32) The depositor public key
    pub depositor: Pubkey,
    /// (32) The beneficiary public key
    pub beneficiary: Pubkey,
    /// (3) The state of the trade
    pub status: TradeStatus,
    /// (1) The bump of the trade agreement account
    pub bump: u8,
}

impl TradeAgreement {
    pub const TRADE_ID_LENGTH: usize = 32;
    pub const LEN: usize = 1 + 8 + 8 + 32 + 8 + 8 + 32 + 32 + 32 + 3 + 1;
}
