use anchor_lang::prelude::*;

#[error_code]
pub enum InitTradeErrors {
    #[msg("Not enough deposit Lamports")]
    InsufficientLamports,
    #[msg("Not enough deposit Tokens")]
    InsufficientTokens,
}

#[error_code]
pub enum FulfillTradeErrors {
    #[msg("Not enough Lamports")]
    InsufficientLamports,
}
