use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};

use crate::{TradeAgreement, TradeStatus, UpdateTradeErrors, TRADE_SEED};

/// Transfer or refund the deposit tokens
///
/// if the updated deposit tokens are greater than the current deposit tokens -> transfer the difference to the trade agreement account
///
/// if the updated deposit tokens are less than the current deposit tokens -> refund the difference to the depositor
fn transfer_or_refund_tokens_deposit(
    ctx: &Context<UpdateTradeAccounts>,
    updated_deposit_tokens: u64,
) -> Result<()> {
    let old_deposit_tokens = ctx.accounts.trade.deposit_tokens;

    // If the updated deposit tokens are the same as the current deposit tokens, do nothing
    if updated_deposit_tokens == old_deposit_tokens {
        return Ok(());
    }

    // If the updated deposit tokens are greater than the current deposit tokens
    if updated_deposit_tokens > old_deposit_tokens {
        // transfer the difference to the trade agreement account
        let difference = updated_deposit_tokens - old_deposit_tokens;
        let cpi_accounts = token_interface::TransferChecked {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.trade_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
            mint: ctx.accounts.deposit_mint.to_account_info(),
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.deposit_token_program.to_account_info(),
            cpi_accounts,
        );
        token_interface::transfer_checked(
            cpi_context,
            difference,
            ctx.accounts.deposit_mint.decimals,
        )?;
    } else {
        // refund the difference to the depositor
        let difference = old_deposit_tokens - updated_deposit_tokens;
        let cpi_accounts = token_interface::TransferChecked {
            from: ctx.accounts.trade_token_account.to_account_info(),
            to: ctx.accounts.depositor_token_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.deposit_mint.to_account_info(),
        };
        let depositor_key = &ctx.accounts.depositor.key();
        let beneficiary_key = &ctx.accounts.beneficiary.key();
        let trade_pda_seeds = [
            TRADE_SEED.as_bytes(),
            &[ctx.accounts.trade.id],
            depositor_key.as_ref(),
            beneficiary_key.as_ref(),
            &[ctx.accounts.trade.bump],
        ];
        let signature = &[&trade_pda_seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.deposit_token_program.to_account_info(),
            cpi_accounts,
            signature,
        );
        token_interface::transfer_checked(
            cpi_context,
            difference,
            ctx.accounts.deposit_mint.decimals,
        )?;
    }

    Ok(())
}

/// Transfer or refund the deposit lamps
///
/// if the updated deposit lamps are greater than the current deposit lamps -> transfer the difference to the trade agreement account
///
/// if the updated deposit lamps are less than the current deposit lamps -> refund the difference to the depositor
fn transfer_or_refund_lamps_deposit(
    ctx: &Context<UpdateTradeAccounts>,
    updated_deposit_lamps: u64,
) -> Result<()> {
    let old_deposit_lamps = ctx.accounts.trade.deposit_lamps;

    // If the updated deposit lamps are the same as the current deposit lamps, do nothing
    if updated_deposit_lamps == old_deposit_lamps {
        return Ok(());
    }

    // If the updated deposit lamps are greater than the current deposit lamps
    if updated_deposit_lamps > old_deposit_lamps {
        // transfer the difference to the trade agreement account
        let difference = updated_deposit_lamps - old_deposit_lamps;
        ctx.accounts.trade.sub_lamports(difference)?;
        ctx.accounts.depositor.add_lamports(difference)?;
    } else {
        // refund the difference to the depositor
        let difference = old_deposit_lamps - updated_deposit_lamps;
        ctx.accounts.depositor.sub_lamports(difference)?;
        ctx.accounts.trade.add_lamports(difference)?;
    }

    Ok(())
}

pub fn _update(ctx: Context<UpdateTradeAccounts>, input: UpdateTradeInput) -> Result<()> {
    let old_deposit_tokens = ctx.accounts.trade.deposit_tokens;
    let old_deposit_lamps = ctx.accounts.trade.deposit_lamps;
    let updated_deposit_tokens = input.updated_deposit_tokens;
    let updated_deposit_lamps = input.updated_deposit_lamps;

    if updated_deposit_tokens != old_deposit_tokens {
        transfer_or_refund_tokens_deposit(&ctx, updated_deposit_tokens)?;
    }

    if updated_deposit_lamps != old_deposit_lamps {
        transfer_or_refund_lamps_deposit(&ctx, updated_deposit_lamps)?;
    }

    // Update the trade agreement account
    let trade = &mut ctx.accounts.trade;
    trade.deposit_lamps = input.updated_deposit_lamps;
    trade.deposit_tokens = input.updated_deposit_tokens;
    trade.ask_lamps = input.updated_ask_lamps;
    trade.ask_tokens = input.updated_ask_tokens;
    trade.version = trade.version.wrapping_add(1);

    Ok(())
}

#[derive(Accounts)]
#[instruction(input: UpdateTradeInput)]
pub struct UpdateTradeAccounts<'info> {
    #[account(
        mut,
        seeds = [TRADE_SEED.as_bytes(), &[input.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        bump,
        constraint = trade.status == TradeStatus::Open @ UpdateTradeErrors::TradeNotOpen,
        constraint = trade.status != TradeStatus::Fulfilled @ UpdateTradeErrors::TradeAlreadyFulfilled,
    )]
    pub trade: Account<'info, TradeAgreement>,
    pub depositor: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = depositor,
        associated_token::token_program = deposit_token_program
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = trade,
        associated_token::token_program = deposit_token_program
    )]
    pub trade_token_account: InterfaceAccount<'info, TokenAccount>,
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    pub beneficiary: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
    pub deposit_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateTradeInput {
    pub id: u8,
    pub updated_deposit_lamps: u64,
    pub updated_deposit_tokens: u64,
    pub updated_ask_lamps: u64,
    pub updated_ask_tokens: u64,
}
