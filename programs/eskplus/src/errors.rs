use anchor_lang::prelude::*;

#[error_code]
pub enum TradeErrors {
    #[msg("Invalid token program id")]
    InvalidTokenProgramId,
}

#[error_code]
pub enum InitTradeErrors {
    #[msg("Not enough deposit Lamports")]
    InsufficientLamports,
    #[msg("Not enough deposit Tokens")]
    InsufficientTokens,
}

#[error_code]
pub enum FulfillTradeErrors {
    #[msg("Ask and deposit token programs do not match")]
    AskDepositTokenProgramMismatch,
    #[msg("Not enough Lamports")]
    InsufficientLamports,
    #[msg("Trade is not open")]
    TradeNotOpen,
    #[msg("Trade is already fulfilled")]
    TradeAlreadyFulfilled,
    #[msg("Trade version mismatch")]
    VersionMismatch,
}

#[error_code]
pub enum CancelTradeErrors {
    #[msg("Trade is not open")]
    TradeNotOpen,
}

#[error_code]
pub enum UpdateTradeErrors {
    #[msg("Trade is not open")]
    TradeNotOpen,
    #[msg("Trade is already fulfilled")]
    TradeAlreadyFulfilled,
}
