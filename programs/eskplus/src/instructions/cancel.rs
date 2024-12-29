use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};

use crate::{CancelTradeErrors, TradeAgreement, TradeStatus, TRADE_SEED};

fn refund_tokens_deposit(ctx: &Context<CancelTradeAccounts>) -> Result<()> {
    let deposit = ctx.accounts.trade.deposit_tokens;
    let deposit_mint = &ctx.accounts.deposit_mint;
    let depositor_key = ctx.accounts.depositor.to_account_info().key();
    let beneficiary_key = ctx.accounts.beneficiary.to_account_info().key();
    let trade_pda_seeds = &[
        TRADE_SEED.as_bytes(),
        &[ctx.accounts.trade.id],
        depositor_key.as_ref(),
        beneficiary_key.as_ref(),
        &[ctx.accounts.trade.bump],
    ];
    let trade_pda_signature = &[&trade_pda_seeds[..]];

    let cpi_accounts = token_interface::TransferChecked {
        from: ctx.accounts.trade_token_account.to_account_info(),
        to: ctx.accounts.depositor_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
        mint: ctx.accounts.deposit_mint.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.deposit_token_program.to_account_info(),
        cpi_accounts,
        trade_pda_signature,
    );
    token_interface::transfer_checked(cpi_context, deposit, deposit_mint.decimals)?;

    Ok(())
}

fn refund_lamps_deposit(ctx: &Context<CancelTradeAccounts>) -> Result<()> {
    let deposit_lamps = ctx.accounts.trade.deposit_lamps;

    ctx.accounts.depositor.add_lamports(deposit_lamps)?;
    ctx.accounts.trade.sub_lamports(deposit_lamps)?;

    Ok(())
}

/// Cancel an open trade agreement.
pub fn _cancel(ctx: Context<CancelTradeAccounts>) -> Result<()> {
    // Refund the deposit tokens (from trade ATA to depositor ATA)
    refund_tokens_deposit(&ctx)?;
    // Refund the lamps (from trade acc to depositor acc)
    refund_lamps_deposit(&ctx)?;

    let trade = &mut ctx.accounts.trade;
    trade.status = TradeStatus::Cancelled;

    Ok(())
}

#[derive(Accounts)]
pub struct CancelTradeAccounts<'info> {
    #[account(
        mut,
        seeds = [TRADE_SEED.as_bytes(), &[trade.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        constraint = trade.status == TradeStatus::Open @ CancelTradeErrors::TradeNotOpen,
        bump
    )]
    pub trade: Account<'info, TradeAgreement>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub beneficiary: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = depositor,
        associated_token::token_program = deposit_token_program
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    pub trade_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub deposit_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
