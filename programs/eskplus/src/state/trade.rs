use anchor_lang::prelude::*;
use anchor_spl::token::ID;
use anchor_spl::token_2022::ID as TOKEN_2022_ID;

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone, Copy)]
pub enum TradeStatus {
    Open,
    Fulfilled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone, Copy)]
pub enum TradeTokenProgramVersion {
    LegacyToken,
    Token2022,
}

impl TradeTokenProgramVersion {
    pub const FROM_ID: fn(&Pubkey) -> Self = |id| match *id {
        ID => TradeTokenProgramVersion::LegacyToken,
        TOKEN_2022_ID => TradeTokenProgramVersion::Token2022,
        _ => panic!("Invalid token program id"),
    };

    pub fn get_program_id(&self) -> Pubkey {
        match self {
            TradeTokenProgramVersion::LegacyToken => ID,
            TradeTokenProgramVersion::Token2022 => TOKEN_2022_ID,
        }
    }
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
    /// (1) The deposit mint version (either legacy token or token 2022)
    pub deposit_token_program: TradeTokenProgramVersion,
    /// (8) The depositor ask for the fulfillment of the trade.
    pub ask_lamps: u64,
    /// (8) The ask tokens
    pub ask_tokens: u64,
    /// (32) The ask mint
    pub ask_mint: Pubkey,
    /// (1) The ask mint program version (either legacy token or token 2022)
    pub ask_token_program: TradeTokenProgramVersion,
    /// (32) The depositor public key
    pub depositor: Pubkey,
    /// (32) The beneficiary public key
    pub beneficiary: Pubkey,
    /// (3) The state of the trade
    pub status: TradeStatus,
    /// (1) The bump of the trade agreement account
    pub bump: u8,
    /// (1) The version of the trade agreement (used to prevent frontrunning)
    pub version: u8,
}

impl TradeAgreement {
    pub const TRADE_ID_LENGTH: usize = 32;
    pub const LEN: usize = 1 + 8 + 8 + 32 + 1 + 8 + 8 + 32 + 1 + 32 + 32 + 32 + 32 + 32 + 3 + 1;
}
