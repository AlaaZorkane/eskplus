use anchor_lang::{prelude::*, system_program};

use crate::{FulfillTradeErrors, TradeAgreement, TradeStatus, TRADE_SEED};

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
        FulfillTradeErrors::InsufficientFunds
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
fn transfer_deposit_lamps<'info>(
    trade_account: &Account<'info, TradeAgreement>,
    beneficiary: &Signer<'info>,
    deposit: &u64,
) -> Result<()> {
    require!(
        **trade_account.to_account_info().try_borrow_lamports()? >= *deposit,
        FulfillTradeErrors::InsufficientFunds
    );

    **trade_account.to_account_info().try_borrow_mut_lamports()? -= *deposit;
    **beneficiary.to_account_info().try_borrow_mut_lamports()? += *deposit;

    Ok(())
}

/// [ENTRYPOINT]
/// Fulfill a trade agreement, entrypoint handler of the "fulfill" instruction
pub fn _fulfill(ctx: Context<FulfillTradeAccounts>, _input: FulfillTradeInput) -> Result<()> {
    let trade = &mut ctx.accounts.trade;

    transfer_ask_lamps(
        &ctx.accounts.beneficiary,
        &ctx.accounts.depositor,
        &ctx.accounts.system_program,
        &trade.ask_lamps,
    )?;

    transfer_deposit_lamps(trade, &ctx.accounts.beneficiary, &trade.deposit_lamps)?;

    trade.status = TradeStatus::Fulfilled;
    Ok(())
}

#[derive(Accounts)]
#[instruction(input: FulfillTradeInput)]
pub struct FulfillTradeAccounts<'info> {
    #[account(mut)]
    pub depositor: SystemAccount<'info>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        seeds = [TRADE_SEED.as_bytes(), &[input.id], depositor.key().as_ref(), beneficiary.key().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, TradeAgreement>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FulfillTradeInput {
    pub id: u8,
}
