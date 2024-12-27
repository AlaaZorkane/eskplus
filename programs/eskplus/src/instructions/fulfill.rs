use anchor_lang::{prelude::*, system_program};

use crate::{FulfillTradeErrors, TradeAgreement, TradeStatus, TRADE_SEED};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};

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
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    amount: &u64,
    signature: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let cpi_accounts = token_interface::TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
        mint: mint.to_account_info(),
    };

    let cpi_context = match signature {
        Some(signature) => {
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signature)
        }
        None => CpiContext::new(token_program.to_account_info(), cpi_accounts),
    };
    token_interface::transfer_checked(cpi_context, *amount, mint.decimals)?;

    Ok(())
}

/// [ENTRYPOINT]
/// Fulfill a trade agreement, entrypoint handler of the "fulfill" instruction
pub fn _fulfill(ctx: Context<FulfillTradeAccounts>, _input: FulfillTradeInput) -> Result<()> {
    let trade = &mut ctx.accounts.trade;
    let trade_account = trade.to_account_info();
    let depositor_key = ctx.accounts.depositor.key();
    let beneficiary_key = ctx.accounts.beneficiary.key();

    let trade_pda_seeds = &[
        TRADE_SEED.as_bytes(),
        &[trade.id],
        depositor_key.as_ref(),
        beneficiary_key.as_ref(),
        &[trade.bump],
    ];

    let trade_account_signature = &[&trade_pda_seeds[..]];

    // Transfer ask lamports from beneficiary to depositor
    transfer_ask_lamps(
        &ctx.accounts.beneficiary,
        &ctx.accounts.depositor,
        &ctx.accounts.system_program,
        &trade.ask_lamps,
    )?;

    // Transfer ask tokens from beneficiary to depositor
    transfer_fulfill_tokens(
        &ctx.accounts.beneficiary_ask_token_account,
        &ctx.accounts.depositor_ask_token_account,
        &ctx.accounts.beneficiary,
        &ctx.accounts.ask_token_program,
        &ctx.accounts.ask_mint,
        &trade.ask_tokens,
        None,
    )?;

    // Transfer deposit lamports from trade agreement account to beneficiary
    transfer_lamps_trade_to_beneficiary(trade, &ctx.accounts.beneficiary, &trade.deposit_lamps)?;

    // Transfer deposit tokens from trade agreement account to beneficiary
    transfer_fulfill_tokens(
        &ctx.accounts.trade_token_account,
        &ctx.accounts.beneficiary_deposit_token_account,
        &trade_account,
        &ctx.accounts.deposit_token_program,
        &ctx.accounts.deposit_mint,
        &trade.deposit_tokens,
        Some(trade_account_signature),
    )?;

    trade.status = TradeStatus::Fulfilled;
    Ok(())
}

#[derive(Accounts)]
#[instruction(input: FulfillTradeInput)]
pub struct FulfillTradeAccounts<'info> {
    #[account(mut)]
    pub depositor: SystemAccount<'info>,
    /// Account that the beneficiary will transfer the ask tokens to.
    #[account(
        init_if_needed,
        payer = beneficiary,
        associated_token::mint = ask_mint,
        associated_token::authority = depositor,
        associated_token::token_program = ask_token_program
    )]
    pub depositor_ask_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mint::token_program = deposit_token_program
    )]
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    /// We need two accounts here for the beneficiary in case the ask and deposit tokens are from different programs.
    /// If they are from the same program, then we can use the same account for both.
    #[account(
        mut,
        associated_token::mint = ask_mint,
        associated_token::authority = beneficiary,
        associated_token::token_program = ask_token_program
    )]
    pub beneficiary_ask_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = beneficiary,
        associated_token::token_program = deposit_token_program
    )]
    pub beneficiary_deposit_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mint::token_program = ask_token_program
    )]
    pub ask_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [TRADE_SEED.as_bytes(), &[input.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, TradeAgreement>,
    /// PDA that holds the deposit tokens from the depositor.
    #[account(
        mut,
        associated_token::mint = deposit_mint,
        associated_token::authority = trade,
        associated_token::token_program = deposit_token_program
    )]
    pub trade_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(
        constraint = deposit_token_program.key() == trade.deposit_token_program.get_program_id() @ FulfillTradeErrors::AskDepositTokenProgramMismatch
    )]
    pub deposit_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = ask_token_program.key() == trade.ask_token_program.get_program_id() @ FulfillTradeErrors::AskDepositTokenProgramMismatch
    )]
    pub ask_token_program: Interface<'info, TokenInterface>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FulfillTradeInput {
    pub id: u8,
}
