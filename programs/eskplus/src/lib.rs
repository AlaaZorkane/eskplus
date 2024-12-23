#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("FEqXzXzLXep5QpiwjQN6qpkzxr4TzNKUcVUEKB5n2YzK");

#[program]
pub mod eskplus {
    use super::*;

    /// Handler for initializing an escrow trade.
    pub fn init(ctx: Context<InitTradeAccounts>, input: InitTradeInput) -> Result<()> {
        _init(ctx, input)
    }

    // pub fn update(ctx: Context<UpdateTradeAccounts>) -> Result<()> {
    //     _update(ctx)
    // }

    // pub fn cancel(ctx: Context<CancelTradeAccounts>) -> Result<()> {
    //     _cancel(ctx)
    // }

    /// Handler for fulfilling an escrow trade.
    pub fn fulfill(ctx: Context<FulfillTradeAccounts>, input: FulfillTradeInput) -> Result<()> {
        _fulfill(ctx, input)
    }
}
