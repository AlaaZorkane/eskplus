use anchor_lang::prelude::*;

#[error_code]
pub enum InitTradeErrors {
    #[msg("Not enough Funds")]
    InsufficientFunds,
}

#[error_code]
pub enum FulfillTradeErrors {
    #[msg("Not enough Funds")]
    InsufficientFunds,
}
