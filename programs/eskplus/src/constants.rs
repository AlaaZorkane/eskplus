use anchor_lang::prelude::*; // Import necessary modules and items

pub const DISCRIMINATOR: usize = 8;

// Define a constant seed for bank account derivation
#[constant]
pub const TRADE_SEED: &str = "trade";
