use anchor_lang::{prelude::*, system_program};

use crate::{FulfillTradeErrors, TradeAgreement, TradeStatus, TRADE_SEED};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

/// Transfer ask from beneficiary to depositor
fn transfer_ask_lamps<'info>(
    beneficiary: &Signer<'info>,
    depositor: &SystemAccount<'info>,
    system_program: &Program<'info, System>,
    ask: &u64,
) -> Result<()> {
    let beneficiary_lamports = beneficiary.to_account_info().lamports();

    require!(
        beneficiary_lamports >= *ask,
        FulfillTradeErrors::InsufficientLamports
    );

    let instruction = system_program::Transfer {
        from: beneficiary.to_account_info(),
        to: depositor.to_account_info(),
    };

    let cpi_context = CpiContext::new(system_program.to_account_info(), instruction);
    system_program::transfer(cpi_context, *ask)?;

    Ok(())
}

/// Transfer deposit from trade agreement account to beneficiary
fn transfer_lamps_trade_to_beneficiary<'info>(
    trade_account: &Account<'info, TradeAgreement>,
    beneficiary: &Signer<'info>,
    deposit: &u64,
) -> Result<()> {
    require!(
        **trade_account.to_account_info().try_borrow_lamports()? >= *deposit,
        FulfillTradeErrors::InsufficientLamports
    );

    **trade_account.to_account_info().try_borrow_mut_lamports()? -= *deposit;
    **beneficiary.to_account_info().try_borrow_mut_lamports()? += *deposit;

    Ok(())
}

fn transfer_fulfill_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    amount: &u64,
) -> Result<()> {
    let cpi_accounts = token_interface::TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: from.to_account_info(),
        mint: mint.to_account_info(),
    };

    let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_context, *amount, mint.decimals)?;

    Ok(())
}

/// [ENTRYPOINT]
/// Fulfill a trade agreement, entrypoint handler of the "fulfill" instruction
pub fn _fulfill(ctx: Context<FulfillTradeAccounts>, _input: FulfillTradeInput) -> Result<()> {
    let trade = &mut ctx.accounts.trade;

    // Transfer ask lamports from beneficiary to depositor
    transfer_ask_lamps(
        &ctx.accounts.beneficiary,
        &ctx.accounts.depositor,
        &ctx.accounts.system_program,
        &trade.ask_lamps,
    )?;

    // Transfer ask tokens from beneficiary to depositor
    transfer_fulfill_tokens(
        &ctx.accounts.beneficiary_token_account,
        &ctx.accounts.depositor_token_account,
        &ctx.accounts.token_program,
        &ctx.accounts.ask_mint,
        &trade.ask_tokens,
    )?;

    // Transfer deposit lamports from trade agreement account to beneficiary
    transfer_lamps_trade_to_beneficiary(trade, &ctx.accounts.beneficiary, &trade.deposit_lamps)?;

    // Transfer deposit tokens from trade agreement account to beneficiary
    transfer_fulfill_tokens(
        &ctx.accounts.trade_token_account,
        &ctx.accounts.beneficiary_token_account,
        &ctx.accounts.token_program,
        &ctx.accounts.deposit_mint,
        &trade.deposit_tokens,
    )?;

    trade.status = TradeStatus::Fulfilled;
    Ok(())
}

#[derive(Accounts)]
#[instruction(input: FulfillTradeInput)]
pub struct FulfillTradeAccounts<'info> {
    #[account(mut)]
    pub depositor: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = depositor
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = ask_mint,
        associated_token::authority = beneficiary
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,
    pub ask_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [TRADE_SEED.as_bytes(), &[input.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, TradeAgreement>,
    #[account(
        mut,
        associated_token::mint = ask_mint,
        associated_token::authority = trade
    )]
    pub trade_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FulfillTradeInput {
    pub id: u8,
}
