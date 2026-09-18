/**
 * Lending Management System
 * Google Sheets + Apps Script framework for borrowers, loans, payments, capital, and expenses.
 * Supports five interest computation methods: simple, compound, diminishing, flat, add_on.
 *
 * jmsasolutions — https://github.com/jmsasolutions/lending-management-system
 */

const CONFIG = {
  BORROWERS_SHEET: 'Borrowers',
  LOANS_SHEET: 'Loans',
  PAYMENTS_SHEET: 'Payments',
  INVESTORS_SHEET: 'Investors',
  CAPITAL_SHEET: 'Capital',
  EXPENSES_SHEET: 'Expenses',
  DEFAULT_INTEREST_METHOD: 'diminishing', // simple | compound | diminishing | flat | add_on
  CURRENCY_SYMBOL: '₱' // Philippine Peso
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lending Tools')
    .addItem('Initialize Sheet', 'initializeSheet')
    .addItem('Recalculate Selected Loan', 'recalculateSelectedLoan')
    .addItem('Refresh Investor Capital Summary', 'refreshCapitalSummary')
    .addToUi();
}

function initializeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetWithHeaders_(ss, CONFIG.BORROWERS_SHEET, ['Borrower ID', 'Name', 'Contact', 'Address', 'Notes']);
  ensureSheetWithHeaders_(ss, CONFIG.LOANS_SHEET,
    ['Loan ID', 'Borrower ID', 'Principal', 'Interest Rate %', 'Term (months)', 'Interest Method', 'Disbursed Date', 'Total Payable', 'Balance', 'Status']);
  ensureSheetWithHeaders_(ss, CONFIG.PAYMENTS_SHEET, ['Payment ID', 'Loan ID', 'Date', 'Amount', 'Balance After']);
  ensureSheetWithHeaders_(ss, CONFIG.INVESTORS_SHEET, ['Investor ID', 'Name', 'Contact']);
  ensureSheetWithHeaders_(ss, CONFIG.CAPITAL_SHEET, ['Investor ID', 'Date', 'Amount', 'Type']); // Type: Contribution | Withdrawal | Payout
  ensureSheetWithHeaders_(ss, CONFIG.EXPENSES_SHEET, ['Date', 'Category', 'Amount', 'Notes']);
  SpreadsheetApp.getUi().alert('Lending Management System initialized.');
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

/**
 * Computes total payable for a loan given principal, annual rate %, term in months, and method.
 * @return {number} total payable (principal + interest) for the full term.
 */
function computeTotalPayable(principal, ratePercent, termMonths, method) {
  const r = ratePercent / 100;

  switch (method) {
    case 'simple':
      // Simple interest over the term, annualized rate applied to the term fraction of a year.
      return principal + (principal * r * (termMonths / 12));

    case 'compound': {
      // Monthly compounding of the annual rate.
      const monthlyRate = r / 12;
      return principal * Math.pow(1 + monthlyRate, termMonths);
    }

    case 'diminishing': {
      // Interest computed on the reducing balance each month; total payable = sum of monthly interest + principal.
      const monthlyRate = r / 12;
      const monthlyPrincipal = principal / termMonths;
      let balance = principal;
      let totalInterest = 0;
      for (let m = 0; m < termMonths; m++) {
        totalInterest += balance * monthlyRate;
        balance -= monthlyPrincipal;
      }
      return principal + totalInterest;
    }

    case 'flat':
      // Flat rate: interest computed once on the original principal for the full term, regardless of balance.
      return principal + (principal * r * (termMonths / 12));

    case 'add_on':
      // Add-on: interest for the full term is added to principal up front, then divided into equal installments.
      return principal + (principal * r * (termMonths / 12));

    default:
      throw new Error('Unknown interest method: ' + method);
  }
}

/** Recalculates Total Payable and Balance for the currently selected Loans row. */
function recalculateSelectedLoan() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.LOANS_SHEET);
  const row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Select a loan row first.');
    return;
  }

  const values = sheet.getRange(row, 1, 1, 10).getValues()[0];
  const principal = Number(values[2]);
  const rate = Number(values[3]);
  const term = Number(values[4]);
  const method = String(values[5] || CONFIG.DEFAULT_INTEREST_METHOD);

  const totalPayable = Math.round(computeTotalPayable(principal, rate, term, method) * 100) / 100;

  sheet.getRange(row, 8).setValue(totalPayable); // Total Payable
  sheet.getRange(row, 9).setValue(totalPayable); // Balance starts equal to Total Payable
  sheet.getRange(row, 10).setValue('Active'); // Status
}

/** Rolls up each investor's net capital position (contributions - withdrawals + payouts). */
function refreshCapitalSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const capitalSheet = ss.getSheetByName(CONFIG.CAPITAL_SHEET);
  const data = capitalSheet.getDataRange().getValues();

  const totals = {}; // investorId -> net amount

  for (let i = 1; i < data.length; i++) {
    const [investorId, , amount, type] = data[i];
    if (!investorId) continue;
    const signedAmount = (type === 'Withdrawal') ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
    totals[investorId] = (totals[investorId] || 0) + signedAmount;
  }

  let summarySheet = ss.getSheetByName('Capital_Summary');
  if (!summarySheet) summarySheet = ss.insertSheet('Capital_Summary');
  summarySheet.clear();
  summarySheet.getRange(1, 1, 1, 2).setValues([['Investor ID', 'Net Capital']]).setFontWeight('bold');
  const rows = Object.keys(totals).map(function (id) { return [id, totals[id]]; });
  if (rows.length) summarySheet.getRange(2, 1, rows.length, 2).setValues(rows);
}
