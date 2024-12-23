use crate::{InitTradeErrors, TradeAgreement, TradeStatus, DISCRIMINATOR, TRADE_SEED};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

/// Transfer deposit from depositor to trade agreement
fn transfer_lamps_deposit<'info>(
    from: &Signer<'info>,
    to: &Account<'info, TradeAgreement>,
    system_program: &Program<'info, System>,
    deposit: &u64,
) -> Result<()> {
    let depositor_lamports = from.to_account_info().lamports();

    require!(
        depositor_lamports >= *deposit,
        InitTradeErrors::InsufficientFunds
    );

    let cpi_accounts = system_program::Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
    };

    let cpi_context = CpiContext::new(system_program.to_account_info(), cpi_accounts);
    system_program::transfer(cpi_context, *deposit)?;

    Ok(())
}

pub fn transfer_tokens_deposit<'info>(
    from: &Signer<'info>,
    to: &Account<'info, TradeAgreement>,
    token_program: &Interface<'info, TokenInterface>,
    deposit_mint: &InterfaceAccount<'info, Mint>,
    deposit: &u64,
) -> Result<()> {
    let cpi_accounts = token_interface::TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: from.to_account_info(),
        mint: deposit_mint.to_account_info(),
    };

    let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_context, *deposit, deposit_mint.decimals)?;

    Ok(())
}

/// [ENTRYPOINT]
/// Initialize a new trade agreement, entrypoint handler of the "init" instruction
pub fn _init(ctx: Context<InitTradeAccounts>, input: InitTradeInput) -> Result<()> {
    // Transfer the deposit lamports from the depositor to the trade agreement account
    transfer_lamps_deposit(
        &ctx.accounts.depositor,
        &ctx.accounts.trade,
        &ctx.accounts.system_program,
        &input.deposit_lamps,
    )?;

    // Transfer the deposit tokens from the depositor to the trade agreement account
    transfer_tokens_deposit(
        &ctx.accounts.depositor,
        &ctx.accounts.trade,
        &ctx.accounts.token_program,
        &ctx.accounts.deposit_mint,
        &input.deposit_tokens,
    )?;

    let trade = &mut ctx.accounts.trade;

    // We then set the trade agreement account metadata
    trade.id = input.id;
    trade.depositor = ctx.accounts.depositor.key();
    trade.beneficiary = ctx.accounts.beneficiary.key();
    trade.deposit_lamps = input.deposit_lamps;
    trade.deposit_tokens = input.deposit_tokens;
    trade.deposit_mint = ctx.accounts.deposit_mint.key();
    trade.ask_lamps = input.ask_lamps;
    trade.ask_tokens = input.ask_tokens;
    trade.ask_mint = ctx.accounts.ask_mint.key();
    trade.status = TradeStatus::Open;
    trade.bump = ctx.bumps.trade;

    Ok(())
}

#[derive(Accounts)]
#[instruction(input: InitTradeInput)]
pub struct InitTradeAccounts<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = depositor
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub beneficiary: SystemAccount<'info>,
    #[account(
        associated_token::mint = ask_mint,
        associated_token::authority = beneficiary
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,
    pub ask_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = depositor,
        space = DISCRIMINATOR + TradeAgreement::LEN,
        seeds = [TRADE_SEED.as_bytes(), &[input.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        bump
    )]
    pub trade: Account<'info, TradeAgreement>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitTradeInput {
    pub id: u8,
    pub deposit_lamps: u64,
    pub deposit_tokens: u64,
    pub ask_lamps: u64,
    pub ask_tokens: u64,
}
